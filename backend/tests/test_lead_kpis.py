"""Tests for funnel KPI calculations."""
import pytest

from models import Lead, LeadStatus, LeadStatusHistory
from services.lead_kpis import calculate_funnel_kpis


@pytest.mark.asyncio
async def test_funnel_kpis_basic(test_db, test_user, test_team) -> None:
    lead = Lead(
        owner_user_id=test_user.id,
        team_id=test_team.id,
        full_name="Funnel Lead",
        phone="12345",
        current_status=LeadStatus.CONTACT_ESTABLISHED,
    )
    test_db.add(lead)
    await test_db.commit()
    await test_db.refresh(lead)

    test_db.add(
        LeadStatusHistory(
            lead_id=lead.id,
            changed_by_user_id=test_user.id,
            from_status=LeadStatus.NEW_COLD,
            to_status=LeadStatus.NEW_COLD,
        )
    )
    test_db.add(
        LeadStatusHistory(
            lead_id=lead.id,
            changed_by_user_id=test_user.id,
            from_status=LeadStatus.NEW_COLD,
            to_status=LeadStatus.CONTACT_ESTABLISHED,
        )
    )
    await test_db.commit()

    kpis = await calculate_funnel_kpis(test_db, user_id=test_user.id, period="week")
    assert kpis["statusCounts"]["contact_established"] >= 1
    assert kpis["conversions"]["contactRate"] >= 1
