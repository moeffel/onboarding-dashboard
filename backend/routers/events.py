"""Events router for recording KPI-relevant activities."""
from __future__ import annotations
from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import (
    CallEvent, CallOutcome,
    AppointmentEvent, AppointmentType, AppointmentResult,
    ClosingEvent,
    Lead,
    LeadStatus,
    AuditAction, UserRole
)
from routers.auth import get_current_user, require_roles
from services.auth import log_audit
from services.lead_status import apply_status_transition

router = APIRouter(prefix="/events", tags=["events"])


def _ensure_not_past(value: datetime | None, label: str) -> None:
    if value is None:
        return
    candidate = value
    if value.tzinfo is not None:
        candidate = value.astimezone(timezone.utc).replace(tzinfo=None)
    now = datetime.utcnow()
    if candidate < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{label} darf nicht in der Vergangenheit liegen",
        )


async def get_accessible_lead(
    db: AsyncSession,
    lead_id: int,
    current_user,
) -> Lead:
    lead = await db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead nicht gefunden")

    if current_user.role == UserRole.ADMIN:
        return lead
    if current_user.role == UserRole.TEAMLEITER:
        if current_user.team_id is None or lead.team_id != current_user.team_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Kein Zugriff")
        return lead
    if lead.owner_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Kein Zugriff")
    return lead


# Request/Response schemas
class CallEventCreate(BaseModel):
    """Schema for creating a call event."""
    model_config = ConfigDict(populate_by_name=True)

    contactRef: Optional[str] = Field(None, max_length=255)
    outcome: CallOutcome
    notes: Optional[str] = Field(None, max_length=1000)
    eventDatetime: Optional[datetime] = Field(None, alias="datetime")
    leadId: Optional[int] = None
    nextCallAt: Optional[datetime] = None


class CallEventResponse(BaseModel):
    """Schema for call event response."""
    id: int
    userId: int
    datetime: datetime
    contactRef: Optional[str]
    outcome: str
    notes: Optional[str]
    leadId: Optional[int]

    class Config:
        from_attributes = True


class AppointmentEventCreate(BaseModel):
    """Schema for creating an appointment event."""
    model_config = ConfigDict(populate_by_name=True)

    type: AppointmentType
    result: AppointmentResult
    notes: Optional[str] = Field(None, max_length=1000)
    location: Optional[str] = Field(None, max_length=255)
    eventDatetime: Optional[datetime] = Field(None, alias="datetime")
    leadId: Optional[int] = None


class AppointmentEventResponse(BaseModel):
    """Schema for appointment event response."""
    id: int
    userId: int
    type: str
    datetime: datetime
    result: str
    notes: Optional[str]
    location: Optional[str]
    leadId: Optional[int]

    class Config:
        from_attributes = True


class ClosingEventCreate(BaseModel):
    """Schema for creating a closing event."""
    model_config = ConfigDict(populate_by_name=True)

    units: Decimal = Field(..., ge=0)
    productCategory: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=1000)
    eventDatetime: Optional[datetime] = Field(None, alias="datetime")
    leadId: Optional[int] = None

    @field_validator('units')
    @classmethod
    def validate_units(cls, v):
        if v < 0:
            raise ValueError('Units müssen >= 0 sein')
        return v


class ClosingEventResponse(BaseModel):
    """Schema for closing event response."""
    id: int
    userId: int
    datetime: datetime
    units: float
    productCategory: Optional[str]
    notes: Optional[str]
    leadId: Optional[int]

    class Config:
        from_attributes = True


class RecentEventResponse(BaseModel):
    """Schema for recent mixed events."""
    id: int
    type: str
    datetime: datetime
    title: str
    meta: Optional[str]
    notes: Optional[str]

    class Config:
        from_attributes = True


@router.post("/call", response_model=CallEventResponse, status_code=status.HTTP_201_CREATED)
async def create_call_event(
    event_data: CallEventCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(get_current_user)
):
    """Record a call event."""
    lead_id = None
    lead = None
    if event_data.leadId is not None:
        lead = await get_accessible_lead(db, event_data.leadId, current_user)
        lead_id = lead.id

    _ensure_not_past(event_data.nextCallAt, "Rückrufdatum")

    event = CallEvent(
        user_id=current_user.id,
        lead_id=lead_id,
        datetime=event_data.eventDatetime or datetime.utcnow(),
        contact_ref=event_data.contactRef,
        outcome=event_data.outcome,
        notes=event_data.notes
    )
    db.add(event)
    await db.flush()

    if lead is not None:
        if event_data.outcome == CallOutcome.ANSWERED:
            await apply_status_transition(
                db,
                lead,
                LeadStatus.CONTACT_ESTABLISHED,
                changed_by_user_id=current_user.id,
                reason="call_answered",
            )
        elif event_data.outcome in {CallOutcome.NO_ANSWER, CallOutcome.BUSY, CallOutcome.VOICEMAIL}:
            if event_data.nextCallAt is not None:
                await apply_status_transition(
                    db,
                    lead,
                    LeadStatus.CALL_SCHEDULED,
                    changed_by_user_id=current_user.id,
                    reason="callback_scheduled",
                    meta={"scheduled_for": event_data.nextCallAt.isoformat()},
                    changed_at=event_data.nextCallAt,
                )
        elif event_data.outcome in {CallOutcome.WRONG_NUMBER, CallOutcome.DECLINED}:
            await apply_status_transition(
                db,
                lead,
                LeadStatus.CLOSED_LOST,
                changed_by_user_id=current_user.id,
                reason="call_declined" if event_data.outcome == CallOutcome.DECLINED else "wrong_number",
            )

    # Log audit
    await log_audit(
        db,
        action=AuditAction.CREATE,
        actor_user_id=current_user.id,
        object_type="CallEvent",
        object_id=event.id
    )

    return CallEventResponse(
        id=event.id,
        userId=event.user_id,
        datetime=event.datetime,
        contactRef=event.contact_ref,
        outcome=event.outcome.value,
        notes=event.notes,
        leadId=event.lead_id,
    )


@router.get("/recent", response_model=list[RecentEventResponse])
async def get_recent_events(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(get_current_user),
    limit: int = 10,
):
    """Return mixed recent events for the current user."""
    limit = max(1, min(limit, 50))

    call_stmt = (
        select(CallEvent)
        .where(CallEvent.user_id == current_user.id)
        .order_by(CallEvent.datetime.desc())
        .limit(limit)
    )
    appt_stmt = (
        select(AppointmentEvent)
        .where(AppointmentEvent.user_id == current_user.id)
        .order_by(AppointmentEvent.datetime.desc())
        .limit(limit)
    )
    closing_stmt = (
        select(ClosingEvent)
        .where(ClosingEvent.user_id == current_user.id)
        .order_by(ClosingEvent.datetime.desc())
        .limit(limit)
    )

    call_result = await db.execute(call_stmt)
    appt_result = await db.execute(appt_stmt)
    closing_result = await db.execute(closing_stmt)

    recent: list[RecentEventResponse] = []
    for event in call_result.scalars():
        recent.append(
            RecentEventResponse(
                id=event.id,
                type="call",
                datetime=event.datetime,
                title=f"Anruf • {event.outcome.value.replace('_', ' ').title()}",
                meta=event.contact_ref,
                notes=event.notes,
            )
        )
    for event in appt_result.scalars():
        meta_parts = [f"Status: {event.result.value}"]
        if event.location:
            meta_parts.append(event.location)
        recent.append(
            RecentEventResponse(
                id=event.id,
                type="appointment",
                datetime=event.datetime,
                title=f"Termin • {event.type.value}",
                meta=" • ".join(meta_parts),
                notes=event.notes,
            )
        )
    for event in closing_result.scalars():
        recent.append(
            RecentEventResponse(
                id=event.id,
                type="closing",
                datetime=event.datetime,
                title="Abschluss",
                meta=f"{event.units} Units" if event.units is not None else None,
                notes=event.notes,
            )
        )

    recent.sort(key=lambda item: item.datetime, reverse=True)
    return recent[:limit]


@router.post("/appointment", response_model=AppointmentEventResponse, status_code=status.HTTP_201_CREATED)
async def create_appointment_event(
    event_data: AppointmentEventCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(get_current_user)
):
    """Record an appointment event."""
    lead_id = None
    lead = None
    if event_data.leadId is not None:
        lead = await get_accessible_lead(db, event_data.leadId, current_user)
        lead_id = lead.id

    if event_data.result == AppointmentResult.SET and event_data.eventDatetime is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Datum ist für vereinbarte Termine erforderlich",
        )
    if event_data.result == AppointmentResult.SET:
        _ensure_not_past(event_data.eventDatetime, "Termin-Datum")

    location = event_data.location or "Telefonisch"

    event = AppointmentEvent(
        user_id=current_user.id,
        lead_id=lead_id,
        type=event_data.type,
        datetime=event_data.eventDatetime or datetime.utcnow(),
        result=event_data.result,
        notes=event_data.notes,
        location=location,
    )
    db.add(event)
    await db.flush()

    if lead is not None:
        scheduled_for = event.datetime.isoformat() if event.datetime else None
        location = event.location or None
        if event.type == AppointmentType.FIRST:
            if event.result == AppointmentResult.SET:
                await apply_status_transition(
                    db,
                    lead,
                    LeadStatus.FIRST_APPT_SCHEDULED,
                    changed_by_user_id=current_user.id,
                    reason="first_appt_scheduled",
                    meta={"scheduled_for": scheduled_for, "location": location},
                    changed_at=event.datetime,
                )
            elif event.result == AppointmentResult.COMPLETED:
                await apply_status_transition(
                    db,
                    lead,
                    LeadStatus.FIRST_APPT_COMPLETED,
                    changed_by_user_id=current_user.id,
                    reason="first_appt_completed",
                )
            elif event.result == AppointmentResult.NO_SHOW:
                await apply_status_transition(
                    db,
                    lead,
                    LeadStatus.FIRST_APPT_SCHEDULED,
                    changed_by_user_id=current_user.id,
                    reason="no_show_first",
                )
            elif event.result == AppointmentResult.CANCELLED:
                await apply_status_transition(
                    db,
                    lead,
                    LeadStatus.CLOSED_LOST,
                    changed_by_user_id=current_user.id,
                    reason="first_appt_declined",
                )
        elif event.type == AppointmentType.SECOND:
            if event.result == AppointmentResult.SET:
                await apply_status_transition(
                    db,
                    lead,
                    LeadStatus.SECOND_APPT_SCHEDULED,
                    changed_by_user_id=current_user.id,
                    reason="second_appt_scheduled",
                    meta={"scheduled_for": scheduled_for, "location": location},
                    changed_at=event.datetime,
                )
            elif event.result == AppointmentResult.COMPLETED:
                await apply_status_transition(
                    db,
                    lead,
                    LeadStatus.SECOND_APPT_COMPLETED,
                    changed_by_user_id=current_user.id,
                    reason="second_appt_completed",
                )
            elif event.result == AppointmentResult.NO_SHOW:
                await apply_status_transition(
                    db,
                    lead,
                    LeadStatus.SECOND_APPT_SCHEDULED,
                    changed_by_user_id=current_user.id,
                    reason="no_show_second",
                )
            elif event.result == AppointmentResult.CANCELLED:
                await apply_status_transition(
                    db,
                    lead,
                    LeadStatus.CLOSED_LOST,
                    changed_by_user_id=current_user.id,
                    reason="second_appt_declined",
                )

    # Log audit
    await log_audit(
        db,
        action=AuditAction.CREATE,
        actor_user_id=current_user.id,
        object_type="AppointmentEvent",
        object_id=event.id
    )

    return AppointmentEventResponse(
        id=event.id,
        userId=event.user_id,
        type=event.type.value,
        datetime=event.datetime,
        result=event.result.value,
        notes=event.notes,
        location=event.location,
        leadId=event.lead_id,
    )


@router.post("/closing", response_model=ClosingEventResponse, status_code=status.HTTP_201_CREATED)
async def create_closing_event(
    event_data: ClosingEventCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(get_current_user)
):
    """Record a closing event."""
    lead_id = None
    lead = None
    if event_data.leadId is not None:
        lead = await get_accessible_lead(db, event_data.leadId, current_user)
        lead_id = lead.id

    if event_data.eventDatetime is not None:
        _ensure_not_past(event_data.eventDatetime, "Abschluss-Datum")

    event = ClosingEvent(
        user_id=current_user.id,
        lead_id=lead_id,
        datetime=event_data.eventDatetime or datetime.utcnow(),
        units=event_data.units,
        product_category=event_data.productCategory,
        notes=event_data.notes
    )
    db.add(event)
    await db.flush()

    if lead is not None:
        await apply_status_transition(
            db,
            lead,
            LeadStatus.CLOSED_WON,
            changed_by_user_id=current_user.id,
            reason="closing_documented",
        )

    # Log audit
    await log_audit(
        db,
        action=AuditAction.CREATE,
        actor_user_id=current_user.id,
        object_type="ClosingEvent",
        object_id=event.id
    )

    return ClosingEventResponse(
        id=event.id,
        userId=event.user_id,
        datetime=event.datetime,
        units=float(event.units),
        productCategory=event.product_category,
        notes=event.notes,
        leadId=event.lead_id,
    )


@router.delete("/call/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_call_event(
    event_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(require_roles(UserRole.ADMIN))
):
    event = await db.get(CallEvent, event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event nicht gefunden")

    await log_audit(
        db,
        action=AuditAction.DELETE,
        actor_user_id=current_user.id,
        object_type="CallEvent",
        object_id=event.id,
        diff={"notes": event.notes}
    )
    await db.delete(event)


@router.delete("/appointment/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_appointment_event(
    event_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(require_roles(UserRole.ADMIN))
):
    event = await db.get(AppointmentEvent, event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event nicht gefunden")

    await log_audit(
        db,
        action=AuditAction.DELETE,
        actor_user_id=current_user.id,
        object_type="AppointmentEvent",
        object_id=event.id,
        diff={"notes": event.notes}
    )
    await db.delete(event)


@router.delete("/closing/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_closing_event(
    event_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(require_roles(UserRole.ADMIN))
):
    event = await db.get(ClosingEvent, event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event nicht gefunden")

    await log_audit(
        db,
        action=AuditAction.DELETE,
        actor_user_id=current_user.id,
        object_type="ClosingEvent",
        object_id=event.id,
        diff={"units": float(event.units), "notes": event.notes}
    )
    await db.delete(event)
