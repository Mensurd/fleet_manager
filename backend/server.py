from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import (
    FastAPI, APIRouter, HTTPException, Request, Response, Depends,
    UploadFile, File, Form, Query, BackgroundTasks,
)
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
import uuid
import secrets
import hmac
import re
import ipaddress
import requests
import httpx
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from openpyxl import Workbook
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, BeforeValidator, ConfigDict
from typing import List, Optional, Annotated
from bson import ObjectId
from datetime import datetime, timezone, timedelta, date
import logging
import io
import time
import bcrypt
import jwt
import asyncio
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from docx import Document

from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH

# ---------------- DB ----------------
import certifi
import pymongo
import gridfs

mongo_url = os.environ.get('MONGO_URL', '').strip().strip('"').strip("'")
client_kwargs = {
    "serverSelectionTimeoutMS": 15000,
}
if "mongodb+srv://" in mongo_url or "ssl=true" in mongo_url.lower() or "tls=true" in mongo_url.lower():
    try:
        client_kwargs["tlsCAFile"] = certifi.where()
    except Exception:
        pass

client = AsyncIOMotorClient(mongo_url, **client_kwargs)
db_name = os.environ.get('DB_NAME', 'fleet_manager').strip().strip('"').strip("'")
db = client[db_name]

sync_client = pymongo.MongoClient(mongo_url, **client_kwargs)
sync_db = sync_client[db_name]
fs = gridfs.GridFS(sync_db)


app = FastAPI()
api_router = APIRouter(prefix="/api")


@app.api_route("/health", methods=["GET", "HEAD"])
@api_router.api_route("/health", methods=["GET", "HEAD"])
@app.api_route("/", methods=["GET", "HEAD"])
@api_router.api_route("/", methods=["GET", "HEAD"])
async def health_check():
    return {"status": "ok"}


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------- Auth utils ----------------
JWT_ALGORITHM = "HS256"


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email,
               "exp": datetime.now(timezone.utc) + timedelta(hours=12), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id,
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=True,
                        samesite="none", max_age=43200, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True,
                        samesite="none", max_age=604800, path="/")


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Niste prijavljeni")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Neispravan token")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="Korisnik nije pronađen")
        user["id"] = str(user["_id"])
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sesija je istekla")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Neispravan token")


# ---------------- Models ----------------
PyObjectId = Annotated[str, BeforeValidator(str)]


class LoginRequest(BaseModel):
    email: str
    password: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class DocInfo(BaseModel):
    expiry: Optional[str] = None  # ISO date YYYY-MM-DD
    note: Optional[str] = None


class VehicleCreate(BaseModel):
    plate: str
    make: str = ""
    model: str = ""
    year: Optional[int] = None
    vehicle_type: str = "Kamion"
    vin: str = ""
    driver_id: Optional[str] = None
    trailer_id: Optional[str] = None
    oil_interval_km: int = 15000
    antifreeze_every: int = 2
    current_odometer: Optional[int] = None
    tech_6m: DocInfo = Field(default_factory=DocInfo)
    registration_12m: DocInfo = Field(default_factory=DocInfo)
    cmr_insurance: DocInfo = Field(default_factory=DocInfo)
    kasko_insurance: DocInfo = Field(default_factory=DocInfo)
    white_card: DocInfo = Field(default_factory=DocInfo)
    tachograph: DocInfo = Field(default_factory=DocInfo)


class ExpenseItem(BaseModel):
    category: str
    amount: float = 0
    paid_from: str = "advance"  # advance | own
    note: str = ""
    currency: str = "EUR"
    rate: Optional[float] = None
    country: Optional[str] = None
    by: Optional[str] = None
    id: Optional[str] = None


class CompanyExpenseItem(BaseModel):
    category: str
    amount: float = 0
    note: str = ""
    currency: str = "EUR"
    rate: Optional[float] = None


class SettlementCreate(BaseModel):
    driver_id: str
    vehicle_id: Optional[str] = None
    trip_label: str = ""
    date: str
    driver_pay: float = 0
    tour_price: float = 0
    cash_advance: float = 0
    waiting_days: float = 0
    waiting_rate: float = 0
    waiting_amount: float = 0
    expenses: List[ExpenseItem] = Field(default_factory=list)
    company_expenses: List[CompanyExpenseItem] = Field(default_factory=list)
    note: str = ""
    status: Optional[str] = None  # otvorena | razduzeno


class SettlementUpdate(BaseModel):
    driver_id: Optional[str] = None
    vehicle_id: Optional[str] = None
    trip_label: Optional[str] = None
    date: Optional[str] = None
    driver_pay: Optional[float] = None
    tour_price: Optional[float] = None
    cash_advance: Optional[float] = None
    waiting_days: Optional[float] = None
    waiting_rate: Optional[float] = None
    waiting_amount: Optional[float] = None
    expenses: Optional[List[ExpenseItem]] = None
    company_expenses: Optional[List[CompanyExpenseItem]] = None
    status: Optional[str] = None


class MaintenanceCreate(BaseModel):
    vehicle_id: str
    date: str
    service_type: str
    description: str = ""
    cost: float = 0
    cost_currency: str = "RSD"  # RSD | EUR
    odometer: Optional[int] = None
    mechanic: str = ""
    mechanic_cost: float = 0
    status: str = "Završeno"


class MechanicLaborUpdate(BaseModel):
    mechanic_cost: float = 0
    mechanic: Optional[str] = None
    cost_currency: Optional[str] = None


class RecipientsUpdate(BaseModel):
    recipients: List[EmailStr] = []


class DriverCreate(BaseModel):
    first_name: str
    last_name: str = ""
    phone: str = ""
    id_number: str = ""
    license: DocInfo = Field(default_factory=DocInfo)
    passport: DocInfo = Field(default_factory=DocInfo)
    medical: DocInfo = Field(default_factory=DocInfo)
    cod95: DocInfo = Field(default_factory=DocInfo)
    driver_card: DocInfo = Field(default_factory=DocInfo)


# ---------------- Helpers ----------------
def doc_status(expiry: Optional[str]) -> str:
    if not expiry:
        return "none"
    try:
        exp = date.fromisoformat(expiry)
    except ValueError:
        return "none"
    today = date.today()
    if exp < today:
        return "expired"
    if (exp - today).days <= 30:
        return "expiring"
    return "valid"


def fmt_ddmmyy(iso, empty="-"):
    if not iso:
        return empty
    try:
        return date.fromisoformat(iso).strftime("%d.%m.%y")
    except (ValueError, TypeError):
        return iso


def content_disposition(filename, inline=False):
    from urllib.parse import quote
    ascii_name = filename.encode("ascii", "ignore").decode().strip() or "download"
    disp = "inline" if inline else "attachment"
    return f"{disp}; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"



def serialize_vehicle(doc: dict) -> dict:
    doc["id"] = str(doc["_id"])
    doc.pop("_id", None)
    for key in ["tech_6m", "registration_12m", "cmr_insurance", "kasko_insurance", "white_card", "tachograph"]:
        info = doc.get(key) or {}
        doc[key] = {"expiry": info.get("expiry"), "note": info.get("note"),
                    "status": doc_status(info.get("expiry"))}
    return doc


DRIVER_DOC_KEYS = ["license", "passport", "medical", "cod95", "driver_card"]
DRIVER_DOC_LABELS = {"license": "Vozačka dozvola", "passport": "Pasoš",
                     "medical": "Lekarsko uverenje", "cod95": "CoD95 (Kôd 95)",
                     "driver_card": "Kartica vozača"}


def serialize_driver(doc: dict) -> dict:
    doc["id"] = str(doc["_id"])
    doc.pop("_id", None)
    for key in DRIVER_DOC_KEYS:
        info = doc.get(key) or {}
        doc[key] = {"expiry": info.get("expiry"), "note": info.get("note"),
                    "status": doc_status(info.get("expiry"))}
    return doc


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") == "driver":
        raise HTTPException(status_code=403, detail="Nemate pristup ovom delu")
    return user


async def require_driver(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "driver" or not user.get("driver_id"):
        raise HTTPException(status_code=403, detail="Dostupno samo vozačima")
    return user


# ---------------- Auth routes ----------------
@api_router.post("/auth/login")
async def login(payload: LoginRequest, response: Response):
    ident = (payload.email or "").strip()
    user = await db.users.find_one({"$or": [
        {"email": ident.lower()},
        {"username": {"$regex": f"^{re.escape(ident)}$", "$options": "i"}},
    ]})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Pogrešan email/korisničko ime ili lozinka")
    uid = str(user["_id"])
    access = create_access_token(uid, user.get("email") or ident)
    refresh = create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    return {"id": uid, "email": user.get("email"), "username": user.get("username"),
            "name": user.get("name"), "role": user.get("role"),
            "driver_id": user.get("driver_id"), "company": user.get("company"), "token": access}


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Odjavljeni ste"}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api_router.post("/auth/change-password")
async def change_password(payload: PasswordChange, user: dict = Depends(get_current_user)):
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="Nova lozinka mora imati najmanje 6 karaktera")
    record = await db.users.find_one({"_id": ObjectId(user["id"])})
    if not record or not verify_password(payload.current_password, record["password_hash"]):
        raise HTTPException(status_code=400, detail="Trenutna lozinka nije tačna")
    await db.users.update_one(
        {"_id": ObjectId(user["id"])},
        {"$set": {"password_hash": hash_password(payload.new_password), "password_changed": True}},
    )
    return {"message": "Lozinka je uspešno promenjena"}


def render_reset_html(link: str) -> str:
    safe = escape(link)
    return (
        "<table role='presentation' width='100%'><tr><td style='padding:24px;font-family:Arial,sans-serif;color:#0f172a'>"
        "<h2 style='margin:0 0 4px'>Resetovanje lozinke</h2>"
        "<p style='margin:0 0 16px;color:#475569'>APR MENSUR DULJEVIĆ — Fleet Manager</p>"
        "<p>Primili smo zahtev za resetovanje lozinke za vaš nalog. Kliknite na dugme ispod (link važi 1 sat):</p>"
        f"<p style='margin:20px 0'><a href='{safe}' style='background:#2563eb;color:#ffffff;padding:11px 20px;"
        "border-radius:8px;text-decoration:none;font-weight:bold'>Resetuj lozinku</a></p>"
        f"<p style='font-size:12px;color:#64748b'>Ako dugme ne radi, kopirajte ovaj link u pretraživač:<br>{safe}</p>"
        "<p style='font-size:12px;color:#94a3b8;margin-top:20px'>Ako niste vi poslali zahtev, slobodno ignorišite ovaj email. "
        "Nikada ne tražimo lozinku niti podatke o kartici putem emaila.</p>"
        "</td></tr></table>"
    )


@api_router.post("/auth/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest, request: Request):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if user:
        token = secrets.token_urlsafe(32)
        await db.password_reset_tokens.insert_one({
            "token": token,
            "email": email,
            "expires_at": datetime.now(timezone.utc) + timedelta(hours=1),
            "used": False,
            "created_at": datetime.now(timezone.utc),
        })
        origin = request.headers.get("origin") or request.headers.get("referer") or ""
        origin = origin.split("?")[0].rstrip("/")
        if origin.endswith("/zaboravljena-lozinka") or origin.endswith("/login"):
            origin = origin.rsplit("/", 1)[0]
        base = (os.environ.get("FRONTEND_URL") or origin or "https://aprmensurduljevic.vercel.app").strip().rstrip("/")
        if not base.startswith("http://") and not base.startswith("https://"):
            base = f"https://{base}"
        link = f"{base}/reset-lozinka?token={token}"
        try:
            await send_email(to=email, subject=f"Resetovanje lozinke — {EMAIL_FROM_NAME}",
                             html=render_reset_html(link))
            logger.info(f"Reset email sent to {email}")
        except Exception as e:
            logger.error(f"Reset email failed: {e}")
    return {"message": "Ako nalog sa tom adresom postoji, poslali smo link za resetovanje lozinke na email."}


@api_router.post("/auth/reset-password")
async def reset_password(payload: ResetPasswordRequest):
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="Nova lozinka mora imati najmanje 6 karaktera")
    rec = await db.password_reset_tokens.find_one({"token": payload.token})
    if not rec or rec.get("used"):
        raise HTTPException(status_code=400, detail="Link je nevažeći ili je već iskorišćen")
    exp = rec.get("expires_at")
    if isinstance(exp, str):
        try:
            exp = datetime.fromisoformat(exp.replace("Z", "+00:00"))
        except Exception:
            exp = None
    if isinstance(exp, datetime):
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Link je istekao. Zatražite novi.")
    await db.users.update_one(
        {"email": rec["email"]},
        {"$set": {"password_hash": hash_password(payload.new_password), "password_changed": True}},
    )
    await db.password_reset_tokens.update_one({"_id": rec["_id"]}, {"$set": {"used": True}})
    return {"message": "Lozinka je uspešno resetovana"}



# ---------------- Vehicle routes ----------------
@api_router.get("/vehicles")
async def list_vehicles(user: dict = Depends(require_admin)):
    docs = await db.vehicles.find().sort("plate", 1).to_list(1000)
    drivers = await db.drivers.find().to_list(1000)
    name_by_id = {str(d["_id"]): f"{d.get('first_name','')} {d.get('last_name','')}".strip() for d in drivers}
    plate_by_id = {str(d["_id"]): d.get("plate", "") for d in docs}
    tractor_by_trailer = {str(d.get("trailer_id")): d.get("plate", "") for d in docs if d.get("trailer_id")}
    result = []
    for d in docs:
        v = serialize_vehicle(d)
        v["driver_name"] = name_by_id.get(v.get("driver_id") or "", "")
        v["trailer_plate"] = plate_by_id.get(v.get("trailer_id") or "", "")
        v["tractor_plate"] = tractor_by_trailer.get(v["id"], "")
        result.append(v)
    return result


@api_router.post("/vehicles")
async def create_vehicle(payload: VehicleCreate, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.vehicles.insert_one(doc)
    created = await db.vehicles.find_one({"_id": res.inserted_id})
    return serialize_vehicle(created)


@api_router.get("/vehicles/{vehicle_id}")
async def get_vehicle(vehicle_id: str, user: dict = Depends(get_current_user)):
    doc = await db.vehicles.find_one({"_id": ObjectId(vehicle_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Vozilo nije pronađeno")
    v = serialize_vehicle(doc)
    v["driver_name"] = ""
    did = v.get("driver_id")
    if did:
        try:
            d = await db.drivers.find_one({"_id": ObjectId(did)})
            if d:
                v["driver_name"] = f"{d.get('first_name','')} {d.get('last_name','')}".strip()
        except Exception:
            pass
    v["trailer_plate"] = ""
    tid = v.get("trailer_id")
    if tid:
        try:
            t = await db.vehicles.find_one({"_id": ObjectId(tid)})
            if t:
                v["trailer_plate"] = t.get("plate", "")
        except Exception:
            pass
    v["tractor_plate"] = ""
    try:
        tr = await db.vehicles.find_one({"trailer_id": vehicle_id})
        if tr:
            v["tractor_plate"] = tr.get("plate", "")
    except Exception:
        pass
    return v


@api_router.put("/vehicles/{vehicle_id}")
async def update_vehicle(vehicle_id: str, payload: VehicleCreate, user: dict = Depends(get_current_user)):
    await db.vehicles.update_one({"_id": ObjectId(vehicle_id)}, {"$set": payload.model_dump()})
    doc = await db.vehicles.find_one({"_id": ObjectId(vehicle_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Vozilo nije pronađeno")
    return serialize_vehicle(doc)


@api_router.post("/vehicles/{vehicle_id}/odometer")
async def set_odometer(vehicle_id: str, payload: dict, user: dict = Depends(get_current_user)):
    km = int(payload.get("odometer") or 0)
    await db.vehicles.update_one({"_id": ObjectId(vehicle_id)}, {"$set": {"current_odometer": km}})
    doc = await db.vehicles.find_one({"_id": ObjectId(vehicle_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Vozilo nije pronađeno")
    return serialize_vehicle(doc)


@api_router.post("/vehicles/{vehicle_id}/oil-interval")
async def set_oil_interval(vehicle_id: str, payload: dict, user: dict = Depends(get_current_user)):
    upd = {}
    if payload.get("oil_interval_km") is not None:
        upd["oil_interval_km"] = int(payload.get("oil_interval_km") or 15000)
    if payload.get("antifreeze_every") is not None:
        upd["antifreeze_every"] = max(1, int(payload.get("antifreeze_every") or 2))
    if upd:
        await db.vehicles.update_one({"_id": ObjectId(vehicle_id)}, {"$set": upd})
    doc = await db.vehicles.find_one({"_id": ObjectId(vehicle_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Vozilo nije pronađeno")
    return serialize_vehicle(doc)


@api_router.get("/vehicles/{vehicle_id}/oil-report/word")
async def oil_report_word(vehicle_id: str, user: dict = Depends(get_current_user)):
    v = await db.vehicles.find_one({"_id": ObjectId(vehicle_id)})
    if not v:
        raise HTTPException(status_code=404, detail="Vozilo nije pronađeno")
    maint = await db.maintenance.find({"vehicle_id": vehicle_id}).to_list(2000)
    changes = [m for m in maint if re.search(r"ulj|antifriz", f"{m.get('service_type','')} {m.get('description','')}", re.I)]
    changes.sort(key=lambda m: m.get("date", ""), reverse=True)
    document = Document()
    t = document.add_heading("Istorija zamena ulja i antifriza", level=0)
    t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    s = document.add_paragraph("APR MENSUR DULJEVIĆ")
    s.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for r in s.runs:
        r.bold = True
    _pib = document.add_paragraph("PIB: 114365454   ·   MB: 67518896")
    _pib.alignment = WD_ALIGN_PARAGRAPH.CENTER
    document.add_paragraph(f"Vozilo: {v.get('plate','')}  ·  {v.get('make','')} {v.get('model','')}")
    document.add_paragraph(f"Interval zamene ulja: {int(v.get('oil_interval_km') or 15000)} km   ·   "
                           f"Antifriz na svaku {int(v.get('antifreeze_every') or 2)}. zamenu ulja")
    document.add_paragraph(f"Datum: {date.today().strftime('%d.%m.%y')}")
    table = document.add_table(rows=1, cols=5)
    table.style = "Light Grid Accent 1"
    h = table.rows[0].cells
    for i, x in enumerate(["Datum", "Tip", "Vrsta servisa", "Kilometraža", "Trošak"]):
        h[i].text = x
    for m in changes:
        is_anti = bool(re.search(r"antifriz", f"{m.get('service_type','')} {m.get('description','')}", re.I))
        row = table.add_row().cells
        row[0].text = m.get("date", "")
        row[1].text = "Antifriz" if is_anti else "Ulje"
        row[2].text = m.get("service_type", "")
        row[3].text = str(m.get("odometer") or "")
        row[4].text = _fmt_rsd(float(m.get("cost", 0) or 0))
    buf = io.BytesIO()
    document.save(buf)
    buf.seek(0)
    fname = f"zamene_ulja_{v.get('plate','').replace(' ', '_')}.docx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": content_disposition(fname)},
    )


@api_router.delete("/vehicles/{vehicle_id}")
async def delete_vehicle(vehicle_id: str, user: dict = Depends(get_current_user)):
    await db.vehicles.delete_one({"_id": ObjectId(vehicle_id)})
    await db.maintenance.delete_many({"vehicle_id": vehicle_id})
    return {"message": "Vozilo obrisano"}


# ---------------- Vehicle service reminders ----------------
SERVICE_REMINDER_KM = 1000  # prag za podsetnik pred zamenu ulja/antifriza


def compute_service_status(v: dict, maint: list) -> dict:
    interval = int(v.get("oil_interval_km") or 15000)
    every = max(1, int(v.get("antifreeze_every") or 2))

    def odo(m):
        return int(m.get("odometer") or 0)

    def is_oil(m):
        t = f"{m.get('service_type','')} {m.get('description','')}".lower()
        return "ulj" in t
    oil = sorted([m for m in maint if is_oil(m)], key=lambda m: (odo(m), m.get("date", "")))
    count = len(oil)
    last_oil_odo = odo(oil[-1]) if oil else None
    all_odo = [odo(m) for m in maint if m.get("odometer")]
    manual = int(v.get("current_odometer") or 0)
    candidates = all_odo + ([manual] if manual else [])
    current_odo = max(candidates) if candidates else None
    base = last_oil_odo if last_oil_odo else current_odo
    next_oil_odo = (base + interval) if base is not None else None
    remaining = (next_oil_odo - current_odo) if (next_oil_odo is not None and current_odo is not None) else None
    next_change_number = count + 1
    return {
        "interval": interval,
        "antifreeze_every": every,
        "oil_change_count": count,
        "last_oil_odometer": last_oil_odo,
        "current_odometer": current_odo,
        "next_oil_odometer": next_oil_odo,
        "remaining_km": remaining,
        "next_change_number": next_change_number,
        "antifreeze_due_next": next_change_number % every == 0,
    }


@api_router.get("/vehicles/{vehicle_id}/service-status")
async def service_status(vehicle_id: str, user: dict = Depends(get_current_user)):
    v = await db.vehicles.find_one({"_id": ObjectId(vehicle_id)})
    if not v:
        raise HTTPException(status_code=404, detail="Vozilo nije pronađeno")
    maint = await db.maintenance.find({"vehicle_id": vehicle_id}).to_list(2000)
    return compute_service_status(v, maint)


async def collect_service_alerts():
    """Vozila kojima uskoro (ili je prekoračena) sledi zamena ulja/antifriza, sortirana po hitnosti."""
    vehicles = await db.vehicles.find().to_list(1000)
    maint = await db.maintenance.find().to_list(5000)
    by_v = {}
    for m in maint:
        by_v.setdefault(m.get("vehicle_id", ""), []).append(m)
    rows = []
    for v in vehicles:
        st = compute_service_status(v, by_v.get(str(v["_id"]), []))
        rem = st["remaining_km"]
        if rem is None or rem > SERVICE_REMINDER_KM:
            continue
        rows.append({
            "vehicle_id": str(v["_id"]),
            "plate": v.get("plate", ""),
            "make": v.get("make", ""),
            "model": v.get("model", ""),
            "remaining_km": rem,
            "next_oil_odometer": st["next_oil_odometer"],
            "current_odometer": st["current_odometer"],
            "antifreeze_due": st["antifreeze_due_next"],
            "urgency": "overdue" if rem <= 0 else "soon",
        })
    rows.sort(key=lambda r: r["remaining_km"])
    return rows


# ---------------- Driver routes ----------------
@api_router.get("/drivers")
async def list_drivers(user: dict = Depends(require_admin)):
    docs = await db.drivers.find().sort("last_name", 1).to_list(1000)
    return [serialize_driver(d) for d in docs]


@api_router.post("/drivers")
async def create_driver(payload: DriverCreate, user: dict = Depends(require_admin)):
    doc = payload.model_dump()
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.drivers.insert_one(doc)
    created = await db.drivers.find_one({"_id": res.inserted_id})
    return serialize_driver(created)


@api_router.get("/drivers/{driver_id}")
async def get_driver(driver_id: str, user: dict = Depends(require_admin)):
    doc = await db.drivers.find_one({"_id": ObjectId(driver_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Vozač nije pronađen")
    return serialize_driver(doc)


@api_router.put("/drivers/{driver_id}")
async def update_driver(driver_id: str, payload: DriverCreate, user: dict = Depends(require_admin)):
    await db.drivers.update_one({"_id": ObjectId(driver_id)}, {"$set": payload.model_dump()})
    doc = await db.drivers.find_one({"_id": ObjectId(driver_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Vozač nije pronađen")
    return serialize_driver(doc)


@api_router.delete("/drivers/{driver_id}")
async def delete_driver(driver_id: str, user: dict = Depends(require_admin)):
    await db.drivers.delete_one({"_id": ObjectId(driver_id)})
    return {"message": "Vozač obrisan"}


LOOKUP_DEFAULTS = {
    "service_type": ["Zamena ulja", "Zamena antifriza", "Kočnice - zamena pločica",
                     "Tehnički pregled", "Servis", "Gume", "Filteri", "Akumulator"],
    "expense_category": ["Gorivo / AdBlue", "Putarine / Vinjete", "Parking", "Popravke", "Hrana / Ostalo"],
    "vehicle_type": ["Kamion", "Prikolica", "Kombi", "Auto"],
}


class LookupCreate(BaseModel):
    value: str


class LookupRename(BaseModel):
    old_value: str
    new_value: str


class OverheadCostCreate(BaseModel):
    name: str
    amount: float = 0
    period: str = "monthly"  # monthly | yearly


class AnnualCostItem(BaseModel):
    name: str
    amount: float = 0


async def _seed_lookup(category: str):
    if await db.lookups.count_documents({"category": category}) > 0:
        return
    vals = {v.strip() for v in LOOKUP_DEFAULTS.get(category, []) if v.strip()}
    if category == "service_type":
        vals |= {v.strip() for v in await db.maintenance.distinct("service_type") if v and v.strip()}
    elif category == "vehicle_type":
        vals |= {v.strip() for v in await db.vehicles.distinct("vehicle_type") if v and v.strip()}
    elif category == "expense_category":
        docs = await db.settlements.find({}, {"expenses.category": 1}).to_list(2000)
        for d in docs:
            for e in (d.get("expenses") or []):
                c = (e.get("category") or "").strip()
                if c:
                    vals.add(c)
    now = datetime.now(timezone.utc).isoformat()
    if vals:
        await db.lookups.insert_many([{"category": category, "value": v, "created_at": now} for v in sorted(vals)])


@api_router.get("/lookups/{category}")
async def list_lookups(category: str, user: dict = Depends(get_current_user)):
    await _seed_lookup(category)
    docs = await db.lookups.find({"category": category}).to_list(1000)
    return sorted({d["value"] for d in docs if d.get("value")}, key=lambda s: s.lower())


@api_router.post("/lookups/{category}")
async def add_lookup(category: str, payload: LookupCreate, user: dict = Depends(get_current_user)):
    v = (payload.value or "").strip()
    if not v:
        raise HTTPException(status_code=400, detail="Vrednost je obavezna")
    exists = await db.lookups.find_one({"category": category,
                                        "value": {"$regex": f"^{re.escape(v)}$", "$options": "i"}})
    if not exists:
        await db.lookups.insert_one({"category": category, "value": v,
                                     "created_at": datetime.now(timezone.utc).isoformat()})
    return {"value": v}


@api_router.put("/lookups/{category}")
async def rename_lookup(category: str, payload: LookupRename, user: dict = Depends(get_current_user)):
    old = (payload.old_value or "").strip()
    new = (payload.new_value or "").strip()
    if not new:
        raise HTTPException(status_code=400, detail="Nova vrednost je obavezna")
    await db.lookups.update_one({"category": category, "value": old}, {"$set": {"value": new}})
    return {"old": old, "new": new}


@api_router.delete("/lookups/{category}")
async def delete_lookup(category: str, value: str, user: dict = Depends(get_current_user)):
    await db.lookups.delete_one({"category": category, "value": value})
    return {"message": "Opcija obrisana"}


def serialize_overhead(d: dict) -> dict:
    return {"id": str(d["_id"]), "name": d.get("name", ""),
            "amount": float(d.get("amount") or 0), "period": d.get("period", "monthly")}


@api_router.get("/overhead-costs")
async def list_overhead(user: dict = Depends(require_admin)):
    docs = await db.overhead_costs.find().sort("created_at", 1).to_list(1000)
    return [serialize_overhead(d) for d in docs]


@api_router.post("/overhead-costs")
async def add_overhead(payload: OverheadCostCreate, user: dict = Depends(require_admin)):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Naziv troška je obavezan")
    period = payload.period if payload.period in ("monthly", "yearly") else "monthly"
    doc = {"name": name, "amount": float(payload.amount or 0), "period": period,
           "created_at": datetime.now(timezone.utc).isoformat()}
    res = await db.overhead_costs.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize_overhead(doc)


@api_router.put("/overhead-costs/{cid}")
async def update_overhead(cid: str, payload: OverheadCostCreate, user: dict = Depends(require_admin)):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Naziv troška je obavezan")
    period = payload.period if payload.period in ("monthly", "yearly") else "monthly"
    await db.overhead_costs.update_one({"_id": ObjectId(cid)},
                                       {"$set": {"name": name, "amount": float(payload.amount or 0), "period": period}})
    return {"id": cid, "name": name, "amount": float(payload.amount or 0), "period": period}


@api_router.delete("/overhead-costs/{cid}")
async def delete_overhead(cid: str, user: dict = Depends(require_admin)):
    await db.overhead_costs.delete_one({"_id": ObjectId(cid)})
    return {"message": "Trošak obrisan"}


@api_router.get("/vehicles/{vehicle_id}/annual-costs")
async def list_annual_costs(vehicle_id: str, user: dict = Depends(require_admin)):
    doc = await db.vehicles.find_one({"_id": ObjectId(vehicle_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Vozilo nije pronađeno")
    return doc.get("annual_costs") or []


@api_router.post("/vehicles/{vehicle_id}/annual-costs")
async def add_annual_cost(vehicle_id: str, payload: AnnualCostItem, user: dict = Depends(require_admin)):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Naziv troška je obavezan")
    item = {"id": str(ObjectId()), "name": name, "amount": float(payload.amount or 0)}
    await db.vehicles.update_one({"_id": ObjectId(vehicle_id)}, {"$push": {"annual_costs": item}})
    return item


@api_router.delete("/vehicles/{vehicle_id}/annual-costs/{item_id}")
async def delete_annual_cost(vehicle_id: str, item_id: str, user: dict = Depends(require_admin)):
    await db.vehicles.update_one({"_id": ObjectId(vehicle_id)}, {"$pull": {"annual_costs": {"id": item_id}}})
    return {"message": "Trošak obrisan"}


@api_router.get("/maintenance/service-types")
async def maintenance_service_types(user: dict = Depends(get_current_user)):
    vals = await db.maintenance.distinct("service_type")
    defaults = ["Zamena ulja", "Zamena antifriza", "Kočnice - zamena pločica",
                "Tehnički pregled", "Servis", "Gume", "Filteri", "Akumulator"]
    merged = sorted({v.strip() for v in (list(vals) + defaults) if v and v.strip()})
    return merged


# ---------------- Maintenance routes ----------------
@api_router.get("/maintenance")
async def list_maintenance(vehicle_id: Optional[str] = None, user: dict = Depends(require_admin)):
    query = {"vehicle_id": vehicle_id} if vehicle_id else {}
    docs = await db.maintenance.find(query).sort("date", -1).to_list(1000)
    for d in docs:
        d["id"] = str(d["_id"])
        d.pop("_id", None)
    return docs


@api_router.post("/maintenance")
async def create_maintenance(payload: MaintenanceCreate, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.maintenance.insert_one(doc)
    created = await db.maintenance.find_one({"_id": res.inserted_id})
    created["id"] = str(created["_id"])
    created.pop("_id", None)
    return created


@api_router.delete("/maintenance/{item_id}")
async def delete_maintenance(item_id: str, user: dict = Depends(get_current_user)):
    await db.maintenance.delete_one({"_id": ObjectId(item_id)})
    return {"message": "Zapis obrisan"}


@api_router.put("/maintenance/{item_id}")
async def update_maintenance(item_id: str, payload: MaintenanceCreate, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    await db.maintenance.update_one({"_id": ObjectId(item_id)}, {"$set": doc})
    updated = await db.maintenance.find_one({"_id": ObjectId(item_id)})
    if not updated:
        raise HTTPException(status_code=404, detail="Zapis nije pronađen")
    updated["id"] = str(updated["_id"])
    updated.pop("_id", None)
    return updated


@api_router.patch("/maintenance/{item_id}/labor")
async def update_maintenance_labor(item_id: str, payload: MechanicLaborUpdate, user: dict = Depends(get_current_user)):
    update_fields = {"mechanic_cost": float(payload.mechanic_cost)}
    if payload.mechanic is not None:
        update_fields["mechanic"] = payload.mechanic
    if payload.cost_currency is not None:
        update_fields["cost_currency"] = payload.cost_currency
    await db.maintenance.update_one({"_id": ObjectId(item_id)}, {"$set": update_fields})
    updated = await db.maintenance.find_one({"_id": ObjectId(item_id)})
    if not updated:
        raise HTTPException(status_code=404, detail="Zapis nije pronađen")
    updated["id"] = str(updated["_id"])
    updated.pop("_id", None)
    return updated


@api_router.post("/maintenance/{item_id}/receipt")
async def upload_maintenance_receipt(item_id: str, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    m = await db.maintenance.find_one({"_id": ObjectId(item_id)})
    if not m:
        raise HTTPException(status_code=404, detail="Zapis nije pronađen")
    ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin").lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Dozvoljene su samo slike (JPG, PNG, WEBP, GIF) i PDF")
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fajl je prevelik (maksimum 15MB)")
    rid = str(uuid.uuid4())
    path = f"{APP_NAME}/maintenance/{item_id}/{rid}.{ext}"
    ct = file.content_type or MIME_TYPES.get(ext, "application/octet-stream")
    try:
        result = put_object(path, data, ct)
    except Exception as e:
        logger.error(f"Storage upload failed: {e}")
        raise HTTPException(status_code=502, detail="Skladište trenutno nije dostupno. Pokušajte ponovo za koji trenutak.")
    receipt = {"id": rid, "path": result["path"], "filename": file.filename, "content_type": ct,
               "at": datetime.now(timezone.utc).isoformat()}
    await db.maintenance.update_one({"_id": ObjectId(item_id)}, {
        "$push": {"receipts": receipt},
        "$set": {"receipt_path": result["path"], "receipt_filename": file.filename, "receipt_content_type": ct}})
    return receipt


@api_router.get("/maintenance/{item_id}/receipt")
async def download_maintenance_receipt(item_id: str, request: Request, auth: Optional[str] = Query(None),
                                       rid: Optional[str] = Query(None),
                                       as_pdf: Optional[str] = Query(None), download: Optional[str] = Query(None)):
    token = None
    ah = request.headers.get("Authorization", "")
    if ah.startswith("Bearer "):
        token = ah[7:]
    if not token:
        token = request.cookies.get("access_token")
    if not token and auth:
        token = auth
    if not token:
        raise HTTPException(status_code=401, detail="Niste prijavljeni")
    try:
        jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except Exception:
        raise HTTPException(status_code=401, detail="Neispravan token")
    m = await db.maintenance.find_one({"_id": ObjectId(item_id)})
    if not m:
        raise HTTPException(status_code=404, detail="Račun nije pronađen")
    target = None
    if rid:
        target = next((r for r in (m.get("receipts") or []) if r.get("id") == rid), None)
    if not target and (m.get("receipts") or []):
        target = m["receipts"][0]
    src_path = (target or {}).get("path") or m.get("receipt_path")
    src_ct = (target or {}).get("content_type") or m.get("receipt_content_type")
    src_fname = (target or {}).get("filename") or m.get("receipt_filename")
    if not src_path:
        raise HTTPException(status_code=404, detail="Račun nije pronađen")
    try:
        data, ct = get_object(src_path)
    except Exception as e:
        logger.error(f"Storage download failed: {e}")
        raise HTTPException(status_code=502, detail="Skladište trenutno nije dostupno.")
    ct_final = src_ct or ct or "application/octet-stream"
    fname = src_fname or "racun"
    force = False
    if as_pdf and (ct_final or "").startswith("image/"):
        try:
            from PIL import Image
            img = Image.open(io.BytesIO(data)).convert("RGB")
            out = io.BytesIO()
            img.save(out, format="PDF")
            data = out.getvalue()
            ct_final = "application/pdf"
            fname = fname.rsplit(".", 1)[0] + ".pdf"
            force = True
        except Exception as e:
            logger.error(f"PDF convert failed: {e}")
    headers = {}
    if force or download:
        headers["Content-Disposition"] = content_disposition(fname)
    return Response(content=data, media_type=ct_final, headers=headers)


@api_router.delete("/maintenance/{item_id}/receipt/{rid}")
async def delete_maintenance_receipt(item_id: str, rid: str, user: dict = Depends(require_admin)):
    m = await db.maintenance.find_one({"_id": ObjectId(item_id)})
    if not m:
        raise HTTPException(status_code=404, detail="Zapis nije pronađen")
    receipts = m.get("receipts") or []
    target = next((r for r in receipts if r.get("id") == rid), None)
    if not target:
        raise HTTPException(status_code=404, detail="Račun nije pronađen")
    remaining = [r for r in receipts if r.get("id") != rid]
    update = {"$set": {"receipts": remaining}}
    if m.get("receipt_path") == target.get("path"):
        if remaining:
            first = remaining[0]
            update["$set"].update({"receipt_path": first.get("path"), "receipt_filename": first.get("filename"),
                                   "receipt_content_type": first.get("content_type")})
        else:
            update["$set"].update({"receipt_path": None, "receipt_filename": None, "receipt_content_type": None})
    await db.maintenance.update_one({"_id": ObjectId(item_id)}, update)
    return {"ok": True, "receipts": remaining}


# ---------------- Dashboard ----------------
@api_router.get("/dashboard")
async def dashboard(user: dict = Depends(require_admin)):
    vehicles = await db.vehicles.find().to_list(1000)
    maint = await db.maintenance.find().to_list(5000)
    drivers = await db.drivers.find().to_list(1000)
    doc_keys = {"tech_6m": "6-mesečni tehnički pregled",
                "registration_12m": "12-mesečna registracija",
                "cmr_insurance": "CMR osiguranje",
                "kasko_insurance": "Kasko osiguranje",
                "white_card": "Bela potvrda",
                "tachograph": "Tahograf (kalibracija)"}
    expired, expiring = 0, 0
    alerts = []
    for v in vehicles:
        for key, label in doc_keys.items():
            info = v.get(key) or {}
            st = doc_status(info.get("expiry"))
            if st in ("expired", "expiring"):
                if st == "expired":
                    expired += 1
                else:
                    expiring += 1
                alerts.append({
                    "kind": "vehicle",
                    "id": str(v["_id"]),
                    "subject": v.get("plate"),
                    "vehicle_id": str(v["_id"]),
                    "plate": v.get("plate"),
                    "make": v.get("make", ""),
                    "model": v.get("model", ""),
                    "doc_type": label,
                    "doc_key": key,
                    "expiry": info.get("expiry"),
                    "status": st,
                })
    for d in drivers:
        name = f"{d.get('first_name','')} {d.get('last_name','')}".strip()
        for key, label in DRIVER_DOC_LABELS.items():
            info = d.get(key) or {}
            st = doc_status(info.get("expiry"))
            if st in ("expired", "expiring"):
                if st == "expired":
                    expired += 1
                else:
                    expiring += 1
                alerts.append({
                    "kind": "driver",
                    "id": str(d["_id"]),
                    "subject": name,
                    "plate": name,
                    "make": "Vozač",
                    "model": "",
                    "doc_type": label,
                    "doc_key": key,
                    "expiry": info.get("expiry"),
                    "status": st,
                })
    order = {"expired": 0, "expiring": 1}
    alerts.sort(key=lambda a: (order[a["status"]], a["expiry"] or ""))
    rsd_rate = await get_rsd_rate()
    total_cost = sum(maint_eur(m, rsd_rate) for m in maint)
    cur_month = datetime.now(timezone.utc).strftime("%Y-%m")
    month_data = await build_truck_earnings(cur_month, cur_month)
    mt = month_data["totals"]
    return {
        "total_vehicles": len(vehicles),
        "total_drivers": len(drivers),
        "expired_docs": expired,
        "expiring_docs": expiring,
        "total_services": len(maint),
        "total_cost": total_cost,
        "alerts": alerts,
        "service_alerts": await collect_service_alerts(),
        "month_profit": {
            "period_label": month_data["period_label"],
            "revenue": mt["revenue"],
            "total_cost": round(mt["total_cost"] + month_data["overhead"], 2),
            "maintenance": mt["maintenance"],
            "overhead": month_data["overhead"],
            "profit": month_data["net_profit"],
        },
    }


# ---------------- Word Export ----------------
def _fmt_rsd(amount: float) -> str:
    return f"{amount:,.0f}".replace(",", ".") + " RSD"


def _fmt_money(amount: float, cur: str = "RSD") -> str:
    if cur == "EUR":
        if amount.is_integer():
            return f"{int(amount):,} €".replace(",", ".")
        return f"{amount:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{amount:,.0f}".replace(",", ".") + " RSD"


STATUS_TEXT = {"expired": "ISTEKLO", "expiring": "USKORO ISTIČE",
               "valid": "VAŽEĆE", "none": "Nema podatka"}


@api_router.get("/reports/word")
async def report_word(user: dict = Depends(get_current_user)):
    vehicles = await db.vehicles.find().sort("plate", 1).to_list(1000)
    maint = await db.maintenance.find().to_list(5000)

    document = Document()
    title = document.add_heading("Izveštaj o voznom parku", level=0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub = document.add_paragraph("APR MENSUR DULJEVIĆ")
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for run in sub.runs:
        run.bold = True
        run.font.size = Pt(14)
    pib = document.add_paragraph("PIB: 114365454   ·   MB: 67518896")
    pib.alignment = WD_ALIGN_PARAGRAPH.CENTER
    dt = document.add_paragraph(f"Datum izveštaja: {date.today().strftime('%d.%m.%y')}")
    dt.alignment = WD_ALIGN_PARAGRAPH.CENTER

    document.add_heading("Status dokumentacije vozila", level=1)
    table = document.add_table(rows=1, cols=8)
    table.style = "Light Grid Accent 1"
    hdr = table.rows[0].cells
    for i, h in enumerate(["Registarska oznaka", "Vozilo", "6-mes. tehnički",
                           "12-mes. registracija", "CMR osiguranje", "Kasko osiguranje", "Bela potvrda", "Tahograf"]):
        hdr[i].text = h
    for v in vehicles:
        row = table.add_row().cells
        row[0].text = v.get("plate", "")
        row[1].text = f"{v.get('make','')} {v.get('model','')}".strip()
        for idx, key in enumerate(["tech_6m", "registration_12m", "cmr_insurance", "kasko_insurance", "white_card", "tachograph"]):
            info = v.get(key) or {}
            exp = fmt_ddmmyy(info.get("expiry"))
            st = STATUS_TEXT[doc_status(info.get("expiry"))]
            row[2 + idx].text = f"{exp}\n({st})"

    document.add_heading("Evidencija održavanja", level=1)
    total_cost = sum(float(m.get("cost", 0) or 0) + float(m.get("mechanic_cost", 0) or 0) for m in maint)
    plate_by_id = {str(v["_id"]): v.get("plate", "") for v in vehicles}
    mtable = document.add_table(rows=1, cols=7)
    mtable.style = "Light Grid Accent 1"
    mh = mtable.rows[0].cells
    for i, h in enumerate(["Datum", "Vozilo", "Vrsta servisa", "Opis", "Rad meh.", "Delovi", "Ukupno"]):
        mh[i].text = h
    total_rsd = 0.0
    total_eur = 0.0
    for m in sorted(maint, key=lambda x: x.get("date", ""), reverse=True):
        cur = m.get("cost_currency") or "RSD"
        parts = float(m.get("cost", 0) or 0)
        labor = float(m.get("mechanic_cost", 0) or 0)
        subtotal = parts + labor
        if cur == "EUR":
            total_eur += subtotal
        else:
            total_rsd += subtotal
        r = mtable.add_row().cells
        r[0].text = m.get("date", "")
        r[1].text = plate_by_id.get(m.get("vehicle_id", ""), "")
        r[2].text = m.get("service_type", "")
        r[3].text = m.get("description", "")
        r[4].text = _fmt_money(labor, cur) if labor else "-"
        r[5].text = _fmt_money(parts, cur) if parts else "-"
        r[6].text = _fmt_money(subtotal, cur)
    tp = document.add_paragraph()
    if total_eur > 0 and total_rsd > 0:
        tot_str = f"{_fmt_money(total_rsd, 'RSD')} + {_fmt_money(total_eur, 'EUR')}"
    elif total_eur > 0:
        tot_str = _fmt_money(total_eur, 'EUR')
    else:
        tot_str = _fmt_money(total_rsd, 'RSD')
    tp.add_run(f"Ukupni troškovi održavanja: {tot_str}").bold = True

    buf = io.BytesIO()
    document.save(buf)
    buf.seek(0)
    fname = f"izvestaj_vozni_park_{date.today().isoformat()}.docx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": content_disposition(fname)},
    )


# ================= Object Storage (MongoDB GridFS) =================
APP_NAME = "fleetmanager"
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")

MIME_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "gif": "image/gif", "webp": "image/webp", "pdf": "application/pdf",
}
ALLOWED_EXT = set(MIME_TYPES.keys())


def init_storage(force: bool = False):
    global fs
    if fs is None:
        try:
            fs = gridfs.GridFS(sync_db)
        except Exception as e:
            logger.error(f"GridFS init failed: {e}")
            raise
    return True


def put_object(path: str, data: bytes, content_type: str) -> dict:
    global fs
    if fs is None:
        init_storage()
    try:
        for old in fs.find({"filename": path}):
            fs.delete(old._id)
    except Exception:
        pass
    fs.put(data, filename=path, metadata={"content_type": content_type})
    return {"path": path, "size": len(data)}


def get_object(path: str):
    global fs
    if fs is None:
        init_storage()
    f = fs.find_one({"filename": path})
    if f is not None:
        ct = (f.metadata or {}).get("content_type") if hasattr(f, "metadata") and f.metadata else None
        if not ct and hasattr(f, "content_type"):
            ct = getattr(f, "content_type", None)
        return f.read(), ct or "application/octet-stream"

    # Optional legacy fallback to Emergent storage if file was stored there previously
    if EMERGENT_KEY and STORAGE_URL:
        try:
            resp_init = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=10)
            if resp_init.status_code < 400:
                k = resp_init.json().get("storage_key")
                resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": k}, timeout=20)
                if resp.status_code < 400:
                    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")
        except Exception:
            pass

    raise FileNotFoundError(f"File {path} not found")



# ================= Document endpoints =================
@api_router.post("/vehicles/{vehicle_id}/documents")
async def upload_document(vehicle_id: str, file: UploadFile = File(...),
                          category: str = Form("ostalo"), user: dict = Depends(get_current_user)):
    v = await db.vehicles.find_one({"_id": ObjectId(vehicle_id)})
    if not v:
        raise HTTPException(status_code=404, detail="Vozilo nije pronađeno")
    ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin").lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Dozvoljene su samo slike (JPG, PNG, WEBP, GIF) i PDF")
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fajl je prevelik (maksimum 15MB)")
    doc_id = str(uuid.uuid4())
    path = f"{APP_NAME}/vehicles/{vehicle_id}/{doc_id}.{ext}"
    ct = file.content_type or MIME_TYPES.get(ext, "application/octet-stream")
    try:
        result = put_object(path, data, ct)
    except Exception as e:
        logger.error(f"Storage upload failed: {e}")
        raise HTTPException(status_code=502, detail="Skladište trenutno nije dostupno. Pokušajte ponovo za koji trenutak.")
    rec = {
        "id": doc_id, "vehicle_id": vehicle_id, "storage_path": result["path"],
        "original_filename": file.filename, "content_type": ct,
        "size": result.get("size", len(data)), "category": category,
        "is_deleted": False, "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.documents.insert_one(dict(rec))
    return rec


@api_router.get("/vehicles/{vehicle_id}/documents")
async def list_documents(vehicle_id: str, user: dict = Depends(get_current_user)):
    docs = await db.documents.find({"vehicle_id": vehicle_id, "is_deleted": False}).sort("created_at", -1).to_list(1000)
    for d in docs:
        d.pop("_id", None)
    return docs


@api_router.get("/documents/{doc_id}/download")
async def download_document(doc_id: str, request: Request, auth: Optional[str] = Query(None),
                            as_pdf: Optional[str] = Query(None), download: Optional[str] = Query(None)):
    token = None
    ah = request.headers.get("Authorization", "")
    if ah.startswith("Bearer "):
        token = ah[7:]
    if not token:
        token = request.cookies.get("access_token")
    if not token and auth:
        token = auth
    if not token:
        raise HTTPException(status_code=401, detail="Niste prijavljeni")
    try:
        jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except Exception:
        raise HTTPException(status_code=401, detail="Neispravan token")
    rec = await db.documents.find_one({"id": doc_id, "is_deleted": False})
    if not rec:
        raise HTTPException(status_code=404, detail="Fajl nije pronađen")
    try:
        data, ct = get_object(rec["storage_path"])
    except Exception as e:
        logger.error(f"Storage download failed: {e}")
        raise HTTPException(status_code=502, detail="Skladište trenutno nije dostupno. Pokušajte ponovo.")
    ct_final = rec.get("content_type", ct) or ct or "application/octet-stream"
    fname = rec.get("original_filename") or "dokument"
    force = False
    if as_pdf and (ct_final or "").startswith("image/"):
        try:
            from PIL import Image
            img = Image.open(io.BytesIO(data)).convert("RGB")
            out = io.BytesIO()
            img.save(out, format="PDF")
            data = out.getvalue()
            ct_final = "application/pdf"
            fname = fname.rsplit(".", 1)[0] + ".pdf"
            force = True
        except Exception as e:
            logger.error(f"PDF convert failed: {e}")
    headers = {}
    if force or download:
        headers["Content-Disposition"] = content_disposition(fname)
    return Response(content=data, media_type=ct_final, headers=headers)


@api_router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, user: dict = Depends(get_current_user)):
    await db.documents.update_one({"id": doc_id}, {"$set": {"is_deleted": True}})
    return {"message": "Dokument obrisan"}


@api_router.post("/drivers/{driver_id}/documents")
async def upload_driver_document(driver_id: str, file: UploadFile = File(...),
                                 category: str = Form("ostalo"), user: dict = Depends(get_current_user)):
    d = await db.drivers.find_one({"_id": ObjectId(driver_id)})
    if not d:
        raise HTTPException(status_code=404, detail="Vozač nije pronađen")
    ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin").lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Dozvoljene su samo slike (JPG, PNG, WEBP, GIF) i PDF")
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fajl je prevelik (maksimum 15MB)")
    doc_id = str(uuid.uuid4())
    path = f"{APP_NAME}/drivers/{driver_id}/{doc_id}.{ext}"
    ct = file.content_type or MIME_TYPES.get(ext, "application/octet-stream")
    try:
        result = put_object(path, data, ct)
    except Exception as e:
        logger.error(f"Storage upload failed: {e}")
        raise HTTPException(status_code=502, detail="Skladište trenutno nije dostupno. Pokušajte ponovo za koji trenutak.")
    rec = {
        "id": doc_id, "driver_id": driver_id, "storage_path": result["path"],
        "original_filename": file.filename, "content_type": ct,
        "size": result.get("size", len(data)), "category": category,
        "is_deleted": False, "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.documents.insert_one(dict(rec))
    return rec


@api_router.get("/drivers/{driver_id}/documents")
async def list_driver_documents(driver_id: str, user: dict = Depends(get_current_user)):
    docs = await db.documents.find({"driver_id": driver_id, "is_deleted": False}).sort("created_at", -1).to_list(1000)
    for d in docs:
        d.pop("_id", None)
    return docs


# ================= Per-vehicle Word report =================
@api_router.get("/reports/word/drivers")
async def report_word_drivers(user: dict = Depends(get_current_user)):
    drivers = await db.drivers.find().sort("last_name", 1).to_list(1000)
    document = Document()
    t = document.add_heading("Spisak vozača i dokumentacija", level=0)
    t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub = document.add_paragraph("APR MENSUR DULJEVIĆ")
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for r in sub.runs:
        r.bold = True
        r.font.size = Pt(14)
    _pib = document.add_paragraph("PIB: 114365454   ·   MB: 67518896")
    _pib.alignment = WD_ALIGN_PARAGRAPH.CENTER
    dt = document.add_paragraph(f"Datum izveštaja: {date.today().strftime('%d.%m.%y')}")
    dt.alignment = WD_ALIGN_PARAGRAPH.CENTER

    table = document.add_table(rows=1, cols=2 + len(DRIVER_DOC_KEYS))
    table.style = "Light Grid Accent 1"
    hdr = table.rows[0].cells
    headers = ["Vozač", "Telefon"] + [DRIVER_DOC_LABELS[k] for k in DRIVER_DOC_KEYS]
    for i, h in enumerate(headers):
        hdr[i].text = h
    for d in drivers:
        name = f"{d.get('first_name','')} {d.get('last_name','')}".strip()
        row = table.add_row().cells
        row[0].text = name
        row[1].text = d.get("phone", "") or "-"
        for idx, key in enumerate(DRIVER_DOC_KEYS):
            info = d.get(key) or {}
            exp = fmt_ddmmyy(info.get("expiry"))
            st = STATUS_TEXT[doc_status(info.get("expiry"))]
            row[2 + idx].text = f"{exp}\n({st})"

    buf = io.BytesIO()
    document.save(buf)
    buf.seek(0)
    fname = f"vozaci_{date.today().isoformat()}.docx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": content_disposition(fname)},
    )


@api_router.get("/reports/word/{vehicle_id}")
async def report_word_vehicle(vehicle_id: str, user: dict = Depends(get_current_user)):
    v = await db.vehicles.find_one({"_id": ObjectId(vehicle_id)})
    if not v:
        raise HTTPException(status_code=404, detail="Vozilo nije pronađeno")
    maint = await db.maintenance.find({"vehicle_id": vehicle_id}).sort("date", -1).to_list(2000)

    document = Document()
    t = document.add_heading("Karton vozila i istorija održavanja", level=0)
    t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub = document.add_paragraph("APR MENSUR DULJEVIĆ")
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for r in sub.runs:
        r.bold = True
        r.font.size = Pt(14)
    _pib = document.add_paragraph("PIB: 114365454   ·   MB: 67518896")
    _pib.alignment = WD_ALIGN_PARAGRAPH.CENTER
    document.add_paragraph(
        f"Vozilo: {v.get('plate','')}  ·  {v.get('make','')} {v.get('model','')}  "
        f"{('· ' + str(v.get('year'))) if v.get('year') else ''}"
    )
    document.add_paragraph(f"Tip: {v.get('vehicle_type','')}   VIN: {v.get('vin','') or '-'}")
    document.add_paragraph(f"Datum izveštaja: {date.today().strftime('%d.%m.%y')}")

    document.add_heading("Status dokumentacije", level=1)
    dt = document.add_table(rows=1, cols=3)
    dt.style = "Light Grid Accent 1"
    dh = dt.rows[0].cells
    for i, h in enumerate(["Dokument", "Datum isteka", "Status"]):
        dh[i].text = h
    labels = {"tech_6m": "6-mesečni tehnički pregled", "registration_12m": "12-mesečna registracija",
              "cmr_insurance": "CMR osiguranje", "kasko_insurance": "Kasko osiguranje",
              "white_card": "Bela potvrda", "tachograph": "Tahograf (kalibracija)"}
    for key, label in labels.items():
        info = v.get(key) or {}
        row = dt.add_row().cells
        row[0].text = label
        row[1].text = fmt_ddmmyy(info.get("expiry"))
        row[2].text = STATUS_TEXT[doc_status(info.get("expiry"))]

    document.add_heading("Istorija održavanja", level=1)
    mtable = document.add_table(rows=1, cols=8)
    mtable.style = "Light Grid Accent 1"
    mh = mtable.rows[0].cells
    for i, h in enumerate(["Datum", "Vrsta servisa", "Opis", "Km", "Mehaničar", "Rad mehaničara", "Delovi", "Ukupno"]):
        mh[i].text = h
    total_rsd = 0.0
    total_eur = 0.0
    for m in maint:
        cur = m.get("cost_currency") or "RSD"
        parts = float(m.get("cost", 0) or 0)
        labor = float(m.get("mechanic_cost", 0) or 0)
        subtotal = parts + labor
        if cur == "EUR":
            total_eur += subtotal
        else:
            total_rsd += subtotal
        r = mtable.add_row().cells
        r[0].text = m.get("date", "")
        r[1].text = m.get("service_type", "")
        r[2].text = m.get("description", "")
        r[3].text = str(m.get("odometer") or "")
        r[4].text = m.get("mechanic", "")
        r[5].text = _fmt_money(labor, cur) if labor else "-"
        r[6].text = _fmt_money(parts, cur) if parts else "-"
        r[7].text = _fmt_money(subtotal, cur)
    tp = document.add_paragraph()
    if total_eur > 0 and total_rsd > 0:
        tot_str = f"{_fmt_money(total_rsd, 'RSD')} + {_fmt_money(total_eur, 'EUR')}"
    elif total_eur > 0:
        tot_str = _fmt_money(total_eur, 'EUR')
    else:
        tot_str = _fmt_money(total_rsd, 'RSD')
    tp.add_run(f"Ukupni troškovi održavanja: {tot_str}").bold = True

    buf = io.BytesIO()
    document.save(buf)
    buf.seek(0)
    fname = f"vozilo_{v.get('plate','').replace(' ', '_')}_{date.today().isoformat()}.docx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": content_disposition(fname)},
    )


# ================= Per-driver Word report =================
@api_router.get("/reports/word/driver/{driver_id}")
async def report_word_driver(driver_id: str, user: dict = Depends(get_current_user)):
    d = await db.drivers.find_one({"_id": ObjectId(driver_id)})
    if not d:
        raise HTTPException(status_code=404, detail="Vozač nije pronađen")
    name = f"{d.get('first_name','')} {d.get('last_name','')}".strip()

    document = Document()
    t = document.add_heading("Karton vozača i dokumentacija", level=0)
    t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub = document.add_paragraph("APR MENSUR DULJEVIĆ")
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for r in sub.runs:
        r.bold = True
        r.font.size = Pt(14)
    _pib = document.add_paragraph("PIB: 114365454   ·   MB: 67518896")
    _pib.alignment = WD_ALIGN_PARAGRAPH.CENTER
    document.add_paragraph(f"Vozač: {name}")
    document.add_paragraph(f"Telefon: {d.get('phone','') or '-'}   ·   Br. lične/JMBG: {d.get('id_number','') or '-'}")
    document.add_paragraph(f"Datum izveštaja: {date.today().strftime('%d.%m.%y')}")

    document.add_heading("Status dokumentacije", level=1)
    dt = document.add_table(rows=1, cols=3)
    dt.style = "Light Grid Accent 1"
    dh = dt.rows[0].cells
    for i, h in enumerate(["Dokument", "Datum isteka", "Status"]):
        dh[i].text = h
    for key in DRIVER_DOC_KEYS:
        info = d.get(key) or {}
        row = dt.add_row().cells
        row[0].text = DRIVER_DOC_LABELS[key]
        row[1].text = fmt_ddmmyy(info.get("expiry"))
        row[2].text = STATUS_TEXT[doc_status(info.get("expiry"))]

    buf = io.BytesIO()
    document.save(buf)
    buf.seek(0)
    fname = f"vozac_{name.replace(' ', '_') or driver_id}_{date.today().isoformat()}.docx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": content_disposition(fname)},
    )


@api_router.get("/reports/drivers/excel")
async def report_drivers_excel(user: dict = Depends(get_current_user)):
    drivers = await db.drivers.find().sort("last_name", 1).to_list(1000)
    wb = Workbook()
    ws = wb.active
    ws.title = "Vozači"
    header = ["Ime", "Prezime", "Telefon", "Br. lične/JMBG"]
    for key in DRIVER_DOC_KEYS:
        header += [DRIVER_DOC_LABELS[key], "Status"]
    ws.append(header)
    for d in drivers:
        cells = [d.get("first_name", ""), d.get("last_name", ""),
                 d.get("phone", ""), d.get("id_number", "")]
        for key in DRIVER_DOC_KEYS:
            info = d.get(key) or {}
            exp = fmt_ddmmyy(info.get("expiry"), "")
            cells.append(exp)
            cells.append(STATUS_TEXT[doc_status(exp or None)])
        ws.append(cells)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = f"vozaci_{date.today().isoformat()}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": content_disposition(fname)},
    )


# ================= Email reminders =================
EMAIL_BASE_URL = (os.environ.get("INTEGRATION_PROXY_URL") or os.environ.get("EMAIL_BASE_URL") or "https://integrations.emergentagent.com").strip().rstrip("/")
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY") or "ek_442fddc24292f48154aad62ff2318ebc"
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "APR MENSUR DULJEVIĆ")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO", "duljevic1366@gmail.com")
REMINDER_RECIPIENTS = [e.strip() for e in os.environ.get("REMINDER_RECIPIENTS", "duljevic1366@gmail.com,duljevic.pr@gmail.com").split(",") if e.strip()]
WEBHOOK_CRON_SECRET = os.environ.get("WEBHOOK_CRON_SECRET", "")
REMINDER_DAYS = {30, 15, 7}
DOC_LABELS = {"tech_6m": "6-mesečni tehnički pregled", "registration_12m": "12-mesečna registracija",
              "cmr_insurance": "CMR osiguranje", "kasko_insurance": "Kasko osiguranje",
              "white_card": "Bela potvrda", "tachograph": "Tahograf (kalibracija)"}


async def get_recipients():
    doc = await db.settings.find_one({"key": "reminder_recipients"})
    if doc and isinstance(doc.get("value"), list) and doc["value"]:
        return doc["value"]
    return REMINDER_RECIPIENTS

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "seed phrase", "recovery phrase")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://") and not low.startswith("http://localhost") and not low.startswith("http://127.0.0.1"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")

        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


def send_smtp_email(to: str, subject: str, html: str) -> bool:
    host = os.environ.get("SMTP_HOST")
    port = int(os.environ.get("SMTP_PORT", 587))
    user = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_PASSWORD")
    from_email = os.environ.get("SMTP_FROM", user or "noreply@fleetmanager.rs")
    from_name = os.environ.get("EMAIL_FROM_NAME", "APR MENSUR DULJEVIĆ")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = to
    if EMAIL_REPLY_TO:
        msg["Reply-To"] = EMAIL_REPLY_TO

    part = MIMEText(html, "html", "utf-8")
    msg.attach(part)

    if port == 465:
        server = smtplib.SMTP_SSL(host, port, timeout=15)
    else:
        server = smtplib.SMTP(host, port, timeout=15)
        server.starttls()

    if user and password:
        server.login(user, password)
    server.sendmail(from_email, [to], msg.as_string())
    server.quit()
    return True


async def send_email(*, to: str, subject: str, html: str) -> Optional[str]:
    try:
        _assert_safe_email(subject, html)
    except Exception as e:
        logger.warning(f"Email safety check note: {e}")

    # 1. Custom SMTP
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_user = os.environ.get("SMTP_USER")
    if smtp_host and smtp_user:
        try:
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, send_smtp_email, to, subject, html)
            logger.info(f"Email sent via SMTP to {to}")
            return "smtp-sent"
        except Exception as e:
            logger.error(f"SMTP send failed: {e}")

    # 2. Resend API
    resend_key = os.environ.get("RESEND_API_KEY")
    if resend_key:
        try:
            from_addr = os.environ.get("RESEND_FROM", f"{EMAIL_FROM_NAME} <onboarding@resend.dev>")
            payload = {"from": from_addr, "to": [to], "subject": subject, "html": html}
            if EMAIL_REPLY_TO:
                payload["reply_to"] = EMAIL_REPLY_TO
            async with httpx.AsyncClient(timeout=15) as client:
                res = await client.post("https://api.resend.com/emails",
                                        headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
                                        json=payload)
                if res.status_code < 300:
                    logger.info(f"Email sent via Resend to {to}")
                    return res.json().get("id")
                else:
                    logger.error(f"Resend returned {res.status_code}: {res.text}")
        except Exception as e:
            logger.error(f"Resend send failed: {e}")

    # 3. Emergent API service
    emergent_key = os.environ.get("EMERGENT_EMAIL_KEY") or "ek_442fddc24292f48154aad62ff2318ebc"
    if emergent_key:
        try:
            payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
            if EMAIL_REPLY_TO:
                payload["contact_email"] = EMAIL_REPLY_TO
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                                         headers={"X-Email-Key": emergent_key}, json=payload)
                if resp.status_code < 300:
                    logger.info(f"Email sent via Emergent to {to}")
                    return resp.json().get("id")
                else:
                    logger.error(f"Emergent email returned {resp.status_code}: {resp.text}")
        except Exception as e:
            logger.error(f"Emergent email failed: {e}")

    raise RuntimeError("Slanje mejla nije uspelo. Proverite email podešavanja.")


async def build_reminder_rows(any_upcoming: bool = False):
    vehicles = await db.vehicles.find().to_list(1000)
    today = date.today()
    rows = []
    for v in vehicles:
        for key, label in DOC_LABELS.items():
            info = v.get(key) or {}
            exp = info.get("expiry")
            if not exp:
                continue
            try:
                d = date.fromisoformat(exp)
            except ValueError:
                continue
            days = (d - today).days
            if (any_upcoming and -365 <= days <= 30) or (not any_upcoming and days in REMINDER_DAYS):
                rows.append({
                    "plate": v.get("plate", ""),
                    "vehicle": f"{v.get('make','')} {v.get('model','')}".strip(),
                    "doc": label, "expiry": fmt_ddmmyy(exp), "days": days,
                })
    rows.extend(await build_driver_reminder_rows(any_upcoming=any_upcoming))
    rows.sort(key=lambda r: r["days"])
    return rows


async def build_driver_reminder_rows(any_upcoming: bool = False):
    drivers = await db.drivers.find().to_list(1000)
    today = date.today()
    rows = []
    for d in drivers:
        name = f"{d.get('first_name','')} {d.get('last_name','')}".strip()
        for key, label in DRIVER_DOC_LABELS.items():
            info = d.get(key) or {}
            exp = info.get("expiry")
            if not exp:
                continue
            try:
                dt = date.fromisoformat(exp)
            except ValueError:
                continue
            days = (dt - today).days
            if (any_upcoming and -365 <= days <= 30) or (not any_upcoming and days in REMINDER_DAYS):
                rows.append({
                    "plate": f"Vozač: {name}",
                    "vehicle": name,
                    "doc": label, "expiry": fmt_ddmmyy(exp), "days": days,
                })
    return rows



BRAKE_INTERVAL_DAYS = 182  # ~6 meseci


async def build_brake_reminder_rows():
    vehicles = await db.vehicles.find().to_list(1000)
    maint = await db.maintenance.find().to_list(5000)
    by_v = {}
    for m in maint:
        t = f"{m.get('service_type','')} {m.get('description','')}".lower()
        if "koč" in t or "koc" in t or "brake" in t:
            by_v.setdefault(m.get("vehicle_id", ""), []).append(m)
    today = date.today()
    rows = []
    for v in vehicles:
        recs = sorted(by_v.get(str(v["_id"]), []), key=lambda m: m.get("date", ""))
        if recs and recs[-1].get("date"):
            try:
                due = date.fromisoformat(recs[-1]["date"]) + timedelta(days=BRAKE_INTERVAL_DAYS)
            except ValueError:
                continue
            days_left = (due - today).days
            last_txt = fmt_ddmmyy(recs[-1]["date"])
            due_txt = fmt_ddmmyy(due.isoformat())
        else:
            days_left = 0
            last_txt = "nema zapisa"
            due_txt = "—"
        if days_left <= 30:
            rows.append({"plate": v.get("plate", ""),
                         "vehicle": f"{v.get('make','')} {v.get('model','')}".strip(),
                         "last": last_txt, "due": due_txt, "days_left": days_left})
    rows.sort(key=lambda r: r["days_left"])
    return rows


def _brake_reminder_html(brake_rows) -> str:
    if not brake_rows:
        return ""
    items = ""
    for r in brake_rows:
        d = r["days_left"]
        status = "Prekoračeno" if d < 0 else ("Danas" if d == 0 else f"za {d} dana")
        items += (
            f"<tr><td style='padding:8px 12px;border:1px solid #e2e8f0'>{escape(r['plate'])}</td>"
            f"<td style='padding:8px 12px;border:1px solid #e2e8f0'>{escape(r['vehicle'])}</td>"
            f"<td style='padding:8px 12px;border:1px solid #e2e8f0'>{escape(r['last'])}</td>"
            f"<td style='padding:8px 12px;border:1px solid #e2e8f0'>{escape(r['due'])}</td>"
            f"<td style='padding:8px 12px;border:1px solid #e2e8f0'>{escape(status)}</td></tr>"
        )
    return (
        "<p style='margin:24px 0 6px;font-weight:bold'>Provera kočionog sistema (na 6 meseci):</p>"
        "<table style='border-collapse:collapse;font-size:14px'>"
        "<tr style='background:#fee2e2'>"
        "<th style='padding:8px 12px;border:1px solid #e2e8f0;text-align:left'>Tablica</th>"
        "<th style='padding:8px 12px;border:1px solid #e2e8f0;text-align:left'>Vozilo</th>"
        "<th style='padding:8px 12px;border:1px solid #e2e8f0;text-align:left'>Poslednja provera</th>"
        "<th style='padding:8px 12px;border:1px solid #e2e8f0;text-align:left'>Sledeća do</th>"
        "<th style='padding:8px 12px;border:1px solid #e2e8f0;text-align:left'>Rok</th></tr>"
        f"{items}</table>"
    )


def _service_reminder_html(service_rows) -> str:
    if not service_rows:
        return ""
    items = ""
    for r in service_rows:
        rem = r["remaining_km"]
        status = (f"Prekoračeno za {abs(rem):,}".replace(",", ".") + " km") if rem <= 0 \
            else (f"Još {rem:,}".replace(",", ".") + " km")
        anti = " + antifriz" if r.get("antifreeze_due") else ""
        nxt = (f"{r['next_oil_odometer']:,}".replace(",", ".") + " km") if r.get("next_oil_odometer") is not None else "-"
        items += (
            f"<tr><td style='padding:8px 12px;border:1px solid #e2e8f0'>{escape(r['plate'])}</td>"
            f"<td style='padding:8px 12px;border:1px solid #e2e8f0'>{escape((r.get('make','') + ' ' + r.get('model','')).strip())}</td>"
            f"<td style='padding:8px 12px;border:1px solid #e2e8f0'>Zamena ulja{escape(anti)}</td>"
            f"<td style='padding:8px 12px;border:1px solid #e2e8f0'>{escape(nxt)}</td>"
            f"<td style='padding:8px 12px;border:1px solid #e2e8f0'>{escape(status)}</td></tr>"
        )
    return (
        "<p style='margin:24px 0 6px;font-weight:bold'>Predstoji zamena ulja / antifriza:</p>"
        "<table style='border-collapse:collapse;font-size:14px'>"
        "<tr style='background:#fef3c7'>"
        "<th style='padding:8px 12px;border:1px solid #e2e8f0;text-align:left'>Tablica</th>"
        "<th style='padding:8px 12px;border:1px solid #e2e8f0;text-align:left'>Vozilo</th>"
        "<th style='padding:8px 12px;border:1px solid #e2e8f0;text-align:left'>Servis</th>"
        "<th style='padding:8px 12px;border:1px solid #e2e8f0;text-align:left'>Sledeća zamena na</th>"
        "<th style='padding:8px 12px;border:1px solid #e2e8f0;text-align:left'>Preostalo</th></tr>"
        f"{items}</table>"
    )


def render_reminder_html(doc_rows, service_rows=None, brake_rows=None) -> str:
    link = os.environ.get("FRONTEND_URL", "")
    items = "".join(
        f"<tr><td style='padding:8px 12px;border:1px solid #e2e8f0'>{escape(r['plate'])}</td>"
        f"<td style='padding:8px 12px;border:1px solid #e2e8f0'>{escape(r['vehicle'])}</td>"
        f"<td style='padding:8px 12px;border:1px solid #e2e8f0'>{escape(r['doc'])}</td>"
        f"<td style='padding:8px 12px;border:1px solid #e2e8f0'>{escape(r['expiry'])}</td>"
        f"<td style='padding:8px 12px;border:1px solid #e2e8f0'>za {r['days']} dana</td></tr>"
        for r in doc_rows
    )
    link_html = (f"<p style='margin-top:16px'><a href='{escape(link)}' "
                 f"style='color:#2563eb'>Otvori aplikaciju</a></p>") if link.startswith("https://") else ""
    doc_section = ""
    if doc_rows:
        doc_section = (
            "<p>Sledeći dokumenti ističu uskoro:</p>"
            "<table style='border-collapse:collapse;font-size:14px'>"
            "<tr style='background:#f1f5f9'>"
            "<th style='padding:8px 12px;border:1px solid #e2e8f0;text-align:left'>Tablica</th>"
            "<th style='padding:8px 12px;border:1px solid #e2e8f0;text-align:left'>Vozilo</th>"
            "<th style='padding:8px 12px;border:1px solid #e2e8f0;text-align:left'>Dokument</th>"
            "<th style='padding:8px 12px;border:1px solid #e2e8f0;text-align:left'>Datum isteka</th>"
            "<th style='padding:8px 12px;border:1px solid #e2e8f0;text-align:left'>Preostalo</th></tr>"
            f"{items}</table>"
        )
    status_msg = ""
    if not doc_rows and not (service_rows or []) and not (brake_rows or []):
        status_msg = "<div style='padding:12px 16px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;color:#065f46;font-size:14px'>✓ Svi dokumenti, registracije i servisi voznog parka su ažurni. Nema hitnih obaveza za naredni period.</div>"

    return (
        "<table role='presentation' width='100%'><tr><td style='padding:24px;font-family:Arial,sans-serif;color:#0f172a'>"
        "<h2 style='margin:0 0 4px'>Podsetnik — vozni park</h2>"
        "<p style='margin:0 0 16px;color:#475569'>APR MENSUR DULJEVIĆ</p>"
        f"{status_msg}"
        f"{doc_section}"
        f"{_service_reminder_html(service_rows or [])}"
        f"{_brake_reminder_html(brake_rows or [])}"
        f"{link_html}"
        "<p style='font-size:12px;color:#94a3b8;margin-top:20px'>Automatski podsetnik iz Fleet Manager aplikacije "
        "(APR MENSUR DULJEVIĆ). Nikada ne tražimo lozinke niti podatke o kartici putem emaila.</p>"
        "</td></tr></table>"
    )



async def run_reminders():
    try:
        recipients = await get_recipients()
        if not recipients:
            return
        doc_rows = await build_reminder_rows()
        service_rows = await collect_service_alerts()
        if not doc_rows and not service_rows:
            return
        html = render_reminder_html(doc_rows, service_rows)
        total = len(doc_rows) + len(service_rows)
        subject = f"Podsetnik: dokumentacija/servis ({total}) — {EMAIL_FROM_NAME}"
        for to in recipients:
            await send_email(to=to, subject=subject, html=html)
    except Exception as e:
        logger.error(f"Reminder run failed: {e}")


@api_router.post("/cron/reminders")
async def cron_reminders(request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    ah = request.headers.get("Authorization", "")
    token = ah[7:] if ah.startswith("Bearer ") else ""
    if not WEBHOOK_CRON_SECRET or not hmac.compare_digest(token, WEBHOOK_CRON_SECRET):
        raise HTTPException(status_code=401, detail="Unauthorized")
    run_id = request.headers.get("X-Webhook-Id") or ""
    if run_id:
        if await db.cron_runs.find_one({"run_id": run_id}):
            return {"status": "duplicate"}
        await db.cron_runs.insert_one({"run_id": run_id, "at": datetime.now(timezone.utc).isoformat()})
    background.add_task(run_reminders)
    return {"status": "accepted"}


@api_router.get("/reminders/preview")
async def reminders_preview(user: dict = Depends(get_current_user)):
    doc_rows = await build_reminder_rows()
    service_rows = await collect_service_alerts()
    brake_rows = await build_brake_reminder_rows()
    return {"count": len(doc_rows), "service_count": len(service_rows), "brake_count": len(brake_rows),
            "recipients": await get_recipients(), "items": doc_rows, "service_items": service_rows, "brake_items": brake_rows}


@api_router.post("/reminders/send-now")
async def reminders_send_now(user: dict = Depends(get_current_user)):
    recipients = await get_recipients()
    if not recipients:
        raise HTTPException(status_code=400, detail="Nema podešenih primalaca")
    doc_rows = await build_reminder_rows(any_upcoming=True)
    service_rows = await collect_service_alerts()
    brake_rows = await build_brake_reminder_rows()
    html = render_reminder_html(doc_rows, service_rows, brake_rows)
    total = len(doc_rows) + len(service_rows) + len(brake_rows)
    subject = f"Podsetnik: dokumentacija/servis ({total}) — {EMAIL_FROM_NAME}" if total > 0 else f"Status voznog parka (Sve ažurno) — {EMAIL_FROM_NAME}"
    sent = 0
    errors = []
    for to in recipients:
        try:
            await send_email(to=to, subject=subject, html=html)
            sent += 1
        except Exception as e:
            logger.error(f"Failed sending reminder to {to}: {e}")
            errors.append(str(e))
    if sent == 0 and errors:
        raise HTTPException(status_code=500, detail=f"Greška pri slanju mejla: {errors[0]}")
    return {"sent": True, "count": total, "recipients": recipients, "message": f"Podsetnik uspešno poslat ({total} obaveza)" if total > 0 else "Izveštaj o ažurnosti uspešno poslat"}



@api_router.get("/settings/recipients")
async def get_settings_recipients(user: dict = Depends(get_current_user)):
    return {"recipients": await get_recipients()}


@api_router.put("/settings/recipients")
async def put_settings_recipients(payload: RecipientsUpdate, user: dict = Depends(get_current_user)):
    clean = []
    for e in payload.recipients:
        e = str(e).strip().lower()
        if e and e not in clean:
            clean.append(e)
    await db.settings.update_one({"key": "reminder_recipients"}, {"$set": {"value": clean}}, upsert=True)
    return {"recipients": clean}


@api_router.get("/reports/excel")
async def report_excel(user: dict = Depends(get_current_user)):
    vehicles = await db.vehicles.find().sort("plate", 1).to_list(1000)
    maint = await db.maintenance.find().to_list(5000)
    wb = Workbook()
    ws = wb.active
    ws.title = "Vozila"
    ws.append(["Registracija", "Marka", "Model", "Godište", "Tip", "VIN",
               "6-mes. tehnički", "12-mes. registracija", "CMR osiguranje", "Kasko osiguranje", "Bela potvrda", "Tahograf"])
    for v in vehicles:
        ws.append([
            v.get("plate", ""), v.get("make", ""), v.get("model", ""), v.get("year", ""),
            v.get("vehicle_type", ""), v.get("vin", ""),
            fmt_ddmmyy((v.get("tech_6m") or {}).get("expiry"), ""),
            fmt_ddmmyy((v.get("registration_12m") or {}).get("expiry"), ""),
            fmt_ddmmyy((v.get("cmr_insurance") or {}).get("expiry"), ""),
            fmt_ddmmyy((v.get("kasko_insurance") or {}).get("expiry"), ""),
            fmt_ddmmyy((v.get("white_card") or {}).get("expiry"), ""),
            fmt_ddmmyy((v.get("tachograph") or {}).get("expiry"), ""),
        ])
    ws2 = wb.create_sheet("Održavanje")
    ws2.append(["Datum", "Vozilo", "Vrsta servisa", "Opis", "Km", "Mehaničar", "Rad mehaničara (RSD)", "Delovi (RSD)", "Ukupan trošak (RSD)"])
    plate = {str(v["_id"]): v.get("plate", "") for v in vehicles}
    total = 0.0
    for m in sorted(maint, key=lambda x: x.get("date", ""), reverse=True):
        parts = float(m.get("cost", 0) or 0)
        labor = float(m.get("mechanic_cost", 0) or 0)
        subtotal = parts + labor
        total += subtotal
        ws2.append([m.get("date", ""), plate.get(m.get("vehicle_id", ""), ""),
                    m.get("service_type", ""), m.get("description", ""),
                    m.get("odometer", "") or "", m.get("mechanic", ""), labor, parts, subtotal])
    ws2.append([])
    ws2.append(["", "", "", "", "", "", "", "Ukupno:", total])

    drivers = await db.drivers.find().sort("last_name", 1).to_list(1000)
    ws3 = wb.create_sheet("Vozači")
    ws3.append(["Ime", "Prezime", "Telefon", "Br. lične/JMBG"] +
               [DRIVER_DOC_LABELS[k] for k in DRIVER_DOC_KEYS])
    for d in drivers:
        ws3.append([
            d.get("first_name", ""), d.get("last_name", ""), d.get("phone", ""), d.get("id_number", ""),
        ] + [fmt_ddmmyy((d.get(k) or {}).get("expiry"), "") for k in DRIVER_DOC_KEYS])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = f"vozni_park_{date.today().isoformat()}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": content_disposition(fname)},
    )


@api_router.get("/reports/pdf")
async def report_pdf(user: dict = Depends(get_current_user)):
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib import colors
    from reportlab.lib.units import cm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    _register_pdf_fonts()
    vehicles = await db.vehicles.find().sort("plate", 1).to_list(1000)
    buf = io.BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=landscape(A4), topMargin=1 * cm, bottomMargin=1 * cm,
                            leftMargin=1 * cm, rightMargin=1 * cm)
    styles = getSampleStyleSheet()
    center = ParagraphStyle('c', parent=styles['Title'], fontName="LibSans-Bold", fontSize=16, alignment=1)
    sub = ParagraphStyle('s', parent=styles['Normal'], fontName="LibSans", alignment=1, fontSize=10)
    elems = [Paragraph("Izveštaj o voznom parku", center),
             Paragraph("APR MENSUR DULJEVIĆ", sub),
             Paragraph("PIB: 114365454 &#183; MB: 67518896", sub),
             Paragraph(f"Datum izveštaja: {date.today().strftime('%d.%m.%y')}", sub),
             Spacer(1, 0.5 * cm)]
    head = ["Tablica", "Vozilo", "6-mes teh.", "12-mes reg.", "CMR", "Kasko", "Bela potvrda", "Tahograf"]
    keys = ["tech_6m", "registration_12m", "cmr_insurance", "kasko_insurance", "white_card", "tachograph"]
    data = [head]
    for v in vehicles:
        row = [v.get("plate", ""), f"{v.get('make','')} {v.get('model','')}".strip()]
        row += [fmt_ddmmyy((v.get(k) or {}).get("expiry"), "-") for k in keys]
        data.append(row)
    table = Table(data, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, -1), "LibSans"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#94a3b8")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elems.append(table)
    pdf.build(elems)
    buf.seek(0)
    fname = f"izvestaj_vozni_park_{date.today().isoformat()}.pdf"
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": content_disposition(fname)})



def compute_settlement(s: dict) -> dict:
    exp = s.get("expenses", []) or []
    from_adv = sum(float(e.get("amount") or 0) for e in exp if e.get("paid_from") == "advance")
    own = sum(float(e.get("amount") or 0) for e in exp if e.get("paid_from") == "own")
    pay = float(s.get("driver_pay") or 0)
    adv = float(s.get("cash_advance") or 0)
    w_amount = float(s.get("waiting_amount") or 0)
    w_days = float(s.get("waiting_days") or 0)
    w_rate = float(s.get("waiting_rate") or 0)
    waiting = w_amount if w_amount > 0 else round(w_days * w_rate, 2)
    total_earnings = pay + waiting
    remaining_advance = adv - from_adv
    final_due = total_earnings - remaining_advance + own
    price = float(s.get("tour_price") or 0)
    company = s.get("company_expenses") or []
    company_total = sum(float(e.get("amount") or 0) for e in company)
    profit = price - total_earnings - (from_adv + own) - company_total
    return {
        "waiting": round(waiting, 2),
        "total_earnings": round(total_earnings, 2),
        "tour_price": round(price, 2),
        "profit": round(profit, 2),
        "company_expenses_total": round(company_total, 2),
        "expenses_from_advance": round(from_adv, 2),
        "expenses_own": round(own, 2),
        "total_expenses": round(from_adv + own, 2),
        "remaining_advance": round(remaining_advance, 2),
        "final_due": round(final_due, 2),
        "driver_returns": round(-final_due, 2) if final_due < 0 else 0.0,
        "payout": round(final_due, 2) if final_due >= 0 else 0.0,
    }


_PDF_FONTS_READY = False


def _register_pdf_fonts():
    global _PDF_FONTS_READY
    if _PDF_FONTS_READY:
        return
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    registered = False
    # 1. Try system liberation fonts if present on Linux
    for base in ["/usr/share/fonts/truetype/liberation", "/usr/share/fonts/liberation-sans"]:
        reg_path = f"{base}/LiberationSans-Regular.ttf"
        bold_path = f"{base}/LiberationSans-Bold.ttf"
        if os.path.exists(reg_path) and os.path.exists(bold_path):
            try:
                pdfmetrics.registerFont(TTFont("LibSans", reg_path))
                pdfmetrics.registerFont(TTFont("LibSans-Bold", bold_path))
                pdfmetrics.registerFontFamily("LibSans", normal="LibSans", bold="LibSans-Bold")
                registered = True
                break
            except Exception:
                pass

    # 2. Use ReportLab's built-in Vera TrueType fonts (Vera.ttf / VeraBd.ttf) which support Serbian Latin
    if not registered:
        try:
            pdfmetrics.registerFont(TTFont("LibSans", "Vera.ttf"))
            pdfmetrics.registerFont(TTFont("LibSans-Bold", "VeraBd.ttf"))
            pdfmetrics.registerFontFamily("LibSans", normal="LibSans", bold="LibSans-Bold")
            registered = True
        except Exception as e:
            logger.warning(f"Failed to register Vera font: {e}")

    # 3. Fallback to standard Helvetica if TTF fails
    if not registered:
        try:
            pdfmetrics.registerFontFamily("LibSans", normal="Helvetica", bold="Helvetica-Bold")
        except Exception:
            pass

    _PDF_FONTS_READY = True



@api_router.get("/settlements")
async def list_settlements(user: dict = Depends(require_admin)):
    docs = await db.settlements.find().sort("created_at", -1).to_list(1000)
    drivers = await db.drivers.find().to_list(1000)
    name_by = {str(d["_id"]): f"{d.get('first_name','')} {d.get('last_name','')}".strip() for d in drivers}
    veh = await db.vehicles.find().to_list(1000)
    plate_by = {str(v["_id"]): v.get("plate", "") for v in veh}
    threshold = await get_big_expense_threshold()
    out = []
    for d in docs:
        d["id"] = str(d["_id"])
        d.pop("_id", None)
        d["driver_name"] = name_by.get(d.get("driver_id") or "", "")
        d["vehicle_plate"] = plate_by.get(d.get("vehicle_id") or "", "")
        d["alerts"] = settlement_alerts(d, threshold)
        out.append(d)
    return out


@api_router.post("/settlements")
async def create_settlement(payload: SettlementCreate, user: dict = Depends(require_admin)):
    doc = payload.model_dump()
    rsd_rate = await get_rsd_rate()
    _normalize_amounts(doc.get("expenses") or [], rsd_rate)
    _normalize_amounts(doc.get("company_expenses") or [], rsd_rate)
    doc["status"] = doc.get("status") or "razduzeno"
    doc["calc"] = compute_settlement(doc)
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.settlements.insert_one(doc)
    created = await db.settlements.find_one({"_id": res.inserted_id})
    created["id"] = str(created["_id"])
    created.pop("_id", None)
    return created


@api_router.get("/settlements/expense-categories")
async def settlement_expense_categories(user: dict = Depends(get_current_user)):
    docs = await db.settlements.find({}, {"expenses.category": 1}).to_list(2000)
    vals = set()
    for d in docs:
        for e in (d.get("expenses") or []):
            c = (e.get("category") or "").strip()
            if c:
                vals.add(c)
    defaults = ["Gorivo / AdBlue", "Putarine / Vinjete", "Parking", "Popravke", "Hrana / Ostalo"]
    return sorted(vals | set(defaults))


def month_label(m: str) -> str:
    try:
        y, mo = m.split("-")
        return f"{int(mo):02d}.{y}"
    except Exception:
        return m or "-"


def months_between(start: str, end: str) -> int:
    try:
        sy, sm = map(int, start.split("-")[:2])
        ey, em = map(int, end.split("-")[:2])
        return max(1, (ey * 12 + em) - (sy * 12 + sm) + 1)
    except (ValueError, AttributeError):
        return 1



def period_label(start: str, end: str) -> str:
    if not start or not end:
        return "-"
    if start == end:
        return month_label(start)
    sy, ey = start.split("-")[0], end.split("-")[0]
    if sy == ey and start.endswith("-01") and end.endswith("-12"):
        return f"Godina {sy}"
    return f"{month_label(start)} – {month_label(end)}"


async def build_summary(start: str, end: str, driver_id: Optional[str] = None) -> dict:
    query = {"date": {"$gte": f"{start}-01", "$lte": f"{end}-31"}}
    if driver_id:
        query["driver_id"] = driver_id
    docs = await db.settlements.find(query).sort("date", 1).to_list(10000)
    drivers = await db.drivers.find().to_list(1000)
    name_by = {str(d["_id"]): f"{d.get('first_name','')} {d.get('last_name','')}".strip() for d in drivers}
    agg = {}
    trips = []
    for d in docs:
        did = d.get("driver_id") or ""
        dn = name_by.get(did, "") or "—"
        calc = compute_settlement(d)
        row = agg.setdefault(did, {"driver_name": dn, "count": 0, "waiting": 0.0,
                                   "earnings": 0.0, "payout": 0.0, "returns": 0.0})
        row["count"] += 1
        row["waiting"] += float(calc.get("waiting") or 0)
        row["earnings"] += float(calc.get("total_earnings") or 0)
        row["payout"] += float(calc.get("payout") or 0)
        row["returns"] += float(calc.get("driver_returns") or 0)
        trips.append({
            "date": d.get("date", ""),
            "driver_name": dn,
            "trip_label": d.get("trip_label", "") or "",
            "waiting": round(float(calc.get("waiting") or 0), 2),
            "earnings": round(float(calc.get("total_earnings") or 0), 2),
            "payout": round(float(calc.get("payout") or 0), 2),
            "returns": round(float(calc.get("driver_returns") or 0), 2),
        })
    rows = sorted(agg.values(), key=lambda r: r["driver_name"].lower())
    for r in rows:
        for k in ("waiting", "earnings", "payout", "returns"):
            r[k] = round(r[k], 2)
    totals = {"count": sum(r["count"] for r in rows),
              "waiting": round(sum(r["waiting"] for r in rows), 2),
              "earnings": round(sum(r["earnings"] for r in rows), 2),
              "payout": round(sum(r["payout"] for r in rows), 2),
              "returns": round(sum(r["returns"] for r in rows), 2)}
    return {"start": start, "end": end, "driver_id": driver_id or "",
            "period_label": period_label(start, end),
            "rows": rows, "totals": totals, "trips": trips}


@api_router.get("/settlements/summary")
async def settlements_summary(start: str, end: str, driver_id: Optional[str] = None,
                              user: dict = Depends(get_current_user)):
    return await build_summary(start, end, driver_id)


@api_router.get("/settlements/summary/pdf")
async def settlements_summary_pdf(start: str, end: str, driver_id: Optional[str] = None,
                                  user: dict = Depends(get_current_user)):
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib import colors
    from reportlab.lib.units import cm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    data = await build_summary(start, end, driver_id)
    _register_pdf_fonts()
    styles = getSampleStyleSheet()
    center = ParagraphStyle('c', parent=styles['Title'], fontName="LibSans-Bold", fontSize=15, alignment=1)
    sub = ParagraphStyle('s', parent=styles['Normal'], fontName="LibSans", alignment=1, fontSize=10)
    title = f"Zbirni izveštaj obračuna vozača — {data['period_label']}"
    if driver_id and data["rows"]:
        title += f" · {data['rows'][0]['driver_name']}"
    buf = io.BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=landscape(A4), topMargin=1.2 * cm, bottomMargin=1.2 * cm,
                            leftMargin=1.5 * cm, rightMargin=1.5 * cm)
    elems = [
        Paragraph(title, center),
        Paragraph("APR MENSUR DULJEVIĆ · PIB: 114365454 · MB: 67518896", sub),
        Spacer(1, 0.5 * cm),
    ]
    t = data["totals"]
    if driver_id:
        header = ["Datum", "Krug / ruta", "Dnevnice", "Ukupna zarada", "Isplaćeno", "Vraćeno"]
        body = [[fmt_ddmmyy(tr["date"]), tr["trip_label"] or "-", _eur(tr["waiting"]),
                 _eur(tr["earnings"]), _eur(tr["payout"]), _eur(tr["returns"])] for tr in data["trips"]]
        empty_row = ["Nema obračuna za izabrani period", "-", "-", "-", "-", "-"]
        total_row = ["UKUPNO", str(t["count"]) + " krug.", _eur(t["waiting"]), _eur(t["earnings"]),
                     _eur(t["payout"]), _eur(t["returns"])]
        widths = [3.5 * cm, 8 * cm, 3.5 * cm, 4 * cm, 3.5 * cm, 3.5 * cm]
    else:
        header = ["Vozač", "Krugova", "Dnevnice", "Ukupna zarada", "Isplaćeno", "Vraćeno"]
        body = [[r["driver_name"], str(r["count"]), _eur(r["waiting"]), _eur(r["earnings"]),
                 _eur(r["payout"]), _eur(r["returns"])] for r in data["rows"]]
        empty_row = ["Nema obračuna za izabrani period", "-", "-", "-", "-", "-"]
        total_row = ["UKUPNO", str(t["count"]), _eur(t["waiting"]), _eur(t["earnings"]),
                     _eur(t["payout"]), _eur(t["returns"])]
        widths = [7 * cm, 2.5 * cm, 3.5 * cm, 4 * cm, 3.5 * cm, 3.5 * cm]
    tdata = [header] + (body if body else [empty_row]) + [total_row]
    table = Table(tdata, colWidths=widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, -1), "LibSans"),
        ("FONTNAME", (0, 0), (-1, 0), "LibSans-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "LibSans-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#94a3b8")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#f1f5f9")]),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#dbeafe")),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
    ]))
    elems.append(table)
    pdf.build(elems)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": content_disposition(f"zbirni_obracun_{start}_{end}.pdf")})


@api_router.get("/settlements/summary/word")
async def settlements_summary_word(start: str, end: str, driver_id: Optional[str] = None,
                                   user: dict = Depends(get_current_user)):
    data = await build_summary(start, end, driver_id)
    title = f"Zbirni izveštaj obračuna vozača — {data['period_label']}"
    if driver_id and data["rows"]:
        title += f" · {data['rows'][0]['driver_name']}"
    document = Document()
    h = document.add_heading(title, level=0)
    h.alignment = WD_ALIGN_PARAGRAPH.CENTER
    subp = document.add_paragraph("APR MENSUR DULJEVIĆ")
    subp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for r in subp.runs:
        r.bold = True
        r.font.size = Pt(14)
    pib = document.add_paragraph("PIB: 114365454   ·   MB: 67518896")
    pib.alignment = WD_ALIGN_PARAGRAPH.CENTER
    t = data["totals"]
    if driver_id:
        headers = ["Datum", "Krug / ruta", "Dnevnice", "Ukupna zarada", "Isplaćeno", "Vraćeno"]
        body = [[fmt_ddmmyy(tr["date"]), tr["trip_label"] or "-", _eur(tr["waiting"]),
                 _eur(tr["earnings"]), _eur(tr["payout"]), _eur(tr["returns"])] for tr in data["trips"]]
        total_row = ["UKUPNO", f"{t['count']} krug.", _eur(t["waiting"]), _eur(t["earnings"]),
                     _eur(t["payout"]), _eur(t["returns"])]
    else:
        headers = ["Vozač", "Krugova", "Dnevnice", "Ukupna zarada", "Isplaćeno", "Vraćeno"]
        body = [[r["driver_name"], str(r["count"]), _eur(r["waiting"]), _eur(r["earnings"]),
                 _eur(r["payout"]), _eur(r["returns"])] for r in data["rows"]]
        total_row = ["UKUPNO", str(t["count"]), _eur(t["waiting"]), _eur(t["earnings"]),
                     _eur(t["payout"]), _eur(t["returns"])]
    table = document.add_table(rows=1, cols=6)
    table.style = "Light Grid Accent 1"
    hdr = table.rows[0].cells
    for i, htxt in enumerate(headers):
        hdr[i].text = htxt
    if not body:
        rc = table.add_row().cells
        rc[0].text = "Nema obračuna za izabrani period"
    for brow in body:
        rc = table.add_row().cells
        for i, v in enumerate(brow):
            rc[i].text = v
    rc = table.add_row().cells
    for i, v in enumerate(total_row):
        rc[i].text = v
        for p in rc[i].paragraphs:
            for run in p.runs:
                run.bold = True
    buf = io.BytesIO()
    document.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": content_disposition(f"zbirni_obracun_{start}_{end}.docx")},
    )


@api_router.delete("/settlements/{sid}")
async def delete_settlement(sid: str, user: dict = Depends(require_admin)):
    await db.settlements.delete_one({"_id": ObjectId(sid)})
    return {"message": "Obračun obrisan"}


@api_router.put("/settlements/{sid}")
async def update_settlement(sid: str, payload: SettlementUpdate, user: dict = Depends(require_admin)):
    s = await db.settlements.find_one({"_id": ObjectId(sid)})
    if not s:
        raise HTTPException(status_code=404, detail="Obračun nije pronađen")
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "company_expenses" in upd:
        rsd_rate = await get_rsd_rate()
        _normalize_amounts(upd["company_expenses"], rsd_rate)
    if "expenses" in upd:
        rsd_rate = await get_rsd_rate()
        _normalize_amounts(upd["expenses"], rsd_rate)
    s.update(upd)
    upd["calc"] = compute_settlement(s)
    await db.settlements.update_one({"_id": ObjectId(sid)}, {"$set": upd})
    doc = await db.settlements.find_one({"_id": ObjectId(sid)})
    doc["id"] = str(doc["_id"]); doc.pop("_id", None)
    return doc


def _eur(n):
    s = f"{float(n or 0):,.2f}"
    return s.replace(",", "§").replace(".", ",").replace("§", ".") + " €"


@api_router.get("/settlements/{sid}/pdf")
async def settlement_pdf(sid: str, user: dict = Depends(get_current_user)):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import cm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    s = await db.settlements.find_one({"_id": ObjectId(sid)})
    if not s:
        raise HTTPException(status_code=404, detail="Obračun nije pronađen")
    dname = "-"
    if s.get("driver_id"):
        d = await db.drivers.find_one({"_id": ObjectId(s["driver_id"])})
        if d:
            dname = f"{d.get('first_name','')} {d.get('last_name','')}".strip()
    plate = ""
    if s.get("vehicle_id"):
        try:
            v = await db.vehicles.find_one({"_id": ObjectId(s["vehicle_id"])})
            plate = v.get("plate", "") if v else ""
        except Exception:
            plate = ""
    calc = compute_settlement(s)
    _register_pdf_fonts()
    styles = getSampleStyleSheet()
    center = ParagraphStyle('c', parent=styles['Title'], fontName="LibSans-Bold", fontSize=16, alignment=1)
    sub = ParagraphStyle('s', parent=styles['Normal'], fontName="LibSans", alignment=1, fontSize=10)
    norm = ParagraphStyle('n', parent=styles['Normal'], fontName="LibSans", fontSize=10)
    buf = io.BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=A4, topMargin=1.2 * cm, bottomMargin=1.2 * cm,
                            leftMargin=1.5 * cm, rightMargin=1.5 * cm)
    elems = [
        Paragraph("Obračun i razduženje vozača po krugu", center),
        Paragraph("APR MENSUR DULJEVIĆ", sub),
        Paragraph("PIB: 114365454 &#183; MB: 67518896", sub),
        Spacer(1, 0.4 * cm),
        Paragraph(f"<b>Vozač:</b> {dname}", norm),
        Paragraph(f"<b>Vozilo:</b> {plate or '-'} &#183; <b>Krug:</b> {s.get('trip_label') or '-'} &#183; <b>Datum:</b> {fmt_ddmmyy(s.get('date'))}", norm),
        Spacer(1, 0.4 * cm),
        Paragraph("<b>Troškovi kamiona</b>", norm),
        Spacer(1, 0.15 * cm),
    ]
    paid_lbl = {"advance": "Akontacija", "own": "Svoj novac"}
    exp = s.get("expenses", []) or []
    edata = [["Vrsta troška", "Iznos", "Plaćeno iz"]]
    for e in exp:
        edata.append([e.get("category", "") or "-", _eur(e.get("amount")), paid_lbl.get(e.get("paid_from"), e.get("paid_from", ""))])
    if not exp:
        edata.append(["Nema troškova", "-", "-"])
    etable = Table(edata, colWidths=[9 * cm, 4 * cm, 4 * cm], repeatRows=1)
    etable.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, -1), "LibSans"),
        ("FONTNAME", (0, 0), (-1, 0), "LibSans-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#94a3b8")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
        ("ALIGN", (1, 0), (2, -1), "RIGHT"),
    ]))
    elems += [etable, Spacer(1, 0.5 * cm), Paragraph("<b>Obračun</b>", norm), Spacer(1, 0.15 * cm)]
    if calc.get("final_due", 0) >= 0:
        result_row = ["ZA ISPLATU VOZAČU", _eur(calc.get("payout"))]
        result_bg = colors.HexColor("#dcfce7")
    else:
        result_row = ["VOZAČ VRAĆA FIRMI", _eur(calc.get("driver_returns"))]
        result_bg = colors.HexColor("#fee2e2")
    sdata = [
        ["Cena kruga (vozaču)", _eur(s.get("driver_pay"))],
        ["Dnevnice za čekanje", _eur(calc.get("waiting"))],
        ["Ukupna zarada vozača", _eur(calc.get("total_earnings"))],
        ["Akontacija (zaduženje)", _eur(s.get("cash_advance"))],
        ["Troškovi iz akontacije", _eur(calc.get("expenses_from_advance"))],
        ["Troškovi iz svog novca", _eur(calc.get("expenses_own"))],
        ["Ukupno troškovi", _eur(calc.get("total_expenses"))],
        ["Preostala akontacija kod vozača", _eur(calc.get("remaining_advance"))],
        result_row,
    ]
    stable = Table(sdata, colWidths=[13 * cm, 4 * cm])
    stable.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "LibSans"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#eff6ff")),
        ("FONTNAME", (0, 2), (-1, 2), "LibSans-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), result_bg),
        ("FONTNAME", (0, -1), (-1, -1), "LibSans-Bold"),
        ("FONTSIZE", (0, -1), (-1, -1), 12),
    ]))
    elems += [stable, Spacer(1, 1.2 * cm),
              Paragraph("Potpis vozača: ______________________&nbsp;&nbsp;&nbsp;&nbsp;Potpis odgovornog lica: ______________________", norm)]
    pdf.build(elems)
    buf.seek(0)
    fname = f"obracun_{(dname or 'vozac').replace(' ', '_')}_{s.get('date','')}.pdf"
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": content_disposition(fname)})


@api_router.get("/settlements/{sid}/word")
async def settlement_word(sid: str, user: dict = Depends(get_current_user)):
    s = await db.settlements.find_one({"_id": ObjectId(sid)})
    if not s:
        raise HTTPException(status_code=404, detail="Obračun nije pronađen")
    dname = "-"
    if s.get("driver_id"):
        d = await db.drivers.find_one({"_id": ObjectId(s["driver_id"])})
        if d:
            dname = f"{d.get('first_name','')} {d.get('last_name','')}".strip()
    plate = ""
    if s.get("vehicle_id"):
        try:
            v = await db.vehicles.find_one({"_id": ObjectId(s["vehicle_id"])})
            plate = v.get("plate", "") if v else ""
        except Exception:
            plate = ""
    calc = compute_settlement(s)

    document = Document()
    h = document.add_heading("Obračun i razduženje vozača po krugu", level=0)
    h.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub = document.add_paragraph("APR MENSUR DULJEVIĆ")
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for r in sub.runs:
        r.bold = True
        r.font.size = Pt(14)
    pib = document.add_paragraph("PIB: 114365454   ·   MB: 67518896")
    pib.alignment = WD_ALIGN_PARAGRAPH.CENTER

    document.add_paragraph(f"Obračun ID: {sid}")
    document.add_paragraph(f"Vozač: {dname}")
    document.add_paragraph(f"Vozilo / prikolica: {plate or '-'}   ·   Krug / ruta: {s.get('trip_label') or '-'}   ·   Datum: {fmt_ddmmyy(s.get('date'))}")

    paid_lbl = {"advance": "Akontacija", "own": "Svoj novac"}
    exp = s.get("expenses", []) or []
    document.add_paragraph("Troškovi kamiona").runs[0].bold = True
    et = document.add_table(rows=1, cols=3)
    et.style = "Light Grid Accent 1"
    hc = et.rows[0].cells
    hc[0].text, hc[1].text, hc[2].text = "Vrsta troška", "Iznos", "Plaćeno iz"
    if not exp:
        rc = et.add_row().cells
        rc[0].text, rc[1].text, rc[2].text = "Nema troškova", "-", "-"
    for e in exp:
        rc = et.add_row().cells
        rc[0].text = e.get("category", "") or "-"
        rc[1].text = _eur(e.get("amount"))
        rc[2].text = paid_lbl.get(e.get("paid_from"), e.get("paid_from", ""))

    document.add_paragraph("")
    document.add_paragraph("Obračun").runs[0].bold = True
    rows = [
        ("Cena po krugu (vozaču)", _eur(s.get("driver_pay"))),
        ("Dnevnice za čekanje", _eur(calc.get("waiting"))),
        ("Ukupna zarada vozača", _eur(calc.get("total_earnings"))),
        ("Zaduženje / Akontacija", _eur(s.get("cash_advance"))),
        ("Troškovi iz akontacije", _eur(calc.get("expenses_from_advance"))),
        ("Troškovi iz svog novca", _eur(calc.get("expenses_own"))),
        ("Ukupno troškovi", _eur(calc.get("total_expenses"))),
        ("Preostala akontacija kod vozača", _eur(calc.get("remaining_advance"))),
    ]
    st = document.add_table(rows=0, cols=2)
    st.style = "Light Grid Accent 1"
    for label, val in rows:
        rc = st.add_row().cells
        rc[0].text = label
        rc[1].text = val
    rc = st.add_row().cells
    if calc.get("final_due", 0) >= 0:
        rc[0].text = "ZA ISPLATU VOZAČU"
        rc[1].text = _eur(calc.get("payout"))
    else:
        rc[0].text = "VOZAČ VRAĆA FIRMI (keš)"
        rc[1].text = _eur(calc.get("driver_returns"))
    for cell in rc:
        for p in cell.paragraphs:
            for run in p.runs:
                run.bold = True
                run.font.size = Pt(13)

    document.add_paragraph("")
    document.add_paragraph("")
    sign = document.add_paragraph("Potpis vozača: ______________________          Razdužio / Ovlašćeno lice: ______________________")
    sign.runs[0].font.size = Pt(11)

    buf = io.BytesIO()
    document.save(buf)
    buf.seek(0)
    fname = f"obracun_{(dname or 'vozac').replace(' ', '_')}_{s.get('date','')}.docx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": content_disposition(fname)},
    )


# ---------------- Currency + driver portal ----------------
async def get_rsd_rate() -> float:
    s = await db.app_settings.find_one({"_id": "rates"})
    try:
        return float((s or {}).get("rsd_per_eur") or 117.0)
    except (TypeError, ValueError):
        return 117.0


def to_eur(amount, currency, rate=None, rsd_rate=117.0) -> float:
    amount = float(amount or 0)
    c = (currency or "EUR").upper()
    if c == "EUR":
        return round(amount, 2)
    if c == "RSD":
        r = rsd_rate or 117.0
        return round(amount / r, 2) if r > 0 else 0.0
    # manual-rate currencies (TRY, BGN, HUF, ...)
    r = float(rate or 0)
    return round(amount / r, 2) if r > 0 else 0.0


def build_expense_dict(payload, rsd_rate, by, at):
    eur = to_eur(payload.amount, payload.currency, payload.rate, rsd_rate)
    cur = (payload.currency or "EUR").upper()
    parts = []
    if payload.country:
        parts.append(payload.country)
    parts.append(f"{payload.amount} {cur}")
    if payload.rate:
        parts.append(f"kurs {payload.rate}")
    return {
        "id": str(uuid.uuid4()),
        "category": payload.description or "Trošak",
        "amount": eur,
        "paid_from": payload.paid_from if payload.paid_from in ("advance", "own") else "advance",
        "note": " · ".join(parts),
        "currency": cur,
        "orig_amount": float(payload.amount or 0),
        "rate": float(payload.rate) if payload.rate else None,
        "country": payload.country,
        "by": by,
        "at": at,
    }


def _exp_brief(e):
    if not e:
        return None
    return {"category": e.get("category"), "amount": e.get("amount"),
            "orig_amount": e.get("orig_amount"), "currency": e.get("currency"),
            "paid_from": e.get("paid_from")}


async def log_expense_audit(s, action, by_role, by_name, before, after):
    await db.expense_audit.insert_one({
        "settlement_id": str(s.get("_id") or ""),
        "trip_label": s.get("trip_label") or "",
        "driver_id": s.get("driver_id") or "",
        "action": action,
        "by_role": by_role,
        "by_name": by_name or "",
        "at": datetime.now(timezone.utc).isoformat(),
        "before": before,
        "after": after,
    })


def _normalize_amounts(items, rsd_rate):
    for e in items:
        if not e.get("id"):
            e["id"] = str(uuid.uuid4())
        cur = (e.get("currency") or "EUR").upper()
        orig = float(e.get("amount") or 0)
        e["orig_amount"] = orig
        e["currency"] = cur
        e["amount"] = to_eur(orig, cur, e.get("rate"), rsd_rate)
        if not e.get("note"):
            parts = []
            if e.get("country"):
                parts.append(e["country"])
            parts.append(f"{orig} {cur}")
            if e.get("rate"):
                parts.append(f"kurs {e['rate']}")
            e["note"] = " · ".join(parts)
    return items


def maint_eur(m: dict, rsd_rate: float) -> float:
    parts = float(m.get("cost", 0) or 0)
    labor = float(m.get("mechanic_cost", 0) or 0)
    return to_eur(parts + labor, m.get("cost_currency") or "RSD", None, rsd_rate)


class DriverAccountCreate(BaseModel):
    driver_id: Optional[str] = None
    first_name: str = ""
    last_name: str = ""
    username: str
    password: str


class PasswordSet(BaseModel):
    password: str


class RatesUpdate(BaseModel):
    rsd_per_eur: float
    big_expense_eur: Optional[float] = None


class AdvanceEntry(BaseModel):
    amount: float
    note: str = ""


class DriverExpenseEntry(BaseModel):
    description: str
    amount: float
    country: str = ""
    currency: str = "EUR"
    rate: Optional[float] = None
    paid_from: str = "advance"


@api_router.get("/settings/rates")
async def get_rates(user: dict = Depends(get_current_user)):
    s = await db.app_settings.find_one({"_id": "rates"}) or {}
    return {"rsd_per_eur": float(s.get("rsd_per_eur") or 117.0),
            "big_expense_eur": float(s.get("big_expense_eur") or 200.0)}


@api_router.put("/settings/rates")
async def set_rates(payload: RatesUpdate, user: dict = Depends(require_admin)):
    upd = {"rsd_per_eur": float(payload.rsd_per_eur)}
    if payload.big_expense_eur is not None:
        upd["big_expense_eur"] = float(payload.big_expense_eur)
    await db.app_settings.update_one({"_id": "rates"}, {"$set": upd}, upsert=True)
    return upd


async def get_big_expense_threshold() -> float:
    s = await db.app_settings.find_one({"_id": "rates"})
    try:
        return float((s or {}).get("big_expense_eur") or 200.0)
    except (TypeError, ValueError):
        return 200.0


def settlement_alerts(s: dict, threshold: float) -> list:
    alerts = []
    for e in (s.get("expenses") or []):
        amt = float(e.get("amount") or 0)
        if amt > threshold:
            alerts.append({"type": "big_expense",
                           "message": f"Veliki trošak: {e.get('category', '')} — {round(amt, 2)} €"})
    calc = s.get("calc") or compute_settlement(s)
    if calc.get("remaining_advance", 0) < 0:
        alerts.append({"type": "advance_exceeded",
                       "message": f"Troškovi iz akontacije prelaze akontaciju za {abs(round(calc.get('remaining_advance', 0), 2))} €"})
    return alerts


@api_router.get("/alerts")
async def admin_alerts(user: dict = Depends(require_admin)):
    threshold = await get_big_expense_threshold()
    docs = await db.settlements.find().sort("created_at", -1).to_list(1000)
    drivers = await db.drivers.find().to_list(1000)
    name_by = {str(d["_id"]): f"{d.get('first_name','')} {d.get('last_name','')}".strip() for d in drivers}
    out = []
    for d in docs:
        al = settlement_alerts(d, threshold)
        if al:
            out.append({"id": str(d["_id"]), "driver_name": name_by.get(d.get("driver_id") or "", ""),
                        "trip_label": d.get("trip_label", ""), "date": d.get("date", ""), "alerts": al})
    return {"count": len(out), "items": out}


@api_router.get("/driver-accounts")
async def list_driver_accounts(user: dict = Depends(require_admin)):
    users = await db.users.find({"role": "driver"}).to_list(1000)
    drivers = await db.drivers.find().to_list(1000)
    name_by = {str(d["_id"]): f"{d.get('first_name','')} {d.get('last_name','')}".strip() for d in drivers}
    return [{"id": str(u["_id"]), "username": u.get("username", ""), "name": u.get("name", ""),
             "driver_id": u.get("driver_id", ""), "driver_name": name_by.get(u.get("driver_id") or "", "")}
            for u in users]


@api_router.post("/driver-accounts")
async def create_driver_account(payload: DriverAccountCreate, user: dict = Depends(require_admin)):
    uname = payload.username.strip()
    if not uname or not payload.password:
        raise HTTPException(status_code=400, detail="Korisničko ime i lozinka su obavezni")
    if await db.users.find_one({"username": uname}):
        raise HTTPException(status_code=400, detail="Korisničko ime već postoji")
    driver_id = payload.driver_id
    if driver_id:
        d = await db.drivers.find_one({"_id": ObjectId(driver_id)})
        if not d:
            raise HTTPException(status_code=404, detail="Vozač nije pronađen")
        name = f"{d.get('first_name','')} {d.get('last_name','')}".strip()
    else:
        res = await db.drivers.insert_one({"first_name": payload.first_name.strip(),
                                           "last_name": payload.last_name.strip(),
                                           "phone": "", "id_number": ""})
        driver_id = str(res.inserted_id)
        name = f"{payload.first_name} {payload.last_name}".strip()
    await db.users.insert_one({"username": uname, "email": f"{uname.lower()}@driver.local",
                               "password_hash": hash_password(payload.password),
                               "name": name or uname, "role": "driver", "driver_id": driver_id,
                               "created_at": datetime.now(timezone.utc).isoformat()})
    return {"message": "Nalog vozača kreiran", "driver_id": driver_id}


@api_router.put("/driver-accounts/{uid}/password")
async def reset_driver_password(uid: str, payload: PasswordSet, user: dict = Depends(require_admin)):
    if not payload.password:
        raise HTTPException(status_code=400, detail="Lozinka je obavezna")
    await db.users.update_one({"_id": ObjectId(uid), "role": "driver"},
                              {"$set": {"password_hash": hash_password(payload.password)}})
    return {"message": "Lozinka promenjena"}


@api_router.delete("/driver-accounts/{uid}")
async def delete_driver_account(uid: str, user: dict = Depends(require_admin)):
    await db.users.delete_one({"_id": ObjectId(uid), "role": "driver"})
    return {"message": "Nalog obrisan"}


async def _recompute_settlement(sid: str):
    s = await db.settlements.find_one({"_id": ObjectId(sid)})
    if not s:
        return None
    calc = compute_settlement(s)
    await db.settlements.update_one({"_id": ObjectId(sid)}, {"$set": {"calc": calc}})
    s["id"] = str(s["_id"]); s.pop("_id", None)
    s["calc"] = calc
    s.pop("tour_price", None)
    s.pop("company_expenses", None)
    s["calc"] = {k: v for k, v in calc.items() if k not in ("profit", "tour_price", "company_expenses_total")}
    return s


@api_router.get("/my/tours")
async def my_tours(user: dict = Depends(require_driver)):
    docs = await db.settlements.find({"driver_id": user["driver_id"]}).sort("date", -1).to_list(1000)
    veh = await db.vehicles.find().to_list(1000)
    plate_by = {str(v["_id"]): v.get("plate", "") for v in veh}
    out = []
    for d in docs:
        d["id"] = str(d["_id"]); d.pop("_id", None)
        d["vehicle_plate"] = plate_by.get(d.get("vehicle_id") or "", "")
        d.pop("tour_price", None)
        d.pop("company_expenses", None)
        if isinstance(d.get("calc"), dict):
            d["calc"] = {k: v for k, v in d["calc"].items() if k not in ("profit", "tour_price", "company_expenses_total")}
        out.append(d)
    return out


@api_router.post("/my/tours/{sid}/advance")
async def my_add_advance(sid: str, payload: AdvanceEntry, user: dict = Depends(require_driver)):
    s = await db.settlements.find_one({"_id": ObjectId(sid), "driver_id": user["driver_id"]})
    if not s:
        raise HTTPException(status_code=404, detail="Tura nije pronađena")
    if (s.get("status") or "razduzeno") == "razduzeno":
        raise HTTPException(status_code=403, detail="Tura je razdužena i ne može se menjati.")
    entry = {"amount": float(payload.amount or 0), "note": payload.note or "",
             "at": datetime.now(timezone.utc).isoformat(), "by": "driver"}
    await db.settlements.update_one({"_id": ObjectId(sid)},
                                    {"$inc": {"cash_advance": float(payload.amount or 0)},
                                     "$push": {"advance_entries": entry}})
    return await _recompute_settlement(sid)


@api_router.post("/my/tours/{sid}/expense")
async def my_add_expense(sid: str, payload: DriverExpenseEntry, user: dict = Depends(require_driver)):
    s = await db.settlements.find_one({"_id": ObjectId(sid), "driver_id": user["driver_id"]})
    if not s:
        raise HTTPException(status_code=404, detail="Tura nije pronađena")
    if (s.get("status") or "razduzeno") == "razduzeno":
        raise HTTPException(status_code=403, detail="Tura je razdužena i ne može se menjati.")
    rsd_rate = await get_rsd_rate()
    exp = build_expense_dict(payload, rsd_rate, "driver", datetime.now(timezone.utc).isoformat())
    await db.settlements.update_one({"_id": ObjectId(sid)}, {"$push": {"expenses": exp}})
    return await _recompute_settlement(sid)


@api_router.put("/my/tours/{sid}/expense/{idx}")
async def my_edit_expense(sid: str, idx: int, payload: DriverExpenseEntry, user: dict = Depends(require_driver)):
    s = await db.settlements.find_one({"_id": ObjectId(sid), "driver_id": user["driver_id"]})
    if not s:
        raise HTTPException(status_code=404, detail="Tura nije pronađena")
    if (s.get("status") or "razduzeno") == "razduzeno":
        raise HTTPException(status_code=403, detail="Tura je razdužena i ne može se menjati.")
    exp = s.get("expenses") or []
    if idx < 0 or idx >= len(exp):
        raise HTTPException(status_code=404, detail="Trošak nije pronađen")
    if exp[idx].get("by") != "driver":
        raise HTTPException(status_code=403, detail="Možete menjati samo svoje troškove.")
    rsd_rate = await get_rsd_rate()
    old = exp[idx]
    exp[idx] = build_expense_dict(payload, rsd_rate, "driver", old.get("at") or datetime.now(timezone.utc).isoformat())
    exp[idx]["id"] = old.get("id") or exp[idx]["id"]
    await db.settlements.update_one({"_id": ObjectId(sid)}, {"$set": {"expenses": exp}})
    await log_expense_audit(s, "edit", "driver", user.get("username"), _exp_brief(old), _exp_brief(exp[idx]))
    return await _recompute_settlement(sid)


@api_router.delete("/my/tours/{sid}/expense/{idx}")
async def my_delete_expense(sid: str, idx: int, user: dict = Depends(require_driver)):
    s = await db.settlements.find_one({"_id": ObjectId(sid), "driver_id": user["driver_id"]})
    if not s:
        raise HTTPException(status_code=404, detail="Tura nije pronađena")
    if (s.get("status") or "razduzeno") == "razduzeno":
        raise HTTPException(status_code=403, detail="Tura je razdužena i ne može se menjati.")
    exp = s.get("expenses") or []
    if idx < 0 or idx >= len(exp):
        raise HTTPException(status_code=404, detail="Trošak nije pronađen")
    if exp[idx].get("by") != "driver":
        raise HTTPException(status_code=403, detail="Možete brisati samo svoje troškove.")
    old = exp[idx]
    exp.pop(idx)
    await db.settlements.update_one({"_id": ObjectId(sid)}, {"$set": {"expenses": exp}})
    await log_expense_audit(s, "delete", "driver", user.get("username"), _exp_brief(old), None)
    return await _recompute_settlement(sid)


@api_router.post("/settlements/{sid}/expense")
async def admin_add_expense(sid: str, payload: DriverExpenseEntry, user: dict = Depends(require_admin)):
    s = await db.settlements.find_one({"_id": ObjectId(sid)})
    if not s:
        raise HTTPException(status_code=404, detail="Obračun nije pronađen")
    rsd_rate = await get_rsd_rate()
    exp = s.get("expenses") or []
    exp.append(build_expense_dict(payload, rsd_rate, "admin", datetime.now(timezone.utc).isoformat()))
    s["expenses"] = exp
    calc = compute_settlement(s)
    await db.settlements.update_one({"_id": ObjectId(sid)}, {"$set": {"expenses": exp, "calc": calc}})
    doc = await db.settlements.find_one({"_id": ObjectId(sid)})
    doc["id"] = str(doc["_id"]); doc.pop("_id", None)
    return doc


@api_router.put("/settlements/{sid}/expense/{idx}")
async def admin_edit_expense(sid: str, idx: int, payload: DriverExpenseEntry, user: dict = Depends(require_admin)):
    s = await db.settlements.find_one({"_id": ObjectId(sid)})
    if not s:
        raise HTTPException(status_code=404, detail="Obračun nije pronađen")
    exp = s.get("expenses") or []
    if idx < 0 or idx >= len(exp):
        raise HTTPException(status_code=404, detail="Trošak nije pronađen")
    rsd_rate = await get_rsd_rate()
    old = exp[idx]
    exp[idx] = build_expense_dict(payload, rsd_rate, old.get("by") or "admin", old.get("at") or datetime.now(timezone.utc).isoformat())
    exp[idx]["id"] = old.get("id") or exp[idx]["id"]
    s["expenses"] = exp
    calc = compute_settlement(s)
    await db.settlements.update_one({"_id": ObjectId(sid)}, {"$set": {"expenses": exp, "calc": calc}})
    await log_expense_audit(s, "edit", "admin", user.get("name") or user.get("email"), _exp_brief(old), _exp_brief(exp[idx]))
    doc = await db.settlements.find_one({"_id": ObjectId(sid)})
    doc["id"] = str(doc["_id"]); doc.pop("_id", None)
    return doc


@api_router.delete("/settlements/{sid}/expense/{idx}")
async def admin_delete_expense(sid: str, idx: int, user: dict = Depends(require_admin)):
    s = await db.settlements.find_one({"_id": ObjectId(sid)})
    if not s:
        raise HTTPException(status_code=404, detail="Obračun nije pronađen")
    exp = s.get("expenses") or []
    if idx < 0 or idx >= len(exp):
        raise HTTPException(status_code=404, detail="Trošak nije pronađen")
    old = exp[idx]
    exp.pop(idx)
    s["expenses"] = exp
    calc = compute_settlement(s)
    await db.settlements.update_one({"_id": ObjectId(sid)}, {"$set": {"expenses": exp, "calc": calc}})
    await log_expense_audit(s, "delete", "admin", user.get("name") or user.get("email"), _exp_brief(old), None)
    doc = await db.settlements.find_one({"_id": ObjectId(sid)})
    doc["id"] = str(doc["_id"]); doc.pop("_id", None)
    return doc


@api_router.get("/expense-audit")
async def expense_audit(user: dict = Depends(require_admin)):
    docs = await db.expense_audit.find().sort("at", -1).to_list(300)
    drivers = await db.drivers.find().to_list(1000)
    name_by = {str(d["_id"]): f"{d.get('first_name','')} {d.get('last_name','')}".strip() for d in drivers}
    out = []
    for d in docs:
        d["id"] = str(d["_id"]); d.pop("_id", None)
        d["driver_name"] = name_by.get(d.get("driver_id") or "", "")
        out.append(d)
    return out


async def build_truck_earnings(start, end, vehicle_id=None):
    q = {"date": {"$gte": f"{start}-01", "$lte": f"{end}-31"}}
    if vehicle_id:
        q["vehicle_id"] = vehicle_id
    settlements = await db.settlements.find(q).to_list(10000)
    maint = await db.maintenance.find(q).to_list(10000)
    veh = await db.vehicles.find().to_list(1000)
    plate_by = {str(v["_id"]): v.get("plate", "") for v in veh}
    months = months_between(start, end)
    month_frac = months / 12.0
    rsd_rate = await get_rsd_rate()
    agg = {}

    def row(vid):
        return agg.setdefault(vid, {"vehicle_id": vid, "vehicle_plate": plate_by.get(vid, "") or "—",
                                    "revenue": 0.0, "driver_cost": 0.0, "trip_expenses": 0.0,
                                    "maintenance": 0.0, "annual_costs": 0.0})
    for s in settlements:
        calc = s.get("calc") or compute_settlement(s)
        r = row(s.get("vehicle_id") or "")
        comp_total = sum(float(e.get("amount") or 0) for e in (s.get("company_expenses") or []))
        r["revenue"] += float(s.get("tour_price") or 0)
        r["driver_cost"] += float(calc.get("total_earnings") or 0)
        r["trip_expenses"] += float(calc.get("total_expenses") or 0) + comp_total
    for m in maint:
        r = row(m.get("vehicle_id") or "")
        r["maintenance"] += maint_eur(m, rsd_rate)
    for v in veh:
        if vehicle_id and str(v["_id"]) != vehicle_id:
            continue
        ann_rsd = sum(float(c.get("amount") or 0) for c in (v.get("annual_costs") or []))
        if ann_rsd > 0:
            ann_eur = to_eur(ann_rsd, "RSD", None, rsd_rate)
            row(str(v["_id"]))["annual_costs"] += ann_eur * month_frac
    rows = []
    for r in agg.values():
        tc = r["driver_cost"] + r["trip_expenses"] + r["maintenance"] + r["annual_costs"]
        r["total_cost"] = round(tc, 2)
        r["profit"] = round(r["revenue"] - tc, 2)
        for k in ("revenue", "driver_cost", "trip_expenses", "maintenance", "annual_costs"):
            r[k] = round(r[k], 2)
        rows.append(r)
    rows.sort(key=lambda x: x["profit"], reverse=True)
    keys = ("revenue", "driver_cost", "trip_expenses", "maintenance", "annual_costs", "total_cost", "profit")
    totals = {k: round(sum(x[k] for x in rows), 2) for k in keys}
    oc = await db.overhead_costs.find().to_list(1000)
    overhead_monthly = 0.0
    overhead_items = []
    for c in oc:
        amt = float(c.get("amount") or 0)
        mo_rsd = amt if c.get("period") == "monthly" else amt / 12.0
        mo = to_eur(mo_rsd, "RSD", None, rsd_rate)
        overhead_monthly += mo
        overhead_items.append({"name": c.get("name", ""), "period": c.get("period", "monthly"),
                               "amount": round(mo * months, 2)})
    show_overhead = vehicle_id is None
    if not show_overhead:
        overhead = 0.0
        overhead_items = []
    else:
        overhead = round(overhead_monthly * months, 2)
    net_profit = round(totals["profit"] - overhead, 2)
    top = rows[0] if rows and rows[0]["profit"] > 0 else None
    selected_vehicle = None
    if vehicle_id:
        sv = next((x for x in veh if str(x["_id"]) == vehicle_id), None)
        if sv:
            selected_vehicle = {"plate": sv.get("plate", ""), "make": sv.get("make", ""),
                                "model": sv.get("model", ""), "year": sv.get("year", ""),
                                "vehicle_type": sv.get("vehicle_type", ""), "vin": sv.get("vin", ""),
                                "current_odometer": sv.get("current_odometer", "")}
    return {"start": start, "end": end, "period_label": period_label(start, end), "months": months,
            "rows": rows, "totals": totals, "overhead": overhead, "overhead_items": overhead_items,
            "net_profit": net_profit, "top_vehicle": top, "selected_vehicle": selected_vehicle,
            "show_overhead": show_overhead}


@api_router.get("/reports/truck-earnings")
async def truck_earnings(start: str, end: str, vehicle_id: Optional[str] = None, user: dict = Depends(require_admin)):
    return await build_truck_earnings(start, end, vehicle_id)


@api_router.get("/reports/truck-earnings/pdf")
async def truck_earnings_pdf(start: str, end: str, vehicle_id: Optional[str] = None, user: dict = Depends(require_admin)):
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib import colors
    from reportlab.lib.units import cm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    data = await build_truck_earnings(start, end, vehicle_id)
    _register_pdf_fonts()
    styles = getSampleStyleSheet()
    center = ParagraphStyle('c', parent=styles['Title'], fontName="LibSans-Bold", fontSize=15, alignment=1)
    sub = ParagraphStyle('s', parent=styles['Normal'], fontName="LibSans", alignment=1, fontSize=10)
    header = ["Vozilo", "Prihod", "Trošak vozača", "Putni troškovi", "Održavanje", "Godišnji fiksni", "Ukupno trošak", "Profit"]
    body = [[r["vehicle_plate"], _eur(r["revenue"]), _eur(r["driver_cost"]), _eur(r["trip_expenses"]),
             _eur(r["maintenance"]), _eur(r["annual_costs"]), _eur(r["total_cost"]), _eur(r["profit"])] for r in data["rows"]]
    if not body:
        body = [["Nema podataka", "-", "-", "-", "-", "-", "-", "-"]]
    t = data["totals"]
    show_ov = data.get("show_overhead", True)
    body.append(["UKUPNO", _eur(t["revenue"]), _eur(t["driver_cost"]), _eur(t["trip_expenses"]),
                 _eur(t["maintenance"]), _eur(t["annual_costs"]), _eur(t["total_cost"]), _eur(t["profit"])])
    if show_ov:
        body.append(["Opšti troškovi firme", "", "", "", "", "", _eur(data["overhead"]), "−" + _eur(data["overhead"])])
    body.append(["NETO PROFIT", "", "", "", "", "", "", _eur(data["net_profit"])])
    urow = -3 if show_ov else -2
    table = Table([header] + body, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, -1), "LibSans"),
        ("FONTNAME", (0, 0), (-1, 0), "LibSans-Bold"),
        ("FONTNAME", (0, urow), (-1, -1), "LibSans-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#94a3b8")),
        ("ROWBACKGROUNDS", (0, 1), (-1, urow - 1), [colors.white, colors.HexColor("#f1f5f9")]),
        ("BACKGROUND", (0, urow), (-1, urow), colors.HexColor("#dbeafe")),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#bbf7d0")),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
    ]))
    buf = io.BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=landscape(A4), topMargin=1.2 * cm, bottomMargin=1.2 * cm,
                            leftMargin=1.2 * cm, rightMargin=1.2 * cm)
    sv = data.get("selected_vehicle")
    elems = [Paragraph(f"Zarada kamiona — {data['period_label']}", center),
             Paragraph("APR MENSUR DULJEVIĆ · PIB: 114365454 · MB: 67518896", sub)]
    if sv:
        veh_line = f"Vozilo: {sv.get('plate','')} · {sv.get('make','')} {sv.get('model','')}".strip()
        extra = []
        if sv.get("vehicle_type"):
            extra.append(str(sv["vehicle_type"]))
        if sv.get("year"):
            extra.append(str(sv["year"]))
        if sv.get("vin"):
            extra.append(f"VIN {sv['vin']}")
        if sv.get("current_odometer"):
            extra.append(f"{sv['current_odometer']} km")
        if extra:
            veh_line += " · " + " · ".join(extra)
        elems.append(Paragraph(veh_line, sub))
    elems += [Spacer(1, 0.5 * cm), table]
    pdf.build(elems)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": content_disposition(f"zarada_kamiona_{start}_{end}.pdf")})


@api_router.get("/reports/truck-earnings/word")
async def truck_earnings_word(start: str, end: str, vehicle_id: Optional[str] = None, user: dict = Depends(require_admin)):
    data = await build_truck_earnings(start, end, vehicle_id)
    document = Document()
    h = document.add_heading(f"Zarada kamiona — {data['period_label']}", level=0)
    h.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p = document.add_paragraph("APR MENSUR DULJEVIĆ · PIB: 114365454 · MB: 67518896")
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sv = data.get("selected_vehicle")
    if sv:
        parts = [f"Vozilo: {sv.get('plate','')}", f"{sv.get('make','')} {sv.get('model','')}".strip()]
        if sv.get("vehicle_type"):
            parts.append(str(sv["vehicle_type"]))
        if sv.get("year"):
            parts.append(str(sv["year"]))
        if sv.get("vin"):
            parts.append(f"VIN {sv['vin']}")
        if sv.get("current_odometer"):
            parts.append(f"{sv['current_odometer']} km")
        vp = document.add_paragraph(" · ".join([x for x in parts if x]))
        vp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for run in vp.runs:
            run.bold = True
    headers = ["Vozilo", "Prihod", "Trošak vozača", "Putni troškovi", "Održavanje", "Godišnji fiksni", "Ukupno trošak", "Profit"]
    table = document.add_table(rows=1, cols=len(headers))
    table.style = "Light Grid Accent 1"
    for i, htx in enumerate(headers):
        table.rows[0].cells[i].text = htx
    for r in data["rows"]:
        rc = table.add_row().cells
        vals = [r["vehicle_plate"], _eur(r["revenue"]), _eur(r["driver_cost"]), _eur(r["trip_expenses"]),
                _eur(r["maintenance"]), _eur(r["annual_costs"]), _eur(r["total_cost"]), _eur(r["profit"])]
        for i, v in enumerate(vals):
            rc[i].text = v
    t = data["totals"]
    bold_rows = [
        ["UKUPNO", _eur(t["revenue"]), _eur(t["driver_cost"]), _eur(t["trip_expenses"]),
         _eur(t["maintenance"]), _eur(t["annual_costs"]), _eur(t["total_cost"]), _eur(t["profit"])],
    ]
    if data.get("show_overhead", True):
        bold_rows.append(["Opšti troškovi firme", "", "", "", "", "", _eur(data["overhead"]), "−" + _eur(data["overhead"])])
    bold_rows.append(["NETO PROFIT", "", "", "", "", "", "", _eur(data["net_profit"])])
    for vals in bold_rows:
        rc = table.add_row().cells
        for i, v in enumerate(vals):
            rc[i].text = v
            for pp in rc[i].paragraphs:
                for run in pp.runs:
                    run.bold = True
    buf = io.BytesIO()
    document.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                             headers={"Content-Disposition": content_disposition(f"zarada_kamiona_{start}_{end}.docx")})


app.include_router(api_router)

def get_cors_origins():
    origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://fleet-manager-olive.vercel.app",
    ]
    for env_var in ("FRONTEND_URL", "CORS_ORIGINS"):
        val = os.environ.get(env_var, "").strip().strip('"').strip("'")
        if val and val != "*":
            for part in val.split(","):
                p = part.strip().rstrip("/")
                if p and p not in origins:
                    origins.append(p)
    return origins


app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    admin_emails = [e.strip().lower() for e in
                    [os.environ.get("ADMIN_EMAIL", "admin@example.com"),
                     os.environ.get("ADMIN_EMAIL_2", "")] if e and e.strip()]
    for admin_email in admin_emails:
        existing = await db.users.find_one({"email": admin_email})
        if existing is None:
            await db.users.insert_one({
                "email": admin_email,
                "password_hash": hash_password(admin_password),
                "name": "Administrator",
                "role": "admin",
                "company": "APR MENSUR DULJEVIĆ",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info(f"Admin seeded: {admin_email}")
        elif not existing.get("password_changed") and not verify_password(admin_password, existing["password_hash"]):
            await db.users.update_one({"email": admin_email},
                                      {"$set": {"password_hash": hash_password(admin_password)}})


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
    try:
        sync_client.close()
    except Exception:
        pass


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=True)

