# Tests for "Ver Atendimento" backend flow (view record dialog in Agenda)
# Covers: completed appointment has record_id, GET /medical-records/{id}, fallback via
# GET /medical-records/patient/{patient_id}, and receipt PDF endpoint.
import os
import requests
import pytest
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://consultation-hub-18.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

PATIENT_ID = "ebe9fb62-6a66-4447-a3a9-d695500e3e9d"
PROCEDURE_ID = "40b4d7e4-68a5-479e-a5f8-464a8928d261"
COMPLETED_APPT_ID = "a57561a8-708b-416d-9b3c-39b1b895ff60"
RECORD_ID = "9f5e631b-2fe7-4550-8800-58d4ee268ceb"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "admin@test.com", "password": "admin123"})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


# 1) Completed appointment exists today with record_id set
def test_completed_appointment_today_has_record(session):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    r = session.get(f"{API}/appointments", params={"date": today})
    assert r.status_code == 200
    apts = r.json()
    completed = next((a for a in apts if a["id"] == COMPLETED_APPT_ID), None)
    assert completed is not None, f"completed appt not in today's list: {[a['id'] for a in apts]}"
    assert completed["status"] == "completed"
    assert completed.get("record_id") == RECORD_ID, f"record_id mismatch: {completed.get('record_id')}"
    assert completed["time"] == "15:00"
    assert completed["patient_name"] == "Maria Silva"


# 2) GET /medical-records/{id} returns full record with all expected fields
def test_get_medical_record_full_fields(session):
    r = session.get(f"{API}/medical-records/{RECORD_ID}")
    assert r.status_code == 200, r.text
    rec = r.json()
    assert rec["id"] == RECORD_ID
    assert rec["appointment_id"] == COMPLETED_APPT_ID
    assert rec["patient_id"] == PATIENT_ID
    assert rec["procedure_name"] == "Botox"
    assert rec["chief_complaint"] == "Rugas testa"
    assert rec["clinical_notes"] == "Linhas finas evidentes"
    assert rec["diagnosis"] == "Hipercinesia muscular frontal"
    assert rec["treatment_plan"] == "Botox 50 UI testa"
    assert rec["payment_amount"] == 1500.0
    assert rec["payment_method"] == "Pix"
    assert rec["payment_status"] == "paid"
    assert rec["consultation_duration_seconds"] == 1320
    assert isinstance(rec.get("products_used"), list)
    assert len(rec["products_used"]) == 1
    prod = rec["products_used"][0]
    assert prod["product_name"] == "Botox Allergan"
    assert prod["quantity"] == 50.0
    assert prod["unit"] == "UI"
    assert prod.get("batch_number") == "LOT001"


# 3) Fallback path: GET /medical-records/patient/{patient_id} returns the record with appt_id
def test_get_records_by_patient_fallback(session):
    r = session.get(f"{API}/medical-records/patient/{PATIENT_ID}")
    assert r.status_code == 200
    records = r.json()
    assert isinstance(records, list)
    match = next((rc for rc in records if rc["id"] == RECORD_ID), None)
    assert match is not None, f"record not in patient records list: {[r['id'] for r in records]}"
    assert match["appointment_id"] == COMPLETED_APPT_ID
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    assert match["date"] == today


# 4) Receipt PDF endpoint returns a valid PDF
def test_receipt_pdf_valid(session):
    r = session.get(f"{API}/medical-records/{RECORD_ID}/receipt-pdf")
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert r.content[:4] == b"%PDF", f"not a PDF: {r.content[:50]}"
    assert len(r.content) > 1000


# 5) 404 for invalid record id
def test_get_record_404(session):
    r = session.get(f"{API}/medical-records/nonexistent-xxx")
    assert r.status_code == 404


# 6) Receipt PDF 404 for invalid record
def test_receipt_pdf_404(session):
    r = session.get(f"{API}/medical-records/nonexistent-xxx/receipt-pdf")
    assert r.status_code == 404
