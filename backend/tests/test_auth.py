"""Tests for authentication endpoints."""
import pytest
from httpx import AsyncClient

from models import User


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    """Test health check endpoint."""
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, test_user: User):
    """Test successful login."""
    response = await client.post(
        "/auth/login",
        json={"email": "starter@test.de", "password": "password123"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["user"]["email"] == "starter@test.de"
    assert data["user"]["role"] == "starter"
    assert "csrfToken" in data

    # Check session cookie is set
    assert "session" in response.cookies


@pytest.mark.asyncio
async def test_login_invalid_password(client: AsyncClient, test_user: User):
    """Test login with wrong password."""
    response = await client.post(
        "/auth/login",
        json={"email": "starter@test.de", "password": "wrongpassword"}
    )
    assert response.status_code == 401
    assert "Ungültige" in response.json()["detail"]


@pytest.mark.asyncio
async def test_login_invalid_email(client: AsyncClient):
    """Test login with non-existent email."""
    response = await client.post(
        "/auth/login",
        json={"email": "notexist@test.de", "password": "password123"}
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me_unauthenticated(client: AsyncClient):
    """Test /auth/me without authentication."""
    response = await client.get("/auth/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me_authenticated(client: AsyncClient, test_user: User):
    """Test /auth/me with valid session."""
    # First login
    login_response = await client.post(
        "/auth/login",
        json={"email": "starter@test.de", "password": "password123"}
    )
    assert login_response.status_code == 200

    # Get me with session cookie
    response = await client.get("/auth/me")
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "starter@test.de"


@pytest.mark.asyncio
async def test_logout(client: AsyncClient, test_user: User):
    """Test logout clears session."""
    # Login first
    await client.post(
        "/auth/login",
        json={"email": "starter@test.de", "password": "password123"}
    )

    # Logout
    response = await client.post("/auth/logout")
    assert response.status_code == 200

    # Try to access protected endpoint
    response = await client.get("/auth/me")
    assert response.status_code == 401
