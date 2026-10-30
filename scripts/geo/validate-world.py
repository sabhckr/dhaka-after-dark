"""Structural comparison of two generated DHAKA: AFTER DARK world folders.

usage: python3 -I scripts/geo/validate-world.py <old world> <new world> <report.json>

Reads every chunk once per side and writes nothing except the report. Standard library only.
See docs/world-data.md for what each figure means.
"""
import glob
import json
import math
import os
import sys
from collections import Counter, defaultdict

OLD, NEW, OUT = (sys.argv[1:4] + [None] * 3)[:3]
LAYERS = ["buildings", "water", "canals", "parks", "rails", "plazas", "bridges", "trees", "landmarks"]

# ---------- UTM 46N forward (Snyder), local origin of the project ----------
A, F = 6378137.0, 1 / 298.257223563
E2 = F * (2 - F)
EP2 = E2 / (1 - E2)
K0, LON0 = 0.9996, math.radians(93)  # zone 46 central meridian
OE, ON = 230000, 2615000


def to_world(lon, lat):
    p, l = math.radians(lat), math.radians(lon)
    n = A / math.sqrt(1 - E2 * math.sin(p) ** 2)
    t = math.tan(p) ** 2
    c = EP2 * math.cos(p) ** 2
    a = math.cos(p) * (l - LON0)
    m = A * ((1 - E2 / 4 - 3 * E2**2 / 64 - 5 * E2**3 / 256) * p
             - (3 * E2 / 8 + 3 * E2**2 / 32 + 45 * E2**3 / 1024) * math.sin(2 * p)
             + (15 * E2**2 / 256 + 45 * E2**3 / 1024) * math.sin(4 * p)
             - (35 * E2**3 / 3072) * math.sin(6 * p))
    e = K0 * n * (a + (1 - t + c) * a**3 / 6 + (5 - 18 * t + t * t + 72 * c - 58 * EP2) * a**5 / 120) + 500000
    nn = K0 * (m + n * math.tan(p) * (a * a / 2 + (5 - t + 9 * c + 4 * c * c) * a**4 / 24
                                    + (61 - 58 * t + t * t + 600 * c - 330 * EP2) * a**6 / 720))
    return e - OE, -(nn - ON)


# ---------- geometry helpers ----------
def seg_dist(x, z, ax, az, bx, bz):
    dx, dz = bx - ax, bz - az
    l2 = dx * dx + dz * dz
    t = 0.0 if l2 == 0 else max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / l2))
    return math.hypot(x - ax - dx * t, z - az - dz * t)


def pts_pairs(p):
    return [(p[i], p[i + 1]) for i in range(0, len(p) - 1, 2)]


def poly_dist(x, z, pairs):
    if len(pairs) == 1:
        return math.hypot(x - pairs[0][0], z - pairs[0][1])
    return min(seg_dist(x, z, *pairs[i], *pairs[i + 1]) for i in range(len(pairs) - 1))


def has_bad_number(p):
    return any(v is None or not isinstance(v, (int, float)) or not math.isfinite(v) for v in p)


# ---------- per-side accumulation ----------
class Side:
    def __init__(self):
        self.nodes = {}           # id -> (x, z)
        self.node_conflicts = 0   # same id, different coordinates in two chunks
        self.edges = {}           # (id, a, b) -> pts
        self.edge_ids = defaultdict(set)
        self.per_chunk_missing_ref = 0
        self.bad_numbers = 0
        self.layer_totals = Counter()
        self.road_bridge = 0
        self.road_vertices = 0
        self.bridge_ways = set()
        self.way_pieces = defaultdict(list)

    def add_chunk(self, c):
        g = c["graph"]
        ids = set()
        for n in g["nodes"]:
            ids.add(n["id"])
            prev = self.nodes.get(n["id"])
            if prev and (abs(prev[0] - n["x"]) > 0.01 or abs(prev[1] - n["z"]) > 0.01):
                self.node_conflicts += 1
            self.nodes[n["id"]] = (n["x"], n["z"])
        for e in g["edges"]:
            if e["a"] not in ids or e["b"] not in ids:
                self.per_chunk_missing_ref += 1
            if has_bad_number(e["pts"]):
                self.bad_numbers += 1
            self.edge_ids[e["id"]].add((e["a"], e["b"]))
            self.edges.setdefault((e["id"], e["a"], e["b"]), (e["pts"], e.get("way"), c["ix"], c["iy"]))
        for k in LAYERS:
            self.layer_totals[k] += len(c.get(k) or [])
        for r in c["roads"]:
            self.layer_totals["roads"] += 1
            self.road_vertices += len(r["pts"]) // 2
            self.way_pieces[r["id"]].append(pts_pairs(r["pts"]))
            if r.get("bridge"):
                self.road_bridge += 1
                self.bridge_ways.add(r["id"])
            if has_bad_number(r["pts"]):
                self.bad_numbers += 1

    def graph(self):
        parent = {n: n for n in self.nodes}

        def find(a):
            while parent[a] != a:
                parent[a] = parent[parent[a]]
                a = parent[a]
            return a

        deg = Counter()
        missing = zero = 0
        geoms = Counter()
        end_mismatch = 0
        for (eid, a, b), (p, _w, _ix, _iy) in self.edges.items():
            if a not in self.nodes or b not in self.nodes:
                missing += 1
                continue
            deg[a] += 1
            deg[b] += 1
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[ra] = rb
            length = sum(math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]) for i in range(0, len(p) - 2, 2))
            if a == b or length < 0.05:
                zero += 1
            geoms[tuple(p) if tuple(p) <= tuple(p[-2:] + p[:-2]) else tuple(p)] += 1
            ax, az = self.nodes[a]
            bx, bz = self.nodes[b]
            if math.hypot(p[0] - ax, p[1] - az) > 0.02 or math.hypot(p[-2] - bx, p[-1] - bz) > 0.02:
                end_mismatch += 1
        comp = Counter(find(n) for n in self.nodes)
        sizes = sorted(comp.values(), reverse=True)
        giant_root = comp.most_common(1)[0][0] if comp else None
        self.root = {n: find(n) for n in self.nodes}
        self.giant = giant_root
        self.deg = deg
        # dead ends close to another road segment: probable broken junctions
        grid = defaultdict(list)
        C = 20
        for (eid, a, b), (p, *_r) in self.edges.items():
            for i in range(0, len(p) - 2, 2):
                s = (p[i], p[i + 1], p[i + 2], p[i + 3], a, b)
                for gx in range(math.floor(min(s[0], s[2]) / C), math.floor(max(s[0], s[2]) / C) + 1):
                    for gz in range(math.floor(min(s[1], s[3]) / C), math.floor(max(s[1], s[3]) / C) + 1):
                        grid[(gx, gz)].append(s)
        self.grid = grid
        dead = [n for n, d in deg.items() if d == 1]
        near5, near100 = 0, 0
        for n in dead:
            x, z = self.nodes[n]
            best = 9.0
            for s in grid.get((math.floor(x / C), math.floor(z / C)), []):
                if n in (s[4], s[5]):
                    continue
                best = min(best, seg_dist(x, z, *s[:4]))
            near5 += best < 0.05
            near100 += best < 1.0
        isolated_nodes = sum(1 for n in self.nodes if deg[n] == 0)
        # what the traffic sim can drive: it drops edges shorter than 8 m (src/traffic/sim.ts chain())
        tp = {}

        def tfind(a):
            tp.setdefault(a, a)
            while tp[a] != a:
                tp[a] = tp[tp[a]]
                a = tp[a]
            return a

        short = 0
        for (eid, a, b), (p, *_r) in self.edges.items():
            length = sum(math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]) for i in range(0, len(p) - 2, 2))
            if length < 8:
                short += 1
                continue
            ra, rb = tfind(a), tfind(b)
            if ra != rb:
                tp[ra] = rb
        tsizes = sorted(Counter(tfind(n) for n in list(tp)).values(), reverse=True)
        return {
            "nodes": len(self.nodes),
            "edges": len(self.edges),
            "connected_components": len(sizes),
            "largest_component_nodes": sizes[0] if sizes else 0,
            "largest_component_share": round(sizes[0] / len(self.nodes), 4) if sizes else 0,
            "components_le_2_nodes": sum(1 for s in sizes if s <= 2),
            "components_lt_10_nodes": sum(1 for s in sizes if s < 10),
            "isolated_nodes_degree_0": isolated_nodes,
            "traffic_edges_dropped_lt_8m": short,
            "traffic_components": len(tsizes),
            "traffic_largest_component_share_of_nodes": round(tsizes[0] / len(self.nodes), 4) if tsizes else 0,
            "dead_ends": len(dead),
            "dead_ends_within_5cm_of_other_road": near5,
            "dead_ends_within_1m_of_other_road": near100,
            "degree_histogram": dict(sorted(Counter(min(d, 6) for d in deg.values()).items())),
            "duplicate_edge_ids_with_different_endpoints": sum(1 for v in self.edge_ids.values() if len(v) > 1),
            "edges_with_missing_node_ref_global": missing,
            "edges_with_missing_node_ref_in_chunk": self.per_chunk_missing_ref,
            "zero_length_or_self_loop_edges": zero,
            "duplicate_edge_geometries": sum(v - 1 for v in geoms.values() if v > 1),
            "edge_endpoint_not_at_node_gt_2cm": end_mismatch,
            "node_id_coordinate_conflicts_across_chunks": self.node_conflicts,
            "non_finite_or_null_coordinates": self.bad_numbers,
        }

    def local(self, x, z, r=300):
        """Graph health inside radius r around a point."""
        inside = [n for n, (nx, nz) in self.nodes.items() if abs(nx - x) <= r and abs(nz - z) <= r and math.hypot(nx - x, nz - z) <= r]
        if not inside:
            return {"nodes": 0}
        comps = Counter(self.root[n] for n in inside)
        return {
            "nodes": len(inside),
            "in_city_giant_component": sum(1 for n in inside if self.root[n] == self.giant),
            "distinct_components": len(comps),
            "dead_ends": sum(1 for n in inside if self.deg[n] == 1),
        }


def compare_roads(a, b, acc):
    """Same chunk, old roads a, new roads b. Attributes must match; geometry within tolerance."""
    def key_list(rs):
        seen = Counter()
        out = {}
        for r in rs:
            k = (r["id"], seen[r["id"]])
            seen[r["id"]] += 1
            out[k] = r
        return out

    ka, kb = key_list(a), key_list(b)
    acc["only_old"] += len(ka.keys() - kb.keys())
    acc["only_new"] += len(kb.keys() - ka.keys())
    for k in ka.keys() & kb.keys():
        ra, rb = ka[k], kb[k]
        attrs_a = {x: y for x, y in ra.items() if x != "pts"}
        attrs_b = {x: y for x, y in rb.items() if x != "pts"}
        if attrs_a != attrs_b:
            acc["attribute_changed"] += 1
            if len(acc["attribute_examples"]) < 5:
                acc["attribute_examples"].append({"id": k[0], "old": attrs_a, "new": attrs_b})
        if ra["pts"] == rb["pts"]:
            acc["geometry_identical"] += 1
            continue
        acc["geometry_changed"] += 1
        pa, pb = pts_pairs(ra["pts"]), pts_pairs(rb["pts"])
        d1 = max(poly_dist(x, z, pa) for x, z in pb)
        d2 = max(poly_dist(x, z, pb) for x, z in pa)
        d = max(d1, d2)
        acc["max_deviation_m"] = max(acc["max_deviation_m"], d)
        acc["dev_hist"][("<0.1" if d < 0.1 else "<0.5" if d < 0.5 else "<1.0" if d < 1.0 else ">=1.0")] += 1
        if pa[0] != pb[0] or pa[-1] != pb[-1]:
            acc["endpoints_moved"] += 1


def main():
    old_files = {os.path.basename(f) for f in glob.glob(os.path.join(OLD, "chunks", "c_*.json"))}
    new_files = {os.path.basename(f) for f in glob.glob(os.path.join(NEW, "chunks", "c_*.json"))}
    om = json.load(open(os.path.join(OLD, "manifest.json")))
    nm = json.load(open(os.path.join(NEW, "manifest.json")))
    so, sn = Side(), Side()
    layer_changed = Counter()
    layer_examples = defaultdict(list)
    roads = {"only_old": 0, "only_new": 0, "attribute_changed": 0, "attribute_examples": [], "geometry_identical": 0,
             "geometry_changed": 0, "endpoints_moved": 0, "max_deviation_m": 0.0, "dev_hist": Counter()}
    chunk_keys_changed = Counter()
    for fn in sorted(old_files | new_files):
        a = json.load(open(os.path.join(OLD, "chunks", fn))) if fn in old_files else None
        b = json.load(open(os.path.join(NEW, "chunks", fn))) if fn in new_files else None
        if a:
            so.add_chunk(a)
        if b:
            sn.add_chunk(b)
        if not (a and b):
            continue
        if set(a) != set(b):
            chunk_keys_changed[fn] += 1
        for k in LAYERS + ["v", "ix", "iy", "origin"]:
            if a.get(k) != b.get(k):
                layer_changed[k] += 1
                if len(layer_examples[k]) < 3:
                    layer_examples[k].append(fn)
        compare_roads(a["roads"], b["roads"], roads)
    # whole-way deviation: every vertex of one side against all pieces of the same way on the other side
    way_dev = Counter()
    worst = []
    for wid, pn in sn.way_pieces.items():
        po = so.way_pieces.get(wid)
        if not po or po == pn:
            continue
        d = 0.0
        for xs, ys in ((pn, po), (po, pn)):
            for piece in xs:
                for x, z in piece:
                    d = max(d, min(poly_dist(x, z, q) for q in ys))
        way_dev["<0.1" if d < 0.1 else "<0.5" if d < 0.5 else "<1.0" if d < 1.0 else "<2.0" if d < 2.0 else ">=2.0"] += 1
        worst.append((round(d, 2), wid))
    roads["whole_way_deviation_hist"] = dict(way_dev)
    roads["whole_way_worst"] = sorted(worst, reverse=True)[:8]
    roads["dev_hist"] = dict(roads["dev_hist"])
    roads["max_deviation_m"] = round(roads["max_deviation_m"], 3)

    # manifest
    skip = {"generatedAt", "counts", "chunks"}
    manifest_diff = sorted(k for k in set(om) | set(nm) if k not in skip and om.get(k) != nm.get(k))
    count_diff = {k: [om["counts"].get(k), nm["counts"].get(k)] for k in set(om["counts"]) | set(nm["counts"])
                  if om["counts"].get(k) != nm["counts"].get(k)}
    mchunks_o = {c["key"]: c for c in om["chunks"]}
    mchunks_n = {c["key"]: c for c in nm["chunks"]}
    manifest_chunk_entries_changed = Counter()
    for k in mchunks_o.keys() & mchunks_n.keys():
        for f in set(mchunks_o[k]) | set(mchunks_n[k]):
            if mchunks_o[k].get(f) != mchunks_n[k].get(f):
                manifest_chunk_entries_changed[f] += 1
    listed_missing = [k for k in mchunks_n if f"c_{k}.json" not in new_files]

    # spawn projection self-check, then sample points
    proj_err = max(math.hypot(to_world(s["lon"], s["lat"])[0] - s["x"], to_world(s["lon"], s["lat"])[1] - s["z"]) for s in nm["spawns"])
    places = {s["name"]: (s["x"], s["z"]) for s in nm["spawns"] if s["id"] != "overview"}
    for name, lon, lat in [
        ("Kawran Bazar (approx. 90.3935 E 23.7510 N)", 90.3935, 23.7510),
        ("New Market (approx. 90.3846 E 23.7332 N)", 90.3846, 23.7332),
        ("Farmgate junction (approx.)", 90.3893, 23.7572),
        ("Science Lab junction (approx.)", 90.3836, 23.7385),
        ("Mohakhali junction (approx.)", 90.4005, 23.7778),
        ("Jatrabari (approx.)", 90.4340, 23.7100),
        ("Agargaon, Metro Line 6 corridor (approx.)", 90.3797, 23.7781),
        ("Tejgaon rail corridor (approx.)", 90.3960, 23.7600),
    ]:
        places[name] = to_world(lon, lat)

    go, gn = so.graph(), sn.graph()
    locations = {name: {"x": round(x, 1), "z": round(z, 1), "old": so.local(x, z), "new": sn.local(x, z)} for name, (x, z) in places.items()}

    # bridge edges: both endpoints in the city giant component
    def bridge_conn(side):
        e = [(a, b) for (eid, a, b), (p, w, *_r) in side.edges.items() if w in side.bridge_ways]
        both = sum(1 for a, b in e if side.root[a] == side.giant and side.root[b] == side.giant)
        return {"bridge_edges": len(e), "both_ends_in_city_giant_component": both}

    def other_file(name):
        fa, fb = os.path.join(OLD, name), os.path.join(NEW, name)
        if not (os.path.exists(fa) and os.path.exists(fb)):
            return {"present_old": os.path.exists(fa), "present_new": os.path.exists(fb)}
        da, db = json.load(open(fa)), json.load(open(fb))
        if isinstance(da, dict):
            return {"identical": da == db, "changed_keys": sorted(k for k in set(da) | set(db) if da.get(k) != db.get(k))}
        return {"identical": da == db, "len_old": len(da), "len_new": len(db)}

    report = {
        "old": OLD,
        "new": NEW,
        "files": {
            "chunks_old": len(old_files), "chunks_new": len(new_files),
            "only_old": sorted(old_files - new_files), "only_new": sorted(new_files - old_files),
            "manifest_listed_but_missing_in_new": listed_missing,
            "chunks_with_changed_key_set": len(chunk_keys_changed),
        },
        "manifest": {
            "generatedAt": [om.get("generatedAt"), nm.get("generatedAt")],
            "top_level_fields_changed": manifest_diff,
            "counts_changed": count_diff,
            "chunk_entry_fields_changed": dict(manifest_chunk_entries_changed),
            "spawns_identical": om["spawns"] == nm["spawns"],
            "sangsad_spawn_y": [next(s["y"] for s in om["spawns"] if s["id"] == "sangsad"), next(s["y"] for s in nm["spawns"] if s["id"] == "sangsad")],
            "boundary_identical": om["boundary"] == nm["boundary"],
            "crs_origin_axis_identical": all(om[k] == nm[k] for k in ("crs", "origin", "axis", "chunkSize")),
        },
        "other_files": {f: other_file(f) for f in ("landmarks.json", "overview.json", "coverage.json")},
        "layers": {
            "feature_totals_old": dict(so.layer_totals), "feature_totals_new": dict(sn.layer_totals),
            "chunks_with_layer_changed": dict(layer_changed), "examples": dict(layer_examples),
            "road_vertices": [so.road_vertices, sn.road_vertices],
            "road_pieces_flagged_bridge": [so.road_bridge, sn.road_bridge],
        },
        "roads": roads,
        "bridges_graph": {"old": bridge_conn(so), "new": bridge_conn(sn)},
        "graph_old": go,
        "graph_new": gn,
        "projection_check_max_error_m_vs_manifest_spawns": round(proj_err, 4),
        "locations_300m": locations,
    }
    json.dump(report, open(OUT, "w"), indent=1)
    print(json.dumps(report, indent=1)[:12000])


if __name__ == "__main__":
    main()
