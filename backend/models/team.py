"""Team model for organizing users."""
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base

if TYPE_CHECKING:
    from models.user import User


class Team(Base):
    """Team model for grouping starters under a team leader."""

    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)

    lead_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    # Relationships
    lead: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[lead_user_id],
        lazy="joined"
    )
    members: Mapped[list["User"]] = relationship(
        "User",
        back_populates="team",
        foreign_keys="User.team_id",
        lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Team(id={self.id}, name='{self.name}')>"
