# PRD - Sistema de Gestão - Clínica de Estética

## Problem Statement
Sistema completo para clínica de estética com prontuário eletrônico com LGPD, termos de consentimento editáveis, assinatura digital remota via WhatsApp, PDF com papel timbrado e QR Code.

## Architecture
- **Backend**: FastAPI + MongoDB + ReportLab (PDF) + qrcode
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Auth**: JWT httpOnly cookies (bcrypt)

## What's Been Implemented

### Original (Fases 1-3) - Estoque, Agenda, CRM, LGPD, WhatsApp, Dashboard, Admin

### Fase 4 - Termos de Consentimento Editáveis por Procedimento
### Fase 5 - Assinatura Digital Remota via WhatsApp
### Fase 6 - PDF com Papel Timbrado + Polling
### Fase 7 - Papel Timbrado nas Configurações do CRM + Imagem de Fundo PNG

### Fase 8 - Prontuário Eletrônico com LGPD (Jan 2026)
- **Backend**: Coleção `medical_records` com CRUD completo
  - POST /api/medical-records - Criar prontuário
  - GET /api/medical-records/patient/{patient_id} - Listar prontuários
  - GET /api/medical-records/{record_id} - Detalhes
  - PUT /api/medical-records/{record_id} - Atualizar
  - DELETE /api/medical-records/{record_id} - Excluir
  - GET /api/medical-records/patient/{patient_id}/export - Exportar LGPD
  - DELETE /api/medical-records/patient/{patient_id}/all - Excluir tudo LGPD
- **Campos**: Procedimento, data, queixa principal, anotações clínicas, diagnóstico, plano de tratamento, técnicas utilizadas, produtos aplicados, observações, fotos antes/depois, notas de evolução, próxima sessão
- **Frontend**: Página /prontuario com seleção de paciente, timeline de prontuários, criação/edição/visualização com fotos
- **LGPD**: Exportar dados, excluir todos os prontuários, auditoria de criação/atualização
- **Menu**: "Prontuário" adicionado no menu lateral do CRM

## Backlog
- [ ] Relatórios financeiros (P2)
- [ ] Audit logs (P2)
