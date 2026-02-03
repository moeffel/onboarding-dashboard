"""Add leads and lead status history tables.

Revision ID: 004
Revises: 003
Create Date: 2026-02-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    lead_status_enum = sa.Enum(
        "new_cold",
        "call_scheduled",
        "contact_established",
        "first_appt_pending",
        "first_appt_scheduled",
        "first_appt_completed",
        "second_appt_scheduled",
        "second_appt_completed",
        "closed_won",
        "closed_lost",
        name="leadstatus",
    )

    op.create_table(
        "leads",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("owner_user_id", sa.Integer(), nullable=False),
        sa.Column("team_id", sa.Integer(), nullable=False),
        sa.Column("full_name", sa.String(length=200), nullable=False),
        sa.Column("phone", sa.String(length=50), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("current_status", lead_status_enum, nullable=False, server_default=sa.text("'new_cold'")),
        sa.Column("status_updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_leads_owner_user_id", "leads", ["owner_user_id"])
    op.create_index("ix_leads_team_id", "leads", ["team_id"])
    op.create_index("ix_leads_current_status", "leads", ["current_status"])
    op.create_index("ix_leads_status_updated_at", "leads", ["status_updated_at"])

    op.create_table(
        "lead_status_history",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("lead_id", sa.Integer(), nullable=False),
        sa.Column("changed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("from_status", lead_status_enum, nullable=False),
        sa.Column("to_status", lead_status_enum, nullable=False),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("reason", sa.String(length=100), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["changed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_lead_status_history_lead_id", "lead_status_history", ["lead_id"])
    op.create_index("ix_lead_status_history_changed_by_user_id", "lead_status_history", ["changed_by_user_id"])
    op.create_index("ix_lead_status_history_to_status", "lead_status_history", ["to_status"])
    op.create_index("ix_lead_status_history_changed_at", "lead_status_history", ["changed_at"])


def downgrade() -> None:
    op.drop_table("lead_status_history")
    op.drop_table("leads")
