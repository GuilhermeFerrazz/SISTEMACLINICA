# ============================================================
# COLE ESTE CÓDIGO NO backend/server.py
# Substitua o endpoint /finance/reports/export-pdf existente
# e adicione as funções auxiliares antes dele.
# ============================================================

# ── Importações adicionais necessárias no topo do server.py ─────────────────
# (já devem existir a maioria — confirme e adicione as que faltam)
# from reportlab.lib.pagesizes import A4
# from reportlab.lib.units import mm
# from reportlab.lib.colors import HexColor, white
# from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
#                                  TableStyle, HRFlowable)
# from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
# from reportlab.lib.enums import TA_CENTER, TA_RIGHT
# from io import BytesIO
# from datetime import datetime

# ── Cores ─────────────────────────────────────────────────────────────────────
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
_PALETTE       = [_C_GREEN_MID, _C_TEAL, _C_GREEN_LIGHT, _C_AMBER,
                  HexColor("#74c69d"), HexColor("#95d5b2")]

_PAGE_W, _PAGE_H = A4
_MARGIN = 18 * mm


def _fmt_brl(value) -> str:
    v = float(value or 0)
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


# ── Custom Flowables ──────────────────────────────────────────────────────────
from reportlab.platypus import Flowable as _Flowable


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
        import math
        c = self.canv
        if not self.data:
            c.setFillColor(_C_GRAY_TEXT)
            c.setFont("Helvetica", 9)
            c.drawCentredString(self._w / 2, self._h / 2, "Sem dados disponíveis")
            return
        pad_l, pad_r, pad_b = 52, 10, 30
        cw = self._w - pad_l - pad_r
        ch = self._h - pad_b - 10
        all_vals = [v for row in self.data for v in row[1:] if v > 0]
        max_val = max(all_vals) if all_vals else 1
        n = len(self.data)
        gw = cw / n
        bw = gw * 0.22
        gap = bw * 0.5
        colors = [_C_GREEN_LIGHT, _C_RED_DARK, _C_BLUE_DARK]
        # Grid
        c.setStrokeColor(_C_GRAY_BORDER)
        c.setLineWidth(0.3)
        for i in range(5):
            y = pad_b + ch * i / 4
            c.line(pad_l, y, pad_l + cw, y)
            val = max_val * i / 4
            c.setFillColor(_C_GRAY_TEXT)
            c.setFont("Helvetica", 6)
            c.drawRightString(pad_l - 3, y - 2, _fmt_brl(val))
        # Bars
        for i, row in enumerate(self.data):
            label = row[0]
            gx = pad_l + i * gw + gw * 0.1
            for j, (val, col) in enumerate(zip(row[1:], colors)):
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
        # Legend
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
        import math
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
            Paragraph(f'<font color="{col.hexval()}">■</font> {label}',
                      PS("lg", fontSize=7, leading=9)),
            Paragraph(pct,         PS("lp", fontSize=7, alignment=TA_RIGHT, leading=9)),
            Paragraph(_fmt_brl(val), PS("lv", fontSize=7, fontName="Helvetica-Bold",
                                         alignment=TA_RIGHT, leading=9, textColor=col)),
        ])
    t = Table(rows, colWidths=[50*mm, 16*mm, 30*mm])
    t.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 2),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 2),
        ("TOPPADDING",    (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LINEBELOW",     (0, 0), (-1, -2), 0.3, _C_GRAY_BORDER),
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
    # Footer
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
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            leftMargin=_MARGIN, rightMargin=_MARGIN,
                            topMargin=26*mm, bottomMargin=16*mm)
    styles = getSampleStyleSheet()
    s_norm  = PS("sn",  fontSize=8,  leading=11)
    s_small = PS("ss",  fontSize=7,  textColor=_C_GRAY_TEXT, leading=10)
    s_ctr   = PS("sc",  fontSize=8,  alignment=TA_CENTER, leading=11)
    s_rt    = PS("sr",  fontSize=8,  alignment=TA_RIGHT,  leading=11)
    story = []

    income  = float(summary.get("monthly_income",  0))
    expense = float(summary.get("monthly_expense", 0))
    profit  = float(summary.get("monthly_profit",  0))
    trans_count = len(transactions)
    inc_count   = sum(1 for t in transactions if t.get("type") == "income")
    avg_ticket  = income / inc_count if inc_count else 0
    now = datetime.now()
    month_name = now.strftime("%B/%Y").capitalize()

    # ── Info strip ──────────────────────────────────────────────────────────────
    info_t = Table([[
        Paragraph(f"<b>Referência:</b> {month_name}", s_norm),
        Paragraph(f"<b>Clínica:</b> {clinic_name}",   s_norm),
        Paragraph(f"<b>Transações:</b> {trans_count}", s_norm),
    ]], colWidths=[(_PAGE_W - 2*_MARGIN) / 3] * 3)
    info_t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), _C_GRAY_BG),
        ("GRID",          (0, 0), (-1, -1), 0.3, _C_GRAY_BORDER),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story += [info_t, Spacer(1, 5*mm)]

    # ── KPI Cards row 1 ─────────────────────────────────────────────────────────
    story.append(_ColorBand("  Resumo do Mes Atual", _C_GREEN_DARK))
    story.append(Spacer(1, 3*mm))
    kpi_w = (_PAGE_W - 2*_MARGIN - 8*mm) / 3
    row1 = Table([[
        _KpiCard("Entradas (mes)",  _fmt_brl(income),  _C_GREEN_MID, _C_GREEN_DARK, kpi_w),
        _KpiCard("Saidas (mes)",    _fmt_brl(expense), _C_RED_DARK,  _C_RED_DARK,   kpi_w),
        _KpiCard("Lucro Liquido",   _fmt_brl(profit),  _C_BLUE_DARK,
                 _C_BLUE_DARK if profit >= 0 else _C_RED_DARK, kpi_w),
    ]], colWidths=[kpi_w, kpi_w, kpi_w])
    row1.setStyle(TableStyle([
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4*mm),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story += [row1, Spacer(1, 3*mm)]

    # ── KPI Cards row 2 ─────────────────────────────────────────────────────────
    row2 = Table([[
        _KpiCard("No de Transacoes", str(trans_count),    _C_AMBER,     _C_AMBER,     kpi_w, 16*mm),
        _KpiCard("Entradas (qtd.)",  str(inc_count),      _C_GREEN_MID, _C_GREEN_DARK,kpi_w, 16*mm),
        _KpiCard("Ticket Medio",     _fmt_brl(avg_ticket), _C_TEAL,     _C_GREEN_DARK,kpi_w, 16*mm),
    ]], colWidths=[kpi_w, kpi_w, kpi_w])
    row2.setStyle(TableStyle([
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4*mm),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story += [row2, Spacer(1, 5*mm)]

    # ── Bar Chart ───────────────────────────────────────────────────────────────
    story.append(_ColorBand("  Evolucao Mensal (ultimos 6 meses)", _C_GREEN_MID))
    story.append(Spacer(1, 3*mm))
    chart_data = [(m.get("month",""), float(m.get("income",0)),
                   float(m.get("expense",0)), float(m.get("profit",0)))
                  for m in monthly_data]
    story.append(_MiniBarChart(chart_data, width=_PAGE_W - 2*_MARGIN, height=60*mm))
    story.append(Spacer(1, 3*mm))

    # ── Monthly table ───────────────────────────────────────────────────────────
    if monthly_data:
        hdr = [Paragraph(f"<b>{h}</b>", s_ctr if i == 0 else PS("h", fontSize=8, alignment=TA_RIGHT, leading=11))
               for i, h in enumerate(["Mes","Entradas","Saidas","Lucro","Margem"])]
        rows_m = [hdr]
        for m in monthly_data:
            inc = float(m.get("income", 0)); exp = float(m.get("expense", 0)); prf = float(m.get("profit", 0))
            margin = f"{prf/inc*100:.1f}%" if inc else "—"
            pc = "#2d6a4f" if prf >= 0 else "#c1121f"
            rows_m.append([
                Paragraph(m.get("month",""), s_norm),
                Paragraph(_fmt_brl(inc),  PS("ri", fontSize=8, alignment=TA_RIGHT, textColor=_C_GREEN_MID)),
                Paragraph(_fmt_brl(exp),  PS("re", fontSize=8, alignment=TA_RIGHT, textColor=_C_RED_DARK)),
                Paragraph(f'<font color="{pc}"><b>{_fmt_brl(prf)}</b></font>', PS("rp", fontSize=8, alignment=TA_RIGHT)),
                Paragraph(margin,          PS("rm", fontSize=8, alignment=TA_RIGHT, textColor=_C_GRAY_TEXT)),
            ])
        cw = [(_PAGE_W - 2*_MARGIN) / 5] * 5
        mt = Table(rows_m, colWidths=cw)
        mt.setStyle(TableStyle([
            ("BACKGROUND",    (0,0),(-1,0), _C_GREEN_DARK),
            ("TEXTCOLOR",     (0,0),(-1,0), HexColor("#ffffff")),
            ("FONTSIZE",      (0,0),(-1,0), 8),
            ("ROWBACKGROUNDS",(0,1),(-1,-1),[HexColor("#ffffff"), _C_GRAY_BG]),
            ("GRID",          (0,0),(-1,-1), 0.3, _C_GRAY_BORDER),
            ("LEFTPADDING",   (0,0),(-1,-1), 5), ("RIGHTPADDING", (0,0),(-1,-1), 5),
            ("TOPPADDING",    (0,0),(-1,-1), 4), ("BOTTOMPADDING",(0,0),(-1,-1), 4),
            ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
        ]))
        story.append(mt)
    story.append(Spacer(1, 6*mm))

    # ── Pie charts: Category + Payment ──────────────────────────────────────────
    story.append(_ColorBand("  Entradas por Categoria & Forma de Pagamento", _C_GREEN_MID))
    story.append(Spacer(1, 3*mm))

    cat_sl  = [(c.get("category","?"), float(c.get("income",0)), _PALETTE[i % len(_PALETTE)])
               for i, c in enumerate(by_category) if float(c.get("income",0)) > 0]
    pay_sl  = [(p.get("method","?"),   float(p.get("total",0)),  _PALETTE[i % len(_PALETTE)])
               for i, p in enumerate(by_payment)  if float(p.get("total",0))  > 0]
    cat_tot = sum(v for _,v,_ in cat_sl) or 1
    pay_tot = sum(v for _,v,_ in pay_sl) or 1
    sw = (_PAGE_W - 2*_MARGIN - 6*mm) / 2

    cat_col = [_PieChart(cat_sl, sw, 65*mm), _legend_table(cat_sl, cat_tot, styles)] if cat_sl else [Paragraph("Sem dados.", s_small)]
    pay_col = [_PieChart(pay_sl, sw, 65*mm), _legend_table(pay_sl, pay_tot, styles)] if pay_sl else [Paragraph("Sem dados.", s_small)]

    pie_t = Table([[cat_col, pay_col]], colWidths=[sw, sw])
    pie_t.setStyle(TableStyle([
        ("VALIGN", (0,0),(-1,-1), "TOP"),
        ("LEFTPADDING",  (0,0),(-1,-1), 0), ("RIGHTPADDING", (0,0),(0,-1), 3*mm),
        ("TOPPADDING",   (0,0),(-1,-1), 0), ("BOTTOMPADDING",(0,0),(-1,-1), 0),
        ("LINEBEFORE",   (1,0),(1,-1), 0.3, _C_GRAY_BORDER),
    ]))
    story += [pie_t, Spacer(1, 6*mm)]

    # ── Expenses by category ─────────────────────────────────────────────────────
    exp_cats = [(c.get("category","?"), float(c.get("expense",0)))
                for c in by_category if float(c.get("expense",0)) > 0]
    if exp_cats:
        story.append(_ColorBand("  Saidas por Categoria", _C_RED_DARK))
        story.append(Spacer(1, 3*mm))
        tot_exp = sum(v for _,v in exp_cats) or 1
        exp_rows = [[Paragraph(f"<b>{h}</b>", PS("eh", fontSize=8,
                    alignment=TA_RIGHT if i > 0 else TA_CENTER, leading=11))
                    for i, h in enumerate(["Categoria","Valor","%","Distribuicao"])]]
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
            ("BACKGROUND",    (0,0),(-1,0), _C_RED_DARK),
            ("TEXTCOLOR",     (0,0),(-1,0), HexColor("#ffffff")),
            ("FONTSIZE",      (0,0),(-1,0), 8),
            ("ROWBACKGROUNDS",(0,1),(-1,-1),[HexColor("#ffffff"), _C_RED_LIGHT]),
            ("GRID",          (0,0),(-1,-1), 0.3, _C_GRAY_BORDER),
            ("LEFTPADDING",   (0,0),(-1,-1), 6), ("RIGHTPADDING",(0,0),(-1,-1), 6),
            ("TOPPADDING",    (0,0),(-1,-1), 4), ("BOTTOMPADDING",(0,0),(-1,-1), 4),
            ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
        ]))
        story += [et, Spacer(1, 6*mm)]

    # ── Transactions table ───────────────────────────────────────────────────────
    story.append(_ColorBand("  Ultimas Transacoes (ate 50)", _C_BLUE_DARK))
    story.append(Spacer(1, 3*mm))
    trans_show = transactions[:50]
    if trans_show:
        t_hdr = [Paragraph(f"<b>{h}</b>", PS("th", fontSize=8,
                 alignment=TA_CENTER if i in (0,4) else (TA_RIGHT if i==5 else None) or 0, leading=11))
                 for i, h in enumerate(["Data","Descricao","Categoria","Pagamento","Tipo","Valor"])]
        t_rows = [t_hdr]
        for t in trans_show:
            is_inc  = t.get("type") == "income"
            val     = float(t.get("amount", 0))
            vstr    = f'{"+" if is_inc else "-"} {_fmt_brl(val)}'
            vc      = "#2d6a4f" if is_inc else "#c1121f"
            tipo    = "Entrada" if is_inc else "Saida"
            raw_d   = t.get("date","")
            try:
                date_str = datetime.strptime(raw_d, "%Y-%m-%d").strftime("%d/%m/%Y")
            except Exception:
                date_str = raw_d
            t_rows.append([
                Paragraph(date_str,                    s_ctr),
                Paragraph(t.get("description","—")[:38], s_norm),
                Paragraph(t.get("category","—"),        s_small),
                Paragraph(t.get("payment_method","—"),  s_small),
                Paragraph(f'<font color="{vc}"><b>{tipo}</b></font>', PS("tp", fontSize=7, alignment=TA_CENTER)),
                Paragraph(f'<font color="{vc}"><b>{vstr}</b></font>', PS("vp", fontSize=8, alignment=TA_RIGHT)),
            ])
        cw_t = [22*mm, 63*mm, 30*mm, 28*mm, 20*mm, 37*mm]
        tt = Table(t_rows, colWidths=cw_t, repeatRows=1)
        tt.setStyle(TableStyle([
            ("BACKGROUND",    (0,0),(-1,0), _C_BLUE_DARK),
            ("TEXTCOLOR",     (0,0),(-1,0), HexColor("#ffffff")),
            ("FONTSIZE",      (0,0),(-1,0), 8),
            ("ROWBACKGROUNDS",(0,1),(-1,-1),[HexColor("#ffffff"), _C_GRAY_BG]),
            ("GRID",          (0,0),(-1,-1), 0.3, _C_GRAY_BORDER),
            ("LEFTPADDING",   (0,0),(-1,-1), 4), ("RIGHTPADDING",(0,0),(-1,-1), 4),
            ("TOPPADDING",    (0,0),(-1,-1), 3), ("BOTTOMPADDING",(0,0),(-1,-1), 3),
            ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
        ]))
        story.append(tt)
    else:
        story.append(Paragraph("Nenhuma transacao registrada.", s_small))

    story += [Spacer(1, 4*mm), HRFlowable(width="100%", thickness=0.5, color=_C_GRAY_BORDER), Spacer(1, 2*mm)]
    story.append(Paragraph(
        f"Relatorio gerado automaticamente pelo Sistema de Gestao — {clinic_name}  •  "
        f"{datetime.now().strftime('%d/%m/%Y as %H:%M')}",
        PS("fn", fontSize=7, textColor=_C_GRAY_TEXT, alignment=TA_CENTER)
    ))

    doc.build(story, onFirstPage=_on_page, onLaterPages=_on_page)
    buf.seek(0)
    return buf


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT — substitui o antigo /api/finance/reports/export-pdf
# ─────────────────────────────────────────────────────────────────────────────
@api_router.get("/finance/reports/export-pdf")
async def export_finance_pdf(current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    first_day = now.replace(day=1).strftime("%Y-%m-%d")

    # Fetch all needed data in parallel
    transactions = await db.transactions.find({}, {"_id": 0}).sort("date", -1).to_list(1000)
    settings     = await db.settings.find_one({"type": "clinic"}, {"_id": 0}) or {}
    clinic_name  = settings.get("clinic_name", "Clinica Estetica")

    # Summary (current month)
    month_trans = [t for t in transactions if t.get("date","") >= first_day]
    income  = sum(float(t.get("amount", 0)) for t in month_trans if t.get("type") == "income")
    expense = sum(float(t.get("amount", 0)) for t in month_trans if t.get("type") == "expense")
    summary = {"monthly_income": income, "monthly_expense": expense, "monthly_profit": income - expense}

    # Monthly evolution (last 6 months)
    from collections import defaultdict
    monthly_map = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
    for t in transactions:
        raw = t.get("date", "")
        try:
            d = datetime.strptime(raw, "%Y-%m-%d")
            key = d.strftime("%b/%Y").capitalize()
            monthly_map[key]["income"  if t.get("type") == "income" else "expense"] += float(t.get("amount", 0))
        except Exception:
            pass
    # Build last 6 months in order
    monthly_data = []
    for i in range(5, -1, -1):
        from datetime import timedelta
        target = now - timedelta(days=i * 30)
        key = target.strftime("%b/%Y").capitalize()
        data = monthly_map.get(key, {"income": 0, "expense": 0})
        monthly_data.append({
            "month":   key,
            "income":  data["income"],
            "expense": data["expense"],
            "profit":  data["income"] - data["expense"],
        })

    # By category (current month)
    cat_map = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
    for t in month_trans:
        cat = t.get("category", "Outros")
        cat_map[cat]["income"  if t.get("type") == "income" else "expense"] += float(t.get("amount", 0))
    by_category = [{"category": k, "income": v["income"], "expense": v["expense"]} for k, v in cat_map.items()]

    # By payment method (current month)
    pay_map = defaultdict(float)
    for t in month_trans:
        if t.get("type") == "income":
            pay_map[t.get("payment_method", "Outros")] += float(t.get("amount", 0))
    by_payment = [{"method": k, "total": v} for k, v in pay_map.items()]

    # Generate PDF
    buf = _build_finance_pdf(
        monthly_data=monthly_data,
        by_category=by_category,
        by_payment=by_payment,
        summary=summary,
        transactions=transactions,
        clinic_name=clinic_name,
    )

    today = datetime.now().strftime("%Y%m%d")
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=relatorio_financeiro_{today}.pdf"}
    )
