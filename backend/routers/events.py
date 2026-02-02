"""Events router for recording KPI-relevant activities."""
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import (
    CallEvent, CallOutcome,
    AppointmentEvent, AppointmentType, AppointmentResult,
    ClosingEvent,
    AuditAction, UserRole
)
from routers.auth import get_current_user, require_roles
from services.auth import log_audit

router = APIRouter(prefix="/events", tags=["events"])


# Request/Response schemas
class CallEventCreate(BaseModel):
    """Schema for creating a call event."""
    contactRef: Optional[str] = Field(None, max_length=255)
    outcome: CallOutcome
    notes: Optional[str] = Field(None, max_length=1000)
    datetime: Optional[datetime] = None


class CallEventResponse(BaseModel):
    """Schema for call event response."""
    id: int
    userId: int
    datetime: datetime
    contactRef: Optional[str]
    outcome: str
    notes: Optional[str]

    class Config:
        from_attributes = True


class AppointmentEventCreate(BaseModel):
    """Schema for creating an appointment event."""
    type: AppointmentType
    result: AppointmentResult
    notes: Optional[str] = Field(None, max_length=1000)
    datetime: Optional[datetime] = None


class AppointmentEventResponse(BaseModel):
    """Schema for appointment event response."""
    id: int
    userId: int
    type: str
    datetime: datetime
    result: str
    notes: Optional[str]

    class Config:
        from_attributes = True


class ClosingEventCreate(BaseModel):
    """Schema for creating a closing event."""
    units: Decimal = Field(..., ge=0)
    productCategory: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=1000)
    datetime: Optional[datetime] = None

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

    class Config:
        from_attributes = True


@router.post("/call", response_model=CallEventResponse, status_code=status.HTTP_201_CREATED)
async def create_call_event(
    event_data: CallEventCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(get_current_user)
):
    """Record a call event."""
    event = CallEvent(
        user_id=current_user.id,
        datetime=event_data.datetime or datetime.utcnow(),
        contact_ref=event_data.contactRef,
        outcome=event_data.outcome,
        notes=event_data.notes
    )
    db.add(event)
    await db.flush()

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
        notes=event.notes
    )


@router.post("/appointment", response_model=AppointmentEventResponse, status_code=status.HTTP_201_CREATED)
async def create_appointment_event(
    event_data: AppointmentEventCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(get_current_user)
):
    """Record an appointment event."""
    event = AppointmentEvent(
        user_id=current_user.id,
        type=event_data.type,
        datetime=event_data.datetime or datetime.utcnow(),
        result=event_data.result,
        notes=event_data.notes
    )
    db.add(event)
    await db.flush()

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
        notes=event.notes
    )


@router.post("/closing", response_model=ClosingEventResponse, status_code=status.HTTP_201_CREATED)
async def create_closing_event(
    event_data: ClosingEventCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(get_current_user)
):
    """Record a closing event."""
    event = ClosingEvent(
        user_id=current_user.id,
        datetime=event_data.datetime or datetime.utcnow(),
        units=event_data.units,
        product_category=event_data.productCategory,
        notes=event_data.notes
    )
    db.add(event)
    await db.flush()

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
        notes=event.notes
    )
