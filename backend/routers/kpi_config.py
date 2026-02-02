"""KPI configuration router."""
from __future__ import annotations

from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import KPIConfig, UserRole, AuditAction
from routers.auth import get_current_user, require_roles
from services.auth import log_audit


router = APIRouter(tags=["kpi-config"])


DEFAULT_KPIS = [
    {
        "name": "calls_made",
        "label": "Anrufe getätigt",
        "description": "Summe der outbound Calls im Zeitraum",
        "formula": "COUNT(CallEvent)",
        "warn_threshold": None,
        "good_threshold": None,
    },
    {
        "name": "calls_answered",
        "label": "Anrufe angenommen",
        "description": "Erfolgreich angenommene Gespräche",
        "formula": "COUNT(CallEvent WHERE outcome = answered)",
        "warn_threshold": None,
        "good_threshold": None,
    },
    {
        "name": "pickup_rate",
        "label": "Pickup-Rate",
        "description": "Anteil angenommener Calls",
        "formula": "calls_answered / calls_made",
        "warn_threshold": 0.2,
        "good_threshold": 0.3,
    },
    {
        "name": "first_appointments_set",
        "label": "Ersttermine",
        "description": "Gesetzte Ersttermine",
        "formula": "COUNT(Appointment WHERE type=first & result=set)",
        "warn_threshold": None,
        "good_threshold": None,
    },
    {
        "name": "first_appt_rate",
        "label": "Ersttermin-Rate",
        "description": "Ersttermine / angenommene Calls",
        "formula": "first_appointments_set / calls_answered",
        "warn_threshold": 0.1,
        "good_threshold": 0.15,
    },
    {
        "name": "second_appointments_set",
        "label": "Zweittermine",
        "description": "Gesetzte Zweittermine",
        "formula": "COUNT(Appointment WHERE type=second & result=set)",
        "warn_threshold": None,
        "good_threshold": None,
    },
    {
        "name": "second_appt_rate",
        "label": "Zweittermin-Rate",
        "description": "Zweittermine / Ersttermine",
        "formula": "second_appointments_set / first_appointments_set",
        "warn_threshold": 0.1,
        "good_threshold": 0.15,
    },
    {
        "name": "closings",
        "label": "Abschlüsse",
        "description": "Anzahl erfolgreicher Abschlüsse",
        "formula": "COUNT(ClosingEvent)",
        "warn_threshold": None,
        "good_threshold": None,
    },
    {
        "name": "units_total",
        "label": "Units gesamt",
        "description": "Summe der eingereichten Units",
        "formula": "SUM(units)",
        "warn_threshold": None,
        "good_threshold": None,
    },
    {
        "name": "avg_units_per_closing",
        "label": "Ø Units pro Abschluss",
        "description": "Units / Abschlüsse",
        "formula": "units_total / closings",
        "warn_threshold": 8,
        "good_threshold": 12,
    },
]


class KPIConfigResponse(BaseModel):
    """Serialized KPI configuration."""

    name: str
    label: str
    description: str | None = None
    formula: str | None = None
    warnThreshold: float | None = None
    goodThreshold: float | None = None
    visibility: list[str] = Field(default_factory=list)

    class Config:
        from_attributes = True


class KPIConfigUpdate(BaseModel):
    """Payload for updating KPI configuration."""

    label: str | None = None
    description: str | None = None
    warnThreshold: float | None = Field(default=None, description="Warnschwelle (>=)")
    goodThreshold: float | None = Field(default=None, description="Grünschwelle (>=)")
    visibility: list[UserRole] | None = None


async def _ensure_defaults(db: AsyncSession) -> None:
    """Ensure default KPI configs exist."""
    existing = await db.execute(select(KPIConfig.name))
    existing_names = {row[0] for row in existing.all()}
    to_insert = [
        KPIConfig(
            name=cfg["name"],
            label=cfg["label"],
            description=cfg["description"],
            formula=cfg["formula"],
            warn_threshold=cfg["warn_threshold"],
            good_threshold=cfg["good_threshold"],
            visibility_roles=["starter", "teamleiter", "admin"],
        )
        for cfg in DEFAULT_KPIS
        if cfg["name"] not in existing_names
    ]
    if to_insert:
        db.add_all(to_insert)
        await db.flush()


def _to_response(model: KPIConfig) -> KPIConfigResponse:
    return KPIConfigResponse(
        name=model.name,
        label=model.label,
        description=model.description,
        formula=model.formula,
        warnThreshold=model.warn_threshold,
        goodThreshold=model.good_threshold,
        visibility=model.visibility_roles or [],
    )


@router.get("/kpi-config", response_model=list[KPIConfigResponse])
async def list_kpi_config(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(get_current_user),
):
    """List KPI configurations visible for the current user."""
    await _ensure_defaults(db)
    result = await db.execute(select(KPIConfig))
    configs = result.scalars().all()
    visible = [
        cfg
        for cfg in configs
        if current_user.role.value in (cfg.visibility_roles or [])
    ]
    return [_to_response(cfg) for cfg in visible]


@router.get("/admin/kpi-config", response_model=list[KPIConfigResponse])
async def admin_list_kpi_config(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(require_roles(UserRole.ADMIN)),
):
    """List all KPI configs for admins."""
    await _ensure_defaults(db)
    result = await db.execute(select(KPIConfig))
    configs = result.scalars().all()
    return [_to_response(cfg) for cfg in configs]


@router.put("/admin/kpi-config/{name}", response_model=KPIConfigResponse)
async def update_kpi_config(
    name: str,
    payload: KPIConfigUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(require_roles(UserRole.ADMIN)),
):
    """Update KPI configuration thresholds/visibility."""
    await _ensure_defaults(db)
    result = await db.execute(select(KPIConfig).where(KPIConfig.name == name))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="KPI nicht gefunden",
        )

    changes = {}
    if payload.label is not None and payload.label != config.label:
        changes["label"] = {"old": config.label, "new": payload.label}
        config.label = payload.label
    if payload.description is not None and payload.description != config.description:
        changes["description"] = {"old": config.description, "new": payload.description}
        config.description = payload.description
    if payload.warnThreshold is not None and payload.warnThreshold != config.warn_threshold:
        changes["warnThreshold"] = {"old": config.warn_threshold, "new": payload.warnThreshold}
        config.warn_threshold = payload.warnThreshold
    if payload.warnThreshold is None and config.warn_threshold is not None:
        changes["warnThreshold"] = {"old": config.warn_threshold, "new": None}
        config.warn_threshold = None
    if payload.goodThreshold is not None and payload.goodThreshold != config.good_threshold:
        changes["goodThreshold"] = {"old": config.good_threshold, "new": payload.goodThreshold}
        config.good_threshold = payload.goodThreshold
    if payload.goodThreshold is None and config.good_threshold is not None:
        changes["goodThreshold"] = {"old": config.good_threshold, "new": None}
        config.good_threshold = None
    if payload.visibility is not None:
        new_visibility = [role.value for role in payload.visibility]
        if new_visibility != (config.visibility_roles or []):
            changes["visibility"] = {
                "old": config.visibility_roles,
                "new": new_visibility,
            }
            config.visibility_roles = new_visibility

    if changes:
        await log_audit(
            db,
            action=AuditAction.UPDATE,
            actor_user_id=current_user.id,
            object_type="KPIConfig",
            object_id=None,
            diff={"name": name, **changes},
        )

    return _to_response(config)
