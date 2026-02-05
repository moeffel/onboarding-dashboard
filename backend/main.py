"""FastAPI application entry point."""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from alembic import command
from alembic.config import Config
import anyio
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from config import get_settings
from database import init_db
from services.security import SECURITY_HEADERS
from routers import auth, events, kpis, admin
from routers import kpi_config
from routers import leads

settings = get_settings()

# Rate limiter
limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    if settings.database_url.startswith("sqlite"):
        alembic_cfg = Config(str(Path(__file__).resolve().parent / "alembic.ini"))
        await anyio.to_thread.run_sync(command.upgrade, alembic_cfg, "head")
    else:
        await init_db()
    yield
    # Shutdown (cleanup if needed)


app = FastAPI(
    title=settings.app_name,
    description="AI-gestütztes Onboarding-Dashboard für Finanzdienstleistungen",
    version="0.1.0",
    lifespan=lifespan,
)

# Rate limiter state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS middleware for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Add security headers to all responses."""
    response: Response = await call_next(request)

    # Only add CSP headers for HTML responses, not for API
    if not request.url.path.startswith("/api"):
        for header, value in SECURITY_HEADERS.items():
            response.headers[header] = value
        content_type = response.headers.get("content-type", "")
        if "text/html" in content_type:
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
    else:
        # Still add some security headers for API responses
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"

    return response


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "version": "0.1.0"}


# Include routers (with and without /api prefix for compatibility)
api_routers = [auth.router, events.router, kpis.router, admin.router, kpi_config.router, leads.router]
for router in api_routers:
    app.include_router(router, prefix="/api")
    app.include_router(router)

# Serve built frontend if present (for single-host deployments)
static_dir = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
