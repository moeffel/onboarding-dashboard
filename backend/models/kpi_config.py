"""KPI configuration model."""
from datetime import datetime
from typing import List

from sqlalchemy import DateTime, Float, String, Text, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class KPIConfig(Base):
    """Stores configurable KPI metadata and thresholds."""

    __tablename__ = "kpi_configs"

    name: Mapped[str] = mapped_column(String(50), primary_key=True)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    formula: Mapped[str | None] = mapped_column(String(255), nullable=True)

    warn_threshold: Mapped[float | None] = mapped_column(Float, nullable=True)
    good_threshold: Mapped[float | None] = mapped_column(Float, nullable=True)

    visibility_roles: Mapped[list[str]] = mapped_column(
        JSON,
        nullable=False,
        default=lambda: ["starter", "teamleiter", "admin"],
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def visible_for(self, role: str) -> bool:
        """Return true if KPI visible for role."""
        return role in (self.visibility_roles or [])
