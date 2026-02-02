#!/usr/bin/env python3
"""
Utility script to prepare the production .env file and SSL directory.

This automates the first items of the deployment checklist in Spec.md:
1. Copy .env.prod.example to a concrete .env.prod file with secure defaults.
2. Ensure an SSL directory exists for certificates.
"""

from __future__ import annotations

import argparse
import json
import secrets
import sys
from pathlib import Path
from typing import List, Optional


DEFAULT_TEMPLATE = Path(".env.prod.example")
DEFAULT_OUTPUT = Path(".env.prod")
DEFAULT_SSL_DIR = Path("ssl")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a production-ready .env file based on .env.prod.example.",
    )
    parser.add_argument(
        "--template",
        type=Path,
        default=DEFAULT_TEMPLATE,
        help="Path to the template .env file (default: .env.prod.example)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Target .env file to write (default: .env.prod)",
    )
    parser.add_argument(
        "--secret-key",
        dest="secret_key",
        help="Optional secret key to use instead of generating a random one.",
    )
    parser.add_argument(
        "--db-password",
        dest="db_password",
        help="Optional database password to use instead of generating a random one.",
    )
    parser.add_argument(
        "--cors-origin",
        dest="cors_origins",
        action="append",
        help="Allowed HTTPS origin (can be supplied multiple times).",
    )
    parser.add_argument(
        "--include-www",
        action="store_true",
        help="Also add https://www.<domain> for each --cors-origin that only specified the root domain.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite the output file if it already exists.",
    )
    parser.add_argument(
        "--ssl-dir",
        type=Path,
        default=DEFAULT_SSL_DIR,
        help="Directory to create for SSL certificates (default: ./ssl)",
    )
    return parser.parse_args()


def generate_secret() -> str:
    return secrets.token_hex(32)


def generate_db_password() -> str:
    return secrets.token_urlsafe(32)


def normalize_origins(origins: List[str], include_www: bool) -> List[str]:
    """Ensure every origin is an HTTPS URL and optionally add www variants."""
    normalized: List[str] = []
    for origin in origins:
        origin = origin.strip()
        if not origin:
            continue
        if not origin.startswith("http://") and not origin.startswith("https://"):
            origin = f"https://{origin}"
        if origin.startswith("http://"):
            raise ValueError(f"CORS origins must be https:// URLs, got: {origin}")
        normalized.append(origin)
        if include_www:
            try:
                scheme, rest = origin.split("://", maxsplit=1)
            except ValueError as exc:
                raise ValueError(f"Invalid origin format: {origin}") from exc
            if not rest.startswith("www."):
                normalized.append(f"{scheme}://www.{rest}")
    # Remove duplicates while preserving order
    seen = set()
    unique = []
    for value in normalized:
        if value not in seen:
            unique.append(value)
            seen.add(value)
    return unique


def extract_value(template_text: str, key: str) -> Optional[str]:
    prefix = f"{key}="
    for line in template_text.splitlines():
        stripped = line.strip()
        if stripped.startswith(prefix):
            return stripped[len(prefix) :].strip()
    return None


def apply_replacements(template_text: str, replacements: dict[str, str]) -> str:
    """Replace key=value lines in the template with provided values."""
    new_lines: List[str] = []
    for line in template_text.splitlines():
        stripped = line.strip()
        replaced = False
        for key, value in replacements.items():
            if stripped.startswith(f"{key}="):
                new_lines.append(f"{key}={value}")
                replaced = True
                break
        if not replaced:
            new_lines.append(line)
    return "\n".join(new_lines) + "\n"


def ensure_ssl_dir(ssl_dir: Path) -> None:
    ssl_dir.mkdir(parents=True, exist_ok=True)
    readme = ssl_dir / "README.md"
    if not readme.exists():
        readme.write_text(
            (
                "# SSL Certificates\n\n"
                "Place your `fullchain.pem` and `privkey.pem` files in this directory.\n"
                "These files are mounted into the nginx container defined in docker-compose.prod.yml.\n"
                "Never commit the certificates to version control.\n"
            ),
            encoding="utf-8",
        )


def main() -> int:
    args = parse_args()

    template_path = args.template
    output_path = args.output
    ssl_dir = args.ssl_dir

    if not template_path.exists():
        print(f"Template file not found: {template_path}", file=sys.stderr)
        return 1

    if output_path.exists() and not args.force:
        print(
            f"{output_path} already exists. Use --force to overwrite.",
            file=sys.stderr,
        )
        return 1

    secret_key = args.secret_key or generate_secret()
    db_password = args.db_password or generate_db_password()
    cors_origins = args.cors_origins or ["https://dashboard.example.at"]
    try:
        normalized_origins = normalize_origins(cors_origins, args.include_www)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    template_text = template_path.read_text(encoding="utf-8")
    db_user = extract_value(template_text, "DB_USER") or "onboarding"

    replacements = {
        "SECRET_KEY": secret_key,
        "DB_PASSWORD": db_password,
        "DATABASE_URL": f"postgresql+asyncpg://{db_user}:{db_password}@db:5432/onboarding",
        "CORS_ORIGINS": json.dumps(normalized_origins),
    }

    new_contents = apply_replacements(template_text, replacements)
    output_path.write_text(new_contents, encoding="utf-8")

    ensure_ssl_dir(ssl_dir)

    print(f"Generated {output_path} with secure defaults.")
    print(f"Allowed CORS origins: {', '.join(normalized_origins)}")
    print(f"SSL directory ensured at: {ssl_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
