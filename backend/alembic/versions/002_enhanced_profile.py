"""Enhanced user profile with consent and approval tracking.

Revision ID: 002
Revises: 001
Create Date: 2025-02-02

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '002'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add 'pending' to UserStatus enum
    # Note: For PostgreSQL, enum alterations require different handling
    # This migration handles both SQLite and PostgreSQL

    # Get connection info to determine database type
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == 'postgresql':
        # PostgreSQL: Add 'pending' to enum type
        op.execute("ALTER TYPE userstatus ADD VALUE IF NOT EXISTS 'pending'")
    # SQLite: No enum alteration needed, it stores as text

    if dialect == 'sqlite':
        with op.batch_alter_table('users') as batch_op:
            batch_op.add_column(sa.Column('phone_number', sa.String(50), nullable=True))
            batch_op.add_column(sa.Column('employee_id', sa.String(100), nullable=True))
            batch_op.add_column(sa.Column('start_date', sa.Date(), nullable=True))
            batch_op.add_column(sa.Column('privacy_consent_at', sa.DateTime(timezone=True), nullable=True))
            batch_op.add_column(sa.Column('terms_accepted_at', sa.DateTime(timezone=True), nullable=True))
            batch_op.add_column(sa.Column('approved_by_id', sa.Integer(), nullable=True))
            batch_op.add_column(sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True))
            batch_op.add_column(sa.Column('admin_notes', sa.Text(), nullable=True))
            batch_op.create_foreign_key(
                'fk_users_approved_by_id',
                'users',
                ['approved_by_id'],
                ['id'],
                ondelete='SET NULL'
            )
            batch_op.create_index('ix_users_employee_id', ['employee_id'])
    else:
        # Add new columns to users table
        op.add_column('users', sa.Column('phone_number', sa.String(50), nullable=True))
        op.add_column('users', sa.Column('employee_id', sa.String(100), nullable=True))
        op.add_column('users', sa.Column('start_date', sa.Date(), nullable=True))
        op.add_column('users', sa.Column('privacy_consent_at', sa.DateTime(timezone=True), nullable=True))
        op.add_column('users', sa.Column('terms_accepted_at', sa.DateTime(timezone=True), nullable=True))
        op.add_column('users', sa.Column('approved_by_id', sa.Integer(), nullable=True))
        op.add_column('users', sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True))
        op.add_column('users', sa.Column('admin_notes', sa.Text(), nullable=True))

        # Add foreign key constraint for approved_by_id
        op.create_foreign_key(
            'fk_users_approved_by_id',
            'users',
            'users',
            ['approved_by_id'],
            ['id'],
            ondelete='SET NULL'
        )

        # Create index for employee_id for faster lookups
        op.create_index('ix_users_employee_id', 'users', ['employee_id'])


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == 'sqlite':
        with op.batch_alter_table('users') as batch_op:
            batch_op.drop_index('ix_users_employee_id')
            batch_op.drop_constraint('fk_users_approved_by_id', type_='foreignkey')
            batch_op.drop_column('admin_notes')
            batch_op.drop_column('approved_at')
            batch_op.drop_column('approved_by_id')
            batch_op.drop_column('terms_accepted_at')
            batch_op.drop_column('privacy_consent_at')
            batch_op.drop_column('start_date')
            batch_op.drop_column('employee_id')
            batch_op.drop_column('phone_number')
    else:
        # Remove index
        op.drop_index('ix_users_employee_id', table_name='users')

        # Remove foreign key constraint
        op.drop_constraint('fk_users_approved_by_id', 'users', type_='foreignkey')

        # Remove columns
        op.drop_column('users', 'admin_notes')
        op.drop_column('users', 'approved_at')
        op.drop_column('users', 'approved_by_id')
        op.drop_column('users', 'terms_accepted_at')
        op.drop_column('users', 'privacy_consent_at')
        op.drop_column('users', 'start_date')
        op.drop_column('users', 'employee_id')
        op.drop_column('users', 'phone_number')

    # Note: Removing 'pending' from enum in PostgreSQL is complex and
    # generally not recommended. Skip for downgrade.
