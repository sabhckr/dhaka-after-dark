"""Check a staged v2 world against raw OSM, without the game's own code.

usage: python3 -I scripts/geo/check-v2-osm.py <osm-sample.json> <report.json>

<osm-sample.json> comes from scripts/geo/dump-osm-sample.ts. Positions are
projected with the UTM implementation in validate-world.py (not proj4), and tags
are re-read here with separate parsing (Python reads any Unicode decimal digit,
so Bangla digits count as numbers). Standard library only. Exit 1 on any
mismatch.
"""
import importlib.util
import json
import math
import os
import re
import sys

SAMPLE, OUT = (sys.argv[1:3] + [None] * 2)[:2]
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("validate_world", os.path.join(here, "validate-world.py"))
vw = importlib.util.module_from_spec(spec)
saved = sys.argv
sys.argv = [saved[0]]
spec.loader.exec_module(vw)
sys.argv = saved

data = json.load(open(SAMPLE))
problems = []


def bad(msg):
    if len(problems) < 60:
        problems.append(msg)


def num(raw):
    m = re.match(r"^\s*(-?\d+(?:[.,]\d+)?)", raw or "")
    return float(m.group(1).replace(",", ".")) if m else None


def lower(raw, limit=40):
    v = (raw or "").strip().lower()
    return v if v and len(v) <= limit else None


def text(raw, limit=80):
    v = (raw or "").strip()
    return v if v and len(v) <= limit else None


def layer(raw):
    if raw is None or not re.match(r"^\s*-?\d+\s*$", raw):
        return None
    v = int(raw)
    return v if v and -5 <= v <= 10 else None


# ---------- points: position and kind ----------
KIND = {
    "signal": lambda t: t.get("highway") == "traffic_signals",
    "crossing": lambda t: t.get("highway") == "crossing" or t.get("footway") == "crossing",
    "bus_stop": lambda t: t.get("highway") == "bus_stop",
    "platform": lambda t: t.get("public_transport") == "platform",
    "lamp": lambda t: t.get("highway") == "street_lamp",
    "tower": lambda t: t.get("power") == "tower",
    "gate": lambda t: t.get("barrier") == "gate",
}
errors = []
for sid, p in data["points"].items():
    raw = data["nodes"].get(sid)
    if not raw:
        bad(f"point {sid}: node not in OSM")
        continue
    x, z = vw.to_world(raw["lon"], raw["lat"])
    errors.append(math.hypot(x - p["x"], z - p["z"]))
    if not KIND[p["k"]](raw["tags"]):
        bad(f"point {sid}: kind {p['k']} but tags {raw['tags']}")
errors.sort()
pos = {
    "n": len(errors),
    "maxM": round(errors[-1], 4) if errors else None,
    "p99M": round(errors[int(0.99 * (len(errors) - 1))], 4) if errors else None,
    "over1cm": sum(1 for e in errors if e > 0.01),
}
if pos["over1cm"]:
    bad(f"{pos['over1cm']} points more than 1 cm from their OSM node")


# ---------- attributes: what OSM says, re-parsed here ----------
def expect_building(t):
    e = {}
    b = lower(t.get("building"))
    if b and b != "yes":
        e["t"] = b
    for key, field in (("building:levels", "lv"), ("building:min_level", "mlv")):
        v = num(t.get(key))
        if v is not None and 0 < v < 150 and re.match(r"^\s*\d+(?:[.,]\d+)?\s*$", t.get(key, "")):
            e[field] = round(v * 2) / 2
    mh = num(t.get("min_height"))
    if mh is not None and 0 < mh < 600:
        e["mh"] = round(mh, 2)
    for key, field in (("building:material", "mat"), ("roof:shape", "roof")):
        v = lower(t.get(key))
        if v:
            e[field] = v
    ly = layer(t.get("layer"))
    if ly:
        e["ly"] = ly
    nm = text(t.get("name"))
    if nm:
        e["nm"] = nm
    return e


def expect_road(t):
    e = {}
    ln = t.get("lanes")
    if ln and re.match(r"^\s*\d+\s*$", ln) and 1 <= int(ln) <= 12:
        e["ln"] = int(ln)
    sf = lower(t.get("surface"))
    if sf:
        e["sf"] = sf
    if t.get("lit") in ("yes", "no"):
        e["lit"] = 1 if t["lit"] == "yes" else 0
    m = re.match(r"^\s*(\d+(?:\.\d+)?)\s*(mph)?\s*$", t.get("maxspeed", ""), re.I)
    if m:
        v = float(m.group(1)) * (1.609344 if m.group(2) else 1)
        if 0 < v <= 150:
            e["mx"] = round(v)
    nm = text(t.get("name"))
    if nm:
        e["nm"] = nm
    nme = text(t.get("name:en"))
    if nme and nme != nm:
        e["nme"] = nme
    ly = layer(t.get("layer"))
    if ly:
        e["ly"] = ly
    if t.get("tunnel") in ("yes", "culvert", "building_passage"):
        e["tn"] = 1
    sw = lower(t.get("sidewalk"))
    simple = {"both": "both", "left": "left", "right": "right", "separate": "separate", "no": "no", "none": "no", "yes": "both"}
    if sw in simple:
        e["sw"] = simple[sw]
    return e


def candidates(sid):
    return [t for t in (data["ways"].get(sid), data["relations"].get(sid)) if t is not None]


checked = {}
for kind, recs in data["sample"].items():
    ok = 0
    for sid, got in recs.items():
        tags = candidates(sid)
        if not tags:
            bad(f"{kind} {sid}: not in OSM as a way or relation")
            continue
        if kind in ("buildings", "buildingsBare"):
            want = [expect_building(t) for t in tags]
        elif kind in ("roads", "roadsBare"):
            # sidewalk:left/right/both forms are only checked when sidewalk=* is absent.
            want = []
            for t in tags:
                e = expect_road(t)
                if "sw" not in e and "sw" in got and "sidewalk" not in t:
                    e["sw"] = got["sw"]
                want.append(e)
        elif kind == "landuse":
            want = [{"t": t["landuse"].lower()} if t.get("landuse") else {"t": "leisure:" + t.get("leisure", "").lower()} for t in tags]
        elif kind == "barriers":
            want = [{"t": t.get("barrier")} for t in tags]
        else:
            want = [{"t": t.get("power")} for t in tags]
        if got in want:
            ok += 1
        else:
            bad(f"{kind} {sid}: data {got} vs OSM {want[0]}")
    checked[kind] = {"sampled": len(recs), "match": ok, "inData": data["totals"][kind]}

report = {"points": pos, "attributes": checked, "pass": not problems, "problems": problems}
json.dump(report, open(OUT, "w"), indent=2, ensure_ascii=False)
print(json.dumps({"points": pos, "attributes": checked}, indent=1))
print("PASS" if not problems else "FAIL\n" + "\n".join(problems[:20]))
sys.exit(0 if not problems else 1)
