# -*- coding: utf-8 -*-
import os
os.environ.setdefault("PYTHONUTF8", "1")  # Força UTF-8 em todo o processo Python

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from fastapi.responses import StreamingResponse, HTMLResponse
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
from collections import defaultdict
import requests
import boto3
import hashlib
import time
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
    HRFlowable, Image as RLImage, Flowable as _Flowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_RIGHT

# Finance PDF Constants
_C_GREEN_DARK  = HexColor("#1a3a2a")
_C_GREEN_MID   = HexColor("#2d6a4f")
_C_GREEN_LIGHT = HexColor("#40916c")
_C_GREEN_PALE  = HexColor("#d8f3dc")
_C_TEAL        = HexColor("#52b788")
_C_RED_DARK    = HexColor("#c1121f")
_C_RED_LIGHT   = HexColor("#ffd6d6")
_C_BLUE_DARK   = HexColor("#1e3a5f")
_C_AMBER       = HexColor("#e9a800")
_C_GRAY_BG     = HexColor("#f8f9fa")
_C_GRAY_BORDER = HexColor("#dee2e6")
_C_GRAY_TEXT   = HexColor("#6c757d")
_C_DARK        = HexColor("#1a1a2e")
_PALETTE       = [_C_GREEN_MID, _C_TEAL, _C_GREEN_LIGHT, _C_AMBER, HexColor("#74c69d"), HexColor("#95d5b2")]
_PAGE_W, _PAGE_H = A4
_MARGIN = 18 * mm

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

def upload_bytes_to_r2(file_bytes: bytes, folder: str, ext: str, content_type: str) -> str:
    """Envia bytes brutos ao R2 e retorna URL pública. Retorna None em caso de erro."""
    if not s3_client or not R2_BUCKET_NAME:
        return None
    try:
        filename = f"{folder}/{uuid.uuid4().hex}{ext}"
        s3_client.put_object(Bucket=R2_BUCKET_NAME, Key=filename, Body=file_bytes, ContentType=content_type)
        return f"{R2_PUBLIC_URL}/{filename}"
    except Exception as e:
        print(f"[R2] Erro no upload de bytes: {e}")
        return None
# ==================== BANCO DE DATOS ====================
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'clinic_db')]

# ==================== UNICODE UTILS ====================
# Funções de escape removidas em favor da blindagem Base64 total.
# ========================================================

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

# ==================== RATE LIMITER (em memória) ====================
_rate_store: dict = defaultdict(list)
_RATE_WINDOW = 60   # segundos
_RATE_MAX_AUTH = 10 # tentativas por janela por IP

def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    return forwarded.split(",")[0].strip() if forwarded else (request.client.host or "unknown")

def enforce_rate_limit(ip: str, max_attempts: int = _RATE_MAX_AUTH, window: int = _RATE_WINDOW):
    now = time.time()
    attempts = [t for t in _rate_store[ip] if now - t < window]
    _rate_store[ip] = attempts
    if len(attempts) >= max_attempts:
        raise HTTPException(
            status_code=429,
            detail=f"Muitas tentativas. Aguarde {window} segundos e tente novamente."
        )
    _rate_store[ip].append(now)

# ==================== TOKEN BLACKLIST ====================
def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

async def revoke_token(token: str):
    """Adiciona refresh token à blacklist com TTL de 8 dias."""
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM], options={"verify_exp": False})
        exp = payload.get("exp", 0)
        await db.revoked_tokens.insert_one({
            "token_hash": _hash_token(token),
            "expires_at": datetime.fromtimestamp(exp, tz=timezone.utc),
            "revoked_at": datetime.now(timezone.utc)
        })
    except Exception as e:
        print(f"[BLACKLIST] Erro ao revogar token: {e}")

async def is_token_revoked(token: str) -> bool:
    """Verifica se o token está na blacklist."""
    doc = await db.revoked_tokens.find_one({"token_hash": _hash_token(token)})
    return doc is not None

async def cleanup_revoked_tokens():
    """Remove tokens expirados da blacklist."""
    try:
        await db.revoked_tokens.delete_many({
            "expires_at": {"$lt": datetime.now(timezone.utc)}
        })
    except Exception as e:
        print(f"[BLACKLIST] Erro na limpeza: {e}")

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

class ProductUsage(BaseModel):
    product_id: str
    product_name: str
    quantity: float # Alterado para float para suportar U.I. (frações)
    unit: str = "un" # 'un' ou 'UI'
    batch_number: Optional[str] = None

class AnamneseData(BaseModel):
    queixa_principal: Optional[str] = Field(None, max_length=2000)
    historia_atual: Optional[str] = Field(None, max_length=5000)
    medicamentos_uso: Optional[str] = Field(None, max_length=2000)
    alergias_informadas: Optional[str] = Field(None, max_length=2000)
    antecedentes_esteticos: Optional[str] = Field(None, max_length=2000)
    gestante_lactante: Optional[bool] = None
    doencas_cronicas: Optional[str] = Field(None, max_length=2000)
    cirurgias_previas: Optional[str] = Field(None, max_length=2000)
    uso_anticoagulantes: Optional[bool] = None
    herpes_labial: Optional[bool] = None
    fumante: Optional[bool] = None
    expectativas: Optional[str] = Field(None, max_length=2000)
    foto_autorizada: Optional[bool] = True

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
    products_used: Optional[List[ProductUsage]] = Field(default_factory=list)
    techniques_used: Optional[str] = Field(None, max_length=2000)
    observations: Optional[str] = Field(None, max_length=5000)
    photos_before: Optional[List[str]] = Field(default_factory=list)
    photos_after: Optional[List[str]] = Field(default_factory=list)
    evolution_notes: Optional[str] = Field(None, max_length=5000)
    next_session_notes: Optional[str] = Field(None, max_length=2000)
    next_session_date: Optional[str] = None
    anamnese: Optional[AnamneseData] = None
    # Integração Financeira
    payment_amount: Optional[float] = None
    payment_method: Optional[str] = None
    payment_status: Optional[str] = "paid"
    payment_discount: Optional[float] = None
    # Vínculo com Agenda + Cronômetro da Consulta
    appointment_id: Optional[str] = None
    consultation_started_at: Optional[str] = None
    consultation_ended_at: Optional[str] = None
    consultation_duration_seconds: Optional[int] = None

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
    anamnese: Optional[AnamneseData] = None
    products_used: Optional[List[ProductUsage]] = None

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
    # Precificação — sobrescreve a margem de lucro global apenas pra este procedimento
    override_profit_percent: Optional[float] = Field(None, ge=0, le=500)

class ProcedureUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    duration_minutes: Optional[int] = Field(None, ge=5, le=480)
    description: Optional[str] = Field(None, max_length=2000)
    price: Optional[float] = Field(None, ge=0)
    consent_template: Optional[str] = Field(None, max_length=20000)
    products: Optional[List[dict]] = None
    override_profit_percent: Optional[float] = Field(None, ge=0, le=500)

class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    category: str = Field(..., pattern=r'^(injetável|creme|envase|equipamento|outro)$')
    quantity: float = Field(0, ge=0) # Alterado para float para U.I.
    unit: str = "un" # 'un' ou 'UI'
    batch_number: str = Field(..., min_length=1, max_length=100)
    expiration_date: str = Field(..., pattern=r'^\d{4}-\d{2}-\d{2}$')
    supplier: str = Field(..., min_length=1, max_length=200)
    fill_date: Optional[str] = Field(None, pattern=r'^(\d{4}-\d{2}-\d{2})?$')
    responsible: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = Field(None, max_length=1000)
    # Precificação
    cost_price: Optional[float] = Field(None, ge=0)  # R$ por unidade (custo de aquisição)

class ProductUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    category: Optional[str] = Field(None, pattern=r'^(injetável|creme|envase|equipamento|outro)$')
    quantity: Optional[float] = Field(None, ge=0) # Alterado para float
    unit: Optional[str] = None
    batch_number: Optional[str] = Field(None, min_length=1, max_length=100)
    expiration_date: Optional[str] = Field(None, pattern=r'^\d{4}-\d{2}-\d{2}$')
    supplier: Optional[str] = Field(None, min_length=1, max_length=200)
    fill_date: Optional[str] = None
    responsible: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = Field(None, max_length=1000)
    # Precificação
    cost_price: Optional[float] = Field(None, ge=0)

# ==================== MODELOS DE PRECIFICAÇÃO ====================

class CardFee(BaseModel):
    """Taxa de cartão por modalidade."""
    id: str
    name: str = Field(..., min_length=1, max_length=100)       # Ex: "Débito", "Crédito 1×"
    rate_percent: float = Field(..., ge=0, le=50)              # Ex: 1.99, 3.5
    installments: int = Field(1, ge=1, le=24)                  # 1 para débito/à vista, 2-12 para parcelado
    enabled: bool = True

class PricingConfigUpdate(BaseModel):
    """Configurações globais usadas pelo motor de precificação."""
    # Modo de alocação dos custos fixos
    cost_allocation_mode: Optional[str] = Field(None, pattern=r'^(monthly|percent)$')
    # Modo "monthly": informa total mensal + nº de atendimentos esperados
    monthly_fixed_costs: Optional[float] = Field(None, ge=0)
    expected_appointments_per_month: Optional[int] = Field(None, ge=0)
    # Modo "percent": aplica % de custos indiretos sobre o preço final
    indirect_costs_percent: Optional[float] = Field(None, ge=0, le=100)
    # Custos variáveis (% sobre preço bruto)
    variable_costs_percent: Optional[float] = Field(None, ge=0, le=100)
    # Lucro líquido desejado em %
    desired_profit_percent: Optional[float] = Field(None, ge=0, le=500)
    # Taxas de cartão
    card_fees: Optional[List[CardFee]] = None
    default_card_fee_id: Optional[str] = None


class MovementCreate(BaseModel):
    product_id: str = Field(..., min_length=1)
    type: str = Field(..., pattern=r'^(entrada|saida)$')
    quantity: float = Field(..., ge=0.01) # Alterado para float
    notes: Optional[str] = Field(None, max_length=500)

class TransactionCreate(BaseModel):
    description: str = Field(..., min_length=1, max_length=500)
    amount: float = Field(..., gt=0)
    type: str = Field(..., pattern=r'^(income|expense)$')
    category: str = Field(..., min_length=1, max_length=100)
    payment_method: str = Field(..., min_length=1, max_length=50)
    date: str = Field(..., pattern=r'^\d{4}-\d{2}-\d{2}$')
    status: Optional[str] = Field("paid", pattern=r'^(paid|pending|cancelled)$')

class ConsentSignPayload(BaseModel):
    cpf: str
    signature_image: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[float] = None
    user_agent: str
    use_image_for_marketing: bool = True
    is_govbr: bool = False  # Indica se a assinatura foi via GOV.BR

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
        "\u2705 Confirme ou cancele sua consulta pelo link abaixo:\n"
        "{link_confirmacao}\n\n"
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
    """Recupera o template do banco ou o padrão, com suporte a decodificação de segurança (B64)."""
    msg = ""
    if tmpl:
        msg = tmpl.get("message", "")
    
    if not msg:
        msg = _DEFAULT_TEMPLATES.get(tmpl_type, "")

    # Se a mensagem vier blindada em Base64 (prefixo B64:), decodificamos antes de usar.
    if msg and msg.startswith("B64:"):
        try:
            import base64 as _b64
            encoded_part = msg.split(":", 1)[1]
            decoded_bytes = _b64.b64decode(encoded_part)
            msg = decoded_bytes.decode("utf-8")
        except Exception as e:
            print(f"Erro ao decodificar template B64: {e}")
            # Se falhar, mantém a mensagem original para não perder o conteúdo
    
    return msg


def whatsapp_encode(message: str) -> str:
    """Codifica a mensagem para link do WhatsApp usando UTF-8 percent-encoding padrão.

    Esse é o formato oficial documentado pela Meta para a Click-to-Chat API.
    Emojis e Unicode viram sequências %F0%9F%91%8B que o WhatsApp Web/mobile
    decodifica corretamente como UTF-8. A versão antiga "deixava Unicode cru"
    causava o seguinte bug: o JS do WhatsApp Web re-lia window.location e
    interpretava os bytes UTF-8 como Latin-1 → emojis viravam '�'.
    """
    import unicodedata
    if not message:
        return ""
    # Remove replacement chars e normaliza para NFC antes de codificar
    clean_msg = message.replace("\ufffd", "")
    clean_msg = unicodedata.normalize("NFC", clean_msg)
    # quote com safe="" codifica tudo (espaços, emojis, acentos) em UTF-8 percent-encoding
    return quote(clean_msg, safe="")


def build_whatsapp_url(phone: str, message: str) -> str:
    # Endpoint oficial Click-to-Chat da Meta — preserva emojis UTF-8 sem redirect.
    return f"https://api.whatsapp.com/send?phone={phone}&text={whatsapp_encode(message)}"

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
    import base64 as _b64g
    def _b64(text): return "B64:" + _b64g.b64encode(text.encode("utf-8")).decode("ascii")

    templates = await db.message_templates.find({}, {"_id": 0}).to_list(100)
    if not templates:
        defaults = [
            {"id": "consent_link",  "name": "Termo de Consentimento (WhatsApp)", "type": "consent_link",            "active": True, "message": _b64(_DEFAULT_TEMPLATES["consent_link"])},
            {"id": "bday",          "name": "Aniversário",                       "type": "birthday",                "active": True, "message": _b64(_DEFAULT_TEMPLATES["birthday"])},
            {"id": "botox",         "name": "Retorno Botox",                     "type": "botox_return",            "active": True, "message": _b64(_DEFAULT_TEMPLATES["botox_return"])},
            {"id": "inactive",      "name": "Paciente Inativo",                  "type": "inactive_patient",        "active": True, "message": _b64(_DEFAULT_TEMPLATES["inactive_patient"])},
            {"id": "appt_confirm",  "name": "Confirmação de Consulta",           "type": "appointment_confirmation","active": True, "message": _b64(_DEFAULT_TEMPLATES["appointment_confirmation"])},
            {"id": "appt_reminder", "name": "Lembrete de Consulta",              "type": "appointment_reminder",    "active": True, "message": _b64(_DEFAULT_TEMPLATES["appointment_reminder"])},
        ]
        await db.message_templates.insert_many(defaults)
        return defaults
    return templates

import unicodedata

@api_router.put("/message-templates/{id}")
async def update_template(id: str, request: Request, current_user: dict = Depends(get_current_user)):
    data = await request.json()
    # A blindagem Base64 agora é feita no Frontend para total segurança.
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
    now = datetime.now(timezone.utc)
    first_day = now.replace(day=1).strftime("%Y-%m-%d")
    transactions = await db.transactions.find({}, {"_id": 0}).sort("date", -1).to_list(1000)
    settings = await db.settings.find_one({"type": "clinic"}, {"_id": 0}) or {}
    clinic_name = settings.get("clinic_name", "Clinica Estetica")
    month_trans = [t for t in transactions if t.get("date","") >= first_day]
    income = sum(float(t.get("amount", 0)) for t in month_trans if t.get("type") == "income")
    expense = sum(float(t.get("amount", 0)) for t in month_trans if t.get("type") == "expense")
    summary = {"monthly_income": income, "monthly_expense": expense, "monthly_profit": income - expense}
    monthly_map = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
    for t in transactions:
        raw = t.get("date", "")
        try:
            d = datetime.strptime(raw, "%Y-%m-%d")
            key = d.strftime("%b/%Y").capitalize()
            monthly_map[key]["income" if t.get("type") == "income" else "expense"] += float(t.get("amount", 0))
        except: pass
    monthly_data = []
    for i in range(5, -1, -1):
        target = now - timedelta(days=i * 30)
        key = target.strftime("%b/%Y").capitalize()
        data = monthly_map.get(key, {"income": 0, "expense": 0})
        monthly_data.append({"month": key, "income": data["income"], "expense": data["expense"], "profit": data["income"] - data["expense"]})
    cat_map = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
    for t in month_trans:
        cat = t.get("category", "Outros")
        cat_map[cat]["income" if t.get("type") == "income" else "expense"] += float(t.get("amount", 0))
    by_category = [{"category": k, "income": v["income"], "expense": v["expense"]} for k, v in cat_map.items()]
    pay_map = defaultdict(float)
    for t in month_trans:
        if t.get("type") == "income":
            pay_map[t.get("payment_method", "Outros")] += float(t.get("amount", 0))
    by_payment = [{"method": k, "total": v} for k, v in pay_map.items()]
    buf = _build_finance_pdf(monthly_data=monthly_data, by_category=by_category, by_payment=by_payment, summary=summary, transactions=transactions, clinic_name=clinic_name)
    today_str = datetime.now().strftime("%Y%m%d")
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=relatorio_financeiro_{today_str}.pdf"})

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
    
    # Upload de fotos para o R2
    doc["photos_before"] = [upload_to_r2(p, "prontuarios") for p in (doc.get("photos_before") or [])]
    doc["photos_after"] = [upload_to_r2(p, "prontuarios") for p in (doc.get("photos_after") or [])]
    
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["created_by"] = current_user.get("name")
    
    # 1. Integração com Estoque: Baixa automática
    products_used = doc.get("products_used", [])
    for usage in products_used:
        product_id = usage.get("product_id")
        qty = usage.get("quantity", 0)
        if product_id and float(qty) > 0:
            # Busca o produto para validar estoque (produtos usam qr_code_id como id)
            product = await db.products.find_one({"$or": [{"qr_code_id": product_id}, {"id": product_id}]})
            if product:
                # Atualiza quantidade no estoque (usando $inc com valor negativo para float)
                await db.products.update_one(
                    {"$or": [{"qr_code_id": product_id}, {"id": product_id}]},
                    {"$inc": {"quantity": -float(qty)}}
                )
                # Registra a movimentação de saída
                movement = {
                    "id": str(uuid.uuid4()),
                    "product_id": product_id,
                    "product_name": product.get("name"),
                    "type": "saida",
                    "quantity": qty,
                    "notes": f"Uso em prontuário: {doc.get('procedure_name')} - Paciente ID: {doc.get('patient_id')}",
                    "date": doc.get("date"),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "created_by": current_user.get("name")
                }
                await db.movements.insert_one(movement)

    # 2. Integração Financeira: Geração automática de transação
    payment_amount = doc.get("payment_amount")
    payment_method = doc.get("payment_method")
    if payment_amount and payment_amount > 0 and payment_method:
        patient = await db.patients.find_one({"id": doc.get("patient_id")})
        patient_name = patient.get("name") if patient else "Paciente não identificado"
        
        transaction = {
            "id": str(uuid.uuid4()),
            "description": f"Procedimento: {doc.get('procedure_name')} - {patient_name}",
            "amount": payment_amount,
            "type": "income",
            "category": "Procedimentos",
            "payment_method": payment_method,
            "date": doc.get("date"),
            "status": doc.get("payment_status", "paid"),
            "patient_id": doc.get("patient_id"),
            "record_id": doc["id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user.get("name")
        }
        await db.transactions.insert_one(transaction)

    await db.medical_records.insert_one(doc)

    # 3. Vínculo com Agenda: marca o agendamento como concluído se veio da agenda
    appt_id = doc.get("appointment_id")
    if appt_id:
        await db.appointments.update_one(
            {"id": appt_id},
            {"$set": {
                "status": "completed",
                "record_id": doc["id"],
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }}
        )

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

@api_router.get("/medical-records/{record_id}/receipt-pdf")
async def get_receipt_pdf(record_id: str, current_user: dict = Depends(get_current_user)):
    """Gera um recibo em PDF para um atendimento finalizado."""
    record = await db.medical_records.find_one({"id": record_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Prontuário não encontrado")
    patient = await db.patients.find_one({"id": record.get("patient_id")}, {"_id": 0}) or {}
    settings = await db.settings.find_one({}, {"_id": 0}) or {}
    buf = await build_receipt_pdf(record, patient, settings)
    filename = f"recibo_{(patient.get('name') or 'paciente').replace(' ', '_')}_{record.get('date', '')}.pdf"
    return StreamingResponse(
        buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

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

    # Gera link de confirmação automaticamente para templates que usam {link_confirmacao}
    base_url = os.environ.get("FRONTEND_URL", "https://app.drguilhermeferraz.com")
    confirmation_link = ""
    template_msg_raw = ""
    if template_id:
        template = await db.message_templates.find_one({"id": template_id}, {"_id": 0})
        template_msg_raw = _get_template_msg(template, "appointment_confirmation") if template else ""
    if "{link_confirmacao}" in template_msg_raw or not template_id:
        # Cria token de confirmação
        await db.appointment_confirmations.delete_many({"appointment_id": appointment_id})
        token = secrets.token_urlsafe(24)
        expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        await db.appointment_confirmations.insert_one({
            "token": token,
            "appointment_id": appointment_id,
            "patient_name": apt.get("patient_name", ""),
            "patient_phone": apt.get("patient_phone", ""),
            "procedure_name": apt.get("procedure_name", ""),
            "date": apt.get("date", ""),
            "time": apt.get("time", ""),
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": expires_at,
            "responded_at": None,
        })
        confirmation_link = f"{base_url}/confirmar/{token}"

    if template_id:
        template = await db.message_templates.find_one({"id": template_id}, {"_id": 0})
        message = _get_template_msg(template, "appointment_confirmation")
        message = message.replace("{nome}", apt.get("patient_name", ""))
        message = message.replace("{data}", date_fmt)
        message = message.replace("{horario}", apt.get("time", ""))
        message = message.replace("{procedimento}", apt.get("procedure_name", ""))
        message = message.replace("{clinica}", clinic_name)
        message = message.replace("{link_confirmacao}", confirmation_link)
    else:
        pname = apt.get("patient_name", "")
        ptime = apt.get("time", "")
        pproc = apt.get("procedure_name", "")
        message = (
            f"Olá {pname}! 👋\n\n"
            f"Confirmamos seu agendamento na {clinic_name}:\n\n"
            f"📅 Data: {date_fmt}\n🕐 Horário: {ptime}\n"
            f"💌 Procedimento: {pproc}\n\n"
            f"✅ Confirme ou cancele pelo link:\n{confirmation_link}"
        )
    whatsapp_url = build_whatsapp_url(phone, message)
    return {"whatsapp_url": whatsapp_url, "phone": phone, "message": message, "confirmation_link": confirmation_link}

@api_router.get("/appointments/{appointment_id}")
async def get_appointment(appointment_id: str, current_user: dict = Depends(get_current_user)):
    apt = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not apt:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    return apt

@api_router.post("/appointments/{appointment_id}/complete")
async def complete_appointment(appointment_id: str, current_user: dict = Depends(get_current_user)):
    await db.appointments.update_one({"id": appointment_id}, {"$set": {"status": "completed"}})
    return {"message": "Atendimento concluído"}

@api_router.delete("/appointments/{appointment_id}")
async def delete_appointment(appointment_id: str, current_user: dict = Depends(get_current_user)):
    await db.appointments.delete_one({"id": appointment_id})
    return {"message": "Agendamento excluído"}

# ==================== CONFIRMAÇÃO DE CONSULTA (link para paciente) ====================

@api_router.post("/appointments/{appointment_id}/confirmation-link")
async def generate_confirmation_link(appointment_id: str, current_user: dict = Depends(get_current_user)):
    """Gera um link único para o paciente confirmar ou cancelar a consulta via WhatsApp."""
    apt = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not apt:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")

    # Invalida tokens anteriores do mesmo agendamento
    await db.appointment_confirmations.delete_many({"appointment_id": appointment_id})

    token = secrets.token_urlsafe(24)
    expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()

    await db.appointment_confirmations.insert_one({
        "token": token,
        "appointment_id": appointment_id,
        "patient_name": apt.get("patient_name", ""),
        "patient_phone": apt.get("patient_phone", ""),
        "procedure_name": apt.get("procedure_name", ""),
        "date": apt.get("date", ""),
        "time": apt.get("time", ""),
        "status": "pending",       # pending | confirmed | cancelled
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": expires_at,
        "responded_at": None,
    })

    base_url = os.environ.get("FRONTEND_URL", "https://app.drguilhermeferraz.com")
    link = f"{base_url}/confirmar/{token}"
    return {"link": link, "token": token, "expires_at": expires_at}


# Endpoints PÚBLICOS — sem autenticação

@app.get("/api/confirmacao/{token}")
async def get_confirmation_info(token: str):
    """Retorna dados da consulta para exibir na tela do paciente (sem autenticação)."""
    conf = await db.appointment_confirmations.find_one({"token": token}, {"_id": 0})
    if not conf:
        raise HTTPException(status_code=404, detail="Link inválido ou expirado")

    # Checa expiração
    expires = datetime.fromisoformat(conf["expires_at"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(status_code=410, detail="Este link expirou")

    settings = await db.settings.find_one({"type": "clinic"}, {"_id": 0})
    clinic_name = settings.get("clinic_name", "Nossa Clínica") if settings else "Nossa Clínica"
    clinic_phone = settings.get("clinic_phone", "") if settings else ""
    clinic_logo  = settings.get("logo_url", "") if settings else ""

    date_fmt = ""
    try:
        date_fmt = datetime.strptime(conf["date"], "%Y-%m-%d").strftime("%d/%m/%Y")
    except Exception:
        date_fmt = conf.get("date", "")

    return {
        "status": conf["status"],
        "patient_name": conf["patient_name"],
        "procedure_name": conf["procedure_name"],
        "date": date_fmt,
        "time": conf["time"],
        "clinic_name": clinic_name,
        "clinic_phone": clinic_phone,
        "clinic_logo": clinic_logo,
    }


@app.post("/api/confirmacao/{token}/respond")
async def respond_confirmation(token: str, request: Request):
    """Paciente confirma ou cancela a consulta (sem autenticação)."""
    body = await request.json()
    action = body.get("action")  # "confirm" ou "cancel"
    if action not in ("confirm", "cancel"):
        raise HTTPException(status_code=400, detail="Ação inválida")

    conf = await db.appointment_confirmations.find_one({"token": token}, {"_id": 0})
    if not conf:
        raise HTTPException(status_code=404, detail="Link inválido ou expirado")

    expires = datetime.fromisoformat(conf["expires_at"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(status_code=410, detail="Este link expirou")

    if conf["status"] != "pending":
        raise HTTPException(status_code=409, detail="already_responded")

    new_status = "confirmed" if action == "confirm" else "cancelled"
    responded_at = datetime.now(timezone.utc).isoformat()

    # Atualiza o token
    await db.appointment_confirmations.update_one(
        {"token": token},
        {"$set": {"status": new_status, "responded_at": responded_at}}
    )

    # Atualiza o agendamento no sistema
    appt_status = "confirmed" if action == "confirm" else "cancelled"
    await db.appointments.update_one(
        {"id": conf["appointment_id"]},
        {"$set": {"status": appt_status, "patient_confirmed": new_status, "patient_confirmed_at": responded_at}}
    )

    return {"ok": True, "status": new_status}

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

# ==================== PRECIFICAÇÃO DE PROCEDIMENTOS ====================

DEFAULT_CARD_FEES = [
    {"id": "debito", "name": "Débito", "rate_percent": 1.99, "installments": 1, "enabled": True},
    {"id": "credito_1x", "name": "Crédito à vista", "rate_percent": 3.50, "installments": 1, "enabled": True},
    {"id": "credito_2x", "name": "Crédito 2×", "rate_percent": 4.50, "installments": 2, "enabled": True},
    {"id": "credito_3x", "name": "Crédito 3×", "rate_percent": 5.00, "installments": 3, "enabled": True},
    {"id": "credito_4x", "name": "Crédito 4×", "rate_percent": 5.50, "installments": 4, "enabled": True},
    {"id": "credito_5x", "name": "Crédito 5×", "rate_percent": 6.00, "installments": 5, "enabled": True},
    {"id": "credito_6x", "name": "Crédito 6×", "rate_percent": 7.00, "installments": 6, "enabled": True},
    {"id": "credito_7x", "name": "Crédito 7×", "rate_percent": 8.00, "installments": 7, "enabled": True},
    {"id": "credito_8x", "name": "Crédito 8×", "rate_percent": 9.00, "installments": 8, "enabled": True},
    {"id": "credito_9x", "name": "Crédito 9×", "rate_percent": 10.00, "installments": 9, "enabled": True},
    {"id": "credito_10x", "name": "Crédito 10×", "rate_percent": 11.00, "installments": 10, "enabled": True},
    {"id": "credito_11x", "name": "Crédito 11×", "rate_percent": 12.00, "installments": 11, "enabled": True},
    {"id": "credito_12x", "name": "Crédito 12×", "rate_percent": 13.00, "installments": 12, "enabled": True},
]

DEFAULT_PRICING_CONFIG = {
    "id": "global",
    "cost_allocation_mode": "percent",
    "monthly_fixed_costs": 0.0,
    "expected_appointments_per_month": 0,
    "indirect_costs_percent": 20.0,
    "variable_costs_percent": 5.0,
    "desired_profit_percent": 50.0,
    "card_fees": DEFAULT_CARD_FEES,
    "default_card_fee_id": "credito_1x",
}


async def get_or_create_pricing_config() -> dict:
    cfg = await db.pricing_config.find_one({"id": "global"}, {"_id": 0})
    if not cfg:
        await db.pricing_config.insert_one({**DEFAULT_PRICING_CONFIG, "created_at": datetime.now(timezone.utc).isoformat()})
        cfg = await db.pricing_config.find_one({"id": "global"}, {"_id": 0})
    for key, default_val in DEFAULT_PRICING_CONFIG.items():
        if key not in cfg or cfg[key] is None:
            cfg[key] = default_val
    return cfg


def compute_kit_cost(kit_items, products_by_id):
    """Calcula o custo total do kit e retorna (custo_total, itens_detalhados)."""
    total = 0.0
    detailed = []
    for item in kit_items or []:
        pid = item.get("product_id") or item.get("id")
        qty = float(item.get("quantity") or item.get("quantity_used") or 0)
        product = products_by_id.get(pid) or {}
        unit_cost = float(item.get("unit_cost") if item.get("unit_cost") is not None else (product.get("cost_price") or 0))
        line_total = round(qty * unit_cost, 4)
        total += line_total
        detailed.append({
            "product_id": pid,
            "product_name": item.get("product_name") or product.get("name") or "(produto removido)",
            "quantity": qty,
            "unit": item.get("unit") or product.get("unit") or "un",
            "unit_cost": round(unit_cost, 4),
            "line_total": round(line_total, 2),
            "exists": bool(product),
        })
    return round(total, 2), detailed


def compute_procedure_pricing(procedure, config, products_by_id):
    """Calcula a precificação completa.

    Fórmula (modo 'monthly'):
        P = (C_insumos + C_fixos_rateados) / (1 − cartão_% − var_% − lucro_%)
    Fórmula (modo 'percent'):
        P = C_insumos / (1 − indireto_% − cartão_% − var_% − lucro_%)
    """
    kit_items = procedure.get("products") or []
    custo_insumos, kit_detalhado = compute_kit_cost(kit_items, products_by_id)

    mode = config.get("cost_allocation_mode") or "percent"
    indirect_pct = float(config.get("indirect_costs_percent") or 0) / 100.0
    var_pct = float(config.get("variable_costs_percent") or 0) / 100.0

    profit_pct_raw = procedure.get("override_profit_percent")
    if profit_pct_raw is None:
        profit_pct_raw = config.get("desired_profit_percent") or 0
    profit_pct = float(profit_pct_raw) / 100.0

    if mode == "monthly":
        fixed_monthly = float(config.get("monthly_fixed_costs") or 0)
        appts = int(config.get("expected_appointments_per_month") or 0)
        custo_fixo_rateado = round(fixed_monthly / appts, 2) if appts > 0 else 0.0
        custo_indireto_pct = 0.0
    else:
        custo_fixo_rateado = 0.0
        custo_indireto_pct = indirect_pct

    suggestions = []
    for fee in config.get("card_fees") or []:
        if not fee.get("enabled", True):
            continue
        card_rate = float(fee.get("rate_percent") or 0) / 100.0
        denom = 1 - custo_indireto_pct - card_rate - var_pct - profit_pct
        if denom <= 0:
            suggestions.append({
                "card_fee_id": fee.get("id"),
                "card_fee_name": fee.get("name"),
                "rate_percent": fee.get("rate_percent"),
                "installments": fee.get("installments", 1),
                "price": None,
                "installment_value": None,
                "error": "Soma de % (indireto + cartão + variável + lucro) >= 100%. Ajuste a configuração.",
            })
            continue
        numerator = custo_insumos + custo_fixo_rateado
        price = round(numerator / denom, 2) if numerator > 0 else 0.0
        installments = fee.get("installments", 1) or 1
        installment_value = round(price / installments, 2) if installments > 0 else price
        suggestions.append({
            "card_fee_id": fee.get("id"),
            "card_fee_name": fee.get("name"),
            "rate_percent": fee.get("rate_percent"),
            "installments": installments,
            "price": price,
            "installment_value": installment_value,
            "error": None,
        })

    default_id = config.get("default_card_fee_id")
    default_sug = next((s for s in suggestions if s["card_fee_id"] == default_id), None) or (suggestions[0] if suggestions else None)
    default_price = default_sug["price"] if default_sug else None

    breakdown = {
        "custo_insumos": custo_insumos,
        "custo_fixo_rateado": custo_fixo_rateado,
        "custo_indireto_percent": round(indirect_pct * 100, 2),
        "variable_costs_percent": round(var_pct * 100, 2),
        "profit_percent": round(profit_pct * 100, 2),
        "mode": mode,
    }
    if default_price:
        breakdown["custo_indireto_valor"] = round(default_price * indirect_pct, 2) if mode == "percent" else 0.0
        breakdown["custo_variavel_valor"] = round(default_price * var_pct, 2)
        breakdown["taxa_cartao_valor"] = round(default_price * (float(default_sug["rate_percent"]) / 100.0), 2)
        breakdown["lucro_valor"] = round(default_price * profit_pct, 2)
        breakdown["custo_total"] = round(
            custo_insumos + custo_fixo_rateado
            + breakdown["custo_indireto_valor"]
            + breakdown["custo_variavel_valor"]
            + breakdown["taxa_cartao_valor"],
            2,
        )

    return {
        "procedure_id": procedure.get("id"),
        "procedure_name": procedure.get("name"),
        "current_price": procedure.get("price"),
        "override_profit_percent": procedure.get("override_profit_percent"),
        "kit": kit_detalhado,
        "breakdown": breakdown,
        "suggestions": suggestions,
        "default_suggestion": default_sug,
        "suggested_price": default_price,
    }


@api_router.get("/pricing/config")
async def get_pricing_config(current_user: dict = Depends(get_current_user)):
    cfg = await get_or_create_pricing_config()
    return cfg


@api_router.put("/pricing/config")
async def update_pricing_config(update: PricingConfigUpdate, current_user: dict = Depends(get_current_user)):
    await get_or_create_pricing_config()
    data = update.model_dump(exclude_none=True)
    if "card_fees" in data:
        seen_ids = set()
        for fee in data["card_fees"]:
            if not fee.get("id") or fee["id"] in seen_ids:
                fee["id"] = str(uuid.uuid4())
            seen_ids.add(fee["id"])
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.pricing_config.update_one({"id": "global"}, {"$set": data})
    cfg = await db.pricing_config.find_one({"id": "global"}, {"_id": 0})
    return cfg


@api_router.get("/pricing/procedures")
async def get_pricing_procedures(current_user: dict = Depends(get_current_user)):
    cfg = await get_or_create_pricing_config()
    procedures = await db.procedures.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    products = await db.products.find({}, {"_id": 0}).to_list(2000)
    products_by_id = {p.get("qr_code_id") or p.get("id"): p for p in products}
    return [compute_procedure_pricing(proc, cfg, products_by_id) for proc in procedures]


@api_router.get("/pricing/procedures/{procedure_id}")
async def get_pricing_procedure_detail(procedure_id: str, current_user: dict = Depends(get_current_user)):
    cfg = await get_or_create_pricing_config()
    proc = await db.procedures.find_one({"id": procedure_id}, {"_id": 0})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedimento não encontrado")
    products = await db.products.find({}, {"_id": 0}).to_list(2000)
    products_by_id = {p.get("qr_code_id") or p.get("id"): p for p in products}
    return compute_procedure_pricing(proc, cfg, products_by_id)


class ApplyPricePayload(BaseModel):
    card_fee_id: Optional[str] = None
    price: Optional[float] = Field(None, ge=0)

@api_router.post("/pricing/procedures/{procedure_id}/apply-price")
async def apply_price_to_procedure(procedure_id: str, payload: ApplyPricePayload, current_user: dict = Depends(get_current_user)):
    proc = await db.procedures.find_one({"id": procedure_id}, {"_id": 0})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedimento não encontrado")

    new_price = payload.price
    if new_price is None and payload.card_fee_id:
        cfg = await get_or_create_pricing_config()
        products = await db.products.find({}, {"_id": 0}).to_list(2000)
        products_by_id = {p.get("qr_code_id") or p.get("id"): p for p in products}
        result = compute_procedure_pricing(proc, cfg, products_by_id)
        sug = next((s for s in result["suggestions"] if s["card_fee_id"] == payload.card_fee_id), None)
        if not sug or sug.get("price") is None:
            raise HTTPException(status_code=400, detail="Modalidade de cartão inválida ou sem preço calculável")
        new_price = sug["price"]
    if new_price is None:
        raise HTTPException(status_code=400, detail="Informe 'price' ou 'card_fee_id'")
    await db.procedures.update_one({"id": procedure_id}, {"$set": {"price": float(new_price)}})
    return {"procedure_id": procedure_id, "applied_price": float(new_price)}

# ==================== /PRECIFICAÇÃO ====================



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
async def login(credentials: LoginCredentials, response: Response, request: Request):
    enforce_rate_limit(get_client_ip(request))
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
async def register_user(credentials: RegisterCredentials, response: Response, request: Request):
    enforce_rate_limit(get_client_ip(request), max_attempts=5)
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
    enforce_rate_limit(get_client_ip(request), max_attempts=20)
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    if await is_token_revoked(token):
        raise HTTPException(status_code=401, detail="Token revogado. Faça login novamente.")
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
async def logout_user(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if token:
        await revoke_token(token)
        await cleanup_revoked_tokens()
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

@api_router.get("/inventory/movements")
async def get_movements(current_user: dict = Depends(get_current_user)):
    return await db.movements.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)

@api_router.get("/qr/scan/{code}")
async def scan_qr_code(code: str, current_user: dict = Depends(get_current_user)):
    # Tenta encontrar o produto pelo ID ou pelo código de barras (se houver esse campo)
    # Como o sistema usa UUIDs para IDs, o QR code geralmente contém o ID do produto
    product = await db.products.find_one({"id": code}, {"_id": 0})
    if not product:
        # Tenta buscar por um campo de barcode se existir (opcional, para compatibilidade)
        product = await db.products.find_one({"barcode": code}, {"_id": 0})
        
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    return product

@api_router.post("/movements")
async def create_movement(movement: MovementCreate, current_user: dict = Depends(get_current_user)):
    product = await db.products.find_one({"qr_code_id": movement.product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    if movement.type == "saida":
        if float(product["quantity"]) < float(movement.quantity):
            raise HTTPException(status_code=400, detail="Quantidade insuficiente em estoque")
        new_qty = float(product["quantity"]) - float(movement.quantity)
    else:
        new_qty = float(product["quantity"]) + float(movement.quantity)
    await db.products.update_one({"qr_code_id": movement.product_id}, {"$set": {"quantity": round(new_qty, 2)}})
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

@api_router.get("/patients/{patient_id}/anamnese")
async def get_patient_anamnese(patient_id: str, current_user: dict = Depends(get_current_user)):
    """Retorna a anamnese mais recente do paciente para pré-preencher nova consulta."""
    record = await db.medical_records.find_one(
        {"patient_id": patient_id, "anamnese": {"$exists": True, "$ne": None}},
        {"_id": 0, "anamnese": 1, "date": 1},
        sort=[("date", -1)]
    )
    return record or {}

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

# ==================== ASSINAFY INTEGRATION ====================

async def _check_and_update_assinafy_status(consent: dict):
    """
    Verifica o status de um documento na Assinafy e atualiza o banco de dados se necessário.
    """
    if consent.get("status") == "signed" or not consent.get("assinafy_id"):
        return consent

    api_key = os.environ.get("ASSINAFY_API_KEY")
    if not api_key:
        return consent

    try:
        import requests
        import base64
        from datetime import datetime, timezone
        
        # 1. Consulta o status do documento na Assinafy
        res = requests.get(
            f"https://api.assinafy.com.br/v1/documents/{consent['assinafy_id']}",
            headers={"X-Api-Key": api_key},
            timeout=10
        )
        
        if res.status_code == 200:
            doc_data = res.json()
            # A resposta pode vir encapsulada em 'data'
            if doc_data.get("data"):
                doc_data = doc_data["data"]
            
            # Se o status for 'signed' ou 'completed', atualizamos localmente
            # Alguns endpoints podem retornar 'status' dentro de 'data' ou direto na raiz
            current_status = doc_data.get("status")
            print(f"[DEBUG ASSINAFY] Status atual do doc {consent['assinafy_id']}: {current_status}")
            
            if current_status in ["signed", "completed"]:
                print(f"[DEBUG ASSINAFY] Documento {consent['assinafy_id']} assinado! Baixando PDF...")
                
                # 2. Tenta baixar o PDF assinado (usamos /download/signed para pegar a versão com as assinaturas)
                signed_pdf_b64 = None
                download_res = requests.get(
                    f"https://api.assinafy.com.br/v1/documents/{consent['assinafy_id']}/download/signed",
                    headers={"X-Api-Key": api_key},
                    timeout=15
                )
                if download_res.status_code == 200:
                    signed_pdf_b64 = base64.b64encode(download_res.content).decode('utf-8')
                
                update_fields = {
                    "status": "signed",
                    "signed_at": datetime.now(timezone.utc).isoformat()
                }
                if signed_pdf_b64:
                    update_fields["signed_pdf_base64"] = signed_pdf_b64
                
                # 3. Atualiza no MongoDB (Termo de Consentimento)
                await db.consents.update_one({"token": consent["token"]}, {"$set": update_fields})
                
                # 4. Atualiza o status global do paciente se necessário
                if consent.get("patient_id"):
                    await db.patients.update_one(
                        {"id": consent["patient_id"]}, 
                        {"$set": {
                            "consent_signed": True,
                            "consent_date": update_fields["signed_at"],
                            "consent_procedure_name": consent.get("procedure_name")
                        }}
                    )
                
                consent.update(update_fields)
                print(f"[DEBUG ASSINAFY] Status atualizado para 'signed' para o token {consent['token']}")
                
    except Exception as e:
        print(f"[DEBUG ASSINAFY] Erro ao verificar status em tempo real: {e}")
    
    return consent

@api_router.post("/webhook/assinafy")
async def assinafy_webhook(request: Request):
    """
    Recebe notificações da Assinafy sobre o status da assinatura.
    """
    data = await request.json()
    print(f"Webhook Assinafy recebido: {data}")
    
    event = data.get("event")
    document_id = data.get("document", {}).get("id")
    external_id = data.get("document", {}).get("external_id")
    
    if event in ["document.signed", "document.completed"] and external_id:
        # 1. Busca a chave da API
        api_key = os.environ.get("ASSINAFY_API_KEY")
        
        # 2. Tenta baixar o PDF assinado oficial da Assinafy
        signed_pdf_b64 = None
        if api_key and document_id:
            try:
                # O endpoint de download retorna o PDF binário
                # Documentação: GET /v1/documents/{id}/download/original (ou similar)
                # Tentamos baixar a versão final assinada
                download_res = requests.get(
                    f"https://api.assinafy.com.br/v1/documents/{document_id}/download/original",
                    headers={"X-Api-Key": api_key},
                    timeout=20
                )
                if download_res.status_code == 200:
                    # Converte para Base64 para salvar no MongoDB (como o sistema já faz)
                    signed_pdf_b64 = base64.b64encode(download_res.content).decode('utf-8')
                    print(f"PDF assinado baixado com sucesso para o token {external_id}")
            except Exception as e:
                print(f"Erro ao baixar PDF assinado da Assinafy: {e}")

        # 3. Atualiza o status e salva o PDF oficial
        update_data = {
            "status": "signed",
            "signed_at": datetime.now(timezone.utc).isoformat(),
            "assinafy_id": document_id
        }
        
        if signed_pdf_b64:
            update_data["signed_pdf_base64"] = signed_pdf_b64

        await db.consents.update_one(
            {"token": external_id},
            {"$set": update_data}
        )
        
    return {"status": "success"}

class AssinafyPreparePayload(BaseModel):
    cpf: str
    use_image_for_marketing: bool

@api_router.post("/consent/public/{token}/prepare-assinafy")
async def prepare_assinafy(token: str, payload: AssinafyPreparePayload):
    """
    Cria o documento na Assinafy e retorna a URL de Embed.
    """
    print(f"[DEBUG ASSINAFY] Iniciando prepare_assinafy para token: {token}")
    
    consent = await db.consents.find_one({"token": token})
    if not consent:
        print(f"[DEBUG ASSINAFY] Consentimento não encontrado para token: {token}")
        return {"embed_url": None, "error": "Termo de consentimento não encontrado no sistema."}
    
    api_key = os.environ.get("ASSINAFY_API_KEY")
    account_id = os.environ.get("ASSINAFY_ACCOUNT_ID")
    
    if not api_key:
        print("[DEBUG ASSINAFY] ASSINAFY_API_KEY não configurada no Railway.")
        return {"embed_url": None, "error": "Chave de API da Assinafy não configurada no servidor (Railway)."}
    
    if not account_id:
        print("[DEBUG ASSINAFY] ASSINAFY_ACCOUNT_ID não configurado no Railway.")
        return {"embed_url": None, "error": "ID da Conta (Workspace ID) da Assinafy não configurado no servidor (Railway)."}

    # Limpa a chave e o ID de possíveis espaços em branco
    api_key = api_key.strip()
    account_id = account_id.strip()

    # Atualiza o consentimento com a opção de imagem
    await db.consents.update_one(
        {"token": token},
        {"$set": {"use_image_for_marketing": payload.use_image_for_marketing}}
    )

    try:
        import requests
        import tempfile
        from fpdf import FPDF
        
        backend_url = os.environ.get("BACKEND_URL", "https://app.drguilhermeferraz.com")
        
        # 1. Gerar um PDF temporário
        pdf = FPDF()
        pdf.add_page()
        pdf.set_font("helvetica", size=12)
        pdf.multi_cell(0, 10, consent.get("consent_text", ""))
        
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            pdf.output(tmp.name)
            tmp_path = tmp.name

        # 2. Upload do Documento (URL correta com account_id)
        headers = {"X-Api-Key": api_key}
        url = f"https://api.assinafy.com.br/v1/accounts/{account_id}/documents"
        
        print(f"[DEBUG ASSINAFY] Fazendo upload do PDF para {url}")
        with open(tmp_path, "rb") as f:
            files = {"file": (f"Termo_{token}.pdf", f, "application/pdf")}
            response = requests.post(url, headers=headers, files=files, timeout=25)

        # Limpa o arquivo temporário
        import os as native_os
        if native_os.path.exists(tmp_path):
            native_os.unlink(tmp_path)
        
        print(f"[DEBUG ASSINAFY] Resposta Upload ({response.status_code}): {response.text}")
        
        if response.status_code not in [200, 201]:
            return {"embed_url": None, "error": f"Assinafy Upload Error ({response.status_code}): {response.text[:150]}"}

        doc_data = response.json()
        
        # A Assinafy pode retornar o ID em diferentes campos ou dentro de um objeto 'data'
        doc_id = doc_data.get("id") or doc_data.get("document_id")
        if not doc_id and doc_data.get("data"):
            doc_id = doc_data.get("data", {}).get("id") or doc_data.get("data", {}).get("document_id")
            
        if not doc_id:
            print(f"[DEBUG ASSINAFY] ID não encontrado na resposta: {doc_data}")
            return {"embed_url": None, "error": f"Assinafy: ID do documento não encontrado na resposta: {str(doc_data)[:100]}"}

        # Verifica se a signing_url já veio no upload
        upload_signing_url = doc_data.get("data", {}).get("signing_url") or doc_data.get("signing_url")
        if upload_signing_url:
            print(f"[DEBUG ASSINAFY] signing_url encontrada no upload: {upload_signing_url}")
            await db.consents.update_one(
                {"token": token},
                {"$set": {"assinafy_id": doc_id, "status": "pending_signature"}}
            )
            return {"embed_url": upload_signing_url + "?embed=true"}

        # 2.1 Aguardar o processamento do documento (metadata_processing)
        # A Assinafy pode levar alguns segundos para processar o PDF recém-enviado.
        import time
        max_retries = 5
        doc_ready = False
        for i in range(max_retries):
            check_res = requests.get(
                f"https://api.assinafy.com.br/v1/documents/{doc_id}",
                headers=headers,
                timeout=10
            )
            if check_res.status_code == 200:
                check_data = check_res.json()
                # Se a resposta vier encapsulada em 'data'
                if check_data.get("data"):
                    check_data = check_data["data"]
                
                status = check_data.get("status")
                print(f"[DEBUG ASSINAFY] Verificando status do doc {doc_id} (tentativa {i+1}): {status}")
                
                if status not in ["metadata_processing", "processing"]:
                    doc_ready = True
                    break
            
            time.sleep(2) # Aguarda 2 segundos antes da próxima verificação
        
        if not doc_ready:
            print(f"[DEBUG ASSINAFY] Documento ainda em processamento após {max_retries} tentativas.")
            # Prosseguimos mesmo assim, mas o risco de erro 400 continua se a API for lenta.

        # 3. Criar o Signer na Assinafy
        # A API exige que o signer seja criado previamente e seu ID seja usado no assignment.
        # Buscamos o e-mail do paciente no banco de dados para incluir no payload.
        patient_email = None
        if consent.get("patient_id"):
            patient_doc = await db.patients.find_one({"id": consent["patient_id"]})
            if patient_doc:
                patient_email = patient_doc.get("email")
        
        # Endpoint: POST /v1/accounts/{account_id}/signers
        signer_payload = {
            "full_name": consent.get("patient_name", "Paciente")
        }
        if patient_email:
            signer_payload["email"] = patient_email
            print(f"[DEBUG ASSINAFY] Usando e-mail do paciente: {patient_email}")
        else:
            print("[DEBUG ASSINAFY] E-mail do paciente não encontrado no banco de dados.")
        signer_url = f"https://api.assinafy.com.br/v1/accounts/{account_id}/signers"
        print(f"[DEBUG ASSINAFY] Criando signer em: {signer_url}")
        
        signer_res = requests.post(
            signer_url,
            headers={**headers, "Content-Type": "application/json"},
            json=signer_payload,
            timeout=20
        )
        print(f"[DEBUG ASSINAFY] Resposta Signer ({signer_res.status_code}): {signer_res.text}")
        
        signer_id = None
        if signer_res.status_code in [200, 201]:
            signer_data = signer_res.json()
            signer_id = signer_data.get("data", {}).get("id") or signer_data.get("id")
        elif signer_res.status_code == 400 and "já existe" in signer_res.text:
            # Se o signatário já existe, precisamos buscar o ID dele
            print("[DEBUG ASSINAFY] Signatário já existe. Buscando ID existente...")
            search_url = f"https://api.assinafy.com.br/v1/accounts/{account_id}/signers?search={patient_email}"
            search_res = requests.get(search_url, headers=headers, timeout=20)
            if search_res.status_code == 200:
                search_data = search_res.json()
                signers_list = search_data.get("data", [])
                if signers_list:
                    # Filtra pelo e-mail exato para garantir
                    for s in signers_list:
                        if s.get("email") == patient_email:
                            signer_id = s.get("id")
                            print(f"[DEBUG ASSINAFY] ID encontrado para signatário existente: {signer_id}")
                            break
        
        if not signer_id:
            print(f"[DEBUG ASSINAFY] Falha ao obter ID do signer. Resposta original: {signer_res.text}")
            return {"embed_url": None, "error": f"Assinafy Signer Error: Não foi possível criar ou localizar o signatário ({signer_res.status_code})."}
        
        print(f"[DEBUG ASSINAFY] Signer pronto para uso (ID: {signer_id})")

        # 4. Criar o Pedido de Assinatura (Assignment)
        # Para funcionar 100% EMBED dentro do seu site, usamos o método "collect".
        # O método "virtual" (anterior) exige que o paciente receba e-mail e assine no ambiente da Assinafy.
        # O método "collect" permite que a assinatura ocorra diretamente no iframe.
        assignment_payload = {
            "method": "collect",
            "items": [
                {
                    "signer_id": signer_id
                }
            ]
        }
        
        assign_url = f"https://api.assinafy.com.br/v1/documents/{doc_id}/assignments"
        print(f"[DEBUG ASSINAFY] Criando Assignment em: {assign_url}")
        
        assignment_res = requests.post(
            assign_url,
            headers={**headers, "Content-Type": "application/json"},
            json=assignment_payload,
            timeout=20
        )

        print(f"[DEBUG ASSINAFY] Resposta Assignment ({assignment_res.status_code}): {assignment_res.text}")
        
        if assignment_res.status_code not in [200, 201]:
            return {"embed_url": None, "error": f"Assinafy Assignment Error ({assignment_res.status_code}): {assignment_res.text[:200]}"}

        assign_data = assignment_res.json()
        
        # Busca a URL de assinatura no campo signing_urls (estrutura oficial da API Assinafy)
        # Resposta: { "signing_urls": [ { "signer_id": "...", "url": "..." } ] }
        embed_url = None
        
        # 1. Tenta buscar na raiz ou dentro de 'data'
        data_obj = assign_data.get("data") if isinstance(assign_data.get("data"), dict) else assign_data
        
        # Caminho A: signing_urls[0].url (Padrão oficial)
        signing_urls = data_obj.get("signing_urls", [])
        if signing_urls and isinstance(signing_urls, list):
            embed_url = signing_urls[0].get("url")
        
        # Caminho B: sign_url direto no objeto (Alguns endpoints de collect)
        if not embed_url:
            embed_url = data_obj.get("sign_url") or data_obj.get("url")
            
        # Caminho C: dentro da lista de signers
        if not embed_url:
            signers_resp = data_obj.get("signers", [])
            if signers_resp and isinstance(signers_resp, list):
                embed_url = signers_resp[0].get("sign_url") or signers_resp[0].get("url")

        if not embed_url:
            print(f"[DEBUG ASSINAFY] URL de assinatura não encontrada no JSON: {assign_data}")
            return {"embed_url": None, "error": "Assinafy criou o documento, mas não retornou o link de assinatura."}

        # IMPORTANTE: Para permitir o EMBED em iframe, a Assinafy exige o parâmetro ?embed=true na URL
        # Removemos possíveis espaços e garantimos o parâmetro
        embed_url = embed_url.strip()
        if "?" in embed_url:
            embed_url += "&embed=true"
        else:
            embed_url += "?embed=true"

        # Salva o ID do documento para controle
        await db.consents.update_one({"token": token}, {"$set": {"assinafy_id": doc_id}})

        print(f"[DEBUG ASSINAFY] Sucesso! URL de assinatura obtida: {embed_url}")
        return {"embed_url": embed_url}
        
    except Exception as e:
        import traceback
        print(f"[DEBUG ASSINAFY] EXCEÇÃO CRÍTICA: {str(e)}")
        traceback.print_exc()
        return {"embed_url": None, "error": f"Erro interno no servidor ao processar Assinafy: {str(e)}"}

# ==================== CONSENT ====================

@api_router.get("/consent/public/{token}")
async def get_consent_public(token: str):
    consent = await db.consents.find_one({"token": token}, {"_id": 0})
    if not consent:
        raise HTTPException(status_code=404, detail="Link inválido ou expirado")
    
    # Se estiver pendente mas tiver ID da Assinafy, verifica se já foi assinado lá
    if consent.get("status") != "signed" and consent.get("assinafy_id"):
        consent = await _check_and_update_assinafy_status(consent)

    return consent
@api_router.post("/consent/public/{token}/sign")
async def sign_consent_public(token: str, payload: ConsentSignPayload, request: Request):
    consent = await db.consents.find_one({"token": token})
    if not consent:
        raise HTTPException(status_code=404, detail="Link inválido")

    forwarded = request.headers.get("X-Forwarded-For")
    client_ip = forwarded.split(",")[0] if forwarded else request.client.host
    signed_at = datetime.now(timezone.utc).isoformat()

    # PASSO 1: Salva dados com base64 original para garantir geração do PDF
    await db.consents.update_one({"token": token}, {"$set": {
        "status": "signed",
        "signed_at": signed_at,
        "cpf": payload.cpf,
        "signature_image": payload.signature_image,  # base64 original para o PDF
        "is_govbr": payload.is_govbr,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "accuracy": payload.accuracy,
        "geolocation": {
            "latitude": payload.latitude,
            "longitude": payload.longitude,
            "accuracy": payload.accuracy
        },
        "user_agent": payload.user_agent,
        "client_ip": client_ip,
        "use_image_for_marketing": payload.use_image_for_marketing
    }})

    # PASSO 2: Gera PDF com base64 original (100% garantido)
    try:
        settings = await db.settings.find_one({"type": "clinic"}, {"_id": 0})
        updated_consent = await db.consents.find_one({"token": token}, {"_id": 0})
        pdf_buf = await build_consent_pdf(updated_consent, settings)
        pdf_bytes = pdf_buf.read()

        # PASSO 3: Agora que o PDF foi gerado, sobe tudo para o R2
        r2_updates = {}

        # Upload assinatura para R2
        if payload.signature_image and payload.signature_image.startswith("data:image"):
            sig_url = upload_to_r2(payload.signature_image, "assinaturas")
            if sig_url and not sig_url.startswith("data:"):
                r2_updates["signature_image"] = sig_url

        # Upload PDF para R2
        pdf_url = upload_bytes_to_r2(pdf_bytes, "termos-assinados", ".pdf", "application/pdf")
        if pdf_url:
            r2_updates["signed_pdf_url"] = pdf_url
        else:
            import base64 as _b64
            r2_updates["signed_pdf_base64"] = _b64.b64encode(pdf_bytes).decode("utf-8")
            print("[SIGN] PDF salvo em base64 como fallback (R2 indisponível)")

        if r2_updates:
            await db.consents.update_one({"token": token}, {"$set": r2_updates})
            # Remove base64 do banco após upload confirmado no R2
            unset = {}
            if "signature_image" in r2_updates:
                pass  # já substituiu pela URL
            if "signed_pdf_url" in r2_updates:
                unset["signed_pdf_base64"] = ""
            if unset:
                await db.consents.update_one({"token": token}, {"$unset": unset})

    except Exception as e:
        print(f"[SIGN] Erro ao gerar PDF: {e}")

    # Atualiza paciente
    if consent.get("patient_id"):
        await db.patients.update_one(
            {"id": consent["patient_id"]},
            {"$set": {"consent_signed": True, "consent_date": signed_at}}
        )

    return {"message": "Termo assinado com sucesso"}
@api_router.get("/consent/pending/{patient_id}")
async def get_pending_consent(patient_id: str, current_user: dict = Depends(get_current_user)):
    print(f"[DEBUG ASSINAFY] Buscando termos para paciente: {patient_id}")
    consents = await db.consents.find({"patient_id": patient_id}, {"_id": 0}).to_list(100)
    
    # Para cada consentimento pendente que tem um ID da Assinafy, verifica o status atual
    updated_consents = []
    for c in consents:
        if c.get("status") != "signed" and c.get("assinafy_id"):
            print(f"[DEBUG ASSINAFY] Verificando status pendente para token: {c.get('token')}")
            updated_c = await _check_and_update_assinafy_status(c)
            updated_consents.append(updated_c)
        else:
            updated_consents.append(c)
            
    return updated_consents

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

async def build_receipt_pdf(record: dict, patient: dict, settings: dict):
    """Gera o PDF de recibo do atendimento usando letterhead_config do banco."""
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

    footer_text = lh.get("footer_text") or "Documento emitido eletronicamente"
    show_header = lh.get("show_header", True)
    show_footer = lh.get("show_footer", True)
    bg_data     = lh.get("background_image") or ""
    clinic_name = (settings or {}).get("clinic_name") or "Clinica"
    cro         = lh.get("cro")  or ""
    cnpj        = lh.get("cnpj") or ""
    address_val = lh.get("address") or ""
    email_val   = lh.get("email")   or ""

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
                c.setFillColor(Color(1, 1, 1, alpha=0.55))
                c.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
                c.restoreState()
            except Exception: pass
        if show_footer:
            c.saveState()
            c.setFont("Helvetica", fs_legal)
            c.setFillGray(0.4)
            bot = mb - 5 * mm
            c.setStrokeColor(rl_colors.lightgrey)
            c.setLineWidth(0.5)
            c.line(ml, bot + 2*mm, A4[0] - mr, bot + 2*mm)
            c.drawCentredString(A4[0] / 2, bot - 3 * mm, footer_text)
            info_str = f"{clinic_name}"
            if cro: info_str += f" | CRO: {cro}"
            if address_val: info_str += f" | {address_val}"
            c.drawCentredString(A4[0] / 2, bot - 7 * mm, info_str)
            c.restoreState()

    buf = BytesIO()
    doc_pdf = SimpleDocTemplate(
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
    s_big_val = sty("bigval", fontSize=fs_title, textColor=h_color, fontName="Helvetica-Bold", alignment=TA_RIGHT)

    story = []

    if show_header:
        story.append(Paragraph(clinic_name, s_clinic))
        if cro:         story.append(Paragraph(f"CRO: {cro}", s_sub))
        if cnpj:        story.append(Paragraph(f"CNPJ: {cnpj}", s_sub))
        if address_val: story.append(Paragraph(address_val, s_addr))
        if email_val:   story.append(Paragraph(email_val, s_addr))
        story.append(Spacer(1, sp_header))
        story.append(HRFlowable(width="100%", thickness=1, color=h_color))
        story.append(Spacer(1, sp_title))

    story.append(Paragraph("RECIBO DE ATENDIMENTO", s_title))
    proc_name = record.get("procedure_name") or ""
    if proc_name:
        story.append(Paragraph(f"Procedimento: {proc_name}", s_proc))
    story.append(HRFlowable(width="100%", thickness=0.5, color=rl_colors.lightgrey))
    story.append(Spacer(1, sp_title))

    # Dados do recibo
    try:
        data_fmt = datetime.fromisoformat(record.get("date") + "T12:00:00").strftime("%d/%m/%Y")
    except Exception:
        data_fmt = record.get("date") or ""
    rec_num = (record.get("id") or "")[:8].upper()

    story.append(Paragraph("DADOS DO RECIBO", s_section))
    tdata = [
        [Paragraph("Recibo Nº:", s_label), Paragraph(rec_num, s_value)],
        [Paragraph("Data:", s_label),      Paragraph(data_fmt, s_value)],
    ]
    # Duração da consulta (se registrada pelo cronômetro)
    dur_sec = record.get("consultation_duration_seconds")
    if dur_sec and int(dur_sec) > 0:
        ds = int(dur_sec)
        h = ds // 3600
        m = (ds % 3600) // 60
        s = ds % 60
        if h > 0:
            dur_fmt = f"{h}h {m:02d}min"
        elif m > 0:
            dur_fmt = f"{m}min {s:02d}s"
        else:
            dur_fmt = f"{s}s"
        tdata.append([Paragraph("Duração:", s_label), Paragraph(dur_fmt, s_value)])
    t = Table(tdata, colWidths=[35*mm, None])
    t.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("BOTTOMPADDING", (0,0), (-1,-1), 2),
    ]))
    story.append(t)
    story.append(Spacer(1, sp_section))

    # Dados do paciente
    story.append(Paragraph("DADOS DO PACIENTE", s_section))
    tdata = [[Paragraph("Paciente:", s_label), Paragraph(patient.get("name") or "", s_value)]]
    if patient.get("cpf"):
        tdata.append([Paragraph("CPF:", s_label), Paragraph(patient.get("cpf"), s_value)])
    if patient.get("phone"):
        tdata.append([Paragraph("Telefone:", s_label), Paragraph(patient.get("phone"), s_value)])
    t = Table(tdata, colWidths=[35*mm, None])
    t.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("BOTTOMPADDING", (0,0), (-1,-1), 2),
    ]))
    story.append(t)
    story.append(Spacer(1, sp_section))

    # Produtos utilizados (se houver)
    products_used = record.get("products_used") or []
    if products_used:
        story.append(Paragraph("PRODUTOS UTILIZADOS", s_section))
        prod_rows = [[
            Paragraph("<b>Produto</b>", s_value),
            Paragraph("<b>Lote</b>",    s_value),
            Paragraph("<b>Qtd</b>",     s_value),
            Paragraph("<b>Un.</b>",     s_value),
        ]]
        for pu in products_used:
            qty_raw = pu.get("quantity") or 0
            try:
                qty_val = float(qty_raw)
                qty_fmt = f"{qty_val:.1f}".rstrip("0").rstrip(".") if qty_val % 1 else str(int(qty_val))
            except Exception:
                qty_fmt = str(qty_raw)
            prod_rows.append([
                Paragraph(str(pu.get("product_name") or ""), s_value),
                Paragraph(str(pu.get("batch_number") or "—"), s_value),
                Paragraph(qty_fmt, s_value),
                Paragraph(str(pu.get("unit") or "un"), s_value),
            ])
        t = Table(prod_rows, colWidths=[None, 30*mm, 18*mm, 15*mm])
        t.setStyle(TableStyle([
            ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
            ("BOTTOMPADDING", (0,0), (-1,-1), 3),
            ("TOPPADDING",    (0,0), (-1,-1), 3),
            ("BACKGROUND",    (0,0), (-1,0),  rl_colors.lightgrey),
            ("LINEBELOW",     (0,0), (-1,0),  0.5, h_color),
            ("LINEBELOW",     (0,-1),(-1,-1), 0.5, rl_colors.lightgrey),
            ("ALIGN",         (2,1), (2,-1),  "RIGHT"),
            ("ALIGN",         (3,1), (3,-1),  "CENTER"),
        ]))
        story.append(t)
        story.append(Spacer(1, sp_section))

    # Resumo financeiro
    amount = float(record.get("payment_amount") or 0)
    discount = float(record.get("payment_discount") or 0)
    method = record.get("payment_method") or "—"
    status_map = {"paid": "Pago", "pending": "Pendente", "partial": "Parcial"}
    status_label = status_map.get(record.get("payment_status") or "paid", "Pago")
    subtotal = amount + discount

    story.append(Paragraph("VALORES", s_section))
    fdata = [
        [Paragraph("Subtotal", s_label),  Paragraph(f"R$ {subtotal:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."), s_value)],
    ]
    if discount > 0:
        fdata.append([Paragraph("Desconto", s_label), Paragraph(f"- R$ {discount:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."), s_value)])
    fdata.append([Paragraph("Forma de Pagamento", s_label), Paragraph(method, s_value)])
    fdata.append([Paragraph("Status", s_label), Paragraph(status_label, s_value)])
    fdata.append([Paragraph("<b>TOTAL</b>", s_label), Paragraph(f"<b>R$ {amount:,.2f}</b>".replace(",", "X").replace(".", ",").replace("X", "."), s_big_val)])
    t = Table(fdata, colWidths=[60*mm, None])
    t.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("BOTTOMPADDING", (0,0), (-1,-1), 3),
        ("TOPPADDING", (0,0), (-1,-1), 3),
        ("LINEABOVE", (0,-1), (-1,-1), 1, h_color),
    ]))
    story.append(t)
    story.append(Spacer(1, sp_between))

    # Texto de quitação
    valor_fmt = f"R$ {amount:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    quit_txt = (
        f"Declaramos para os devidos fins que recebemos de <b>{patient.get('name') or ''}</b> "
        f"a importância de <b>{valor_fmt}</b> referente ao procedimento de "
        f"<b>{proc_name}</b> realizado em <b>{data_fmt}</b>, dando plena, geral e "
        f"irrevogável quitação."
    )
    story.append(Paragraph(quit_txt, s_body))
    story.append(Spacer(1, sp_between * 2))

    # Assinatura
    sig_tbl = Table(
        [[Paragraph("_" * 40, s_value)], [Paragraph(clinic_name, s_value)]],
        colWidths=[None]
    )
    sig_tbl.setStyle(TableStyle([
        ("ALIGN", (0,0), (-1,-1), "CENTER"),
        ("BOTTOMPADDING", (0,0), (-1,-1), 0),
        ("TOPPADDING", (0,0), (-1,-1), 0),
    ]))
    story.append(sig_tbl)

    doc_pdf.build(story, onFirstPage=_bg_footer, onLaterPages=_bg_footer)
    buf.seek(0)
    return buf


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
    show_header = lh.get("show_header", True)
    show_footer = lh.get("show_footer", True)
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
                c.setFillColor(Color(1, 1, 1, alpha=0.55))
                c.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
                c.restoreState()
            except Exception: pass

        if show_footer:
            # Footer line + text
            c.saveState()
            c.setFont("Helvetica", fs_legal)
            c.setFillGray(0.4)
            bot = mb - 5 * mm
            c.setStrokeColor(rl_colors.lightgrey)
            c.setLineWidth(0.5)
            c.line(ml, bot + 2*mm, A4[0] - mr, bot + 2*mm)
            c.drawCentredString(A4[0] / 2, bot - 3 * mm, footer_text)
            
            # Clinic info in footer
            info_str = f"{clinic_name}"
            if cro: info_str += f" | CRO: {cro}"
            if address_val: info_str += f" | {address_val}"
            c.drawCentredString(A4[0] / 2, bot - 7 * mm, info_str)
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
    if show_header:
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
    
    # Use 'cpf' (signed) or 'patient_cpf' (original)
    display_cpf = consent.get("cpf") or consent.get("patient_cpf") or ""
    if display_cpf:
        tdata.append([Paragraph("CPF:", s_label), Paragraph(str(display_cpf), s_value)])
        
    if consent.get("signed_at"):
        try:
            from datetime import datetime as _dt, timedelta as _td
            # Converte para Fuso de Brasília (UTC-3)
            dt_utc = _dt.fromisoformat(str(consent["signed_at"]).replace("Z", "+00:00"))
            dt_brt = dt_utc - _td(hours=3)
            sfmt = dt_brt.strftime("%d/%m/%Y às %H:%M:%S BRT")
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

    # --- AUTORIZAÇÃO DE USO DE IMAGEM ---
    use_image = consent.get("use_image_for_marketing")
    if use_image is not None:
        story.append(Spacer(1, sp_between))
        story.append(Paragraph("AUTORIZAÇÃO DE USO DE IMAGEM", s_section))
        
        verbo = "<b>AUTORIZO</b>" if use_image is True else "<b>NÃO AUTORIZO</b>"
        
        image_text = (
            f"Pelo presente instrumento, em caráter livre, prévio e voluntário, {verbo} "
            "o Dr. Guilherme Ferraz e sua equipe a realizarem a captação das minhas imagens "
            "(fotografias e/ou vídeos) antes, durante e após a realização dos procedimentos, "
            "destinando-se exclusivamente aos seguintes fins:<br/><br/>"
            "<b>Prontuário Clínico:</b> Registro, arquivamento e acompanhamento da evolução do tratamento, "
            "mantendo-se o rigoroso sigilo profissional.<br/><br/>"
            "<b>Divulgação Profissional:</b> Publicação e compartilhamento em redes sociais, sites, "
            "portfólios e materiais publicitários da clínica, visando a demonstração de resultados "
            "e finalidades didático-científicas.<br/><br/>"
            "Declaro que a presente autorização de uso de imagem é concedida a título gratuito, em caráter "
            "definitivo e por prazo indeterminado, não ensejando qualquer tipo de ônus, remuneração ou "
            "compensação financeira. Compreendo que o tratamento destes dados ocorre em estrita conformidade "
            "com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018), sendo-me resguardado o direito "
            "de revogar este consentimento a qualquer momento, mediante solicitação formal e por escrito."
        )
        story.append(Paragraph(image_text, s_body))

    # Signature — suporta base64 inline e URL do R2
    sig_image = consent.get("signature_image") or ""
    sig_rendered = False
    if sig_image:
        story.append(Spacer(1, sp_between * 2))
        story.append(Paragraph("ASSINATURA DIGITAL", s_section))
        try:
            sig_bytes = None
            if sig_image.startswith("data:image"):
                _, enc = sig_image.split(",", 1)
                sig_bytes = _b64.b64decode(enc)
            elif sig_image.startswith("http"):
                import urllib.request as _urlreq
                with _urlreq.urlopen(sig_image, timeout=10) as _resp:
                    sig_bytes = _resp.read()
            if sig_bytes:
                sig_tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
                sig_tmp.write(sig_bytes)
                sig_tmp.close()
                story.append(RLImage(sig_tmp.name, width=80 * mm, height=25 * mm))
                if "tmp_files" not in locals(): tmp_files = []
                tmp_files.append(sig_tmp.name)
                sig_rendered = True
        except Exception as _sig_err:
            print(f"[PDF] Erro ao renderizar assinatura: {_sig_err}")
    if not sig_rendered and consent.get("signed_at"):
        story.append(Spacer(1, sp_between * 3))
        story.append(HRFlowable(width="60%", thickness=0.5, color=black))
        story.append(Paragraph("Assinatura do Paciente",
            sty("sig_lbl", fontSize=fs_small, alignment=TA_CENTER)))

    # --- DADOS DE AUTENTICAÇÃO (VALIDADE JURÍDICA) ---
    if consent.get("signed_at"):
        story.append(Spacer(1, sp_between * 2))
        
        # Selo de Assinatura Avançada GOV.BR
        if consent.get("is_govbr"):
            gov_style = sty("gov_seal", fontSize=fs_section, textColor=HexColor("#004587"), fontName="Helvetica-Bold", alignment=TA_CENTER, spaceAfter=2*mm)
            story.append(Paragraph("ASSINATURA ELETRÔNICA AVANÇADA (GOV.BR)", gov_style))
            story.append(Paragraph("Documento assinado digitalmente através da plataforma GOV.BR conforme Lei 14.063/2020.", 
                         sty("gov_desc", fontSize=fs_small, alignment=TA_CENTER, spaceAfter=sp_section)))
        
        story.append(Paragraph("DADOS DE AUTENTICAÇÃO (VALIDADE JURÍDICA)", s_section))
        
        # QR Code Generation
        token = consent.get("token", "")
        base_url = _os.environ.get("FRONTEND_URL", "https://app.drguilhermeferraz.com")
        verify_url = f"{base_url}/assinar/{token}"
        
        qr = qrcode.QRCode(version=1, box_size=10, border=0)
        qr.add_data(verify_url)
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color="black", back_color="white")
        
        qr_buf = BytesIO()
        qr_img.save(qr_buf, format='PNG')
        qr_buf.seek(0)
        
        # Authentication Data Table
        lat = consent.get("latitude")
        lon = consent.get("longitude")
        acc = consent.get("accuracy")
        geo = f"{lat}, {lon}" if lat and lon else "Não disponível"
        if acc: geo += f" (Precisão: {acc}m)"
        
        # Image Consent Status
        use_image = consent.get("use_image_for_marketing")
        if use_image is True:
            image_consent_str = "<b>AUTORIZADO</b>"
        elif use_image is False:
            image_consent_str = "<b>NÃO AUTORIZADO</b>"
        else:
            image_consent_str = "Não informado"

        auth_data = [
            [Paragraph("Tipo de Assinatura:", s_label), Paragraph("Avançada (GOV.BR)" if consent.get("is_govbr") else "Simples (Eletrônica)", s_value)],
            [Paragraph("IP do Dispositivo:", s_label), Paragraph(consent.get("client_ip") or consent.get("ip_address") or "Não registrado", s_value)],
            [Paragraph("CPF Informado:", s_label),     Paragraph(str(display_cpf), s_value)],
            [Paragraph("Geolocalização:", s_label),    Paragraph(geo, s_value)],
            [Paragraph("Data/Hora:", s_label),         Paragraph(sfmt, s_value)],
            [Paragraph("Uso de Imagem:", s_label),      Paragraph(image_consent_str, s_value)],
            [Paragraph("User-Agent:", s_label),        Paragraph(consent.get("user_agent") or "Não disponível", s_value)],
            [Paragraph("Token:", s_label),             Paragraph(token, s_value)],
        ]
        
        # Table with QR Code on the right
        qr_rl_img = RLImage(qr_buf, width=35*mm, height=35*mm)
        
        # Main Auth Table
        main_auth_table = Table([
            [Table(auth_data, colWidths=[35*mm, 105*mm]), qr_rl_img]
        ], colWidths=[145*mm, 35*mm])
        
        main_auth_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('ALIGN', (1,0), (1,0), 'RIGHT'),
        ]))
        
        story.append(main_auth_table)
        story.append(Spacer(1, 5*mm))
        story.append(Paragraph("Escaneie o QR Code para verificar a autenticidade deste documento.", 
                     sty("qr_hint", fontSize=fs_small, textColor=rl_colors.grey, alignment=TA_CENTER)))

    # Legal notice
    story.append(Spacer(1, sp_between))
    story.append(HRFlowable(width="100%", thickness=0.5, color=rl_colors.lightgrey))
    story.append(Spacer(1, 2 * mm))
    
    verify_link = f"{base_url}/assinar/{token}" if consent.get("signed_at") else ""
    legal_text = "Este documento foi gerado eletronicamente e possui validade juridica conforme a Lei 14.063/2020 e MP 2.200-2/2001."
    if verify_link:
        legal_text += f"<br/>Verificação: <link href='{verify_link}' color='blue'>{verify_link}</link>"
        
    story.append(Paragraph(legal_text, sty("leg", fontSize=fs_legal, textColor=rl_colors.grey, alignment=TA_CENTER)))

    doc.build(story, onFirstPage=_bg_footer, onLaterPages=_bg_footer)

    # Cleanup temp files
    to_clean = []
    if bg_tmp_path: to_clean.append(bg_tmp_path)
    if "tmp_files" in locals(): to_clean.extend(tmp_files)
    
    for fpath in to_clean:
        try:
            _os.unlink(fpath)
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
        
        # PRIORIDADE 1: PDF armazenado no R2 (novo fluxo)
        if consent.get("signed_pdf_url"):
            import httpx
            async with httpx.AsyncClient(timeout=15) as client_http:
                r = await client_http.get(consent["signed_pdf_url"])
                r.raise_for_status()
                return Response(
                    content=r.content,
                    media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=termo_assinado_{token[:8]}.pdf"}
                )

        # PRIORIDADE 2: PDF em base64 (fallback legado)
        if consent.get("signed_pdf_base64"):
            pdf_content = base64.b64decode(consent["signed_pdf_base64"])
            return Response(
                content=pdf_content,
                media_type="application/pdf",
                headers={"Content-Disposition": f"attachment; filename=termo_assinado_{token[:8]}.pdf"}
            )

        # Caso contrário, gera o PDF interno (assinatura simples ou sem assinatura)
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
        db.appointment_confirmations.create_index("token", unique=True),
        db.revoked_tokens.create_index("token_hash", unique=True),
        db.revoked_tokens.create_index("expires_at", expireAfterSeconds=0),
    ]:
        try:
            await coro
        except Exception:
            pass
    master_email = os.environ.get("ADMIN_EMAIL")
    master_password = os.environ.get("ADMIN_PASSWORD")
    # Só cria/atualiza o admin seed se as duas variáveis estiverem definidas no .env.
    # Em produção, o ideal é deixar as credenciais fora do .env após o primeiro setup
    # (o usuário admin já existe no banco e o seed não precisa rodar de novo).
    if master_email and master_password:
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

    # ── Migração: garante que todos os templates padrão existam no banco com emojis
    # corretos (codificados em B64). Atualiza apenas templates corrompidos/sem emoji.
    import base64 as _b64_mig
    _TEMPLATE_SEEDS = [
        {"id": "consent_link",  "name": "Termo de Consentimento (WhatsApp)", "type": "consent_link",            "active": True},
        {"id": "bday",          "name": "Aniversário",                       "type": "birthday",                "active": True},
        {"id": "botox",         "name": "Retorno Botox",                     "type": "botox_return",            "active": True},
        {"id": "inactive",      "name": "Paciente Inativo",                  "type": "inactive_patient",        "active": True},
        {"id": "appt_confirm",  "name": "Confirmação de Consulta",           "type": "appointment_confirmation","active": True},
        {"id": "appt_reminder", "name": "Lembrete de Consulta",              "type": "appointment_reminder",    "active": True},
    ]
    def _to_b64(text: str) -> str:
        return "B64:" + _b64_mig.b64encode(text.encode("utf-8")).decode("ascii")

    for seed in _TEMPLATE_SEEDS:
        tmpl_type = seed["type"]
        default_msg = _DEFAULT_TEMPLATES.get(tmpl_type, "")
        if not default_msg:
            continue
        existing_tmpl = await db.message_templates.find_one({"id": seed["id"]})
        needs_update = False
        if not existing_tmpl:
            needs_update = True
        else:
            stored_msg = existing_tmpl.get("message", "")
            if stored_msg.startswith("B64:"):
                try:
                    stored_msg = _b64_mig.b64decode(stored_msg[4:]).decode("utf-8")
                except Exception:
                    needs_update = True
            # Corrompido se: vazio, tem replacement char, ou não tem nenhum emoji
            has_emoji = any(ord(c) > 0x2000 for c in stored_msg)
            if not stored_msg or "\ufffd" in stored_msg or not has_emoji:
                needs_update = True

        if needs_update:
            b64_msg = _to_b64(default_msg)
            await db.message_templates.update_one(
                {"id": seed["id"]},
                {"$set": {**seed, "message": b64_msg}},
                upsert=True
            )
            print(f"[startup] Template '{seed['id']}' re-semeado com emojis corretos.")

# ==================== FINANCE PDF HELPERS ====================

def _fmt_brl(value) -> str:
    v = float(value or 0)
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

class _ColorBand(_Flowable):
    def __init__(self, text, bg, fg=None, height=9*mm, font_size=10):
        super().__init__()
        self.text, self.bg, self.fg = text, bg, fg or HexColor("#ffffff")
        self.height, self.font_size = height, font_size
    def wrap(self, aw, ah):
        self.width = aw
        return aw, self.height
    def draw(self):
        self.canv.setFillColor(self.bg)
        self.canv.roundRect(0, 0, self.width, self.height, 4, fill=1, stroke=0)
        self.canv.setFillColor(self.fg)
        self.canv.setFont("Helvetica-Bold", self.font_size)
        self.canv.drawString(8, self.height / 2 - self.font_size / 3, self.text)

class _KpiCard(_Flowable):
    def __init__(self, label, value, bar_color, value_color=None, width=55*mm, height=20*mm):
        super().__init__()
        self.label, self.value = label, value
        self.bar_color = bar_color
        self.value_color = value_color or bar_color
        self._w, self._h = width, height
    def wrap(self, aw, ah):
        return self._w, self._h
    def draw(self):
        c = self.canv
        c.setFillColor(HexColor("#ffffff"))
        c.setStrokeColor(_C_GRAY_BORDER)
        c.setLineWidth(0.5)
        c.roundRect(0, 0, self._w, self._h, 5, fill=1, stroke=1)
        c.setFillColor(self.bar_color)
        c.roundRect(0, 0, 4, self._h, 2, fill=1, stroke=0)
        c.setFillColor(_C_GRAY_TEXT)
        c.setFont("Helvetica", 7)
        c.drawString(10, self._h - 12, self.label.upper())
        c.setFillColor(self.value_color)
        c.setFont("Helvetica-Bold", 13)
        c.drawString(10, 5, self.value)

class _MiniBarChart(_Flowable):
    def __init__(self, data, width=160*mm, height=60*mm):
        super().__init__()
        self.data, self._w, self._h = data, width, height
    def wrap(self, aw, ah):
        return self._w, self._h
    def draw(self):
        c = self.canv
        if not self.data:
            c.setFillColor(_C_GRAY_TEXT)
            c.setFont("Helvetica", 9)
            c.drawCentredString(self._w / 2, self._h / 2, "Sem dados disponíveis")
            return
        pad_l, pad_r, pad_b = 52, 10, 30
        cw = self._w - pad_l - pad_r
        ch = self._h - pad_b - 10
        all_vals = [v for row in self.data for v in row[1:3] if v > 0]
        max_val = max(all_vals) if all_vals else 1
        n = len(self.data)
        gw = cw / n
        bw = gw * 0.22
        gap = bw * 0.5
        colors = [_C_GREEN_LIGHT, _C_RED_DARK, _C_BLUE_DARK]
        c.setStrokeColor(_C_GRAY_BORDER)
        c.setLineWidth(0.3)
        for i in range(5):
            y = pad_b + ch * i / 4
            c.line(pad_l, y, pad_l + cw, y)
            val = max_val * i / 4
            c.setFillColor(_C_GRAY_TEXT)
            c.setFont("Helvetica", 6)
            c.drawRightString(pad_l - 3, y - 2, _fmt_brl(val))
        for i, row in enumerate(self.data):
            label = row[0]
            gx = pad_l + i * gw + gw * 0.1
            for j, (val, col) in enumerate(zip(row[1:4], colors)):
                x = gx + j * (bw + gap)
                bh = (val / max_val) * ch if val > 0 else 0
                c.setFillColor(col)
                if bh > 0:
                    c.roundRect(x, pad_b, bw, bh, 2, fill=1, stroke=0)
            c.setFillColor(_C_DARK)
            c.setFont("Helvetica", 6)
            c.drawCentredString(gx + gw * 0.35, pad_b - 10, label)
        c.setStrokeColor(_C_GRAY_BORDER)
        c.setLineWidth(0.5)
        c.line(pad_l, pad_b, pad_l, pad_b + ch)
        lx = pad_l
        for lbl, col in zip(["Entradas", "Saídas", "Lucro"], colors):
            c.setFillColor(col)
            c.roundRect(lx, 4, 8, 6, 1, fill=1, stroke=0)
            c.setFillColor(_C_DARK)
            c.setFont("Helvetica", 6)
            c.drawString(lx + 10, 5, lbl)
            lx += 55

class _PieChart(_Flowable):
    def __init__(self, slices, width=70*mm, height=70*mm):
        super().__init__()
        self.slices, self._w, self._h = slices, width, height
    def wrap(self, aw, ah):
        return self._w, self._h
    def draw(self):
        c = self.canv
        cx, cy = self._w / 2, self._h / 2 + 8
        r = min(cx, cy) - 12
        total = sum(s[1] for s in self.slices)
        if not total:
            c.setFillColor(_C_GRAY_TEXT)
            c.setFont("Helvetica", 8)
            c.drawCentredString(cx, cy, "Sem dados")
            return
        start = 90
        for label, val, col in self.slices:
            angle = (val / total) * 360
            c.setFillColor(col)
            c.wedge(cx - r, cy - r, cx + r, cy + r, start, angle, fill=1, stroke=0)
            start += angle
        c.setFillColor(HexColor("#ffffff"))
        c.circle(cx, cy, r * 0.55, fill=1, stroke=0)
        c.setFillColor(_C_DARK)
        c.setFont("Helvetica-Bold", 7)
        c.drawCentredString(cx, cy + 2, "Total")
        c.setFont("Helvetica", 6)
        c.drawCentredString(cx, cy - 7, _fmt_brl(total))

def _legend_table(slices, total, styles):
    from reportlab.lib.styles import ParagraphStyle as PS
    rows = []
    for label, val, col in slices:
        pct = f"{val/total*100:.1f}%" if total else "0%"
        rows.append([
            Paragraph(f'<font color="{col.hexval()}">■</font> {label}', PS("lg", fontSize=7, leading=9)),
            Paragraph(pct, PS("lp", fontSize=7, alignment=TA_RIGHT, leading=9)),
            Paragraph(_fmt_brl(val), PS("lv", fontSize=7, fontName="Helvetica-Bold", alignment=TA_RIGHT, leading=9, textColor=col)),
        ])
    t = Table(rows, colWidths=[50*mm, 16*mm, 30*mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LINEBELOW", (0, 0), (-1, -2), 0.3, _C_GRAY_BORDER),
    ]))
    return t

def _on_page(canvas, doc):
    w, h = A4
    canvas.setFillColor(_C_GREEN_DARK)
    canvas.rect(0, h - 22*mm, w, 22*mm, fill=1, stroke=0)
    canvas.setFillColor(HexColor("#ffffff"))
    canvas.setFont("Helvetica-Bold", 16)
    canvas.drawString(_MARGIN, h - 13*mm, "Relatório Financeiro")
    canvas.setFont("Helvetica", 9)
    now = datetime.now().strftime("%d/%m/%Y às %H:%M")
    canvas.drawRightString(w - _MARGIN, h - 13*mm, f"Gerado em {now}")
    canvas.setFillColor(_C_TEAL)
    canvas.rect(0, h - 23*mm, w, 1*mm, fill=1, stroke=0)
    canvas.setFillColor(_C_GRAY_BG)
    canvas.rect(0, 0, w, 12*mm, fill=1, stroke=0)
    canvas.setStrokeColor(_C_GRAY_BORDER)
    canvas.setLineWidth(0.3)
    canvas.line(0, 12*mm, w, 12*mm)
    canvas.setFillColor(_C_GRAY_TEXT)
    canvas.setFont("Helvetica", 7)
    canvas.drawString(_MARGIN, 5*mm, "Sistema de Gestão — Clínica Estética  •  Documento gerado automaticamente")
    canvas.drawRightString(w - _MARGIN, 5*mm, f"Página {doc.page}")

def _build_finance_pdf(monthly_data, by_category, by_payment, summary, transactions, clinic_name="Clínica"):
    from reportlab.lib.styles import ParagraphStyle as PS
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=_MARGIN, rightMargin=_MARGIN, topMargin=26*mm, bottomMargin=16*mm)
    styles = getSampleStyleSheet()
    s_norm = PS("sn", fontSize=8, leading=11)
    s_small = PS("ss", fontSize=7, textColor=_C_GRAY_TEXT, leading=10)
    s_ctr = PS("sc", fontSize=8, alignment=TA_CENTER, leading=11)
    s_rt = PS("sr", fontSize=8, alignment=TA_RIGHT, leading=11)
    story = []
    income = float(summary.get("monthly_income", 0))
    expense = float(summary.get("monthly_expense", 0))
    profit = float(summary.get("monthly_profit", 0))
    trans_count = len(transactions)
    inc_count = sum(1 for t in transactions if t.get("type") == "income")
    avg_ticket = income / inc_count if inc_count else 0
    now = datetime.now()
    month_name = now.strftime("%B/%Y").capitalize()
    info_t = Table([[
        Paragraph(f"<b>Referência:</b> {month_name}", s_norm),
        Paragraph(f"<b>Clínica:</b> {clinic_name}", s_norm),
        Paragraph(f"<b>Transações:</b> {trans_count}", s_norm),
    ]], colWidths=[(_PAGE_W - 2*_MARGIN) / 3] * 3)
    info_t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), _C_GRAY_BG),
        ("GRID", (0, 0), (-1, -1), 0.3, _C_GRAY_BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story += [info_t, Spacer(1, 5*mm)]
    story.append(_ColorBand("  Resumo do Mes Atual", _C_GREEN_DARK))
    story.append(Spacer(1, 3*mm))
    kpi_w = (_PAGE_W - 2*_MARGIN - 8*mm) / 3
    row1 = Table([[
        _KpiCard("Entradas (mes)", _fmt_brl(income), _C_GREEN_MID, _C_GREEN_DARK, kpi_w),
        _KpiCard("Saidas (mes)", _fmt_brl(expense), _C_RED_DARK, _C_RED_DARK, kpi_w),
        _KpiCard("Lucro Liquido", _fmt_brl(profit), _C_BLUE_DARK, _C_BLUE_DARK if profit >= 0 else _C_RED_DARK, kpi_w),
    ]], colWidths=[kpi_w, kpi_w, kpi_w])
    row1.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 4*mm)]))
    story += [row1, Spacer(1, 3*mm)]
    row2 = Table([[
        _KpiCard("No de Transacoes", str(trans_count), _C_AMBER, _C_AMBER, kpi_w, 16*mm),
        _KpiCard("Entradas (qtd.)", str(inc_count), _C_GREEN_MID, _C_GREEN_DARK, kpi_w, 16*mm),
        _KpiCard("Ticket Medio", _fmt_brl(avg_ticket), _C_TEAL, _C_GREEN_DARK, kpi_w, 16*mm),
    ]], colWidths=[kpi_w, kpi_w, kpi_w])
    row2.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 4*mm)]))
    story += [row2, Spacer(1, 3*mm)]
    story.append(_ColorBand("  Evolucao Mensal (ultimos 6 meses)", _C_GREEN_MID))
    story.append(Spacer(1, 3*mm))
    chart_data = [(m.get("month",""), float(m.get("income",0)), float(m.get("expense",0)), float(m.get("profit",0))) for m in monthly_data]
    story.append(_MiniBarChart(chart_data, width=_PAGE_W - 2*_MARGIN, height=60*mm))
    story.append(Spacer(1, 3*mm))
    if monthly_data:
        hdr = [Paragraph(f"<b>{h}</b>", s_ctr if i == 0 else PS("h", fontSize=8, alignment=TA_RIGHT, leading=11)) for i, h in enumerate(["Mes","Entradas","Saidas","Lucro","Margem"])]
        rows_m = [hdr]
        for m in monthly_data:
            inc = float(m.get("income", 0)); exp = float(m.get("expense", 0)); prf = float(m.get("profit", 0))
            margin = f"{prf/inc*100:.1f}%" if inc else "—"
            pc = "#2d6a4f" if prf >= 0 else "#c1121f"
            rows_m.append([
                Paragraph(m.get("month",""), s_norm),
                Paragraph(_fmt_brl(inc), PS("ri", fontSize=8, alignment=TA_RIGHT, textColor=_C_GREEN_MID)),
                Paragraph(_fmt_brl(exp), PS("re", fontSize=8, alignment=TA_RIGHT, textColor=_C_RED_DARK)),
                Paragraph(f'<font color="{pc}"><b>{_fmt_brl(prf)}</b></font>', PS("rp", fontSize=8, alignment=TA_RIGHT)),
                Paragraph(margin, PS("rm", fontSize=8, alignment=TA_RIGHT, textColor=_C_GRAY_TEXT)),
            ])
        cw = [(_PAGE_W - 2*_MARGIN) / 5] * 5
        mt = Table(rows_m, colWidths=cw)
        mt.setStyle(TableStyle([
            ("BACKGROUND", (0,0),(-1,0), _C_GREEN_DARK), ("TEXTCOLOR", (0,0),(-1,0), HexColor("#ffffff")),
            ("ROWBACKGROUNDS",(0,1),(-1,-1),[HexColor("#ffffff"), _C_GRAY_BG]), ("GRID", (0,0),(-1,-1), 0.3, _C_GRAY_BORDER),
            ("VALIGN", (0,0),(-1,-1), "MIDDLE"),
        ]))
        story.append(mt)
    story.append(Spacer(1, 6*mm))
    story.append(_ColorBand("  Entradas por Categoria & Forma de Pagamento", _C_GREEN_MID))
    story.append(Spacer(1, 3*mm))
    cat_sl = [(c.get("category","?"), float(c.get("income",0)), _PALETTE[i % len(_PALETTE)]) for i, c in enumerate(by_category) if float(c.get("income",0)) > 0]
    pay_sl = [(p.get("method","?"), float(p.get("total",0)), _PALETTE[i % len(_PALETTE)]) for i, p in enumerate(by_payment) if float(p.get("total",0)) > 0]
    cat_tot = sum(v for _,v,_ in cat_sl) or 1
    pay_tot = sum(v for _,v,_ in pay_sl) or 1
    sw = (_PAGE_W - 2*_MARGIN - 6*mm) / 2
    cat_col = [_PieChart(cat_sl, sw, 65*mm), _legend_table(cat_sl, cat_tot, styles)] if cat_sl else [Paragraph("Sem dados.", s_small)]
    pay_col = [_PieChart(pay_sl, sw, 65*mm), _legend_table(pay_sl, pay_tot, styles)] if pay_sl else [Paragraph("Sem dados.", s_small)]
    pie_t = Table([[cat_col, pay_col]], colWidths=[sw, sw])
    pie_t.setStyle(TableStyle([("VALIGN", (0,0),(-1,-1), "TOP"), ("LINEBEFORE", (1,0),(1,-1), 0.3, _C_GRAY_BORDER)]))
    story += [pie_t, Spacer(1, 6*mm)]
    exp_cats = [(c.get("category","?"), float(c.get("expense",0))) for c in by_category if float(c.get("expense",0)) > 0]
    if exp_cats:
        story.append(_ColorBand("  Saidas por Categoria", _C_RED_DARK))
        story.append(Spacer(1, 3*mm))
        tot_exp = sum(v for _,v in exp_cats) or 1
        exp_rows = [[Paragraph(f"<b>{h}</b>", PS("eh", fontSize=8, alignment=TA_RIGHT if i > 0 else TA_CENTER, leading=11)) for i, h in enumerate(["Categoria","Valor","%","Distribuicao"])]]
        for label, val in sorted(exp_cats, key=lambda x: -x[1]):
            pct = val / tot_exp
            bar = "█" * int(pct * 18) + "░" * (18 - int(pct * 18))
            exp_rows.append([
                Paragraph(label, s_norm),
                Paragraph(_fmt_brl(val), PS("ev", fontSize=8, alignment=TA_RIGHT, textColor=_C_RED_DARK)),
                Paragraph(f"{pct*100:.1f}%", PS("ep", fontSize=8, alignment=TA_RIGHT, textColor=_C_GRAY_TEXT)),
                Paragraph(f'<font color="#c1121f">{bar}</font>', PS("eb", fontSize=6)),
            ])
        avail = _PAGE_W - 2*_MARGIN
        et = Table(exp_rows, colWidths=[55*mm, 40*mm, 22*mm, avail - 117*mm])
        et.setStyle(TableStyle([
            ("BACKGROUND", (0,0),(-1,0), _C_RED_DARK), ("TEXTCOLOR", (0,0),(-1,0), HexColor("#ffffff")),
            ("ROWBACKGROUNDS",(0,1),(-1,-1),[HexColor("#ffffff"), _C_RED_LIGHT]), ("GRID", (0,0),(-1,-1), 0.3, _C_GRAY_BORDER),
        ]))
        story += [et, Spacer(1, 6*mm)]
    story.append(_ColorBand("  Ultimas Transacoes (ate 50)", _C_BLUE_DARK))
    story.append(Spacer(1, 3*mm))
    trans_show = transactions[:50]
    if trans_show:
        t_hdr = [Paragraph(f"<b>{h}</b>", PS("th", fontSize=8, alignment=TA_CENTER if i in (0,4) else (TA_RIGHT if i==5 else None) or 0, leading=11)) for i, h in enumerate(["Data","Descricao","Categoria","Pagamento","Tipo","Valor"])]
        t_rows = [t_hdr]
        for t in trans_show:
            is_inc = t.get("type") == "income"; val = float(t.get("amount", 0))
            vstr = f'{"+" if is_inc else "-"} {_fmt_brl(val)}'; vc = "#2d6a4f" if is_inc else "#c1121f"; tipo = "Entrada" if is_inc else "Saida"
            raw_d = t.get("date","")
            try: date_str = datetime.strptime(raw_d, "%Y-%m-%d").strftime("%d/%m/%Y")
            except: date_str = raw_d
            t_rows.append([
                Paragraph(date_str, s_ctr), Paragraph(t.get("description","—")[:38], s_norm),
                Paragraph(t.get("category","—"), s_small), Paragraph(t.get("payment_method","—"), s_small),
                Paragraph(f'<font color="{vc}"><b>{tipo}</b></font>', PS("tp", fontSize=7, alignment=TA_CENTER)),
                Paragraph(f'<font color="{vc}"><b>{vstr}</b></font>', PS("vp", fontSize=8, alignment=TA_RIGHT)),
            ])
        tt = Table(t_rows, colWidths=[22*mm, 63*mm, 30*mm, 28*mm, 20*mm, 37*mm], repeatRows=1)
        tt.setStyle(TableStyle([
            ("BACKGROUND", (0,0),(-1,0), _C_BLUE_DARK), ("TEXTCOLOR", (0,0),(-1,0), HexColor("#ffffff")),
            ("ROWBACKGROUNDS",(0,1),(-1,-1),[HexColor("#ffffff"), _C_GRAY_BG]), ("GRID", (0,0),(-1,-1), 0.3, _C_GRAY_BORDER),
        ]))
        story.append(tt)
    else:
        story.append(Paragraph("Nenhuma transacao registrada.", s_small))
    story += [Spacer(1, 4*mm), HRFlowable(width="100%", thickness=0.5, color=_C_GRAY_BORDER), Spacer(1, 2*mm)]
    story.append(Paragraph(f"Relatorio gerado automaticamente pelo Sistema de Gestao — {clinic_name}  •  {datetime.now().strftime('%d/%m/%Y as %H:%M')}", PS("fn", fontSize=7, textColor=_C_GRAY_TEXT, alignment=TA_CENTER)))
    doc.build(story, onFirstPage=_on_page, onLaterPages=_on_page)
    buf.seek(0)
    return buf
