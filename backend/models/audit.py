"""Audit log model for tracking all changes."""
import enum
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class AuditAction(str, enum.Enum):
    """Types of auditable actions."""
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    LOGIN = "login"
    LOGOUT = "logout"
    LOGIN_FAILED = "login_failed"
    EXPORT = "export"


class AuditLog(Base):
    """Audit log for tracking all user actions."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    actor_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    action: Mapped[AuditAction] = mapped_column(
        Enum(AuditAction),
        nullable=False,
        index=True
    )

    object_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    object_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # JSON-encoded diff of changes
    diff: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Additional context (e.g., IP address)
    context: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True
    )

    def __repr__(self) -> str:
        return f"<AuditLog(id={self.id}, action={self.action.value}, object_type='{self.object_type}')>"
