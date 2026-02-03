"""Tests for lead status transition rules."""
import pytest

from models import Lead, LeadStatus
from services.lead_status import apply_status_transition


@pytest.mark.asyncio
async def test_valid_transition_updates_status(test_db, test_user, test_team) -> None:
    lead = Lead(
        owner_user_id=test_user.id,
        team_id=test_team.id,
        full_name="Valid Lead",
        phone="12345",
    )
    test_db.add(lead)
    await test_db.commit()
    await test_db.refresh(lead)

    await apply_status_transition(
        test_db,
        lead,
        LeadStatus.CONTACT_ESTABLISHED,
        changed_by_user_id=test_user.id,
        reason="answered",
    )

    assert lead.current_status == LeadStatus.CONTACT_ESTABLISHED


@pytest.mark.asyncio
async def test_invalid_transition_raises(test_db, test_user, test_team) -> None:
    lead = Lead(
        owner_user_id=test_user.id,
        team_id=test_team.id,
        full_name="Invalid Lead",
        phone="12345",
    )
    test_db.add(lead)
    await test_db.commit()
    await test_db.refresh(lead)

    with pytest.raises(ValueError):
        await apply_status_transition(
            test_db,
            lead,
            LeadStatus.SECOND_APPT_COMPLETED,
            changed_by_user_id=test_user.id,
        )
