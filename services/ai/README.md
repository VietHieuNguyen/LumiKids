# LumiKids AI gateway

Python FastAPI gateway; the only owner of the Gemini API key. NestJS authenticates the teacher, selects assets, and validates business rules. This service performs no database writes or asset uploads.

See [configuration, commands, API contract and tests](../../docs/GAME_GENERATION.md).

From repository root, after configuring `services/ai/.env.development`:

```powershell
services/ai/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir services/ai --host 127.0.0.1 --port 8000 --reload --log-level info
```

`GET /health` is a liveness probe. `POST /v1/game-generation` requires the internal Bearer token; browsers must use the authorized NestJS endpoint instead. No Gemini call occurs on startup. Tests mock the official SDK.
