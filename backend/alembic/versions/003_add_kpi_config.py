"""Add KPI configuration table.

Revision ID: 003
Revises: 002
Create Date: 2026-02-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "kpi_configs",
        sa.Column("name", sa.String(length=50), primary_key=True),
        sa.Column("label", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("formula", sa.String(length=255), nullable=True),
        sa.Column("warn_threshold", sa.Float(), nullable=True),
        sa.Column("good_threshold", sa.Float(), nullable=True),
        sa.Column("visibility_roles", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    defaults = [
        ("calls_made", "Anrufe getätigt", "Summe der outbound Calls", "COUNT(CallEvent)", None, None),
        ("calls_answered", "Anrufe angenommen", "Angenommene Calls", "COUNT(answered)", None, None),
        ("pickup_rate", "Pickup-Rate", "Anteil angenommener Calls", "calls_answered/calls_made", 0.2, 0.3),
        ("first_appointments_set", "Ersttermine vereinbart", "Gesetzte Ersttermine", "COUNT(first appointments)", None, None),
        ("first_appt_rate", "Ersttermin-Rate", "Ersttermine / angenommene Calls", "first_appointments_set/calls_answered", 0.1, 0.15),
        ("second_appointments_set", "Zweittermine vereinbart", "Gesetzte Zweittermine", "COUNT(second appointments)", None, None),
        ("second_appt_rate", "Zweittermin-Rate", "Zweittermine / Ersttermine", "second_appointments_set/first_appointments_set", 0.1, 0.15),
        ("closings", "Abschlüsse", "Anzahl Abschlüsse", "COUNT(ClosingEvent)", None, None),
        ("units_total", "Units gesamt", "Summe Units", "SUM(units)", None, None),
        ("avg_units_per_closing", "Ø Units pro Abschluss", "Units / Abschlüsse", "units_total/closings", 8, 12),
    ]

    for name, label, description, formula, warn, good in defaults:
        stmt = sa.text(
            """
            INSERT INTO kpi_configs (name, label, description, formula, warn_threshold, good_threshold, visibility_roles)
            VALUES (:name, :label, :description, :formula, :warn, :good, :visibility)
            ON CONFLICT (name) DO NOTHING
            """
        )
        op.get_bind().execute(
            stmt,
            {
                "name": name,
                "label": label,
                "description": description,
                "formula": formula,
                "warn": warn,
                "good": good,
                "visibility": '["starter","teamleiter","admin"]',
            },
        )


def downgrade() -> None:
    op.drop_table("kpi_configs")
