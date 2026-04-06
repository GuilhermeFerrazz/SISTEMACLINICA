import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Users, Plus, Search, User, Phone, Mail, Calendar, MapPin, 
  FileText, AlertCircle, Shield, Download, Trash2, History,
  CheckCircle, Clock, Pencil, Heart, ClipboardCheck, X
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

  // ─── Assinatura do termo — dado mais sensível do fluxo ──────────────────────
  const handleSignConsent = async () => {
    if (!selectedPatient) return;
    try {
      assertHttps(API); // 🔒 guard PII — assinatura + consentimento LGPD
      await axios.post(`${API}/patients/${selectedPatient.id}/consent`, {
        patient_id: selectedPatient.id,
        consent_text: CONSENT_TEXT,
        signature: `Assinado digitalmente em ${new Date().toLocaleString('pt-BR')}`
      }, { withCredentials: true });
      toast.success('Termo de consentimento assinado com sucesso!');
      setIsConsentOpen(false);
      fetchPatients();
      const { data } = await axios.get(`${API}/patients/${selectedPatient.id}`, { withCredentials: true });
      setSelectedPatient(data);
    } catch (error) {
      console.error('Error signing consent:', error);
      toast.error(error.message.startsWith('Bloqueado:') ? error.message : 'Erro ao assinar termo');
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
                    <Card className="p-4 border border-border/60">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Shield className={`w-5 h-5 ${selectedPatient?.consent_signed ? 'text-green-500' : 'text-amber-500'}`} />
                          <h3 className="font-medium">Termo de Consentimento (LGPD)</h3>
                        </div>
                        {selectedPatient?.consent_signed ? (
                          <span className="flex items-center gap-1 text-sm text-green-600">
                            <CheckCircle className="w-4 h-4" />
                            Assinado
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-sm text-amber-600">
                            <Clock className="w-4 h-4" />
                            Pendente
                          </span>
                        )}
                      </div>
                      
                      {selectedPatient?.consent_signed ? (
                        <div className="text-sm text-muted-foreground">
                          <p>Assinado em: {selectedPatient.consent_date ? new Date(selectedPatient.consent_date).toLocaleString('pt-BR') : '-'}</p>
                        </div>
                      ) : (
                        <Button
                          onClick={() => setIsConsentOpen(true)}
                          className="w-full bg-primary text-primary-foreground"
                          data-testid="sign-consent-button"
                        >
                          <ClipboardCheck className="w-4 h-4 mr-2" />
                          Assinar Termo de Consentimento
                        </Button>
                      )}
                    </Card>
                    
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
        <Dialog open={isConsentOpen} onOpenChange={setIsConsentOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden p-0">
            <div className="sticky top-0 bg-card border-b border-border p-6 z-10">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  Termo de Consentimento - LGPD
                </DialogTitle>
              </DialogHeader>
            </div>
            
            <ScrollArea className="h-[50vh] px-6">
              <div className="py-4">
                <Card className="bg-secondary/30 p-4 rounded-lg">
                  <pre className="text-sm whitespace-pre-wrap font-sans">{CONSENT_TEXT}</pre>
                </Card>
              </div>
            </ScrollArea>
            
            <div className="sticky bottom-0 bg-card border-t border-border p-6 space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="w-4 h-4 text-primary" />
                <span>Paciente: <strong>{selectedPatient?.name}</strong></span>
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
                >
                  <ClipboardCheck className="w-4 h-4 mr-2" />
                  Assinar Digitalmente
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
