"""KPI calculations for the Kanban journey."""
from __future__ import annotations

from datetime import datetime
from statistics import mean
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import Lead, LeadStatus, LeadStatusHistory
from services.kpi_calculator import get_period_start


def _safe_rate(numerator: int, denominator: int) -> float:
    return numerator / denominator if denominator > 0 else 0.0


async def _lead_scope_filter(
    db: AsyncSession,
    *,
    user_id: Optional[int] = None,
    team_id: Optional[int] = None,
) -> list[int]:
    stmt = select(Lead.id)
    if user_id is not None:
        stmt = stmt.where(Lead.owner_user_id == user_id)
    elif team_id is not None:
        stmt = stmt.where(Lead.team_id == team_id)
    result = await db.execute(stmt)
    return [row[0] for row in result.all()]


async def calculate_funnel_kpis(
    db: AsyncSession,
    *,
    user_id: Optional[int] = None,
    team_id: Optional[int] = None,
    period: str = "week",
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
) -> dict:
    period_start = start or get_period_start(period)

    lead_ids = await _lead_scope_filter(db, user_id=user_id, team_id=team_id)
    if not lead_ids:
        return {
            "leadsCreated": 0,
            "statusCounts": {},
            "conversions": {},
            "dropOffs": {},
            "timeMetrics": {},
        }

    period_lead_stmt = (
        select(Lead.id)
        .where(Lead.id.in_(lead_ids))
        .where(Lead.created_at >= period_start)
    )
    if end is not None:
        period_lead_stmt = period_lead_stmt.where(Lead.created_at <= end)
    period_lead_result = await db.execute(period_lead_stmt)
    lead_ids_in_period = [row[0] for row in period_lead_result.all()]
    if not lead_ids_in_period:
        return {
            "leadsCreated": 0,
            "statusCounts": {},
            "conversions": {},
            "dropOffs": {},
            "timeMetrics": {},
        }

    leads_created_stmt = (
        select(func.count(Lead.id))
        .where(Lead.id.in_(lead_ids_in_period))
    )
    leads_created_result = await db.execute(leads_created_stmt)
    leads_created = leads_created_result.scalar() or 0

    history_stmt = (
        select(LeadStatusHistory.to_status, func.count(func.distinct(LeadStatusHistory.lead_id)))
        .where(LeadStatusHistory.lead_id.in_(lead_ids_in_period))
        .where(LeadStatusHistory.changed_at >= period_start)
        .where(LeadStatusHistory.to_status.is_not(None))
        .group_by(LeadStatusHistory.to_status)
    )
    if end is not None:
        history_stmt = history_stmt.where(LeadStatusHistory.changed_at <= end)
    history_result = await db.execute(history_stmt)
    status_counts = {row[0].value: row[1] for row in history_result.all()}

    def count_status(status: LeadStatus) -> int:
        return status_counts.get(status.value, 0)

    conversions = {
        "contactRate": _safe_rate(
            count_status(LeadStatus.CONTACT_ESTABLISHED),
            leads_created,
        ),
        "firstApptRate": _safe_rate(
            count_status(LeadStatus.FIRST_APPT_SCHEDULED),
            count_status(LeadStatus.CONTACT_ESTABLISHED),
        ),
        "firstApptShowRate": _safe_rate(
            count_status(LeadStatus.FIRST_APPT_COMPLETED),
            count_status(LeadStatus.FIRST_APPT_SCHEDULED),
        ),
        "secondApptRate": _safe_rate(
            count_status(LeadStatus.SECOND_APPT_SCHEDULED),
            count_status(LeadStatus.FIRST_APPT_COMPLETED),
        ),
        "secondApptShowRate": _safe_rate(
            count_status(LeadStatus.SECOND_APPT_COMPLETED),
            count_status(LeadStatus.SECOND_APPT_SCHEDULED),
        ),
        "closingRate": _safe_rate(
            count_status(LeadStatus.CLOSED_WON),
            count_status(LeadStatus.SECOND_APPT_COMPLETED),
        ),
    }

    reason_stmt = (
        select(LeadStatusHistory.reason, func.count(func.distinct(LeadStatusHistory.lead_id)))
        .where(LeadStatusHistory.lead_id.in_(lead_ids_in_period))
        .where(LeadStatusHistory.changed_at >= period_start)
        .group_by(LeadStatusHistory.reason)
    )
    if end is not None:
        reason_stmt = reason_stmt.where(LeadStatusHistory.changed_at <= end)
    reason_result = await db.execute(reason_stmt)
    reason_counts = {row[0]: row[1] for row in reason_result.all() if row[0]}

    drop_offs = {
        "callDeclineRate": _safe_rate(
            reason_counts.get("wrong_number", 0) + reason_counts.get("call_declined", 0),
            count_status(LeadStatus.NEW_COLD),
        ),
        "firstApptDeclineRate": _safe_rate(
            reason_counts.get("first_appt_declined", 0),
            count_status(LeadStatus.FIRST_APPT_SCHEDULED),
        ),
        "secondApptDeclineRate": _safe_rate(
            reason_counts.get("second_appt_declined", 0),
            count_status(LeadStatus.SECOND_APPT_SCHEDULED),
        ),
        "noShowRateFirst": _safe_rate(
            reason_counts.get("no_show_first", 0),
            count_status(LeadStatus.FIRST_APPT_SCHEDULED),
        ),
        "noShowRateSecond": _safe_rate(
            reason_counts.get("no_show_second", 0),
            count_status(LeadStatus.SECOND_APPT_SCHEDULED),
        ),
        "rescheduleRateFirst": _safe_rate(
            reason_counts.get("rescheduled_first", 0),
            count_status(LeadStatus.FIRST_APPT_SCHEDULED),
        ),
        "rescheduleRateSecond": _safe_rate(
            reason_counts.get("rescheduled_second", 0),
            count_status(LeadStatus.SECOND_APPT_SCHEDULED),
        ),
    }

    time_metrics = await calculate_time_metrics(
        db,
        lead_ids=lead_ids_in_period,
        period_start=period_start,
        period_end=end,
    )

    return {
        "leadsCreated": leads_created,
        "statusCounts": status_counts,
        "conversions": conversions,
        "dropOffs": drop_offs,
        "timeMetrics": time_metrics,
    }


async def calculate_time_metrics(
    db: AsyncSession,
    *,
    lead_ids: list[int],
    period_start: datetime,
    period_end: Optional[datetime] = None,
) -> dict:
    if not lead_ids:
        return {}

    lead_stmt = select(Lead).where(Lead.id.in_(lead_ids)).where(Lead.created_at >= period_start)
    if period_end is not None:
        lead_stmt = lead_stmt.where(Lead.created_at <= period_end)
    lead_result = await db.execute(lead_stmt)
    leads = lead_result.scalars().all()
    if not leads:
        return {}

    history_stmt = (
        select(LeadStatusHistory)
        .where(LeadStatusHistory.lead_id.in_(lead_ids))
        .where(LeadStatusHistory.changed_at >= period_start)
        .order_by(LeadStatusHistory.lead_id, LeadStatusHistory.changed_at)
    )
    if period_end is not None:
        history_stmt = history_stmt.where(LeadStatusHistory.changed_at <= period_end)
    history_result = await db.execute(history_stmt)
    histories = history_result.scalars().all()

    history_by_lead: dict[int, list[LeadStatusHistory]] = {}
    for history in histories:
        history_by_lead.setdefault(history.lead_id, []).append(history)

    def hours_between(start: datetime, end: datetime) -> Optional[float]:
        if end < start:
            return None
        return (end - start).total_seconds() / 3600.0

    time_to_first_contact = []
    time_to_first_appt = []
    time_to_second_appt = []
    time_to_closing = []

    time_in_status: dict[str, list[float]] = {}

    for lead in leads:
        lead_history = history_by_lead.get(lead.id, [])
        if not lead_history:
            continue

        status_times: dict[LeadStatus, datetime] = {}
        for entry in lead_history:
            status_times.setdefault(entry.to_status, entry.changed_at)

        if LeadStatus.CONTACT_ESTABLISHED in status_times:
            value = hours_between(lead.created_at, status_times[LeadStatus.CONTACT_ESTABLISHED])
            if value is not None:
                time_to_first_contact.append(value)
        if LeadStatus.FIRST_APPT_SCHEDULED in status_times:
            value = hours_between(lead.created_at, status_times[LeadStatus.FIRST_APPT_SCHEDULED])
            if value is not None:
                time_to_first_appt.append(value)
        if (
            LeadStatus.FIRST_APPT_COMPLETED in status_times
            and LeadStatus.SECOND_APPT_SCHEDULED in status_times
        ):
            value = hours_between(
                    status_times[LeadStatus.FIRST_APPT_COMPLETED],
                    status_times[LeadStatus.SECOND_APPT_SCHEDULED],
                )
            if value is not None:
                time_to_second_appt.append(value)
        if (
            LeadStatus.SECOND_APPT_COMPLETED in status_times
            and LeadStatus.CLOSED_WON in status_times
        ):
            value = hours_between(
                    status_times[LeadStatus.SECOND_APPT_COMPLETED],
                    status_times[LeadStatus.CLOSED_WON],
                )
            if value is not None:
                time_to_closing.append(value)

        for idx, entry in enumerate(lead_history[:-1]):
            next_entry = lead_history[idx + 1]
            duration = hours_between(entry.changed_at, next_entry.changed_at)
            if duration is None:
                continue
            key = f"avg_time_in_status_{entry.to_status.value}"
            time_in_status.setdefault(key, []).append(duration)

    def average(values: list[float]) -> float:
        return mean(values) if values else 0.0

    metrics = {
        "avgTimeToFirstContactHours": average(time_to_first_contact),
        "avgTimeToFirstApptHours": average(time_to_first_appt),
        "avgTimeToSecondApptHours": average(time_to_second_appt),
        "avgTimeToClosingHours": average(time_to_closing),
    }

    for key, values in time_in_status.items():
        metrics[f"{key}Hours"] = average(values)

    return metrics
