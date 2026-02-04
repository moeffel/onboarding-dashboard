"""Add result to closing events.

Revision ID: 009_add_closing_result
Revises: 008
Create Date: 2026-02-04
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "009_add_closing_result"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    closing_result = sa.Enum("won", "no_sale", name="closingresult")
    closing_result.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "closing_events",
        sa.Column("result", closing_result, nullable=False, server_default="won"),
    )
    op.alter_column("closing_events", "result", server_default=None)


def downgrade() -> None:
    op.drop_column("closing_events", "result")
    sa.Enum(name="closingresult").drop(op.get_bind(), checkfirst=True)
