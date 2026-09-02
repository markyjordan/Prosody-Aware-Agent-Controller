import asyncio

import pytest

from prosody_api.services import asr_service


def run(coro):
    return asyncio.run(coro)


def test_mock_asr_emits_partial_commits_and_resets():
    partials = []

    async def scenario():
        provider = asr_service.MockASRProvider()

        async def partial(text):
            partials.append(text)

        session = await provider.open(partial)
        await session.send("one")
        await session.send("two")
        assert await session.commit() == "Sure."
        with pytest.raises(ValueError, match="no audio"):
            await session.commit()
        await session.close()

    run(scenario())
    assert partials == ["Sure"]


class Connection:
    def __init__(self):
        self.handlers = {}
        self.sent = []
        self.commits = 0
        self.closed = False

    def on(self, event, handler):
        self.handlers[event] = handler

    async def send(self, data):
        self.sent.append(data)

    async def commit(self):
        self.commits += 1

    async def close(self):
        self.closed = True


def test_elevenlabs_session_maps_callbacks_and_errors():
    partials = []

    async def scenario():
        connection = Connection()

        async def partial(text):
            partials.append(text)

        session = asr_service.ElevenLabsASRSession(connection, partial)
        connection.handlers[asr_service.RealtimeEvents.PARTIAL_TRANSCRIPT](
            {"text": "hello"}
        )
        await asyncio.sleep(0)
        await session.send("encoded")
        committed = asyncio.create_task(session.commit())
        await asyncio.sleep(0)
        connection.handlers[asr_service.RealtimeEvents.COMMITTED_TRANSCRIPT](
            {"transcript": "final"}
        )
        assert await committed == "final"
        await session.close()
        assert connection.sent == [{"audio_base_64": "encoded"}]
        assert connection.commits == 1
        assert connection.closed is True

        failed = asr_service.ElevenLabsASRSession(Connection(), partial)
        failed._failed({"message": "provider failed"})
        with pytest.raises(RuntimeError, match="provider failed"):
            await failed.send("ignored")

    run(scenario())
    assert partials == ["hello"]
    assert asr_service._event_text({}) == ""


def test_provider_factory_selects_credentials_and_model():
    configured = type(
        "Settings",
        (),
        {"elevenlabs_api_key": "key", "asr_model": "chosen"},
    )()
    missing = type(
        "Settings",
        (),
        {"elevenlabs_api_key": None, "asr_model": "chosen"},
    )()

    real = asr_service.provider_from_settings(configured)
    mock = asr_service.provider_from_settings(missing)

    assert isinstance(real, asr_service.ElevenLabsASRProvider)
    assert real.model_id == "chosen"
    assert isinstance(mock, asr_service.MockASRProvider)


def test_elevenlabs_provider_opens_manual_pcm_session(monkeypatch):
    connection = Connection()
    seen = []

    class Realtime:
        async def connect(self, options):
            seen.append(options)
            return connection

    client = type(
        "Client",
        (),
        {"speech_to_text": type("Speech", (), {"realtime": Realtime()})()},
    )()
    monkeypatch.setattr(asr_service, "ElevenLabs", lambda api_key: client)

    async def scenario():
        async def partial(_text):
            return None

        provider = asr_service.ElevenLabsASRProvider("secret", "chosen")
        session = await provider.open(partial)
        assert isinstance(session, asr_service.ElevenLabsASRSession)

    run(scenario())
    assert seen == [
        {
            "model_id": "chosen",
            "audio_format": asr_service.AudioFormat.PCM_16000,
            "sample_rate": 16000,
            "commit_strategy": asr_service.CommitStrategy.MANUAL,
        }
    ]
