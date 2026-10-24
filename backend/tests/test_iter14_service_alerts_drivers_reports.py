"""Iteration 14 backend tests:
- dashboard.service_alerts populated with threshold + antifreeze_due + sort
- /api/reports/drivers/excel returns .xlsx
- /api/reports/word/driver/{id} returns .docx
- /api/reminders/preview returns count + service_count + service_items
- /api/reminders/send-now works
- 'Bela potvrda' label (not 'Bela potvrda (osiguranje)')
"""
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
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def service_vehicle(client):
    # oil_interval_km=15000, current_odometer=114600, maint at 100000 -> next 115000, remaining 400
    payload = {
        "plate": "TEST-IT14",
        "make": "Zastava",
        "model": "SrvTest",
        "year": 2019,
        "vin": "TESTVIN14",
        "oil_interval_km": 15000,
        "antifreeze_every": 2,
        "current_odometer": 114600,
    }
    r = client.post(f"{API}/vehicles", json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    vid = r.json().get("id") or r.json().get("_id")
    assert vid
    # Add oil-change maintenance at 100000
    mr = client.post(
        f"{API}/maintenance",
        json={
            "vehicle_id": vid,
            "date": "2024-01-01",
            "service_type": "Zamena ulja",
            "description": "Zamena motornog ulja",
            "odometer": 100000,
            "cost": 5000,
        },
        timeout=30,
    )
    assert mr.status_code in (200, 201), mr.text
    yield vid
    client.delete(f"{API}/vehicles/{vid}", timeout=30)


def test_dashboard_service_alerts(client, service_vehicle):
    r = client.get(f"{API}/dashboard", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "service_alerts" in data, "service_alerts missing"
    alerts = data["service_alerts"]
    assert isinstance(alerts, list)
    match = [a for a in alerts if a.get("vehicle_id") == service_vehicle]
    assert match, f"test vehicle not in alerts: {alerts}"
    a = match[0]
    assert a["remaining_km"] == 400, a
    assert a["next_oil_odometer"] == 115000
    assert a["antifreeze_due"] is True  # next_change_number=2, 2%2==0
    assert a["urgency"] == "soon"
    # sort ascending by remaining_km
    rems = [x["remaining_km"] for x in alerts]
    assert rems == sorted(rems), f"not sorted: {rems}"


def test_drivers_excel(client):
    r = client.get(f"{API}/reports/drivers/excel", timeout=60)
    assert r.status_code == 200, r.text[:200]
    ct = r.headers.get("content-type", "")
    assert "spreadsheetml" in ct or "officedocument" in ct, ct
    assert r.content[:2] == b"PK"
    assert len(r.content) > 500


def test_driver_word(client):
    # Get any driver
    dr = client.get(f"{API}/drivers", timeout=30)
    assert dr.status_code == 200
    drivers = dr.json()
    if not drivers:
        # create one for test
        cr = client.post(
            f"{API}/drivers",
            json={"first_name": "Test", "last_name": "Vozac14", "license_number": "TST14"},
            timeout=30,
        )
        assert cr.status_code in (200, 201), cr.text
        did = cr.json().get("id") or cr.json().get("_id")
        cleanup = True
    else:
        did = drivers[0].get("id") or drivers[0].get("_id")
        cleanup = False
    try:
        r = client.get(f"{API}/reports/word/driver/{did}", timeout=60)
        assert r.status_code == 200, r.text[:200]
        ct = r.headers.get("content-type", "")
        assert "wordprocessingml" in ct or "officedocument" in ct, ct
        assert r.content[:2] == b"PK"
    finally:
        if cleanup:
            client.delete(f"{API}/drivers/{did}", timeout=30)


def test_reminders_preview(client, service_vehicle):
    r = client.get(f"{API}/reminders/preview", timeout=30)
    assert r.status_code == 200, r.text
    b = r.json()
    for k in ("count", "service_count", "service_items", "recipients", "items"):
        assert k in b, f"missing key {k}: {b.keys()}"
    assert isinstance(b["service_items"], list)
    assert b["service_count"] == len(b["service_items"])
    # our test vehicle should be there
    assert any(x.get("vehicle_id") == service_vehicle for x in b["service_items"])


def test_reminders_send_now(client):
    r = client.post(f"{API}/reminders/send-now", timeout=60)
    assert r.status_code == 200, r.text
    b = r.json()
    # should not error out; expect some counts
    assert "count" in b or "sent" in b or "service_count" in b, b


def test_bela_label_not_osiguranje(client, service_vehicle):
    # Upload doc with white_card category
    pdf = b"%PDF-1.4\n%%EOF"
    files = {"file": ("bela.pdf", pdf, "application/pdf")}
    data = {"category": "bela_potvrda", "name": "Bela potvrda test"}
    r = client.post(f"{API}/vehicles/{service_vehicle}/documents", files=files, data=data, timeout=30)
    assert r.status_code in (200, 201), r.text

    # Vehicle Word export should contain 'Bela potvrda' text and NOT 'Bela potvrda (osiguranje)'
    wr = client.get(f"{API}/reports/word/{service_vehicle}", timeout=60)
    assert wr.status_code == 200
    assert wr.content[:2] == b"PK"
    # docx is a zip; search bytes across all parts by decoding roughly
    import zipfile
    import io
    z = zipfile.ZipFile(io.BytesIO(wr.content))
    text = ""
    for name in z.namelist():
        if name.endswith(".xml"):
            try:
                text += z.read(name).decode("utf-8", errors="ignore")
            except Exception:
                pass
    assert "Bela potvrda (osiguranje)" not in text, "old label found in Word export"
