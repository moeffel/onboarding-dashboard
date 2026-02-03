"""Tests for lead event mappings."""
import pytest

from models import Lead, LeadEventMapping, EventType


@pytest.mark.asyncio
async def test_lead_event_mapping_create(test_db, test_user, test_team) -> None:
    lead = Lead(
        owner_user_id=test_user.id,
        team_id=test_team.id,
        full_name="Legacy Lead",
        phone="unknown",
    )
    test_db.add(lead)
    await test_db.commit()
    await test_db.refresh(lead)

    mapping = LeadEventMapping(
        event_type=EventType.CALL,
        event_id=123,
        lead_id=lead.id,
        mapping_version="v1",
        source="test",
    )
    test_db.add(mapping)
    await test_db.commit()
    await test_db.refresh(mapping)

    assert mapping.lead_id == lead.id
