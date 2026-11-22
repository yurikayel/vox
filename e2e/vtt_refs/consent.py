"""Dismiss cookie/consent banners (reuso do capture v2)."""

from __future__ import annotations

CONSENT_SELECTORS = (
    "button:has-text('Accept')",
    "button:has-text('Aceitar')",
    "button:has-text('Agree')",
    "button:has-text('I agree')",
    "button:has-text('Accept all')",
    "button:has-text('Aceitar tudo')",
    "button:has-text('Got it')",
    "#onetrust-accept-btn-handler",
)


def dismiss_consent(page) -> None:
    for sel in CONSENT_SELECTORS:
        loc = page.locator(sel).first
        try:
            if loc.is_visible(timeout=600):
                loc.click()
                page.wait_for_timeout(400)
                return
        except Exception:
            continue