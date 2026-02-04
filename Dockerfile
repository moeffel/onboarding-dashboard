FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM python:3.12-slim AS app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
RUN useradd -m -u 1000 appuser && mkdir -p /data && chmod 777 /data
COPY --chown=appuser:appuser backend/ backend/
COPY --chown=appuser:appuser --from=frontend-builder /app/frontend/dist frontend/dist

USER appuser
WORKDIR /app/backend
EXPOSE 7860
CMD ["sh", "-c", "alembic upgrade head && python scripts/seed_data.py && uvicorn main:app --host 0.0.0.0 --port 7860"]
