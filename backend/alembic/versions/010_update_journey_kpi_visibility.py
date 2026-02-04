"""Default journey KPI panel visibility off.

Revision ID: 010
Revises: 009_add_closing_result
Create Date: 2026-02-04
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "010"
down_revision: Union[str, None] = "009_add_closing_result"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE kpi_configs SET visibility_roles = '[]' WHERE name = 'journey_kpis_panel'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE kpi_configs SET visibility_roles = '[\"starter\",\"teamleiter\",\"admin\"]' "
        "WHERE name = 'journey_kpis_panel'"
    )
