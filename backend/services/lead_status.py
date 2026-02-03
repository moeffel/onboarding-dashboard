"""Lead status transition rules and history writer."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from models import Lead, LeadStatus, LeadStatusHistory


ALLOWED_TRANSITIONS: dict[LeadStatus, set[LeadStatus]] = {
    LeadStatus.NEW_COLD: {
        LeadStatus.CALL_SCHEDULED,
        LeadStatus.CONTACT_ESTABLISHED,
        LeadStatus.CLOSED_LOST,
    },
    LeadStatus.CALL_SCHEDULED: {
        LeadStatus.CALL_SCHEDULED,
        LeadStatus.CONTACT_ESTABLISHED,
        LeadStatus.CLOSED_LOST,
    },
    LeadStatus.CONTACT_ESTABLISHED: {
        LeadStatus.FIRST_APPT_PENDING,
        LeadStatus.FIRST_APPT_SCHEDULED,
        LeadStatus.CALL_SCHEDULED,
        LeadStatus.CLOSED_LOST,
    },
    LeadStatus.FIRST_APPT_PENDING: {
        LeadStatus.FIRST_APPT_SCHEDULED,
        LeadStatus.CALL_SCHEDULED,
        LeadStatus.CLOSED_LOST,
    },
    LeadStatus.FIRST_APPT_SCHEDULED: {
        LeadStatus.FIRST_APPT_SCHEDULED,
        LeadStatus.FIRST_APPT_COMPLETED,
        LeadStatus.CLOSED_LOST,
    },
    LeadStatus.FIRST_APPT_COMPLETED: {
        LeadStatus.SECOND_APPT_SCHEDULED,
        LeadStatus.CALL_SCHEDULED,
        LeadStatus.CLOSED_LOST,
    },
    LeadStatus.SECOND_APPT_SCHEDULED: {
        LeadStatus.SECOND_APPT_SCHEDULED,
        LeadStatus.SECOND_APPT_COMPLETED,
        LeadStatus.CLOSED_LOST,
    },
    LeadStatus.SECOND_APPT_COMPLETED: {
        LeadStatus.CLOSED_WON,
        LeadStatus.CLOSED_LOST,
    },
    LeadStatus.CLOSED_WON: {LeadStatus.CLOSED_WON},
    LeadStatus.CLOSED_LOST: {LeadStatus.CLOSED_LOST},
}


def is_transition_allowed(current: LeadStatus, target: LeadStatus) -> bool:
    """Check if a transition is allowed."""
    if current == target:
        return True
    return target in ALLOWED_TRANSITIONS.get(current, set())


async def apply_status_transition(
    db: AsyncSession,
    lead: Lead,
    to_status: LeadStatus,
    *,
    changed_by_user_id: Optional[int],
    reason: Optional[str] = None,
    meta: Optional[dict] = None,
    changed_at: Optional[datetime] = None,
) -> LeadStatusHistory:
    """Validate and apply a lead status transition, writing history."""
    if not is_transition_allowed(lead.current_status, to_status):
        raise ValueError(
            f"Transition {lead.current_status.value} -> {to_status.value} not allowed"
        )

    event_time = changed_at or datetime.utcnow()

    history = LeadStatusHistory(
        lead_id=lead.id,
        changed_by_user_id=changed_by_user_id,
        from_status=lead.current_status,
        to_status=to_status,
        changed_at=event_time,
        reason=reason,
        meta=meta,
    )
    db.add(history)

    if lead.current_status != to_status:
        lead.current_status = to_status
        lead.status_updated_at = event_time

    lead.last_activity_at = event_time
    await db.flush()
    return history
