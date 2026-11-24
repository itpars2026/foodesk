# Foodesk | فودسک

**Organizational Food Reservation System** — a Persian, RTL web application for employee meal reservations.

**Language:** English | [فارسی](README-fa.md)

## Technology stack

- **Backend:** Python 3.13, Django 6.1, Django REST Framework, Django Unfold, drf-spectacular
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4, Axios, pnpm; responsive RTL PWA
- **Database:** PostgreSQL 17
- **Infrastructure:** Docker Compose, Docker secrets, persistent volumes, Nginx reverse proxy
- **Calendar:** Jalali-facing date inputs and Excel reporting; API query dates use `YYYY-MM-DD` where specified

## Docker environments

Foodesk has two Compose configurations. **Do not run both on the same Docker Engine:** they use the same Compose project name (`food-reservation`) and fixed container names.

| Compose file | Environment | Django | Frontend |
|---|---|---|---|
| `docker-compose.yml` | Production | Gunicorn, production settings | Nginx, prebuilt Vite assets |
| `docker-compose.dev.yml` | Development | `runserver`, development settings | Vite development server |

### Production setup

The deployed topology uses PostgreSQL 17, the Django backend, and the Nginx frontend. A **separate** reverse proxy under `/opt/nginx` terminates HTTPS and routes traffic over `shared_net` to the frontend (`food-frontend`).

1. Create `secrets/django_secret_key.txt` and `secrets/postgres_password.txt` from the example files. Keep real secrets out of Git.
2. Configure `.env` for the production domain, allowed hosts, trusted CSRF origins, and database name/user.
3. Ensure the external `shared_net` Docker network and the host media directory `/opt/food/media` exist.
4. Back up the production database before significant updates or migrations.
5. Deploy from `/opt/food` using the production Compose file:

```bash
docker network inspect shared_net >/dev/null 2>&1 || docker network create shared_net
mkdir -p /opt/food/media
docker compose up -d --build
docker compose exec -T backend python manage.py migrate
docker compose ps
```

Migrations are **not** run during image build. The backend runs `collectstatic` on container startup. The production frontend does not contain the Node.js/pnpm development tooling.

### Isolated local development

Use a separate Docker Engine/host, with appropriate local secrets, network configuration, and media path. Adjust the absolute `/opt/food/media` bind path in the development Compose file if needed.

```bash
docker compose -f docker-compose.dev.yml up -d --build
docker compose -f docker-compose.dev.yml exec -T backend python manage.py migrate
```

| Development service | URL |
|---|---|
| Vite frontend | `http://localhost:5173` |
| Django backend | `http://localhost:8000` |
| Health | `http://localhost:8000/api/v1/health` |

Vite proxies API requests to Django in development.

## Authentication, roles and API

Authentication uses Django sessions and CSRF protection. The application checks `/api/v1/auth/session`, redirects anonymous users to `/login`, and requires applicable users to change their initial password before using protected features. The employee username is the **personnel number**.

Roles and permissions are enforced server-side. Super Admin has full administrative access; `hrFood` has delegated employee-management capabilities. Other permissions, including reporting access, depend on the configured Django permissions and endpoint policies.

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/config` | Public, read-only site branding |
| `GET /api/v1/public-meta` | Public HTML fragment for Open Graph and Twitter metadata |
| `GET /api/v1/auth/session` | Current session status |
| `GET /api/v1/reservations` | User reservation history |
| `GET /api/v1/reservations/weekly?start=YYYY-MM-DD` | Weekly reservation view |
| `GET /api/v1/reports/daily?from=YYYY-MM-DD&to=YYYY-MM-DD` | Daily report for authorized users |
| `GET /api/v1/reports/daily/export?from=YYYY-MM-DD&to=YYYY-MM-DD` | Daily Excel report with Jalali-formatted dates, subject to permissions |

The OpenAPI schema (`/api/v1/schema`) and Swagger UI (`/api/v1/docs`) are restricted to active authenticated Super Admin users. Use an authorized account for the full API contract.

## Excel imports

Sample workbooks are located in `backend/sample_data/`. Run commands in the **backend container**; paths below are relative to `/app`:

```bash
docker compose exec -T backend python manage.py import_employees sample_data/sample_employees.xlsx --dry-run
docker compose exec -T backend python manage.py import_catalog sample_data/sample_catalog.xlsx --dry-run
docker compose exec -T backend python manage.py import_monthly_menu sample_data/sample_monthly_menu.xlsx --dry-run
```

Remove `--dry-run` only after checking validation results. The documented import workflow is atomic and validates duplicates/conflicts before writing. Catalog and menu prices are **whole amounts in Toman**, using fields such as `price_toman` (do not confuse them with rial values in other source documents).

The employee workbook includes personnel number, building number, department number, and active status; employee names are not imported by this workflow. Newly imported employees use the **personnel number** as username and their **national ID** as the initial password; first-login password change is required. Re-importing employees must not automatically reset existing passwords.

The monthly menu workbook contains the `Foods`, `Sides`, and `Drinks` sheets. `Foods` uses `date`, `name`, `price_toman`, `container_price_toman`, and `special_container_price_toman`. Dates can be Excel dates or `YYYY-MM-DD`, and food names must already exist in the catalog. The menu price includes the food price plus the larger of the two container prices. `Sides` and `Drinks` use `name` and `price_toman`.

Duplicate menu dates are rejected. Identical reimports leave existing records unchanged; conflicting food or pricing for an existing date is rejected rather than overwriting historical data. Existing catalog names with changed prices are also rejected by the documented import workflow.

## Site branding

Default branding: **فودسک / Foodesk**, description **سامانه رزرو غذای سازمانی**.

A single `core.SiteSettings` PostgreSQL record stores `site_name`, `site_name_en`, `site_description`, `logo`, and `favicon`. Only active **Super Admin** users can manage this record through Django Unfold. The public `GET /api/v1/config` endpoint supplies branding to React, including media URLs when assets are uploaded.

Brand images accept PNG, JPEG, or WebP with server-side checks (up to 2 MiB and 4 million pixels); SVG uploads are disallowed. If no image is configured, the interface displays a default icon. Django Unfold also uses database-backed title, header and image callbacks, plus a static fallback favicon.

**PWA limitation:** the current web manifest stores its app name and icon statically; changing the admin branding does not necessarily rename an already-installed PWA.

## Environment and secrets

The `.env.example` file supplies non-secret local configuration such as `DJANGO_SETTINGS_MODULE`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS`, `POSTGRES_DB`, and `POSTGRES_USER`.

Reservation cutoff configuration:

```dotenv
DOCKER_COMPOSE_RESERVATION_CUTOFF_HOUR=10
```

Compose maps this variable to the backend's `RESERVATION_CUTOFF_HOUR`. It must be an integer from **0 through 23**. Reservations close at the configured hour on the **last working day before** the service date in the `Asia/Tehran` time zone. Thursdays, Fridays, and configured official holidays are non-working days; under the confirmed policy, the normal Saturday deadline is Wednesday at the cutoff hour. Recreate the backend container after changing its environment.

Compose mounts `secrets/django_secret_key.txt` and `secrets/postgres_password.txt` under `/run/secrets` in relevant containers. These files must be protected and excluded from Git. Docker Compose secrets do **not** encrypt their source files at rest.

## Quality checks

Run database-backed Django tests against an **isolated test database**, not the live production database. The GitHub Actions workflows (`backend-ci.yml`, `frontend-ci.yml`, `deploy.yml`) are the source of truth for automated checks and deployment behavior.

Backend development/test environment:

```bash
python manage.py check
python manage.py test
ruff check .
python manage.py makemigrations --check --dry-run
```

Frontend development/CI environment (Node.js + pnpm required):

```bash
cd frontend
pnpm exec tsc --noEmit
pnpm exec eslint . --max-warnings 0
pnpm test:run
pnpm build
```

The production Nginx frontend container does not provide pnpm, and the backend uses Django's test runner rather than pytest.

## Storage and production considerations

- Production PostgreSQL data lives in the `postgres_data` named volume. Never use `docker compose down -v` on production.
- `food_db_net` connects PostgreSQL and Django; `food_app_net` connects Django and the frontend; `shared_net` connects the frontend to the independent HTTPS reverse proxy. PostgreSQL is not published directly to the host.
- Uploaded media persists in `food_media`, bound to `/opt/food/media` on the server. Collected Django static assets use the `django_static` volume shared with the frontend Nginx.
- Production Django uses `config.settings.production` and Gunicorn; the frontend Nginx serves Vite's built assets and proxies `/api/` and `/admin/` to Django.
- Keep secrets, database backups, and uploaded media outside Git. Verify recoverability before applying risky changes.
- Changes to the frontend or backend images require a controlled redeploy; inspect service health after updating.

## Social metadata, robots, and CDN caching

A singleton `core.SiteSettings` record controls site branding. React reads `/api/v1/config` for runtime branding. For link previews, Django exposes `/api/v1/public-meta`; frontend Nginx uses SSI to insert escaped Open Graph and Twitter tags directly into the initial HTML, including for crawlers that do not run JavaScript. Changing site branding should not require a React rebuild, provided dynamic HTML is not served stale by a CDN.

The app's HTML uses `noindex, nofollow`, and `/robots.txt` should be served as **text/plain** instead of the SPA fallback HTML. CDN caching must be bypassed for `/api/*`, `/admin/*`, and dynamic HTML routes; `/robots.txt` may require a one-time purge of a previously cached HTML response. Versioned Vite assets under `/static/app/assets/` may retain long-lived immutable caching.

The initial HTML `<title>` is currently static; React updates the browser tab title after loading `/api/v1/config`. The SSI fragment updates social metadata, not the initial `<title>`. Do not assume that every messaging platform will refresh an existing link preview immediately.
