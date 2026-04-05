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
R2_ENDPOINT_URL = os.environ.get("R2_ENDPOINT_URL", "")
R2_ACCESS_KEY   = os.environ.get("R2_ACCESS_KEY", "")
R2_SECRET_KEY   = os.environ.get("R2_SECRET_KEY", "")
R2_BUCKET_NAME  = os.environ.get("R2_BUCKET_NAME", "sistemaclinica-storage")
R2_PUBLIC_URL   = os.environ.get("R2_PUBLIC_URL", "")

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

# WhatsApp Helper
def build_whatsapp_url(phone: str, message: str) -> str:
    # Encoda tudo EXCETO emojis e caracteres especiais Unicode
    # O WhatsApp aceita emojis diretamente na URL
    encoded_text = quote(message, safe='', encoding='utf-8')
    if phone:
        return f"https://wa.me/{phone}?text={encoded_text}"
    return f"https://wa.me/?text={encoded_text}"

# Auth Helpers
def get_jwt_secret() -> str:
    secret = os.environ.get("JWT_SECRET")
    if not secret:
        raise RuntimeError("❌ JWT_SECRET não definida! Configure esta variável de ambiente.")
    return secret

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
async def get_birthday_alerts():
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
async def get_botox_alerts():
    today = datetime.now(timezone.utc).date()
    appointments = await db.appointments.find(
        {"procedure_name": {"$regex": "botox|toxina", "$options": "i"}, "status": {"$ne": "cancelled"}},
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
async def get_inactive_alerts():
    today = datetime.now(timezone.utc).date()
    all_patients = await db.patients.find({}, {"_id": 0}).to_list(1000)
    inactive = []
    for p in all_patients:
        pid = p.get("id")
        all_apps = await db.appointments.find(
            {"patient_id": pid, "status": {"$ne": "cancelled"}}, {"_id": 0}
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

# ✅ alerts/all ANTES de /{patient_id}
@api_router.get("/patients/alerts/all")
async def get_all_alerts(current_user: dict = Depends(get_current_user)):
    birthdays = await get_birthday_alerts()
    botox = await get_botox_alerts()
    inactive = await get_inactive_alerts()
    return {
        "birthdays": birthdays,
        "botox_returns": botox,
        "inactive_patients": inactive,
        "total_alerts": len(birthdays) + len(botox) + len(inactive)
    }

# ==================== MESSAGE TEMPLATES ====================

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
    transactions = await db.transactions.find({"date": {"$gte": first_day}}).to_list(2000)
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
    transaction.pop("_id", None)
    return transaction

@api_router.get("/finance/transactions")
async def get_transactions(current_user: dict = Depends(get_current_user)):
    return await db.transactions.find({}, {"_id": 0}).sort("date", -1).to_list(1000)

@api_router.delete("/finance/transactions/{id}")
async def delete_transaction(id: str, current_user: dict = Depends(get_current_user)):
    await db.transactions.delete_one({"id": id})
    return {"message": "Transação removida"}

@api_router.get("/finance/reports/monthly")
async def get_monthly_evolution(current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    months = []
    for i in range(5, -1, -1):
        month_date = (now.replace(day=1) - timedelta(days=i * 28)).replace(day=1)
        month_start = month_date.strftime("%Y-%m-%d")
        if month_date.month == 12:
            next_month = month_date.replace(year=month_date.year + 1, month=1, day=1)
        else:
            next_month = month_date.replace(month=month_date.month + 1, day=1)
        month_end = next_month.strftime("%Y-%m-%d")
        months.append({"label": month_date.strftime("%b/%Y"), "start": month_start, "end": month_end})
    result = []
    for m in months:
        txs = await db.transactions.find({"date": {"$gte": m["start"], "$lt": m["end"]}}, {"_id": 0}).to_list(5000)
        income = sum(t.get("amount", 0) for t in txs if t.get("type") == "income")
        expense = sum(t.get("amount", 0) for t in txs if t.get("type") == "expense")
        result.append({"month": m["label"], "income": income, "expense": expense, "profit": income - expense})
    return result

@api_router.get("/finance/reports/by-category")
async def get_by_category(current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    first_day = now.replace(day=1).strftime("%Y-%m-%d")
    txs = await db.transactions.find({"date": {"$gte": first_day}}, {"_id": 0}).to_list(5000)
    categories: dict = {}
    for t in txs:
        cat = t.get("category", "Outros")
        if cat not in categories:
            categories[cat] = {"income": 0, "expense": 0}
        if t.get("type") == "income":
            categories[cat]["income"] += t.get("amount", 0)
        else:
            categories[cat]["expense"] += t.get("amount", 0)
    return [{"category": cat, "income": v["income"], "expense": v["expense"]} for cat, v in categories.items()]

@api_router.get("/finance/reports/by-payment")
async def get_by_payment(current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    first_day = now.replace(day=1).strftime("%Y-%m-%d")
    txs = await db.transactions.find({"date": {"$gte": first_day}, "type": "income"}, {"_id": 0}).to_list(5000)
    methods: dict = {}
    for t in txs:
        method = t.get("payment_method", "Outros")
        methods[method] = methods.get(method, 0) + t.get("amount", 0)
    return [{"method": m, "total": v} for m, v in methods.items()]

@api_router.get("/finance/reports/export-pdf")
async def export_finance_pdf(current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    first_day = now.replace(day=1).strftime("%Y-%m-%d")
    month_label = now.strftime("%B/%Y").capitalize()
    txs_month = await db.transactions.find({"date": {"$gte": first_day}}, {"_id": 0}).to_list(5000)
    income = sum(t.get("amount", 0) for t in txs_month if t.get("type") == "income")
    expense = sum(t.get("amount", 0) for t in txs_month if t.get("type") == "expense")
    profit = income - expense
    monthly_data = []
    for i in range(5, -1, -1):
        md = (now.replace(day=1) - timedelta(days=i * 28)).replace(day=1)
        ms = md.strftime("%Y-%m-%d")
        if md.month == 12:
            me = md.replace(year=md.year + 1, month=1, day=1).strftime("%Y-%m-%d")
        else:
            me = md.replace(month=md.month + 1, day=1).strftime("%Y-%m-%d")
        txs_m = await db.transactions.find({"date": {"$gte": ms, "$lt": me}}, {"_id": 0}).to_list(5000)
        inc_m = sum(t.get("amount", 0) for t in txs_m if t.get("type") == "income")
        exp_m = sum(t.get("amount", 0) for t in txs_m if t.get("type") == "expense")
        monthly_data.append((md.strftime("%b/%Y"), inc_m, exp_m, inc_m - exp_m))
    categories: dict = {}
    for t in txs_month:
        cat = t.get("category", "Outros")
        if cat not in categories:
            categories[cat] = {"income": 0, "expense": 0}
        if t.get("type") == "income":
            categories[cat]["income"] += t.get("amount", 0)
        else:
            categories[cat]["expense"] += t.get("amount", 0)
    methods: dict = {}
    for t in txs_month:
        if t.get("type") == "income":
            m = t.get("payment_method", "Outros")
            methods[m] = methods.get(m, 0) + t.get("amount", 0)
    all_txs = await db.transactions.find({}, {"_id": 0}).sort("date", -1).to_list(30)

    def brl(v):
        return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

    buf = BytesIO()
    doc_pdf = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20*mm, rightMargin=20*mm, topMargin=20*mm, bottomMargin=20*mm)
    styles = getSampleStyleSheet()
    green = HexColor("#2d6a4f")
    gray  = HexColor("#6b7280")
    white = HexColor("#ffffff")
    light = HexColor("#f0faf4")
    dark_green = HexColor("#1b4332")
    title_style   = ParagraphStyle("Title", parent=styles["Normal"], fontSize=20, textColor=dark_green, spaceAfter=4, fontName="Helvetica-Bold")
    sub_style     = ParagraphStyle("Sub",   parent=styles["Normal"], fontSize=10, textColor=gray, spaceAfter=12)
    section_style = ParagraphStyle("Sec",   parent=styles["Normal"], fontSize=12, textColor=dark_green, spaceBefore=14, spaceAfter=6, fontName="Helvetica-Bold")

    def make_table(data, col_widths, header_bg=green):
        t = Table(data, colWidths=col_widths, repeatRows=1)
        t.setStyle([
            ("BACKGROUND",     (0, 0), (-1, 0), header_bg),
            ("TEXTCOLOR",      (0, 0), (-1, 0), white),
            ("FONTNAME",       (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",       (0, 0), (-1, -1), 9),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, light]),
            ("GRID",           (0, 0), (-1, -1), 0.4, HexColor("#d1fae5")),
            ("VALIGN",         (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING",     (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING",  (0, 0), (-1, -1), 5),
            ("LEFTPADDING",    (0, 0), (-1, -1), 8),
            ("RIGHTPADDING",   (0, 0), (-1, -1), 8),
        ])
        return t

    story = []
    story.append(Paragraph("Relatório Financeiro", title_style))
    story.append(Paragraph(f"Gerado em {now.strftime('%d/%m/%Y às %H:%M')} • Referência: {month_label}", sub_style))
    story.append(Paragraph("Resumo do Mês Atual", section_style))
    story.append(make_table([["Indicador", "Valor"], ["Entradas", brl(income)], ["Saídas", brl(expense)], ["Lucro Líquido", brl(profit)]], [doc_pdf.width * 0.6, doc_pdf.width * 0.4]))
    story.append(Spacer(1, 8))
    story.append(Paragraph("Evolução Mensal (últimos 6 meses)", section_style))
    ev_data = [["Mês", "Entradas", "Saídas", "Lucro"]]
    for row in monthly_data:
        ev_data.append([row[0], brl(row[1]), brl(row[2]), brl(row[3])])
    w4 = doc_pdf.width / 4
    story.append(make_table(ev_data, [w4, w4, w4, w4]))
    story.append(Spacer(1, 8))
    story.append(Paragraph("Movimentações por Categoria (mês atual)", section_style))
    cat_data = [["Categoria", "Entradas", "Saídas"]]
    for cat, v in categories.items():
        cat_data.append([cat, brl(v["income"]), brl(v["expense"])])
    if len(cat_data) == 1:
        cat_data.append(["Sem dados", "-", "-"])
    w3 = doc_pdf.width / 3
    story.append(make_table(cat_data, [w3, w3, w3]))
    story.append(Spacer(1, 8))
    story.append(Paragraph("Entradas por Forma de Pagamento (mês atual)", section_style))
    pay_data = [["Forma de Pagamento", "Total"]]
    for method, total in methods.items():
        pay_data.append([method, brl(total)])
    if len(pay_data) == 1:
        pay_data.append(["Sem dados", "-"])
    story.append(make_table(pay_data, [doc_pdf.width * 0.6, doc_pdf.width * 0.4]))
    story.append(Spacer(1, 8))
    story.append(Paragraph("Últimas Transações (até 30)", section_style))
    tx_rows = [["Data", "Descrição", "Categoria", "Pagamento", "Tipo", "Valor"]]
    for t in all_txs:
        tx_rows.append([t.get("date", ""), t.get("description", "")[:35], t.get("category", ""), t.get("payment_method", ""), "Entrada" if t.get("type") == "income" else "Saída", brl(t.get("amount", 0))])
    if len(tx_rows) == 1:
        tx_rows.append(["-", "Nenhuma transação", "-", "-", "-", "-"])
    story.append(make_table(tx_rows, [20*mm, 55*mm, 28*mm, 25*mm, 18*mm, 24*mm]))
    doc_pdf.build(story)
    buf.seek(0)
    filename = f"relatorio_financeiro_{now.strftime('%Y%m%d')}.pdf"
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename={filename}"})

# ==================== PACIENTES ====================

@api_router.get("/patients")
async def get_patients(current_user: dict = Depends(get_current_user)):
    return await db.patients.find({}, {"_id": 0}).sort("name", 1).to_list(1000)

@api_router.post("/patients")
async def create_patient(patient: dict, current_user: dict = Depends(get_current_user)):
    patient["id"] = str(uuid.uuid4())
    patient["consent_signed"] = False
    patient["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.patients.insert_one(patient)
    patient.pop("_id", None)
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

# ==================== PRONTUÁRIO (MEDICAL RECORDS) ====================
# ✅ Rotas específicas ANTES das genéricas para evitar conflito

@api_router.get("/medical-records/patient/{patient_id}/export")
async def export_medical_records(patient_id: str, current_user: dict = Depends(get_current_user)):
    """Exporta todos os prontuários de um paciente em JSON (LGPD)."""
    patient = await db.patients.find_one({"id": patient_id}, {"_id": 0})
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    records = await db.medical_records.find({"patient_id": patient_id}, {"_id": 0}).sort("date", -1).to_list(500)
    return {
        "patient": patient,
        "medical_records": records,
        "export_date": datetime.now(timezone.utc).isoformat(),
        "lgpd_notice": "Dados exportados conforme LGPD - Lei nº 13.709/2018"
    }

@api_router.delete("/medical-records/patient/{patient_id}/all")
async def delete_all_patient_records(patient_id: str, current_user: dict = Depends(get_current_user)):
    """Exclui todos os prontuários de um paciente (direito LGPD de exclusão)."""
    await db.medical_records.delete_many({"patient_id": patient_id})
    return {"message": "Todos os prontuários excluídos"}

@api_router.get("/medical-records/patient/{patient_id}")
async def get_records(patient_id: str, current_user: dict = Depends(get_current_user)):
    return await db.medical_records.find({"patient_id": patient_id}, {"_id": 0}).sort("date", -1).to_list(500)

@api_router.post("/medical-records")
async def create_medical_record(record: dict, current_user: dict = Depends(get_current_user)):
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
    doc.pop("_id", None)
    return doc

@api_router.put("/medical-records/{record_id}")
async def update_medical_record(record_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    data = await request.json()
    # Faz upload apenas das fotos que ainda são base64 (novas); mantém URLs do R2 já existentes
    pb = [upload_to_r2(p, "prontuarios") if p.startswith("data:image") else p for p in data.get("photos_before", [])]
    pa = [upload_to_r2(p, "prontuarios") if p.startswith("data:image") else p for p in data.get("photos_after", [])]
    data["photos_before"] = pb
    data["photos_after"] = pa
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    data["updated_by"] = current_user.get("name", "")
    result = await db.medical_records.update_one({"id": record_id}, {"$set": data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Prontuário não encontrado")
    return {"message": "Prontuário atualizado"}

@api_router.delete("/medical-records/{record_id}")
async def delete_medical_record(record_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.medical_records.delete_one({"id": record_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Prontuário não encontrado")
    return {"message": "Prontuário excluído"}

# ==================== AGENDA & PROCEDIMENTOS ====================

@api_router.get("/appointments")
async def get_appointments(date: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {"date": date} if date else {}
    return await db.appointments.find(query, {"_id": 0}).sort([("date", 1), ("time", 1)]).to_list(1000)

@api_router.post("/appointments")
async def create_appointment(appo: dict, current_user: dict = Depends(get_current_user)):
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

# ✅ /appointments/summary ANTES de /appointments/{appointment_id}
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
    return {"whatsapp_url": build_whatsapp_url(phone, message), "phone": phone, "message": message}

@api_router.post("/appointments/{appointment_id}/complete")
async def complete_appointment(appointment_id: str, current_user: dict = Depends(get_current_user)):
    await db.appointments.update_one({"id": appointment_id}, {"$set": {"status": "completed"}})
    return {"message": "Atendimento concluído"}

@api_router.delete("/appointments/{appointment_id}")
async def delete_appointment(appointment_id: str, current_user: dict = Depends(get_current_user)):
    await db.appointments.delete_one({"id": appointment_id})
    return {"message": "Agendamento excluído"}

@api_router.get("/procedures")
async def get_procedures(current_user: dict = Depends(get_current_user)):
    return await db.procedures.find({}, {"_id": 0}).sort("name", 1).to_list(200)

@api_router.post("/procedures")
async def create_procedure(proc: dict, current_user: dict = Depends(get_current_user)):
    proc["id"] = str(uuid.uuid4())
    await db.procedures.insert_one(proc)
    proc.pop("_id", None)
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
    product.pop("_id", None)
    return product

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

# ==================== REPORTS ====================

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
    return {"total_products": total_products, "total_quantity": total_quantity, "expiring_count": expiring_count, "low_stock_count": low_stock_count, "recent_movements": movements}

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

# ==================== AUTH ====================

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
    doc = {"email": email, "password_hash": hash_password(password), "name": name, "role": "user", "active": True, "created_at": datetime.now(timezone.utc).isoformat()}
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

# ==================== SETTINGS ====================

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

# ==================== PATIENTS EXTRAS ====================

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
    return {"patient": patient, "appointments": appointments, "export_date": datetime.now(timezone.utc).isoformat(), "lgpd_notice": "Dados exportados conforme LGPD"}

@api_router.post("/patients/{patient_id}/consent")
async def sign_consent(patient_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    await db.patients.update_one({"id": patient_id}, {"$set": {"consent_signed": True, "consent_date": datetime.now(timezone.utc).isoformat()}})
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

# ==================== DASHBOARD PACIENTES ====================

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
    birthdays = await get_birthday_alerts()
    botox = await get_botox_alerts()
    inactive = await get_inactive_alerts()
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

# ==================== ADMIN USERS ====================

async def get_admin_user(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acesso negado. Somente administradores.")
    return user

@api_router.get("/admin/users")
async def get_all_users(current_user: dict = Depends(get_admin_user)):
    users = await db.users.find({}, {"password_hash": 0}).to_list(1000)
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
    doc = {"email": data["email"].lower(), "password_hash": hash_password(data["password"]), "name": data["name"], "role": data.get("role", "user"), "active": True, "created_at": datetime.now(timezone.utc).isoformat()}
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
    user_agent = request.headers.get("user-agent", "")
    await db.consents.update_one({"token": token}, {"$set": {
        "status": "signed",
        "signed_at": datetime.now(timezone.utc).isoformat(),
        "cpf": data.get("cpf"),
        "signature_image": data.get("signature_image"),
        "latitude": data.get("latitude"),
        "longitude": data.get("longitude"),
        "user_agent": user_agent
    }})
    await db.patients.update_one({"id": consent.get("patient_id")}, {"$set": {"consent_signed": True, "consent_date": datetime.now(timezone.utc).isoformat()}})
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
    settings = await db.settings.find_one({"type": "clinic"}, {"_id": 0})
    clinic_name = settings.get("clinic_name", "Nossa Clínica") if settings else "Nossa Clínica"
    procedure_name = procedure.get("name") if procedure else data.get("procedure_name", "Procedimento")
    base_url = os.environ.get("FRONTEND_URL", "https://app.drguilhermeferraz.com")
    signing_link = f"{base_url}/assinar/{token}"
    patient_name = patient.get("name", "")
    tmpl = await db.message_templates.find_one({"type": "consent_link", "active": True}, {"_id": 0})
    if not tmpl:
        default_tmpl_msg = (
            "Ola {nome}! Tudo bem?\n\nInformamos que o documento Termo de Consentimento "
            "para o procedimento de {procedimento} ja esta disponivel para sua assinatura digital.\n\n"
            "Para visualizar e assinar, acesse o link: > {link}\n\n"
            "Atencao: Por questoes de seguranca, este link expira em 48 horas.\n\n"
            "Caso tenha qualquer duvida, nossa equipe esta pronta para te ajudar!\n\n"
            "Atenciosamente,\nEquipe {clinica}."
        )
        await db.message_templates.update_one(
            {"id": "consent_link"},
            {"$set": {"id": "consent_link", "name": "Termo de Consentimento (WhatsApp)", "type": "consent_link", "active": True, "message": default_tmpl_msg}},
            upsert=True
        )
        tmpl_message = default_tmpl_msg
    else:
        tmpl_message = tmpl.get("message", "")
    message = tmpl_message.replace("{nome}", patient_name).replace("{procedimento}", procedure_name).replace("{link}", signing_link).replace("{clinica}", clinic_name)
    phone = patient.get("phone", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if phone and not phone.startswith("55"):
        phone = "55" + phone
    whatsapp_url = build_whatsapp_url(phone, message)
    doc = {
        "token": token,
        "patient_id": data.get("patient_id"),
        "patient_name": patient_name,
        "patient_cpf": patient.get("cpf", ""),
        "procedure_id": data.get("procedure_id"),
        "procedure_name": procedure_name,
        "consent_text": data.get("consent_text", ""),
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.get("name")
    }
    await db.consents.insert_one(doc)
    doc.pop("_id", None)
    return {"token": token, "link": signing_link, "whatsapp_url": whatsapp_url, "message": message, **doc}

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
        story += [Spacer(1, 12), Paragraph(f"Assinado em: {consent['signed_at']}", styles["Normal"])]
    doc_pdf.build(story)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=consentimento_{token[:8]}.pdf"})

# ==================== INCLUSÃO DAS ROTAS ====================

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

    if not master_email or not master_password:
        print("⚠️  ADMIN_EMAIL ou ADMIN_PASSWORD não definidos. Admin master ignorado.")
        return

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
        print(f"✅ Admin master criado: {master_email}")
    else:
        # Apenas garante role=admin e active=True, SEM re-hashear a senha
        await db.users.update_one({"email": master_email}, {
            "$set": {"role": "admin", "active": True}
        })
