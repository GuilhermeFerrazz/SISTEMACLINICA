# Sistema Clínica — PRD

## Problema original (Jan 2026)
Usuário (Dr. Guilherme Ferraz) tem um sistema clínica baseado em React + FastAPI + MongoDB e pediu para conectar os menus em um fluxo contínuo: do agendamento → tela de consulta com todos os campos do prontuário, cronômetro automático medindo a duração da consulta, baixa de produtos do estoque, orçamento + pagamento integrados, e gerar recibo em PDF (estilo termo de consentimento).

## Personas
- Cirurgião-dentista / médico esteta (usuário principal): agenda paciente, atende, faz prontuário, dá baixa em estoque, recebe pagamento e emite recibo — tudo numa única tela.

## Requisitos centrais (estáticos)
- Stack: FastAPI + Motor (Mongo), React 19 + craco + Tailwind + shadcn
- Auth: JWT em cookies HTTPOnly (já existente)
- Storage de imagens: Cloudflare R2 (já existente)
- PDFs: reportlab usando `letterhead_config` das settings (igual termo de consentimento)

## Implementado nesta iteração (23/Jun/2026)

### Backend (`/app/backend/server.py`)
- `MedicalRecordCreate` ganhou: `appointment_id`, `consultation_started_at`, `consultation_ended_at`, `consultation_duration_seconds`, `payment_discount`
- `POST /api/medical-records`: quando `appointment_id` está presente, marca o agendamento como `completed` e referencia `record_id`
- Corrigido bug crítico de identificação: produtos são gravados com `qr_code_id` — agora `find_one`/`update_one` usam `$or` em `qr_code_id` ou `id`. Sem essa correção a baixa de estoque ficava silenciosa.
- Novo endpoint `GET /api/appointments/{appointment_id}` para carregar dados do agendamento na tela de consulta
- Novo endpoint `GET /api/medical-records/{record_id}/receipt-pdf` para gerar recibo em PDF
- Nova função `build_receipt_pdf(...)` usando o mesmo layout do termo de consentimento (timbrado + cabeçalho da clínica + texto de quitação + assinatura)

### Frontend
- `App.js`: nova rota `/atendimento/agenda/:appointmentId`
- `Agenda.js`: botão "Concluir" trocado por "Iniciar Atendimento" (testid `start-consultation-button-{id}`) que navega para `/atendimento/agenda/{id}`
- `Atendimento.js` reescrito:
  - detecta modo (agenda vs paciente direto)
  - cronômetro automático no header (`consultation-timer`), pulsando enquanto a consulta está aberta
  - 5 abas: Anamnese, Procedimento, Fotos (antes/depois), Produtos (baixa de estoque), Orçamento (preço, desconto, pagamento)
  - todos os campos do prontuário: `chief_complaint`, `clinical_notes`, `diagnosis`, `treatment_plan`, `techniques_used`, `observations`, `evolution_notes`, `next_session_notes`, `next_session_date`
  - upload de fotos com compressão automática (1200px max, JPEG 70%)
  - ao finalizar: salva, mostra dialog de sucesso com duração + total, botão para baixar recibo PDF e voltar para agenda

### Testes (`/app/backend/tests/test_consultation_flow.py`)
- 8/8 passando (cobertura: list/get appointment, get 404, products, full flow com baixa de estoque + transação financeira + appointment completed, PDF gerado, PDF 404, cleanup)

## Status
- Fluxo Agenda → Consulta → Finalizar com recibo PDF: **completo e testado**
- Baixa automática de estoque: **corrigida e validada**
- Lançamento financeiro automático: **funcionando**
- Cronômetro: **funcionando** (auto-start no mount, auto-stop no save)

## Backlog (P1/P2)
- P1: na agenda, mostrar nos agendamentos `completed` um botão "Ver Atendimento" ligando ao record criado
- P2: incluir duração da consulta no recibo PDF
- P2: incluir lista de produtos utilizados no recibo PDF
- P2: split de `server.py` (3500+ linhas) em routers (auth, agenda, prontuario, financeiro)
- P2: padronizar `id` vs `qr_code_id` no schema de produtos

## Test credentials
Ver `/app/memory/test_credentials.md`
