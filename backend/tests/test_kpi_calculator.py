"""Tests for KPI calculator service."""
import pytest
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    User, CallEvent, CallOutcome,
    AppointmentEvent, AppointmentType, AppointmentResult,
    ClosingEvent
)
from services.kpi_calculator import calculate_user_kpis, get_period_start


@pytest.mark.asyncio
async def test_get_period_start_today():
    """Test period start for today."""
    start = get_period_start("today")
    now = datetime.utcnow()
    assert start.date() == now.date()
    assert start.hour == 0
    assert start.minute == 0


@pytest.mark.asyncio
async def test_get_period_start_week():
    """Test period start for week."""
    start = get_period_start("week")
    assert start.weekday() == 0  # Monday


@pytest.mark.asyncio
async def test_get_period_start_month():
    """Test period start for month."""
    start = get_period_start("month")
    assert start.day == 1


@pytest.mark.asyncio
async def test_calculate_empty_kpis(test_db: AsyncSession, test_user: User):
    """Test KPIs when no events exist."""
    kpis = await calculate_user_kpis(test_db, test_user.id, "week")

    assert kpis["callsMade"] == 0
    assert kpis["callsAnswered"] == 0
    assert kpis["pickupRate"] == 0
    assert kpis["firstAppointmentsSet"] == 0
    assert kpis["closings"] == 0


@pytest.mark.asyncio
async def test_calculate_call_kpis(test_db: AsyncSession, test_user: User):
    """Test call-related KPIs."""
    # Add call events
    test_db.add_all([
        CallEvent(user_id=test_user.id, outcome=CallOutcome.ANSWERED),
        CallEvent(user_id=test_user.id, outcome=CallOutcome.ANSWERED),
        CallEvent(user_id=test_user.id, outcome=CallOutcome.NO_ANSWER),
        CallEvent(user_id=test_user.id, outcome=CallOutcome.BUSY),
    ])
    await test_db.commit()

    kpis = await calculate_user_kpis(test_db, test_user.id, "week")

    assert kpis["callsMade"] == 4
    assert kpis["callsAnswered"] == 2
    assert kpis["pickupRate"] == 0.5


@pytest.mark.asyncio
async def test_calculate_appointment_kpis(test_db: AsyncSession, test_user: User):
    """Test appointment-related KPIs."""
    # First add some answered calls
    test_db.add_all([
        CallEvent(user_id=test_user.id, outcome=CallOutcome.ANSWERED),
        CallEvent(user_id=test_user.id, outcome=CallOutcome.ANSWERED),
        CallEvent(user_id=test_user.id, outcome=CallOutcome.ANSWERED),
        CallEvent(user_id=test_user.id, outcome=CallOutcome.ANSWERED),
    ])

    # Add appointment events
    test_db.add_all([
        AppointmentEvent(user_id=test_user.id, type=AppointmentType.FIRST, result=AppointmentResult.SET),
        AppointmentEvent(user_id=test_user.id, type=AppointmentType.FIRST, result=AppointmentResult.SET),
        AppointmentEvent(user_id=test_user.id, type=AppointmentType.FIRST, result=AppointmentResult.CANCELLED),
        AppointmentEvent(user_id=test_user.id, type=AppointmentType.SECOND, result=AppointmentResult.SET),
    ])
    await test_db.commit()

    kpis = await calculate_user_kpis(test_db, test_user.id, "week")

    assert kpis["callsAnswered"] == 4
    assert kpis["firstAppointmentsSet"] == 2
    assert kpis["firstApptRate"] == 0.5  # 2/4
    assert kpis["secondAppointmentsSet"] == 1
    assert kpis["secondApptRate"] == 0.5  # 1/2


@pytest.mark.asyncio
async def test_calculate_closing_kpis(test_db: AsyncSession, test_user: User):
    """Test closing-related KPIs."""
    from decimal import Decimal

    test_db.add_all([
        ClosingEvent(user_id=test_user.id, units=Decimal("10.5")),
        ClosingEvent(user_id=test_user.id, units=Decimal("5.0")),
        ClosingEvent(user_id=test_user.id, units=Decimal("7.5")),
    ])
    await test_db.commit()

    kpis = await calculate_user_kpis(test_db, test_user.id, "week")

    assert kpis["closings"] == 3
    assert kpis["unitsTotal"] == 23.0
    assert kpis["avgUnitsPerClosing"] == pytest.approx(7.666, rel=0.01)


@pytest.mark.asyncio
async def test_divide_by_zero_handling(test_db: AsyncSession, test_user: User):
    """Test that divide by zero doesn't crash."""
    # Add closing without any calls/appointments
    from decimal import Decimal
    test_db.add(ClosingEvent(user_id=test_user.id, units=Decimal("5")))
    await test_db.commit()

    kpis = await calculate_user_kpis(test_db, test_user.id, "week")

    # All rates should be 0, not error
    assert kpis["pickupRate"] == 0
    assert kpis["firstApptRate"] == 0
    assert kpis["secondApptRate"] == 0
    assert kpis["closings"] == 1


@pytest.mark.asyncio
async def test_period_filtering(test_db: AsyncSession, test_user: User):
    """Test that events outside period are excluded."""
    # Add event from last month
    old_date = datetime.utcnow() - timedelta(days=45)
    test_db.add(CallEvent(
        user_id=test_user.id,
        outcome=CallOutcome.ANSWERED,
        datetime=old_date
    ))

    # Add event from today
    test_db.add(CallEvent(
        user_id=test_user.id,
        outcome=CallOutcome.ANSWERED
    ))
    await test_db.commit()

    # Week should only include 1
    kpis = await calculate_user_kpis(test_db, test_user.id, "week")
    assert kpis["callsMade"] == 1
