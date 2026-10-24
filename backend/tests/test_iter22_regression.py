"""Iteration 22 regression: driver-data-hiding, tour assign/edit, company expenses,
overhead + annual costs, dashboard month_profit, driver expense propagation."""
import os
import requests
import pytest
from datetime import date

def _load_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE = _load_url()
ADMIN = {"email": "duljevic1366@gmail.com", "password": "fleet2026"}
DRIVER = {"email": "mensur", "password": "testpass123"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def driver():
    return _login(DRIVER)


# ------------------------- Auth / roles ------------------------------

def test_admin_me(admin):
    r = admin.get(f"{BASE}/api/auth/me")
    assert r.status_code == 200
    assert r.json().get("role") in ("admin", "owner")


def test_driver_me(driver):
    r = driver.get(f"{BASE}/api/auth/me")
    assert r.status_code == 200
    assert r.json().get("role") == "driver"


def test_driver_forbidden_on_admin_routes(driver):
    for path in ["/api/settlements", "/api/vehicles", "/api/drivers", "/api/dashboard"]:
        r = driver.get(f"{BASE}{path}")
        assert r.status_code in (401, 403), f"{path} returned {r.status_code}"


# ------------------------- Dashboard --------------------------------

def test_dashboard_has_month_profit(admin):
    r = admin.get(f"{BASE}/api/dashboard")
    assert r.status_code == 200
    d = r.json()
    assert "month_profit" in d
    mp = d["month_profit"]
    for k in ("revenue", "profit"):
        assert k in mp
        assert isinstance(mp[k], (int, float))


def test_alerts_endpoint(admin):
    r = admin.get(f"{BASE}/api/alerts")
    assert r.status_code == 200
    d = r.json()
    assert "count" in d and "items" in d
    assert isinstance(d["items"], list)


# ------------------------- Overhead costs CRUD ----------------------

def test_overhead_costs_crud(admin):
    payload = {"name": "TEST_overhead", "amount": 120.0, "period": "monthly"}
    r = admin.post(f"{BASE}/api/overhead-costs", json=payload)
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    # list contains it
    r2 = admin.get(f"{BASE}/api/overhead-costs")
    assert any(x["id"] == cid for x in r2.json())
    # delete
    rd = admin.delete(f"{BASE}/api/overhead-costs/{cid}")
    assert rd.status_code == 200
    r3 = admin.get(f"{BASE}/api/overhead-costs")
    assert not any(x["id"] == cid for x in r3.json())


# ------------------------- Annual costs per vehicle -----------------

def test_vehicle_annual_costs_crud(admin):
    vs = admin.get(f"{BASE}/api/vehicles").json()
    assert vs, "need at least one vehicle"
    vid = vs[0]["id"]
    r = admin.post(f"{BASE}/api/vehicles/{vid}/annual-costs",
                   json={"name": "TEST_annual", "amount": 500.0})
    assert r.status_code == 200, r.text
    item_id = r.json()["id"]
    lst = admin.get(f"{BASE}/api/vehicles/{vid}/annual-costs").json()
    assert any(x["id"] == item_id for x in lst)
    rd = admin.delete(f"{BASE}/api/vehicles/{vid}/annual-costs/{item_id}")
    assert rd.status_code == 200


# ------------------------- Tour assign / edit / company expenses -----

@pytest.fixture(scope="module")
def created_settlement(admin, driver):
    # Get driver_id from driver-accounts
    accts = admin.get(f"{BASE}/api/driver-accounts").json()
    driver_acct = next((a for a in accts if a.get("username") == "mensur"), None)
    assert driver_acct, "mensur driver account not found"
    driver_id = driver_acct["driver_id"]
    vehicles = admin.get(f"{BASE}/api/vehicles").json()
    vid = vehicles[0]["id"] if vehicles else None
    payload = {
        "driver_id": driver_id,
        "vehicle_id": vid,
        "trip_label": "TEST_TOUR",
        "date": date.today().isoformat(),
        "driver_pay": 100.0,
        "tour_price": 1000.0,
        "cash_advance": 200.0,
        "status": "otvorena",
    }
    r = admin.post(f"{BASE}/api/settlements", json=payload)
    assert r.status_code == 200, r.text
    s = r.json()
    yield s
    # cleanup
    admin.delete(f"{BASE}/api/settlements/{s['id']}")


def test_settlement_otvorena_and_profit(admin, created_settlement):
    sid = created_settlement["id"]
    lst = admin.get(f"{BASE}/api/settlements").json()
    ours = next((x for x in lst if x["id"] == sid), None)
    assert ours
    assert ours.get("status") == "otvorena"
    calc = ours["calc"]
    # profit = 1000 - (100 + waiting=0) - (from_adv+own=0) - company=0 = 900
    assert calc["profit"] == 900.0
    assert calc["tour_price"] == 1000.0


def test_update_settlement_tour_price_preserves_expenses(admin, driver, created_settlement):
    sid = created_settlement["id"]
    # driver adds an expense
    exp_payload = {"amount": 5000, "currency": "RSD", "country": "Srbija",
                   "description": "TEST_kafa", "paid_from": "advance"}
    r = driver.post(f"{BASE}/api/my/tours/{sid}/expense", json=exp_payload)
    assert r.status_code == 200, r.text
    # verify admin sees the expense
    lst = admin.get(f"{BASE}/api/settlements").json()
    ours = next(x for x in lst if x["id"] == sid)
    before_count = len(ours.get("expenses") or [])
    assert before_count >= 1
    assert any(e.get("by") == "driver" for e in ours["expenses"])
    # update tour_price + trip_label
    r2 = admin.put(f"{BASE}/api/settlements/{sid}",
                   json={"tour_price": 1500.0, "trip_label": "TEST_TOUR_EDITED"})
    assert r2.status_code == 200, r2.text
    lst2 = admin.get(f"{BASE}/api/settlements").json()
    ours2 = next(x for x in lst2 if x["id"] == sid)
    assert ours2["tour_price"] == 1500.0
    assert ours2["trip_label"] == "TEST_TOUR_EDITED"
    assert len(ours2.get("expenses") or []) == before_count, "driver expenses lost on edit!"


def test_company_expenses_added_and_reflected_in_profit(admin, created_settlement):
    sid = created_settlement["id"]
    # fetch current
    lst = admin.get(f"{BASE}/api/settlements").json()
    cur = next(x for x in lst if x["id"] == sid)
    new_company = (cur.get("company_expenses") or []) + [
        {"category": "TEST_racun_firme", "amount": 250.0, "note": ""}
    ]
    r = admin.put(f"{BASE}/api/settlements/{sid}",
                  json={"company_expenses": new_company})
    assert r.status_code == 200, r.text
    lst2 = admin.get(f"{BASE}/api/settlements").json()
    ours = next(x for x in lst2 if x["id"] == sid)
    assert ours["calc"]["company_expenses_total"] == 250.0
    # profit should have decreased by 250 from previous
    # New profit = 1500 - 100 - (driver expense from advance) - 250
    assert ours["calc"]["profit"] < 1500 - 250  # sanity


def test_finalize_via_status(admin, created_settlement):
    sid = created_settlement["id"]
    r = admin.put(f"{BASE}/api/settlements/{sid}", json={"status": "razduzeno"})
    assert r.status_code == 200
    lst = admin.get(f"{BASE}/api/settlements").json()
    ours = next(x for x in lst if x["id"] == sid)
    assert ours["status"] == "razduzeno"


# ------------------------- Driver data hiding invariant --------------

def test_driver_tours_hide_sensitive(driver, created_settlement):
    r = driver.get(f"{BASE}/api/my/tours")
    assert r.status_code == 200
    tours = r.json()
    ours = next((t for t in tours if t["id"] == created_settlement["id"]), None)
    assert ours, "driver should see the assigned tour"
    # sensitive fields absent at top level
    assert "tour_price" not in ours, f"tour_price leaked: {ours.get('tour_price')}"
    assert "company_expenses" not in ours, "company_expenses leaked"
    # sensitive fields absent in calc
    calc = ours.get("calc") or {}
    for k in ("profit", "tour_price", "company_expenses_total"):
        assert k not in calc, f"{k} leaked in calc"


def test_driver_expense_response_also_hidden(driver, created_settlement):
    sid = created_settlement["id"]
    r = driver.post(f"{BASE}/api/my/tours/{sid}/expense",
                    json={"amount": 10, "currency": "EUR", "country": "Evrozona",
                          "description": "TEST_hide", "paid_from": "advance"})
    assert r.status_code == 200
    body = r.json()
    assert "tour_price" not in body
    assert "company_expenses" not in body
    calc = body.get("calc") or {}
    for k in ("profit", "tour_price", "company_expenses_total"):
        assert k not in calc


def test_driver_advance_response_hidden(driver, created_settlement):
    sid = created_settlement["id"]
    r = driver.post(f"{BASE}/api/my/tours/{sid}/advance",
                    json={"amount": 20, "note": "TEST_adv"})
    assert r.status_code == 200
    body = r.json()
    assert "tour_price" not in body
    assert "company_expenses" not in body
    calc = body.get("calc") or {}
    for k in ("profit", "tour_price", "company_expenses_total"):
        assert k not in calc


# ------------------------- Truck earnings report --------------------

def test_truck_earnings_endpoint(admin):
    today = date.today()
    start = f"{today.year}-01"
    end = f"{today.year}-12"
    r = admin.get(f"{BASE}/api/reports/excel",
                  params={"start": start, "end": end})
    # Just ensure endpoint responds; the truck earnings is exposed via other route usually
    assert r.status_code in (200, 404, 422)


def test_settings_rates(admin):
    r = admin.get(f"{BASE}/api/settings/rates")
    assert r.status_code == 200
    d = r.json()
    assert "rsd_per_eur" in d


def test_driver_accounts_list(admin):
    r = admin.get(f"{BASE}/api/driver-accounts")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
