from __future__ import annotations

import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import Connection

# `app` paketinin həm layihə kökündən, həm də backend qovluğundan
# başladılan Alembic əmrlərində tapılmasını təmin edir.
BACKEND_DIR = Path(__file__).resolve().parents[1]

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import app.models  # noqa: E402, F401
from app.core.config import settings  # noqa: E402
from app.database.base import Base  # noqa: E402
from app.database.session import engine  # noqa: E402


config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def configure_context_for_connection(connection: Connection) -> None:
    """
    Alembic migration contextini aktiv database connection üçün qurur.
    """
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )


def run_migrations_offline() -> None:
    """
    Database-ə qoşulmadan SQL migration skripti yaradır.
    """
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """
    Database bağlantısı üzərindən migration əməliyyatlarını icra edir.
    """
    with engine.connect() as connection:
        configure_context_for_connection(connection)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()