# DemandAccel AI Backend

Django 6 + Django REST Framework API with Neon PostgreSQL and cloud Redis.

## Setup

```bash
uv sync
cp .env.example .env        # add your Neon DATABASE_URL and cloud REDIS_URL
uv run python manage.py migrate
uv run python manage.py runserver
```

## Endpoints

Authentication (JWT, Simple JWT + Redis token blacklist):

- `POST /api/auth/login/` - obtain access + refresh tokens
- `POST /api/auth/refresh/` - refresh access token (rotation enabled)
- `POST /api/auth/logout/` - blacklists access token jti in Redis and refresh token in DB
- `GET /api/auth/profile/` - current user profile + role
- `GET /api/health/` - health check (also verifies Redis connectivity)

Admin-only (RBAC `IsAdmin`):

- `GET/POST /api/admin/users/` - list / create users
- `PATCH/DELETE /api/admin/users/{id}/` - update role / active status, delete

## Roles

`CEO_MANAGEMENT`, `MARKET_ANALYST`, `TRAINING_MANAGER`, `RECRUITMENT_TEAM`, `ADMIN`.
Permission classes in `core/permissions.py` enforce role-based access on every endpoint.

## Dev superuser

A dev admin exists in the Neon database (create it fresh if you reset):

```bash
uv run python manage.py createsuperuser
```

## Environment variables (`backend/.env`)

- `DJANGO_SECRET_KEY` - Django secret key
- `DEBUG` - bool
- `ALLOWED_HOSTS` - comma-separated hosts
- `DATABASE_URL` - Neon PostgreSQL connection string, e.g. `postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`
- `REDIS_URL` - cloud Redis URL, e.g. Upstash `rediss://default:pass@us1-xxx.upstash.io:6379`
- `CORS_ALLOWED_ORIGINS` - frontend origin(s), e.g. `http://localhost:3000`