"""Lead and status history models for the Kanban journey."""
import enum
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, Enum, ForeignKey, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base

if TYPE_CHECKING:
    from models.user import User
    from models.team import Team


class LeadStatus(str, enum.Enum):
    """Lifecycle statuses for a lead/opportunity."""
    NEW_COLD = "new_cold"
    CALL_SCHEDULED = "call_scheduled"
    CONTACT_ESTABLISHED = "contact_established"
    FIRST_APPT_PENDING = "first_appt_pending"
    FIRST_APPT_SCHEDULED = "first_appt_scheduled"
    FIRST_APPT_COMPLETED = "first_appt_completed"
    SECOND_APPT_SCHEDULED = "second_appt_scheduled"
    SECOND_APPT_COMPLETED = "second_appt_completed"
    CLOSED_WON = "closed_won"
    CLOSED_LOST = "closed_lost"


class Lead(Base):
    """Lead/Opportunity tracked through the Kanban journey."""

    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    owner_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    team_id: Mapped[int] = mapped_column(
        ForeignKey("teams.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(50), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    current_status: Mapped[LeadStatus] = mapped_column(
        Enum(LeadStatus),
        nullable=False,
        default=LeadStatus.NEW_COLD,
        index=True,
    )

    status_updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    last_activity_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    tags: Mapped[list[str]] = mapped_column(
        JSON,
        nullable=False,
        default=list,
        server_default="[]",
    )

    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    owner: Mapped["User"] = relationship("User", lazy="joined")
    team: Mapped["Team"] = relationship("Team", lazy="joined")
    status_history: Mapped[list["LeadStatusHistory"]] = relationship(
        "LeadStatusHistory",
        back_populates="lead",
        cascade="all, delete-orphan",
        order_by="LeadStatusHistory.changed_at",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Lead(id={self.id}, status={self.current_status.value})>"


class LeadStatusHistory(Base):
    """History of lead status transitions."""

    __tablename__ = "lead_status_history"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    lead_id: Mapped[int] = mapped_column(
        ForeignKey("leads.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    changed_by_user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    from_status: Mapped[LeadStatus] = mapped_column(
        Enum(LeadStatus),
        nullable=False,
    )

    to_status: Mapped[LeadStatus] = mapped_column(
        Enum(LeadStatus),
        nullable=False,
        index=True,
    )

    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    reason: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    meta: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # Relationships
    lead: Mapped["Lead"] = relationship("Lead", back_populates="status_history")
    changed_by: Mapped["User | None"] = relationship("User", lazy="joined")

    def __repr__(self) -> str:
        return f"<LeadStatusHistory(id={self.id}, to_status={self.to_status.value})>"
