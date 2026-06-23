# Tests for Agenda → Consulta flow (medical-records + appointments + receipt PDF + stock + finance)
import os
import requests
import pytest
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://consultation-hub-18.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

PATIENT_ID = "ebe9fb62-6a66-4447-a3a9-d695500e3e9d"
PROCEDURE_ID = "40b4d7e4-68a5-479e-a5f8-464a8928d261"
APPOINTMENT_ID = "716e83f6-71f6-422f-a44b-9a6d0cea0e79"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "admin@test.com", "password": "admin123"})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


def test_appointments_list_today(session):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    r = session.get(f"{API}/appointments", params={"date": today})
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    ids = [a.get("id") for a in data]
    assert APPOINTMENT_ID in ids, f"seed appointment not found in {ids}"


def test_get_appointment_by_id(session):
    r = session.get(f"{API}/appointments/{APPOINTMENT_ID}")
    assert r.status_code == 200, r.text
    apt = r.json()
    assert apt["id"] == APPOINTMENT_ID
    assert apt["patient_id"] == PATIENT_ID


def test_get_appointment_404(session):
    r = session.get(f"{API}/appointments/nonexistent-id-xxx")
    assert r.status_code == 404


def test_products_botox_exists(session):
    r = session.get(f"{API}/products")
    assert r.status_code == 200
    products = r.json()
    botox = [p for p in products if "botox" in (p.get("name") or "").lower()]
    assert len(botox) >= 1, "Botox Allergan not seeded"
    # Save initial quantity for later test
    pytest.botox_initial = float(botox[0]["quantity"])
    pytest.botox_product_id = botox[0]["id"]
    pytest.botox_product_name = botox[0]["name"]


def test_create_medical_record_full_flow(session):
    """POST /medical-records with appointment_id should:
       1) create record
       2) deduct stock for products_used
       3) create finance transaction
       4) mark appointment as completed
    """
    # Ensure appointment is scheduled before test - reset if needed
    session.put(f"{API}/appointments/{APPOINTMENT_ID}", json={"status": "scheduled"})

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    qty_used = 50.0
    payload = {
        "patient_id": PATIENT_ID,
        "procedure_id": PROCEDURE_ID,
        "procedure_name": "Botox",
        "date": today,
        "chief_complaint": "TEST_queixa",
        "clinical_notes": "TEST_notes",
        "diagnosis": "TEST_diag",
        "treatment_plan": "TEST_plan",
        "techniques_used": "TEST_tech",
        "observations": "TEST_obs",
        "evolution_notes": "TEST_evo",
        "next_session_notes": "TEST_next",
        "anamnese": {
            "queixa_principal": "TEST_q",
            "gestante_lactante": False,
            "uso_anticoagulantes": False,
            "herpes_labial": False,
            "fumante": False,
            "foto_autorizada": True,
        },
        "products_used": [{
            "product_id": pytest.botox_product_id,
            "product_name": pytest.botox_product_name,
            "quantity": qty_used,
            "unit": "UI",
        }],
        "payment_amount": 1500.0,
        "payment_method": "Pix",
        "payment_status": "paid",
        "appointment_id": APPOINTMENT_ID,
        "consultation_started_at": datetime.now(timezone.utc).isoformat(),
        "consultation_ended_at": datetime.now(timezone.utc).isoformat(),
        "consultation_duration_seconds": 300,
    }
    r = session.post(f"{API}/medical-records", json=payload)
    assert r.status_code == 200, r.text
    rec = r.json()
    assert rec.get("id")
    assert rec.get("appointment_id") == APPOINTMENT_ID
    pytest.created_record_id = rec["id"]

    # 1) verify record persisted
    r2 = session.get(f"{API}/medical-records/{rec['id']}")
    assert r2.status_code == 200
    assert r2.json()["patient_id"] == PATIENT_ID

    # 2) verify appointment marked completed
    r3 = session.get(f"{API}/appointments/{APPOINTMENT_ID}")
    assert r3.status_code == 200
    assert r3.json().get("status") == "completed", f"appointment not completed: {r3.json()}"

    # 3) verify stock deducted
    r4 = session.get(f"{API}/products")
    assert r4.status_code == 200
    botox_now = next((p for p in r4.json() if p["id"] == pytest.botox_product_id), None)
    assert botox_now is not None
    expected = pytest.botox_initial - qty_used
    actual = float(botox_now["quantity"])
    assert abs(actual - expected) < 0.001, (
        f"Stock not deducted properly. initial={pytest.botox_initial}, used={qty_used}, "
        f"expected={expected}, actual={actual}"
    )

    # 4) verify finance transaction created
    r5 = session.get(f"{API}/finance/transactions")
    assert r5.status_code == 200
    txns = r5.json()
    matching = [t for t in txns if t.get("record_id") == rec["id"]]
    assert len(matching) >= 1, "Finance transaction not created"
    assert matching[0]["type"] == "income"
    assert float(matching[0]["amount"]) == 1500.0
    assert matching[0]["payment_method"] == "Pix"


def test_receipt_pdf(session):
    rec_id = getattr(pytest, "created_record_id", None)
    assert rec_id, "no record id from previous test"
    r = session.get(f"{API}/medical-records/{rec_id}/receipt-pdf")
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert len(r.content) > 1000, f"PDF too small: {len(r.content)}"
    assert r.content[:4] == b"%PDF", "Not a valid PDF header"


def test_receipt_pdf_404(session):
    r = session.get(f"{API}/medical-records/nonexistent-record/receipt-pdf")
    assert r.status_code == 404


def test_cleanup(session):
    """Cleanup created record + restore appointment + restore stock."""
    rec_id = getattr(pytest, "created_record_id", None)
    if rec_id:
        session.delete(f"{API}/medical-records/{rec_id}")
        # Remove related finance transaction
        txns = session.get(f"{API}/finance/transactions").json()
        for t in txns:
            if t.get("record_id") == rec_id:
                session.delete(f"{API}/finance/transactions/{t['id']}")
    # Reset appointment
    session.put(f"{API}/appointments/{APPOINTMENT_ID}", json={"status": "scheduled"})
    # Restore product stock
    if getattr(pytest, "botox_product_id", None):
        session.put(f"{API}/products/{pytest.botox_product_id}", json={"quantity": pytest.botox_initial})
