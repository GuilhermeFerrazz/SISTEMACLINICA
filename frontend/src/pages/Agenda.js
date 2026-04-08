import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Calendar, Clock, Plus, User, Phone, ChevronLeft, ChevronRight, 
  AlertTriangle, CheckCircle2, XCircle, Package, MessageCircle,
  Sparkles, ClipboardList, Bell, Send, Eye, UserPlus, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Agenda = () => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [procedures, setProcedures] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isQuickPatientOpen, setIsQuickPatientOpen] = useState(false);
  const [quickPatientData, setQuickPatientData] = useState({
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
  const [formData, setFormData] = useState({
    patient_id: '',
    procedure_id: '',
    date: selectedDate,
    time: '09:00',
    notes: ''
  });
  const [whatsappTemplates, setWhatsappTemplates] = useState([]);
  const [isWhatsappOpen, setIsWhatsappOpen] = useState(false);
  const [whatsappAppointment, setWhatsappAppointment] = useState(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [previewMessage, setPreviewMessage] = useState('');
  const [clinicName, setClinicName] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [appointmentsRes, patientsRes, proceduresRes, summaryRes, templatesRes, settingsRes] = await Promise.all([
        axios.get(`${API}/appointments?date=${selectedDate}`, { withCredentials: true }),
        axios.get(`${API}/patients`, { withCredentials: true }),
        axios.get(`${API}/procedures`, { withCredentials: true }),
        axios.get(`${API}/appointments/summary?date=${selectedDate}`, { withCredentials: true }),
        axios.get(`${API}/message-templates`, { withCredentials: true }),
        axios.get(`${API}/settings`, { withCredentials: true })
      ]);
      setAppointments(appointmentsRes.data);
      setPatients(patientsRes.data);
      setProcedures(proceduresRes.data);
      setSummary(summaryRes.data);
      // Filtrar apenas templates de agenda ativos
      const agendaTemplates = templatesRes.data.filter(t => 
        ['appointment_confirmation', 'appointment_reminder'].includes(t.type) && t.active
      );
      setWhatsappTemplates(agendaTemplates);
      setClinicName(settingsRes.data?.clinic_name || 'Nossa Clínica');
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setFormData(prev => ({ ...prev, date: selectedDate }));
  }, [selectedDate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/appointments`, formData, { withCredentials: true });
      toast.success('Agendamento criado com sucesso!');
      setIsCreateOpen(false);
      setFormData({ patient_id: '', procedure_id: '', date: selectedDate, time: '09:00', notes: '' });
      fetchData();
    } catch (error) {
      console.error('Error creating appointment:', error);
      toast.error(error.response?.data?.detail || 'Erro ao criar agendamento');
    }
  };

  const handleStatusChange = async (appointmentId, newStatus) => {
    try {
      if (newStatus === 'completed') {
        await axios.post(`${API}/appointments/${appointmentId}/complete`, {}, { withCredentials: true });
        toast.success('Atendimento concluído e estoque atualizado!');
      } else {
        await axios.put(`${API}/appointments/${appointmentId}`, { status: newStatus }, { withCredentials: true });
        toast.success('Status atualizado!');
      }
      fetchData();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Erro ao atualizar status');
    }
  };

  const openWhatsAppDialog = (apt) => {
    setWhatsappAppointment(apt);
    setSelectedTemplateId('');
    setPreviewMessage('');
    setIsWhatsappOpen(true);
  };

  const handleTemplateSelect = (templateId) => {
    setSelectedTemplateId(templateId);
    if (!whatsappAppointment) return;
    const template = whatsappTemplates.find(t => t.id === templateId);
    if (template) {
      const dateFmt = new Date(whatsappAppointment.date + 'T00:00:00').toLocaleDateString('pt-BR');
      let msg = template.message;
      msg = msg.replace(/\{nome\}/g, whatsappAppointment.patient_name || '');
      msg = msg.replace(/\{data\}/g, dateFmt);
      msg = msg.replace(/\{horario\}/g, whatsappAppointment.time || '');
      msg = msg.replace(/\{procedimento\}/g, whatsappAppointment.procedure_name || '');
      msg = msg.replace(/\{clinica\}/g, clinicName);
      setPreviewMessage(msg);
    }
  };

  const handleSendWhatsApp = () => {
    if (!whatsappAppointment || !selectedTemplateId || !previewMessage) return;
    // Monta a URL do WhatsApp direto no frontend — JavaScript lida perfeitamente com emojis via encodeURIComponent
    let phone = (whatsappAppointment.patient_phone || '').replace(/[\s\-\(\)]/g, '');
    if (phone && !phone.startsWith('55')) phone = '55' + phone;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(previewMessage)}`;
    window.open(url, '_blank');
    setIsWhatsappOpen(false);
    toast.success('WhatsApp aberto com sucesso!');
  };

  const handleDeleteAppointment = async (appointmentId) => {
    if (!window.confirm('Tem certeza que deseja excluir este agendamento?')) return;
    try {
      await axios.delete(`${API}/appointments/${appointmentId}`, { withCredentials: true });
      toast.success('Agendamento excluído!');
      fetchData();
    } catch (error) {
      toast.error('Erro ao excluir agendamento');
    }
  };

  const handleQuickPatientSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await axios.post(`${API}/patients`, quickPatientData, { withCredentials: true });
      toast.success('Paciente cadastrado com sucesso!');
      
      // Atualiza a lista de pacientes
      const patientsRes = await axios.get(`${API}/patients`, { withCredentials: true });
      setPatients(patientsRes.data);
      
      // Seleciona o novo paciente no formulário de agendamento
      setFormData(prev => ({ ...prev, patient_id: data.id }));
      
      // Limpa e fecha o modal rápido
      setQuickPatientData({ name: '', phone: '', email: '', cpf: '', birth_date: '', address: '', medical_history: '', allergies: '', notes: '' });
      setIsQuickPatientOpen(false);
    } catch (error) {
      console.error('Error creating quick patient:', error);
      toast.error(error.response?.data?.detail || 'Erro ao cadastrar paciente');
    }
  };

  const changeDate = (days) => {
    const [year, month, day] = selectedDate.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + days);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed': return 'bg-blue-500';
      case 'completed': return 'bg-green-500';
      case 'cancelled': return 'bg-red-500';
      default: return 'bg-amber-500';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'confirmed': return 'Confirmado';
      case 'completed': return 'Concluído';
      case 'cancelled': return 'Cancelado';
      default: return 'Agendado';
    }
  };

  const timeSlots = [];
  for (let h = 8; h <= 20; h++) {
    timeSlots.push(`${h.toString().padStart(2, '0')}:00`);
    timeSlots.push(`${h.toString().padStart(2, '0')}:30`);
  }

  if (loading) {
    return (
      <Layout>
        <div className="p-6 md:p-8 lg:p-12">
          <div className="animate-pulse space-y-6">
            <div className="h-10 bg-muted rounded w-1/3"></div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 h-96 bg-muted rounded-xl"></div>
              <div className="h-96 bg-muted rounded-xl"></div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div data-testid="agenda-page" className="p-6 md:p-8 lg:p-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-foreground mb-2">
              Agenda
            </h1>
            <p className="text-base text-muted-foreground">
              Gerencie seus atendimentos
            </p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button
                data-testid="create-appointment-button"
                className="bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-6 rounded-lg font-medium gap-2"
              >
                <Plus className="w-5 h-5" />
                Novo Agendamento
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Novo Agendamento</DialogTitle>
                <DialogDescription>Preencha os dados para agendar um atendimento.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label>Paciente</Label>
                    <Button 
                      type="button"
                      variant="link" 
                      className="h-auto p-0 text-xs text-primary"
                      onClick={() => setIsQuickPatientOpen(true)}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Cadastrar Novo
                    </Button>
                  </div>
                  <Select
                    value={formData.patient_id}
                    onValueChange={(value) => setFormData({ ...formData, patient_id: value })}
                  >
                    <SelectTrigger data-testid="appointment-patient-select">
                      <SelectValue placeholder="Selecione o paciente" />
                    </SelectTrigger>
                    <SelectContent>
                      {patients.map((patient) => (
                        <SelectItem key={patient.id} value={patient.id}>
                          {patient.name} - {patient.phone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Procedimento</Label>
                  <Select
                    value={formData.procedure_id}
                    onValueChange={(value) => setFormData({ ...formData, procedure_id: value })}
                  >
                    <SelectTrigger data-testid="appointment-procedure-select">
                      <SelectValue placeholder="Selecione o procedimento" />
                    </SelectTrigger>
                    <SelectContent>
                      {procedures.map((proc) => (
                        <SelectItem key={proc.id} value={proc.id}>
                          {proc.name} ({proc.duration_minutes} min)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Data</Label>
                    <Input
                      data-testid="appointment-date-input"
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Horário</Label>
                    <Select
                      value={formData.time}
                      onValueChange={(value) => setFormData({ ...formData, time: value })}
                    >
                      <SelectTrigger data-testid="appointment-time-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {timeSlots.map((time) => (
                          <SelectItem key={time} value={time}>{time}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Observações</Label>
                  <Input
                    data-testid="appointment-notes-input"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Observações adicionais..."
                  />
                </div>
                <Button
                  data-testid="appointment-submit-button"
                  type="submit"
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={!formData.patient_id || !formData.procedure_id}
                >
                  Criar Agendamento
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          {/* Quick Patient Dialog (Unificado com CRM) */}
          <Dialog open={isQuickPatientOpen} onOpenChange={setIsQuickPatientOpen}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-primary" />
                  Cadastrar Novo Paciente
                </DialogTitle>
                <DialogDescription>Preencha os dados do paciente para o agendamento e prontuário.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleQuickPatientSubmit} className="space-y-6 mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome Completo *</Label>
                    <Input
                      required
                      value={quickPatientData.name}
                      onChange={(e) => setQuickPatientData({ ...quickPatientData, name: e.target.value })}
                      placeholder="Nome do paciente"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>WhatsApp / Telefone *</Label>
                    <Input
                      required
                      value={quickPatientData.phone}
                      onChange={(e) => setQuickPatientData({ ...quickPatientData, phone: e.target.value })}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>E-mail</Label>
                    <Input
                      type="email"
                      value={quickPatientData.email}
                      onChange={(e) => setQuickPatientData({ ...quickPatientData, email: e.target.value })}
                      placeholder="email@exemplo.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CPF *</Label>
                    <Input
                      required
                      value={quickPatientData.cpf}
                      onChange={(e) => setQuickPatientData({ ...quickPatientData, cpf: e.target.value })}
                      placeholder="000.000.000-00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data de Nascimento</Label>
                    <Input
                      type="date"
                      value={quickPatientData.birth_date}
                      onChange={(e) => setQuickPatientData({ ...quickPatientData, birth_date: e.target.value })}
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-2 space-y-2">
                    <Label>Endereço</Label>
                    <Input
                      value={quickPatientData.address}
                      onChange={(e) => setQuickPatientData({ ...quickPatientData, address: e.target.value })}
                      placeholder="Rua, número, bairro, cidade/UF"
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-2 space-y-2">
                    <Label>Histórico Médico</Label>
                    <Textarea
                      value={quickPatientData.medical_history}
                      onChange={(e) => setQuickPatientData({ ...quickPatientData, medical_history: e.target.value })}
                      placeholder="Doenças, medicamentos em uso, cirurgias anteriores..."
                      rows={3}
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-2 space-y-2">
                    <Label className="flex items-center gap-2 text-destructive">
                      <AlertCircle className="w-4 h-4" />
                      Alergias
                    </Label>
                    <Textarea
                      value={quickPatientData.allergies}
                      onChange={(e) => setQuickPatientData({ ...quickPatientData, allergies: e.target.value })}
                      placeholder="Liste todas as alergias conhecidas..."
                      rows={2}
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-2 space-y-2">
                    <Label>Observações</Label>
                    <Textarea
                      value={quickPatientData.notes}
                      onChange={(e) => setQuickPatientData({ ...quickPatientData, notes: e.target.value })}
                      placeholder="Notas adicionais..."
                      rows={2}
                    />
                  </div>
                </div>
                <div className="flex gap-3 pt-4 sticky bottom-0 bg-background py-2 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setIsQuickPatientOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Cadastrar e Selecionar
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Date Navigation */}
        <Card className="bg-card border border-border/60 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => changeDate(-1)} data-testid="prev-date-button">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-primary" />
              <div className="text-center">
                <p className="text-lg font-medium text-foreground capitalize">{formatDate(selectedDate)}</p>
                {isToday && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Hoje</span>
                )}
              </div>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-auto"
                data-testid="date-picker"
              />
            </div>
            <Button variant="ghost" size="icon" onClick={() => changeDate(1)} data-testid="next-date-button">
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Appointments List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-medium text-foreground">Atendimentos do Dia</h2>
              <span className="text-sm text-muted-foreground">
                {appointments.length} agendamento{appointments.length !== 1 ? 's' : ''}
              </span>
            </div>

            {appointments.length === 0 ? (
              <Card className="bg-card border border-border/60 rounded-xl p-12 text-center">
                <Calendar className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">Nenhum agendamento para este dia</p>
                <Button onClick={() => setIsCreateOpen(true)} className="bg-primary text-primary-foreground">
                  <Plus className="w-4 h-4 mr-2" />
                  Agendar Paciente
                </Button>
              </Card>
            ) : (
              <div className="space-y-3">
                {appointments.map((apt) => (
                  <Card
                    key={apt.id}
                    data-testid={`appointment-card-${apt.id}`}
                    className={`bg-card border border-border/60 rounded-xl overflow-hidden hover:shadow-md transition-all duration-200 ${apt.status === 'cancelled' ? 'opacity-60' : ''}`}
                  >
                    <div className="flex">
                      <div className={`w-1 ${getStatusColor(apt.status)}`}></div>
                      <div className="flex-1 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="flex items-center gap-2 text-lg font-medium text-foreground">
                                <Clock className="w-4 h-4 text-muted-foreground" />
                                {apt.time}
                              </div>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                apt.status === 'completed' ? 'bg-green-100 text-green-700' :
                                apt.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
                                apt.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                'bg-amber-100 text-amber-700'
                              }`}>
                                {getStatusLabel(apt.status)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mb-1">
                              <User className="w-4 h-4 text-muted-foreground" />
                              <span className="font-medium text-foreground">{apt.patient_name}</span>
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                              <Phone className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">{apt.patient_phone}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-primary" />
                              <span className="text-sm font-medium text-primary">{apt.procedure_name}</span>
                            </div>
                            {apt.notes && (
                              <p className="text-sm text-muted-foreground mt-2 italic">"{apt.notes}"</p>
                            )}
                          </div>
                          <div className="flex flex-col gap-2">
                            {apt.status !== 'completed' && apt.status !== 'cancelled' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openWhatsAppDialog(apt)}
                                  className="gap-2"
                                  data-testid={`whatsapp-button-${apt.id}`}
                                >
                                  <MessageCircle className="w-4 h-4 text-green-600" />
                                  <span className="hidden sm:inline">WhatsApp</span>
                                </Button>
                                {apt.status === 'scheduled' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleStatusChange(apt.id, 'confirmed')}
                                    className="gap-2"
                                    data-testid={`confirm-button-${apt.id}`}
                                  >
                                    <CheckCircle2 className="w-4 h-4 text-blue-600" />
                                    <span className="hidden sm:inline">Confirmar</span>
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700 text-white gap-2"
                                  onClick={() => handleStatusChange(apt.id, 'completed')}
                                  data-testid={`complete-button-${apt.id}`}
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                  <span className="hidden sm:inline">Concluir</span>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleStatusChange(apt.id, 'cancelled')}
                                  className="gap-2 text-destructive hover:bg-destructive/10"
                                  data-testid={`cancel-button-${apt.id}`}
                                >
                                  <XCircle className="w-4 h-4" />
                                  <span className="hidden sm:inline">Cancelar</span>
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteAppointment(apt.id)}
                              className="text-muted-foreground hover:text-destructive"
                              data-testid={`delete-appointment-${apt.id}`}
                            >
                              Excluir
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Daily Summary */}
          <div className="space-y-4">
            <h2 className="text-xl font-medium text-foreground flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary" />
              Resumo do Dia
            </h2>

            <Card className="bg-card border border-border/60 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Procedimentos</h3>
              {summary && Object.keys(summary.procedure_summary || {}).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(summary.procedure_summary).map(([name, count]) => (
                    <div key={name} className="flex items-center justify-between">
                      <span className="text-sm text-foreground">{name}</span>
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-sm font-medium">{count}x</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum procedimento agendado</p>
              )}
            </Card>

            <Card className="bg-card border border-border/60 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Produtos Necessários
              </h3>
              {summary && summary.products_needed && summary.products_needed.length > 0 ? (
                <div className="space-y-3">
                  {summary.products_needed.map((prod, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span className="text-foreground">{prod.name || 'Produto'}</span>
                      <span className={`font-medium ${prod.in_stock < prod.quantity_needed ? 'text-destructive' : 'text-foreground'}`}>
                        {prod.quantity_needed} un.
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Configure os produtos dos procedimentos</p>
              )}
            </Card>

            {summary && summary.has_stock_issues && (
              <Card className="bg-destructive/5 border border-destructive/20 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-destructive uppercase tracking-wider mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Alertas de Estoque
                </h3>
                <div className="space-y-3">
                  {summary.stock_alerts.map((alert, idx) => (
                    <div key={idx} className="p-3 bg-destructive/10 rounded-lg">
                      <p className="text-sm font-medium text-destructive">{alert.product_name}</p>
                      <p className="text-xs text-destructive/80">
                        Necessário: {alert.needed} | Disponível: {alert.available} | <span className="font-bold">Faltam: {alert.shortage}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <p className="text-3xl font-light text-primary">{summary?.total_appointments || 0}</p>
                  <p className="text-xs text-muted-foreground">Atendimentos</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-light text-primary">{appointments.filter(a => a.status === 'completed').length}</p>
                  <p className="text-xs text-muted-foreground">Concluídos</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* WhatsApp Template Selection Dialog */}
      <Dialog open={isWhatsappOpen} onOpenChange={setIsWhatsappOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-600" />
              Enviar WhatsApp
            </DialogTitle>
            <DialogDescription>
              Escolha um template de mensagem para enviar ao paciente.
            </DialogDescription>
          </DialogHeader>
          
          {whatsappAppointment && (
            <div className="space-y-4 mt-2">
              {/* Patient Info */}
              <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{whatsappAppointment.patient_name}</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {whatsappAppointment.patient_phone}
                  </p>
                </div>
              </div>

              {/* Template Selection */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Escolha o template</Label>
                <div className="space-y-2">
                  {whatsappTemplates.length === 0 ? (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-center">
                      <Bell className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                      <p className="text-sm text-amber-700">Nenhum template de agenda ativo.</p>
                      <p className="text-xs text-amber-600 mt-1">Configure templates em Configurações da Agenda.</p>
                    </div>
                  ) : (
                    whatsappTemplates.map((template) => (
                      <div
                        key={template.id}
                        onClick={() => handleTemplateSelect(template.id)}
                        className={`p-3 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                          selectedTemplateId === template.id
                            ? 'border-green-500 bg-green-50/50 shadow-sm'
                            : 'border-border/60 hover:border-green-300 hover:bg-green-50/20'
                        }`}
                        data-testid={`whatsapp-template-${template.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            template.type === 'appointment_confirmation' 
                              ? 'bg-green-100' 
                              : 'bg-blue-100'
                          }`}>
                            {template.type === 'appointment_confirmation' 
                              ? <Sparkles className="w-4 h-4 text-green-600" />
                              : <Bell className="w-4 h-4 text-blue-600" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-foreground">{template.name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {template.type === 'appointment_confirmation' ? 'Confirmação' : 'Lembrete'}
                            </p>
                          </div>
                          {selectedTemplateId === template.id && (
                            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Message Preview */}
              {previewMessage && (
                <div>
                  <Label className="text-sm font-medium mb-2 flex items-center gap-1">
                    <Eye className="w-4 h-4" />
                    Pré-visualização
                  </Label>
                  <div className="p-4 bg-[#e5ddd5] rounded-lg">
                    <div className="bg-[#dcf8c6] rounded-lg p-3 max-w-[85%] ml-auto shadow-sm">
                      <p className="text-sm whitespace-pre-wrap text-gray-800" style={{ fontSize: '13px' }}>
                        {previewMessage}
                      </p>
                      <p className="text-[10px] text-gray-500 text-right mt-1">
                        {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Send Button */}
              <Button
                onClick={handleSendWhatsApp}
                disabled={!selectedTemplateId}
                className="w-full bg-green-600 hover:bg-green-700 text-white gap-2 h-11"
                data-testid="send-whatsapp-button"
              >
                <Send className="w-4 h-4" />
                Enviar pelo WhatsApp
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default Agenda;
