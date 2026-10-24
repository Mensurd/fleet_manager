"""Iteration 15b: Vehicle trailer assignment + driver_name/trailer_plate enrichment."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"
EMAIL = "duljevic1366@gmail.com"
PASSWORD = "fleet2026"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


def _vid(body):
    return body.get("id") or body.get("_id")


def test_trailer_assignment_flow(client):
    # Create trailer vehicle
    trailer_payload = {
        "plate": "TEST-TRL15",
        "make": "Schmitz",
        "model": "SKO",
        "year": 2019,
        "oil_interval_km": 15000,
        "antifreeze_every": 2,
        "current_odometer": 0,
    }
    r1 = client.post(f"{API}/vehicles", json=trailer_payload, timeout=30)
    assert r1.status_code in (200, 201), r1.text
    tid = _vid(r1.json())

    # Create truck with trailer_id
    truck_payload = {
        "plate": "TEST-TRK15",
        "make": "MAN",
        "model": "TGX",
        "year": 2020,
        "oil_interval_km": 40000,
        "antifreeze_every": 2,
        "current_odometer": 100000,
        "trailer_id": tid,
    }
    r2 = client.post(f"{API}/vehicles", json=truck_payload, timeout=30)
    assert r2.status_code in (200, 201), r2.text
    vid = _vid(r2.json())

    try:
        # GET single
        g = client.get(f"{API}/vehicles/{vid}", timeout=30).json()
        assert g.get("trailer_id") == tid, g
        assert g.get("trailer_plate") == "TEST-TRL15", g

        # GET list has trailer_plate enrichment
        lst = client.get(f"{API}/vehicles", timeout=30).json()
        row = next((v for v in lst if _vid(v) == vid), None)
        assert row and row.get("trailer_plate") == "TEST-TRL15", row

        # PUT clears trailer
        up = client.put(f"{API}/vehicles/{vid}", json={**truck_payload, "trailer_id": None}, timeout=30)
        assert up.status_code == 200, up.text
        g2 = client.get(f"{API}/vehicles/{vid}", timeout=30).json()
        assert not g2.get("trailer_id")
        assert g2.get("trailer_plate", "") == ""
    finally:
        client.delete(f"{API}/vehicles/{vid}", timeout=30)
        client.delete(f"{API}/vehicles/{tid}", timeout=30)


def test_reminders_preview(client):
    r = client.get(f"{API}/reminders/preview", timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    for k in ("count", "service_count", "service_items", "recipients", "items"):
        assert k in body, body


def test_drivers_excel(client):
    r = client.get(f"{API}/reports/drivers/excel", timeout=60)
    assert r.status_code == 200
    assert r.content[:2] == b"PK"
    assert "spreadsheet" in r.headers.get("content-type", "")
