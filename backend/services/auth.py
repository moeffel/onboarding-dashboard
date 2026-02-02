"""Authentication and session management service."""
import json
import secrets
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from models import User, UserStatus, AuditLog, AuditAction

settings = get_settings()

# Session serializer
serializer = URLSafeTimedSerializer(settings.secret_key)


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    salt = bcrypt.gensalt(rounds=settings.bcrypt_rounds)
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its hash."""
    return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))


def create_session_token(user_id: int) -> str:
    """Create a signed session token."""
    return serializer.dumps({'user_id': user_id, 'created': datetime.utcnow().isoformat()})


def verify_session_token(token: str) -> Optional[int]:
    """Verify a session token and return the user_id if valid."""
    try:
        data = serializer.loads(token, max_age=settings.session_max_age)
        return data.get('user_id')
    except (BadSignature, SignatureExpired):
        return None


def generate_csrf_token() -> str:
    """Generate a CSRF token."""
    return secrets.token_urlsafe(32)


def create_csrf_token(session_token: str) -> str:
    """Create a CSRF token tied to a session."""
    return serializer.dumps({'csrf': secrets.token_urlsafe(16), 'session': session_token[:16]})


def verify_csrf_token(csrf_token: str, session_token: str) -> bool:
    """Verify a CSRF token is valid and matches the session."""
    try:
        data = serializer.loads(csrf_token, max_age=settings.csrf_token_expiry)
        return data.get('session') == session_token[:16]
    except (BadSignature, SignatureExpired):
        return False


class AuthResult:
    """Result of authentication attempt."""
    def __init__(self, user: Optional[User] = None, error: Optional[str] = None):
        self.user = user
        self.error = error
        self.success = user is not None and error is None


async def authenticate_user(db: AsyncSession, email: str, password: str) -> AuthResult:
    """Authenticate a user by email and password."""
    result = await db.execute(
        select(User).where(User.email == email)
    )
    user = result.scalar_one_or_none()

    if user is None:
        return AuthResult(error="Ungültige E-Mail oder Passwort")

    if not verify_password(password, user.password_hash):
        return AuthResult(error="Ungültige E-Mail oder Passwort")

    if user.status == UserStatus.PENDING:
        return AuthResult(error="Ihr Account wartet noch auf Freigabe durch einen Administrator")

    if user.status == UserStatus.LOCKED:
        return AuthResult(error="Ihr Account wurde gesperrt. Bitte kontaktieren Sie einen Administrator")

    if user.status == UserStatus.INACTIVE:
        return AuthResult(error="Ihr Account ist deaktiviert")

    return AuthResult(user=user)


async def log_audit(
    db: AsyncSession,
    action: AuditAction,
    actor_user_id: Optional[int] = None,
    object_type: Optional[str] = None,
    object_id: Optional[int] = None,
    diff: Optional[dict] = None,
    context: Optional[dict] = None
) -> AuditLog:
    """Create an audit log entry."""
    audit_log = AuditLog(
        actor_user_id=actor_user_id,
        action=action,
        object_type=object_type,
        object_id=object_id,
        diff=json.dumps(diff) if diff else None,
        context=json.dumps(context) if context else None
    )
    db.add(audit_log)
    await db.flush()
    return audit_log


async def get_user_by_id(db: AsyncSession, user_id: int) -> Optional[User]:
    """Get a user by ID."""
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    return result.scalar_one_or_none()
