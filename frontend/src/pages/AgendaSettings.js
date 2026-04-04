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
  Settings, Save, Bell, Sparkles, Clock, MessageCircle
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

const AgendaSettings = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [clinicSettings, setClinicSettings] = useState({ clinic_name: '', responsible_name: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [templatesRes, settingsRes] = await Promise.all([
        axios.get(`${API}/message-templates`, { withCredentials: true }),
        axios.get(`${API}/settings`, { withCredentials: true })
      ]);
      // Filter only agenda related templates
      const agendaTemplates = templatesRes.data.filter(t => 
        ['appointment_confirmation', 'appointment_reminder'].includes(t.type)
      );
      setTemplates(agendaTemplates);
      setClinicSettings(settingsRes.data);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplate) return;
    try {
      await axios.put(`${API}/message-templates/${editingTemplate.id}`, {
        name: editingTemplate.name,
        message: editingTemplate.message,
        active: editingTemplate.active
      }, { withCredentials: true });
      toast.success('Template atualizado!');
      setIsEditOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Erro ao atualizar template');
    }
  };

  const handleToggleActive = async (template) => {
    try {
      await axios.put(`${API}/message-templates/${template.id}`, {
        active: !template.active
      }, { withCredentials: true });
      fetchData();
    } catch (error) {
      toast.error('Erro ao atualizar status');
    }
  };

  const handleUpdateClinicSettings = async () => {
    try {
      await axios.put(`${API}/settings`, clinicSettings, { withCredentials: true });
      toast.success('Configurações salvas!');
    } catch (error) {
      toast.error('Erro ao salvar configurações');
    }
  };

  const getTemplateIcon = (type) => {
    switch (type) {
      case 'appointment_reminder': return <Bell className="w-6 h-6 text-blue-500" />;
      case 'appointment_confirmation': return <Sparkles className="w-6 h-6 text-green-500" />;
      default: return <MessageCircle className="w-6 h-6 text-gray-500" />;
    }
  };

  const getTemplateColor = (type) => {
    switch (type) {
      case 'appointment_reminder': return 'border-blue-200 bg-blue-50/50';
      case 'appointment_confirmation': return 'border-green-200 bg-green-50/50';
      default: return 'border-border/60';
    }
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
          <p className="text-base text-muted-foreground">
            Templates de mensagens para agendamentos
          </p>
        </div>

        <Tabs defaultValue="templates" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="templates" className="gap-2">
              <MessageCircle className="w-4 h-4" />
              Mensagens de Agendamento
            </TabsTrigger>
            <TabsTrigger value="clinic" className="gap-2">
              <Settings className="w-4 h-4" />
              Dados da Clínica
            </TabsTrigger>
          </TabsList>

          <TabsContent value="templates" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {templates.map((template) => (
                <Card 
                  key={template.id} 
                  data-testid={`agenda-template-${template.id}`}
                  className={`rounded-xl p-6 transition-all ${getTemplateColor(template.type)} ${!template.active ? 'opacity-60' : ''}`}
                >
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
                    <Switch 
                      checked={template.active} 
                      onCheckedChange={() => handleToggleActive(template)}
                      data-testid={`toggle-agenda-template-${template.id}`}
                    />
                  </div>

                  <Card className="bg-white/70 p-4 rounded-lg mb-4 border-0">
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">{template.message}</p>
                  </Card>

                  <div className="flex flex-wrap gap-2 mb-4">
                    {PLACEHOLDERS.filter(p => template.message.includes(p.tag)).map(p => (
                      <span key={p.tag} className="px-2 py-1 bg-white/50 rounded text-xs font-mono">
                        {p.tag}
                      </span>
                    ))}
                  </div>

                  <Button 
                    variant="outline" 
                    className="w-full bg-white/50"
                    onClick={() => { setEditingTemplate(template); setIsEditOpen(true); }}
                    data-testid={`edit-agenda-template-${template.id}`}
                  >
                    Editar Template
                  </Button>
                </Card>
              ))}
            </div>

            {/* Info Card */}
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

          <TabsContent value="clinic" className="space-y-6">
            <Card className="bg-card border border-border/60 rounded-xl p-6">
              <h3 className="text-lg font-medium mb-4">Dados da Clínica</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Essas informações serão usadas nas mensagens enviadas aos pacientes.
              </p>
              <div className="space-y-4 max-w-md">
                <div>
                  <Label>Nome da Clínica</Label>
                  <Input 
                    value={clinicSettings.clinic_name || ''} 
                    onChange={(e) => setClinicSettings({ ...clinicSettings, clinic_name: e.target.value })}
                    placeholder="Ex: Clínica Estética Bella"
                    data-testid="clinic-name-input"
                  />
                </div>
                <div>
                  <Label>Nome do Responsável</Label>
                  <Input 
                    value={clinicSettings.responsible_name || ''} 
                    onChange={(e) => setClinicSettings({ ...clinicSettings, responsible_name: e.target.value })}
                    placeholder="Dr. Nome Sobrenome"
                    data-testid="responsible-name-input"
                  />
                </div>
                <Button onClick={handleUpdateClinicSettings} className="bg-primary text-primary-foreground gap-2" data-testid="save-clinic-settings">
                  <Save className="w-4 h-4" />
                  Salvar Configurações
                </Button>
              </div>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Edit Dialog */}
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
                  <Input 
                    value={editingTemplate.name}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                    data-testid="edit-agenda-template-name"
                  />
                </div>
                <div>
                  <Label>Mensagem</Label>
                  <Textarea 
                    value={editingTemplate.message}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, message: e.target.value })}
                    rows={8}
                    className="font-mono text-sm"
                    data-testid="edit-agenda-template-message"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Clique para inserir:</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {PLACEHOLDERS.map(p => (
                      <button
                        key={p.tag}
                        type="button"
                        onClick={() => setEditingTemplate({ 
                          ...editingTemplate, 
                          message: editingTemplate.message + p.tag 
                        })}
                        className="px-2 py-1 bg-secondary rounded text-xs font-mono hover:bg-secondary/80 transition-colors"
                        title={p.description}
                      >
                        {p.tag}
                      </button>
                    ))}
                  </div>
                </div>
                <Button onClick={handleUpdateTemplate} className="w-full bg-primary text-primary-foreground" data-testid="save-agenda-template">
                  <Save className="w-4 h-4 mr-2" />
                  Salvar Template
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default AgendaSettings;
