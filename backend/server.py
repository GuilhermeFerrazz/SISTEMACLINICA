# -*- coding: utf-8 -*-
import os
os.environ.setdefault("PYTHONUTF8", "1")  # Força UTF-8 em todo o processo Python

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from urllib.parse import quote
from io import BytesIO
import requests
import boto3
import mimetypes
import uuid
import bcrypt
import jwt
import qrcode
import secrets
import base64
import json

# PDF Imports
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, black, white, Color
from reportlab.lib import colors as rl_colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, Image as RLImage
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_RIGHT

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ==================== CONFIGURAÇÃO CLOUDFLARE R2 ====================
R2_ENDPOINT_URL = os.environ.get("R2_ENDPOINT_URL")
R2_ACCESS_KEY = os.environ.get("R2_ACCESS_KEY",)
R2_SECRET_KEY = os.environ.get("R2_SECRET_KEY",)
R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME")
R2_PUBLIC_URL = os.environ.get("R2_PUBLIC_URL")

try:
    s3_client = boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT_URL,
        aws_access_key_id=R2_ACCESS_KEY,
        aws_secret_access_key=R2_SECRET_KEY,
        region_name="auto"
    )
except Exception as e:
    s3_client = None

def upload_to_r2(b64_str: str, folder: str) -> str:
    """Helper para enviar Base64 ao R2 e retornar URL pública"""
    if not b64_str or not b64_str.startswith("data:image"):
        return b64_str
    try:
        header, encoded = b64_str.split(",", 1)
        mime_type = header.split(";")[0].split(":")[1]
        ext = mimetypes.guess_extension(mime_type) or ".jpg"
        file_data = base64.b64decode(encoded)
        filename = f"{folder}/{uuid.uuid4().hex}{ext}"
        s3_client.put_object(Bucket=R2_BUCKET_NAME, Key=filename, Body=file_data, ContentType=mime_type)
        return f"{R2_PUBLIC_URL}/{filename}"
    except Exception as e:
        print(f"Erro no upload para R2: {e}")
        return b64_str
# ====================================================================

# Database Connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()

# ==================== CORS ====================
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "https://app.drguilhermeferraz.com,http://localhost:3000,http://localhost:3001").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")
JWT_ALGORITHM = "HS256"

# ==================== PYDANTIC MODELS ====================

class PatientCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    phone: str = Field(..., min_length=1, max_length=30)
    email: Optional[str] = Field(None, max_length=200)
    cpf: Optional[str] = Field(None, max_length=20)
    birth_date: Optional[str] = None
    address: Optional[str] = Field(None, max_length=500)
    medical_history: Optional[str] = Field(None, max_length=5000)
    allergies: Optional[str] = Field(None, max_length=2000)
    notes: Optional[str] = Field(None, max_length=2000)

class PatientUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    phone: Optional[str] = Field(None, min_length=1, max_length=30)
    email: Optional[str] = Field(None, max_length=200)
    cpf: Optional[str] = Field(None, max_length=20)
    birth_date: Optional[str] = None
    address: Optional[str] = Field(None, max_length=500)
    medical_history: Optional[str] = Field(None, max_length=5000)
    allergies: Optional[str] = Field(None, max_length=2000)
    notes: Optional[str] = Field(None, max_length=2000)
    consent_signed: Optional[bool] = None
    consent_date: Optional[str] = None

class MedicalRecordCreate(BaseModel):
    patient_id: str = Field(..., min_length=1)
    procedure_id: str = Field(..., min_length=1)
    procedure_name: Optional[str] = Field(None, max_length=200)
    date: str = Field(..., pattern=r'^\d{4}-\d{2}-\d{2}$')
    chief_complaint: Optional[str] = Field(None, max_length=2000)
    clinical_notes: Optional[str] = Field(None, max_length=10000)
    diagnosis: Optional[str] = Field(None, max_length=2000)
    treatment_plan: Optional[str] = Field(None, max_length=5000)
    products_applied: Optional[List[str]] = Field(default_factory=list)
    techniques_used: Optional[str] = Field(None, max_length=2000)
    observations: Optional[str] = Field(None, max_length=5000)
    photos_before: Optional[List[str]] = Field(default_factory=list)
    photos_after: Optional[List[str]] = Field(default_factory=list)
    evolution_notes: Optional[str] = Field(None, max_length=5000)
    next_session_notes: Optional[str] = Field(None, max_length=2000)
    next_session_date: Optional[str] = None

class MedicalRecordUpdate(BaseModel):
    procedure_id: Optional[str] = None
    procedure_name: Optional[str] = Field(None, max_length=200)
    date: Optional[str] = Field(None, pattern=r'^\d{4}-\d{2}-\d{2}$')
    chief_complaint: Optional[str] = Field(None, max_length=2000)
    clinical_notes: Optional[str] = Field(None, max_length=10000)
    diagnosis: Optional[str] = Field(None, max_length=2000)
    treatment_plan: Optional[str] = Field(None, max_length=5000)
    products_applied: Optional[List[str]] = None
    techniques_used: Optional[str] = Field(None, max_length=2000)
    observations: Optional[str] = Field(None, max_length=5000)
    photos_before: Optional[List[str]] = None
    photos_after: Optional[List[str]] = None
    evolution_notes: Optional[str] = Field(None, max_length=5000)
    next_session_notes: Optional[str] = Field(None, max_length=2000)
    next_session_date: Optional[str] = None

class AppointmentCreate(BaseModel):
    patient_id: str = Field(..., min_length=1)
    procedure_id: str = Field(..., min_length=1)
    date: str = Field(..., pattern=r'^\d{4}-\d{2}-\d{2}$')
    time: str = Field(..., pattern=r'^\d{2}:\d{2}$')
    notes: Optional[str] = Field(None, max_length=1000)

class AppointmentUpdate(BaseModel):
    status: Optional[str] = Field(None, pattern=r'^(scheduled|confirmed|completed|cancelled)$')
    date: Optional[str] = Field(None, pattern=r'^\d{4}-\d{2}-\d{2}$')
    time: Optional[str] = Field(None, pattern=r'^\d{2}:\d{2}$')
    notes: Optional[str] = Field(None, max_length=1000)

class ProcedureCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    duration_minutes: int = Field(30, ge=5, le=480)
    description: Optional[str] = Field(None, max_length=2000)
    price: Optional[float] = Field(None, ge=0)
    consent_template: Optional[str] = Field(None, max_length=20000)
    products: Optional[List[dict]] = Field(default_factory=list)

class ProcedureUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    duration_minutes: Optional[int] = Field(None, ge=5, le=480)
    description: Optional[str] = Field(None, max_length=2000)
    price: Optional[float] = Field(None, ge=0)
    consent_template: Optional[str] = Field(None, max_length=20000)
    products: Optional[List[dict]] = None

class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    category: str = Field(..., pattern=r'^(injetável|creme|envase|equipamento|outro)$')
    quantity: int = Field(0, ge=0)
    batch_number: str = Field(..., min_length=1, max_length=100)
    expiration_date: str = Field(..., pattern=r'^\d{4}-\d{2}-\d{2}$')
    supplier: str = Field(..., min_length=1, max_length=200)
    fill_date: Optional[str] = Field(None, pattern=r'^\d{4}-\d{2}-\d{2}$')
    responsible: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = Field(None, max_length=1000)

class ProductUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    category: Optional[str] = Field(None, pattern=r'^(injetável|creme|envase|equipamento|outro)$')
    quantity: Optional[int] = Field(None, ge=0)
    batch_number: Optional[str] = Field(None, min_length=1, max_length=100)
    expiration_date: Optional[str] = Field(None, pattern=r'^\d{4}-\d{2}-\d{2}$')
    supplier: Optional[str] = Field(None, min_length=1, max_length=200)
    fill_date: Optional[str] = None
    responsible: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = Field(None, max_length=1000)

class MovementCreate(BaseModel):
    product_id: str = Field(..., min_length=1)
    type: str = Field(..., pattern=r'^(entrada|saida)$')
    quantity: int = Field(..., ge=1)
    notes: Optional[str] = Field(None, max_length=500)

class TransactionCreate(BaseModel):
    description: str = Field(..., min_length=1, max_length=500)
    amount: float = Field(..., gt=0)
    type: str = Field(..., pattern=r'^(income|expense)$')
    category: str = Field(..., min_length=1, max_length=100)
    payment_method: str = Field(..., min_length=1, max_length=50)
    date: str = Field(..., pattern=r'^\d{4}-\d{2}-\d{2}$')
    status: Optional[str] = Field("paid", pattern=r'^(paid|pending|cancelled)$')

class ConsentLinkCreate(BaseModel):
    patient_id: str = Field(..., min_length=1)
    procedure_id: Optional[str] = None
    procedure_name: Optional[str] = Field(None, max_length=200)
    consent_text: Optional[str] = Field(None, max_length=50000)

class LoginCredentials(BaseModel):
    email: str = Field(..., min_length=1, max_length=200)
    password: str = Field(..., min_length=1, max_length=200)

class RegisterCredentials(BaseModel):
    email: str = Field(..., min_length=1, max_length=200)
    password: str = Field(..., min_length=6, max_length=200)
    name: str = Field(..., min_length=1, max_length=200)

class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

# ==============================================================================
# WHATSAPP — Encoding robusto de emojis
# ==============================================================================

_DEFAULT_TEMPLATES: dict = {
    "consent_link": (
        "Ol\u00e1 {nome}! Tudo bem? \U0001F60A\n\n"
        "\U0001F4CB Informamos que o documento Termo de Consentimento "
        "para o procedimento de {procedimento} j\u00e1 est\u00e1 dispon\u00edvel "
        "para sua assinatura digital.\n\n"
        "\U0001F517 Para visualizar e assinar, acesse o link: {link}\n\n"
        "\u23F3 Aten\u00e7\u00e3o: Por quest\u00f5es de seguran\u00e7a, "
        "este link expira em 48 horas.\n\n"
        "Caso tenha qualquer d\u00favida, nossa equipe est\u00e1 pronta para te ajudar! "
        "\U0001F49B\n\nAtenciosamente,\nEquipe {clinica}."
    ),
    "birthday": (
        "Feliz Anivers\u00e1rio, {nome}! \U0001F382\n\n"
        "Toda a equipe da cl\u00ednica deseja um dia maravilhoso repleto de alegrias! "
        "\U0001F60D\n\nConte conosco sempre!"
    ),
    "botox_return": (
        "Ol\u00e1 {nome}! \U0001F44B\n\n"
        "J\u00e1 faz 5 meses desde sua \u00faltima aplica\u00e7\u00e3o de Botox "
        "em {ultimo_procedimento}.\n\n"
        "Que tal agendar seu retorno? Estamos \u00e0 disposi\u00e7\u00e3o! "
        "\U0001F48C\n\nAguardamos voc\u00ea!"
    ),
    "inactive_patient": (
        "Ol\u00e1 {nome}! \U0001F44B\n\n"
        "Sentimos sua falta! Seu \u00faltimo procedimento foi em {ultimo_procedimento}.\n\n"
        "Gostar\u00edamos de saber como voc\u00ea est\u00e1. "
        "Entre em contato conosco! \U0001F496\n\nEstamos \u00e0 disposi\u00e7\u00e3o!"
    ),
    "appointment_confirmation": (
        "Ol\u00e1 {nome}! \U0001F44B\n\n"
        "Confirmamos seu agendamento na {clinica}:\n\n"
        "\U0001F4C5 Data: {data}\n"
        "\U0001F550 Hor\u00e1rio: {horario}\n"
        "\U0001F48C Procedimento: {procedimento}\n\n"
        "Por favor, confirme sua presen\u00e7a respondendo esta mensagem.\n\n"
        "Aguardamos voc\u00ea! \u2728"
    ),
    "appointment_reminder": (
        "Ol\u00e1 {nome}! \U0001F44B\n\n"
        "Lembramos que voc\u00ea tem um agendamento amanh\u00e3 na {clinica}:\n\n"
        "\U0001F4C5 Data: {data}\n"
        "\U0001F550 Hor\u00e1rio: {horario}\n"
        "\U0001F48C Procedimento: {procedimento}\n\n"
        "Confirme sua presen\u00e7a! \U0001F4AB"
    ),
}


def _get_template_msg(tmpl: dict | None, tmpl_type: str) -> str:
    if tmpl:
        msg = tmpl.get("message", "")
        if msg and "\ufffd" not in msg:
            return msg
    return _DEFAULT_TEMPLATES.get(tmpl_type, "")


def _reconstruct_surrogates(s: str) -> str:
    out: list[str] = []
    i = 0
    while i < len(s):
        cp = ord(s[i])
        if 0xD800 <= cp <= 0xDBFF and i + 1 < len(s):
            ncp = ord(s[i + 1])
            if 0xDC00 <= ncp <= 0xDFFF:
                out.append(chr(0x10000 + (cp - 0xD800) * 0x400 + (ncp - 0xDC00)))
                i += 2
                continue
        out.append(s[i])
        i += 1
    return "".join(out)


def whatsapp_encode(message: str) -> str:
    fixed = _reconstruct_surrogates(message)
    return quote(fixed.encode("utf-8", errors="replace"), safe="")


def build_whatsapp_url(phone: str, message: str) -> str:
    return f"https://wa.me/{phone}?text={whatsapp_encode(message)}"

# ==================== AUTH HELPERS ====================

def get_jwt_secret() -> str:
    return os.environ.get("JWT_SECRET")

def create_refresh_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "exp": datetime.now(timezone.utc) + timedelta(minutes=60), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "): token = auth_header[7:]
    if not token: raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user: raise HTTPException(status_code=401)
        user["_id"] = str(user["_id"])
        return user
    except: raise HTTPException(status_code=401)

# ==================== CRM ALERTS ====================

@api_router.get("/patients/alerts/birthdays")
async def get_birthday_alerts(current_user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date()
    patients = await db.patients.find({}, {"_id": 0}).to_list(1000)
    alerts = []
    for p in patients:
        if p.get("birth_date"):
            try:
                birth = datetime.strptime(p["birth_date"], "%Y-%m-%d").date()
                bday = birth.replace(year=today.year)
                if bday < today:
                    bday = birth.replace(year=today.year + 1)
                days_until = (bday - today).days
                if 0 <= days_until <= 7:
                    p["days_until_birthday"] = days_until
                    p["is_today"] = days_until == 0
                    alerts.append(p)
            except Exception:
                pass
    alerts.sort(key=lambda x: x.get("days_until_birthday", 0))
    return alerts

@api_router.get("/patients/alerts/botox-return")
async def get_botox_alerts(current_user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date()
    appointments = await db.appointments.find(
        {"procedure_name": {"$regex": "botox|toxina", "$options": "i"},
         "status": {"$ne": "cancelled"}},
        {"_id": 0}
    ).sort("date", -1).to_list(5000)
    seen = {}
    for apt in appointments:
        pid = apt.get("patient_id")
        if pid and pid not in seen:
            seen[pid] = apt
    alerts = []
    for pid, apt in seen.items():
        try:
            apt_date = datetime.strptime(apt["date"], "%Y-%m-%d").date()
            days_since = (today - apt_date).days
            if days_since >= 140:
                patient = await db.patients.find_one({"id": pid}, {"_id": 0})
                if patient:
                    patient["last_botox_date"] = apt["date"]
                    patient["days_since_botox"] = days_since
                    patient["last_procedure"] = apt.get("procedure_name", "")
                    alerts.append(patient)
        except Exception:
            pass
    alerts.sort(key=lambda x: x.get("days_since_botox", 0), reverse=True)
    return alerts

@api_router.get("/patients/alerts/inactive")
async def get_inactive_alerts(current_user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date()
    all_patients = await db.patients.find({}, {"_id": 0}).to_list(1000)
    inactive = []
    for p in all_patients:
        pid = p.get("id")
        all_apps = await db.appointments.find(
            {"patient_id": pid, "status": {"$ne": "cancelled"}},
            {"_id": 0}
        ).sort("date", -1).limit(1).to_list(1)
        last_app = all_apps[0] if all_apps else None
        if last_app:
            try:
                apt_date = datetime.strptime(last_app["date"], "%Y-%m-%d").date()
                days_inactive = (today - apt_date).days
                if days_inactive >= 90:
                    p["days_inactive"] = days_inactive
                    p["last_appointment_date"] = last_app["date"]
                    p["last_procedure"] = last_app.get("procedure_name", "N/A")
                    inactive.append(p)
            except Exception:
                pass
        else:
            try:
                created = datetime.fromisoformat(p.get("created_at", datetime.now(timezone.utc).isoformat()).replace("Z", "+00:00")).date()
                days_inactive = (today - created).days
            except Exception:
                days_inactive = 0
            p["days_inactive"] = days_inactive
            p["last_appointment_date"] = None
            p["last_procedure"] = "Nenhum agendamento"
            inactive.append(p)
    inactive.sort(key=lambda x: x.get("days_inactive", 0), reverse=True)
    return inactive

@api_router.get("/message-templates")
async def get_message_templates(current_user: dict = Depends(get_current_user)):
    templates = await db.message_templates.find({}, {"_id": 0}).to_list(100)
    if not templates:
        defaults = [
            {"id": "botox", "name": "Retorno Botox", "type": "botox_return", "message": "Ola {nome}! Ja faz algum tempo desde sua ultima aplicacao de Botox. Vamos renovar sua beleza?", "active": True},
            {"id": "bday", "name": "Aniversario", "type": "birthday", "message": "Parabens {nome}! A clinica preparou um presente especial para voce. Venha nos visitar!", "active": True},
            {"id": "consent_link", "name": "Termo de Consentimento (WhatsApp)", "type": "consent_link", "active": True,
             "message": "Ola {nome}! Tudo bem?\n\nInformamos que o documento Termo de Consentimento para o procedimento de {procedimento} ja esta disponivel para sua assinatura digital.\n\nPara visualizar e assinar, acesse o link: > {link}\n\nAtencao: Por questoes de seguranca, este link expira em 48 horas.\n\nCaso tenha qualquer duvida, nossa equipe esta pronta para te ajudar!\n\nAtenciosamente,\nEquipe {clinica}."}
        ]
        await db.message_templates.insert_many(defaults)
        return defaults
    return templates

@api_router.put("/message-templates/{id}")
async def update_template(id: str, request: Request, current_user: dict = Depends(get_current_user)):
    data = await request.json()
    await db.message_templates.update_one({"id": id}, {"$set": data})
    return {"message": "Template atualizado"}

# ==================== FINANCEIRO ====================

@api_router.get("/finance/summary")
async def get_finance_summary(current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    first_day = now.replace(day=1).strftime("%Y-%m-%d")
    transactions = await db.transactions.find({"date": {"$gte": first_day}}, {"_id": 0}).to_list(2000)
    income = sum(t.get("amount", 0) for t in transactions if t.get("type") == "income")
    expense = sum(t.get("amount", 0) for t in transactions if t.get("type") == "expense")
    return {"monthly_income": income, "monthly_expense": expense, "monthly_profit": income - expense}

@api_router.post("/finance/transactions")
async def create_transaction(transaction: TransactionCreate, current_user: dict = Depends(get_current_user)):
    doc = transaction.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["created_by"] = current_user.get("name")
    await db.transactions.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/finance/transactions")
async def get_transactions(current_user: dict = Depends(get_current_user)):
    return await db.transactions.find({}, {"_id": 0}).sort("date", -1).to_list(1000)

@api_router.delete("/finance/transactions/{id}")
async def delete_transaction(id: str, current_user: dict = Depends(get_current_user)):
    await db.transactions.delete_one({"id": id})
    return {"message": "Transação removida"}

# ==================== FINANCE REPORTS ====================

@api_router.get("/finance/reports/monthly")
async def get_monthly_report(current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    months = []
    for i in range(5, -1, -1):
        m = now.month - i
        y = now.year
        if m <= 0:
            m += 12
            y -= 1
        months.append((y, m))
    result = []
    for y, m in months:
        first = f"{y:04d}-{m:02d}-01"
        nm = m + 1 if m < 12 else 1
        ny = y if m < 12 else y + 1
        last = f"{ny:04d}-{nm:02d}-01"
        txns = await db.transactions.find(
            {"date": {"$gte": first, "$lt": last}}, {"_id": 0}
        ).to_list(5000)
        income  = sum(t.get("amount", 0) for t in txns if t.get("type") == "income")
        expense = sum(t.get("amount", 0) for t in txns if t.get("type") == "expense")
        result.append({
            "month": f"{m:02d}/{y}",
            "income": income,
            "expense": expense,
            "profit": income - expense,
        })
    return result

@api_router.get("/finance/reports/by-category")
async def get_by_category(current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    first_day = now.replace(day=1).strftime("%Y-%m-%d")
    txns = await db.transactions.find({"date": {"$gte": first_day}}, {"_id": 0}).to_list(5000)
    cats: dict = {}
    for t in txns:
        c = t.get("category", "Outros")
        if c not in cats:
            cats[c] = {"income": 0, "expense": 0}
        if t.get("type") == "income":
            cats[c]["income"]  += t.get("amount", 0)
        else:
            cats[c]["expense"] += t.get("amount", 0)
    return [{"category": k, **v} for k, v in cats.items()]

@api_router.get("/finance/reports/by-payment")
async def get_by_payment(current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    first_day = now.replace(day=1).strftime("%Y-%m-%d")
    txns = await db.transactions.find(
        {"date": {"$gte": first_day}, "type": "income"}, {"_id": 0}
    ).to_list(5000)
    methods: dict = {}
    for t in txns:
        m = t.get("payment_method", "Outros")
        methods[m] = methods.get(m, 0) + t.get("amount", 0)
    return [{"method": k, "total": v} for k, v in methods.items()]

@api_router.get("/finance/reports/export-pdf")
async def export_finance_pdf(current_user: dict = Depends(get_current_user)):
    from reportlab.platypus import Table, TableStyle, HRFlowable
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT

    now = datetime.now(timezone.utc)
    first_day = now.replace(day=1).strftime("%Y-%m-%d")
    transactions = await db.transactions.find(
        {"date": {"$gte": first_day}}, {"_id": 0}
    ).sort("date", -1).to_list(2000)

    settings    = await db.settings.find_one({"type": "clinic"}, {"_id": 0}) or {}
    clinic_name = settings.get("clinic_name", "Clinica")
    lh          = settings.get("letterhead_config", {})
    try:    h_color = HexColor(lh.get("header_color", "#1a3a1a"))
    except: h_color = HexColor("#1a3a1a")

    income  = sum(t.get("amount", 0) for t in transactions if t.get("type") == "income")
    expense = sum(t.get("amount", 0) for t in transactions if t.get("type") == "expense")
    profit  = income - expense

    def brl(v):
        return "R$ {:,.2f}".format(abs(v)).replace(",", "X").replace(".", ",").replace("X", ".")

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm,
        topMargin=15*mm, bottomMargin=20*mm)

    _styles = getSampleStyleSheet()
    def sty(name, **kw):
        return ParagraphStyle(name, parent=_styles["Normal"], **kw)

    s_title   = sty("ft",  fontSize=16,  textColor=h_color, fontName="Helvetica-Bold", alignment=TA_CENTER, spaceAfter=4*mm)
    s_sub     = sty("fs",  fontSize=9,   textColor=rl_colors.grey, alignment=TA_CENTER, spaceAfter=6*mm)
    s_section = sty("fsc", fontSize=11,  textColor=h_color, fontName="Helvetica-Bold", spaceBefore=6*mm, spaceAfter=3*mm)
    s_bold    = sty("fb",  fontSize=8.5, fontName="Helvetica-Bold")
    s_bold_r  = sty("fbr", fontSize=8.5, fontName="Helvetica-Bold", alignment=TA_RIGHT)
    s_cell    = sty("fc",  fontSize=8.5)
    green_r   = sty("gr",  fontSize=8.5, alignment=TA_RIGHT, textColor=HexColor("#16a34a"), fontName="Helvetica-Bold")
    red_r     = sty("rr",  fontSize=8.5, alignment=TA_RIGHT, textColor=HexColor("#dc2626"), fontName="Helvetica-Bold")

    story = []
    story.append(Paragraph(clinic_name, s_title))
    story.append(Paragraph(f"Relatorio Financeiro - {now.strftime('%m/%Y')}", s_sub))
    story.append(HRFlowable(width="100%", thickness=1, color=h_color))
    story.append(Spacer(1, 5*mm))

    # KPI Summary
    story.append(Paragraph("RESUMO DO MES", s_section))
    profit_sty = green_r if profit >= 0 else red_r
    kpi = [
        [Paragraph("Entradas",      s_bold), Paragraph(brl(income),  green_r)],
        [Paragraph("Saidas",        s_bold), Paragraph(brl(expense), red_r)],
        [Paragraph("Lucro Liquido", s_bold), Paragraph(brl(profit),  profit_sty)],
    ]
    kt = Table(kpi, colWidths=[80*mm, 80*mm])
    kt.setStyle(TableStyle([
        ("ROWBACKGROUNDS", (0,0), (-1,-1), [HexColor("#f0fdf4"), HexColor("#fef2f2"), HexColor("#ecfdf5")]),
        ("BOX",           (0,0), (-1,-1),  0.5, rl_colors.lightgrey),
        ("INNERGRID",     (0,0), (-1,-1),  0.3, rl_colors.lightgrey),
        ("TOPPADDING",    (0,0), (-1,-1),  5),
        ("BOTTOMPADDING", (0,0), (-1,-1),  5),
        ("LEFTPADDING",   (0,0), (-1,-1),  8),
        ("RIGHTPADDING",  (0,0), (-1,-1),  8),
        ("VALIGN",        (0,0), (-1,-1),  "MIDDLE"),
        ("LINEBELOW",     (0,-1),(-1,-1),  2, h_color),
    ]))
    story.append(kt)
    story.append(Spacer(1, 5*mm))

    # Transactions table
    if transactions:
        story.append(Paragraph("MOVIMENTACOES DO MES", s_section))
        rows = [[
            Paragraph("Data",      s_bold),
            Paragraph("Descricao", s_bold),
            Paragraph("Categoria", s_bold),
            Paragraph("Pagamento", s_bold),
            Paragraph("Valor",     s_bold_r),
        ]]
        for t in transactions:
            try:    d = datetime.strptime(t["date"], "%Y-%m-%d").strftime("%d/%m/%Y")
            except: d = t.get("date", "")
            is_inc = t.get("type") == "income"
            vsty   = green_r if is_inc else red_r
            rows.append([
                Paragraph(d, s_cell),
                Paragraph(str(t.get("description",""))[:45], s_cell),
                Paragraph(str(t.get("category","")), s_cell),
                Paragraph(str(t.get("payment_method","")), s_cell),
                Paragraph(f"{'+'if is_inc else'-'} {brl(t.get('amount',0))}", vsty),
            ])
        tbl = Table(rows, colWidths=[22*mm, 60*mm, 28*mm, 28*mm, 32*mm], repeatRows=1)
        tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (-1,0),  h_color),
            ("TEXTCOLOR",     (0,0), (-1,0),  white),
            ("FONTNAME",      (0,0), (-1,0),  "Helvetica-Bold"),
            ("FONTSIZE",      (0,0), (-1,0),  8.5),
            ("ROWBACKGROUNDS",(0,1), (-1,-1), [white, HexColor("#f9fafb")]),
            ("INNERGRID",     (0,0), (-1,-1), 0.25, rl_colors.lightgrey),
            ("BOX",           (0,0), (-1,-1), 0.5,  rl_colors.grey),
            ("TOPPADDING",    (0,0), (-1,-1), 4),
            ("BOTTOMPADDING", (0,0), (-1,-1), 4),
            ("LEFTPADDING",   (0,0), (-1,-1), 5),
            ("RIGHTPADDING",  (0,0), (-1,-1), 5),
            ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ]))
        story.append(tbl)

    story.append(Spacer(1, 8*mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=rl_colors.lightgrey))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        f"Gerado em {now.strftime('%d/%m/%Y as %H:%M')} por {current_user.get('name','Sistema')}",
        sty("fn", fontSize=7, textColor=rl_colors.grey, alignment=TA_CENTER)
    ))
    doc.build(story)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=relatorio_financeiro_{now.strftime('%Y%m')}.pdf"})

# ==================== PACIENTES ====================

@api_router.get("/patients")
async def get_patients(current_user: dict = Depends(get_current_user)):
    return await db.patients.find({}, {"_id": 0}).sort("name", 1).to_list(1000)

@api_router.post("/patients")
async def create_patient(patient: PatientCreate, current_user: dict = Depends(get_current_user)):
    doc = patient.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["consent_signed"] = False
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.patients.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/patients/{id}")
async def update_patient(id: str, patient: PatientUpdate, current_user: dict = Depends(get_current_user)):
    data = patient.model_dump(exclude_none=True)
    await db.patients.update_one({"id": id}, {"$set": data})
    return {"message": "Paciente atualizado"}

@api_router.delete("/patients/{id}")
async def delete_patient(id: str, current_user: dict = Depends(get_current_user)):
    await db.patients.delete_one({"id": id})
    return {"message": "Paciente removido"}

# ==================== PRONTUÁRIO ====================

@api_router.post("/medical-records")
async def create_medical_record(record: MedicalRecordCreate, current_user: dict = Depends(get_current_user)):
    doc = record.model_dump()
    doc["photos_before"] = [upload_to_r2(p, "prontuarios") for p in (doc.get("photos_before") or [])]
    doc["photos_after"] = [upload_to_r2(p, "prontuarios") for p in (doc.get("photos_after") or [])]
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["created_by"] = current_user.get("name")
    await db.medical_records.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/medical-records/patient/{patient_id}")
async def get_records(patient_id: str, current_user: dict = Depends(get_current_user)):
    return await db.medical_records.find({"patient_id": patient_id}, {"_id": 0}).sort("date", -1).to_list(500)

@api_router.get("/medical-records/patient/{patient_id}/export")
async def export_medical_records(patient_id: str, current_user: dict = Depends(get_current_user)):
    records = await db.medical_records.find({"patient_id": patient_id}, {"_id": 0}).sort("date", -1).to_list(500)
    patient = await db.patients.find_one({"id": patient_id}, {"_id": 0})
    return {"patient": patient, "medical_records": records, "total": len(records),
            "export_date": datetime.now(timezone.utc).isoformat()}

@api_router.delete("/medical-records/patient/{patient_id}/all")
async def delete_all_medical_records(patient_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.medical_records.delete_many({"patient_id": patient_id})
    return {"message": str(result.deleted_count) + " prontuarios excluidos"}

@api_router.get("/medical-records/{record_id}")
async def get_medical_record(record_id: str, current_user: dict = Depends(get_current_user)):
    record = await db.medical_records.find_one({"id": record_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Prontuario nao encontrado")
    return record

@api_router.put("/medical-records/{record_id}")
async def update_medical_record(record_id: str, record: MedicalRecordUpdate, current_user: dict = Depends(get_current_user)):
    data = record.model_dump(exclude_none=True)
    if data.get("photos_before"):
        data["photos_before"] = [upload_to_r2(p, "prontuarios") if isinstance(p, str) and p.startswith("data:image") else p for p in data["photos_before"]]
    if data.get("photos_after"):
        data["photos_after"] = [upload_to_r2(p, "prontuarios") if isinstance(p, str) and p.startswith("data:image") else p for p in data["photos_after"]]
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    data["updated_by"] = current_user.get("name")
    await db.medical_records.update_one({"id": record_id}, {"$set": data})
    result = await db.medical_records.find_one({"id": record_id}, {"_id": 0})
    return result or {"message": "Prontuario atualizado"}

@api_router.delete("/medical-records/{record_id}")
async def delete_medical_record(record_id: str, current_user: dict = Depends(get_current_user)):
    await db.medical_records.delete_one({"id": record_id})
    return {"message": "Prontuario excluido"}

# ==================== AGENDA ====================

@api_router.get("/appointments")
async def get_appointments(date: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {"date": date} if date else {}
    return await db.appointments.find(query, {"_id": 0}).sort([("date", 1), ("time", 1)]).to_list(1000)

@api_router.post("/appointments")
async def create_appointment(appo: AppointmentCreate, current_user: dict = Depends(get_current_user)):
    patient = await db.patients.find_one({"id": appo.patient_id}, {"_id": 0})
    procedure = await db.procedures.find_one({"id": appo.procedure_id}, {"_id": 0})
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedimento não encontrado")
    doc = appo.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["status"] = "scheduled"
    doc["patient_name"] = patient.get("name", "")
    doc["patient_phone"] = patient.get("phone", "")
    doc["procedure_name"] = procedure.get("name", "")
    doc["duration_minutes"] = procedure.get("duration_minutes", 30)
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["created_by"] = current_user.get("name", "")
    await db.appointments.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/appointments/summary")
async def get_daily_summary(date: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    if not date:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    appointments = await db.appointments.find({"date": date, "status": {"$ne": "cancelled"}}, {"_id": 0}).to_list(100)
    procedure_summary = {}
    for apt in appointments:
        proc = apt.get("procedure_name", "Outros")
        procedure_summary[proc] = procedure_summary.get(proc, 0) + 1
    return {
        "date": date,
        "total_appointments": len(appointments),
        "appointments": appointments,
        "procedure_summary": procedure_summary,
        "products_needed": [],
        "stock_alerts": [],
        "has_stock_issues": False
    }

@api_router.put("/appointments/{id}")
async def update_appointment(id: str, appo: AppointmentUpdate, current_user: dict = Depends(get_current_user)):
    data = appo.model_dump(exclude_none=True)
    await db.appointments.update_one({"id": id}, {"$set": data})
    return {"message": "Agendamento atualizado"}

@api_router.get("/appointments/{appointment_id}/whatsapp")
async def get_whatsapp_link(appointment_id: str, template_id: str = "", message_type: str = "confirmation", current_user: dict = Depends(get_current_user)):
    apt = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not apt:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    settings = await db.settings.find_one({"type": "clinic"}, {"_id": 0})
    clinic_name = settings.get("clinic_name", "Nossa Clínica") if settings else "Nossa Clínica"
    phone = apt.get("patient_phone", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if phone and not phone.startswith("55"):
        phone = "55" + phone
    date_fmt = datetime.strptime(apt["date"], "%Y-%m-%d").strftime("%d/%m/%Y")
    if template_id:
        template = await db.message_templates.find_one({"id": template_id}, {"_id": 0})
        if template and template.get("message"):
            message = template["message"]
            message = message.replace("{nome}", apt.get("patient_name", ""))
            message = message.replace("{data}", date_fmt)
            message = message.replace("{horario}", apt.get("time", ""))
            message = message.replace("{procedimento}", apt.get("procedure_name", ""))
            message = message.replace("{clinica}", clinic_name)
        else:
            message = f"Olá {apt.get('patient_name', '')}! Confirmamos seu agendamento na {clinic_name}: {date_fmt} às {apt.get('time', '')} - {apt.get('procedure_name', '')}."
    else:
        message = f"Olá {apt.get('patient_name', '')}! Confirmamos seu agendamento na {clinic_name}: {date_fmt} às {apt.get('time', '')} - {apt.get('procedure_name', '')}."
    whatsapp_url = build_whatsapp_url(phone, message)
    return {"whatsapp_url": whatsapp_url, "phone": phone, "message": message}

@api_router.post("/appointments/{appointment_id}/complete")
async def complete_appointment(appointment_id: str, current_user: dict = Depends(get_current_user)):
    await db.appointments.update_one({"id": appointment_id}, {"$set": {"status": "completed"}})
    return {"message": "Atendimento concluído"}

@api_router.delete("/appointments/{appointment_id}")
async def delete_appointment(appointment_id: str, current_user: dict = Depends(get_current_user)):
    await db.appointments.delete_one({"id": appointment_id})
    return {"message": "Agendamento excluído"}

# ==================== PROCEDIMENTOS ====================

@api_router.get("/procedures")
async def get_procedures(current_user: dict = Depends(get_current_user)):
    return await db.procedures.find({}, {"_id": 0}).sort("name", 1).to_list(200)

@api_router.post("/procedures")
async def create_procedure(proc: ProcedureCreate, current_user: dict = Depends(get_current_user)):
    doc = proc.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.procedures.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/procedures/{procedure_id}")
async def get_procedure_by_id(procedure_id: str, current_user: dict = Depends(get_current_user)):
    proc = await db.procedures.find_one({"id": procedure_id}, {"_id": 0})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedimento nao encontrado")
    return proc

@api_router.put("/procedures/{procedure_id}")
async def update_procedure(procedure_id: str, proc: ProcedureUpdate, current_user: dict = Depends(get_current_user)):
    data = proc.model_dump(exclude_none=True)
    await db.procedures.update_one({"id": procedure_id}, {"$set": data})
    result = await db.procedures.find_one({"id": procedure_id}, {"_id": 0})
    return result or {"message": "Procedimento atualizado"}

@api_router.delete("/procedures/{procedure_id}")
async def delete_procedure(procedure_id: str, current_user: dict = Depends(get_current_user)):
    await db.procedures.delete_one({"id": procedure_id})
    return {"message": "Procedimento excluido"}

# ==================== ESTOQUE ====================

@api_router.get("/products")
async def get_products(current_user: dict = Depends(get_current_user)):
    products = await db.products.find({}, {"_id": 0}).to_list(1000)
    for p in products: p["id"] = p.get("qr_code_id")
    return products

@api_router.post("/products")
async def create_product(product: ProductCreate, current_user: dict = Depends(get_current_user)):
    doc = product.model_dump()
    doc["qr_code_id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.products.insert_one(doc)
    doc.pop("_id", None)
    doc["id"] = doc["qr_code_id"]
    return doc

@api_router.get("/products/{product_id}")
async def get_product(product_id: str, current_user: dict = Depends(get_current_user)):
    product = await db.products.find_one({"qr_code_id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    product["id"] = product["qr_code_id"]
    return product

@api_router.put("/products/{product_id}")
async def update_product(product_id: str, product: ProductUpdate, current_user: dict = Depends(get_current_user)):
    data = product.model_dump(exclude_none=True)
    await db.products.update_one({"qr_code_id": product_id}, {"$set": data})
    product_doc = await db.products.find_one({"qr_code_id": product_id}, {"_id": 0})
    if product_doc:
        product_doc["id"] = product_doc["qr_code_id"]
    return product_doc

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, current_user: dict = Depends(get_current_user)):
    await db.products.delete_one({"qr_code_id": product_id})
    return {"message": "Produto excluído"}

@api_router.get("/qr/generate/{code}")
async def generate_qr(code: str):
    qr = qrcode.QRCode(version=1, box_size=10, border=1)
    qr.add_data(code); qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = BytesIO(); img.save(buf, 'PNG'); buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")

@api_router.get("/qr/scan/{qr_code_id}")
async def scan_qr(qr_code_id: str):
    product = await db.products.find_one({"qr_code_id": qr_code_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    product["id"] = product["qr_code_id"]
    return product

# ==================== AUTH & SETTINGS ====================

@api_router.post("/auth/login")
async def login(credentials: LoginCredentials, response: Response):
    user = await db.users.find_one({"email": credentials.email.lower()})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email ou senha incorretos")
    if user.get("active") is False:
        raise HTTPException(status_code=403, detail="Conta desativada. Contate o administrador.")
    acc = create_access_token(str(user["_id"]), user["email"])
    ref = create_refresh_token(str(user["_id"]), user["email"])
    response.set_cookie(key="access_token", value=acc, httponly=True, secure=True, samesite="none", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=ref, httponly=True, secure=True, samesite="none", max_age=7*24*3600, path="/")
    return {"_id": str(user["_id"]), "name": user["name"], "email": user["email"], "role": user.get("role", "user")}

@api_router.post("/auth/register")
async def register_user(credentials: RegisterCredentials, response: Response):
    email = credentials.email.lower().strip()
    password = credentials.password
    name = credentials.name.strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    doc = {
        "email": email,
        "password_hash": hash_password(password),
        "name": name,
        "role": "user",
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.users.insert_one(doc)
    user_id = str(result.inserted_id)
    acc = create_access_token(user_id, email)
    ref = create_refresh_token(user_id, email)
    response.set_cookie(key="access_token", value=acc, httponly=True, secure=True, samesite="none", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=ref, httponly=True, secure=True, samesite="none", max_age=7*24*3600, path="/")
    return {"_id": user_id, "name": name, "email": email, "role": "user"}

@api_router.post("/auth/refresh")
async def refresh_auth(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user or user.get("active") is False:
            raise HTTPException(status_code=401, detail="User not found or inactive")
        acc = create_access_token(str(user["_id"]), user["email"])
        response.set_cookie(key="access_token", value=acc, httponly=True, secure=True, samesite="none", max_age=3600, path="/")
        return {"message": "Token refreshed"}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

@api_router.post("/auth/logout")
async def logout_user(response: Response):
    response.delete_cookie(key="access_token", path="/", samesite="none", secure=True)
    response.delete_cookie(key="refresh_token", path="/", samesite="none", secure=True)
    return {"message": "Logout realizado"}

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user

@api_router.get("/settings")
async def get_settings(current_user: dict = Depends(get_current_user)):
    return await db.settings.find_one({"type": "clinic"}, {"_id": 0}) or {"type": "clinic", "logo_url": ""}

@api_router.put("/settings")
async def update_settings(request: Request, current_user: dict = Depends(get_current_user)):
    data = await request.json()
    if data.get("logo_url") and data["logo_url"].startswith("data:image"):
        data["logo_url"] = upload_to_r2(data["logo_url"], "config")
    await db.settings.update_one({"type": "clinic"}, {"$set": data}, upsert=True)
    return {"message": "Configurações salvas"}

@api_router.post("/settings/logo")
async def upload_logo(request: Request, current_user: dict = Depends(get_current_user)):
    body = await request.json()
    logo_data = body.get("logo_data", "")
    if logo_data.startswith("data:image"):
        logo_data = upload_to_r2(logo_data, "config")
    await db.settings.update_one({"type": "clinic"}, {"$set": {"logo_url": logo_data}}, upsert=True)
    return {"message": "Logo atualizado"}

# ==================== REPORTS / DASHBOARD ====================

@api_router.get("/reports/dashboard")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    products = await db.products.find({}, {"_id": 0}).to_list(1000)
    movements_raw = await db.movements.find({}, {"_id": 0}).sort("timestamp", -1).limit(10).to_list(10)
    movements = []
    for m in movements_raw:
        m["id"] = m.get("id", str(m.get("_id", uuid.uuid4())))
        m.pop("_id", None)
        movements.append(m)
    total_products = len(products)
    total_quantity = sum(p.get("quantity", 0) for p in products)
    today = datetime.now(timezone.utc)
    expiring_count = 0
    for p in products:
        try:
            exp = datetime.fromisoformat(p["expiration_date"].replace("Z", "+00:00"))
            if 0 <= (exp - today).days <= 30:
                expiring_count += 1
        except: pass
    low_stock_count = sum(1 for p in products if p.get("quantity", 0) < 5)
    return {
        "total_products": total_products,
        "total_quantity": total_quantity,
        "expiring_count": expiring_count,
        "low_stock_count": low_stock_count,
        "recent_movements": movements
    }

@api_router.get("/reports/expiring")
async def get_expiring_products(current_user: dict = Depends(get_current_user)):
    products = await db.products.find({}, {"_id": 0}).to_list(1000)
    today = datetime.now(timezone.utc)
    expiring = []
    for p in products:
        try:
            exp = datetime.fromisoformat(p["expiration_date"].replace("Z", "+00:00"))
            days = (exp - today).days
            if 0 <= days <= 30:
                p["id"] = p.get("qr_code_id")
                p["days_until_expiry"] = days
                expiring.append(p)
        except: pass
    expiring.sort(key=lambda x: x["days_until_expiry"])
    return expiring

@api_router.get("/reports/consumption")
async def get_consumption_report(current_user: dict = Depends(get_current_user)):
    movements = await db.movements.find({"type": "saida"}, {"_id": 0}).to_list(1000)
    consumption_by_date = {}
    for m in movements:
        try:
            date = m["timestamp"][:10]
            consumption_by_date[date] = consumption_by_date.get(date, 0) + m.get("quantity", 0)
        except: pass
    result = [{"date": d, "quantity": q} for d, q in consumption_by_date.items()]
    result.sort(key=lambda x: x["date"])
    return result

# ==================== MOVIMENTAÇÕES ====================

@api_router.get("/movements")
async def get_movements(current_user: dict = Depends(get_current_user)):
    movements = await db.movements.find({}, {"_id": 0}).sort("timestamp", -1).to_list(1000)
    result = []
    for m in movements:
        m["id"] = m.get("id", str(m.get("_id", uuid.uuid4())))
        m.pop("_id", None)
        result.append(m)
    return result

@api_router.post("/movements")
async def create_movement(movement: MovementCreate, current_user: dict = Depends(get_current_user)):
    product = await db.products.find_one({"qr_code_id": movement.product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    if movement.type == "saida":
        if product["quantity"] < movement.quantity:
            raise HTTPException(status_code=400, detail="Quantidade insuficiente em estoque")
        new_qty = product["quantity"] - movement.quantity
    else:
        new_qty = product["quantity"] + movement.quantity
    await db.products.update_one({"qr_code_id": movement.product_id}, {"$set": {"quantity": new_qty}})
    movement_doc = {
        "id": str(uuid.uuid4()),
        "product_id": movement.product_id,
        "product_name": product["name"],
        "type": movement.type,
        "quantity": movement.quantity,
        "user_name": current_user.get("name", ""),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "notes": movement.notes or ""
    }
    await db.movements.insert_one(movement_doc)
    movement_doc.pop("_id", None)
    return movement_doc

# ==================== PACIENTES — extras ====================

@api_router.get("/patients/{patient_id}")
async def get_patient(patient_id: str, current_user: dict = Depends(get_current_user)):
    patient = await db.patients.find_one({"id": patient_id}, {"_id": 0})
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    return patient

@api_router.get("/patients/{patient_id}/history")
async def get_patient_history(patient_id: str, current_user: dict = Depends(get_current_user)):
    patient = await db.patients.find_one({"id": patient_id}, {"_id": 0})
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    appointments = await db.appointments.find({"patient_id": patient_id}, {"_id": 0}).sort("date", -1).to_list(1000)
    return {"patient": patient, "appointments": appointments}

@api_router.get("/patients/{patient_id}/export")
async def export_patient_data(patient_id: str, current_user: dict = Depends(get_current_user)):
    patient = await db.patients.find_one({"id": patient_id}, {"_id": 0})
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    appointments = await db.appointments.find({"patient_id": patient_id}, {"_id": 0}).to_list(1000)
    return {
        "patient": patient,
        "appointments": appointments,
        "export_date": datetime.now(timezone.utc).isoformat(),
        "lgpd_notice": "Dados exportados conforme LGPD"
    }

@api_router.post("/patients/{patient_id}/consent")
async def sign_consent(patient_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    await db.patients.update_one({"id": patient_id}, {"$set": {
        "consent_signed": True,
        "consent_date": datetime.now(timezone.utc).isoformat()
    }})
    return {"message": "Consentimento assinado"}

@api_router.get("/patients/{patient_id}/whatsapp-message")
async def get_patient_whatsapp(patient_id: str, message_type: str, current_user: dict = Depends(get_current_user)):
    patient = await db.patients.find_one({"id": patient_id}, {"_id": 0})
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    template = await db.message_templates.find_one({"type": message_type}, {"_id": 0})
    msg_template = _get_template_msg(template, message_type)
    if msg_template:
        message = (msg_template
            .replace("{nome}", patient.get("name", ""))
            .replace("{clinica}", "Nossa Clínica")
        )
        last_apt = await db.appointments.find_one(
            {"patient_id": patient_id, "status": "completed"},
            {"_id": 0}
        )
        if last_apt:
            from datetime import datetime as _dt
            try:
                last_date = _dt.strptime(last_apt["date"], "%Y-%m-%d").strftime("%d/%m/%Y")
                last_proc = f"{last_apt.get('procedure_name', '')} ({last_date})"
            except Exception:
                last_proc = last_apt.get("procedure_name", "")
            message = message.replace("{ultimo_procedimento}", last_proc)
        else:
            message = message.replace("{ultimo_procedimento}", "N/A")
    else:
        message = f"Ol\u00e1 {patient['name']}!"
    phone = patient["phone"].replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if not phone.startswith("55"):
        phone = "55" + phone
    return {"whatsapp_url": build_whatsapp_url(phone, message), "phone": phone, "message": message}

# ==================== ALERTS ALL ====================

@api_router.get("/patients/alerts/all")
async def get_all_alerts(current_user: dict = Depends(get_current_user)):
    birthdays = await get_birthday_alerts(current_user)
    botox = await get_botox_alerts(current_user)
    inactive = await get_inactive_alerts(current_user)
    return {
        "birthdays": birthdays,
        "botox_returns": botox,
        "inactive_patients": inactive,
        "total_alerts": len(birthdays) + len(botox) + len(inactive)
    }

@api_router.get("/dashboard/patients")
async def get_patients_dashboard(current_user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc)
    today_str = today.strftime("%Y-%m-%d")
    patients = await db.patients.find({}, {"_id": 0}).to_list(1000)
    today_appointments = await db.appointments.find({"date": today_str}, {"_id": 0}).to_list(100)
    month_start = today.replace(day=1).strftime("%Y-%m-%d")
    month_appointments = await db.appointments.find({"date": {"$gte": month_start}}, {"_id": 0}).to_list(1000)
    completed = sum(1 for a in month_appointments if a.get("status") == "completed")
    procedure_counts = {}
    for apt in month_appointments:
        proc = apt.get("procedure_name", "Outros")
        procedure_counts[proc] = procedure_counts.get(proc, 0) + 1
    top_procedures = sorted(procedure_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    birthdays = await get_birthday_alerts(current_user)
    botox = await get_botox_alerts(current_user)
    inactive = await get_inactive_alerts(current_user)
    recent = sorted(patients, key=lambda x: x.get("created_at", ""), reverse=True)[:5]
    consent_count = sum(1 for p in patients if p.get("consent_signed"))
    return {
        "total_patients": len(patients),
        "patients_with_consent": consent_count,
        "consent_percentage": round((consent_count / len(patients) * 100) if patients else 0, 1),
        "today_appointments": len(today_appointments),
        "month_appointments": len(month_appointments),
        "completed_this_month": completed,
        "top_procedures": [{"name": p[0], "count": p[1]} for p in top_procedures],
        "alerts": {"birthdays": len(birthdays), "botox_returns": len(botox), "inactive": len(inactive), "total": len(birthdays) + len(botox) + len(inactive)},
        "recent_patients": recent,
        "birthdays_today": [p for p in birthdays if p.get("is_today")]
    }

# ==================== ADMIN ====================

async def get_admin_user(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acesso negado. Somente administradores.")
    return user

@api_router.get("/admin/users")
async def get_all_users(current_user: dict = Depends(get_admin_user)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    result = []
    for u in users:
        u["id"] = str(u.pop("_id", u.get("id", "")))
        u["active"] = u.get("active", True)
        result.append(u)
    return result

@api_router.post("/admin/users")
async def create_user(request: Request, current_user: dict = Depends(get_admin_user)):
    data = await request.json()
    existing = await db.users.find_one({"email": data["email"].lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    doc = {
        "email": data["email"].lower(),
        "password_hash": hash_password(data["password"]),
        "name": data["name"],
        "role": data.get("role", "user"),
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.users.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc

@api_router.get("/admin/users/{user_id}")
async def get_user(user_id: str, current_user: dict = Depends(get_admin_user)):
    user = await db.users.find_one({"_id": ObjectId(user_id)}, {"password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    user["id"] = str(user.pop("_id"))
    return user

@api_router.put("/admin/users/{user_id}")
async def update_user(user_id: str, request: Request, current_user: dict = Depends(get_admin_user)):
    data = await request.json()
    if "password" in data:
        data["password_hash"] = hash_password(data.pop("password"))
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": data})
    user = await db.users.find_one({"_id": ObjectId(user_id)}, {"password_hash": 0})
    user["id"] = str(user.pop("_id"))
    return user

@api_router.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_admin_user)):
    if user_id == current_user["_id"]:
        raise HTTPException(status_code=400, detail="Não pode excluir sua própria conta")
    await db.users.delete_one({"_id": ObjectId(user_id)})
    return {"message": "Usuário excluído"}

@api_router.get("/admin/stats")
async def get_admin_stats(current_user: dict = Depends(get_admin_user)):
    return {
        "total_users": await db.users.count_documents({}),
        "active_users": await db.users.count_documents({"active": {"$ne": False}}),
        "admin_users": await db.users.count_documents({"role": "admin"}),
        "total_patients": await db.patients.count_documents({}),
        "total_appointments": await db.appointments.count_documents({}),
        "total_products": await db.products.count_documents({})
    }

# ==================== CONSENT ====================

@api_router.get("/consent/public/{token}")
async def get_consent_public(token: str):
    consent = await db.consents.find_one({"token": token}, {"_id": 0})
    if not consent:
        raise HTTPException(status_code=404, detail="Link inválido ou expirado")
    return consent

@api_router.post("/consent/public/{token}/sign")
async def sign_consent_public(token: str, request: Request):
    data = await request.json()
    consent = await db.consents.find_one({"token": token})
    if not consent:
        raise HTTPException(status_code=404, detail="Link inválido")
    await db.consents.update_one({"token": token}, {"$set": {
        "status": "signed",
        "signed_at": datetime.now(timezone.utc).isoformat(),
        "cpf": data.get("cpf"),
        "signature_image": data.get("signature_image"),
        "latitude": data.get("latitude"),
        "longitude": data.get("longitude"),
        "user_agent": data.get("user_agent")
    }})
    await db.patients.update_one({"id": consent.get("patient_id")}, {"$set": {
        "consent_signed": True,
        "consent_date": datetime.now(timezone.utc).isoformat()
    }})
    return {"message": "Termo assinado com sucesso"}

@api_router.get("/consent/pending/{patient_id}")
async def get_pending_consent(patient_id: str, current_user: dict = Depends(get_current_user)):
    return await db.consents.find({"patient_id": patient_id}, {"_id": 0}).to_list(100)

@api_router.post("/consent/generate-link")
async def generate_consent_link(payload: ConsentLinkCreate, current_user: dict = Depends(get_current_user)):
    token = secrets.token_urlsafe(32)
    patient = await db.patients.find_one({"id": payload.patient_id}, {"_id": 0})
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    procedure = None
    if payload.procedure_id:
        procedure = await db.procedures.find_one({"id": payload.procedure_id}, {"_id": 0})

    settings = await db.settings.find_one({"type": "clinic"}, {"_id": 0})
    clinic_name = settings.get("clinic_name", "Nossa Clínica") if settings else "Nossa Clínica"
    procedure_name = procedure.get("name") if procedure else (payload.procedure_name or "Procedimento")

    base_url = os.environ.get("FRONTEND_URL", "https://app.drguilhermeferraz.com")
    signing_link = f"{base_url}/assinar/{token}"

    patient_name = patient.get("name", "")
    tmpl = await db.message_templates.find_one({"type": "consent_link"}, {"_id": 0})
    tmpl_message = _get_template_msg(tmpl, "consent_link")
    message = (tmpl_message
        .replace("{nome}", patient_name)
        .replace("{procedimento}", procedure_name)
        .replace("{link}", signing_link)
        .replace("{clinica}", clinic_name)
    )

    phone = patient.get("phone", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if phone and not phone.startswith("55"):
        phone = "55" + phone

    whatsapp_url = build_whatsapp_url(phone, message)

    consent_text_final = (payload.consent_text or "").strip()
    if not consent_text_final and procedure:
        consent_text_final = procedure.get("consent_template", "").strip()
    if not consent_text_final:
        consent_text_final = (
            "TERMO DE CONSENTIMENTO PARA TRATAMENTO DE DADOS PESSOAIS\n\n"
            "Em conformidade com a Lei Geral de Protecao de Dados (LGPD - Lei no 13.709/2018), "
            "autorizo o tratamento dos meus dados pessoais para fins de realizacao do procedimento: "
            + procedure_name + "."
        )

    doc = {
        "token": token,
        "patient_id": payload.patient_id,
        "patient_name": patient_name,
        "patient_cpf": patient.get("cpf", ""),
        "procedure_id": payload.procedure_id,
        "procedure_name": procedure_name,
        "consent_text": consent_text_final,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.get("name")
    }
    await db.consents.insert_one(doc)
    doc.pop("_id", None)
    return {
        "token": token,
        "link": signing_link,
        "whatsapp_url": whatsapp_url,
        "message": message,
        **doc
    }

# ==================== CONSENT PDF (com papel timbrado) ====================

async def build_consent_pdf(consent: dict, settings: dict):
    """Gera o PDF do termo de consentimento usando letterhead_config do banco.
    Usa apenas imports globais do topo do arquivo - sem imports locais."""
    import tempfile, os as _os, base64 as _b64

    lh = (settings or {}).get("letterhead_config", {})

    ml  = float(lh.get("margin_left",   20)) * mm
    mr  = float(lh.get("margin_right",  20)) * mm
    mt  = float(lh.get("margin_top",    15)) * mm
    mb  = float(lh.get("margin_bottom", 15)) * mm

    raw_color = lh.get("header_color", "#1a3a1a") or "#1a3a1a"
    try:
        h_color = HexColor(raw_color)
    except Exception:
        h_color = HexColor("#1a3a1a")

    fs_title    = float(lh.get("font_size_title",    16))
    fs_subtitle = float(lh.get("font_size_subtitle", 10))
    fs_section  = float(lh.get("font_size_section",  11))
    fs_body     = float(lh.get("font_size_body",     9.5))
    fs_small    = float(lh.get("font_size_small",    8))
    fs_legal    = float(lh.get("font_size_legal",    7.5))

    sp_header  = float(lh.get("spacing_after_header",     3)) * mm
    sp_title   = float(lh.get("spacing_after_title",      4)) * mm
    sp_section = float(lh.get("spacing_after_section",    2)) * mm
    sp_between = float(lh.get("spacing_between_sections", 5)) * mm

    footer_text = lh.get("footer_text") or "Documento com validade juridica conforme Lei 14.063/2020"
    bg_data     = lh.get("background_image") or ""
    clinic_name = (settings or {}).get("clinic_name") or "Clinica"
    cro         = lh.get("cro")  or ""
    cnpj        = lh.get("cnpj") or ""
    address_val = lh.get("address") or ""
    email_val   = lh.get("email")   or ""

    # Resolve background image temp file once (avoid doing it inside closure)
    bg_tmp_path = None
    if bg_data and bg_data.startswith("data:image"):
        try:
            _, enc = bg_data.split(",", 1)
            ext = ".png" if "png" in bg_data[:30] else ".jpg"
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
            tmp.write(_b64.b64decode(enc))
            tmp.close()
            bg_tmp_path = tmp.name
        except Exception:
            bg_tmp_path = None

    def _bg_footer(c, d):
        if bg_tmp_path:
            try:
                c.saveState()
                c.drawImage(bg_tmp_path, 0, 0, width=A4[0], height=A4[1],
                            preserveAspectRatio=False, mask="auto")
                # White overlay using setFillColorRGB with alpha via transparency
                c.setFillColor(Color(1, 1, 1, alpha=0.55))
                c.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
                c.restoreState()
            except Exception:
                pass
        # Footer line + text
        c.saveState()
        c.setFont("Helvetica", fs_legal)
        c.setFillGray(0.5)
        bot = mb - 2 * mm
        c.line(ml, bot, A4[0] - mr, bot)
        c.drawCentredString(A4[0] / 2, bot - 5 * mm, footer_text)
        c.restoreState()

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=ml, rightMargin=mr,
        topMargin=mt, bottomMargin=mb + 14 * mm
    )

    _styles = getSampleStyleSheet()
    def sty(name, **kw):
        return ParagraphStyle(name, parent=_styles["Normal"], **kw)

    s_clinic  = sty("cln", fontSize=fs_title,    textColor=h_color, fontName="Helvetica-Bold", alignment=TA_CENTER, spaceAfter=1*mm)
    s_sub     = sty("sub", fontSize=fs_subtitle, textColor=h_color, alignment=TA_CENTER,       spaceAfter=0.5*mm)
    s_addr    = sty("adr", fontSize=fs_small,    textColor=rl_colors.grey, alignment=TA_CENTER)
    s_title   = sty("ttl", fontSize=fs_title,    fontName="Helvetica-Bold", alignment=TA_CENTER, spaceAfter=sp_title)
    s_proc    = sty("prc", fontSize=fs_subtitle, textColor=h_color, fontName="Helvetica-Bold", alignment=TA_CENTER, spaceAfter=sp_title)
    s_section = sty("sec", fontSize=fs_section,  textColor=h_color, fontName="Helvetica-Bold", spaceBefore=sp_between, spaceAfter=sp_section)
    s_body    = sty("bdy", fontSize=fs_body,     alignment=TA_JUSTIFY, leading=fs_body * 1.45, spaceAfter=sp_section)
    s_label   = sty("lbl", fontSize=fs_body,     textColor=h_color, fontName="Helvetica-Bold")
    s_value   = sty("val", fontSize=fs_body)

    story = []

    # Clinic header
    story.append(Paragraph(clinic_name, s_clinic))
    if cro:         story.append(Paragraph(f"CRO: {cro}", s_sub))
    if cnpj:        story.append(Paragraph(f"CNPJ: {cnpj}", s_sub))
    if address_val: story.append(Paragraph(address_val, s_addr))
    if email_val:   story.append(Paragraph(email_val, s_addr))
    story.append(Spacer(1, sp_header))
    story.append(HRFlowable(width="100%", thickness=1, color=h_color))
    story.append(Spacer(1, sp_title))

    # Document title
    story.append(Paragraph("TERMO DE CONSENTIMENTO", s_title))
    proc_name = consent.get("procedure_name") or ""
    if proc_name:
        story.append(Paragraph(f"Procedimento: {proc_name}", s_proc))
    story.append(HRFlowable(width="100%", thickness=0.5, color=rl_colors.lightgrey))
    story.append(Spacer(1, sp_title))

    # Patient data
    story.append(Paragraph("DADOS DO PACIENTE", s_section))
    tdata = [[Paragraph("Paciente:", s_label), Paragraph(consent.get("patient_name") or "", s_value)]]
    if consent.get("patient_cpf"):
        tdata.append([Paragraph("CPF:", s_label), Paragraph(str(consent["patient_cpf"]), s_value)])
    if consent.get("signed_at"):
        try:
            from datetime import datetime as _dt
            sfmt = _dt.fromisoformat(str(consent["signed_at"]).replace("Z", "+00:00")).strftime("%d/%m/%Y %H:%M")
        except Exception:
            sfmt = str(consent["signed_at"])
        tdata.append([Paragraph("Assinado em:", s_label), Paragraph(sfmt, s_value)])

    pt = Table(tdata, colWidths=[38 * mm, None])
    pt.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("LINEBELOW",     (0, -1), (-1, -1), 0.4, rl_colors.lightgrey),
    ]))
    story.append(pt)
    story.append(Spacer(1, sp_between))

    # Consent text
    story.append(Paragraph("TEXTO DO TERMO", s_section))
    consent_text = consent.get("consent_text") or ""
    for para in consent_text.split("\n"):
        para = para.strip()
        if para:
            story.append(Paragraph(para, s_body))

    # Signature
    sig_image = consent.get("signature_image") or ""
    if sig_image and sig_image.startswith("data:image"):
        story.append(Spacer(1, sp_between * 2))
        story.append(Paragraph("ASSINATURA DIGITAL", s_section))
        try:
            _, enc = sig_image.split(",", 1)
            sig_tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
            sig_tmp.write(_b64.b64decode(enc))
            sig_tmp.close()
            story.append(RLImage(sig_tmp.name, width=80 * mm, height=25 * mm))
            _os.unlink(sig_tmp.name)
        except Exception:
            pass
    elif consent.get("signed_at"):
        story.append(Spacer(1, sp_between * 3))
        story.append(HRFlowable(width="60%", thickness=0.5, color=black))
        story.append(Paragraph("Assinatura do Paciente",
            sty("sig_lbl", fontSize=fs_small, alignment=TA_CENTER)))

    # Legal notice
    story.append(Spacer(1, sp_between))
    story.append(HRFlowable(width="100%", thickness=0.5, color=rl_colors.lightgrey))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        "Este documento foi gerado eletronicamente e possui validade juridica conforme "
        "a Lei 14.063/2020 e MP 2.200-2/2001.",
        sty("leg", fontSize=fs_legal, textColor=rl_colors.grey, alignment=TA_CENTER)
    ))

    doc.build(story, onFirstPage=_bg_footer, onLaterPages=_bg_footer)

    # Cleanup background temp file
    if bg_tmp_path:
        try:
            _os.unlink(bg_tmp_path)
        except Exception:
            pass

    buf.seek(0)
    return buf


@api_router.get("/consent/pdf/{token}")
async def get_consent_pdf(token: str):
    import traceback
    try:
        consent = await db.consents.find_one({"token": token}, {"_id": 0})
        if not consent:
            raise HTTPException(status_code=404, detail="Consentimento nao encontrado")
        settings = await db.settings.find_one({"type": "clinic"}, {"_id": 0}) or {}
        buf = await build_consent_pdf(consent, settings)
        return StreamingResponse(
            buf, media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=termo_consentimento_{token[:8]}.pdf"}
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[CONSENT PDF ERROR] {type(e).__name__}: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erro ao gerar PDF: {type(e).__name__}: {str(e)}")

# ==================== INCLUDE ROUTER ====================

app.include_router(api_router)

@app.on_event("startup")
async def startup_event():
    for coro in [
        db.users.create_index("email", unique=True),
        db.products.create_index("qr_code_id", unique=True),
        db.patients.create_index("id", unique=True),
        db.appointments.create_index("date"),
        db.consents.create_index("token", unique=True),
    ]:
        try:
            await coro
        except Exception:
            pass
    master_email = os.environ.get("ADMIN_EMAIL")
    master_password = os.environ.get("ADMIN_PASSWORD")
    existing = await db.users.find_one({"email": master_email})
    if not existing:
        await db.users.insert_one({
            "email": master_email,
            "password_hash": hash_password(master_password),
            "name": "Guilherme Ferraz",
            "role": "admin",
            "active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    else:
        await db.users.update_one({"email": master_email}, {
            "$set": {"password_hash": hash_password(master_password), "role": "admin", "active": True}
        })
