"""Event models for tracking KPI-relevant activities."""
import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class CallOutcome(str, enum.Enum):
    """Possible outcomes for a call event."""
    ANSWERED = "answered"
    NO_ANSWER = "no_answer"
    DECLINED = "declined"
    BUSY = "busy"
    VOICEMAIL = "voicemail"
    WRONG_NUMBER = "wrong_number"


class AppointmentType(str, enum.Enum):
    """Types of appointments."""
    FIRST = "first"
    SECOND = "second"


class AppointmentResult(str, enum.Enum):
    """Results for appointment events."""
    SET = "set"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"
    COMPLETED = "completed"


class CallEvent(Base):
    """Tracks call activities for KPI calculation."""

    __tablename__ = "call_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    lead_id: Mapped[int | None] = mapped_column(
        ForeignKey("leads.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    datetime: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True
    )

    contact_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)

    outcome: Mapped[CallOutcome] = mapped_column(
        Enum(CallOutcome),
        nullable=False
    )

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    # Relationship
    user = relationship("User", lazy="joined")
    lead = relationship("Lead", lazy="joined")

    def __repr__(self) -> str:
        return f"<CallEvent(id={self.id}, outcome={self.outcome.value})>"


class AppointmentEvent(Base):
    """Tracks appointment activities for KPI calculation."""

    __tablename__ = "appointment_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    lead_id: Mapped[int | None] = mapped_column(
        ForeignKey("leads.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    type: Mapped[AppointmentType] = mapped_column(
        Enum(AppointmentType),
        nullable=False
    )

    datetime: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True
    )

    result: Mapped[AppointmentResult] = mapped_column(
        Enum(AppointmentResult),
        nullable=False
    )

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    location: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    # Relationship
    user = relationship("User", lazy="joined")
    lead = relationship("Lead", lazy="joined")

    def __repr__(self) -> str:
        return f"<AppointmentEvent(id={self.id}, type={self.type.value}, result={self.result.value})>"


class ClosingEvent(Base):
    """Tracks closing/sales activities for KPI calculation."""

    __tablename__ = "closing_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    lead_id: Mapped[int | None] = mapped_column(
        ForeignKey("leads.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    datetime: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True
    )

    units: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        default=Decimal("0")
    )

    product_category: Mapped[str | None] = mapped_column(String(100), nullable=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    # Relationship
    user = relationship("User", lazy="joined")
    lead = relationship("Lead", lazy="joined")

    def __repr__(self) -> str:
        return f"<ClosingEvent(id={self.id}, units={self.units})>"
