import hmac
import logging
import time
from typing import Annotated

from fastapi import Depends, FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from .config import Settings, get_settings
from .contracts import GenerationRequest
from .gateway import AiFailure, generate

logger = logging.getLogger('uvicorn.error')
app = FastAPI(title='LumiKids internal AI gateway', version='1.0.0', docs_url=None, redoc_url=None)


class BodyLimit:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope['type'] != 'http':
            await self.app(scope, receive, send)
            return
        chunks = []
        size = 0
        while True:
            message = await receive()
            if message['type'] == 'http.disconnect':
                return
            size += len(message.get('body', b''))
            if size > 262144:
                await JSONResponse({'error': {'code': 'AI_CONTRACT_INVALID', 'retryable': False}}, status_code=413)(scope, receive, send)
                return
            chunks.append(message)
            if not message.get('more_body', False):
                break

        async def replay() -> dict:
            if chunks:
                return chunks.pop(0)
            return await receive()

        await self.app(scope, replay, send)


app.add_middleware(BodyLimit)


async def authorize(
    settings: Annotated[Settings, Depends(get_settings)],
    authorization: Annotated[str | None, Header()] = None,
) -> Settings:
    token = settings.ai_service_token.get_secret_value()
    if len(token) < 32:
        raise AiFailure('AI_NOT_CONFIGURED', status=503)
    if not authorization or not hmac.compare_digest(authorization.encode(), f'Bearer {token}'.encode()):
        raise AiFailure('AI_PROVIDER_CONFIG_ERROR', status=401)
    return settings


@app.exception_handler(AiFailure)
async def handle_failure(_request: Request, error: AiFailure) -> JSONResponse:
    body: dict = {'code': error.code, 'retryable': error.retryable}
    if error.diagnostic is not None:
        body['diagnostic'] = error.diagnostic
    return JSONResponse({'error': body}, status_code=error.status)


@app.exception_handler(RequestValidationError)
async def handle_validation(_request: Request, _error: RequestValidationError) -> JSONResponse:
    # FastAPI's default validation error echoes the body; do not expose teacher metadata.
    return JSONResponse({'error': {'code': 'AI_CONTRACT_INVALID', 'retryable': False}}, status_code=422)


@app.get('/health')
async def health() -> dict[str, str]:
    return {'status': 'ok'}


@app.post('/v1/game-generation')
async def generate_game(request: GenerationRequest, settings: Annotated[Settings, Depends(authorize)]) -> dict:
    started = time.monotonic()
    status = 'OK'
    try:
        result = await generate(request, settings)
        return {'requestId': str(request.request_id), 'gameContent': result, 'model': settings.gemini_model}
    except AiFailure as error:
        status = error.code
        raise
    except Exception:
        status = 'AI_PROVIDER_ERROR'
        # No raw SDK exception/trace logging: provider payloads can contain credentials.
        raise AiFailure('AI_PROVIDER_ERROR') from None
    finally:
        logger.info('requestId=%s gameType=%s durationMs=%d status=%s attempt=%d', request.request_id,
                    request.game_type, (time.monotonic() - started) * 1000, status, request.attempt)
