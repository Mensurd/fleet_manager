"""Iteration 13 backend tests: oil-interval quick-set, oil-report/word export, bela_potvrda doc category."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://maintenance-log-120.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
EMAIL = "duljevic1366@gmail.com"
PASSWORD = "fleet2026"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    token = r.json().get("token") or r.json().get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def vehicle_id(client):
    payload = {"plate": "TEST-IT13", "make": "TestMk", "model": "TestMd", "year": 2020, "vin": "TESTVIN13"}
    r = client.post(f"{API}/vehicles", json=payload, timeout=30)
    assert r.status_code in (200, 201), f"create vehicle failed: {r.status_code} {r.text}"
    vid = r.json().get("id") or r.json().get("_id")
    assert vid
    yield vid
    client.delete(f"{API}/vehicles/{vid}", timeout=30)


def test_oil_interval_persists(client, vehicle_id):
    r = client.post(f"{API}/vehicles/{vehicle_id}/oil-interval", json={"oil_interval_km": 20000, "antifreeze_every": 3}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert int(body.get("oil_interval_km")) == 20000
    assert int(body.get("antifreeze_every")) == 3

    # GET vehicle reflects
    r2 = client.get(f"{API}/vehicles/{vehicle_id}", timeout=30)
    assert r2.status_code == 200
    v = r2.json()
    assert int(v.get("oil_interval_km")) == 20000
    assert int(v.get("antifreeze_every")) == 3

    # service-status reflects
    r3 = client.get(f"{API}/vehicles/{vehicle_id}/service-status", timeout=30)
    assert r3.status_code == 200
    ss = r3.json()
    assert int(ss.get("interval")) == 20000
    assert int(ss.get("antifreeze_every")) == 3


def test_oil_report_word(client, vehicle_id):
    r = client.get(f"{API}/vehicles/{vehicle_id}/oil-report/word", timeout=60)
    assert r.status_code == 200, r.text[:200]
    ct = r.headers.get("content-type", "")
    assert "wordprocessingml" in ct or "officedocument" in ct, f"content-type: {ct}"
    assert r.content[:2] == b"PK", "not a valid docx (missing PK zip signature)"
    assert len(r.content) > 1000


def test_bela_potvrda_category(client, vehicle_id):
    # Upload a document with category bela_potvrda
    pdf_bytes = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
    files = {"file": ("bela.pdf", pdf_bytes, "application/pdf")}
    data = {"category": "bela_potvrda", "name": "Bela potvrda test"}
    r = client.post(f"{API}/vehicles/{vehicle_id}/documents", files=files, data=data, timeout=30)
    assert r.status_code in (200, 201), f"upload failed: {r.status_code} {r.text}"

    r2 = client.get(f"{API}/vehicles/{vehicle_id}/documents", timeout=30)
    assert r2.status_code == 200
    docs = r2.json()
    assert any(d.get("category") == "bela_potvrda" for d in docs), f"bela_potvrda not persisted: {docs}"


def test_second_login(client):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "duljevic.pr@gmail.com", "password": "fleet2026"}, timeout=30)
    assert r.status_code == 200, r.text
