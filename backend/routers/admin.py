"""Admin router for user and team management."""
import csv
import io
import json
from datetime import datetime, timezone, date
from decimal import Decimal
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import (
    AppointmentEvent,
    AuditAction,
    AuditLog,
    CallEvent,
    ClosingEvent,
    KPIConfig,
    Lead,
    LeadEventMapping,
    LeadStatusHistory,
    Team,
    User,
    UserRole,
    UserStatus,
)
from routers.auth import require_roles
from services.auth import hash_password, log_audit

router = APIRouter(prefix="/admin", tags=["admin"])


# User schemas
class UserCreate(BaseModel):
    """Schema for creating a user."""
    email: EmailStr
    password: str = Field(..., min_length=8)
    firstName: str = Field(..., max_length=100)
    lastName: str = Field(..., max_length=100)
    role: UserRole = UserRole.STARTER
    teamId: Optional[int] = None


class UserUpdate(BaseModel):
    """Schema for updating a user."""
    email: Optional[EmailStr] = None
    firstName: Optional[str] = Field(None, max_length=100)
    lastName: Optional[str] = Field(None, max_length=100)
    role: Optional[UserRole] = None
    status: Optional[UserStatus] = None
    teamId: Optional[int] = None


class UserResponse(BaseModel):
    """User response schema."""
    id: int
    email: str
    firstName: str
    lastName: str
    role: str
    status: str
    teamId: Optional[int]
    # Extended fields
    phoneNumber: Optional[str] = None
    employeeId: Optional[str] = None
    startDate: Optional[str] = None
    approvedById: Optional[int] = None
    approvedAt: Optional[str] = None
    adminNotes: Optional[str] = None
    createdAt: Optional[str] = None

    class Config:
        from_attributes = True


class ApproveUserRequest(BaseModel):
    """Schema for approving a user."""
    role: UserRole = UserRole.STARTER
    teamId: Optional[int] = None
    startDate: Optional[date] = None
    adminNotes: Optional[str] = None


class RejectUserRequest(BaseModel):
    """Schema for rejecting a user."""
    reason: str = Field(..., min_length=1, max_length=1000)


def user_to_response(user: User) -> UserResponse:
    """Convert User model to UserResponse."""
    return UserResponse(
        id=user.id,
        email=user.email,
        firstName=user.first_name,
        lastName=user.last_name,
        role=user.role.value,
        status=user.status.value,
        teamId=user.team_id,
        phoneNumber=user.phone_number,
        employeeId=user.employee_id,
        startDate=user.start_date.isoformat() if user.start_date else None,
        approvedById=user.approved_by_id,
        approvedAt=user.approved_at.isoformat() if user.approved_at else None,
        adminNotes=user.admin_notes,
        createdAt=user.created_at.isoformat() if user.created_at else None,
    )


# Team schemas
class TeamCreate(BaseModel):
    """Schema for creating a team."""
    name: str = Field(..., max_length=100)
    leadUserId: Optional[int] = None


class TeamUpdate(BaseModel):
    """Schema for updating a team."""
    name: Optional[str] = Field(None, max_length=100)
    leadUserId: Optional[int] = None


class TeamResponse(BaseModel):
    """Team response schema."""
    id: int
    name: str
    leadUserId: Optional[int]
    displayName: str
    leadFullName: Optional[str] = None

    class Config:
        from_attributes = True


class AuditLogResponse(BaseModel):
    """Audit log response schema."""
    id: int
    actorUserId: Optional[int]
    actorName: Optional[str] = None
    action: str
    objectType: Optional[str]
    objectId: Optional[int]
    objectLabel: Optional[str] = None
    diff: Optional[str]
    createdAt: str

    class Config:
        from_attributes = True


def _serialize_csv_value(value) -> str:
    if value is None:
        return ""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=True)
    if hasattr(value, "value"):
        return str(value.value)
    return str(value)


@router.get("/export.csv")
async def export_csv(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(require_roles(UserRole.ADMIN)),
):
    """Export all database entries as a single CSV file."""
    export_models = [
        ("users", User),
        ("teams", Team),
        ("leads", Lead),
        ("lead_status_history", LeadStatusHistory),
        ("call_events", CallEvent),
        ("appointment_events", AppointmentEvent),
        ("closing_events", ClosingEvent),
        ("lead_event_mappings", LeadEventMapping),
        ("kpi_configs", KPIConfig),
        ("audit_logs", AuditLog),
    ]

    column_names: list[str] = ["table"]
    for _, model in export_models:
        for column in model.__table__.columns:
            if column.name not in column_names:
                column_names.append(column.name)

    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=column_names)
    writer.writeheader()

    for table_name, model in export_models:
        result = await db.execute(select(model))
        rows = result.scalars().all()
        for row in rows:
            record = {"table": table_name}
            for column in model.__table__.columns:
                record[column.name] = _serialize_csv_value(getattr(row, column.name))
            writer.writerow(record)

    await log_audit(
        db,
        action=AuditAction.EXPORT,
        actor_user_id=current_user.id,
        object_type="Export",
        object_id=None,
        diff={"tables": [name for name, _ in export_models]},
    )

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    filename = f"onboarding-export-{timestamp}.csv"
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=\"{filename}\""},
    )


# User management
@router.get("/users", response_model=list[UserResponse])
async def list_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(require_roles(UserRole.ADMIN)),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100)
):
    """List all users."""
    result = await db.execute(
        select(User).offset(skip).limit(limit)
    )
    users = result.scalars().all()
    return [user_to_response(u) for u in users]


@router.get("/users/pending", response_model=list[UserResponse])
async def list_pending_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(require_roles(UserRole.ADMIN))
):
    """List users awaiting approval."""
    result = await db.execute(
        select(User).where(User.status == UserStatus.PENDING)
    )
    users = result.scalars().all()
    return [user_to_response(u) for u in users]


@router.post("/users/{user_id}/approve", response_model=UserResponse)
async def approve_user(
    user_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(require_roles(UserRole.ADMIN)),
    approval_data: Optional[ApproveUserRequest] = None,
    # Legacy query params for backwards compatibility
    role: Optional[UserRole] = Query(None, description="Role to assign (deprecated, use body)"),
    team_id: Optional[int] = Query(None, description="Team to assign (deprecated, use body)")
):
    """Approve a pending user and assign role."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Benutzer nicht gefunden"
        )

    if user.status != UserStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Benutzer ist nicht im Status 'Ausstehend'"
        )

    # Support both body and query params (body takes precedence)
    final_role = UserRole.STARTER
    final_team_id = None
    final_start_date = None
    final_admin_notes = None

    if approval_data:
        final_role = approval_data.role
        final_team_id = approval_data.teamId
        final_start_date = approval_data.startDate
        final_admin_notes = approval_data.adminNotes
    else:
        # Fallback to query params for backwards compatibility
        if role:
            final_role = role
        if team_id:
            final_team_id = team_id

    old_role = user.role.value

    # Approve user
    now = datetime.now(timezone.utc)
    user.status = UserStatus.ACTIVE
    user.role = final_role
    user.team_id = final_team_id
    user.start_date = final_start_date
    user.admin_notes = final_admin_notes
    user.approved_by_id = current_user.id
    user.approved_at = now

    if final_role == UserRole.TEAMLEITER:
        existing_team = await db.execute(
            select(Team).where(Team.lead_user_id == user.id)
        )
        if existing_team.scalar_one_or_none() is None:
            db.add(
                Team(
                    name=f"Team {user.first_name} {user.last_name}",
                    lead_user_id=user.id,
                )
            )

    await log_audit(
        db,
        action=AuditAction.UPDATE,
        actor_user_id=current_user.id,
        object_type="User",
        object_id=user.id,
        diff={
            "status": {"old": "pending", "new": "active"},
            "role": {"old": old_role, "new": final_role.value},
            "approved_by_id": {"old": None, "new": current_user.id},
            "start_date": {"old": None, "new": str(final_start_date) if final_start_date else None}
        }
    )

    return user_to_response(user)


@router.post("/users/{user_id}/reject", response_model=UserResponse)
async def reject_user(
    user_id: int,
    reject_data: RejectUserRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(require_roles(UserRole.ADMIN))
):
    """Reject a pending user with a reason."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Benutzer nicht gefunden"
        )

    if user.status != UserStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Benutzer ist nicht im Status 'Ausstehend'"
        )

    # Reject user
    user.status = UserStatus.INACTIVE
    user.admin_notes = f"Abgelehnt: {reject_data.reason}"

    await log_audit(
        db,
        action=AuditAction.UPDATE,
        actor_user_id=current_user.id,
        object_type="User",
        object_id=user.id,
        diff={
            "status": {"old": "pending", "new": "inactive"},
            "rejection_reason": reject_data.reason
        }
    )

    return user_to_response(user)


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(require_roles(UserRole.ADMIN))
):
    """Create a new user."""
    # Check if email already exists
    existing = await db.execute(
        select(User).where(User.email == user_data.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="E-Mail-Adresse bereits vergeben"
        )

    user = User(
        email=user_data.email,
        password_hash=hash_password(user_data.password),
        first_name=user_data.firstName,
        last_name=user_data.lastName,
        role=user_data.role,
        team_id=user_data.teamId
    )
    db.add(user)
    await db.flush()

    await log_audit(
        db,
        action=AuditAction.CREATE,
        actor_user_id=current_user.id,
        object_type="User",
        object_id=user.id
    )

    return user_to_response(user)


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(require_roles(UserRole.ADMIN))
):
    """Update a user."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Benutzer nicht gefunden"
        )

    # Track changes for audit
    changes = {}

    if user_data.email is not None and user_data.email != user.email:
        changes["email"] = {"old": user.email, "new": user_data.email}
        user.email = user_data.email
    if user_data.firstName is not None:
        changes["firstName"] = {"old": user.first_name, "new": user_data.firstName}
        user.first_name = user_data.firstName
    if user_data.lastName is not None:
        changes["lastName"] = {"old": user.last_name, "new": user_data.lastName}
        user.last_name = user_data.lastName
    if user_data.role is not None:
        changes["role"] = {"old": user.role.value, "new": user_data.role.value}
        user.role = user_data.role
    if user_data.status is not None:
        changes["status"] = {"old": user.status.value, "new": user_data.status.value}
        user.status = user_data.status
    if user_data.teamId is not None:
        changes["teamId"] = {"old": user.team_id, "new": user_data.teamId}
        user.team_id = user_data.teamId

    if changes:
        await log_audit(
            db,
            action=AuditAction.UPDATE,
            actor_user_id=current_user.id,
            object_type="User",
            object_id=user.id,
            diff=changes
        )

    if user.role == UserRole.TEAMLEITER:
        existing_team = await db.execute(
            select(Team).where(Team.lead_user_id == user.id)
        )
        if existing_team.scalar_one_or_none() is None:
            db.add(
                Team(
                    name=f"Team {user.first_name} {user.last_name}",
                    lead_user_id=user.id,
                )
            )

    return user_to_response(user)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(require_roles(UserRole.ADMIN))
):
    """Delete a user."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Benutzer nicht gefunden"
        )

    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Eigenen Account kann nicht gelöscht werden"
        )

    await log_audit(
        db,
        action=AuditAction.DELETE,
        actor_user_id=current_user.id,
        object_type="User",
        object_id=user.id
    )

    lead_ids = select(Lead.id).where(Lead.owner_user_id == user.id)

    await db.execute(delete(CallEvent).where(CallEvent.user_id == user.id))
    await db.execute(delete(CallEvent).where(CallEvent.lead_id.in_(lead_ids)))
    await db.execute(delete(AppointmentEvent).where(AppointmentEvent.user_id == user.id))
    await db.execute(delete(AppointmentEvent).where(AppointmentEvent.lead_id.in_(lead_ids)))
    await db.execute(delete(ClosingEvent).where(ClosingEvent.user_id == user.id))
    await db.execute(delete(ClosingEvent).where(ClosingEvent.lead_id.in_(lead_ids)))
    await db.execute(delete(LeadEventMapping).where(LeadEventMapping.lead_id.in_(lead_ids)))
    await db.execute(delete(LeadStatusHistory).where(LeadStatusHistory.changed_by_user_id == user.id))
    await db.execute(delete(Lead).where(Lead.owner_user_id == user.id))
    await db.execute(
        Team.__table__.update()
        .where(Team.lead_user_id == user.id)
        .values(lead_user_id=None)
    )

    await db.delete(user)


# Team management
@router.get("/teams", response_model=list[TeamResponse])
async def list_teams(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(require_roles(UserRole.ADMIN))
):
    """List all teams."""
    result = await db.execute(select(Team))
    teams = result.scalars().all()

    return [
        TeamResponse(
            id=t.id,
            name=t.name,
            leadUserId=t.lead_user_id,
            displayName=f"Team {t.lead.first_name} {t.lead.last_name}" if t.lead else t.name,
            leadFullName=f"{t.lead.first_name} {t.lead.last_name}" if t.lead else None,
        )
        for t in teams
    ]


@router.post("/teams", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
async def create_team(
    team_data: TeamCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(require_roles(UserRole.ADMIN))
):
    """Create a new team."""
    team = Team(
        name=team_data.name,
        lead_user_id=team_data.leadUserId
    )
    db.add(team)
    await db.flush()

    await log_audit(
        db,
        action=AuditAction.CREATE,
        actor_user_id=current_user.id,
        object_type="Team",
        object_id=team.id
    )

    return TeamResponse(
        id=team.id,
        name=team.name,
        leadUserId=team.lead_user_id,
        displayName=f"Team {team.lead.first_name} {team.lead.last_name}" if team.lead else team.name,
        leadFullName=f"{team.lead.first_name} {team.lead.last_name}" if team.lead else None,
    )


@router.put("/teams/{team_id}", response_model=TeamResponse)
async def update_team(
    team_id: int,
    team_data: TeamUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(require_roles(UserRole.ADMIN))
):
    """Update a team."""
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()

    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team nicht gefunden"
        )

    changes = {}
    if team_data.name is not None:
        changes["name"] = {"old": team.name, "new": team_data.name}
        team.name = team_data.name
    if team_data.leadUserId is not None:
        changes["leadUserId"] = {"old": team.lead_user_id, "new": team_data.leadUserId}
        team.lead_user_id = team_data.leadUserId

    if changes:
        await log_audit(
            db,
            action=AuditAction.UPDATE,
            actor_user_id=current_user.id,
            object_type="Team",
            object_id=team.id,
            diff=changes
        )

    return TeamResponse(
        id=team.id,
        name=team.name,
        leadUserId=team.lead_user_id,
        displayName=f"Team {team.lead.first_name} {team.lead.last_name}" if team.lead else team.name,
        leadFullName=f"{team.lead.first_name} {team.lead.last_name}" if team.lead else None,
    )


@router.delete("/teams/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team(
    team_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(require_roles(UserRole.ADMIN))
):
    """Delete a team."""
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()

    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team nicht gefunden"
        )

    await log_audit(
        db,
        action=AuditAction.DELETE,
        actor_user_id=current_user.id,
        object_type="Team",
        object_id=team.id
    )

    await db.delete(team)


# Audit log
@router.get("/audit-logs", response_model=list[AuditLogResponse])
async def list_audit_logs(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(require_roles(UserRole.ADMIN)),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    action: Optional[AuditAction] = None,
    user_id: Optional[int] = None
):
    """List audit logs with optional filters."""
    query = select(AuditLog).order_by(AuditLog.created_at.desc())

    if action:
        query = query.where(AuditLog.action == action)
    if user_id:
        query = query.where(AuditLog.actor_user_id == user_id)

    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    logs = result.scalars().all()

    actor_ids = {log.actor_user_id for log in logs if log.actor_user_id}
    object_ids_by_type: dict[str, set[int]] = {}
    for log in logs:
        if not log.object_type or not log.object_id:
            continue
        object_ids_by_type.setdefault(log.object_type, set()).add(log.object_id)

    actor_map: dict[int, str] = {}
    if actor_ids:
        actor_result = await db.execute(select(User).where(User.id.in_(actor_ids)))
        for user in actor_result.scalars():
            actor_map[user.id] = f"{user.first_name} {user.last_name}".strip()

    lead_map: dict[int, str] = {}
    if object_ids_by_type.get("Lead"):
        from models import Lead
        lead_result = await db.execute(select(Lead).where(Lead.id.in_(object_ids_by_type["Lead"])))
        for lead in lead_result.scalars():
            lead_map[lead.id] = lead.full_name

    user_map: dict[int, str] = {}
    if object_ids_by_type.get("User"):
        user_result = await db.execute(select(User).where(User.id.in_(object_ids_by_type["User"])))
        for user in user_result.scalars():
            user_map[user.id] = f"{user.first_name} {user.last_name}".strip()

    team_map: dict[int, str] = {}
    if object_ids_by_type.get("Team"):
        team_result = await db.execute(select(Team).where(Team.id.in_(object_ids_by_type["Team"])))
        for team in team_result.scalars():
            team_map[team.id] = team.name

    return [
        AuditLogResponse(
            id=log.id,
            actorUserId=log.actor_user_id,
            actorName=actor_map.get(log.actor_user_id),
            action=log.action.value,
            objectType=log.object_type,
            objectId=log.object_id,
            objectLabel=(
                lead_map.get(log.object_id)
                if log.object_type == "Lead"
                else user_map.get(log.object_id)
                if log.object_type == "User"
                else team_map.get(log.object_id)
                if log.object_type == "Team"
                else None
            ),
            diff=log.diff,
            createdAt=log.created_at.isoformat()
        )
        for log in logs
    ]
