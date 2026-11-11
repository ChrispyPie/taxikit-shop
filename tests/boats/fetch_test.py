#!/usr/bin/env python3
"""Enhetstest för Stena-cachen. Ingen nätverkstrafik, ingen API-nyckel."""
import importlib.util
import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("fetch_got_boats", ROOT / "scripts/fetch_got_boats.py")
mod = importlib.util.module_from_spec(spec)
# Avoid running main
sys.modules["fetch_got_boats"] = mod
spec.loader.exec_module(mod)


class FetchBoatsTest(unittest.TestCase):
    def test_slim_frgo_ident_and_terminal(self):
        item = mod.slim({
            "departureId": "ABC",
            "routeCode": "FRGO",
            "ferryCode": "DANI",
            "ferryName": "Stena Danica",
            "localDepartureTime": "2026-11-11T13:45:00",
            "localArrivalTime": "2026-11-11T17:30:00",
            "estimatedLocalArrivalTime": None,
            "status": "On Time",
        })
        self.assertIsNotNone(item)
        self.assertEqual(item["id"], "FRGO-DANI")
        self.assertLessEqual(len(item["id"]), 20)
        self.assertEqual(item["other"], "Fredrikshamn")
        self.assertEqual(item["terminal"], "Danmarksterminalen")
        self.assertEqual(item["area"], "Masthugget")
        self.assertTrue(item["sched"].endswith("+01:00") or item["sched"].endswith("+02:00"))
        self.assertIn("17:30:00", item["sched"])
        self.assertEqual(item["status"], "SCH")
        self.assertFalse(item["canceled"])

    def test_slim_kigo_majnabbe(self):
        item = mod.slim({
            "routeCode": "KIGO",
            "ferryCode": "GERM",
            "ferryName": "Stena Germanica",
            "localDepartureTime": "2026-11-10T17:45:00",
            "localArrivalTime": "2026-11-11T09:15:00",
            "status": "On Time",
        })
        self.assertEqual(item["id"], "KIGO-GERM")
        self.assertEqual(item["other"], "Kiel")
        self.assertEqual(item["terminal"], "Tysklandsterminalen")
        self.assertEqual(item["area"], "Majnabbe")

    def test_delayed_and_cancelled(self):
        delayed = mod.slim({
            "routeCode": "FRGO", "ferryCode": "JUTL", "ferryName": "Stena Jutlandica",
            "localArrivalTime": "2026-11-11T10:00:00",
            "estimatedLocalArrivalTime": "2026-11-11T10:25:00",
            "status": "Delayed",
        })
        self.assertEqual(delayed["status"], "DEL")
        self.assertIn("10:25:00", delayed["est"])
        cancelled = mod.slim({
            "routeCode": "FRGO", "ferryCode": "JUTL", "ferryName": "Stena Jutlandica",
            "localArrivalTime": "2026-11-11T10:00:00",
            "status": "Cancelled",
        })
        self.assertTrue(cancelled["canceled"])
        self.assertEqual(cancelled["status"], "CAN")

    def test_unknown_route_skipped(self):
        self.assertIsNone(mod.slim({
            "routeCode": "GOFR", "ferryCode": "DANI",
            "localArrivalTime": "2026-11-11T10:00:00", "status": "On Time",
        }))

    def test_ais_key_absent_returns_empty(self):
        self.assertEqual(mod.fetch_ais_positions(), {})

    def test_at_berth_sets_act(self):
        arrivals = [mod.slim({
            "routeCode": "FRGO", "ferryCode": "DANI", "ferryName": "Stena Danica",
            "localArrivalTime": datetime.now(mod.TZ).strftime("%Y-%m-%dT%H:%M:%S"),
            "status": "On Time",
        })]
        positions = {"DANI": {"lat": 57.6997, "lon": 11.9386, "sog": 0.1, "nav": 5, "at": mod.now_iso()}}
        out, used = mod.apply_ais(arrivals, positions)
        self.assertEqual(used, 1)
        self.assertTrue(out[0]["act"])
        self.assertEqual(out[0]["ais"]["status"], "vid_kaj")


if __name__ == "__main__":
    unittest.main()
