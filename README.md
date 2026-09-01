# DemandAccel AI

Demand intelligence platform: ingest job postings, normalize and classify demand, enrich recruiter contacts, and surface insights for market, training, and recruitment teams.

## Stack

| Service | Technology | Local URL |
|---|---|---|
| Frontend | Next.js (App Router) | http://localhost:3000 |
| API | Django 6 + Django REST Framework | http://localhost:8000 |
| Health | Django | http://localhost:8000/api/health/ |
| Broker / cache | Redis (Compose) | internal `redis:6379` |
| Workers | Celery worker + Celery Beat | background |
| Database | Neon PostgreSQL (external) | `DATABASE_URL` |

Provider API keys (SerpApi, Apify, Apollo, OpenAI, etc.) stay on the **backend**. The Next.js container only gets `NEXT_PUBLIC_API_URL`.

```
frontend/     Next.js UI
backend/      Django API, Celery tasks
nginx/        Optional reverse proxy (Compose profile `prod`)
docker-compose.yml
.env.example  Copy to .env — never commit .env
```

## Quick start (Docker Compose)

**Requirements:** Docker Desktop, a Neon connection string.

```bash
cp .env.example .env
# Edit .env — at least DJANGO_SECRET_KEY and DATABASE_URL
docker compose up --build
```

Compose also reads `backend/.env` if it exists (handy if you already run Django locally).

| Action | Command |
|---|---|
| Start | `docker compose up` |
| Rebuild after code changes | `docker compose up --build` |
| Rebuild frontend from scratch | `docker compose build --no-cache frontend && docker compose up` |
| Stop | Ctrl+C or `docker compose down` |
| VPS + Nginx on port 80 | `docker compose --profile prod up --build -d` |

Open **http://localhost:3000** and sign in. Confirm **http://localhost:8000/api/health/** returns `"status": "ok"`.

Do not also run local `pnpm dev`, `runserver`, or host Redis on 3000/8000 while Compose is up.

### What Compose starts

- **frontend** — Next.js on `:3000`
- **backend** — Gunicorn API on `:8000` (migrates, then serves)
- **worker** — Celery (ingestion, enrichment, analytics)
- **beat** — Celery Beat (scheduled ingestion)
- **redis** — broker/cache on the Docker network (not published to the host)
- **nginx** — only with `--profile prod`

Redis on the host is unused by Compose. Workers always use `redis://redis:6379/0`.

## Environment

Copy the examples. **Never commit `.env` or `backend/.env`.**

| File | Used by |
|---|---|
| [`.env.example`](.env.example) → `.env` | Docker Compose (all backend services + frontend build arg) |
| [`backend/.env.example`](backend/.env.example) → `backend/.env` | Local Django / Celery without Docker |
| [`frontend/.env.example`](frontend/.env.example) → `frontend/.env.local` | Local Next.js (`pnpm dev`) |

### Required for Compose

| Variable | Purpose |
|---|---|
| `DJANGO_SECRET_KEY` | Django secret (use a long random value) |
| `DATABASE_URL` | Neon URL, include `sslmode=require` |
| `NEXT_PUBLIC_API_URL` | Browser API base. Local: `http://localhost:8000/api` |

### Common optional

| Variable | Purpose |
|---|---|
| `FIELD_ENCRYPTION_KEY` | Encrypts stored provider credentials (required when `DEBUG=False`) |
| `DEBUG` | `True` locally; `False` on a VPS |
| `ALLOWED_HOSTS` | Hosts Django accepts |
| `CORS_ALLOWED_ORIGINS` / `CSRF_TRUSTED_ORIGINS` | Frontend origins |
| `FRONTEND_URL` | Links in invite / reset emails |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GROQ_API_KEY` | LLM classification |
| `RESEND_API_KEY` | Transactional email (forgot password, invites) |
| `REDIS_URL` | Only for **non-Docker** local runs (or hosted Redis). Compose overrides this. |

SerpApi, Apify, Apollo, and ContactOut keys are stored in the admin UI (encrypted), not in `.env`.

## Local run without Docker

### Backend

```bash
cd backend
cp .env.example .env          # set DATABASE_URL; Redis at redis://localhost:6379/0
uv sync
uv run python manage.py migrate
uv run python manage.py createsuperuser
uv run python manage.py runserver
```

Celery (separate terminals, Redis must be running):

```bash
cd backend
uv run celery -A config worker -l info
uv run celery -A config beat -l info
```

### Frontend

```bash
cd frontend
cp .env.example .env.local    # NEXT_PUBLIC_API_URL=http://localhost:8000/api
pnpm install
pnpm dev
```

## VPS (Ubuntu)

1. Clone the repo and copy `.env.example` → `.env`.
2. Set `DEBUG=False`, a strong `DJANGO_SECRET_KEY` and `FIELD_ENCRYPTION_KEY`, and your Neon `DATABASE_URL`.
3. Point CORS / CSRF / `FRONTEND_URL` / `ALLOWED_HOSTS` at your domain.
4. Rebuild the frontend with `NEXT_PUBLIC_API_URL=https://your-domain.com/api`.
5. Start with Nginx:

```bash
docker compose --profile prod up --build -d
```

Add TLS (Caddy, certbot, or a host proxy) in front of port 80.

## Roles

`ADMIN`, `CEO_MANAGEMENT`, `MARKET_ANALYST`, `TRAINING_MANAGER`, `RECRUITMENT_TEAM`.

Create the first admin:

```bash
docker compose exec backend python manage.py createsuperuser
# or locally:
cd backend && uv run python manage.py createsuperuser
```

## More detail

- Backend API notes: [backend/README.md](backend/README.md)
- Frontend app notes: [frontend/README.md](frontend/README.md)
