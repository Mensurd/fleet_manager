"""Tests for forgot-password / reset-password flow.

CRITICAL: password must be restored to 'fleet2026' at the end.
"""
import os
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://maintenance-log-120.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "duljevic1366@gmail.com"
ADMIN_PASSWORD = "fleet2026"

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "test_database"


@pytest.fixture(scope="module")
def db():
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME]


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture(scope="module")
def session():
    return requests.Session()


# ---------- forgot-password ----------
def test_forgot_password_existing_email_generic(session):
    r = session.post(f"{API}/auth/forgot-password", json={"email": ADMIN_EMAIL})
    assert r.status_code == 200
    data = r.json()
    assert "message" in data
    assert "Ako nalog" in data["message"]


def test_forgot_password_nonexistent_email_same_response(session):
    r = session.post(f"{API}/auth/forgot-password", json={"email": "nobody-xyz@example.com"})
    assert r.status_code == 200
    data = r.json()
    assert data.get("message", "").startswith("Ako nalog")


# ---------- reset-password validation ----------
def test_reset_password_short(session):
    r = session.post(f"{API}/auth/reset-password", json={"token": "whatever", "new_password": "abc"})
    assert r.status_code == 400
    assert "najmanje 6" in r.json().get("detail", "")


def test_reset_password_unknown_token(session):
    r = session.post(f"{API}/auth/reset-password",
                     json={"token": "nonexistent_token_xyz", "new_password": "abcdef"})
    assert r.status_code == 400
    assert r.json().get("detail") == "Link je nevažeći ili je već iskorišćen"


# ---------- happy path + token reuse + restore ----------
def test_full_reset_flow_and_reuse_and_restore(session, db):
    # Trigger forgot-password
    r = session.post(f"{API}/auth/forgot-password", json={"email": ADMIN_EMAIL})
    assert r.status_code == 200

    async def fetch_token():
        rec = await db.password_reset_tokens.find_one(
            {"email": ADMIN_EMAIL, "used": False},
            sort=[("created_at", -1)],
        )
        return rec

    rec = _run(fetch_token())
    assert rec is not None, "No unused reset token found in Mongo"
    token = rec["token"]

    # Use valid token to set a new temporary password
    temp_pw = "TempPass123!"
    r = session.post(f"{API}/auth/reset-password",
                     json={"token": token, "new_password": temp_pw})
    assert r.status_code == 200, r.text
    assert "uspešno" in r.json().get("message", "")

    # Reusing same token should now fail
    r = session.post(f"{API}/auth/reset-password",
                     json={"token": token, "new_password": "AnotherPass9"})
    assert r.status_code == 400
    assert r.json().get("detail") == "Link je nevažeći ili je već iskorišćen"

    # Login with new temporary password works
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": temp_pw})
    assert r.status_code == 200, f"Login with new pw failed: {r.text}"

    # Old password should NOT work
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code in (400, 401)

    # RESTORE: generate a second token via forgot-password and reset back to fleet2026
    r = session.post(f"{API}/auth/forgot-password", json={"email": ADMIN_EMAIL})
    assert r.status_code == 200

    rec2 = _run(fetch_token())
    assert rec2 is not None and rec2["token"] != token
    r = session.post(f"{API}/auth/reset-password",
                     json={"token": rec2["token"], "new_password": ADMIN_PASSWORD})
    assert r.status_code == 200

    # Confirm restore
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Restore login failed: {r.text}"
