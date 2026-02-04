"""Add location to appointment events.

Revision ID: 008
Revises: 007
Create Date: 2026-02-03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("appointment_events") as batch_op:
        batch_op.add_column(sa.Column("location", sa.String(length=255), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("appointment_events") as batch_op:
        batch_op.drop_column("location")
