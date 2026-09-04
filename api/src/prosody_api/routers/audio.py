import asyncio
import base64
from dataclasses import dataclass

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..schemas import Prosody, ProsodyRequest
from ..services.asr_service import provider_from_settings
from ..services.audio_ingress import AudioBuffer
from ..services.condition_service import CallableLLM
from ..services.controller_service import build_requests
from ..services.latency import JsonlLatencySink, TurnTrace
from ..services.llm_service import stream_llm
from ..services.prosody_service import predict

router = APIRouter()


@dataclass
class ActiveTurn:
    turn_id: str
    audio: AudioBuffer
    trace: TurnTrace
    next_sequence: int = 0


def _history_prompt(history: list[dict[str, str]], current: str) -> str:
    if not history:
        return current
    lines = ["Conversation history:"]
    for message in history:
        lines.append(f"{message['role']}: {message['content']}")
    lines.extend(("Current user turn:", current))
    return "\n".join(lines)


def _profile_record(trace: TurnTrace, dependencies, outcome: str) -> dict:
    asr_provider = (
        "injected"
        if dependencies.asr is not None
        else "elevenlabs" if dependencies.settings.elevenlabs_api_key else "mock"
    )
    llm_provider = (
        "injected"
        if dependencies.llm is not None
        else "groq" if dependencies.settings.groq_api_key else "mock"
    )
    branch_timings = {}
    for branch in ("baseline", "prosodic"):
        branch_timings[branch] = {
            "ttft_ms": trace.ms(f"{branch}_request", f"{branch}_first_delta"),
            "total_ms": trace.ms(f"{branch}_request", f"{branch}_done"),
        }
    return {
        "schema_version": 1,
        "kind": "turn",
        "session_id": trace.session_id,
        "turn_id": trace.turn_id,
        "scenario": trace.scenario,
        "outcome": outcome,
        "cold": trace.cold,
        "providers": {
            "asr": asr_provider,
            "asr_model": dependencies.settings.asr_model,
            "llm": llm_provider,
            "llm_model": dependencies.settings.groq_model,
            "reasoning_effort": dependencies.settings.groq_reasoning_effort,
        },
        "durations_ms": {
            "client_flush_to_dispatch": trace.ms("last_audio", "mic_released"),
            "asr_commit": trace.ms("mic_released", "asr_final"),
            "prosody_finalize": trace.ms("prosody_start", "prosody_end"),
            "join": trace.ms("mic_released", "join_ready"),
            "release_to_first_text": trace.ms("mic_released", "first_response_sent"),
            "release_to_done": trace.ms("mic_released", "turn_done"),
        },
        "branches": branch_timings,
        "events_ms": trace.offsets_ms(),
    }


@router.websocket("/ws")
async def ws_audio(ws: WebSocket):
    await ws.accept()
    dependencies = ws.app.state.dependencies
    settings = dependencies.settings
    session_id = dependencies.request_id_provider()
    scenario: str | None = None
    active: ActiveTurn | None = None
    used_turn_ids: set[str] = set()
    send_lock = asyncio.Lock()
    histories: dict[str, list[dict[str, str]]] = {
        "baseline": [],
        "prosodic": [],
    }
    sink = dependencies.latency_sink or JsonlLatencySink(
        settings.latency_profile_path
    )

    async def send(event: dict) -> None:
        async with send_lock:
            await ws.send_json(event)

    async def send_error(
        code: str,
        message: str,
        *,
        turn_id: str | None = None,
        stage: str = "session",
        branch: str | None = None,
        retryable: bool = False,
    ) -> None:
        event = {
            "type": "error",
            "code": code,
            "message": message,
            "stage": stage,
            "retryable": retryable,
        }
        if turn_id:
            event["turnId"] = turn_id
        if branch:
            event["branch"] = branch
        await send(event)

    async def on_partial(text: str) -> None:
        if active is None:
            return
        active.trace.mark("asr_first_partial")
        await send({"type": "asr.partial", "turnId": active.turn_id, "text": text})

    asr_provider = dependencies.asr or provider_from_settings(settings)
    asr_session = None

    async def reset_asr() -> None:
        nonlocal asr_session
        if asr_session is not None:
            await asr_session.close()
        asr_session = await asr_provider.open(on_partial)

    async def predict_prosody(turn: ActiveTurn) -> Prosody:
        turn.trace.mark("prosody_start")
        audio_b64 = base64.b64encode(turn.audio.concat()).decode("ascii")
        request = ProsodyRequest(audio_b64=audio_b64)
        predictor = dependencies.prosody_predictor
        if predictor:
            result = await asyncio.to_thread(predictor.predict, request)
        else:
            result = await asyncio.to_thread(predict, audio_b64=audio_b64)
        turn.trace.mark("prosody_end")
        return result

    async def run_branch(
        branch: str,
        prompt: str,
        transcript: str,
        turn: ActiveTurn,
    ) -> str | None:
        llm = dependencies.llm or CallableLLM(stream_llm)
        turn.trace.mark(f"{branch}_request")
        parts: list[str] = []
        try:
            async for delta in llm.stream(_history_prompt(histories[branch], prompt)):
                if not parts:
                    turn.trace.mark(f"{branch}_first_delta")
                    turn.trace.mark("first_response_sent")
                parts.append(delta)
                await send(
                    {
                        "type": "response.delta",
                        "turnId": turn.turn_id,
                        "branch": branch,
                        "text": delta,
                    }
                )
            if not parts:
                raise RuntimeError("Groq returned no response text")
            turn.trace.mark(f"{branch}_done")
            await send(
                {"type": "response.done", "turnId": turn.turn_id, "branch": branch}
            )
            response = "".join(parts).strip()
            histories[branch].extend(
                (
                    {"role": "user", "content": transcript},
                    {"role": "assistant", "content": response},
                )
            )
            return response
        except asyncio.CancelledError:
            raise
        except Exception as error:
            turn.trace.mark(f"{branch}_done")
            await send_error(
                "policy_failed",
                str(error),
                turn_id=turn.turn_id,
                stage="llm",
                branch=branch,
                retryable=True,
            )
            return None

    async def finish_turn(turn: ActiveTurn) -> None:
        nonlocal active, asr_session
        if turn.audio.total_bytes == 0:
            turn.trace.mark("mic_released")
            await send_error(
                "empty_audio",
                "utterance contained no audio",
                turn_id=turn.turn_id,
                stage="ingress",
            )
            turn.trace.mark("turn_done")
            record = _profile_record(turn.trace, dependencies, "empty_audio")
            await send(
                {"type": "turn.profile", "turnId": turn.turn_id, "profile": record}
            )
            await asyncio.to_thread(sink.append, record)
            active = None
            return

        turn.trace.mark("mic_released")
        prosody_task = asyncio.create_task(predict_prosody(turn))
        asr_task = asyncio.create_task(asr_session.commit())
        try:
            transcript = (await asr_task).strip()
            turn.trace.mark("asr_final")
            if not transcript:
                raise ValueError("ASR returned an empty transcript")
        except Exception as error:
            prosody_task.cancel()
            await asyncio.gather(prosody_task, return_exceptions=True)
            await send_error(
                "asr_failed",
                str(error),
                turn_id=turn.turn_id,
                stage="asr",
                retryable=True,
            )
            turn.trace.mark("turn_done")
            record = _profile_record(turn.trace, dependencies, "asr_failed")
            await send(
                {"type": "turn.profile", "turnId": turn.turn_id, "profile": record}
            )
            await asyncio.to_thread(sink.append, record)
            try:
                await reset_asr()
            except Exception:
                asr_session = None
            active = None
            return

        prosody: Prosody | None = None
        try:
            prosody = await asyncio.wait_for(
                prosody_task,
                timeout=settings.prosody_timeout_seconds,
            )
            await send(
                {
                    "type": "prosody.update",
                    "turnId": turn.turn_id,
                    "prosody": prosody.model_dump(),
                }
            )
        except Exception as error:
            await send_error(
                "prosody_failed",
                str(error),
                turn_id=turn.turn_id,
                stage="prosody",
                branch="prosodic",
                retryable=True,
            )

        turn.trace.mark("join_ready")
        final_event = {"type": "asr.final", "turnId": turn.turn_id, "text": transcript}
        if prosody is not None:
            final_event["prosody"] = prosody.model_dump()
        await send(final_event)

        baseline_prompt, prosodic_prompt = build_requests(transcript, prosody)
        tasks = [
            asyncio.create_task(
                run_branch("baseline", baseline_prompt, transcript, turn)
            )
        ]
        if prosody is not None:
            tasks.append(
                asyncio.create_task(
                    run_branch("prosodic", prosodic_prompt, transcript, turn)
                )
            )
        results = await asyncio.gather(*tasks)
        turn.trace.mark("turn_done")
        outcome = (
            "ok"
            if prosody is not None and all(result is not None for result in results)
            else "partial"
        )
        record = _profile_record(turn.trace, dependencies, outcome)
        await send({"type": "turn.profile", "turnId": turn.turn_id, "profile": record})
        await asyncio.to_thread(sink.append, record)
        active = None

    try:
        while True:
            event = await ws.receive_json()
            event_type = event.get("type")
            if event_type == "session.init":
                if active is not None:
                    await send_error("turn_active", "cannot reinitialize during a turn")
                    continue
                if event.get("protocolVersion") != 1:
                    await send_error(
                        "unsupported_protocol",
                        "protocolVersion 1 is required",
                    )
                    continue
                if event.get("codec") != "pcm16" or event.get("sampleRate") != 16000:
                    await send_error(
                        "unsupported_audio",
                        "only pcm16 mono at 16000 Hz is supported",
                    )
                    continue
                scenario = event.get("scenario")
                if asr_session is None:
                    try:
                        asr_session = await asr_provider.open(on_partial)
                    except Exception as error:
                        await send_error(
                            "asr_connect_failed",
                            str(error),
                            stage="asr",
                            retryable=True,
                        )
                        continue
                await send(
                    {
                        "type": "session.ready",
                        "sessionId": session_id,
                        "protocolVersion": 1,
                    }
                )
            elif event_type == "utterance.begin":
                turn_id = event.get("turnId")
                if asr_session is None:
                    await send_error("session_not_ready", "send session.init first")
                elif not isinstance(turn_id, str) or not turn_id:
                    await send_error("invalid_turn", "turnId is required")
                elif active is not None:
                    await send_error("turn_active", "one turn is already active", turn_id=turn_id)
                elif turn_id in used_turn_ids:
                    await send_error("duplicate_turn", "turnId was already used", turn_id=turn_id)
                else:
                    used_turn_ids.add(turn_id)
                    trace = TurnTrace(
                        session_id,
                        turn_id,
                        scenario,
                        dependencies.clock.monotonic,
                        cold=not histories["baseline"],
                    )
                    trace.mark("utterance_begin")
                    active = ActiveTurn(turn_id, AudioBuffer(), trace)
            elif event_type == "audio.delta":
                turn_id = event.get("turnId")
                sequence = event.get("sequence")
                if active is None or turn_id != active.turn_id:
                    await send_error("no_active_turn", "audio does not match an active turn", turn_id=turn_id)
                    continue
                if sequence != active.next_sequence:
                    await send_error(
                        "out_of_order_audio",
                        f"expected sequence {active.next_sequence}",
                        turn_id=active.turn_id,
                        stage="ingress",
                    )
                    active = None
                    try:
                        await reset_asr()
                    except Exception:
                        asr_session = None
                    continue
                data = event.get("data")
                if not isinstance(data, str):
                    await send_error("invalid_audio", "audio data must be base64", turn_id=active.turn_id)
                    active = None
                    try:
                        await reset_asr()
                    except Exception:
                        asr_session = None
                    continue
                try:
                    active.audio.push(data)
                    active.trace.mark("first_audio")
                    active.trace.marks["last_audio"] = dependencies.clock.monotonic()
                    active.next_sequence += 1
                    await asr_session.send(data)
                except Exception as error:
                    await send_error(
                        "audio_ingress_failed",
                        str(error),
                        turn_id=active.turn_id,
                        stage="ingress",
                        retryable=True,
                    )
                    active = None
                    try:
                        await reset_asr()
                    except Exception:
                        asr_session = None
            elif event_type == "utterance.end":
                turn_id = event.get("turnId")
                if active is None or turn_id != active.turn_id:
                    await send_error("no_active_turn", "turn end does not match an active turn", turn_id=turn_id)
                    continue
                await finish_turn(active)
            else:
                await send_error("unknown_event", f"unsupported event type: {event_type}")
    except WebSocketDisconnect:
        active = None
    finally:
        if asr_session is not None:
            await asr_session.close()
