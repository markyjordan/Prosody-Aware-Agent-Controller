"""
Agent Controller — infer policy from transcript + prosodic evidence

Diagram:
  utterance {transcript, prosody} → agent controller → {baselineRequest: transcript, conditionedRequest: transcript+policy}
"""
from typing import Tuple
from ..schemas import Prosody


def infer_policy(transcript: str, prosody: Prosody | None) -> str:
    """Produce policy string from prosody. Stub heuristic until probe."""
    if not prosody or not prosody.labels:
        return "neutral"
    labels = prosody.labels
    if "uncertain" in labels or "hesitant" in labels:
        return "user is uncertain/hesitant — offer alternatives, confirm before acting"
    if "sarcastic" in labels or "frustrated" in labels:
        return "user is frustrated/sarcastic — acknowledge frustration, be helpful"
    if "confident" in labels:
        return "user is confident — proceed directly"
    return "neutral"


def build_requests(transcript: str, prosody: Prosody | None) -> Tuple[str, str]:
    policy = infer_policy(transcript, prosody)
    baseline = transcript
    conditioned = f"{transcript}\n[prosody policy: {policy}]"
    if prosody and prosody.labels:
        conditioned += f"\n[labels: {', '.join(prosody.labels)} conf={prosody.confidence}]"
    return baseline, conditioned
