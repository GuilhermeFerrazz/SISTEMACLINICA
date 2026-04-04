# PRD - Sistema de Gestão de Clínica Estética

## Visão Geral
Sistema completo de gestão para clínicas estéticas com módulos de Estoque, Agenda, CRM, Financeiro e Administração.

**Repositório:** https://github.com/GuilhermeFerrazz/SISTEMACLINICA.git  
**Deploy Vercel:** https://sistemaclinica-eta.vercel.app

---

## Arquitetura
- **Frontend:** React.js + Tailwind CSS + shadcn/ui + Recharts
- **Backend:** FastAPI (Python) + MongoDB
- **Storage:** Cloudflare R2 (fotos de prontuário, logos)
- **Auth:** JWT (cookies httpOnly, refresh token)
- **Preview URL:** https://finance-reports-tab.preview.emergentagent.com

---

## Módulos Implementados

### Estoque
- Dashboard com estatísticas (produtos, vencimentos, estoque baixo)
- CRUD de Produtos com QR Code
- Movimentações (entrada/saída)
- Relatórios de consumo e produtos vencendo
- Scanner QR
- Configurações

### Agenda
- Gestão de agendamentos
- Configurações (procedimentos, horários)
- Integração WhatsApp para confirmações

### CRM
- Cadastro de pacientes
- Prontuário eletrônico com fotos (antes/depois)
- Dashboard de pacientes
- Alertas: Aniversários, Retorno Botox, Pacientes Inativos
- Termo de consentimento digital (assinatura + link WhatsApp)
- Configurações de templates de mensagem

### Financeiro
- `/financeiro` → **Fluxo de Caixa** (Finance.js): lista de transações, nova transação, resumo mensal
- `/financeiro/relatorios` → **Relatórios** (FinanceReports.js): gráficos de evolução mensal, por categoria, por forma de pagamento

### Administração
- Gestão de usuários (admin)

---

## Tarefas Concluídas

### 2026-04-04 — Exportação de PDF nos Relatórios Financeiros
- Adicionado botão **"Exportar PDF"** na página `/financeiro/relatorios`
- Novo endpoint `GET /api/finance/reports/export-pdf` que gera PDF completo com reportlab:
  - KPIs do mês (entradas, saídas, lucro líquido)
  - Tabela de evolução mensal (6 meses)
  - Movimentações por categoria
  - Entradas por forma de pagamento
  - Últimas 30 transações
- Download automático via blob no frontend
- Testes: 100% backend e frontend ✅

### 2026-04-04 — Aba Relatórios Financeiros (separação de rotas)
- **Problema:** `/financeiro/relatorios` apontava para o mesmo componente `Finance` (sem diferenciação)
- **Solução:**
  1. Criado `FinanceReports.js` com gráficos recharts (evolução mensal, por categoria, por forma de pagamento)
  2. Atualizado `App.js`: rota `/financeiro/relatorios` → `FinanceReports`
  3. Adicionados 3 endpoints no backend:
     - `GET /api/finance/reports/monthly` — evolução 6 meses
     - `GET /api/finance/reports/by-category` — receitas/despesas por categoria
     - `GET /api/finance/reports/by-payment` — entradas por forma de pagamento
- **Testes:** 100% backend e frontend ✅

---

## Backlog / Próximas Tarefas

### P0 (Crítico)
- Nenhum item crítico pendente

### P1 (Alta prioridade)
- Filtro de período nos Relatórios Financeiros (não apenas mês atual)
- Exportar relatório financeiro em PDF

### P2 (Média prioridade)
- Comparação de meses nos relatórios
- Dashboard unificado com KPIs de todos os módulos
- Notificações push para alertas CRM

### Backlog
- App mobile (React Native)
- Integração com sistemas de pagamento
