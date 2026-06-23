# =============================================================================
# backend/server.py — PDF FIXES
# Apply these changes to fix:
#   1. Consent PDF now uses letterhead_config (header color, clinic name,
#      CRO, address, background image, font sizes, margins, footer text)
#   2. Finance report PDF endpoint restored with proper table formatting
#   3. Finance report sub-endpoints restored (/monthly, /by-category, /by-payment)
#
# Instructions:
#   STEP 1 — In server.py, find the line:
#               @api_router.get("/consent/pdf/{token}")
#            Paste the HELPER FUNCTION (build_consent_pdf) RIGHT ABOVE it,
#            then REPLACE the old get_consent_pdf function body.
#
#   STEP 2 — Find:   @api_router.delete("/finance/transactions/{id}")
#            Paste all FINANCE REPORT ENDPOINTS right AFTER that function.
# =============================================================================


# ███████████████████████████████████████████████████████████████████████████
# STEP 1A — HELPER FUNCTION
# Paste this ABOVE the @api_router.get("/consent/pdf/{token}") line
# ███████████████████████████████████████████████████████████████████████████

async def build_consent_pdf(consent: dict, settings: dict):
    """Renders a consent PDF respecting the clinic letterhead_config from DB."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.colors import HexColor, black, Color
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
    )
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
    from reportlab.lib import colors

    lh = (settings or {}).get("letterhead_config", {})

    # Margins
    ml = lh.get("margin_left",   20) * mm
    mr = lh.get("margin_right",  20) * mm
    mt = lh.get("margin_top",    15) * mm
    mb = lh.get("margin_bottom", 15) * mm

    # Header color
    raw_color = lh.get("header_color", "#1a3a1a")
    try:    h_color = HexColor(raw_color)
    except: h_color = HexColor("#1a3a1a")

    # Font sizes
    fs_title    = lh.get("font_size_title",    16)
    fs_subtitle = lh.get("font_size_subtitle", 10)
    fs_section  = lh.get("font_size_section",  11)
    fs_body     = lh.get("font_size_body",     9.5)
    fs_small    = lh.get("font_size_small",    8)
    fs_legal    = lh.get("font_size_legal",    7.5)

    # Spacing
    sp_header  = lh.get("spacing_after_header",     3) * mm
    sp_title   = lh.get("spacing_after_title",      4) * mm
    sp_section = lh.get("spacing_after_section",    2) * mm
    sp_between = lh.get("spacing_between_sections", 5) * mm

    # Texts
    footer_text = lh.get("footer_text",
        "Documento com validade juridica conforme Lei 14.063/2020 e MP 2.200-2/2001")
    bg_data     = lh.get("background_image", "")
    clinic_name = (settings or {}).get("clinic_name", "Clinica")
    cro         = lh.get("cro",     "")
    cnpj        = lh.get("cnpj",    "")
    address_val = lh.get("address", "")
    email_val   = lh.get("email",   "")

    def _bg_footer(c, d):
        """Draw background + footer on every page."""
        if bg_data and bg_data.startswith("data:image"):
            try:
                import base64 as _b64, tempfile, os as _os
                _, enc = bg_data.split(",", 1)
                ext = ".png" if "png" in bg_data[:30] else ".jpg"
                tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
                tmp.write(_b64.b64decode(enc)); tmp.close()
                c.saveState()
                c.drawImage(tmp.name, 0, 0, width=A4[0], height=A4[1],
                            preserveAspectRatio=False, mask="auto")
                c.setFillColor(Color(1, 1, 1, alpha=0.55))
                c.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
                c.restoreState()
                _os.unlink(tmp.name)
            except Exception:
                pass
        c.saveState()
        c.setFont("Helvetica", fs_legal)
        c.setFillColor(colors.grey)
        bot = mb - 2 * mm
        c.line(ml, bot, A4[0] - mr, bot)
        c.drawCentredString(A4[0] / 2, bot - 5 * mm, footer_text)
        c.restoreState()

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
        leftMargin=ml, rightMargin=mr,
        topMargin=mt, bottomMargin=mb + 12 * mm)

    _styles = getSampleStyleSheet()
    def sty(name, **kw):
        return ParagraphStyle(name, parent=_styles["Normal"], **kw)

    s_clinic  = sty("cln", fontSize=fs_title,    textColor=h_color, fontName="Helvetica-Bold", alignment=TA_CENTER, spaceAfter=1*mm)
    s_sub     = sty("sub", fontSize=fs_subtitle, textColor=h_color, alignment=TA_CENTER, spaceAfter=0.5*mm)
    s_addr    = sty("adr", fontSize=fs_small,    textColor=colors.grey, alignment=TA_CENTER)
    s_title   = sty("ttl", fontSize=fs_title,    fontName="Helvetica-Bold", alignment=TA_CENTER, spaceAfter=sp_title)
    s_proc    = sty("prc", fontSize=fs_subtitle, textColor=h_color, fontName="Helvetica-Bold", alignment=TA_CENTER, spaceAfter=sp_title)
    s_section = sty("sec", fontSize=fs_section,  textColor=h_color, fontName="Helvetica-Bold", spaceBefore=sp_between, spaceAfter=sp_section)
    s_body    = sty("bdy", fontSize=fs_body,     alignment=TA_JUSTIFY, leading=fs_body*1.45, spaceAfter=sp_section)
    s_label   = sty("lbl", fontSize=fs_body,     textColor=h_color, fontName="Helvetica-Bold")
    s_value   = sty("val", fontSize=fs_body)

    story = []

    # Clinic header
    story.append(Paragraph(clinic_name, s_clinic))
    if cro:       story.append(Paragraph(f"CRO: {cro}", s_sub))
    if cnpj:      story.append(Paragraph(f"CNPJ: {cnpj}", s_sub))
    if address_val: story.append(Paragraph(address_val, s_addr))
    if email_val: story.append(Paragraph(email_val, s_addr))
    story.append(Spacer(1, sp_header))
    story.append(HRFlowable(width="100%", thickness=1, color=h_color))
    story.append(Spacer(1, sp_title))

    # Document title
    story.append(Paragraph("TERMO DE CONSENTIMENTO", s_title))
    story.append(Paragraph(f"Procedimento: {consent.get('procedure_name','')}", s_proc))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey))
    story.append(Spacer(1, sp_title))

    # Patient data
    story.append(Paragraph("DADOS DO PACIENTE", s_section))
    tdata = [[Paragraph("Paciente:", s_label), Paragraph(consent.get("patient_name",""), s_value)]]
    if consent.get("patient_cpf"):
        tdata.append([Paragraph("CPF:", s_label), Paragraph(consent["patient_cpf"], s_value)])
    if consent.get("signed_at"):
        try:
            from datetime import datetime as _dt
            sfmt = _dt.fromisoformat(consent["signed_at"].replace("Z","+00:00")).strftime("%d/%m/%Y %H:%M")
        except Exception:
            sfmt = str(consent["signed_at"])
        tdata.append([Paragraph("Assinado em:", s_label), Paragraph(sfmt, s_value)])
    pt = Table(tdata, colWidths=[38*mm, None])
    pt.setStyle(TableStyle([
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
        ("BOTTOMPADDING", (0,0), (-1,-1), 3),
        ("TOPPADDING",    (0,0), (-1,-1), 3),
        ("LINEBELOW",     (0,-1),(-1,-1), 0.4, colors.lightgrey),
    ]))
    story.append(pt)
    story.append(Spacer(1, sp_between))

    # Consent body text
    story.append(Paragraph("TEXTO DO TERMO", s_section))
    for para in (consent.get("consent_text","") or "").split("\n"):
        para = para.strip()
        if para:
            story.append(Paragraph(para, s_body))

    # Signature image (if available)
    if consent.get("signature_image"):
        story.append(Spacer(1, sp_between * 2))
        story.append(Paragraph("ASSINATURA DIGITAL", s_section))
        try:
            import base64 as _b64, tempfile, os as _os
            from reportlab.platypus import Image as RLImage
            sig = consent["signature_image"]
            if sig.startswith("data:image"):
                _, enc = sig.split(",", 1)
                tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
                tmp.write(_b64.b64decode(enc)); tmp.close()
                story.append(RLImage(tmp.name, width=80*mm, height=25*mm))
                _os.unlink(tmp.name)
        except Exception:
            pass
    elif consent.get("signed_at"):
        story.append(Spacer(1, sp_between * 3))
        story.append(HRFlowable(width="60%", thickness=0.5, color=black))
        story.append(Paragraph("Assinatura do Paciente",
            sty("sig_lbl", fontSize=fs_small, alignment=TA_CENTER)))

    # Legal notice
    story.append(Spacer(1, sp_between))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Este documento foi gerado eletronicamente e possui validade juridica conforme "
        "a Lei 14.063/2020 e MP 2.200-2/2001. IP, geolocalizacao, CPF, data/hora e "
        "navegador foram registrados para autenticacao.",
        sty("leg", fontSize=fs_legal, textColor=colors.grey, alignment=TA_CENTER)
    ))

    doc.build(story, onFirstPage=_bg_footer, onLaterPages=_bg_footer)
    buf.seek(0)
    return buf


# ███████████████████████████████████████████████████████████████████████████
# STEP 1B — REPLACE THE OLD get_consent_pdf function body with this:
# ███████████████████████████████████████████████████████████████████████████

@api_router.get("/consent/pdf/{token}")
async def get_consent_pdf(token: str):
    consent = await db.consents.find_one({"token": token}, {"_id": 0})
    if not consent:
        raise HTTPException(status_code=404, detail="Consentimento nao encontrado")
    settings = await db.settings.find_one({"type": "clinic"}, {"_id": 0}) or {}
    buf = await build_consent_pdf(consent, settings)
    return StreamingResponse(
        buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=termo_consentimento_{token[:8]}.pdf"}
    )


# ███████████████████████████████████████████████████████████████████████████
# STEP 2 — PASTE THESE AFTER @api_router.delete("/finance/transactions/{id}")
# These endpoints were accidentally deleted. Add them back.
# ███████████████████████████████████████████████████████████████████████████

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
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.colors import HexColor, white
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
    )
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT
    from reportlab.lib import colors

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
    s_sub     = sty("fs",  fontSize=9,   textColor=colors.grey, alignment=TA_CENTER, spaceAfter=6*mm)
    s_section = sty("fsc", fontSize=11,  textColor=h_color, fontName="Helvetica-Bold", spaceBefore=6*mm, spaceAfter=3*mm)
    s_bold    = sty("fb",  fontSize=8.5, fontName="Helvetica-Bold")
    s_bold_r  = sty("fbr", fontSize=8.5, fontName="Helvetica-Bold", alignment=TA_RIGHT)
    s_cell    = sty("fc",  fontSize=8.5)
    green_r   = sty("gr",  fontSize=8.5, alignment=TA_RIGHT, textColor=HexColor("#16a34a"), fontName="Helvetica-Bold")
    red_r     = sty("rr",  fontSize=8.5, alignment=TA_RIGHT, textColor=HexColor("#dc2626"), fontName="Helvetica-Bold")

    story = []
    story.append(Paragraph(clinic_name, s_title))
    story.append(Paragraph(f"Relatorio Financeiro — {now.strftime('%m/%Y')}", s_sub))
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
        ("BOX",           (0,0), (-1,-1),  0.5, colors.lightgrey),
        ("INNERGRID",     (0,0), (-1,-1),  0.3, colors.lightgrey),
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
            ("INNERGRID",     (0,0), (-1,-1), 0.25, colors.lightgrey),
            ("BOX",           (0,0), (-1,-1), 0.5,  colors.grey),
            ("TOPPADDING",    (0,0), (-1,-1), 4),
            ("BOTTOMPADDING", (0,0), (-1,-1), 4),
            ("LEFTPADDING",   (0,0), (-1,-1), 5),
            ("RIGHTPADDING",  (0,0), (-1,-1), 5),
            ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ]))
        story.append(tbl)

    story.append(Spacer(1, 8*mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        f"Gerado em {now.strftime('%d/%m/%Y as %H:%M')} por {current_user.get('name','Sistema')}",
        sty("fn", fontSize=7, textColor=colors.grey, alignment=TA_CENTER)
    ))
    doc.build(story)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=relatorio_financeiro_{now.strftime('%Y%m')}.pdf"})
