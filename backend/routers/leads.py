"""Lead router for Kanban journey."""
from datetime import datetime, timezone
from typing import Annotated, Optional

from datetime import date, time
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import (
    AppointmentEvent,
    CallEvent,
    ClosingEvent,
    Lead,
    LeadEventMapping,
    LeadStatus,
    LeadStatusHistory,
    UserRole,
    AuditAction,
    AppointmentResult,
    AppointmentType,
)
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
    location: Optional[str] = None


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

    duplicate_stmt = (
        select(Lead.id)
        .where(Lead.team_id == current_user.team_id)
        .where(Lead.full_name == payload.fullName)
    )
    if payload.email:
        duplicate_stmt = duplicate_stmt.where(
            or_(
                Lead.email == payload.email,
                Lead.phone == payload.phone,
            )
        )
    else:
        duplicate_stmt = duplicate_stmt.where(Lead.phone == payload.phone)

    duplicate = await db.execute(duplicate_stmt.limit(1))
    if duplicate.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Lead existiert bereits",
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


@router.get("/team", response_model=list[LeadResponse])
async def list_team_leads(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(get_current_user),
):
    """Get all leads for the current user's team (for teamleiter/admin)."""
    if current_user.role not in (UserRole.TEAMLEITER, UserRole.ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Nur Teamleiter und Admins können Team-Leads sehen"
        )

    stmt = select(Lead)
    if current_user.role == UserRole.TEAMLEITER:
        if current_user.team_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Teamleiter hat kein Team zugewiesen"
            )
        stmt = stmt.where(Lead.team_id == current_user.team_id)
    # Admin sees all leads

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


@router.delete("/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lead(
    lead_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(get_current_user),
):
    lead = await db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead nicht gefunden")

    ensure_lead_access(lead, current_user)

    await log_audit(
        db,
        action=AuditAction.DELETE,
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

    await db.execute(delete(CallEvent).where(CallEvent.lead_id == lead.id))
    await db.execute(delete(AppointmentEvent).where(AppointmentEvent.lead_id == lead.id))
    await db.execute(delete(ClosingEvent).where(ClosingEvent.lead_id == lead.id))
    await db.execute(delete(LeadEventMapping).where(LeadEventMapping.lead_id == lead.id))
    await db.execute(delete(LeadStatusHistory).where(LeadStatusHistory.lead_id == lead.id))

    await db.delete(lead)


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
        scheduled_at = None
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
            try:
                scheduled_at = datetime.fromisoformat(str(scheduled_for))
            except ValueError as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="scheduled_for muss ein gültiges ISO-Datum sein",
                ) from exc
            candidate = scheduled_at
            if scheduled_at.tzinfo is not None:
                candidate = scheduled_at.astimezone(timezone.utc).replace(tzinfo=None)
            if candidate < datetime.utcnow():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="scheduled_for darf nicht in der Vergangenheit liegen",
                )

        if payload.toStatus in {LeadStatus.FIRST_APPT_SCHEDULED, LeadStatus.SECOND_APPT_SCHEDULED}:
            appointment_type = (
                AppointmentType.FIRST
                if payload.toStatus == LeadStatus.FIRST_APPT_SCHEDULED
                else AppointmentType.SECOND
            )
            location = (payload.meta or {}).get("location") or "Telefonisch"
            appointment_event = AppointmentEvent(
                user_id=current_user.id,
                lead_id=lead.id,
                type=appointment_type,
                result=AppointmentResult.SET,
                datetime=scheduled_at or datetime.utcnow(),
                location=location,
            )
            db.add(appointment_event)
            await db.flush()

            if payload.meta is None or "location" not in payload.meta:
                payload.meta = {**(payload.meta or {}), "location": location}

        await apply_status_transition(
            db,
            lead,
            payload.toStatus,
            changed_by_user_id=current_user.id,
            reason=payload.reason,
            meta=payload.meta,
            changed_at=scheduled_at,
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
    lead_id: Optional[int] = Query(None, ge=1),
    start: date | None = Query(None, description="Custom start date (YYYY-MM-DD)"),
    end: date | None = Query(None, description="Custom end date (YYYY-MM-DD)"),
):
    from services.kpi_calculator import get_period_start
    from models import LeadStatusHistory

    if period == "custom":
        if not start or not end:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="start und end sind für custom erforderlich",
            )
        period_start = datetime.combine(start, time.min, tzinfo=timezone.utc)
        period_end = datetime.combine(end, time.max, tzinfo=timezone.utc)
    elif period == "all":
        period_start = datetime(1970, 1, 1, tzinfo=timezone.utc)
        period_end = None
    else:
        period_start = get_period_start(period)
        period_end = None
    role_filters = []
    if current_user.role == UserRole.STARTER:
        role_filters.append(Lead.owner_user_id == current_user.id)
    elif current_user.role == UserRole.TEAMLEITER:
        role_filters.append(Lead.team_id == current_user.team_id)
    if lead_id is not None:
        role_filters.append(Lead.id == lead_id)

    entries: list[CalendarEntry] = []

    call_stmt = (
        select(LeadStatusHistory, Lead)
        .join(Lead)
        .where(LeadStatusHistory.to_status == LeadStatus.CALL_SCHEDULED)
        .where(LeadStatusHistory.changed_at >= period_start)
    )
    if period_end is not None:
        call_stmt = call_stmt.where(LeadStatusHistory.changed_at <= period_end)
    for condition in role_filters:
        call_stmt = call_stmt.where(condition)

    call_result = await db.execute(call_stmt.order_by(LeadStatusHistory.changed_at.desc()))
    for history, lead in call_result.all():
        scheduled_for = None
        location = None
        if history.meta and isinstance(history.meta, dict):
            scheduled_for = history.meta.get("scheduled_for")
            location = history.meta.get("location")
        if not scheduled_for:
            continue
        try:
            scheduled_dt = datetime.fromisoformat(scheduled_for)
        except ValueError:
            continue
        entries.append(
            CalendarEntry(
                leadId=history.lead_id,
                title=f"Lead {lead.full_name}",
                scheduledFor=scheduled_dt,
                status=history.to_status.value,
                ownerUserId=lead.owner_user_id,
                teamId=lead.team_id,
                location=location,
            )
        )

    appt_stmt = (
        select(AppointmentEvent, Lead)
        .join(Lead, AppointmentEvent.lead_id == Lead.id)
        .where(AppointmentEvent.result == AppointmentResult.SET)
        .where(AppointmentEvent.datetime >= period_start)
    )
    if period_end is not None:
        appt_stmt = appt_stmt.where(AppointmentEvent.datetime <= period_end)
    for condition in role_filters:
        appt_stmt = appt_stmt.where(condition)

    appt_result = await db.execute(appt_stmt.order_by(AppointmentEvent.datetime.desc()))
    for event, lead in appt_result.all():
        if event.datetime is None:
            continue
        status = (
            LeadStatus.FIRST_APPT_SCHEDULED
            if event.type == AppointmentType.FIRST
            else LeadStatus.SECOND_APPT_SCHEDULED
        )
        entries.append(
            CalendarEntry(
                leadId=event.lead_id,
                title=f"Lead {lead.full_name}",
                scheduledFor=event.datetime,
                status=status.value,
                ownerUserId=lead.owner_user_id,
                teamId=lead.team_id,
                location=event.location,
            )
        )

    entries.sort(key=lambda entry: entry.scheduledFor)
    return entries
