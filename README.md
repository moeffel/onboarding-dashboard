# Onboarding Dashboard

Ein Onboarding-Dashboard für neue Mitarbeiter mit FastAPI Backend und React Frontend.

## Features

- **User-Registrierung** mit Admin-Freigabe-Workflow
- **Rollen-basierte Zugriffskontrolle** (Starter, Teamleiter, Admin)
- **KPI-Tracking** für Calls, Termine und Abschlüsse
- **Team-Verwaltung**
- **Audit-Logging** für Compliance
- **DSGVO-konform** mit Consent-Tracking

## Tech Stack

**Backend:**
- FastAPI + SQLAlchemy
- PostgreSQL (Production) / SQLite (Development)
- Alembic für Migrationen

**Frontend:**
- React + TypeScript
- Vite + Tailwind CSS
- React Query

## Quick Start (Development)

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
python scripts/seed_data.py
uvicorn main:app --reload

# Frontend (neues Terminal)
cd frontend
npm install
npm run dev
```

## Production Deployment

1. `.env.prod.example` nach `.env` kopieren und konfigurieren
2. SSL-Zertifikate in `./ssl/` platzieren
3. Docker Compose starten:

```bash
docker compose -f docker-compose.prod.yml up -d
```

## Lizenz

MIT
