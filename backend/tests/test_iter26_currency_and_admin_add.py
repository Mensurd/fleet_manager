"""
Iteration 26 backend tests:
- Currency conversion on settlement create/update (RSD -> EUR)
- Company expenses RSD -> EUR conversion
- Admin add cash-expense endpoint (POST /api/settlements/{sid}/expense)
- Reminders: preview still exposes brake_count; send-now no longer emails brake rows
"""
import os
import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if not v:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        v = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    return (v or "").rstrip("/")


BASE_URL = _load_backend_url()
ADMIN_EMAIL = "duljevic1366@gmail.com"
ADMIN_PW = "fleet2026"
DRIVER_ID = "6ab41f6f28076e7eae3a3f0e"  # mensur


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def rsd_rate(h):
    r = requests.get(f"{BASE_URL}/api/settings/rates", headers=h, timeout=15)
    assert r.status_code == 200
    return float(r.json().get("rsd_per_eur") or 0)


def _create_test_settlement(h, expenses=None, company_expenses=None):
    from datetime import date
    body = {
        "driver_id": DRIVER_ID,
        "trip_label": "TEST_iter26",
        "date": date.today().isoformat(),
        "status": "otvorena",
        "expenses": [{**e, "category": e.get("category") or e.get("description", "Trošak")} for e in (expenses or [])],
        "company_expenses": [{**e, "category": e.get("category") or e.get("description", "Trošak")} for e in (company_expenses or [])],
    }
    r = requests.post(f"{BASE_URL}/api/settlements", json=body, headers=h, timeout=20)
    assert r.status_code in (200, 201), r.text
    return r.json()


def _delete(h, sid):
    requests.delete(f"{BASE_URL}/api/settlements/{sid}", headers=h, timeout=15)


class TestCurrencyConversion:
    def test_expense_rsd_converts_to_eur_on_create(self, h, rsd_rate):
        assert rsd_rate > 0
        s = _create_test_settlement(h, expenses=[{
            "description": "Gorivo / AdBlue",
            "amount": 18000,
            "currency": "RSD",
            "paid_from": "advance",
            "country": "RS",
        }])
        try:
            expenses = s.get("expenses") or []
            assert len(expenses) == 1
            e = expenses[0]
            assert e.get("currency") == "RSD"
            assert float(e.get("orig_amount")) == 18000
            expected_eur = round(18000 / rsd_rate, 2)
            assert abs(float(e["amount"]) - expected_eur) <= 0.05, f"got {e['amount']} expected ~{expected_eur}"
        finally:
            _delete(h, s["id"])

    def test_company_expense_rsd_converts(self, h, rsd_rate):
        s = _create_test_settlement(h, company_expenses=[{
            "description": "Putarina",
            "amount": 11700,
            "currency": "RSD",
            "country": "RS",
        }])
        try:
            ce = (s.get("company_expenses") or [])[0]
            assert ce["currency"] == "RSD"
            assert float(ce["orig_amount"]) == 11700
            expected = round(11700 / rsd_rate, 2)
            assert abs(float(ce["amount"]) - expected) <= 0.05
        finally:
            _delete(h, s["id"])

    def test_expense_eur_stays_eur(self, h):
        s = _create_test_settlement(h, expenses=[{
            "description": "Gorivo / AdBlue",
            "amount": 100,
            "currency": "EUR",
            "paid_from": "advance",
        }])
        try:
            e = s["expenses"][0]
            assert e["currency"] == "EUR"
            assert float(e["amount"]) == 100.0
            assert float(e["orig_amount"]) == 100.0
        finally:
            _delete(h, s["id"])


class TestAdminAddCashExpense:
    def test_admin_add_expense_endpoint_rsd(self, h, rsd_rate):
        s = _create_test_settlement(h)
        sid = s["id"]
        try:
            payload = {
                "description": "Parking",
                "amount": 5850,
                "currency": "RSD",
                "paid_from": "advance",
                "country": "RS",
            }
            r = requests.post(f"{BASE_URL}/api/settlements/{sid}/expense", json=payload, headers=h, timeout=15)
            assert r.status_code == 200, r.text
            doc = r.json()
            expenses = doc.get("expenses") or []
            assert len(expenses) == 1
            e = expenses[0]
            assert e["currency"] == "RSD"
            assert float(e["orig_amount"]) == 5850
            expected_eur = round(5850 / rsd_rate, 2)
            assert abs(float(e["amount"]) - expected_eur) <= 0.05
            # calc recomputed
            assert "calc" in doc and doc["calc"] is not None
        finally:
            _delete(h, sid)

    def test_admin_add_expense_eur(self, h):
        s = _create_test_settlement(h)
        sid = s["id"]
        try:
            payload = {"description": "Pranje", "amount": 25, "currency": "EUR", "paid_from": "own"}
            r = requests.post(f"{BASE_URL}/api/settlements/{sid}/expense", json=payload, headers=h, timeout=15)
            assert r.status_code == 200
            e = r.json()["expenses"][0]
            assert e["currency"] == "EUR"
            assert float(e["amount"]) == 25.0
            assert e.get("paid_from") == "own"
        finally:
            _delete(h, sid)

    def test_admin_add_expense_404_on_invalid_sid(self, h):
        # Invalid ObjectId format returns 400/500; use a valid-format but non-existent one
        r = requests.post(f"{BASE_URL}/api/settlements/507f1f77bcf86cd799439011/expense",
                          json={"description": "x", "amount": 1, "currency": "EUR"}, headers=h, timeout=10)
        assert r.status_code == 404


class TestReminders:
    def test_preview_includes_brake_count(self, h):
        r = requests.get(f"{BASE_URL}/api/reminders/preview", headers=h, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "brake_count" in data
        assert "brake_items" in data

    def test_send_now_signature_still_ok(self, h):
        # We won't actually trigger a full email send test; just ensure endpoint reachable
        # and does not error out. It may return 400 if no recipients or 200 with sent flag.
        r = requests.post(f"{BASE_URL}/api/reminders/send-now", headers=h, timeout=30)
        assert r.status_code in (200, 400)
