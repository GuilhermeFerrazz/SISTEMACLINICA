import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Settings, Save, Bell, Sparkles, Clock, MessageCircle, Plus, Pencil, Trash2, Stethoscope
} from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const PLACEHOLDERS = [
  { tag: "{nome}", description: "Nome do paciente" },
  { tag: "{data}", description: "Data do agendamento" },
  { tag: "{horario}", description: "Horário do agendamento" },
  { tag: "{procedimento}", description: "Nome do procedimento" },
  { tag: "{clinica}", description: "Nome da clínica" }
];

const decodeB64 = (str) => {
  if (!str || !str.startsWith('B64:')) return str;
  try {
    return decodeURIComponent(escape(window.atob(str.split(':')[1])));
  } catch (e) { return str; }
};

const emptyProc = { name: '', duration_minutes: 30, price: '', description: '' };

const AgendaSettings = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [clinicSettings, setClinicSettings] = useState({ clinic_name: '', responsible_name: '' });

  // Procedimentos
  const [procedures, setProcedures] = useState([]);
  const [procLoading, setProcLoading] = useState(false);
  const [isProcOpen, setIsProcOpen] = useState(false);
  const [editingProc, setEditingProc] = useState(null);
  const [procForm, setProcForm] = useState(emptyProc);
  const [procSaving, setProcSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => { fetchData(); fetchProcedures(); }, []);

  const fetchData = async () => {
    try {
      const [templatesRes, settingsRes] = await Promise.all([
        axios.get(`${API}/message-templates`, { withCredentials: true }),
        axios.get(`${API}/settings`, { withCredentials: true })
      ]);
      setTemplates(templatesRes.data.filter(t =>
        ['appointment_confirmation', 'appointment_reminder'].includes(t.type)
      ));
      setClinicSettings(settingsRes.data);
    } catch { toast.error('Erro ao carregar configurações'); }
    finally { setLoading(false); }
  };

  const fetchProcedures = async () => {
    setProcLoading(true);
    try {
      const { data } = await axios.get(`${API}/procedures`, { withCredentials: true });
      setProcedures(data);
    } catch { toast.error('Erro ao carregar procedimentos'); }
    finally { setProcLoading(false); }
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplate) return;
    try {
      await axios.put(`${API}/message-templates/${editingTemplate.id}`, {
        name: editingTemplate.name, message: editingTemplate.message, active: editingTemplate.active
      }, { withCredentials: true });
      toast.success('Template atualizado!');
      setIsEditOpen(false);
      fetchData();
    } catch { toast.error('Erro ao atualizar template'); }
  };

  const handleToggleActive = async (template) => {
    try {
      await axios.put(`${API}/message-templates/${template.id}`, { active: !template.active }, { withCredentials: true });
      fetchData();
    } catch { toast.error('Erro ao atualizar status'); }
  };

  const handleUpdateClinicSettings = async () => {
    try {
      await axios.put(`${API}/settings`, clinicSettings, { withCredentials: true });
      toast.success('Configurações salvas!');
    } catch { toast.error('Erro ao salvar configurações'); }
  };

  const openNewProc = () => {
    setEditingProc(null);
    setProcForm(emptyProc);
    setIsProcOpen(true);
  };

  const openEditProc = (proc) => {
    setEditingProc(proc);
    setProcForm({ name: proc.name, duration_minutes: proc.duration_minutes, price: proc.price ?? '', description: proc.description ?? '' });
    setIsProcOpen(true);
  };

  const handleSaveProc = async () => {
    if (!procForm.name.trim()) { toast.error('Nome é obrigatório'); return; }
    if (!procForm.duration_minutes || procForm.duration_minutes < 5) { toast.error('Duração mínima é 5 minutos'); return; }
    setProcSaving(true);
    try {
      const payload = {
        name: procForm.name.trim(),
        duration_minutes: Number(procForm.duration_minutes),
        price: procForm.price !== '' ? Number(procForm.price) : null,
        description: procForm.description || null
      };
      if (editingProc) {
        await axios.put(`${API}/procedures/${editingProc.id}`, payload, { withCredentials: true });
        toast.success('Procedimento atualizado!');
      } else {
        await axios.post(`${API}/procedures`, payload, { withCredentials: true });
        toast.success('Procedimento criado!');
      }
      setIsProcOpen(false);
      fetchProcedures();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao salvar procedimento');
    } finally { setProcSaving(false); }
  };

  const handleDeleteProc = async (proc) => {
    try {
      await axios.delete(`${API}/procedures/${proc.id}`, { withCredentials: true });
      toast.success(`"${proc.name}" excluído`);
      setDeleteConfirm(null);
      fetchProcedures();
    } catch { toast.error('Erro ao excluir procedimento'); }
  };

  const getTemplateIcon = (type) => {
    if (type === 'appointment_reminder') return <Bell className="w-6 h-6 text-blue-500" />;
    if (type === 'appointment_confirmation') return <Sparkles className="w-6 h-6 text-green-500" />;
    return <MessageCircle className="w-6 h-6 text-gray-500" />;
  };

  const getTemplateColor = (type) => {
    if (type === 'appointment_reminder') return 'border-blue-200 bg-blue-50/50';
    if (type === 'appointment_confirmation') return 'border-green-200 bg-green-50/50';
    return 'border-border/60';
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-6 md:p-8 lg:p-12">
          <div className="animate-pulse space-y-6">
            <div className="h-10 bg-muted rounded w-1/4"></div>
            <div className="h-64 bg-muted rounded-xl"></div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div data-testid="agenda-settings-page" className="p-6 md:p-8 lg:p-12">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Settings className="w-8 h-8 text-muted-foreground" />
            <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-foreground">
              Configurações da Agenda
            </h1>
          </div>
          <p className="text-base text-muted-foreground">Templates de mensagens, procedimentos e dados da clínica</p>
        </div>

        <Tabs defaultValue="procedures" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="procedures" className="gap-2">
              <Stethoscope className="w-4 h-4" />
              Procedimentos
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <MessageCircle className="w-4 h-4" />
              Mensagens
            </TabsTrigger>
            <TabsTrigger value="clinic" className="gap-2">
              <Settings className="w-4 h-4" />
              Dados da Clínica
            </TabsTrigger>
          </TabsList>

          {/* ── ABA PROCEDIMENTOS ── */}
          <TabsContent value="procedures" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Procedimentos</h2>
                <p className="text-sm text-muted-foreground">{procedures.length} procedimento{procedures.length !== 1 ? 's' : ''} cadastrado{procedures.length !== 1 ? 's' : ''}</p>
              </div>
              <Button onClick={openNewProc} className="gap-2">
                <Plus className="w-4 h-4" />
                Novo Procedimento
              </Button>
            </div>

            {procLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1,2,3].map(i => <div key={i} className="h-36 bg-muted animate-pulse rounded-xl" />)}
              </div>
            ) : procedures.length === 0 ? (
              <Card className="p-12 text-center border-dashed">
                <Stethoscope className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Nenhum procedimento cadastrado</p>
                <Button onClick={openNewProc} variant="outline" className="mt-4 gap-2">
                  <Plus className="w-4 h-4" />
                  Adicionar primeiro procedimento
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {procedures.map((proc) => (
                  <Card key={proc.id} className="p-5 rounded-xl border border-border/60 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground truncate">{proc.name}</h3>
                        {proc.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{proc.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mb-4">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {proc.duration_minutes} min
                      </span>
                      {proc.price != null && (
                        <span className="font-medium text-foreground">
                          R$ {Number(proc.price).toFixed(2).replace('.', ',')}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => openEditProc(proc)}>
                        <Pencil className="w-3.5 h-3.5" />
                        Editar
                      </Button>
                      <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => setDeleteConfirm(proc)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── ABA MENSAGENS ── */}
          <TabsContent value="templates" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {templates.map((template) => (
                <Card key={template.id} data-testid={`agenda-template-${template.id}`}
                  className={`rounded-xl p-6 transition-all ${getTemplateColor(template.type)} ${!template.active ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {getTemplateIcon(template.type)}
                      <div>
                        <h3 className="font-medium text-foreground">{template.name}</h3>
                        <span className="text-xs text-muted-foreground">
                          {template.type === 'appointment_confirmation' ? 'Enviada ao criar agendamento' : 'Enviada no dia anterior'}
                        </span>
                      </div>
                    </div>
                    <Switch checked={template.active} onCheckedChange={() => handleToggleActive(template)}
                      data-testid={`toggle-agenda-template-${template.id}`} />
                  </div>
                  <Card className="bg-white/70 p-4 rounded-lg mb-4 border-0">
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">{decodeB64(template.message)}</p>
                  </Card>
                  <Button variant="outline" className="w-full bg-white/50"
                    onClick={() => { setEditingTemplate(template); setIsEditOpen(true); }}
                    data-testid={`edit-agenda-template-${template.id}`}>
                    Editar Template
                  </Button>
                </Card>
              ))}
            </div>
            <Card className="bg-blue-50 border-blue-200 rounded-xl p-6">
              <h3 className="font-medium text-blue-900 mb-3">Variáveis Disponíveis</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {PLACEHOLDERS.map(p => (
                  <div key={p.tag} className="flex items-center gap-2">
                    <code className="px-2 py-1 bg-blue-100 rounded text-blue-800 text-sm">{p.tag}</code>
                    <span className="text-sm text-blue-700">{p.description}</span>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          {/* ── ABA DADOS DA CLÍNICA ── */}
          <TabsContent value="clinic" className="space-y-6">
            <Card className="bg-card border border-border/60 rounded-xl p-6">
              <h3 className="text-lg font-medium mb-4">Dados da Clínica</h3>
              <p className="text-sm text-muted-foreground mb-6">Essas informações serão usadas nas mensagens enviadas aos pacientes.</p>
              <div className="space-y-4 max-w-md">
                <div>
                  <Label>Nome da Clínica</Label>
                  <Input value={clinicSettings.clinic_name || ''} onChange={(e) => setClinicSettings({ ...clinicSettings, clinic_name: e.target.value })}
                    placeholder="Ex: Clínica Estética Bella" data-testid="clinic-name-input" />
                </div>
                <div>
                  <Label>Nome do Responsável</Label>
                  <Input value={clinicSettings.responsible_name || ''} onChange={(e) => setClinicSettings({ ...clinicSettings, responsible_name: e.target.value })}
                    placeholder="Dr. Nome Sobrenome" data-testid="responsible-name-input" />
                </div>
                <Button onClick={handleUpdateClinicSettings} className="bg-primary text-primary-foreground gap-2" data-testid="save-clinic-settings">
                  <Save className="w-4 h-4" />
                  Salvar Configurações
                </Button>
              </div>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ── MODAL EDITAR TEMPLATE ── */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {editingTemplate && getTemplateIcon(editingTemplate.type)}
                Editar: {editingTemplate?.name}
              </DialogTitle>
            </DialogHeader>
            {editingTemplate && (
              <div className="space-y-4 mt-4">
                <div>
                  <Label>Nome do Template</Label>
                  <Input value={editingTemplate.name} onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                    data-testid="edit-agenda-template-name" />
                </div>
                <div>
                  <Label>Mensagem</Label>
                  <Textarea value={decodeB64(editingTemplate.message)} onChange={(e) => setEditingTemplate({ ...editingTemplate, message: e.target.value })}
                    rows={8} className="font-mono text-sm" data-testid="edit-agenda-template-message" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Clique para inserir:</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {PLACEHOLDERS.map(p => (
                      <button key={p.tag} type="button"
                        onClick={() => setEditingTemplate({ ...editingTemplate, message: editingTemplate.message + p.tag })}
                        className="px-2 py-1 bg-secondary rounded text-xs font-mono hover:bg-secondary/80 transition-colors">{p.tag}</button>
                    ))}
                  </div>
                </div>
                <Button onClick={handleUpdateTemplate} className="w-full bg-primary text-primary-foreground" data-testid="save-agenda-template">
                  <Save className="w-4 h-4 mr-2" />Salvar Template
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── MODAL CRIAR / EDITAR PROCEDIMENTO ── */}
        <Dialog open={isProcOpen} onOpenChange={setIsProcOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Stethoscope className="w-5 h-5" />
                {editingProc ? 'Editar Procedimento' : 'Novo Procedimento'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label>Nome *</Label>
                <Input value={procForm.name} onChange={(e) => setProcForm({ ...procForm, name: e.target.value })}
                  placeholder="Ex: Consulta / Avaliação" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Duração (minutos) *</Label>
                  <Input type="number" min={5} max={480} value={procForm.duration_minutes}
                    onChange={(e) => setProcForm({ ...procForm, duration_minutes: e.target.value })}
                    placeholder="30" />
                </div>
                <div>
                  <Label>Preço (R$)</Label>
                  <Input type="number" min={0} step="0.01" value={procForm.price}
                    onChange={(e) => setProcForm({ ...procForm, price: e.target.value })}
                    placeholder="Opcional" />
                </div>
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea value={procForm.description} onChange={(e) => setProcForm({ ...procForm, description: e.target.value })}
                  placeholder="Descrição opcional do procedimento" rows={3} />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setIsProcOpen(false)}>Cancelar</Button>
                <Button className="flex-1 gap-2" onClick={handleSaveProc} disabled={procSaving}>
                  <Save className="w-4 h-4" />
                  {procSaving ? 'Salvando...' : editingProc ? 'Salvar Alterações' : 'Criar Procedimento'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── MODAL CONFIRMAR EXCLUSÃO ── */}
        <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Excluir Procedimento</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mt-2">
              Tem certeza que deseja excluir <strong>"{deleteConfirm?.name}"</strong>? Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-3 mt-4">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
              <Button variant="destructive" className="flex-1 gap-2" onClick={() => handleDeleteProc(deleteConfirm)}>
                <Trash2 className="w-4 h-4" />
                Excluir
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default AgendaSettings;
