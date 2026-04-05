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
from reportlab.lib.colors import HexColor
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, Image as RLImage
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ==================== CONFIGURAÇÃO CLOUDFLARE R2 ====================
R2_ENDPOINT_URL = os.environ.get("R2_ENDPOINT_URL", "https://5fbe1d5a07ab033b3fa3ea66cea56ef5.r2.cloudflarestorage.com")
R2_ACCESS_KEY = os.environ.get("R2_ACCESS_KEY", "25c9bacc4f1eeb0ed2b8faa577eb5dfb")
R2_SECRET_KEY = os.environ.get("R2_SECRET_KEY", "14075a2e03363648f4208d2044c68165c35bf54c39083670fa6cddc5fceb24cb")
R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME", "sistemaclinica-storage")
R2_PUBLIC_URL = os.environ.get("R2_PUBLIC_URL", "https://pub-0b5fb56a119c4cb89149ab672664d1f9.r2.dev")

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

# ==================== CORS — DEVE ficar ANTES de include_router ====================
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

# WhatsApp Helper — Garante encoding UTF-8 para emojis
def build_whatsapp_url(phone: str, message: str) -> str:
    """Gera URL do WhatsApp com encoding UTF-8 explícito para suportar emojis."""
    # Garante que a mensagem é codificada como UTF-8 antes do percent-encoding
    encoded_text = quote(message.encode('utf-8'), safe=b'')
    if phone:
        return f"https://wa.me/{phone}?text={encoded_text}"
    return f"https://wa.me/?text={encoded_text}"

# Auth Helpers
def get_jwt_secret() -> str:
    return os.environ.get("JWT_SECRET", "clinica-secret-key-default-change-me")

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

# ==================== CRM ALERTS (COINCIDINDO COM FRONTEND) ====================

@api_router.get("/patients/alerts/birthdays")
async def get_birthday_alerts(current_user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date()
    patients = await db.patients.find({}, {"_id": 0}).to_list(1000)
    alerts = []
    for p in patients:
        if p.get("birth_date"):
            try:
                birth = datetime.strptime(p["birth_date"], "%Y-%m-%d").date()
                # Tenta aniversário esse ano, se já passou tenta ano seguinte
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
    limit_date = (datetime.now(timezone.utc) - timedelta(days=140)).strftime("%Y-%m-%d")
    # Busca último agendamento de botox por paciente
    appointments = await db.appointments.find(
        {"procedure_name": {"$regex": "botox|toxina", "$options": "i"},
         "status": {"$ne": "cancelled"}},
        {"_id": 0}
    ).sort("date", -1).to_list(5000)
    # Agrupa por paciente, pega o mais recente
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
        last_app = await db.appointments.find_one(
            {"patient_id": pid, "status": {"$ne": "cancelled"}},
            {"_id": 0}
        )
        # Pegar o mais recente manualmente se necessário
        if not last_app:
            last_app = None
        else:
            # Busca o mais recente (find_one não garante ordem no motor)
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
            # Nunca teve agendamento
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

# ==================== FINANCEIRO (FLUXO DE CAIXA) ====================

@api_router.get("/finance/summary")
async def get_finance_summary(current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    first_day = now.replace(day=1).strftime("%Y-%m-%d")
    transactions = await db.transactions.find({"date": {"$gte": first_day}}, {"_id": 0}).to_list(2000)
    income = sum(t.get("amount", 0) for t in transactions if t.get("type") == "income")
    expense = sum(t.get("amount", 0) for t in transactions if t.get("type") == "expense")
    return {"monthly_income": income, "monthly_expense": expense, "monthly_profit": income - expense}

@api_router.post("/finance/transactions")
async def create_transaction(request: Request, current_user: dict = Depends(get_current_user)):
    transaction = await request.json()
    transaction["id"] = str(uuid.uuid4())
    transaction["created_at"] = datetime.now(timezone.utc).isoformat()
    transaction["created_by"] = current_user.get("name")
    await db.transactions.insert_one(transaction)
    return transaction

@api_router.get("/finance/transactions")
async def get_transactions(current_user: dict = Depends(get_current_user)):
    return await db.transactions.find({}, {"_id": 0}).sort("date", -1).to_list(1000)

@api_router.delete("/finance/transactions/{id}")
async def delete_transaction(id: str, current_user: dict = Depends(get_current_user)):
    await db.transactions.delete_one({"id": id})
    return {"message": "Transação removida"}

# ==================== PACIENTES & PRONTUÁRIO (R2 INTEGRADO) ====================

@api_router.get("/patients")
async def get_patients(current_user: dict = Depends(get_current_user)):
    return await db.patients.find({}, {"_id": 0}).sort("name", 1).to_list(1000)

@api_router.post("/patients")
async def create_patient(patient: dict, current_user: dict = Depends(get_current_user)):
    patient["id"] = str(uuid.uuid4())
    patient["consent_signed"] = False
    patient["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.patients.insert_one(patient)
    return patient

@api_router.put("/patients/{id}")
async def update_patient(id: str, request: Request, current_user: dict = Depends(get_current_user)):
    data = await request.json()
    await db.patients.update_one({"id": id}, {"$set": data})
    return {"message": "Paciente atualizado"}

@api_router.delete("/patients/{id}")
async def delete_patient(id: str, current_user: dict = Depends(get_current_user)):
    await db.patients.delete_one({"id": id})
    return {"message": "Paciente removido"}

@api_router.post("/medical-records")
async def create_medical_record(record: dict, current_user: dict = Depends(get_current_user)):
    # Upload das fotos para o Cloudflare R2 antes de salvar
    pb = [upload_to_r2(p, "prontuarios") for p in record.get("photos_before", [])]
    pa = [upload_to_r2(p, "prontuarios") for p in record.get("photos_after", [])]
    
    doc = {
        **record,
        "id": str(uuid.uuid4()),
        "photos_before": pb,
        "photos_after": pa,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.get("name")
    }
    await db.medical_records.insert_one(doc)
    return doc

@api_router.get("/medical-records/patient/{patient_id}")
async def get_records(patient_id: str, current_user: dict = Depends(get_current_user)):
    return await db.medical_records.find({"patient_id": patient_id}, {"_id": 0}).sort("date", -1).to_list(500)

# ==================== AGENDA & PROCEDIMENTOS ====================

@api_router.get("/appointments")
async def get_appointments(date: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {"date": date} if date else {}
    return await db.appointments.find(query, {"_id": 0}).sort([("date", 1), ("time", 1)]).to_list(1000)

@api_router.post("/appointments")
async def create_appointment(appo: dict, current_user: dict = Depends(get_current_user)):
    # Enriquecer com dados do paciente e procedimento
    patient = await db.patients.find_one({"id": appo.get("patient_id")}, {"_id": 0})
    procedure = await db.procedures.find_one({"id": appo.get("procedure_id")}, {"_id": 0})
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedimento não encontrado")
    appo["id"] = str(uuid.uuid4())
    appo["status"] = "scheduled"
    appo["patient_name"] = patient.get("name", "")
    appo["patient_phone"] = patient.get("phone", "")
    appo["procedure_name"] = procedure.get("name", "")
    appo["duration_minutes"] = procedure.get("duration_minutes", 30)
    appo["created_at"] = datetime.now(timezone.utc).isoformat()
    appo["created_by"] = current_user.get("name", "")
    await db.appointments.insert_one(appo)
    appo.pop("_id", None)
    return appo

@api_router.put("/appointments/{id}")
async def update_appointment(id: str, request: Request, current_user: dict = Depends(get_current_user)):
    data = await request.json()
    await db.appointments.update_one({"id": id}, {"$set": data})
    return {"message": "Agendamento atualizado"}

@api_router.get("/procedures")
async def get_procedures(current_user: dict = Depends(get_current_user)):
    return await db.procedures.find({}, {"_id": 0}).sort("name", 1).to_list(200)

@api_router.post("/procedures")
async def create_procedure(proc: dict, current_user: dict = Depends(get_current_user)):
    proc["id"] = str(uuid.uuid4())
    await db.procedures.insert_one(proc)
    return proc

# ==================== ESTOQUE (QR CODE) ====================

@api_router.get("/products")
async def get_products(current_user: dict = Depends(get_current_user)):
    products = await db.products.find({}, {"_id": 0}).to_list(1000)
    for p in products: p["id"] = p.get("qr_code_id")
    return products

@api_router.post("/products")
async def create_product(product: dict, current_user: dict = Depends(get_current_user)):
    product["qr_code_id"] = str(uuid.uuid4())
    product["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.products.insert_one(product)
    return product

@api_router.get("/qr/generate/{code}")
async def generate_qr(code: str):
    qr = qrcode.QRCode(version=1, box_size=10, border=1)
    qr.add_data(code); qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = BytesIO(); img.save(buf, 'PNG'); buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")

# ==================== AUTH & SETTINGS ====================

@api_router.post("/auth/login")
async def login(credentials: dict, response: Response):
    user = await db.users.find_one({"email": credentials["email"].lower()})
    if not user or not verify_password(credentials["password"], user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email ou senha incorretos")
    if user.get("active") is False:
        raise HTTPException(status_code=403, detail="Conta desativada. Contate o administrador.")
    acc = create_access_token(str(user["_id"]), user["email"])
    ref = create_refresh_token(str(user["_id"]), user["email"])
    response.set_cookie(key="access_token", value=acc, httponly=True, secure=True, samesite="none", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=ref, httponly=True, secure=True, samesite="none", max_age=7*24*3600, path="/")
    return {"_id": str(user["_id"]), "name": user["name"], "email": user["email"], "role": user.get("role", "user")}

@api_router.post("/auth/register")
async def register_user(credentials: dict, response: Response):
    email = credentials.get("email", "").lower().strip()
    password = credentials.get("password", "")
    name = credentials.get("name", "").strip()
    if not email or not password or not name:
        raise HTTPException(status_code=422, detail="Email, senha e nome são obrigatórios")
    if len(password) < 6:
        raise HTTPException(status_code=422, detail="Senha deve ter pelo menos 6 caracteres")
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

# ==================== ROTAS FALTANTES ====================

# --- Reports Dashboard (usado pelo Dashboard.js) ---
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

# --- Movements (Movimentações) ---
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
async def create_movement(request: Request, current_user: dict = Depends(get_current_user)):
    data = await request.json()
    product = await db.products.find_one({"qr_code_id": data["product_id"]}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    if data["type"] == "saida":
        if product["quantity"] < data["quantity"]:
            raise HTTPException(status_code=400, detail="Quantidade insuficiente em estoque")
        new_qty = product["quantity"] - data["quantity"]
    else:
        new_qty = product["quantity"] + data["quantity"]
    await db.products.update_one({"qr_code_id": data["product_id"]}, {"$set": {"quantity": new_qty}})
    movement_doc = {
        "id": str(uuid.uuid4()),
        "product_id": data["product_id"],
        "product_name": product["name"],
        "type": data["type"],
        "quantity": data["quantity"],
        "user_name": current_user.get("name", ""),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "notes": data.get("notes", "")
    }
    await db.movements.insert_one(movement_doc)
    movement_doc.pop("_id", None)
    return movement_doc

# --- QR Scan ---
@api_router.get("/qr/scan/{qr_code_id}")
async def scan_qr(qr_code_id: str):
    product = await db.products.find_one({"qr_code_id": qr_code_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    product["id"] = product["qr_code_id"]
    return product

# --- Products extras ---
@api_router.get("/products/{product_id}")
async def get_product(product_id: str, current_user: dict = Depends(get_current_user)):
    product = await db.products.find_one({"qr_code_id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    product["id"] = product["qr_code_id"]
    return product

@api_router.put("/products/{product_id}")
async def update_product(product_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    data = await request.json()
    await db.products.update_one({"qr_code_id": product_id}, {"$set": data})
    product = await db.products.find_one({"qr_code_id": product_id}, {"_id": 0})
    product["id"] = product["qr_code_id"]
    return product

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, current_user: dict = Depends(get_current_user)):
    await db.products.delete_one({"qr_code_id": product_id})
    return {"message": "Produto excluído"}

# --- Settings logo ---
@api_router.post("/settings/logo")
async def upload_logo(request: Request, current_user: dict = Depends(get_current_user)):
    body = await request.json()
    logo_data = body.get("logo_data", "")
    if logo_data.startswith("data:image"):
        logo_data = upload_to_r2(logo_data, "config")
    await db.settings.update_one({"type": "clinic"}, {"$set": {"logo_url": logo_data}}, upsert=True)
    return {"message": "Logo atualizado"}

# --- Appointments Summary & extras ---
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
    
    # Buscar template do banco de dados se template_id fornecido
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

# --- Patients extras ---
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
    message = template["message"].replace("{nome}", patient["name"]) if template else f"Olá {patient['name']}!"
    phone = patient["phone"].replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if not phone.startswith("55"):
        phone = "55" + phone
    return {"whatsapp_url": build_whatsapp_url(phone, message), "phone": phone, "message": message}

# --- Alerts all (Dashboard Pacientes) ---
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

# --- Admin Users ---
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
        u["id"] = str(u.pop("_id"))
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

# --- Consent público (ConsentSign.js) ---
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
async def generate_consent_link(request: Request, current_user: dict = Depends(get_current_user)):
    data = await request.json()
    token = secrets.token_urlsafe(32)
    patient = await db.patients.find_one({"id": data.get("patient_id")}, {"_id": 0})
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    procedure = await db.procedures.find_one({"id": data.get("procedure_id")}, {"_id": 0})

    # Pega configurações da clínica para montar mensagem personalizada
    settings = await db.settings.find_one({"type": "clinic"}, {"_id": 0})
    clinic_name = settings.get("clinic_name", "Nossa Clínica") if settings else "Nossa Clínica"
    procedure_name = procedure.get("name") if procedure else data.get("procedure_name", "Procedimento")

    # URL pública do sistema onde o paciente vai assinar
    base_url = os.environ.get("FRONTEND_URL", "https://app.drguilhermeferraz.com")
    signing_link = f"{base_url}/assinar/{token}"

    # Mensagem WhatsApp — usa o template configurado no CRM
    patient_name = patient.get("name", "")
    # Busca template do tipo consent_link (configuravel pelo usuario no CRM > Configuracoes)
    tmpl = await db.message_templates.find_one({"type": "consent_link", "active": True}, {"_id": 0})
    if not tmpl:
        # Fallback: cria template padrao se nao existir
        default_tmpl_msg = (
            "Ola {nome}! Tudo bem?\n\n"
            "Informamos que o documento Termo de Consentimento "
            "para o procedimento de {procedimento} ja esta disponivel "
            "para sua assinatura digital.\n\n"
            "Para visualizar e assinar, acesse o link: > {link}\n\n"
            "Atencao: Por questoes de seguranca, este link expira em 48 horas.\n\n"
            "Caso tenha qualquer duvida, nossa equipe esta pronta para te ajudar!\n\n"
            "Atenciosamente,\nEquipe {clinica}."
        )
        await db.message_templates.update_one(
            {"id": "consent_link"},
            {"$set": {"id": "consent_link", "name": "Termo de Consentimento (WhatsApp)",
                      "type": "consent_link", "active": True, "message": default_tmpl_msg}},
            upsert=True
        )
        tmpl_message = default_tmpl_msg
    else:
        tmpl_message = tmpl.get("message", "")
    # Substitui os placeholders do template
    message = (tmpl_message
        .replace("{nome}", patient_name)
        .replace("{procedimento}", procedure_name)
        .replace("{link}", signing_link)
        .replace("{clinica}", clinic_name)
    )

    # Formata o telefone do paciente
    phone = patient.get("phone", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if phone and not phone.startswith("55"):
        phone = "55" + phone

    whatsapp_url = build_whatsapp_url(phone, message)

    # Prioridade do consent_text:
    # 1. Texto enviado pelo frontend (já é o do procedimento específico ou LGPD geral)
    # 2. Se não enviado, busca o consent_template do procedimento no banco
    # 3. Se ainda vazio, usa o LGPD genérico como fallback
    consent_text_final = data.get("consent_text", "").strip()
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
        "patient_id": data.get("patient_id"),
        "patient_name": patient_name,
        "patient_cpf": patient.get("cpf", ""),
        "procedure_id": data.get("procedure_id"),
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

@api_router.get("/consent/pdf/{token}")
async def get_consent_pdf(token: str):
    consent = await db.consents.find_one({"token": token}, {"_id": 0})
    if not consent:
        raise HTTPException(status_code=404, detail="Consentimento não encontrado")
    buf = BytesIO()
    doc_pdf = SimpleDocTemplate(buf, pagesize=A4)
    styles = getSampleStyleSheet()
    story = [
        Paragraph("TERMO DE CONSENTIMENTO", styles["Title"]),
        Spacer(1, 12),
        Paragraph(f"Paciente: {consent.get('patient_name', '')}", styles["Normal"]),
        Paragraph(f"Procedimento: {consent.get('procedure_name', '')}", styles["Normal"]),
        Spacer(1, 12),
        Paragraph(consent.get("consent_text", ""), styles["Normal"]),
    ]
    if consent.get("signed_at"):
        story += [
            Spacer(1, 12),
            Paragraph(f"Assinado em: {consent['signed_at']}", styles["Normal"]),
        ]
    doc_pdf.build(story)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=consentimento_{token[:8]}.pdf"})

# Inclusão de Rotas (CORS já adicionado antes, acima)

# ==================== ROTAS FALTANTES: MEDICAL RECORDS ====================

@api_router.get("/medical-records/{record_id}")
async def get_medical_record(record_id: str, current_user: dict = Depends(get_current_user)):
    record = await db.medical_records.find_one({"id": record_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Prontuario nao encontrado")
    return record

@api_router.put("/medical-records/{record_id}")
async def update_medical_record(record_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    data = await request.json()
    if data.get("photos_before"):
        data["photos_before"] = [upload_to_r2(p, "prontuarios") if isinstance(p, str) and p.startswith("data:image") else p for p in data["photos_before"]]
    if data.get("photos_after"):
        data["photos_after"] = [upload_to_r2(p, "prontuarios") if isinstance(p, str) and p.startswith("data:image") else p for p in data["photos_after"]]
    await db.medical_records.update_one({"id": record_id}, {"$set": data})
    result = await db.medical_records.find_one({"id": record_id}, {"_id": 0})
    return result or {"message": "Prontuario atualizado"}

@api_router.delete("/medical-records/{record_id}")
async def delete_medical_record(record_id: str, current_user: dict = Depends(get_current_user)):
    await db.medical_records.delete_one({"id": record_id})
    return {"message": "Prontuario excluido"}

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

# ==================== ROTAS FALTANTES: PROCEDURES ====================

@api_router.get("/procedures/{procedure_id}")
async def get_procedure_by_id(procedure_id: str, current_user: dict = Depends(get_current_user)):
    proc = await db.procedures.find_one({"id": procedure_id}, {"_id": 0})
    if not proc:
        raise HTTPException(status_code=404, detail="Procedimento nao encontrado")
    return proc

@api_router.put("/procedures/{procedure_id}")
async def update_procedure(procedure_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    data = await request.json()
    await db.procedures.update_one({"id": procedure_id}, {"$set": data})
    result = await db.procedures.find_one({"id": procedure_id}, {"_id": 0})
    return result or {"message": "Procedimento atualizado"}

@api_router.delete("/procedures/{procedure_id}")
async def delete_procedure(procedure_id: str, current_user: dict = Depends(get_current_user)):
    await db.procedures.delete_one({"id": procedure_id})
    return {"message": "Procedimento excluido"}

app.include_router(api_router)

@app.on_event("startup")
async def startup_event():
    # Índices com try/except para evitar conflito com índices já existentes no MongoDB
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
    # Garantir admin master
    master_email = os.environ.get("ADMIN_EMAIL", "guilhermeferraz1112@gmail.com")
    master_password = os.environ.get("ADMIN_PASSWORD", "%782870899gG%Sistema")
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
