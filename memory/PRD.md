# PRD - Sistema de Gestão de Clínica Estética

## Visão Geral
Sistema completo de gestão para clínicas estéticas com módulos de Estoque, Agenda, CRM, Financeiro e Administração.

**Repositório:** https://github.com/GuilhermeFerrazz/SISTEMACLINICA.git  
**Preview URL:** https://finance-reports-tab.preview.emergentagent.com

---

## Arquitetura
- **Frontend:** React.js + Tailwind CSS + shadcn/ui + Recharts
- **Backend:** FastAPI (Python) + MongoDB
- **Storage:** Cloudflare R2
- **Auth:** JWT (cookies httpOnly)

---

## Tarefas Concluídas

### 2026-04-05 — Lock/Unlock do Drag-and-Drop do menu
- Botão `✎ Editar` no header MÓDULOS — padrão travado, sem grips visíveis
- Ao clicar: botão vira `✓ Concluído` verde + banner de instrução + grips pulsantes + submenus recolhidos
- Após soltar (drop): **auto-trava** com delay de 600ms
- Clicando `Concluído`: trava manualmente a qualquer momento
- Testes: 100% ✅

### 2026-04-05 — Drag-and-drop para reordenar seções do menu
- Seções (Estoque, Agenda, CRM, Financeiro) reordenáveis via HTML5 DnD
- Persistência em localStorage ['sidebar-section-order']
- Admin fixo em SISTEMA (não draggable)

### 2026-04-05 — Bug espaço vazio corrigido
- Causa: flex-1 + ml-X com sidebar fixed. Fix: block + pl-X

### 2026-04-05 — Sidebar maior + Responsividade
- Desktop 280px | Tablet icon-rail 64px | Mobile topbar + drawer + bottom nav

### 2026-04-05 — Redesign UI completo
- ThemeContext dark/light, CSS variables, Dashboard modernizado, PatientsDashboard redesenhado

### 2026-04-04 — Finance Reports + PDF Export
- FinanceReports.js com gráficos recharts
- Endpoint /api/finance/reports/export-pdf com reportlab

---

## Backlog P1
- Filtro de período nos relatórios financeiros
- Redesign páginas de listagem (CRM, Produtos, Movimentações)
- Badge de alertas no sidebar (CRM, Agenda)
