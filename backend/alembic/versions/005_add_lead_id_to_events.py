"""Add optional lead_id to event tables.

Revision ID: 005
Revises: 004
Create Date: 2026-02-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("call_events", sa.Column("lead_id", sa.Integer(), nullable=True))
    op.add_column("appointment_events", sa.Column("lead_id", sa.Integer(), nullable=True))
    op.add_column("closing_events", sa.Column("lead_id", sa.Integer(), nullable=True))

    op.create_index("ix_call_events_lead_id", "call_events", ["lead_id"])
    op.create_index("ix_appointment_events_lead_id", "appointment_events", ["lead_id"])
    op.create_index("ix_closing_events_lead_id", "closing_events", ["lead_id"])

    op.create_foreign_key(
        "fk_call_events_lead_id_leads",
        "call_events",
        "leads",
        ["lead_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_appointment_events_lead_id_leads",
        "appointment_events",
        "leads",
        ["lead_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_closing_events_lead_id_leads",
        "closing_events",
        "leads",
        ["lead_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_closing_events_lead_id_leads", "closing_events", type_="foreignkey")
    op.drop_constraint("fk_appointment_events_lead_id_leads", "appointment_events", type_="foreignkey")
    op.drop_constraint("fk_call_events_lead_id_leads", "call_events", type_="foreignkey")

    op.drop_index("ix_closing_events_lead_id", table_name="closing_events")
    op.drop_index("ix_appointment_events_lead_id", table_name="appointment_events")
    op.drop_index("ix_call_events_lead_id", table_name="call_events")

    op.drop_column("closing_events", "lead_id")
    op.drop_column("appointment_events", "lead_id")
    op.drop_column("call_events", "lead_id")
