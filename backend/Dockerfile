# syntax=docker/dockerfile:1.7

ARG PYTHON_IMAGE=python:3.13-slim-bookworm

# ==========================================
# UV SOURCE
# ==========================================

FROM ghcr.io/astral-sh/uv:0.11.29 AS uv_source

# ==========================================
# PYTHON BASE
# ==========================================

FROM ${PYTHON_IMAGE} AS python-base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# ==========================================
# BUILDER
# ==========================================

FROM python-base AS builder

COPY --from=uv_source /uv /usr/local/bin/uv

ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=0 \
    UV_DEFAULT_INDEX=https://mirror-pypi.runflare.com/simple

COPY pyproject.toml uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-install-project

COPY . .

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev

# ==========================================
# DEVELOPMENT
# ==========================================

FROM builder AS development

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked

EXPOSE 8000

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

# ==========================================
# PRODUCTION
# ==========================================

FROM python-base AS production

RUN addgroup --system django \
    && adduser --system --ingroup django django \
    && mkdir -p /app/staticfiles /app/media \
    && chown django:django /app/staticfiles /app/media

COPY --from=builder --chown=django:django \
    /opt/venv /opt/venv

COPY --from=builder --chown=django:django \
    /app /app

USER django

EXPOSE 8000

CMD ["gunicorn", "config.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "3", \
     "--access-logfile", "-"]
