"""Seed script to create initial data for development."""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from decimal import Decimal
from datetime import datetime, timedelta
import random

from sqlalchemy.ext.asyncio import AsyncSession

from database import async_session_maker, init_db
from models import (
    User, Team, UserRole, UserStatus,
    CallEvent, CallOutcome,
    AppointmentEvent, AppointmentType, AppointmentResult,
    ClosingEvent,
    Lead, LeadStatus, LeadStatusHistory
)
from services.auth import hash_password


async def create_seed_data():
    """Create seed data for development."""
    await init_db()

    async with async_session_maker() as db:
        # Check if data already exists
        from sqlalchemy import select
        result = await db.execute(select(User))
        if result.first():
            print("Data already exists. Skipping seed.")
            return

        # Create admin
        admin = User(
            email="admin@onboarding.de",
            password_hash=hash_password("admin123"),
            first_name="System",
            last_name="Admin",
            role=UserRole.ADMIN,
            status=UserStatus.ACTIVE
        )
        db.add(admin)

        # Create teams
        teams = [
            Team(name="Team Alpha"),
            Team(name="Team Beta"),
        ]
        for team in teams:
            db.add(team)

        await db.flush()

        # Create teamleiters
        teamleiter1 = User(
            email="max.mustermann@onboarding.de",
            password_hash=hash_password("password123"),
            first_name="Max",
            last_name="Mustermann",
            role=UserRole.TEAMLEITER,
            status=UserStatus.ACTIVE,
            team_id=teams[0].id
        )
        teamleiter2 = User(
            email="anna.schmidt@onboarding.de",
            password_hash=hash_password("password123"),
            first_name="Anna",
            last_name="Schmidt",
            role=UserRole.TEAMLEITER,
            status=UserStatus.ACTIVE,
            team_id=teams[1].id
        )
        db.add(teamleiter1)
        db.add(teamleiter2)
        await db.flush()

        # Set team leads
        teams[0].lead_user_id = teamleiter1.id
        teams[1].lead_user_id = teamleiter2.id
        teams[0].name = f"Team {teamleiter1.first_name} {teamleiter1.last_name}"
        teams[1].name = f"Team {teamleiter2.first_name} {teamleiter2.last_name}"

        def normalize_email(value: str) -> str:
            return (
                value.lower()
                .replace("ä", "ae")
                .replace("ö", "oe")
                .replace("ü", "ue")
                .replace("ß", "ss")
            )

        # Create starters
        starters = []
        starter_names = [
            ("Lisa", "Müller", teams[0].id),
            ("Tom", "Weber", teams[0].id),
            ("Sarah", "Fischer", teams[0].id),
            ("Jan", "Becker", teams[1].id),
            ("Nina", "Schulz", teams[1].id),
            ("Alex", "Mueller", teams[1].id),
        ]

        for first, last, team_id in starter_names:
            starter = User(
                email=f"{normalize_email(first)}.{normalize_email(last)}@onboarding.de",
                password_hash=hash_password("password123"),
                first_name=first,
                last_name=last,
                role=UserRole.STARTER,
                status=UserStatus.ACTIVE,
                team_id=team_id
            )
            db.add(starter)
            starters.append(starter)

        await db.flush()

        # Create sample events for each starter
        call_outcomes = list(CallOutcome)
        appointment_results = list(AppointmentResult)

        for starter in starters:
            # Create sample leads for Kanban
            statuses = [
                LeadStatus.NEW_COLD,
                LeadStatus.CALL_SCHEDULED,
                LeadStatus.CONTACT_ESTABLISHED,
                LeadStatus.FIRST_APPT_SCHEDULED,
                LeadStatus.FIRST_APPT_COMPLETED,
                LeadStatus.SECOND_APPT_SCHEDULED,
                LeadStatus.SECOND_APPT_COMPLETED,
                LeadStatus.CLOSED_WON,
            ]
            for idx in range(5):
                status = random.choice(statuses)
                lead = Lead(
                    owner_user_id=starter.id,
                    team_id=starter.team_id,
                    full_name=f"Lead {starter.first_name} {idx + 1}",
                    phone=f"+43{random.randint(1000000, 9999999)}",
                    email=None,
                    current_status=status,
                    tags=["seed"],
                )
                db.add(lead)
                await db.flush()

                base_time = datetime.utcnow() - timedelta(days=random.randint(0, 10))
                db.add(
                    LeadStatusHistory(
                        lead_id=lead.id,
                        changed_by_user_id=starter.id,
                        from_status=LeadStatus.NEW_COLD,
                        to_status=LeadStatus.NEW_COLD,
                        changed_at=base_time,
                        reason="seed",
                    )
                )
                if status != LeadStatus.NEW_COLD:
                    meta = None
                    if status in {
                        LeadStatus.CALL_SCHEDULED,
                        LeadStatus.FIRST_APPT_SCHEDULED,
                        LeadStatus.SECOND_APPT_SCHEDULED,
                    }:
                        meta = {"scheduled_for": (base_time + timedelta(days=1)).isoformat()}
                    db.add(
                        LeadStatusHistory(
                            lead_id=lead.id,
                            changed_by_user_id=starter.id,
                            from_status=LeadStatus.NEW_COLD,
                            to_status=status,
                            changed_at=base_time + timedelta(hours=2),
                            reason="seed",
                            meta=meta,
                        )
                    )

            # Generate events for the last 30 days
            for days_ago in range(30):
                event_date = datetime.utcnow() - timedelta(days=days_ago)

                # Random number of calls per day (3-15)
                num_calls = random.randint(3, 15)
                for _ in range(num_calls):
                    # Weight towards answered calls
                    if random.random() < 0.35:
                        outcome = CallOutcome.ANSWERED
                    else:
                        outcome = random.choice([
                            CallOutcome.NO_ANSWER,
                            CallOutcome.BUSY,
                            CallOutcome.VOICEMAIL
                        ])

                    db.add(CallEvent(
                        user_id=starter.id,
                        datetime=event_date,
                        outcome=outcome,
                        contact_ref=f"Contact-{random.randint(1000, 9999)}"
                    ))

                # Random appointments (0-3 per day)
                num_appointments = random.randint(0, 3)
                for _ in range(num_appointments):
                    apt_type = random.choice([AppointmentType.FIRST, AppointmentType.SECOND])
                    # Most should be 'set'
                    if random.random() < 0.7:
                        result = AppointmentResult.SET
                    else:
                        result = random.choice([
                            AppointmentResult.CANCELLED,
                            AppointmentResult.COMPLETED,
                            AppointmentResult.NO_SHOW
                        ])

                    db.add(AppointmentEvent(
                        user_id=starter.id,
                        type=apt_type,
                        datetime=event_date,
                        result=result
                    ))

                # Random closings (0-2 per day, less frequent)
                if random.random() < 0.3:
                    num_closings = random.randint(0, 2)
                    for _ in range(num_closings):
                        db.add(ClosingEvent(
                            user_id=starter.id,
                            datetime=event_date,
                            units=Decimal(str(round(random.uniform(1, 20), 2))),
                            product_category=random.choice([
                                "Lebensversicherung",
                                "Unfallversicherung",
                                "Berufsunfähigkeit",
                                "Rentenversicherung"
                            ])
                        ))

        await db.commit()

        print("Seed data created successfully!")
        print("\nTest accounts:")
        print("  Admin:      admin@onboarding.de / admin123")
        print("  Teamleiter: max.mustermann@onboarding.de / password123")
        print("  Starter:    lisa.mueller@onboarding.de / password123")
        print("  Starter:    alex.mueller@onboarding.de / password123")


if __name__ == "__main__":
    asyncio.run(create_seed_data())
