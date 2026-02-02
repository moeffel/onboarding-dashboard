"""Test configuration and fixtures."""
import asyncio
from typing import AsyncGenerator, Generator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from database import Base, get_db
from main import app
from models import User, Team, UserRole, UserStatus
from services.auth import hash_password


# Test database URL (in-memory SQLite)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """Create an event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function")
async def test_db() -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def client(test_db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Create a test client with the test database."""

    async def override_get_db():
        yield test_db

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def test_user(test_db: AsyncSession) -> User:
    """Create a test starter user."""
    user = User(
        email="starter@test.de",
        password_hash=hash_password("password123"),
        first_name="Test",
        last_name="Starter",
        role=UserRole.STARTER,
        status=UserStatus.ACTIVE
    )
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_team(test_db: AsyncSession) -> Team:
    """Create a test team."""
    team = Team(name="Test Team")
    test_db.add(team)
    await test_db.commit()
    await test_db.refresh(team)
    return team


@pytest_asyncio.fixture
async def test_teamleiter(test_db: AsyncSession, test_team: Team) -> User:
    """Create a test teamleiter user."""
    user = User(
        email="teamleiter@test.de",
        password_hash=hash_password("password123"),
        first_name="Test",
        last_name="Teamleiter",
        role=UserRole.TEAMLEITER,
        status=UserStatus.ACTIVE
    )
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)

    # Set as team lead
    test_team.lead_user_id = user.id
    await test_db.commit()

    return user


@pytest_asyncio.fixture
async def test_admin(test_db: AsyncSession) -> User:
    """Create a test admin user."""
    user = User(
        email="admin@test.de",
        password_hash=hash_password("password123"),
        first_name="Test",
        last_name="Admin",
        role=UserRole.ADMIN,
        status=UserStatus.ACTIVE
    )
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)
    return user
