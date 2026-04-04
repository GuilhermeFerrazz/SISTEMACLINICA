import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

def get_auth_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={
        "email": "guilhermeferraz1112@gmail.com",
        "password": "%782870899gG%Sistema"
    })
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return s

class TestExportPDF:
    """Tests for /api/finance/reports/export-pdf endpoint"""

    def test_unauthenticated_returns_401(self):
        r = requests.get(f"{BASE_URL}/api/finance/reports/export-pdf")
        assert r.status_code == 401, f"Expected 401, got {r.status_code}"
        print("PASS: Unauthenticated returns 401")

    def test_authenticated_returns_pdf(self):
        s = get_auth_session()
        r = s.get(f"{BASE_URL}/api/finance/reports/export-pdf")
        assert r.status_code == 200, f"Expected 200, got {r.status_code} {r.text[:200]}"
        content_type = r.headers.get('Content-Type', '')
        assert 'application/pdf' in content_type, f"Expected application/pdf, got {content_type}"
        assert len(r.content) > 0, "PDF content is empty"
        print(f"PASS: size={len(r.content)} bytes, Content-Type={content_type}")

    def test_pdf_valid_magic_bytes(self):
        s = get_auth_session()
        r = s.get(f"{BASE_URL}/api/finance/reports/export-pdf")
        assert r.status_code == 200
        assert r.content[:4] == b'%PDF', f"PDF magic bytes missing, got {r.content[:10]}"
        print("PASS: PDF has valid %PDF magic bytes")
