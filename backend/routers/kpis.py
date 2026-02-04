"""KPIs router for retrieving calculated KPIs."""
from datetime import date, datetime, time
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User, Team, UserRole
from routers.auth import get_current_user, require_roles
from services.kpi_calculator import calculate_user_kpis, calculate_team_kpis, calculate_overall_kpis, get_period_start
from services.lead_kpis import calculate_funnel_kpis

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


class FunnelKPIsResponse(BaseModel):
    leadsCreated: int
    statusCounts: dict[str, int]
    conversions: dict[str, float]
    dropOffs: dict[str, float]
    timeMetrics: dict[str, float]


def _resolve_range(
    period: str,
    start_date: date | None,
    end_date: date | None,
) -> tuple[datetime, datetime | None]:
    if period == "custom":
        if not start_date or not end_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="start und end sind für custom erforderlich",
            )
        start_dt = datetime.combine(start_date, time.min)
        end_dt = datetime.combine(end_date, time.max)
        return start_dt, end_dt

    start_dt = get_period_start(period)
    return start_dt, None


@router.get("/me", response_model=KPIsResponse)
async def get_my_kpis(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(get_current_user),
    period: Literal["today", "week", "month", "custom"] = Query("week", description="Time period for KPIs"),
    start: date | None = Query(None, description="Custom start date (YYYY-MM-DD)"),
    end: date | None = Query(None, description="Custom end date (YYYY-MM-DD)"),
):
    """Get KPIs for the current user."""
    start_dt, end_dt = _resolve_range(period, start, end)
    kpis = await calculate_user_kpis(db, current_user.id, period, start=start_dt, end=end_dt)
    return KPIsResponse(**kpis)


@router.get("/team", response_model=TeamKPIsResponse)
async def get_team_kpis(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(require_roles(UserRole.TEAMLEITER, UserRole.ADMIN)),
    period: Literal["today", "week", "month", "custom"] = Query("week", description="Time period for KPIs"),
    start: date | None = Query(None, description="Custom start date (YYYY-MM-DD)"),
    end: date | None = Query(None, description="Custom end date (YYYY-MM-DD)"),
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

    start_dt, end_dt = _resolve_range(period, start, end)
    team_kpis = await calculate_team_kpis(db, team.id, period, start=start_dt, end=end_dt)

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


@router.get("/team/{team_id}", response_model=TeamKPIsResponse)
async def get_team_kpis_by_id(
    team_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(require_roles(UserRole.ADMIN)),
    period: Literal["today", "week", "month", "custom"] = Query("week", description="Time period for KPIs"),
    start: date | None = Query(None, description="Custom start date (YYYY-MM-DD)"),
    end: date | None = Query(None, description="Custom end date (YYYY-MM-DD)"),
):
    """Get aggregated KPIs for a specific team (Admin only)."""
    team_result = await db.execute(select(Team).where(Team.id == team_id))
    team = team_result.scalar_one_or_none()

    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team nicht gefunden"
        )

    start_dt, end_dt = _resolve_range(period, start, end)
    team_kpis = await calculate_team_kpis(db, team.id, period, start=start_dt, end=end_dt)

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
    period: Literal["today", "week", "month", "custom"] = Query("week", description="Time period for KPIs"),
    start: date | None = Query(None, description="Custom start date (YYYY-MM-DD)"),
    end: date | None = Query(None, description="Custom end date (YYYY-MM-DD)"),
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

    start_dt, end_dt = _resolve_range(period, start, end)
    kpis = await calculate_user_kpis(db, user_id, period, start=start_dt, end=end_dt)
    return KPIsResponse(**kpis)


@router.get("/journey", response_model=FunnelKPIsResponse)
async def get_journey_kpis(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(get_current_user),
    period: Literal["today", "week", "month", "custom"] = Query("week", description="Time period for KPIs"),
    start: date | None = Query(None, description="Custom start date (YYYY-MM-DD)"),
    end: date | None = Query(None, description="Custom end date (YYYY-MM-DD)"),
):
    start_dt, end_dt = _resolve_range(period, start, end)
    if current_user.role == UserRole.STARTER:
        kpis = await calculate_funnel_kpis(
            db, user_id=current_user.id, period=period, start=start_dt, end=end_dt
        )
    elif current_user.role == UserRole.TEAMLEITER:
        if current_user.team_id is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Kein Team gefunden",
            )
        kpis = await calculate_funnel_kpis(
            db, team_id=current_user.team_id, period=period, start=start_dt, end=end_dt
        )
    else:
        kpis = await calculate_funnel_kpis(db, period=period, start=start_dt, end=end_dt)
    return FunnelKPIsResponse(**kpis)


@router.get("/overview", response_model=KPIsResponse)
async def get_overall_kpis(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user = Depends(require_roles(UserRole.ADMIN)),
    period: Literal["today", "week", "month", "custom"] = Query("week", description="Time period for KPIs"),
    start: date | None = Query(None, description="Custom start date (YYYY-MM-DD)"),
    end: date | None = Query(None, description="Custom end date (YYYY-MM-DD)"),
):
    """Get aggregated KPIs across all users (Admin only)."""
    start_dt, end_dt = _resolve_range(period, start, end)
    kpis = await calculate_overall_kpis(db, period, start=start_dt, end=end_dt)
    return KPIsResponse(**kpis)
