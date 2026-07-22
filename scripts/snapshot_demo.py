#!/usr/bin/env python3
"""Regenerate the bundled demo snapshot.

The demo user's data is static (seeded fixtures), so the frontend serves it from
frontend/src/demo/snapshot.json instead of hitting the backend — making the demo
load instantly and work even when the free-tier server is asleep. Only the live
AI coach still needs the backend.

Run this after changing demo fixtures, the style axes, or any demo read-endpoint:

    python3 scripts/snapshot_demo.py                     # uses the deployed backend
    BACKEND=http://localhost:8000 python3 scripts/snapshot_demo.py

Then commit the updated frontend/src/demo/snapshot.json.
"""
import json
import os
import sys
import urllib.error
import urllib.request

BACKEND = os.environ.get("BACKEND", "https://morphy-api.onrender.com").rstrip("/")
OUT = os.path.join(os.path.dirname(__file__), "..", "frontend", "src", "demo", "snapshot.json")

TCS = ["", "bullet", "blitz", "rapid", "classical"]  # "" == all (no query)
GMS = ["morphy", "tal", "fischer", "kasparov", "carlsen"]


def with_tc(base, tc):
    return base if not tc else f"{base}?tc={tc}"


def paths():
    for tc in TCS:
        yield with_tc("/profile/demo", tc)
        yield with_tc("/openings/demo", tc)
        yield with_tc("/blunders/demo", tc)
        yield with_tc("/timeline/demo", tc)
    yield "/gms"
    for gm in GMS:
        yield f"/style-gap/demo?gm={gm}"


def main():
    # Warm the instance first (a cold free-tier boot can take up to a minute).
    try:
        urllib.request.urlopen(BACKEND + "/health", timeout=90).read()
    except Exception as exc:
        print(f"warning: health check failed ({exc}); continuing anyway")

    snap = {}
    for p in paths():
        try:
            with urllib.request.urlopen(BACKEND + p, timeout=60) as r:
                snap[p] = json.load(r)
            print(f"  OK   {p}")
        except urllib.error.HTTPError as e:
            print(f"  SKIP {p}  (HTTP {e.code})")
        except Exception as e:  # noqa: BLE001
            print(f"  ERR  {p}  {e}")

    if not snap.get("/profile/demo"):
        print("error: /profile/demo missing — is the backend seeded?", file=sys.stderr)
        sys.exit(1)

    with open(OUT, "w") as f:
        json.dump(snap, f, indent=1, sort_keys=True)
        f.write("\n")
    print(f"\nwrote {len(snap)} paths -> {os.path.relpath(OUT)}")


if __name__ == "__main__":
    main()
