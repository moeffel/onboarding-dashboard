import pytest
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from sqlalchemy import select

from models import (
    Lead,
    LeadStatus,
    AppointmentEvent,
    AppointmentType,
    AppointmentResult,
    CallOutcome,
)
from services.lead_status import apply_status_transition
from routers.leads import LeadStatusUpdate, update_lead_status
from routers.events import (
    CallEventCreate,
    AppointmentEventCreate,
    ClosingEventCreate,
    create_call_event,
    create_appointment_event,
    create_closing_event,
)


@pytest.mark.asyncio
async def test_gate_second_appt_requires_first_completed(test_db, test_user, test_team) -> None:
    lead = Lead(
        owner_user_id=test_user.id,
        team_id=test_team.id,
        full_name="Test Lead",
        phone="123",
        current_status=LeadStatus.CONTACT_ESTABLISHED,
    )
    test_db.add(lead)
    await test_db.commit()
    await test_db.refresh(lead)

    with pytest.raises(ValueError):
        await apply_status_transition(
            test_db,
            lead,
            LeadStatus.SECOND_APPT_SCHEDULED,
            changed_by_user_id=test_user.id,
        )


@pytest.mark.asyncio
async def test_gate_closing_requires_second_completed(test_db, test_user, test_team) -> None:
    lead = Lead(
        owner_user_id=test_user.id,
        team_id=test_team.id,
        full_name="Test Lead",
        phone="123",
        current_status=LeadStatus.FIRST_APPT_COMPLETED,
    )
    test_db.add(lead)
    await test_db.commit()
    await test_db.refresh(lead)

    with pytest.raises(ValueError):
        await apply_status_transition(
            test_db,
            lead,
            LeadStatus.CLOSED_WON,
            changed_by_user_id=test_user.id,
        )


@pytest.mark.asyncio
async def test_status_update_requires_scheduled_for(test_db, test_user, test_team) -> None:
    lead = Lead(
        owner_user_id=test_user.id,
        team_id=test_team.id,
        full_name="Test Lead",
        phone="123",
        current_status=LeadStatus.CONTACT_ESTABLISHED,
    )
    test_db.add(lead)
    await test_db.commit()
    await test_db.refresh(lead)

    payload = LeadStatusUpdate(toStatus=LeadStatus.CALL_SCHEDULED)

    with pytest.raises(HTTPException) as exc:
        await update_lead_status(
            lead_id=lead.id,
            payload=payload,
            db=test_db,
            current_user=test_user,
        )

    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_status_update_creates_appointment_event(test_db, test_user, test_team) -> None:
    lead = Lead(
        owner_user_id=test_user.id,
        team_id=test_team.id,
        full_name="Test Lead",
        phone="123",
        current_status=LeadStatus.CONTACT_ESTABLISHED,
    )
    test_db.add(lead)
    await test_db.commit()
    await test_db.refresh(lead)

    scheduled_for = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    payload = LeadStatusUpdate(
        toStatus=LeadStatus.FIRST_APPT_SCHEDULED,
        meta={"scheduled_for": scheduled_for, "location": "Telefonisch"},
    )

    await update_lead_status(
        lead_id=lead.id,
        payload=payload,
        db=test_db,
        current_user=test_user,
    )

    result = await test_db.execute(
        select(AppointmentEvent).where(AppointmentEvent.lead_id == lead.id)
    )
    event = result.scalar_one_or_none()
    assert event is not None
    assert event.type == AppointmentType.FIRST
    assert event.result == AppointmentResult.SET


@pytest.mark.asyncio
async def test_main_path_call_to_closing(test_db, test_user, test_team) -> None:
    lead = Lead(
        owner_user_id=test_user.id,
        team_id=test_team.id,
        full_name="Main Path",
        phone="123",
        current_status=LeadStatus.NEW_COLD,
    )
    test_db.add(lead)
    await test_db.commit()
    await test_db.refresh(lead)

    await create_call_event(
        event_data=CallEventCreate(outcome=CallOutcome.ANSWERED, leadId=lead.id),
        db=test_db,
        current_user=test_user,
    )
    await test_db.refresh(lead)
    assert lead.current_status == LeadStatus.CONTACT_ESTABLISHED

    first_set_time = datetime.now(timezone.utc) + timedelta(days=1)
    await create_appointment_event(
        event_data=AppointmentEventCreate(
            type=AppointmentType.FIRST,
            result=AppointmentResult.SET,
            eventDatetime=first_set_time,
            leadId=lead.id,
        ),
        db=test_db,
        current_user=test_user,
    )
    await test_db.refresh(lead)
    assert lead.current_status == LeadStatus.FIRST_APPT_SCHEDULED

    await create_appointment_event(
        event_data=AppointmentEventCreate(
            type=AppointmentType.FIRST,
            result=AppointmentResult.COMPLETED,
            leadId=lead.id,
        ),
        db=test_db,
        current_user=test_user,
    )
    await test_db.refresh(lead)
    assert lead.current_status == LeadStatus.FIRST_APPT_COMPLETED

    second_set_time = datetime.now(timezone.utc) + timedelta(days=3)
    await create_appointment_event(
        event_data=AppointmentEventCreate(
            type=AppointmentType.SECOND,
            result=AppointmentResult.SET,
            eventDatetime=second_set_time,
            leadId=lead.id,
        ),
        db=test_db,
        current_user=test_user,
    )
    await test_db.refresh(lead)
    assert lead.current_status == LeadStatus.SECOND_APPT_SCHEDULED

    await create_appointment_event(
        event_data=AppointmentEventCreate(
            type=AppointmentType.SECOND,
            result=AppointmentResult.COMPLETED,
            leadId=lead.id,
        ),
        db=test_db,
        current_user=test_user,
    )
    await test_db.refresh(lead)
    assert lead.current_status == LeadStatus.SECOND_APPT_COMPLETED

    await create_closing_event(
        event_data=ClosingEventCreate(units=10, leadId=lead.id),
        db=test_db,
        current_user=test_user,
    )
    await test_db.refresh(lead)
    assert lead.current_status == LeadStatus.CLOSED_WON
