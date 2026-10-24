"""Iteration 18: PDF report, brake_check removal, brake in maintenance + reminders."""
import os
import io
import requests
import pytest
from datetime import date, timedelta

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://maintenance-log-120.preview.emergentagent.com").rstrip("/")
ADMIN = {"email": "duljevic1366@gmail.com", "password": "fleet2026"}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE}/api/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def H(token):
    return {"Authorization": f"Bearer {token}"}


# --- PDF Report ---
def test_pdf_report(H):
    r = requests.get(f"{BASE}/api/reports/pdf", headers=H, timeout=60)
    assert r.status_code == 200, r.text[:200]
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert r.content[:4] == b"%PDF", f"missing PDF magic, got {r.content[:8]!r}"
    assert len(r.content) > 500


def test_word_report(H):
    r = requests.get(f"{BASE}/api/reports/word", headers=H, timeout=60)
    assert r.status_code == 200
    # docx is a zip
    assert r.content[:2] == b"PK"


def test_excel_report(H):
    r = requests.get(f"{BASE}/api/reports/excel", headers=H, timeout=60)
    assert r.status_code == 200
    ct = r.headers.get("content-type", "")
    assert "spreadsheet" in ct or "excel" in ct or r.content[:2] == b"PK" or b"<?xml" in r.content[:50]


# --- Vehicles / Dashboard: no brake_check field, no KeyError ---
def test_vehicles_no_brake_check(H):
    r = requests.get(f"{BASE}/api/vehicles", headers=H, timeout=30)
    assert r.status_code == 200
    vehicles = r.json()
    assert isinstance(vehicles, list)
    for v in vehicles:
        assert "brake_check" not in v, f"brake_check still present on {v.get('plate')}"


def test_dashboard_ok(H):
    r = requests.get(f"{BASE}/api/dashboard", headers=H, timeout=30)
    assert r.status_code == 200
    data = r.json()
    # alerts should not include brake_check doc type
    alerts = data.get("alerts") or data.get("document_alerts") or []
    for a in alerts:
        assert a.get("doc_type") != "brake_check"


# --- Reminders preview: brake_count / brake_items ---
def test_reminders_preview_brake(H):
    r = requests.get(f"{BASE}/api/reminders/preview", headers=H, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert "brake_count" in data, f"brake_count missing; keys={list(data.keys())}"
    assert isinstance(data["brake_count"], int)
    # brake_items list may or may not be present but should be if count>0
    if data["brake_count"] > 0:
        assert "brake_items" in data
        assert isinstance(data["brake_items"], list)


# --- Maintenance: add brake service (regression PUT/POST still works) ---
@pytest.fixture(scope="module")
def test_vehicle_id(H):
    # get first vehicle
    r = requests.get(f"{BASE}/api/vehicles", headers=H, timeout=30)
    vs = r.json()
    if not vs:
        pytest.skip("no vehicles")
    return vs[0]["id"]


def test_add_brake_maintenance(H, test_vehicle_id):
    old_date = (date.today() - timedelta(days=220)).isoformat()  # >6mo
    payload = {
        "vehicle_id": test_vehicle_id,
        "service_type": "Kočnice - zamena pločica (TESTT18)",
        "date": old_date,
        "km": 100000,
        "cost": 1000,
        "notes": "TESTT18 brake",
    }
    r = requests.post(f"{BASE}/api/maintenance", headers=H, json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    mid = r.json().get("id")
    assert mid

    # preview should now include this brake row
    r2 = requests.get(f"{BASE}/api/reminders/preview", headers=H, timeout=30)
    assert r2.status_code == 200
    d = r2.json()
    assert d["brake_count"] >= 1

    # cleanup
    requests.delete(f"{BASE}/api/maintenance/{mid}", headers=H, timeout=30)


# --- Documents on vehicle: no brake_check upload endpoint accepted ---
def test_no_brake_check_field_on_vehicle_create(H):
    payload = {
        "plate": "TESTT18-BR",
        "vehicle_type": "Tegljač",
        "make": "MAN",
        "model": "TGX",
        "brake_check": (date.today() + timedelta(days=30)).isoformat(),
    }
    r = requests.post(f"{BASE}/api/vehicles", headers=H, json=payload, timeout=30)
    # either it succeeds and ignores the field, or 422 rejecting; either way brake_check must not be in the returned doc
    if r.status_code in (200, 201):
        v = r.json()
        assert "brake_check" not in v
        requests.delete(f"{BASE}/api/vehicles/{v['id']}", headers=H, timeout=30)
    else:
        # unknown field should just be ignored by pydantic default
        assert r.status_code in (422, 400)
