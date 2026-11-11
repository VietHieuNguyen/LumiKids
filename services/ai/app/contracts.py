from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, JsonValue


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', populate_by_name=True)


class CandidateAsset(StrictModel):
    id: UUID
    name: str = Field(max_length=200)
    object_type: str = Field(alias='objectType', max_length=40)
    tags: list[Annotated[str, Field(max_length=80)]] = Field(max_length=20)
    attributes: dict[
        str,
        str | int | float | bool
        | Annotated[list[Annotated[str, Field(min_length=1, max_length=40)]], Field(max_length=12)],
    ]


class GenerationRequest(StrictModel):
    request_id: UUID = Field(alias='requestId')
    game_type: Literal['COUNTING', 'MATCHING', 'CLASSIFICATION'] = Field(alias='gameType')
    prompt: str = Field(min_length=1, max_length=2000)
    candidates: list[CandidateAsset] = Field(min_length=1, max_length=40)
    response_schema: dict[str, JsonValue] = Field(alias='responseSchema')
    attempt: int = Field(ge=1, le=2)
    validation_errors: list[Annotated[str, Field(pattern=r'^[A-Z_]{1,80}$')]] = Field(alias='validationErrors', max_length=10)
