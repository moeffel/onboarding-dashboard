#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
VENV_PY="$BACKEND_DIR/venv/bin/python"

RESET_DB="false"
if [[ "${1:-}" == "--reset-db" ]]; then
  RESET_DB="true"
fi

if [[ ! -x "$VENV_PY" ]]; then
  echo "Creating backend venv..."
  python3 -m venv "$BACKEND_DIR/venv"
fi

echo "Installing backend dependencies..."
"$VENV_PY" -m pip install -r "$BACKEND_DIR/requirements.txt" >/dev/null

if [[ "$RESET_DB" == "true" ]]; then
  echo "Resetting database..."
  rm -f "$BACKEND_DIR/onboarding.db"
  (cd "$BACKEND_DIR" && "$VENV_PY" -m alembic upgrade head)
  (cd "$BACKEND_DIR" && "$VENV_PY" scripts/seed_data.py)
else
  if [[ -f "$BACKEND_DIR/onboarding.db" ]]; then
    HAS_ALEMBIC=$("$VENV_PY" - <<'PY'
import sqlite3
conn = sqlite3.connect("onboarding.db")
cur = conn.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='alembic_version'")
print(1 if cur.fetchone() else 0)
conn.close()
PY
)
    if [[ "$HAS_ALEMBIC" == "1" ]]; then
      (cd "$BACKEND_DIR" && "$VENV_PY" -m alembic upgrade head)
    else
      echo "Database exists without alembic_version; stamping head."
      (cd "$BACKEND_DIR" && "$VENV_PY" -m alembic stamp head)
      echo "Running lightweight schema check..."
      (cd "$BACKEND_DIR" && "$VENV_PY" - <<'PY'
import sqlite3

conn = sqlite3.connect("onboarding.db")
cur = conn.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='appointment_events'")
if cur.fetchone():
    cur.execute("PRAGMA table_info(appointment_events)")
    columns = {row[1] for row in cur.fetchall()}
    if "location" not in columns:
        print("Adding missing column appointment_events.location")
        cur.execute("ALTER TABLE appointment_events ADD COLUMN location VARCHAR(255)")
        conn.commit()
conn.close()
PY
)
    fi
  else
    (cd "$BACKEND_DIR" && "$VENV_PY" -m alembic upgrade head)
    (cd "$BACKEND_DIR" && "$VENV_PY" scripts/seed_data.py)
  fi
fi

echo "Starting backend..."
(cd "$BACKEND_DIR" && "$VENV_PY" -m uvicorn main:app --reload --port 8000) &
BACKEND_PID=$!

echo "Starting frontend..."
(cd "$FRONTEND_DIR" && npm run dev) &
FRONTEND_PID=$!

echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo "Press Ctrl+C to stop both."

cleanup() {
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

wait
