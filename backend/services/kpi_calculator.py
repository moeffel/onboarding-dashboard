"""KPI calculation service."""
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    CallEvent, CallOutcome,
    AppointmentEvent, AppointmentType, AppointmentResult,
    ClosingEvent, ClosingResult,
    User
)


def get_period_start(period: str) -> datetime:
    """Get the start datetime for a given period."""
    now = datetime.utcnow()
    if period == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        # Start of current week (Monday)
        days_since_monday = now.weekday()
        return (now - timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "month":
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        raise ValueError(f"Unknown period: {period}")


def _apply_range_filter(stmt, column, start: datetime, end: Optional[datetime]):
    stmt = stmt.where(column >= start)
    if end is not None:
        stmt = stmt.where(column <= end)
    return stmt


async def calculate_user_kpis(
    db: AsyncSession,
    user_id: int,
    period: str = "week",
    *,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
) -> dict:
    """Calculate KPIs for a single user."""
    period_start = start or get_period_start(period)

    # Calls
    calls_stmt = select(func.count(CallEvent.id)).where(CallEvent.user_id == user_id)
    calls_stmt = _apply_range_filter(calls_stmt, CallEvent.datetime, period_start, end)
    calls_made_result = await db.execute(calls_stmt)
    calls_made = calls_made_result.scalar() or 0

    calls_answered_stmt = (
        select(func.count(CallEvent.id))
        .where(CallEvent.user_id == user_id)
        .where(CallEvent.outcome == CallOutcome.ANSWERED)
    )
    calls_answered_stmt = _apply_range_filter(
        calls_answered_stmt, CallEvent.datetime, period_start, end
    )
    calls_answered_result = await db.execute(calls_answered_stmt)
    calls_answered = calls_answered_result.scalar() or 0

    pickup_rate = calls_answered / calls_made if calls_made > 0 else 0

    # First appointments
    first_appts_stmt = (
        select(func.count(func.distinct(AppointmentEvent.lead_id)))
        .where(AppointmentEvent.user_id == user_id)
        .where(AppointmentEvent.lead_id.is_not(None))
        .where(AppointmentEvent.type == AppointmentType.FIRST)
        .where(AppointmentEvent.result == AppointmentResult.SET)
    )
    first_appts_stmt = _apply_range_filter(
        first_appts_stmt, AppointmentEvent.datetime, period_start, end
    )
    first_appts_set_result = await db.execute(first_appts_stmt)
    first_appointments_set = first_appts_set_result.scalar() or 0

    first_appts_null_stmt = (
        select(func.count(AppointmentEvent.id))
        .where(AppointmentEvent.user_id == user_id)
        .where(AppointmentEvent.lead_id.is_(None))
        .where(AppointmentEvent.type == AppointmentType.FIRST)
        .where(AppointmentEvent.result == AppointmentResult.SET)
    )
    first_appts_null_stmt = _apply_range_filter(
        first_appts_null_stmt, AppointmentEvent.datetime, period_start, end
    )
    first_appts_null_result = await db.execute(first_appts_null_stmt)
    first_appointments_set += first_appts_null_result.scalar() or 0

    first_appt_rate = first_appointments_set / calls_answered if calls_answered > 0 else 0

    # Second appointments
    second_appts_stmt = (
        select(func.count(func.distinct(AppointmentEvent.lead_id)))
        .where(AppointmentEvent.user_id == user_id)
        .where(AppointmentEvent.lead_id.is_not(None))
        .where(AppointmentEvent.type == AppointmentType.SECOND)
        .where(AppointmentEvent.result == AppointmentResult.SET)
    )
    second_appts_stmt = _apply_range_filter(
        second_appts_stmt, AppointmentEvent.datetime, period_start, end
    )
    second_appts_set_result = await db.execute(second_appts_stmt)
    second_appointments_set = second_appts_set_result.scalar() or 0

    second_appts_null_stmt = (
        select(func.count(AppointmentEvent.id))
        .where(AppointmentEvent.user_id == user_id)
        .where(AppointmentEvent.lead_id.is_(None))
        .where(AppointmentEvent.type == AppointmentType.SECOND)
        .where(AppointmentEvent.result == AppointmentResult.SET)
    )
    second_appts_null_stmt = _apply_range_filter(
        second_appts_null_stmt, AppointmentEvent.datetime, period_start, end
    )
    second_appts_null_result = await db.execute(second_appts_null_stmt)
    second_appointments_set += second_appts_null_result.scalar() or 0

    second_appt_rate = second_appointments_set / first_appointments_set if first_appointments_set > 0 else 0

    # Closings
    closings_stmt = (
        select(func.count(ClosingEvent.id))
        .where(ClosingEvent.user_id == user_id)
        .where(ClosingEvent.result == ClosingResult.WON)
    )
    closings_stmt = _apply_range_filter(closings_stmt, ClosingEvent.datetime, period_start, end)
    closings_result = await db.execute(closings_stmt)
    closings = closings_result.scalar() or 0

    units_stmt = (
        select(func.sum(ClosingEvent.units))
        .where(ClosingEvent.user_id == user_id)
        .where(ClosingEvent.result == ClosingResult.WON)
    )
    units_stmt = _apply_range_filter(units_stmt, ClosingEvent.datetime, period_start, end)
    units_result = await db.execute(units_stmt)
    units_total = float(units_result.scalar() or Decimal(0))

    avg_units_per_closing = units_total / closings if closings > 0 else 0

    return {
        "callsMade": calls_made,
        "callsAnswered": calls_answered,
        "pickupRate": pickup_rate,
        "firstAppointmentsSet": first_appointments_set,
        "firstApptRate": first_appt_rate,
        "secondAppointmentsSet": second_appointments_set,
        "secondApptRate": second_appt_rate,
        "closings": closings,
        "unitsTotal": units_total,
        "avgUnitsPerClosing": avg_units_per_closing
    }


async def calculate_team_kpis(
    db: AsyncSession,
    team_id: int,
    period: str = "week",
    *,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
) -> dict:
    """Calculate aggregated KPIs for a team."""
    # Get all team members
    members_result = await db.execute(
        select(User)
        .where(User.team_id == team_id)
    )
    members = members_result.scalars().all()

    if not members:
        return {
            "aggregated": {
                "callsMade": 0,
                "callsAnswered": 0,
                "pickupRate": 0,
                "firstAppointmentsSet": 0,
                "firstApptRate": 0,
                "secondAppointmentsSet": 0,
                "secondApptRate": 0,
                "closings": 0,
                "unitsTotal": 0,
                "avgUnitsPerClosing": 0
            },
            "members": []
        }

    # Calculate KPIs for each member
    member_kpis = []
    totals = {
        "callsMade": 0,
        "callsAnswered": 0,
        "firstAppointmentsSet": 0,
        "secondAppointmentsSet": 0,
        "closings": 0,
        "unitsTotal": 0
    }

    for member in members:
        kpis = await calculate_user_kpis(db, member.id, period, start=start, end=end)
        member_kpis.append({
            "userId": member.id,
            "firstName": member.first_name,
            "lastName": member.last_name,
            "kpis": kpis
        })

        # Aggregate totals
        totals["callsMade"] += kpis["callsMade"]
        totals["callsAnswered"] += kpis["callsAnswered"]
        totals["firstAppointmentsSet"] += kpis["firstAppointmentsSet"]
        totals["secondAppointmentsSet"] += kpis["secondAppointmentsSet"]
        totals["closings"] += kpis["closings"]
        totals["unitsTotal"] += kpis["unitsTotal"]

    # Calculate aggregated rates
    aggregated = {
        "callsMade": totals["callsMade"],
        "callsAnswered": totals["callsAnswered"],
        "pickupRate": totals["callsAnswered"] / totals["callsMade"] if totals["callsMade"] > 0 else 0,
        "firstAppointmentsSet": totals["firstAppointmentsSet"],
        "firstApptRate": totals["firstAppointmentsSet"] / totals["callsAnswered"] if totals["callsAnswered"] > 0 else 0,
        "secondAppointmentsSet": totals["secondAppointmentsSet"],
        "secondApptRate": totals["secondAppointmentsSet"] / totals["firstAppointmentsSet"] if totals["firstAppointmentsSet"] > 0 else 0,
        "closings": totals["closings"],
        "unitsTotal": totals["unitsTotal"],
        "avgUnitsPerClosing": totals["unitsTotal"] / totals["closings"] if totals["closings"] > 0 else 0
    }

    return {
        "aggregated": aggregated,
        "members": member_kpis
    }


async def calculate_overall_kpis(
    db: AsyncSession,
    period: str = "week",
    *,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
) -> dict:
    """Calculate aggregated KPIs across all users."""
    members_result = await db.execute(select(User))
    members = members_result.scalars().all()

    if not members:
        return {
            "callsMade": 0,
            "callsAnswered": 0,
            "pickupRate": 0,
            "firstAppointmentsSet": 0,
            "firstApptRate": 0,
            "secondAppointmentsSet": 0,
            "secondApptRate": 0,
            "closings": 0,
            "unitsTotal": 0,
            "avgUnitsPerClosing": 0,
        }

    totals = {
        "callsMade": 0,
        "callsAnswered": 0,
        "firstAppointmentsSet": 0,
        "secondAppointmentsSet": 0,
        "closings": 0,
        "unitsTotal": 0,
    }

    for member in members:
        kpis = await calculate_user_kpis(db, member.id, period, start=start, end=end)
        totals["callsMade"] += kpis["callsMade"]
        totals["callsAnswered"] += kpis["callsAnswered"]
        totals["firstAppointmentsSet"] += kpis["firstAppointmentsSet"]
        totals["secondAppointmentsSet"] += kpis["secondAppointmentsSet"]
        totals["closings"] += kpis["closings"]
        totals["unitsTotal"] += kpis["unitsTotal"]

    return {
        "callsMade": totals["callsMade"],
        "callsAnswered": totals["callsAnswered"],
        "pickupRate": totals["callsAnswered"] / totals["callsMade"] if totals["callsMade"] > 0 else 0,
        "firstAppointmentsSet": totals["firstAppointmentsSet"],
        "firstApptRate": totals["firstAppointmentsSet"] / totals["callsAnswered"] if totals["callsAnswered"] > 0 else 0,
        "secondAppointmentsSet": totals["secondAppointmentsSet"],
        "secondApptRate": totals["secondAppointmentsSet"] / totals["firstAppointmentsSet"] if totals["firstAppointmentsSet"] > 0 else 0,
        "closings": totals["closings"],
        "unitsTotal": totals["unitsTotal"],
        "avgUnitsPerClosing": totals["unitsTotal"] / totals["closings"] if totals["closings"] > 0 else 0,
    }
