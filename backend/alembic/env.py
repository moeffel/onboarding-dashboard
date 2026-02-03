"""Alembic environment configuration."""
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy import create_engine

from alembic import context

# Import the Base and all models to register them
from database import Base
from models import (
    User,
    Team,
    AuditLog,
    CallEvent,
    AppointmentEvent,
    ClosingEvent,
    Lead,
    LeadStatusHistory,
    LeadEventMapping,
)
from config import get_settings

# Alembic Config object
config = context.config

# Setup logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Set target metadata
target_metadata = Base.metadata

# Get settings
settings = get_settings()

# Override sqlalchemy.url from settings (use sync URL for migrations)
# Handle both SQLite and PostgreSQL async-to-sync URL conversion
sync_database_url = settings.database_url
if "+aiosqlite" in sync_database_url:
    sync_database_url = sync_database_url.replace("+aiosqlite", "")
elif "+asyncpg" in sync_database_url:
    sync_database_url = sync_database_url.replace("+asyncpg", "+psycopg2")
config.set_main_option("sqlalchemy.url", sync_database_url)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = create_engine(
        config.get_main_option("sqlalchemy.url"),
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
