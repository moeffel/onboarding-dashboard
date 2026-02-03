"""Backfill leads from legacy call events using contact_ref."""
import argparse
import asyncio
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select

from database import async_session_maker, init_db
from models import (
    CallEvent,
    Lead,
    LeadStatus,
    LeadEventMapping,
    EventType,
    User,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backfill leads from call events.")
    parser.add_argument(
        "--version",
        default="2026-02-02_initial",
        help="Mapping version to record in lead_event_mappings.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run without committing changes.",
    )
    return parser.parse_args()


def build_legacy_lead_fields(contact_ref: str, user_id: int) -> tuple[str, str, str]:
    normalized = contact_ref.strip()
    digits = re.sub(r"\\D", "", normalized)
    if len(digits) >= 6:
        phone = normalized
        full_name = f"Legacy Lead {normalized}"
        heuristic = "contact_ref_phone"
    else:
        phone = "unknown"
        full_name = normalized[:200] if normalized else f"Legacy Lead {user_id}"
        heuristic = "contact_ref_name"
    return full_name, phone, heuristic


async def backfill() -> None:
    args = parse_args()
    await init_db()

    async with async_session_maker() as db:
        stmt = (
            select(CallEvent)
            .where(CallEvent.lead_id.is_(None))
            .where(CallEvent.contact_ref.is_not(None))
        )
        result = await db.execute(stmt)
        events = result.scalars().all()
        if not events:
            print("No call events to backfill.")
            return

        groups: dict[tuple[int, str], list[CallEvent]] = {}
        for event in events:
            contact_ref = event.contact_ref.strip() if event.contact_ref else ""
            if not contact_ref:
                continue
            groups.setdefault((event.user_id, contact_ref), []).append(event)

        if not groups:
            print("No call events with contact_ref to backfill.")
            return

        user_ids = {user_id for user_id, _ in groups.keys()}
        user_result = await db.execute(select(User).where(User.id.in_(user_ids)))
        users = {user.id: user for user in user_result.scalars()}

        event_ids = [event.id for event in events]
        mapping_result = await db.execute(
            select(LeadEventMapping.event_id)
            .where(LeadEventMapping.event_type == EventType.CALL)
            .where(LeadEventMapping.mapping_version == args.version)
            .where(LeadEventMapping.event_id.in_(event_ids))
        )
        mapped_event_ids = set(mapping_result.scalars().all())

        created_leads = 0
        mapped_events = 0
        skipped_events = 0

        for (user_id, contact_ref), grouped_events in groups.items():
            user = users.get(user_id)
            if not user or user.team_id is None:
                skipped_events += len(grouped_events)
                continue

            full_name, phone, heuristic = build_legacy_lead_fields(contact_ref, user_id)
            lead_result = await db.execute(
                select(Lead)
                .where(Lead.owner_user_id == user_id)
                .where(Lead.phone == phone)
                .where(Lead.full_name == full_name)
            )
            lead = lead_result.scalars().first()
            if not lead:
                lead = Lead(
                    owner_user_id=user_id,
                    team_id=user.team_id,
                    full_name=full_name,
                    phone=phone,
                    current_status=LeadStatus.NEW_COLD,
                    tags=["legacy_migrated"],
                    note=f"Imported from legacy contact_ref: {contact_ref}",
                )
                db.add(lead)
                await db.flush()
                created_leads += 1

            for event in grouped_events:
                event.lead_id = lead.id
                if event.id not in mapped_event_ids:
                    db.add(
                        LeadEventMapping(
                            event_type=EventType.CALL,
                            event_id=event.id,
                            lead_id=lead.id,
                            mapping_version=args.version,
                            source="auto_contact_ref",
                            meta={"contact_ref": contact_ref, "heuristic": heuristic},
                        )
                    )
                mapped_events += 1

        if args.dry_run:
            await db.rollback()
            print(
                "Dry run complete. "
                f"Would create {created_leads} leads and map {mapped_events} events "
                f"(skipped {skipped_events})."
            )
        else:
            await db.commit()
            print(
                f"Backfill complete. Created {created_leads} leads and mapped "
                f"{mapped_events} events (skipped {skipped_events})."
            )


if __name__ == "__main__":
    asyncio.run(backfill())
