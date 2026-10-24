"""Tests for oil-change / antifreeze reminder feature (service-status)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "http://localhost:8001"
ADMIN1 = ("duljevic1366@gmail.com", "fleet2026")
ADMIN2 = ("duljevic.pr@gmail.com", "fleet2026")


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in {r.json()}"
    return tok


@pytest.fixture(scope="module")
def token():
    return _login(*ADMIN1)


@pytest.fixture(scope="module")
def hdr(token):
    return {"Authorization": f"Bearer {token}"}


def test_both_admin_logins():
    _login(*ADMIN1)
    _login(*ADMIN2)


def test_drivers_regression(hdr):
    r = requests.get(f"{BASE_URL}/api/drivers", headers=hdr, timeout=20)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


@pytest.fixture(scope="module")
def throwaway_vehicle(hdr):
    payload = {
        "plate": "TEST-OIL-01",
        "make": "TestMake",
        "model": "TestModel",
        "year": 2020,
        "vehicle_type": "Kamion",
        "vin": "TESTVIN123",
        "oil_interval_km": 15000,
    }
    r = requests.post(f"{BASE_URL}/api/vehicles", json=payload, headers=hdr, timeout=20)
    assert r.status_code in (200, 201), r.text
    v = r.json()
    vid = v.get("id") or v.get("_id")
    assert vid
    yield vid
    # cleanup
    requests.delete(f"{BASE_URL}/api/vehicles/{vid}", headers=hdr, timeout=20)


def test_service_status_zero_oil_changes(hdr, throwaway_vehicle):
    r = requests.get(f"{BASE_URL}/api/vehicles/{throwaway_vehicle}/service-status", headers=hdr, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["interval"] == 15000
    assert d["oil_change_count"] == 0
    assert d["last_oil_odometer"] is None
    assert d["next_change_number"] == 1
    assert d["antifreeze_due_next"] is False
    # base None -> next = interval
    assert d["next_oil_odometer"] == 15000


def test_service_status_after_one_oil_change(hdr, throwaway_vehicle):
    r = requests.post(
        f"{BASE_URL}/api/maintenance",
        json={
            "vehicle_id": throwaway_vehicle,
            "date": "2026-01-15",
            "service_type": "Zamena ulja",
            "description": "test",
            "cost": 100,
            "odometer": 320000,
            "mechanic": "test",
            "status": "Završeno",
        },
        headers=hdr,
        timeout=20,
    )
    assert r.status_code in (200, 201), r.text

    r = requests.get(f"{BASE_URL}/api/vehicles/{throwaway_vehicle}/service-status", headers=hdr, timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d["oil_change_count"] == 1
    assert d["last_oil_odometer"] == 320000
    assert d["current_odometer"] == 320000
    assert d["next_oil_odometer"] == 320000 + 15000
    assert d["next_change_number"] == 2
    assert d["antifreeze_due_next"] is True


def test_service_status_after_two_oil_changes(hdr, throwaway_vehicle):
    r = requests.post(
        f"{BASE_URL}/api/maintenance",
        json={
            "vehicle_id": throwaway_vehicle,
            "date": "2026-02-15",
            "service_type": "Zamena ulja i filtera",
            "description": "second oil",
            "cost": 100,
            "odometer": 335000,
            "mechanic": "test",
            "status": "Završeno",
        },
        headers=hdr,
        timeout=20,
    )
    assert r.status_code in (200, 201), r.text

    r = requests.get(f"{BASE_URL}/api/vehicles/{throwaway_vehicle}/service-status", headers=hdr, timeout=20)
    d = r.json()
    assert d["oil_change_count"] == 2
    assert d["last_oil_odometer"] == 335000
    assert d["next_oil_odometer"] == 335000 + 15000
    assert d["next_change_number"] == 3
    assert d["antifreeze_due_next"] is False


def test_oil_interval_edit_reflects(hdr, throwaway_vehicle):
    # change interval to 20000
    payload = {
        "plate": "TEST-OIL-01",
        "make": "TestMake",
        "model": "TestModel",
        "year": 2020,
        "vehicle_type": "Kamion",
        "vin": "TESTVIN123",
        "oil_interval_km": 20000,
    }
    r = requests.put(f"{BASE_URL}/api/vehicles/{throwaway_vehicle}", json=payload, headers=hdr, timeout=20)
    assert r.status_code == 200, r.text
    r = requests.get(f"{BASE_URL}/api/vehicles/{throwaway_vehicle}/service-status", headers=hdr, timeout=20)
    d = r.json()
    assert d["interval"] == 20000
    assert d["next_oil_odometer"] == 335000 + 20000


def test_vehicles_list(hdr):
    r = requests.get(f"{BASE_URL}/api/vehicles", headers=hdr, timeout=20)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
