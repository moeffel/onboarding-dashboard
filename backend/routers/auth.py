"""Authentication router."""
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Response, Request, status
from pydantic import BaseModel, EmailStr
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select

from database import get_db
from models import User, UserStatus, AuditAction, UserRole
from services.auth import (
    authenticate_user,
    create_session_token,
    verify_session_token,
    create_csrf_token,
    log_audit,
    get_user_by_id,
    hash_password
)
from config import get_settings

settings = get_settings()

router = APIRouter(prefix="/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)


class LoginRequest(BaseModel):
    """Login request schema."""
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    """Registration request schema."""
    email: EmailStr
    password: str
    firstName: str
    lastName: str
    phoneNumber: Optional[str] = None
    privacyConsent: bool = False
    termsAccepted: bool = False


class UserResponse(BaseModel):
    """User response schema."""
    id: int
    email: str
    firstName: str
    lastName: str
    role: str
    teamId: int | None
    status: str

    class Config:
        from_attributes = True


class LoginResponse(BaseModel):
    """Login response schema."""
    user: UserResponse
    csrfToken: str


async def get_current_user(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Dependency to get the current authenticated user."""
    session_token = request.cookies.get(settings.session_cookie_name)

    if not session_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nicht authentifiziert"
        )

    user_id = verify_session_token(session_token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sitzung abgelaufen"
        )

    user = await get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Benutzer nicht gefunden"
        )

    return user


def require_roles(*roles: UserRole):
    """Dependency factory to require specific roles."""
    async def role_checker(
        current_user = Depends(get_current_user)
    ):
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Keine Berechtigung für diese Aktion"
            )
        return current_user
    return role_checker


@router.post("/login", response_model=LoginResponse)
@limiter.limit(settings.rate_limit_login)
async def login(
    request: Request,
    response: Response,
    login_data: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Authenticate user and create session."""
    auth_result = await authenticate_user(db, login_data.email, login_data.password)

    if not auth_result.success:
        # Log failed attempt
        await log_audit(
            db,
            action=AuditAction.LOGIN_FAILED,
            context={"email": login_data.email, "ip": request.client.host if request.client else None}
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=auth_result.error
        )

    user = auth_result.user

    # Create session token
    session_token = create_session_token(user.id)

    # Create CSRF token
    csrf_token = create_csrf_token(session_token)

    # Set session cookie
    response.set_cookie(
        key=settings.session_cookie_name,
        value=session_token,
        max_age=settings.session_max_age,
        httponly=True,
        secure=not settings.debug,  # Secure in production
        samesite="lax"
    )

    # Log successful login
    await log_audit(
        db,
        action=AuditAction.LOGIN,
        actor_user_id=user.id,
        context={"ip": request.client.host if request.client else None}
    )

    return LoginResponse(
        user=UserResponse(
            id=user.id,
            email=user.email,
            firstName=user.first_name,
            lastName=user.last_name,
            role=user.role.value,
            teamId=user.team_id,
            status=user.status.value
        ),
        csrfToken=csrf_token
    )


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Logout user and clear session."""
    session_token = request.cookies.get(settings.session_cookie_name)

    if session_token:
        user_id = verify_session_token(session_token)
        if user_id:
            await log_audit(
                db,
                action=AuditAction.LOGOUT,
                actor_user_id=user_id
            )

    # Clear session cookie
    response.delete_cookie(
        key=settings.session_cookie_name,
        httponly=True,
        secure=not settings.debug,
        samesite="lax"
    )

    return {"message": "Erfolgreich abgemeldet"}


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user = Depends(get_current_user)
):
    """Get current authenticated user."""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        firstName=current_user.first_name,
        lastName=current_user.last_name,
        role=current_user.role.value,
        teamId=current_user.team_id,
        status=current_user.status.value
    )


@router.post("/register", status_code=status.HTTP_201_CREATED)
@limiter.limit("3/minute")
async def register(
    request: Request,
    register_data: RegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Register a new user (requires admin approval)."""
    # Validate consent
    if not register_data.privacyConsent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Die Datenschutzerklärung muss akzeptiert werden"
        )
    if not register_data.termsAccepted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Die Nutzungsbedingungen müssen akzeptiert werden"
        )

    # Check if email already exists
    existing = await db.execute(
        select(User).where(User.email == register_data.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Diese E-Mail-Adresse ist bereits registriert"
        )

    now = datetime.now(timezone.utc)

    # Create user with pending status
    user = User(
        email=register_data.email,
        password_hash=hash_password(register_data.password),
        first_name=register_data.firstName,
        last_name=register_data.lastName,
        phone_number=register_data.phoneNumber,
        privacy_consent_at=now,
        terms_accepted_at=now,
        role=UserRole.STARTER,  # Default role, admin can change
        status=UserStatus.PENDING  # Needs admin approval
    )
    db.add(user)
    await db.flush()

    await log_audit(
        db,
        action=AuditAction.CREATE,
        actor_user_id=user.id,
        object_type="User",
        object_id=user.id,
        context={"registration": True, "ip": request.client.host if request.client else None}
    )

    return {
        "message": "Registrierung erfolgreich. Ein Administrator muss Ihren Account freischalten.",
        "userId": user.id
    }
