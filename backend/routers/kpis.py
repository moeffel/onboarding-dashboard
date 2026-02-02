"""KPIs router for retrieving calculated KPIs."""
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User, Team, UserRole
from routers.auth import get_current_user, require_roles
from services.kpi_calculator import calculate_user_kpis, calculate_team_kpis

router = APIRouter(prefix="/kpis", tags=["kpis"])


class KPIsResponse(BaseModel):
    """KPIs response schema."""
    callsMade: int
    callsAnswered: int
    pickupRate: float
    firstAppointmentsSet: int
    firstApptRate: float
    secondAppointmentsSet: int
    secondApptRate: float
    closings: int
    unitsTotal: float
    avgUnitsPerClosing: float


class MemberKPIsResponse(BaseModel):
    """Team member KPIs response."""
    userId: int
    firstName: str
    lastName: str
    kpis: KPIsResponse


class TeamKPIsResponse(BaseModel):
    """Team KPIs response schema."""
    teamName: str
    aggregated: KPIsResponse
    members: list[MemberKPIsResponse]


@router.get("/me", response_model=KPIsResponse)
async def get_my_kpis(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(get_current_user),
    period: Literal["today", "week", "month"] = Query("week", description="Time period for KPIs")
):
    """Get KPIs for the current user."""
    kpis = await calculate_user_kpis(db, current_user.id, period)
    return KPIsResponse(**kpis)


@router.get("/team", response_model=TeamKPIsResponse)
async def get_team_kpis(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(require_roles(UserRole.TEAMLEITER, UserRole.ADMIN)),
    period: Literal["today", "week", "month"] = Query("week", description="Time period for KPIs")
):
    """Get aggregated KPIs for the current user's team."""
    # Get the team
    if current_user.role == UserRole.ADMIN:
        # Admin can see all teams, for now return first team or team from query
        team_result = await db.execute(select(Team).limit(1))
        team = team_result.scalar_one_or_none()
    else:
        # Teamleiter sees their own team
        team_result = await db.execute(
            select(Team).where(Team.lead_user_id == current_user.id)
        )
        team = team_result.scalar_one_or_none()

    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kein Team gefunden"
        )

    team_kpis = await calculate_team_kpis(db, team.id, period)

    return TeamKPIsResponse(
        teamName=team.name,
        aggregated=KPIsResponse(**team_kpis["aggregated"]),
        members=[
            MemberKPIsResponse(
                userId=m["userId"],
                firstName=m["firstName"],
                lastName=m["lastName"],
                kpis=KPIsResponse(**m["kpis"])
            )
            for m in team_kpis["members"]
        ]
    )


@router.get("/user/{user_id}", response_model=KPIsResponse)
async def get_user_kpis(
    user_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(require_roles(UserRole.TEAMLEITER, UserRole.ADMIN)),
    period: Literal["today", "week", "month"] = Query("week", description="Time period for KPIs")
):
    """Get KPIs for a specific user (Teamleiter/Admin only)."""
    # Check if user exists
    user_result = await db.execute(select(User).where(User.id == user_id))
    target_user = user_result.scalar_one_or_none()

    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Benutzer nicht gefunden"
        )

    # Teamleiter can only view their team members
    if current_user.role == UserRole.TEAMLEITER:
        team_result = await db.execute(
            select(Team).where(Team.lead_user_id == current_user.id)
        )
        team = team_result.scalar_one_or_none()

        if not team or target_user.team_id != team.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Keine Berechtigung für diesen Benutzer"
            )

    kpis = await calculate_user_kpis(db, user_id, period)
    return KPIsResponse(**kpis)
