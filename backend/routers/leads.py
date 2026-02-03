"""Lead router for Kanban journey."""
from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Lead, LeadStatus, UserRole, AuditAction
from routers.auth import get_current_user
from services.lead_status import apply_status_transition
from services.auth import log_audit

router = APIRouter(prefix="/leads", tags=["leads"])


class LeadCreate(BaseModel):
    fullName: str = Field(..., min_length=1, max_length=200)
    phone: str = Field(..., min_length=1, max_length=50)
    email: Optional[str] = Field(None, max_length=255)
    tags: Optional[list[str]] = None
    note: Optional[str] = Field(None, max_length=1000)


class LeadResponse(BaseModel):
    id: int
    ownerUserId: int
    teamId: int
    fullName: str
    phone: str
    email: Optional[str]
    currentStatus: str
    statusUpdatedAt: datetime
    lastActivityAt: Optional[datetime]
    tags: list[str]
    note: Optional[str]
    createdAt: datetime

    class Config:
        from_attributes = True


class LeadStatusUpdate(BaseModel):
    toStatus: LeadStatus
    reason: Optional[str] = Field(None, max_length=100)
    meta: Optional[dict] = None


class CalendarEntry(BaseModel):
    leadId: int
    title: str
    scheduledFor: datetime
    status: str
    ownerUserId: int
    teamId: int


class LeadUpdate(BaseModel):
    note: Optional[str] = Field(None, max_length=1000)


def ensure_lead_access(lead: Lead, current_user) -> None:
    if current_user.role == UserRole.ADMIN:
        return
    if current_user.role == UserRole.TEAMLEITER:
        if current_user.team_id is None or lead.team_id != current_user.team_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Kein Zugriff")
        return
    if lead.owner_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Kein Zugriff")


@router.post("", response_model=LeadResponse, status_code=status.HTTP_201_CREATED)
async def create_lead(
    payload: LeadCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(get_current_user),
):
    if current_user.team_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User hat kein Team",
        )

    lead = Lead(
        owner_user_id=current_user.id,
        team_id=current_user.team_id,
        full_name=payload.fullName,
        phone=payload.phone,
        email=payload.email,
        tags=payload.tags or [],
        note=payload.note,
        current_status=LeadStatus.NEW_COLD,
    )
    db.add(lead)
    await db.flush()

    await apply_status_transition(
        db,
        lead,
        LeadStatus.NEW_COLD,
        changed_by_user_id=current_user.id,
        reason="created",
    )

    await log_audit(
        db,
        action=AuditAction.CREATE,
        actor_user_id=current_user.id,
        object_type="Lead",
        object_id=lead.id,
        diff={
            "full_name": lead.full_name,
            "phone": lead.phone,
            "email": lead.email,
            "team_id": lead.team_id,
        },
    )

    return LeadResponse(
        id=lead.id,
        ownerUserId=lead.owner_user_id,
        teamId=lead.team_id,
        fullName=lead.full_name,
        phone=lead.phone,
        email=lead.email,
        currentStatus=lead.current_status.value,
        statusUpdatedAt=lead.status_updated_at,
        lastActivityAt=lead.last_activity_at,
        tags=lead.tags or [],
        note=lead.note,
        createdAt=lead.created_at,
    )


@router.get("", response_model=list[LeadResponse])
async def list_leads(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(get_current_user),
):
    stmt = select(Lead)
    if current_user.role == UserRole.STARTER:
        stmt = stmt.where(Lead.owner_user_id == current_user.id)
    elif current_user.role == UserRole.TEAMLEITER:
        stmt = stmt.where(Lead.team_id == current_user.team_id)

    result = await db.execute(stmt.order_by(Lead.status_updated_at.desc()))
    leads = result.scalars().all()
    return [
        LeadResponse(
            id=lead.id,
            ownerUserId=lead.owner_user_id,
            teamId=lead.team_id,
            fullName=lead.full_name,
            phone=lead.phone,
            email=lead.email,
            currentStatus=lead.current_status.value,
            statusUpdatedAt=lead.status_updated_at,
            lastActivityAt=lead.last_activity_at,
            tags=lead.tags or [],
            note=lead.note,
            createdAt=lead.created_at,
        )
        for lead in leads
    ]


@router.patch("/{lead_id}/status", response_model=LeadResponse)
async def update_lead_status(
    lead_id: int,
    payload: LeadStatusUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(get_current_user),
):
    lead = await db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead nicht gefunden")

    ensure_lead_access(lead, current_user)

    try:
        if payload.toStatus in {
            LeadStatus.CALL_SCHEDULED,
            LeadStatus.FIRST_APPT_SCHEDULED,
            LeadStatus.SECOND_APPT_SCHEDULED,
        }:
            scheduled_for = (payload.meta or {}).get("scheduled_for")
            if not scheduled_for:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="scheduled_for ist für diesen Status erforderlich",
                )
        await apply_status_transition(
            db,
            lead,
            payload.toStatus,
            changed_by_user_id=current_user.id,
            reason=payload.reason,
            meta=payload.meta,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    await log_audit(
        db,
        action=AuditAction.UPDATE,
        actor_user_id=current_user.id,
        object_type="Lead",
        object_id=lead.id,
        diff={
            "to_status": payload.toStatus.value,
            "reason": payload.reason,
            "meta": payload.meta,
        },
    )

    return LeadResponse(
        id=lead.id,
        ownerUserId=lead.owner_user_id,
        teamId=lead.team_id,
        fullName=lead.full_name,
        phone=lead.phone,
        email=lead.email,
        currentStatus=lead.current_status.value,
        statusUpdatedAt=lead.status_updated_at,
        lastActivityAt=lead.last_activity_at,
        tags=lead.tags or [],
        note=lead.note,
        createdAt=lead.created_at,
    )


@router.patch("/{lead_id}", response_model=LeadResponse)
async def update_lead(
    lead_id: int,
    payload: LeadUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(get_current_user),
):
    lead = await db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead nicht gefunden")

    ensure_lead_access(lead, current_user)

    if payload.note is not None:
        lead.note = payload.note.strip() if payload.note else None

    await db.flush()

    await log_audit(
        db,
        action=AuditAction.UPDATE,
        actor_user_id=current_user.id,
        object_type="Lead",
        object_id=lead.id,
        diff={"note": lead.note},
    )

    return LeadResponse(
        id=lead.id,
        ownerUserId=lead.owner_user_id,
        teamId=lead.team_id,
        fullName=lead.full_name,
        phone=lead.phone,
        email=lead.email,
        currentStatus=lead.current_status.value,
        statusUpdatedAt=lead.status_updated_at,
        lastActivityAt=lead.last_activity_at,
        tags=lead.tags or [],
        note=lead.note,
        createdAt=lead.created_at,
    )


@router.get("/calendar", response_model=list[CalendarEntry])
async def get_calendar_entries(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(get_current_user),
    period: str = "week",
):
    from services.kpi_calculator import get_period_start
    from models import LeadStatusHistory

    period_start = get_period_start(period)

    stmt = select(LeadStatusHistory).join(Lead).where(
        LeadStatusHistory.changed_at >= period_start
    )

    if current_user.role == UserRole.STARTER:
        stmt = stmt.where(Lead.owner_user_id == current_user.id)
    elif current_user.role == UserRole.TEAMLEITER:
        stmt = stmt.where(Lead.team_id == current_user.team_id)

    stmt = stmt.where(
        LeadStatusHistory.to_status.in_(
            [
                LeadStatus.CALL_SCHEDULED,
                LeadStatus.FIRST_APPT_SCHEDULED,
                LeadStatus.SECOND_APPT_SCHEDULED,
            ]
        )
    )

    result = await db.execute(stmt.order_by(LeadStatusHistory.changed_at.desc()))
    entries = []
    for history in result.scalars():
        scheduled_for = None
        if history.meta and isinstance(history.meta, dict):
            scheduled_for = history.meta.get("scheduled_for")
        if not scheduled_for:
            continue
        try:
            scheduled_dt = datetime.fromisoformat(scheduled_for)
        except ValueError:
            continue
        entries.append(
            CalendarEntry(
                leadId=history.lead_id,
                title=f"Lead {history.lead.full_name}",
                scheduledFor=scheduled_dt,
                status=history.to_status.value,
                ownerUserId=history.lead.owner_user_id,
                teamId=history.lead.team_id,
            )
        )

    return entries
