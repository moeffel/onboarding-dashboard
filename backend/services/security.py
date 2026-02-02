"""Security utilities for input sanitization and validation."""
import re
import html
from typing import Any


def sanitize_string(value: str, max_length: int = 1000) -> str:
    """Sanitize a string input."""
    if not isinstance(value, str):
        return ""
    # Trim and limit length
    value = value.strip()[:max_length]
    # HTML escape to prevent XSS
    value = html.escape(value)
    return value


def sanitize_email(email: str) -> str:
    """Sanitize and validate email format."""
    email = email.strip().lower()[:255]
    # Basic email validation
    email_pattern = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
    if not email_pattern.match(email):
        raise ValueError("Invalid email format")
    return email


def is_safe_redirect(url: str, allowed_hosts: list[str] = None) -> bool:
    """Check if a redirect URL is safe (no open redirect vulnerability)."""
    if not url:
        return False
    # Only allow relative URLs or URLs to allowed hosts
    if url.startswith('/') and not url.startswith('//'):
        return True
    if allowed_hosts:
        for host in allowed_hosts:
            if url.startswith(f"https://{host}") or url.startswith(f"http://{host}"):
                return True
    return False


# Content Security Policy header
CSP_HEADER = "; ".join([
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",  # Tailwind needs inline styles
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'"
])

# Security headers
SECURITY_HEADERS = {
    "Content-Security-Policy": CSP_HEADER,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()"
}
