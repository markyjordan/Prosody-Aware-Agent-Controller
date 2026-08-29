from pydantic import BaseModel, Field
from typing import Optional, List

# Mirrors protocol.ts: Prosody

class ProsodyFeatures(BaseModel):
    f0Mean: Optional[float] = None
    f0Range: Optional[float] = None
    energy: Optional[float] = None
    speechRate: Optional[float] = None


class Prosody(BaseModel):
    labels: List[str] = Field(default_factory=list)
    features: Optional[ProsodyFeatures] = None
    confidence: Optional[float] = None


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    voice_id: str = Field(default="cgSgspJ2msm6clMCkdW9")
    model_id: str = Field(default="eleven_v3")


class HealthResponse(BaseModel):
    ok: bool = True


class ProsodyRequest(BaseModel):
    text: Optional[str] = None
    # audio base64 or url for future
    audio_b64: Optional[str] = None


class ConditionRequest(BaseModel):
    history: list = Field(default_factory=list)
    turn: dict
    scenario: Optional[str] = None
    prosody: Optional[Prosody] = None
