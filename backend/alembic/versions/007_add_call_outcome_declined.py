"""Add declined to call outcome enum.

Revision ID: 007
Revises: 006
Create Date: 2026-02-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    new_enum = sa.Enum(
        "answered",
        "no_answer",
        "declined",
        "busy",
        "voicemail",
        "wrong_number",
        name="calloutcome",
    )

    with op.batch_alter_table("call_events") as batch_op:
        batch_op.alter_column(
            "outcome",
            existing_type=sa.Enum(
                "answered",
                "no_answer",
                "busy",
                "voicemail",
                "wrong_number",
                name="calloutcome",
            ),
            type_=new_enum,
            existing_nullable=False,
        )


def downgrade() -> None:
    old_enum = sa.Enum(
        "answered",
        "no_answer",
        "busy",
        "voicemail",
        "wrong_number",
        name="calloutcome",
    )

    with op.batch_alter_table("call_events") as batch_op:
        batch_op.alter_column(
            "outcome",
            existing_type=sa.Enum(
                "answered",
                "no_answer",
                "declined",
                "busy",
                "voicemail",
                "wrong_number",
                name="calloutcome",
            ),
            type_=old_enum,
            existing_nullable=False,
        )
