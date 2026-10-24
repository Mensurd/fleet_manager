"""Iteration 15: Vehicle-driver assignment (Feature D)."""
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


@pytest.fixture(scope="module")
def driver(client):
    r = client.post(f"{API}/drivers", json={
        "first_name": "TESTIT15", "last_name": "Vozac", "license_number": "IT15-LIC"
    }, timeout=30)
    assert r.status_code in (200, 201), r.text
    did = r.json().get("id") or r.json().get("_id")
    yield {"id": did, "name": "TESTIT15 Vozac"}
    client.delete(f"{API}/drivers/{did}", timeout=30)


@pytest.fixture(scope="module")
def second_admin_login():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "duljevic.pr@gmail.com", "password": "fleet2026"}, timeout=30)
    return r


def test_second_admin_can_login(second_admin_login):
    assert second_admin_login.status_code == 200, second_admin_login.text


def test_create_vehicle_with_driver(client, driver):
    payload = {
        "plate": "TEST-IT15",
        "make": "Fiat",
        "model": "Punto",
        "year": 2018,
        "vin": "IT15VIN",
        "oil_interval_km": 15000,
        "antifreeze_every": 2,
        "current_odometer": 50000,
        "driver_id": driver["id"],
    }
    r = client.post(f"{API}/vehicles", json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    body = r.json()
    vid = body.get("id") or body.get("_id")
    assert vid
    try:
        # GET single vehicle -> driver_name enriched
        g = client.get(f"{API}/vehicles/{vid}", timeout=30)
        assert g.status_code == 200
        gb = g.json()
        assert gb.get("driver_id") == driver["id"], gb
        assert gb.get("driver_name") == driver["name"], gb

        # GET list -> driver_name enriched
        ll = client.get(f"{API}/vehicles", timeout=30)
        assert ll.status_code == 200
        row = next((v for v in ll.json() if (v.get("id") or v.get("_id")) == vid), None)
        assert row and row.get("driver_name") == driver["name"], row

        # PUT to clear driver
        up = client.put(f"{API}/vehicles/{vid}", json={**payload, "driver_id": None}, timeout=30)
        assert up.status_code == 200, up.text
        g2 = client.get(f"{API}/vehicles/{vid}", timeout=30)
        b2 = g2.json()
        assert not b2.get("driver_id"), b2
        assert b2.get("driver_name", "") == "", b2
    finally:
        client.delete(f"{API}/vehicles/{vid}", timeout=30)


def test_drivers_word_collective(client):
    r = client.get(f"{API}/reports/word/drivers", timeout=60)
    assert r.status_code == 200, r.text[:200]
    ct = r.headers.get("content-type", "")
    assert "wordprocessingml" in ct or "officedocument" in ct, ct
    assert r.content[:2] == b"PK"
