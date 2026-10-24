"""Iteration 20: Driver login, role guard, RSD/TRY expense conversion, admin settlement recompute."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "duljevic1366@gmail.com"
ADMIN_PW = "fleet2026"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def existing_driver_id(admin_token):
    r = requests.get(f"{API}/drivers", headers=hdr(admin_token), timeout=15)
    assert r.status_code == 200
    drivers = r.json()
    assert drivers, "No drivers exist in DB"
    # Prefer 'mdasd dada' if present
    for d in drivers:
        full = f"{d.get('first_name','')} {d.get('last_name','')}".strip().lower()
        if "mdasd" in full or "dada" in full:
            return d["id"]
    return drivers[0]["id"]


@pytest.fixture(scope="module")
def driver_account(admin_token, existing_driver_id):
    """Try to create new driver account. If backend rejects (duplicate email:null
    unique index bug), fall back to existing vozac1 account seeded from prior runs."""
    uname = f"vozactest_{uuid.uuid4().hex[:6]}"
    pw = "vozac123"
    r = requests.post(
        f"{API}/driver-accounts",
        json={"driver_id": existing_driver_id, "username": uname, "password": pw},
        headers=hdr(admin_token),
        timeout=15,
    )
    if r.status_code == 200:
        return {"username": uname, "password": pw, "driver_id": existing_driver_id, "newly_created": True}
    # Fallback for known bug (email:null unique index)
    return {"username": "vozac1", "password": "vozac123",
            "driver_id": "6ab41f6f28076e7eae3a3f0e", "newly_created": False,
            "create_error": f"{r.status_code}:{r.text[:200]}"}


@pytest.fixture(scope="module")
def driver_token(driver_account):
    r = requests.post(
        f"{API}/auth/login",
        json={"email": driver_account["username"], "password": driver_account["password"]},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["role"] == "driver"
    assert data.get("driver_id") == driver_account["driver_id"]
    return data["token"]


# ---------------- Admin: rates & driver accounts ----------------
class TestAdminSettings:
    def test_admin_login_role(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=hdr(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json().get("role") in ("admin", "owner")

    def test_set_rsd_rate(self, admin_token):
        r = requests.put(f"{API}/settings/rates", json={"rsd_per_eur": 117.0},
                         headers=hdr(admin_token), timeout=15)
        assert r.status_code == 200
        assert float(r.json()["rsd_per_eur"]) == 117.0
        g = requests.get(f"{API}/settings/rates", headers=hdr(admin_token), timeout=15)
        assert g.status_code == 200
        assert float(g.json()["rsd_per_eur"]) == 117.0

    def test_driver_account_created_appears(self, admin_token, driver_account):
        r = requests.get(f"{API}/driver-accounts", headers=hdr(admin_token), timeout=15)
        assert r.status_code == 200
        unames = [a["username"] for a in r.json()]
        assert driver_account["username"] in unames
        # Explicit signal for known backend bug
        assert driver_account["newly_created"], (
            f"CRITICAL: POST /api/driver-accounts fails for any second account: "
            f"{driver_account.get('create_error')}"
        )


# ---------------- Role guard ----------------
class TestRoleGuard:
    def test_driver_forbidden_dashboard(self, driver_token):
        r = requests.get(f"{API}/dashboard", headers=hdr(driver_token), timeout=15)
        assert r.status_code == 403

    def test_driver_forbidden_vehicles(self, driver_token):
        r = requests.get(f"{API}/vehicles", headers=hdr(driver_token), timeout=15)
        assert r.status_code == 403

    def test_driver_forbidden_drivers(self, driver_token):
        r = requests.get(f"{API}/drivers", headers=hdr(driver_token), timeout=15)
        assert r.status_code == 403

    def test_driver_forbidden_settlements(self, driver_token):
        r = requests.get(f"{API}/settlements", headers=hdr(driver_token), timeout=15)
        assert r.status_code == 403

    def test_admin_forbidden_my_tours(self, admin_token):
        r = requests.get(f"{API}/my/tours", headers=hdr(admin_token), timeout=15)
        assert r.status_code == 403


# ---------------- Driver: /my/tours + advance + expense ----------------
class TestDriverPortal:
    def test_my_tours_ok(self, driver_token):
        r = requests.get(f"{API}/my/tours", headers=hdr(driver_token), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def _get_or_create_tour(self, admin_token, driver_token, driver_id):
        tours = requests.get(f"{API}/my/tours", headers=hdr(driver_token), timeout=15).json()
        if tours:
            return tours[0]["id"]
        # Admin creates a settlement for that driver
        veh = requests.get(f"{API}/vehicles", headers=hdr(admin_token), timeout=15).json()
        assert veh, "No vehicles to create settlement"
        payload = {
            "driver_id": driver_id,
            "vehicle_id": veh[0]["id"],
            "date": "2026-01-15",
            "trip_label": "TEST tura",
            "driver_pay": 500,
            "waiting_days": 0,
            "waiting_rate": 0,
            "cash_advance": 0,
            "expenses": [],
        }
        r = requests.post(f"{API}/settlements", json=payload, headers=hdr(admin_token), timeout=15)
        assert r.status_code in (200, 201), r.text
        return r.json()["id"]

    def test_advance_and_expenses_flow(self, admin_token, driver_token, existing_driver_id):
        tour_id = self._get_or_create_tour(admin_token, driver_token, existing_driver_id)

        def fetch():
            row = [t for t in requests.get(f"{API}/my/tours", headers=hdr(driver_token)).json()
                   if t["id"] == tour_id][0]
            return float(row.get("cash_advance") or 0), float((row.get("calc") or {}).get("total_expenses") or 0)

        adv0, exp0 = fetch()

        # 1) Advance +100
        r = requests.post(f"{API}/my/tours/{tour_id}/advance",
                          json={"amount": 100, "note": ""},
                          headers=hdr(driver_token), timeout=15)
        assert r.status_code == 200, r.text
        adv1, exp1 = fetch()
        assert adv1 == pytest.approx(adv0 + 100, abs=0.01), f"adv {adv0}->{adv1}"

        # 2) TRY expense 1200 @ 35 = 34.29 EUR
        r = requests.post(f"{API}/my/tours/{tour_id}/expense",
                          json={"description": "TEST TRY gorivo", "amount": 1200,
                                "country": "Turska", "currency": "TRY", "rate": 35,
                                "paid_from": "advance"},
                          headers=hdr(driver_token), timeout=15)
        assert r.status_code == 200, r.text
        adv2, exp2 = fetch()
        assert exp2 == pytest.approx(exp1 + 34.29, abs=0.05), f"TRY exp {exp1}->{exp2} (resp: {r.json().get('calc',{}).get('total_expenses')})"

        # 3) RSD 11700 @117 = 100 EUR
        r = requests.post(f"{API}/my/tours/{tour_id}/expense",
                          json={"description": "TEST RSD putarina", "amount": 11700,
                                "country": "Srbija", "currency": "RSD", "rate": None,
                                "paid_from": "advance"},
                          headers=hdr(driver_token), timeout=15)
        assert r.status_code == 200, r.text
        adv3, exp3 = fetch()
        assert exp3 == pytest.approx(exp2 + 100.0, abs=0.05), f"RSD exp {exp2}->{exp3}"

        # 4) Admin: settlement reflects driver-entered values
        s = requests.get(f"{API}/settlements", headers=hdr(admin_token), timeout=15).json()
        row = [x for x in s if x["id"] == tour_id][0]
        assert float(row.get("cash_advance") or 0) == pytest.approx(adv3, abs=0.01)
        assert float((row.get("calc") or {}).get("total_expenses") or 0) == pytest.approx(exp3, abs=0.05)

    def test_currency_conversion_edge(self, driver_token, admin_token, existing_driver_id):
        # EUR expense passes through 1:1
        tour_id = self._get_or_create_tour(admin_token, driver_token, existing_driver_id)
        before = [t for t in requests.get(f"{API}/my/tours", headers=hdr(driver_token)).json()
                  if t["id"] == tour_id][0]
        base = float((before.get("calc") or {}).get("total_expenses") or 0)
        r = requests.post(f"{API}/my/tours/{tour_id}/expense",
                          json={"description": "TEST EUR toll", "amount": 12.5,
                                "country": "Evrozona", "currency": "EUR", "rate": None,
                                "paid_from": "own"},
                          headers=hdr(driver_token), timeout=15)
        assert r.status_code == 200, r.text
        assert float(r.json().get("calc", {}).get("total_expenses") or 0) == pytest.approx(base + 12.5, abs=0.05)
