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
    # Use batch mode for SQLite compatibility
    with op.batch_alter_table("call_events") as batch_op:
        batch_op.add_column(sa.Column("lead_id", sa.Integer(), nullable=True))
        batch_op.create_index("ix_call_events_lead_id", ["lead_id"])
        batch_op.create_foreign_key(
            "fk_call_events_lead_id_leads",
            "leads",
            ["lead_id"],
            ["id"],
            ondelete="SET NULL",
        )

    with op.batch_alter_table("appointment_events") as batch_op:
        batch_op.add_column(sa.Column("lead_id", sa.Integer(), nullable=True))
        batch_op.create_index("ix_appointment_events_lead_id", ["lead_id"])
        batch_op.create_foreign_key(
            "fk_appointment_events_lead_id_leads",
            "leads",
            ["lead_id"],
            ["id"],
            ondelete="SET NULL",
        )

    with op.batch_alter_table("closing_events") as batch_op:
        batch_op.add_column(sa.Column("lead_id", sa.Integer(), nullable=True))
        batch_op.create_index("ix_closing_events_lead_id", ["lead_id"])
        batch_op.create_foreign_key(
            "fk_closing_events_lead_id_leads",
            "leads",
            ["lead_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("closing_events") as batch_op:
        batch_op.drop_constraint("fk_closing_events_lead_id_leads", type_="foreignkey")
        batch_op.drop_index("ix_closing_events_lead_id")
        batch_op.drop_column("lead_id")

    with op.batch_alter_table("appointment_events") as batch_op:
        batch_op.drop_constraint("fk_appointment_events_lead_id_leads", type_="foreignkey")
        batch_op.drop_index("ix_appointment_events_lead_id")
        batch_op.drop_column("lead_id")

    with op.batch_alter_table("call_events") as batch_op:
        batch_op.drop_constraint("fk_call_events_lead_id_leads", type_="foreignkey")
        batch_op.drop_index("ix_call_events_lead_id")
        batch_op.drop_column("lead_id")
