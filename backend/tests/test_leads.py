"""Tests for lead and lead status history models."""
import pytest

from models import Lead, LeadStatus, LeadStatusHistory


@pytest.mark.asyncio
async def test_lead_and_status_history_creation(test_db, test_user, test_team) -> None:
    lead = Lead(
        owner_user_id=test_user.id,
        team_id=test_team.id,
        full_name="Max Mustermann",
        phone="+4312345678",
        email=None,
    )
    test_db.add(lead)
    await test_db.commit()
    await test_db.refresh(lead)

    assert lead.id is not None
    assert lead.current_status == LeadStatus.NEW_COLD
    assert lead.tags == []

    history = LeadStatusHistory(
        lead_id=lead.id,
        changed_by_user_id=test_user.id,
        from_status=LeadStatus.NEW_COLD,
        to_status=LeadStatus.CONTACT_ESTABLISHED,
        reason="answered",
    )
    test_db.add(history)
    await test_db.commit()
    await test_db.refresh(history)

    assert history.id is not None
    assert history.lead_id == lead.id
