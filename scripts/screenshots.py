#!/usr/bin/env python3
"""Regenerate the README screenshots from the running app (demo user).

One-time setup:
    pip install playwright && python -m playwright install chromium

Then, with the frontend dev server running (npm run dev in frontend/) and the
backend running (uvicorn, needed only for the live coach shot):
    python scripts/screenshots.py

Captures the demo experience so no real account or data is required. Emulates
reduced motion so charts settle deterministically instead of mid-animation.
"""
from __future__ import annotations

import pathlib
import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173"
OUT = pathlib.Path(__file__).resolve().parent.parent / "docs" / "screenshots"
VIEWPORT = {"width": 1280, "height": 900}

# (filename, nav label to click, selector to wait for before shooting)
PAGES = [
    ("dashboard.png", "Dashboard", ".style-hero"),
    ("weaknesses.png", "Weaknesses", ".weakness-list"),
    ("train.png", "Train", ".trainer-card"),
    ("style-gap.png", "Legends", ".legend-reveal"),
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport=VIEWPORT, reduced_motion="reduce", device_scale_factor=2)

        page.goto(BASE, wait_until="networkidle")
        page.get_by_role("button", name="Try demo").click()
        page.wait_for_selector(".nav-item", timeout=30_000)

        for filename, nav, wait_for in PAGES:
            page.get_by_role("button", name=nav, exact=False).click()
            page.wait_for_selector(wait_for, timeout=30_000)
            page.wait_for_timeout(900)  # let charts/rings finish
            page.screenshot(path=str(OUT / filename))
            print(f"  ✓ {filename}")

        # Coach — the README hero. Let the proactive opener resolve, then ask for
        # a specific position so the shot shows the grounded, board-rendered
        # capability. Wait for that answer to FULLY finish (no pending spinner).
        page.get_by_role("button", name="Coach", exact=False).click()
        page.wait_for_timeout(1500)
        try:
            page.wait_for_selector(".ai-thinking", state="detached", timeout=90_000)
        except Exception:
            print("  ! coach opener didn't resolve (backend running?)")
        box = page.locator(".chat-input")
        box.fill("Show me the position from my single worst blunder and what I should have played.")
        box.press("Enter")
        try:
            page.wait_for_selector(".ai-thinking", timeout=15_000)              # answer starts
            page.wait_for_selector(".ai-thinking", state="detached", timeout=120_000)  # answer done
            page.wait_for_selector(".coach-board", timeout=5_000)
            page.wait_for_timeout(1500)
        except Exception:
            print("  ! coach answer/board didn't settle; shooting current state")
        page.evaluate("document.querySelector('.chat-messages')?.scrollTo(0, document.querySelector('.chat-messages').scrollHeight)")
        page.wait_for_timeout(500)
        page.screenshot(path=str(OUT / "coach.png"))
        print("  ✓ coach.png")

        browser.close()
    print(f"\nwrote screenshots -> {OUT.relative_to(pathlib.Path.cwd())}")


if __name__ == "__main__":
    main()
