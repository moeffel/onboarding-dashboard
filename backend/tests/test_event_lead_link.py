"""Tests for optional lead_id on events."""
import pytest

from models import Lead, CallEvent, CallOutcome


@pytest.mark.asyncio
async def test_call_event_can_reference_lead(test_db, test_user, test_team) -> None:
    lead = Lead(
        owner_user_id=test_user.id,
        team_id=test_team.id,
        full_name="Erika Musterfrau",
        phone="+4311111111",
    )
    test_db.add(lead)
    await test_db.commit()
    await test_db.refresh(lead)

    event = CallEvent(
        user_id=test_user.id,
        lead_id=lead.id,
        outcome=CallOutcome.ANSWERED,
    )
    test_db.add(event)
    await test_db.commit()
    await test_db.refresh(event)

    assert event.lead_id == lead.id
