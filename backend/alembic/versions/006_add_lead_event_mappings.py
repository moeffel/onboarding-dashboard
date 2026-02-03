"""Add lead_event_mappings table.

Revision ID: 006
Revises: 005
Create Date: 2026-02-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    event_type_enum = sa.Enum("call", "appointment", "closing", name="eventtype")

    op.create_table(
        "lead_event_mappings",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("event_type", event_type_enum, nullable=False),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("lead_id", sa.Integer(), nullable=True),
        sa.Column("mapping_version", sa.String(length=50), nullable=False),
        sa.Column("mapped_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("source", sa.String(length=50), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "event_type",
            "event_id",
            "mapping_version",
            name="uq_lead_event_mapping_version",
        ),
    )
    op.create_index("ix_lead_event_mappings_event_type", "lead_event_mappings", ["event_type"])
    op.create_index("ix_lead_event_mappings_event_id", "lead_event_mappings", ["event_id"])
    op.create_index("ix_lead_event_mappings_lead_id", "lead_event_mappings", ["lead_id"])


def downgrade() -> None:
    op.drop_table("lead_event_mappings")
