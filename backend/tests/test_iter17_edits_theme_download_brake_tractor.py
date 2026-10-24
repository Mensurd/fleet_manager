"""
Iteration 17 backend tests:
- Maintenance PUT (izmena servisa)
- brake_check on vehicles (status + reports)
- tractor_plate reverse lookup on trailer detail
- Content-Disposition ASCII+UTF-8 fallback for drivers Word (Serbian chars)
- Document image -> PDF conversion via as_pdf=1
- Trailer type (Prikolica) still stores fields; oil hidden is frontend concern
- Regression: /api/reminders/preview count+service_count
"""
import io
import os
import re
import time
import zipfile
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or "https://maintenance-log-120.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "duljevic1366@gmail.com"
ADMIN_PASSWORD = "fleet2026"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def H(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def tractor(H):
    body = {
        "plate": "TESTT17-TR",
        "make": "Volvo",
        "model": "FH",
        "year": 2020,
        "vehicle_type": "Tegljač",
        "vin": "TESTVIN17TR",
    }
    r = requests.post(f"{BASE_URL}/api/vehicles", json=body, headers=H, timeout=30)
    assert r.status_code in (200, 201), r.text
    v = r.json()
    yield v
    requests.delete(f"{BASE_URL}/api/vehicles/{v['id']}", headers=H, timeout=30)


@pytest.fixture(scope="module")
def trailer(H):
    body = {
        "plate": "TESTT17-PR",
        "make": "Schmitz",
        "model": "SKO",
        "year": 2019,
        "vehicle_type": "Prikolica",
        "vin": "TESTVIN17PR",
        "brake_check": {"expiry": "2030-01-01", "note": "test"},
    }
    r = requests.post(f"{BASE_URL}/api/vehicles", json=body, headers=H, timeout=30)
    assert r.status_code in (200, 201), r.text
    v = r.json()
    yield v
    requests.delete(f"{BASE_URL}/api/vehicles/{v['id']}", headers=H, timeout=30)


# ---------------- brake_check ----------------
def test_brake_check_persist_and_status(H, trailer):
    r = requests.get(f"{BASE_URL}/api/vehicles/{trailer['id']}", headers=H, timeout=30)
    assert r.status_code == 200
    v = r.json()
    bc = v.get("brake_check") or {}
    assert bc.get("expiry") == "2030-01-01"
    assert bc.get("status") in ("valid", "expiring", "expired", "none")
    assert bc.get("status") == "valid"


def test_brake_check_expiring_in_dashboard(H):
    # create a vehicle with brake_check expiring within 30 days
    from datetime import date, timedelta
    exp = (date.today() + timedelta(days=10)).isoformat()
    body = {
        "plate": "TESTT17-BC",
        "make": "MAN",
        "model": "TGX",
        "year": 2018,
        "vehicle_type": "Tegljač",
        "vin": "TESTVIN17BC",
        "brake_check": {"expiry": exp},
    }
    r = requests.post(f"{BASE_URL}/api/vehicles", json=body, headers=H, timeout=30)
    assert r.status_code in (200, 201)
    vid = r.json()["id"]
    try:
        d = requests.get(f"{BASE_URL}/api/dashboard", headers=H, timeout=30).json()
        alerts = d.get("alerts", [])
        found = [a for a in alerts if a.get("vehicle_id") == vid and a.get("doc_key") == "brake_check"]
        assert found, "brake_check alert missing from dashboard"
        assert "Provera kočionog sistema" in found[0].get("doc_type", "")
    finally:
        requests.delete(f"{BASE_URL}/api/vehicles/{vid}", headers=H, timeout=30)


# ---------------- tractor_plate reverse ----------------
def test_tractor_plate_on_trailer(H, tractor, trailer):
    # Assign trailer to tractor
    upd = {
        "plate": tractor["plate"],
        "make": tractor["make"],
        "model": tractor["model"],
        "year": tractor["year"],
        "vehicle_type": tractor["vehicle_type"],
        "vin": tractor["vin"],
        "trailer_id": trailer["id"],
    }
    r = requests.put(f"{BASE_URL}/api/vehicles/{tractor['id']}", json=upd, headers=H, timeout=30)
    assert r.status_code == 200, r.text
    # GET trailer detail - should have tractor_plate
    r = requests.get(f"{BASE_URL}/api/vehicles/{trailer['id']}", headers=H, timeout=30)
    assert r.status_code == 200
    v = r.json()
    assert v.get("tractor_plate") == tractor["plate"], f"Expected tractor_plate={tractor['plate']}, got {v.get('tractor_plate')}"


# ---------------- Maintenance PUT ----------------
def test_maintenance_update(H, tractor):
    body = {
        "vehicle_id": tractor["id"],
        "date": "2026-01-05",
        "service_type": "TEST_original",
        "description": "orig desc",
        "cost": 100.0,
        "odometer": 1000,
    }
    r = requests.post(f"{BASE_URL}/api/maintenance", json=body, headers=H, timeout=30)
    assert r.status_code in (200, 201)
    mid = r.json()["id"]
    try:
        upd = dict(body)
        upd["service_type"] = "TEST_updated"
        upd["cost"] = 250.5
        r = requests.put(f"{BASE_URL}/api/maintenance/{mid}", json=upd, headers=H, timeout=30)
        assert r.status_code == 200, r.text
        got = r.json()
        assert got["service_type"] == "TEST_updated"
        assert abs(float(got["cost"]) - 250.5) < 0.01
        # verify persistence via list
        lst = requests.get(f"{BASE_URL}/api/maintenance?vehicle_id={tractor['id']}", headers=H, timeout=30).json()
        m = [x for x in lst if x.get("id") == mid]
        assert m and m[0]["service_type"] == "TEST_updated"
    finally:
        requests.delete(f"{BASE_URL}/api/maintenance/{mid}", headers=H, timeout=30)


# ---------------- Word drivers with Serbian chars ----------------
@pytest.fixture(scope="module")
def sr_driver(H):
    body = {
        "first_name": "Šćepan",
        "last_name": "Đorđević",
        "phone": "+381600000000",
    }
    r = requests.post(f"{BASE_URL}/api/drivers", json=body, headers=H, timeout=30)
    assert r.status_code in (200, 201), r.text
    d = r.json()
    yield d
    requests.delete(f"{BASE_URL}/api/drivers/{d['id']}", headers=H, timeout=30)


def test_word_driver_with_serbian_chars(H, sr_driver):
    r = requests.get(f"{BASE_URL}/api/reports/word/driver/{sr_driver['id']}", headers=H, timeout=60)
    assert r.status_code == 200, r.text
    cd = r.headers.get("content-disposition", "")
    # Should have ASCII fallback and filename*=UTF-8
    assert "filename=" in cd
    assert "filename*=UTF-8''" in cd
    # ASCII part should not contain non-ascii bytes
    ascii_part = cd.split("filename*=")[0]
    ascii_part.encode("ascii")  # will raise if non-ascii present
    # Body must be a real docx (zip)
    assert r.content[:2] == b"PK"


def test_word_drivers_summary(H, sr_driver):
    r = requests.get(f"{BASE_URL}/api/reports/word/drivers", headers=H, timeout=60)
    assert r.status_code == 200
    cd = r.headers.get("content-disposition", "")
    assert "filename*=UTF-8''" in cd
    assert r.content[:2] == b"PK"


# ---------------- Document image -> PDF ----------------
def test_document_image_as_pdf(H, tractor, token):
    # Try uploading a tiny PNG
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), "white").save(buf, format="PNG")
    buf.seek(0)
    files = {"file": ("test17.png", buf.getvalue(), "image/png")}
    r = requests.post(f"{BASE_URL}/api/vehicles/{tractor['id']}/documents",
                      files=files, headers=H, timeout=60)
    if r.status_code >= 500:
        pytest.skip(f"Storage unavailable: {r.status_code} {r.text[:200]}")
    assert r.status_code in (200, 201), r.text
    doc = r.json()
    did = doc.get("id")
    assert did
    try:
        # download as pdf
        r2 = requests.get(f"{BASE_URL}/api/documents/{did}/download",
                          params={"as_pdf": "1"}, headers=H, timeout=60)
        if r2.status_code == 502:
            pytest.skip("Storage backend not available for download")
        assert r2.status_code == 200, r2.text
        assert r2.headers.get("content-type", "").startswith("application/pdf")
        assert r2.content[:4] == b"%PDF"
    finally:
        requests.delete(f"{BASE_URL}/api/documents/{did}", headers=H, timeout=30)


# ---------------- Regression: reminders preview ----------------
def test_reminders_preview_regression(H):
    r = requests.get(f"{BASE_URL}/api/reminders/preview", headers=H, timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert "count" in d
    assert "service_count" in d


# ---------------- Word excel contain 'Provera kočionog sistema' / 'Kočnice' ----------------
def test_word_and_excel_contains_brake_labels(H, trailer):
    # Word per-vehicle
    r = requests.get(f"{BASE_URL}/api/reports/word/{trailer['id']}", headers=H, timeout=60)
    assert r.status_code == 200
    z = zipfile.ZipFile(io.BytesIO(r.content))
    all_xml = b"".join(z.read(n) for n in z.namelist() if n.endswith(".xml"))
    assert b"Provera ko" in all_xml or b"Ko\xc4\x8dnice" in all_xml or "Kočnice".encode() in all_xml, "brake label missing in Word"
    # Excel
    r = requests.get(f"{BASE_URL}/api/reports/excel", headers=H, timeout=60)
    assert r.status_code == 200
    z = zipfile.ZipFile(io.BytesIO(r.content))
    all_xml = b"".join(z.read(n) for n in z.namelist() if n.endswith(".xml"))
    assert b"Ko&#269;nice" in all_xml or "Kočnice".encode() in all_xml, "brake label missing in Excel"
