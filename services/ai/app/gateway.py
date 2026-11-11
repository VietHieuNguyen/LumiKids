import asyncio
import json
import logging
from typing import Literal, TypedDict

import httpx
import httpx2
from google import genai
from google.genai import errors, types
from jsonschema import Draft7Validator, SchemaError, ValidationError

from .config import Settings
from .contracts import GenerationRequest
from .prompts import SYSTEM_INSTRUCTION, build_prompt

logger = logging.getLogger('uvicorn.error')

ProviderCategory = Literal['INVALID_API_KEY', 'MODEL_OR_ENDPOINT_UNAVAILABLE',
                           'STRUCTURED_OUTPUT_SCHEMA_REJECTED', 'API_NOT_ENABLED',
                           'BILLING_CONFIGURATION', 'PROVIDER_REQUEST_REJECTED',
                           'PROVIDER_PRECONDITION_FAILED', 'REGION_UNSUPPORTED']


class ProviderDiagnostic(TypedDict):
    providerStatus: int
    category: ProviderCategory


def provider_error_category(error: errors.APIError) -> ProviderCategory:
    # Inspect privately; log only fixed labels, never raw provider messages or keys.
    message = str(error).lower()
    if any(value in message for value in ('api_key_invalid', 'api key not valid', 'api key expired', 'invalid api key')):
        return 'INVALID_API_KEY'
    if error.code == 404:
        return 'MODEL_OR_ENDPOINT_UNAVAILABLE'
    if any(value in message for value in ('response_json_schema', 'response_schema', 'response schema', 'json schema', 'too many states', 'schema is too complex', 'schema complexity')):
        return 'STRUCTURED_OUTPUT_SCHEMA_REJECTED'
    if any(value in message for value in ('service_disabled', 'api has not been used', 'api is disabled')):
        return 'API_NOT_ENABLED'
    if 'billing' in message:
        return 'BILLING_CONFIGURATION'
    if 'location is not supported' in message or 'region is not supported' in message:
        return 'REGION_UNSUPPORTED'
    if error.status == 'FAILED_PRECONDITION':
        return 'PROVIDER_PRECONDITION_FAILED'
    return 'PROVIDER_REQUEST_REJECTED'


class AiFailure(Exception):
    def __init__(self, code: str, retryable: bool = False, status: int = 502, diagnostic: ProviderDiagnostic | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable
        self.status = status
        self.diagnostic = diagnostic


def parse_output(text: str | None, schema: dict) -> dict:
    if not text or len(text.encode('utf-8')) > 262144:
        raise AiFailure('AI_OUTPUT_INVALID', True)
    try:
        content = json.loads(text)
        Draft7Validator(schema).validate(content)
        if not isinstance(content, dict):
            raise AiFailure('AI_OUTPUT_INVALID', True)
        return content
    except (json.JSONDecodeError, ValidationError, ValueError):
        raise AiFailure('AI_OUTPUT_INVALID', True) from None
    except SchemaError:
        raise AiFailure('AI_CONTRACT_INVALID') from None


async def generate(request: GenerationRequest, settings: Settings) -> dict:
    if not settings.configured:
        raise AiFailure('AI_NOT_CONFIGURED', status=503)
    # No SDK retry: Nest owns the single bounded regenerate/retry policy.
    try:
        async with genai.Client(
            api_key=settings.gemini_api_key.get_secret_value(),
            http_options=types.HttpOptions(
                timeout=settings.gemini_timeout_ms,
                retry_options=types.HttpRetryOptions(attempts=1),
            ),
        ).aio as client:
            response = await asyncio.wait_for(client.models.generate_content(
                model=settings.gemini_model,
                contents=build_prompt(request),
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                    response_mime_type='application/json',
                    response_json_schema=request.response_schema,
                    max_output_tokens=settings.gemini_max_output_tokens,
                ),
            ), timeout=settings.gemini_timeout_ms / 1000)
        if response.prompt_feedback and response.prompt_feedback.block_reason:
            raise AiFailure('AI_OUTPUT_BLOCKED')
        candidates = response.candidates or []
        if candidates and candidates[0].finish_reason == types.FinishReason.MAX_TOKENS:
            raise AiFailure('AI_OUTPUT_TRUNCATED')
        if candidates and candidates[0].finish_reason not in (None, types.FinishReason.STOP):
            raise AiFailure('AI_OUTPUT_BLOCKED')
        return parse_output(response.text, request.response_schema)
    except AiFailure:
        raise
    except (TimeoutError, httpx.TimeoutException, httpx2.TimeoutException):
        raise AiFailure('AI_TIMEOUT', True, 504) from None
    except errors.APIError as error:
        category = provider_error_category(error)
        diagnostic: ProviderDiagnostic = {'providerStatus': error.code or 500, 'category': category}
        logger.warning('Gemini rejected request: providerStatus=%s category=%s', error.code, category)
        if error.code in (401, 403) or category == 'INVALID_API_KEY':
            raise AiFailure('AI_PROVIDER_AUTH_ERROR', status=503, diagnostic=diagnostic) from None
        if error.code == 429:
            # Do not accidentally retry hard quota exhaustion.
            raise AiFailure('AI_QUOTA_EXCEEDED', status=429, diagnostic=diagnostic) from None
        if error.code in (400, 404):
            raise AiFailure('AI_PROVIDER_CONFIG_ERROR', status=503, diagnostic=diagnostic) from None
        raise AiFailure('AI_PROVIDER_ERROR', bool(error.code and error.code >= 500), diagnostic=diagnostic) from None
    except (httpx.TransportError, httpx2.TransportError):
        raise AiFailure('AI_SERVICE_UNAVAILABLE', True, 503) from None
