"""Iteration 19: Round-Trip Driver Settlement tests"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://maintenance-log-120.preview.emergentagent.com").rstrip("/")
ADMIN = {"email": "duljevic1366@gmail.com", "password": "fleet2026"}


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, f"login failed: {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def driver_id(client):
    r = client.get(f"{BASE_URL}/api/drivers", timeout=15)
    assert r.status_code == 200
    drivers = r.json()
    if drivers:
        return drivers[0]["id"]
    # create one
    r = client.post(f"{BASE_URL}/api/drivers", json={"first_name": "TEST_Vozac", "last_name": "Test"}, timeout=15)
    assert r.status_code in (200, 201)
    return r.json()["id"]


def _payload(driver_id, driver_pay, advance, expenses, trip="TEST_TRIP"):
    return {
        "driver_id": driver_id,
        "trip_label": trip,
        "date": "2026-01-15",
        "driver_pay": driver_pay,
        "cash_advance": advance,
        "expenses": expenses,
        "note": "TEST",
    }


def test_regression_endpoints(client):
    for ep in ["/api/vehicles", "/api/dashboard", "/api/reminders/preview"]:
        r = client.get(f"{BASE_URL}{ep}", timeout=15)
        assert r.status_code == 200, f"{ep} -> {r.status_code}"


def test_case_payout(client, driver_id):
    """pay=300, adv=200, 150 advance + 50 own -> remaining_advance=50, final_due=300"""
    payload = _payload(driver_id, 300, 200, [
        {"category": "Gorivo", "amount": 150, "paid_from": "advance", "note": ""},
        {"category": "Toll", "amount": 50, "paid_from": "own", "note": ""},
    ], "TEST_PAYOUT")
    r = client.post(f"{BASE_URL}/api/settlements", json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    calc = data.get("calc", {})
    assert calc.get("remaining_advance") == 50, calc
    assert calc.get("final_due") == 300, calc
    assert (calc.get("driver_returns") or 0) == 0
    sid = data["id"]

    # GET verify
    r2 = client.get(f"{BASE_URL}/api/settlements", timeout=15)
    assert r2.status_code == 200
    found = next((x for x in r2.json() if x["id"] == sid), None)
    assert found and found["calc"]["final_due"] == 300

    # cleanup
    dr = client.delete(f"{BASE_URL}/api/settlements/{sid}", timeout=15)
    assert dr.status_code in (200, 204)


def test_case_return(client, driver_id):
    """pay=100, adv=500, 100 advance -> remaining_advance=400, final_due=-300, driver_returns=300"""
    payload = _payload(driver_id, 100, 500, [
        {"category": "Gorivo", "amount": 100, "paid_from": "advance", "note": ""},
    ], "TEST_RETURN")
    r = client.post(f"{BASE_URL}/api/settlements", json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    calc = data["calc"]
    assert calc["remaining_advance"] == 400, calc
    assert calc["final_due"] == -300, calc
    assert calc["driver_returns"] == 300, calc
    sid = data["id"]

    # cleanup
    client.delete(f"{BASE_URL}/api/settlements/{sid}", timeout=15)


def test_delete_settlement(client, driver_id):
    payload = _payload(driver_id, 100, 0, [], "TEST_DEL")
    r = client.post(f"{BASE_URL}/api/settlements", json=payload, timeout=15)
    sid = r.json()["id"]
    dr = client.delete(f"{BASE_URL}/api/settlements/{sid}", timeout=15)
    assert dr.status_code in (200, 204)
    r2 = client.get(f"{BASE_URL}/api/settlements", timeout=15)
    assert not any(x["id"] == sid for x in r2.json())
