#!/usr/bin/env python3
# Python / mitmproxy addon - rewrites EA Sports FC Mobile API responses so
# currency/player-ownership changes survive a server sync, instead of the
# client-memory trainer's writes getting overwritten on the next request.
#
# This is the piece that makes values "stick" against a server-authoritative
# economy - the memory trainer (fcmobile_scan.js) only ever edits the local
# copy, which the server overwrites on the next sync regardless of freeze().
#
# Requires: pip install mitmproxy
# Run:      mitmdump -s mitm_addon.py -p 8080
# Then point the iPhone's Wi-Fi proxy at this machine's IP:8080, install
# mitmproxy's CA cert on the device (visit mitm.it from the device while
# proxied, or http://mitm.it), and load ssl_unpin.js (see fcmobile_ios_points.py)
# so the app actually trusts that cert instead of refusing the connection.
#
# FILL (all of this, genuinely unknowable without live traffic - see
# README "Capturing the real schema"): the actual API host, endpoint paths,
# and JSON field names. Run mitmdump with no rewriting first, play a match or
# open the club/transfer screen, and read the captured requests/responses to
# fill these in. The rewrite functions below are structured for the SHAPE
# this kind of API almost always takes (a currency balance field, a squad/
# player-ownership list) - swap the FILL constants for your real field names
# and this starts actually working.

from mitmproxy import http
import json

# FILL: the real API host(s) FC Mobile talks to. Narrow the addon to just
# these so you're not accidentally mangling CDN/analytics/ad traffic too.
API_HOST_SUBSTRINGS = [
    "fifamobile",   # FILL
    "ea.com",       # FILL - almost certainly too broad on its own, narrow it
]

# FILL: exact field names once you've captured real traffic.
CURRENCY_FIELDS = {
    # "points": 99999,
    # "coins": 99999,
    # "fcPoints": 99999,
}

# FILL: if you want specific player IDs unlocked rather than "every field
# that looks like an owned-player list gets everything in the catalog
# appended" - safer/cleaner once you know the real schema.
FORCE_ALL_PLAYERS_IN_CATALOG = False


def is_target_host(flow: http.HTTPFlow) -> bool:
    host = flow.request.pretty_host or ""
    return any(s in host for s in API_HOST_SUBSTRINGS)


def rewrite_currency(obj):
    """Walks a parsed JSON object and overwrites any key matching
    CURRENCY_FIELDS, at any nesting depth."""
    changed = False
    if isinstance(obj, dict):
        for k, v in list(obj.items()):
            if k in CURRENCY_FIELDS:
                obj[k] = CURRENCY_FIELDS[k]
                changed = True
            elif isinstance(v, (dict, list)):
                changed = rewrite_currency(v) or changed
    elif isinstance(obj, list):
        for item in obj:
            changed = rewrite_currency(item) or changed
    return changed


def rewrite_player_ownership(obj, catalog_player_ids):
    """FILL: this is a skeleton, not a working implementation yet - it needs
    the real shape of FC Mobile's squad/club response (what the "owned
    player IDs" field is actually called, whether it's a flat ID list or a
    list of objects with an id/rating/card-type) before it can do anything.
    Once you send me a captured response, I'll write the real version."""
    return False


def response(flow: http.HTTPFlow) -> None:
    if not is_target_host(flow):
        return
    ctype = flow.response.headers.get("content-type", "")
    if "json" not in ctype:
        return
    try:
        data = json.loads(flow.response.get_text())
    except Exception:
        return

    changed = False
    if CURRENCY_FIELDS:
        changed = rewrite_currency(data) or changed
    if FORCE_ALL_PLAYERS_IN_CATALOG:
        changed = rewrite_player_ownership(data, []) or changed

    if changed:
        flow.response.set_text(json.dumps(data))
        print("[mitm_addon] rewrote response for %s" % flow.request.pretty_url)
