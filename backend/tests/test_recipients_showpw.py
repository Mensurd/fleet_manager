"""Test reminder recipients and login regression."""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://maintenance-log-120.preview.emergentagent.com").rstrip("/")
MAIN_EMAILS = ["duljevic1366@gmail.com", "duljevic.pr@gmail.com"]


def _login():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "duljevic1366@gmail.com", "password": "fleet2026"},
                      timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def test_login_regression():
    tok = _login()
    assert isinstance(tok, str) and len(tok) > 10


def test_recipients_get_returns_both_main_emails():
    tok = _login()
    r = requests.get(f"{BASE_URL}/api/settings/recipients",
                     headers={"Authorization": f"Bearer {tok}"}, timeout=30)
    assert r.status_code == 200, r.text
    recs = r.json()["recipients"]
    assert set(recs) == set(MAIN_EMAILS), f"Expected {MAIN_EMAILS}, got {recs}"


def test_reminders_preview_contains_both():
    tok = _login()
    r = requests.get(f"{BASE_URL}/api/reminders/preview",
                     headers={"Authorization": f"Bearer {tok}"}, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    for e in MAIN_EMAILS:
        assert e in data["recipients"], f"Missing {e} in {data['recipients']}"


def test_recipients_add_then_remove_persists_final_two():
    tok = _login()
    headers = {"Authorization": f"Bearer {tok}"}
    # Add extra test email
    extra = "test_extra_tmp@example.com"
    payload = {"recipients": MAIN_EMAILS + [extra]}
    r = requests.put(f"{BASE_URL}/api/settings/recipients", json=payload, headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    assert extra in r.json()["recipients"]

    # Verify persisted via GET
    r2 = requests.get(f"{BASE_URL}/api/settings/recipients", headers=headers, timeout=30)
    assert extra in r2.json()["recipients"]

    # Now remove extra → final list = two main emails
    r3 = requests.put(f"{BASE_URL}/api/settings/recipients",
                      json={"recipients": MAIN_EMAILS}, headers=headers, timeout=30)
    assert r3.status_code == 200
    assert set(r3.json()["recipients"]) == set(MAIN_EMAILS)

    # Final GET verification
    r4 = requests.get(f"{BASE_URL}/api/settings/recipients", headers=headers, timeout=30)
    assert set(r4.json()["recipients"]) == set(MAIN_EMAILS)


def test_forgot_password_endpoint_ok():
    r = requests.post(f"{BASE_URL}/api/auth/forgot-password",
                      json={"email": "duljevic1366@gmail.com"}, timeout=30)
    # Should not 5xx
    assert r.status_code < 500, r.text
