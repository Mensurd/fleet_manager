"""Tests dual-admin login + password reset flow for both accounts.

CRITICAL: BOTH accounts must end with password 'fleet2026'.
"""
import os
import asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_PASSWORD = "fleet2026"
ADMIN_1 = "duljevic1366@gmail.com"
ADMIN_2 = "duljevic.pr@gmail.com"

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "test_database"


@pytest.fixture(scope="module")
def db():
    return AsyncIOMotorClient(MONGO_URL)[DB_NAME]


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture(scope="module")
def session():
    return requests.Session()


# --------- Both accounts login ---------
@pytest.mark.parametrize("email", [ADMIN_1, ADMIN_2])
def test_login_both_admins(session, email):
    r = session.post(f"{API}/auth/login", json={"email": email, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed for {email}: {r.text}"
    data = r.json()
    assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 10
    # response can be flat user or nested under "user"
    user = data.get("user", data)
    assert user.get("email", "").lower() == email.lower()
    assert user.get("role") == "admin"


def _reset_flow(session, db, email, temp_pw):
    """Trigger forgot-pw, reset to temp_pw, verify login, restore to fleet2026."""
    r = session.post(f"{API}/auth/forgot-password", json={"email": email})
    assert r.status_code == 200
    assert "Ako nalog" in r.json().get("message", "")

    async def fetch_token(em):
        return await db.password_reset_tokens.find_one(
            {"email": em, "used": False}, sort=[("created_at", -1)]
        )

    rec = _run(fetch_token(email))
    assert rec is not None, f"No unused reset token for {email}"
    token = rec["token"]

    # reset to temp
    r = session.post(f"{API}/auth/reset-password",
                     json={"token": token, "new_password": temp_pw})
    assert r.status_code == 200, r.text

    # login with temp pw
    r = session.post(f"{API}/auth/login", json={"email": email, "password": temp_pw})
    assert r.status_code == 200, f"Login with temp pw failed for {email}: {r.text}"

    # old pw must fail
    r = session.post(f"{API}/auth/login", json={"email": email, "password": ADMIN_PASSWORD})
    assert r.status_code in (400, 401)

    # restore: new token -> fleet2026
    r = session.post(f"{API}/auth/forgot-password", json={"email": email})
    assert r.status_code == 200
    rec2 = _run(fetch_token(email))
    assert rec2 and rec2["token"] != token
    r = session.post(f"{API}/auth/reset-password",
                     json={"token": rec2["token"], "new_password": ADMIN_PASSWORD})
    assert r.status_code == 200

    # confirm restore
    r = session.post(f"{API}/auth/login", json={"email": email, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Restore login failed for {email}: {r.text}"


def test_reset_flow_admin_2(session, db):
    _reset_flow(session, db, ADMIN_2, "TempPass2!x")


def test_reset_flow_admin_1(session, db):
    _reset_flow(session, db, ADMIN_1, "TempPass1!x")


def test_final_both_logins_fleet2026(session):
    for em in (ADMIN_1, ADMIN_2):
        r = session.post(f"{API}/auth/login", json={"email": em, "password": ADMIN_PASSWORD})
        assert r.status_code == 200, f"FINAL cleanup check failed for {em}: {r.text}"
