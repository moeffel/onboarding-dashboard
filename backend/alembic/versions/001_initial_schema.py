"""Initial schema with users, teams, audit logs, and events.

Revision ID: 001
Revises:
Create Date: 2025-02-02

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create teams table first (users reference it)
    # Note: lead_user_id FK to users is not enforced in SQLite due to circular dependency
    # The application logic handles this relationship
    op.create_table(
        'teams',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('lead_user_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )

    # Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('first_name', sa.String(100), nullable=False),
        sa.Column('last_name', sa.String(100), nullable=False),
        sa.Column('role', sa.Enum('starter', 'teamleiter', 'admin', name='userrole'), nullable=False),
        sa.Column('status', sa.Enum('pending', 'active', 'inactive', 'locked', name='userstatus'), nullable=False),
        sa.Column('team_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['team_id'], ['teams.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)

    # Create audit_logs table
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('actor_user_id', sa.Integer(), nullable=True),
        sa.Column('action', sa.Enum('create', 'update', 'delete', 'login', 'logout', 'login_failed', 'export', name='auditaction'), nullable=False),
        sa.Column('object_type', sa.String(100), nullable=True),
        sa.Column('object_id', sa.Integer(), nullable=True),
        sa.Column('diff', sa.Text(), nullable=True),
        sa.Column('context', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['actor_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_audit_logs_actor_user_id', 'audit_logs', ['actor_user_id'])
    op.create_index('ix_audit_logs_action', 'audit_logs', ['action'])
    op.create_index('ix_audit_logs_created_at', 'audit_logs', ['created_at'])

    # Create call_events table
    op.create_table(
        'call_events',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('datetime', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('contact_ref', sa.String(255), nullable=True),
        sa.Column('outcome', sa.Enum('answered', 'no_answer', 'busy', 'voicemail', 'wrong_number', name='calloutcome'), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_call_events_user_id', 'call_events', ['user_id'])
    op.create_index('ix_call_events_datetime', 'call_events', ['datetime'])

    # Create appointment_events table
    op.create_table(
        'appointment_events',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('type', sa.Enum('first', 'second', name='appointmenttype'), nullable=False),
        sa.Column('datetime', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('result', sa.Enum('set', 'cancelled', 'no_show', 'completed', name='appointmentresult'), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_appointment_events_user_id', 'appointment_events', ['user_id'])
    op.create_index('ix_appointment_events_datetime', 'appointment_events', ['datetime'])

    # Create closing_events table
    op.create_table(
        'closing_events',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('datetime', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('units', sa.Numeric(10, 2), nullable=False),
        sa.Column('product_category', sa.String(100), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_closing_events_user_id', 'closing_events', ['user_id'])
    op.create_index('ix_closing_events_datetime', 'closing_events', ['datetime'])


def downgrade() -> None:
    op.drop_table('closing_events')
    op.drop_table('appointment_events')
    op.drop_table('call_events')
    op.drop_table('audit_logs')
    op.drop_table('users')
    op.drop_table('teams')
