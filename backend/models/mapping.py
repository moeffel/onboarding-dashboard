"""Mapping models for legacy events to leads."""
import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum, ForeignKey, JSON, String, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class EventType(str, enum.Enum):
    """Supported event types for lead mappings."""
    CALL = "call"
    APPOINTMENT = "appointment"
    CLOSING = "closing"


class LeadEventMapping(Base):
    """Versioned mapping from legacy events to leads."""

    __tablename__ = "lead_event_mappings"
    __table_args__ = (
        UniqueConstraint(
            "event_type",
            "event_id",
            "mapping_version",
            name="uq_lead_event_mapping_version",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    event_type: Mapped[EventType] = mapped_column(
        Enum(EventType),
        nullable=False,
        index=True,
    )

    event_id: Mapped[int] = mapped_column(
        nullable=False,
        index=True,
    )

    lead_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("leads.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    mapping_version: Mapped[str] = mapped_column(String(50), nullable=False)
    mapped_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    source: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    meta: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    lead = relationship("Lead", lazy="joined")

    def __repr__(self) -> str:
        return f"<LeadEventMapping(id={self.id}, event_type={self.event_type.value})>"
