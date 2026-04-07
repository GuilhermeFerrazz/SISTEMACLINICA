import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Users, Plus, Search, User, Phone, Mail, Calendar, MapPin, 
  FileText, AlertCircle, Shield, Download, Trash2, History,
  CheckCircle, Clock, Pencil, Heart, ClipboardCheck, X, Syringe, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { assertHttps } from '@/lib/utils';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CONSENT_TEXT = `TERMO DE CONSENTIMENTO PARA TRATAMENTO DE DADOS PESSOAIS

Em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018), declaro que:

1. AUTORIZO o tratamento dos meus dados pessoais para fins de:
   - Agendamento e realização de procedimentos estéticos
   - Histórico médico e acompanhamento de tratamentos
   - Contato via telefone, e-mail ou WhatsApp
   - Envio de lembretes de consultas

2. ESTOU CIENTE de que:
   - Meus dados serão armazenados de forma segura
   - Posso solicitar a exclusão dos meus dados a qualquer momento
   - Posso solicitar uma cópia de todos os meus dados armazenados
   - Meus dados não serão compartilhados com terceiros sem autorização

3. CONFIRMO que todas as informações fornecidas são verdadeiras e me responsabilizo por sua veracidade.

Ao assinar este termo, declaro ter lido e concordado com todas as condições acima.`;

const CRM = () => {
  const [patients, setPatients] = useState([]);
  const [filteredPatients, setFilteredPatients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientHistory, setPatientHistory] = useState(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isConsentOpen, setIsConsentOpen] = useState(false);
  const [editData, setEditData] = useState({});
  const [procedures, setProcedures] = useState([]);
  const [selectedProcedureId, setSelectedProcedureId] = useState('');
  const [consentText, setConsentText] = useState('');
  const [isEditingConsent, setIsEditingConsent] = useState(false);
  const [sendingConsent, setSendingConsent] = useState(false);
  const [consentLinks, setConsentLinks] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    cpf: '',
    birth_date: '',
    address: '',
    medical_history: '',
    allergies: '',
    notes: ''
  });

  useEffect(() => {
    fetchPatients();
    fetchProcedures();
  }, []);

  useEffect(() => {
    if (searchTerm) {
      const filtered = patients.filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.phone.includes(searchTerm) ||
        (p.cpf && p.cpf.includes(searchTerm))
      );
      setFilteredPatients(filtered);
    } else {
      setFilteredPatients(patients);
    }
  }, [searchTerm, patients]);

  const fetchPatients = async () => {
    try {
      const { data } = await axios.get(`${API}/patients`, { withCredentials: true });
      setPatients(data);
      setFilteredPatients(data);
    } catch (error) {
      console.error('Error fetching patients:', error);
      toast.error('Erro ao carregar pacientes');
    } finally {
      setLoading(false);
    }
  };

  const fetchProcedures = async () => {
    try {
      const { data } = await axios.get(`${API}/procedures`, { withCredentials: true });
      setProcedures(data);
    } catch (error) {
      // não crítico
    }
  };

  const fetchConsentLinks = async (patientId) => {
    try {
      const { data } = await axios.get(`${API}/consent/pending/${patientId}`, { withCredentials: true });
      setConsentLinks(data);
    } catch (error) {
      setConsentLinks([]);
    }
  };

  const handleDownloadPDF = async (token) => {
    try {
      const response = await axios.get(`${API}/consent/pdf/${token}`, {
        withCredentials: true,
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `termo_consentimento_${token.slice(0, 8)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('PDF baixado com sucesso!');
    } catch (error) {
      toast.error('Erro ao baixar PDF');
    }
  };

  const fetchPatientHistory = async (patientId) => {
    try {
      const { data } = await axios.get(`${API}/patients/${patientId}/history`, { withCredentials: true });
      setPatientHistory(data);
    } catch (error) {
      console.error('Error fetching patient history:', error);
    }
  };

  // ─── Criação de paciente — contém CPF, histórico médico, alergias ───────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      assertHttps(API); // 🔒 guard PII
      await axios.post(`${API}/patients`, formData, { withCredentials: true });
      toast.success('Paciente cadastrado com sucesso!');
      setIsCreateOpen(false);
      setFormData({ name: '', phone: '', email: '', cpf: '', birth_date: '', address: '', medical_history: '', allergies: '', notes: '' });
      fetchPatients();
    } catch (error) {
      console.error('Error creating patient:', error);
      toast.error(error.message.startsWith('Bloqueado:') ? error.message : 'Erro ao cadastrar paciente');
    }
  };

  // ─── Edição de paciente — mesmos campos sensíveis ───────────────────────────
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPatient) return;
    try {
      assertHttps(API); // 🔒 guard PII
      await axios.put(`${API}/patients/${selectedPatient.id}`, editData, { withCredentials: true });
      toast.success('Paciente atualizado com sucesso!');
      setIsEditOpen(false);
      fetchPatients();
    } catch (error) {
      console.error('Error updating patient:', error);
      toast.error(error.message.startsWith('Bloqueado:') ? error.message : 'Erro ao atualizar paciente');
    }
  };

  const handleViewPatient = async (patient) => {
    setSelectedPatient(patient);
    await fetchPatientHistory(patient.id);
    fetchConsentLinks(patient.id);
    setIsViewOpen(true);
  };

  const handleEditPatient = (patient) => {
    setSelectedPatient(patient);
    setEditData({
      name: patient.name,
      phone: patient.phone,
      email: patient.email || '',
      cpf: patient.cpf || '',
      birth_date: patient.birth_date || '',
      address: patient.address || '',
      medical_history: patient.medical_history || '',
      allergies: patient.allergies || '',
      notes: patient.notes || ''
    });
    setIsEditOpen(true);
  };

  const handleDeletePatient = async (patientId) => {
    if (!window.confirm('⚠️ ATENÇÃO (LGPD): Isso excluirá PERMANENTEMENTE todos os dados do paciente, incluindo histórico de atendimentos. Deseja continuar?')) return;
    try {
      await axios.delete(`${API}/patients/${patientId}`, { withCredentials: true });
      toast.success('Paciente e dados excluídos (LGPD)');
      setIsViewOpen(false);
      fetchPatients();
    } catch (error) {
      toast.error('Erro ao excluir paciente');
    }
  };

  const handleExportData = async (patientId) => {
    try {
      const { data } = await axios.get(`${API}/patients/${patientId}/export`, { withCredentials: true });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `paciente_${patientId}_dados_lgpd.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Dados exportados com sucesso (LGPD)');
    } catch (error) {
      toast.error('Erro ao exportar dados');
    }
  };

  const handleProcedureChange = (procedureId) => {
    setSelectedProcedureId(procedureId);
    if (procedureId === 'lgpd_geral') {
      setConsentText(CONSENT_TEXT);
    } else {
      const proc = procedures.find(p => p.id === procedureId);
      if (proc?.consent_template) {
        setConsentText(proc.consent_template);
      } else {
        setConsentText(CONSENT_TEXT);
        toast.warning('Este procedimento não tem termo específico. Configure em CRM > Configurações > Termos.');
      }
    }
    setIsEditingConsent(false);
  };

  const handleOpenConsent = () => {
    setSelectedProcedureId('');
    setConsentText(CONSENT_TEXT);
    setIsEditingConsent(false);
    setIsConsentOpen(true);
  };

  const handleRefreshConsent = async () => {
    if (!selectedPatient?.id) return;
    fetchConsentLinks(selectedPatient.id);
    try {
      const { data } = await axios.get(`${API}/patients/${selectedPatient.id}`, { withCredentials: true });
      setSelectedPatient(data);
      toast.success('Status atualizado!');
    } catch {}
  };

  // ─── Gera link de assinatura e envia via WhatsApp ───────────────────────────
  const handleSignConsent = async () => {
    if (!selectedPatient) return;
    if (!selectedProcedureId) {
      toast.error('Selecione um procedimento para o termo de consentimento');
      return;
    }
    if (!consentText?.trim()) {
      toast.error('O texto do termo de consentimento está vazio');
      return;
    }
    setSendingConsent(true);
    try {
      assertHttps(API); // 🔒 guard PII — link de assinatura LGPD
      const payload = {
        patient_id: selectedPatient.id,
        procedure_id: selectedProcedureId === 'lgpd_geral' ? '' : selectedProcedureId,
        procedure_name: selectedProcedureId === 'lgpd_geral'
          ? 'Termo LGPD Geral'
          : (procedures.find(p => p.id === selectedProcedureId)?.name || ''),
        consent_text: consentText
      };
      const { data } = await axios.post(`${API}/consent/generate-link`, payload, { withCredentials: true });
      if (data.whatsapp_url) {
        window.open(data.whatsapp_url, '_blank');
      }
      toast.success('Link de assinatura gerado! Envie pelo WhatsApp.');
      setIsConsentOpen(false);
      setSelectedProcedureId('');
      setConsentText(CONSENT_TEXT);
      setIsEditingConsent(false);
      // Atualiza lista de termos enviados
      fetchConsentLinks(selectedPatient.id);
      const { data: updated } = await axios.get(`${API}/patients/${selectedPatient.id}`, { withCredentials: true });
      setSelectedPatient(updated);
    } catch (error) {
      toast.error(error.message?.startsWith('Bloqueado:') ? error.message : 'Erro ao gerar link de consentimento');
    } finally {
      setSendingConsent(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR');
  };

  const formatCPF = (cpf) => {
    if (!cpf) return '-';
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed': return <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">Concluído</span>;
      case 'cancelled': return <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">Cancelado</span>;
      case 'confirmed': return <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">Confirmado</span>;
      default: return <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">Agendado</span>;
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-6 md:p-8 lg:p-12">
          <div className="animate-pulse space-y-6">
            <div className="h-10 bg-muted rounded w-1/4"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-32 bg-muted rounded-xl"></div>
              ))}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div data-testid="crm-page" className="p-6 md:p-8 lg:p-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-foreground mb-2">
              CRM
            </h1>
            <p className="text-base text-muted-foreground">
              Fichas de pacientes e histórico
            </p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button
                data-testid="create-patient-button"
                className="bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-6 rounded-lg font-medium gap-2"
              >
                <Plus className="w-5 h-5" />
                Novo Paciente
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Cadastrar Novo Paciente</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="col-span-1 sm:col-span-2">
                    <Label>Nome Completo *</Label>
                    <Input
                      data-testid="patient-name-input"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Telefone (WhatsApp) *</Label>
                    <Input
                      data-testid="patient-phone-input"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="(11) 99999-9999"
                      required
                    />
                  </div>
                  <div>
                    <Label>E-mail</Label>
                    <Input
                      data-testid="patient-email-input"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>CPF</Label>
                    <Input
                      data-testid="patient-cpf-input"
                      value={formData.cpf}
                      onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                      placeholder="000.000.000-00"
                    />
                  </div>
                  <div>
                    <Label>Data de Nascimento</Label>
                    <Input
                      data-testid="patient-birth-date-input"
                      type="date"
                      value={formData.birth_date}
                      onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <Label>Endereço</Label>
                    <Input
                      data-testid="patient-address-input"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <Label>Histórico Médico</Label>
                    <Textarea
                      data-testid="patient-medical-history-input"
                      value={formData.medical_history}
                      onChange={(e) => setFormData({ ...formData, medical_history: e.target.value })}
                      placeholder="Doenças, medicamentos em uso, cirurgias anteriores..."
                      rows={3}
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <Label className="flex items-center gap-2 text-destructive">
                      <AlertCircle className="w-4 h-4" />
                      Alergias
                    </Label>
                    <Textarea
                      data-testid="patient-allergies-input"
                      value={formData.allergies}
                      onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                      placeholder="Liste todas as alergias conhecidas..."
                      rows={2}
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <Label>Observações</Label>
                    <Textarea
                      data-testid="patient-notes-input"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={2}
                    />
                  </div>
                </div>
                <Button
                  data-testid="patient-submit-button"
                  type="submit"
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Cadastrar Paciente
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <Card className="bg-card border border-border/60 rounded-xl p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              data-testid="patient-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, telefone ou CPF..."
              className="pl-10"
            />
          </div>
        </Card>

        {/* Patients Grid */}
        {filteredPatients.length === 0 ? (
          <Card className="bg-card border border-border/60 rounded-xl p-12 text-center">
            <Users className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">
              {searchTerm ? 'Nenhum paciente encontrado' : 'Nenhum paciente cadastrado'}
            </p>
            {!searchTerm && (
              <Button onClick={() => setIsCreateOpen(true)} className="bg-primary text-primary-foreground">
                <Plus className="w-4 h-4 mr-2" />
                Cadastrar Primeiro Paciente
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPatients.map((patient) => (
              <Card
                key={patient.id}
                data-testid={`patient-card-${patient.id}`}
                className="bg-card border border-border/60 rounded-xl p-5 hover:shadow-md transition-all duration-200 cursor-pointer"
                onClick={() => handleViewPatient(patient)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium text-foreground">{patient.name}</h3>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {patient.phone}
                      </p>
                    </div>
                  </div>
                  {patient.consent_signed ? (
                    <Shield className="w-5 h-5 text-green-500" title="LGPD: Consentimento assinado" />
                  ) : (
                    <Shield className="w-5 h-5 text-amber-500" title="LGPD: Pendente assinatura" />
                  )}
                </div>
                
                {patient.allergies && (
                  <div className="flex items-center gap-2 px-2 py-1 rounded bg-destructive/10 text-destructive text-xs mb-2">
                    <AlertCircle className="w-3 h-3" />
                    Alergias registradas
                  </div>
                )}
                
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {patient.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      {patient.email}
                    </span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Patient Detail Dialog */}
        <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden p-0">
            <div className="sticky top-0 bg-card border-b border-border p-6 z-10">
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <span className="block">{selectedPatient?.name}</span>
                      <span className="text-sm font-normal text-muted-foreground">{selectedPatient?.phone}</span>
                    </div>
                  </DialogTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setIsViewOpen(false); handleEditPatient(selectedPatient); }}
                      data-testid="edit-patient-button"
                    >
                      <Pencil className="w-4 h-4 mr-1" />
                      Editar
                    </Button>
                  </div>
                </div>
              </DialogHeader>
            </div>
            
            <ScrollArea className="h-[calc(90vh-180px)]">
              <div className="p-6">
                <Tabs defaultValue="info" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 mb-6">
                    <TabsTrigger value="info">Informações</TabsTrigger>
                    <TabsTrigger value="history">Histórico</TabsTrigger>
                    <TabsTrigger value="lgpd">LGPD</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="info" className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          E-mail
                        </Label>
                        <p className="text-sm">{selectedPatient?.email || '-'}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          CPF
                        </Label>
                        <p className="text-sm">{formatCPF(selectedPatient?.cpf)}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Nascimento
                        </Label>
                        <p className="text-sm">{formatDate(selectedPatient?.birth_date)}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          Endereço
                        </Label>
                        <p className="text-sm">{selectedPatient?.address || '-'}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Heart className="w-3 h-3" />
                        Histórico Médico
                      </Label>
                      <Card className="bg-secondary/30 p-3 rounded-lg">
                        <p className="text-sm whitespace-pre-wrap">{selectedPatient?.medical_history || 'Nenhum histórico registrado'}</p>
                      </Card>
                    </div>
                    
                    {selectedPatient?.allergies && (
                      <div className="space-y-1">
                        <Label className="text-xs text-destructive flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Alergias
                        </Label>
                        <Card className="bg-destructive/10 border-destructive/20 p-3 rounded-lg">
                          <p className="text-sm text-destructive whitespace-pre-wrap">{selectedPatient.allergies}</p>
                        </Card>
                      </div>
                    )}
                    
                    {selectedPatient?.notes && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Observações</Label>
                        <p className="text-sm">{selectedPatient.notes}</p>
                      </div>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="history" className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <History className="w-5 h-5 text-primary" />
                      <h3 className="font-medium">Histórico de Atendimentos</h3>
                    </div>
                    
                    {patientHistory?.appointments && patientHistory.appointments.length > 0 ? (
                      <div className="space-y-3">
                        {patientHistory.appointments.map((apt) => (
                          <Card key={apt.id} className="p-4 border border-border/60">
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <Clock className="w-4 h-4 text-muted-foreground" />
                                  <span className="font-medium">{formatDate(apt.date)} às {apt.time}</span>
                                  {getStatusBadge(apt.status)}
                                </div>
                                <p className="text-sm text-primary">{apt.procedure_name}</p>
                                {apt.notes && <p className="text-xs text-muted-foreground mt-1">"{apt.notes}"</p>}
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <Card className="p-8 text-center border border-border/60">
                        <Calendar className="w-12 h-12 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-muted-foreground">Nenhum atendimento registrado</p>
                      </Card>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="lgpd" className="space-y-4">
                    {/* Ações principais */}
                    <Card className="p-4 border border-border/60">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Shield className={`w-5 h-5 ${selectedPatient?.consent_signed ? 'text-green-500' : 'text-amber-500'}`} />
                          <h3 className="font-medium">Termo de Consentimento (LGPD)</h3>
                        </div>
                        {selectedPatient?.consent_signed ? (
                          <span className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-700">
                            <CheckCircle className="w-3 h-3" />
                            Assinado
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                            <Clock className="w-3 h-3" />
                            Pendente
                          </span>
                        )}
                      </div>

                      {selectedPatient?.consent_signed && (
                        <div className="text-sm text-muted-foreground mb-4 p-2 bg-green-50 rounded-lg">
                          <p>Último assinado em: {selectedPatient.consent_date ? new Date(selectedPatient.consent_date).toLocaleString('pt-BR') : '-'}</p>
                          {selectedPatient.consent_procedure_name && (
                            <p className="text-xs mt-1">Procedimento: {selectedPatient.consent_procedure_name}</p>
                          )}
                        </div>
                      )}

                      {/* Sempre mostrar botão de envio — múltiplos termos permitidos */}
                      <Button
                        onClick={handleOpenConsent}
                        className="w-full bg-primary text-primary-foreground"
                        data-testid="sign-consent-button"
                      >
                        <ClipboardCheck className="w-4 h-4 mr-2" />
                        {selectedPatient?.consent_signed ? 'Enviar Novo Termo por WhatsApp' : 'Enviar Termo por WhatsApp'}
                      </Button>

                      <Button
                        variant="outline"
                        className="w-full mt-2 gap-2"
                        onClick={handleRefreshConsent}
                        data-testid="refresh-consent-status"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Atualizar Status dos Termos
                      </Button>
                    </Card>

                    {/* Histórico de termos enviados */}
                    {consentLinks.length > 0 && (
                      <Card className="p-4 border border-border/60">
                        <h4 className="font-medium mb-3 flex items-center gap-2">
                          <FileText className="w-4 h-4 text-primary" />
                          Termos Enviados ({consentLinks.length})
                        </h4>
                        <div className="space-y-2">
                          {consentLinks.map((link) => (
                            <div
                              key={link.token}
                              className={`flex items-center justify-between p-3 rounded-lg border ${
                                link.status === 'signed'
                                  ? 'bg-green-50 border-green-200'
                                  : link.status === 'expired'
                                  ? 'bg-gray-50 border-gray-200'
                                  : 'bg-amber-50 border-amber-200'
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                    link.status === 'signed'
                                      ? 'bg-green-100 text-green-700'
                                      : link.status === 'expired'
                                      ? 'bg-gray-100 text-gray-600'
                                      : 'bg-amber-100 text-amber-700'
                                  }`}>
                                    {link.status === 'signed' ? '✓ Assinado' : link.status === 'expired' ? 'Expirado' : '⏳ Pendente'}
                                  </span>
                                  <span className="text-sm font-medium truncate">{link.procedure_name || 'Termo Geral'}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Enviado: {new Date(link.created_at).toLocaleString('pt-BR')}
                                  {link.signed_at && (
                                    <span className="text-green-700"> · Assinado: {new Date(link.signed_at).toLocaleString('pt-BR')}</span>
                                  )}
                                </p>
                              </div>
                              {link.status === 'signed' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="ml-3 gap-1 shrink-0 border-green-300 text-green-700 hover:bg-green-100"
                                  onClick={() => handleDownloadPDF(link.token)}
                                  data-testid={`download-pdf-${link.token}`}
                                >
                                  <Download className="w-3 h-3" />
                                  PDF
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </Card>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <Button
                        variant="outline"
                        onClick={() => handleExportData(selectedPatient?.id)}
                        className="gap-2"
                        data-testid="export-data-button"
                      >
                        <Download className="w-4 h-4" />
                        Exportar Dados
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleDeletePatient(selectedPatient?.id)}
                        className="gap-2 text-destructive hover:bg-destructive/10"
                        data-testid="delete-patient-button"
                      >
                        <Trash2 className="w-4 h-4" />
                        Excluir Dados
                      </Button>
                    </div>

                    <Card className="bg-blue-50 border-blue-200 p-4 rounded-lg">
                      <h4 className="text-sm font-medium text-blue-900 mb-2">Direitos do Titular (LGPD)</h4>
                      <ul className="text-xs text-blue-800 space-y-1">
                        <li>• Confirmação e acesso aos dados pessoais</li>
                        <li>• Correção de dados incompletos ou desatualizados</li>
                        <li>• Portabilidade dos dados (exportação)</li>
                        <li>• Eliminação dos dados pessoais</li>
                        <li>• Revogação do consentimento</li>
                      </ul>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        {/* Edit Patient Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Paciente</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditSubmit} className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-1 sm:col-span-2">
                  <Label>Nome Completo</Label>
                  <Input
                    data-testid="edit-patient-name-input"
                    value={editData.name || ''}
                    onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Telefone (WhatsApp)</Label>
                  <Input
                    data-testid="edit-patient-phone-input"
                    value={editData.phone || ''}
                    onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input
                    data-testid="edit-patient-email-input"
                    type="email"
                    value={editData.email || ''}
                    onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label>CPF</Label>
                  <Input
                    value={editData.cpf || ''}
                    onChange={(e) => setEditData({ ...editData, cpf: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Data de Nascimento</Label>
                  <Input
                    type="date"
                    value={editData.birth_date || ''}
                    onChange={(e) => setEditData({ ...editData, birth_date: e.target.value })}
                  />
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <Label>Endereço</Label>
                  <Input
                    value={editData.address || ''}
                    onChange={(e) => setEditData({ ...editData, address: e.target.value })}
                  />
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <Label>Histórico Médico</Label>
                  <Textarea
                    value={editData.medical_history || ''}
                    onChange={(e) => setEditData({ ...editData, medical_history: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <Label className="text-destructive">Alergias</Label>
                  <Textarea
                    value={editData.allergies || ''}
                    onChange={(e) => setEditData({ ...editData, allergies: e.target.value })}
                    rows={2}
                  />
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <Label>Observações</Label>
                  <Textarea
                    value={editData.notes || ''}
                    onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                    rows={2}
                  />
                </div>
              </div>
              <Button
                data-testid="edit-patient-submit-button"
                type="submit"
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Salvar Alterações
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Consent Dialog */}
        <Dialog open={isConsentOpen} onOpenChange={(open) => {
          setIsConsentOpen(open);
          if (!open) {
            setSelectedProcedureId('');
            setConsentText(CONSENT_TEXT);
            setIsEditingConsent(false);
          }
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden p-0">
            <div className="sticky top-0 bg-card border-b border-border p-6 z-10">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  Termo de Consentimento - LGPD
                </DialogTitle>
              </DialogHeader>

              {/* Seletor de Procedimento */}
              <div className="mt-4 space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Syringe className="w-4 h-4 text-primary" />
                  Selecione o Procedimento
                </Label>
                <Select value={selectedProcedureId} onValueChange={handleProcedureChange}>
                  <SelectTrigger data-testid="consent-procedure-select" className="w-full">
                    <SelectValue placeholder="Escolha o procedimento para carregar o termo específico..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lgpd_geral">LGPD - Termo Geral</SelectItem>
                    {procedures.map((proc) => (
                      <SelectItem key={proc.id} value={proc.id}>
                        {proc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <ScrollArea className="h-[45vh] px-6">
              <div className="py-4">
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-sm font-medium text-muted-foreground">
                    {isEditingConsent ? 'Editando o termo de consentimento' : 'Texto do termo de consentimento'}
                    {selectedProcedureId && selectedProcedureId !== 'lgpd_geral' && (() => {
                      const proc = procedures.find(p => p.id === selectedProcedureId);
                      return proc?.consent_template
                        ? <span style={{marginLeft: 8, fontSize: 11, background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 6, fontWeight: 600}}>✓ Termo específico</span>
                        : <span style={{marginLeft: 8, fontSize: 11, background: '#fef9c3', color: '#854d0e', padding: '2px 8px', borderRadius: 6, fontWeight: 600}}>⚠ Sem termo configurado</span>;
                    })()}
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingConsent(!isEditingConsent)}
                    className="gap-1 text-xs h-7"
                    data-testid="toggle-edit-consent-button"
                  >
                    <Pencil className="w-3 h-3" />
                    {isEditingConsent ? 'Visualizar' : 'Editar Texto'}
                  </Button>
                </div>

                {isEditingConsent ? (
                  <Textarea
                    data-testid="consent-text-editor"
                    value={consentText}
                    onChange={(e) => setConsentText(e.target.value)}
                    className="min-h-[300px] font-sans text-sm resize-y"
                    placeholder="Digite o texto do termo de consentimento..."
                  />
                ) : (
                  <Card className="bg-secondary/30 p-4 rounded-lg">
                    <pre className="text-sm whitespace-pre-wrap font-sans">{consentText || CONSENT_TEXT}</pre>
                  </Card>
                )}
              </div>
            </ScrollArea>

            <div className="sticky bottom-0 bg-card border-t border-border p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4 text-primary" />
                  <span>Paciente: <strong>{selectedPatient?.name}</strong></span>
                </div>
                {selectedProcedureId && selectedProcedureId !== 'lgpd_geral' && (
                  <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                    {procedures.find(p => p.id === selectedProcedureId)?.name}
                  </span>
                )}
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setIsConsentOpen(false)}
                  className="flex-1"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancelar
                </Button>
                <Button
                  onClick={handleSignConsent}
                  className="flex-1 bg-primary text-primary-foreground"
                  data-testid="confirm-consent-button"
                  disabled={sendingConsent || !selectedProcedureId}
                >
                  {sendingConsent ? (
                    <>Gerando link...</>
                  ) : (
                    <>
                      <ClipboardCheck className="w-4 h-4 mr-2" />
                      Enviar por WhatsApp
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default CRM;
