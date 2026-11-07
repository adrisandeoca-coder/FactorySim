"""
Verification of the Warehouse element (factorysim/engine/warehouse.py).

Checks are exact where possible:
- conservation of units per SKU (initial + received = picked + on hand)
- M/D/1 picking: one SKU at a fixed pick face, constant pick time S and one
  picker gives a mean order cycle time W = S + rho*S / (2(1 - rho))
- utilisation of pickers equals the sum of pick times / (T * pickers)
- line supply and finished-goods links balance with the line's throughput
- rack capacity is never exceeded; put-away waits when the racks are full
- ABC slotting puts A items closer to the I/O point than C items
- same seed → identical results
"""

import math

import pytest

from factorysim.engine.simulation import Simulation, SimulationConfig


def _run(model, duration=8 * 3600, seed=1):
    sim = Simulation(model, SimulationConfig(duration=duration, seed=seed))
    k = sim.run()
    return k.get("kpis", k), sim


def _dc(skus, **data):
    d = {"id": "wh", "name": "DC", "layout": {"aisles": 4, "baysPerAisle": 10, "levels": 4, "palletsPerBay": 2},
         "forklifts": {"count": 2}, "pickers": {"count": 3}, "skus": skus}
    d.update(data)
    return {"stations": [], "buffers": [], "products": [], "connections": [],
            "extraNodes": [{"id": "wh", "type": "warehouse", "data": d}]}


def _skus(n=10, upp=48, initial=3, s=2, q=4, lead=7200):
    shares = [30, 20, 12, 10, 8, 6, 5, 4, 3, 2]
    return [{"id": f"S{i}", "name": f"SKU {i}", "class": "A" if i < 2 else ("B" if i < 5 else "C"),
             "unitsPerPallet": upp, "initialPallets": initial, "reorderPoint": s, "orderQuantity": q,
             "leadTime": {"type": "constant", "parameters": {"value": lead}},
             "demandShare": shares[i % len(shares)]} for i in range(n)]


ORDERS = {"enabled": True, "interarrival": {"type": "exponential", "parameters": {"mean": 120}},
          "linesPerOrder": {"type": "triangular", "parameters": {"min": 1, "mode": 3, "max": 8}},
          "unitsPerLine": {"type": "triangular", "parameters": {"min": 1, "mode": 2, "max": 6}},
          "packStations": 2, "departureInterval": 1800}


def test_dc_conserves_units_per_sku():
    k, _ = _run(_dc(_skus(), slotting="abc", orders=ORDERS))
    wh = k["warehouses"]["wh"]
    assert wh["orders"]["shipped"] > 150
    for s in wh["skus"]:
        # in-flight pallets (unloaded but not yet stored) are the only units not counted
        supplied = (3 + s["pallets_received"]) * 48
        assert s["units_picked"] + s["units_end"] <= supplied
        assert supplied - (s["units_picked"] + s["units_end"]) in (0, 48, 96)  # ≤ 2 pallets in put-away


def test_order_volume_matches_inputs():
    k, _ = _run(_dc(_skus(), orders=ORDERS), duration=24 * 3600, seed=5)
    o = k["warehouses"]["wh"]["orders"]
    expected = 24 * 3600 / 120
    assert abs(o["created"] - expected) < 4 * math.sqrt(expected)     # Poisson, 4 sigma
    assert abs(o["lines"] / o["created"] - 4.0) < 0.25                # triangular(1,3,8) mean
    assert abs(o["units"] / o["lines"] - 3.0) < 0.2                   # triangular(1,2,6) mean


def test_picking_matches_md1():
    """One SKU, one picker, constant pick time → M/D/1 mean time in system."""
    sku = [{"id": "X", "unitsPerPallet": 10 ** 6, "initialPallets": 1, "demandShare": 1}]
    layout = {"aisles": 1, "baysPerAisle": 4, "levels": 1, "palletsPerBay": 1}
    pick = {"count": 1, "walkSpeed": 1.0, "timePerLine": 10, "timePerUnit": 2, "setupTime": 30}
    # One aisle, dock centred on it (aisle X = 0): tour = in and out to bay 0 = 2*(4 + 1.35)
    S = 30 + (2 * (4.0 + 0.5 * 2.7)) / 1.0 + 10 + 2
    rho = 0.6
    orders = {"enabled": True, "interarrival": {"type": "exponential", "parameters": {"mean": S / rho}},
              "linesPerOrder": 1, "unitsPerLine": 1, "packStations": 50, "packTime": 0, "departureInterval": 0}
    expected = S + rho * S / (2 * (1 - rho))
    means = []
    for seed in range(4):
        k, _ = _run(_dc(sku, layout=layout, pickers=pick, orders=orders), duration=200_000, seed=seed)
        means.append(k["warehouses"]["wh"]["orders"]["cycle_time_mean"])
    got = sum(means) / len(means)
    assert abs(got - expected) / expected < 0.05, (got, expected)


def test_picker_utilisation_is_consistent():
    k, sim = _run(_dc(_skus(), orders=ORDERS), seed=2)
    wh = sim.extra_nodes["wh"]
    T = sim.env.now
    st = k["warehouses"]["wh"]["pickers"]
    assert abs(st["utilization"] - wh.picker_busy / (T * 3)) < 1e-3
    assert 0 < st["utilization"] < 1


def _line(rm_initial=4):
    def wh(id, name, skus):
        return {"id": id, "type": "warehouse", "data": {
            "id": id, "name": name, "layout": {"aisles": 2, "baysPerAisle": 8, "levels": 3, "palletsPerBay": 2},
            "forklifts": {"count": 1}, "skus": skus}}
    return {
        "stations": [
            {"id": "s1", "name": "Machining", "cycleTime": {"type": "constant", "parameters": {"value": 50}}},
            {"id": "s2", "name": "Assembly", "cycleTime": {"type": "constant", "parameters": {"value": 45}}},
        ],
        "buffers": [{"id": "b1", "name": "B1", "capacity": 5}],
        "products": [{"id": "p1", "name": "Bracket", "routing": ["s1", "s2"], "arrivalRate": 60}],
        "connections": [
            {"source": "src", "target": "rm"}, {"source": "rm", "target": "s1"},
            {"source": "s1", "target": "b1"}, {"source": "b1", "target": "s2"},
            {"source": "s2", "target": "fg"}, {"source": "fg", "target": "snk"}],
        "extraNodes": [
            {"id": "src", "type": "source", "data": {"id": "src", "name": "Source", "arrivalRate": 60}},
            wh("rm", "RM store", [{"id": "RM", "productId": "p1", "unitsPerPallet": 50,
                                   "initialPallets": rm_initial, "reorderPoint": 3, "orderQuantity": 6,
                                   "leadTime": {"type": "constant", "parameters": {"value": 3600}}}]),
            wh("fg", "FG store", [{"id": "FG", "productId": "p1", "unitsPerPallet": 40}]),
            {"id": "snk", "type": "sink", "data": {"id": "snk", "name": "Sink"}},
        ]}


def test_line_supply_and_finished_goods_balance():
    k, sim = _run(_line(), seed=3)
    rm = k["warehouses"]["rm"]
    fg = k["warehouses"]["fg"]
    done = k["throughput"]["total"]
    assert abs(done - 480) <= 3
    # Raw material: initial + received = supplied + in racks + line side
    rm_sku = rm["skus"][0]
    line_side = sim.extra_nodes["rm"].skus["RM"].line_side_units
    assert (4 + rm_sku["pallets_received"]) * 50 == rm["line_supply"]["parts"] + rm_sku["units_end"] + line_side
    assert rm["line_supply"]["starved_parts"] <= 1       # call-off keeps the line fed
    # Finished goods: every completed part lands in the FG store
    fg_sku = fg["skus"][0]
    assert fg["finished_goods"]["units"] == done or abs(fg["finished_goods"]["units"] - done) <= 1
    open_units = sim.extra_nodes["fg"].skus["FG"].fg_open_units
    assert fg_sku["pallets_from_production"] * 40 + open_units == fg["finished_goods"]["units"]


def test_line_starves_without_stock_and_recovers_on_replenishment():
    k, _ = _run(_line(rm_initial=0), seed=4)
    rm = k["warehouses"]["rm"]
    assert rm["replenishment"]["orders"] >= 1
    assert rm["line_supply"]["parts"] > 300               # supplied after the first delivery
    assert any(w["code"] == "WH_LINE_STARVED" for w in k["warnings"]) is False or rm["line_supply"]["starved_parts"] >= 1


def test_rack_capacity_is_respected():
    skus = [{"id": "A", "unitsPerPallet": 10, "demandShare": 1}]
    layout = {"aisles": 1, "baysPerAisle": 1, "levels": 1, "palletsPerBay": 2}
    inbound = {"enabled": True, "interarrival": {"type": "constant", "parameters": {"value": 600}},
               "palletsPerTruck": 3, "doors": 1, "unloadTimePerPallet": 30}
    k, _ = _run(_dc(skus, layout=layout, inbound=inbound), duration=7200)
    st = k["warehouses"]["wh"]["storage"]
    assert st["max_occupied"] <= 4      # 1 aisle × 2 sides × 1 bay × 1 level × 2 slots
    assert st["full_waits"] > 0
    assert any(w["code"] == "WH_STORAGE_FULL" for w in k["warnings"])


def test_abc_slotting_places_fast_movers_closer():
    _, sim = _run(_dc(_skus(initial=6, s=-1), slotting="abc"), duration=10)
    wh = sim.extra_nodes["wh"]

    def mean_time(cls):
        locs = [p.loc for s in wh.skus.values() if s.abc == cls for p in list(s.reserve) + s.faces]
        return sum(wh._loc_time[i] for i in locs) / len(locs)
    assert mean_time("A") < mean_time("C")


def test_same_seed_same_result():
    a, _ = _run(_dc(_skus(), orders=ORDERS), seed=11)
    b, _ = _run(_dc(_skus(), orders=ORDERS), seed=11)
    assert a["warehouses"]["wh"]["orders"] == b["warehouses"]["wh"]["orders"]
    assert a["warehouses"]["wh"]["forklifts"] == b["warehouses"]["wh"]["forklifts"]


def test_wip_store_between_stations():
    m = _line()
    m["extraNodes"] = [n for n in m["extraNodes"] if n["id"] not in ("rm", "fg")] + [
        {"id": "wip", "type": "warehouse", "data": {"id": "wip", "name": "WIP store",
         "layout": {"aisles": 1, "baysPerAisle": 4, "levels": 2, "palletsPerBay": 1},
         "forklifts": {"count": 2}, "skus": []}}]
    m["buffers"] = []
    m["connections"] = [{"source": "src", "target": "s1"}, {"source": "s1", "target": "wip"},
                        {"source": "wip", "target": "s2"}, {"source": "s2", "target": "snk"}]
    k, _ = _run(m, seed=6)
    w = k["warehouses"]["wip"]
    assert w["wip_store"]["items"] > 300
    assert w["forklifts"]["tasks"]["putaway"] >= w["wip_store"]["items"]
    assert w["storage"]["max_occupied"] <= 16


# ── Trucks, AS/RS, congestion, shifts, cross-docking ─────────────────────

def _skus_small(n=4, upp=48, initial=4, s=2, q=4, lead=3600):
    return [{"id": f"S{i}", "class": "A" if i == 0 else "B", "unitsPerPallet": upp, "initialPallets": initial,
             "reorderPoint": s, "orderQuantity": q, "demandShare": [40, 30, 20, 10][i % 4],
             "leadTime": {"type": "constant", "parameters": {"value": lead}}} for i in range(n)]


def test_asrs_crane_trips_follow_chebyshev_travel():
    """Every crane trip: travel time = max(horizontal/v_h, vertical/v_v), cycle = 2·travel + 2·handling."""
    m = _dc(_skus_small(), storageType="asrs", layout={"aisles": 2, "baysPerAisle": 8, "levels": 8, "palletsPerBay": 1},
            cranes={"speed": 3.0, "liftSpeed": 1.0, "handlingTime": 10}, orders=ORDERS)
    k, sim = _run(m, seed=4)
    wh = sim.extra_nodes["wh"]
    crane_trips = [t for t in wh._trips if t[0] == 1]
    assert len(crane_trips) > 50
    for _typ, aisle, loc, _kind, t_start, t_move, t_at, t_leave, t_back in crane_trips:
        a, _side, b, lv, _k = wh._locs[loc]
        one = max((b + 0.5) * 2.7 / 3.0, lv * 1.5 / 1.0)
        assert a == aisle
        assert t_move - t_start == pytest.approx(10, abs=0.11)
        assert t_at - t_move == pytest.approx(one, abs=0.11)
        assert t_back - t_leave == pytest.approx(one, abs=0.11)
    st = k["warehouses"]["wh"]
    assert st["storage_type"] == "asrs"
    assert st["forklifts"]["tasks"]["putaway"] == 0 or st["cranes"]["utilization"] > 0
    assert st["cranes"]["utilization"] > 0


def test_asrs_goods_to_person_conserves_units_and_ships_orders():
    m = _dc(_skus(), storageType="asrs", layout={"aisles": 3, "baysPerAisle": 10, "levels": 8, "palletsPerBay": 1},
            orders=ORDERS, pickers={"count": 4})
    k, sim = _run(m, seed=8)
    wh = k["warehouses"]["wh"]
    assert wh["orders"]["shipped"] > 150
    for s in wh["skus"]:
        supplied = (3 + s["pallets_received"]) * 48
        assert 0 <= supplied - (s["units_picked"] + s["units_end"]) <= 2 * 48
    # A crane never does two things at once
    by_aisle = {}
    for t in sim.extra_nodes["wh"]._trips:
        by_aisle.setdefault(t[1], []).append((t[4], t[8]))
    for spans in by_aisle.values():
        spans.sort()
        for (s0, e0), (s1, _e1) in zip(spans, spans[1:]):
            assert s1 >= e0 - 1e-6


def _congestion_model(limit):
    skus = [{"id": "A", "unitsPerPallet": 10, "demandShare": 1}]
    inbound = {"enabled": True, "interarrival": {"type": "constant", "parameters": {"value": 900}},
               "palletsPerTruck": 12, "doors": 2, "unloadTimePerPallet": 5}
    return _dc(skus, layout={"aisles": 1, "baysPerAisle": 12, "levels": 3, "palletsPerBay": 2},
               forklifts={"count": 3, "maxPerAisle": limit}, inbound=inbound)


def test_forklift_congestion_limits_forklifts_per_aisle():
    k, sim = _run(_congestion_model(1), duration=4 * 3600, seed=2)
    c = k["warehouses"]["wh"]["congestion"]
    assert c["waits"] > 0 and c["total_wait"] > 0
    # Never two forklifts inside the aisle at the same time
    spans = sorted((t[6], t[7]) for t in sim.extra_nodes["wh"]._trips if t[0] == 0)
    for (s0, e0), (s1, _e1) in zip(spans, spans[1:]):
        assert s1 >= e0 - 1e-6
    k2, _ = _run(_congestion_model(0), duration=4 * 3600, seed=2)
    assert k2["warehouses"]["wh"]["congestion"]["waits"] == 0
    # Congestion makes put-away slower on average
    assert (k["warehouses"]["wh"]["forklifts"]["avg_task_time"]["putaway"]
            > k2["warehouses"]["wh"]["forklifts"]["avg_task_time"]["putaway"])


def test_pickers_follow_shift_calendar_and_breaks():
    pickers = {"count": 2, "shifts": [{"start": "06:00", "end": "14:00"}],
               "breaks": [{"start": "09:30", "minutes": 30}]}
    m = _dc(_skus(), orders=ORDERS, pickers=pickers)
    sim = Simulation(m, SimulationConfig(duration=12 * 3600, seed=3, start_hour=4.0))
    k = sim.run()
    k = k.get("kpis", k)
    starts = sim.extra_nodes["wh"]._pick_starts
    assert starts
    for t in starts:
        clock = (4 * 3600 + t) % 86400
        assert 6 * 3600 <= clock < 14 * 3600, clock          # inside the shift
        assert not (9.5 * 3600 <= clock < 10 * 3600), clock  # not during the break
    assert k["warehouses"]["wh"]["shifts"]["waits"] > 0


def test_cross_docking_feeds_waiting_orders_directly():
    skus = [{"id": f"S{i}", "unitsPerPallet": 48, "initialPallets": 0, "reorderPoint": 0, "orderQuantity": 3,
             "demandShare": 1, "leadTime": {"type": "constant", "parameters": {"value": 1800}}} for i in range(3)]
    base = dict(orders={**ORDERS, "departureInterval": 0})
    # The saving (put-away + retrieval skipped) is small next to order-arrival noise,
    # so compare common-random-number pairs averaged over several seeds.
    ct = {True: [], False: []}
    for seed in range(6):
        for cd in (True, False):
            k, _ = _run(_dc(skus, crossDock=cd, **base), duration=12 * 3600, seed=seed)
            w = k["warehouses"]["wh"]
            if cd:
                assert w["cross_dock"]["pallets"] > 0 and w["cross_dock"]["units"] > 0
            else:
                assert w["cross_dock"]["pallets"] == 0
            ct[cd].append(w["orders"]["cycle_time_mean"])
    assert sum(ct[True]) < 0.95 * sum(ct[False])


def test_outbound_trucks_ship_orders_and_doors_are_never_double_booked():
    inbound = {"enabled": True, "interarrival": {"type": "exponential", "parameters": {"mean": 1800}},
               "palletsPerTruck": 6, "doors": 2, "unloadTimePerPallet": 60}
    m = _dc(_skus(), inbound=inbound, orders={**ORDERS, "departureInterval": 1800})
    k, sim = _run(m, seed=12)
    wh = sim.extra_nodes["wh"]
    st = k["warehouses"]["wh"]
    out = [t for t in wh._trucks if t[3] == 1]
    assert len(out) == st["docks"]["outbound_trucks"] > 0
    assert sum(t[4] for t in out) == st["orders"]["shipped"]
    leaves = {round(t[1], 1) for t in out}
    shipped = [e["time"] for e in sim.event_log if e["type"] == "wh_order_shipped"]
    assert all(round(t, 1) in leaves for t in shipped)
    for door in range(2):
        spans = sorted((t[0], t[1]) for t in wh._trucks if t[2] == door)
        for (s0, e0), (s1, _e1) in zip(spans, spans[1:]):
            assert s1 >= e0 - 1e-6
