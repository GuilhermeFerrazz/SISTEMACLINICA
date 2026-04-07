import React, { useState, useEffect, useRef } from 'react';
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
  Settings, Save, Gift, Syringe, UserX, Clock, MessageCircle,
  Shield, FileText, Pencil, CheckCircle, Upload, Trash2, Image,
  Maximize, Type, AlignLeft
} from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const PLACEHOLDERS = [
  { tag: "{nome}", description: "Nome do paciente" },
  { tag: "{ultimo_procedimento}", description: "Último procedimento" },
  { tag: "{clinica}", description: "Nome da clínica" },
  { tag: "{procedimento}", description: "Procedimento atual" },
  { tag: "{link}", description: "Link do termo (apenas consent_link)" },
  { tag: "{data}", description: "Data do agendamento" },
  { tag: "{horario}", description: "Horário do agendamento" }
];

const DEFAULT_PDF = {
  margin_top: 15,
  margin_bottom: 15,
  margin_left: 20,
  margin_right: 20,
  font_size_title: 16,
  font_size_subtitle: 10,
  font_size_section: 11,
  font_size_body: 9.5,
  font_size_small: 8,
  font_size_legal: 7.5,
  spacing_after_header: 3,
    spacing_after_title: 4,
    spacing_after_section: 2,
    spacing_between_sections: 5,
    show_header: true,
    show_footer: true,
  };

// Mini preview A4
const PDFPreview = ({ config, clinicName }) => {
  const hColor = config.header_color || '#1a3a1a';
  const s = 0.44;
  const ml = config.margin_left * s * 0.5;
  const mr = config.margin_right * s * 0.5;
  const mt = config.margin_top * s * 0.5;
  const mb = config.margin_bottom * s * 0.5;

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs text-muted-foreground mb-2">Pré-visualização</p>
      <div style={{
        width: 210 * s, height: 297 * s,
        background: config.background_image ? `url(${config.background_image}) center/cover` : '#fff',
        border: '1px solid #ddd', borderRadius: 3,
        boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
        padding: `${mt}px ${mr}px ${mb}px ${ml}px`,
        position: 'relative', overflow: 'hidden',
        fontFamily: 'Helvetica, Arial, sans-serif', boxSizing: 'border-box',
      }}>
        {/* sobreposição branca semi-transparente se tiver bg */}
        {config.background_image && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.55)' }} />
        )}
        <div style={{ position: 'relative' }}>
          {config.show_header !== false && (
            <>
              <div style={{ textAlign: 'center', marginBottom: config.spacing_after_header * s * 0.4 }}>
                <div style={{ fontWeight: 'bold', color: hColor, fontSize: config.font_size_title * s * 0.8 }}>
                  {clinicName || 'Dr. Guilherme Ferraz'}
                </div>
                {config.cro && <div style={{ color: '#666', fontSize: config.font_size_subtitle * s * 0.8 }}>CRO: {config.cro}</div>}
                {config.address && <div style={{ color: '#888', fontSize: config.font_size_small * s * 0.8 }}>{config.address}</div>}
              </div>
              <div style={{ borderBottom: `0.8px solid ${hColor}`, marginBottom: config.spacing_after_title * s * 0.4 }} />
            </>
          )}
          <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: config.font_size_title * s * 0.75, marginBottom: 2 }}>
            TERMO DE CONSENTIMENTO
          </div>
          <div style={{ textAlign: 'center', color: hColor, fontSize: config.font_size_subtitle * s * 0.8, fontWeight: 'bold', marginBottom: config.spacing_after_title * s * 0.4 }}>
            Procedimento: Preenchimento
          </div>
          <div style={{ color: hColor, fontWeight: 'bold', fontSize: config.font_size_section * s * 0.8, marginBottom: 2 }}>
            DADOS DO PACIENTE
          </div>
          <div style={{ fontSize: config.font_size_body * s * 0.8, borderBottom: '0.4px solid #eee', paddingBottom: 2, marginBottom: config.spacing_between_sections * s * 0.4 }}>
            <span style={{ fontWeight: 'bold', color: '#555' }}>Paciente:</span> Guilherme Ferraz &nbsp;&nbsp; <span style={{ fontWeight: 'bold', color: '#555' }}>CPF:</span> 065.113.431-54
          </div>
          <div style={{ color: hColor, fontWeight: 'bold', fontSize: config.font_size_section * s * 0.8, marginBottom: 2 }}>
            TEXTO DO TERMO
          </div>
          <div style={{ fontSize: config.font_size_body * s * 0.8, lineHeight: 1.4, color: '#333' }}>
            Em conformidade com a LGPD, declaro que autorizo o tratamento dos meus dados pessoais para fins de agendamento e realização de procedimentos estéticos...
          </div>
        </div>
        {config.show_footer !== false && (
          <div style={{
            position: 'absolute', bottom: mb, left: ml, right: mr,
            borderTop: '0.4px solid #ccc', paddingTop: 2,
            textAlign: 'center', color: '#999', fontSize: config.font_size_legal * s * 0.8,
          }}>
            {config.footer_text || 'Documento com validade jurídica conforme Lei 14.063/2020'}
          </div>
        )}
      </div>
    </div>
  );
};

const NumField = ({ label, value, onChange, unit, min = 0, max = 100 }) => (
  <div>
    <Label className="text-xs mb-1 block">{label}</Label>
    <div className="flex items-center gap-2">
      <Input
        type="number" value={value}
        onChange={e => onChange(Number(e.target.value))}
        min={min} max={max}
        className="h-8 w-20 text-sm px-2"
      />
      {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
    </div>
  </div>
);

const CRMSettings = () => {
  const [templates, setTemplates] = useState([]);
  const [procedures, setProcedures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingProcedure, setEditingProcedure] = useState(null);
  const [isConsentEditOpen, setIsConsentEditOpen] = useState(false);
  const [consentText, setConsentText] = useState('');
  const [activeTab, setActiveTab] = useState('messages');
  const [clinicName, setClinicName] = useState('');
  const [letterheadConfig, setLetterheadConfig] = useState({
    header_color: '#1a3a1a',
    address: '',
    cro: '',
    cnpj: '',
    email: '',
    footer_text: '',
    background_image: '',
    show_header: true,
    show_footer: true,
    ...DEFAULT_PDF,
  });
  const [savingLetterhead, setSavingLetterhead] = useState(false);
  const bgFileInputRef = useRef(null);

  useEffect(() => {
    fetchTemplates();
    fetchProcedures();
    fetchLetterheadConfig();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTemplates = async () => {
    try {
      const { data } = await axios.get(`${API}/message-templates`, { withCredentials: true });
      
      // Filtra e Decodifica mensagens blindadas em Base64 (Método moderno)
      const processedTemplates = data
        .filter(t => ['birthday', 'botox_return', 'inactive_patient', 'consent_link'].includes(t.type))
        .map(t => {
          if (t.message && t.message.startsWith('B64:')) {
            try {
              const b64 = t.message.substring(4);
              const binString = atob(b64);
              const bytes = Uint8Array.from(binString, (c) => c.charCodeAt(0));
              const decoded = new TextDecoder().decode(bytes);
              return { ...t, message: decoded };
            } catch (e) {
              console.error("Erro ao decodificar template Base64", e);
              return t;
            }
          }
          return t;
        });
      
      setTemplates(processedTemplates);
    } catch (error) {
      toast.error('Erro ao carregar templates');
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

  const fetchLetterheadConfig = async () => {
    try {
      const { data } = await axios.get(`${API}/settings`, { withCredentials: true });
      setClinicName(data.clinic_name || '');
      if (data.letterhead_config) {
        setLetterheadConfig(prev => ({ ...prev, ...data.letterhead_config }));
      }
    } catch (error) {
      console.error('Error fetching letterhead:', error);
    }
  };

  const setLh = (key, value) => setLetterheadConfig(prev => ({ ...prev, [key]: value }));

  const handleSaveLetterhead = async () => {
    setSavingLetterhead(true);
    try {
      await axios.put(`${API}/settings`, { letterhead_config: letterheadConfig }, { withCredentials: true });
      toast.success('Papel timbrado salvo com sucesso!');
    } catch (error) {
      toast.error('Erro ao salvar papel timbrado');
    } finally {
      setSavingLetterhead(false);
    }
  };

  const handleBgUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem PNG ou JPG'); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error('Imagem muito grande. Máximo 2MB.'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setLh('background_image', ev.target.result);
      toast.success('Imagem de fundo carregada!');
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplate) return;
    try {
      // Blindagem Base64 moderna para evitar corrupção de emojis no transporte
      const bytes = new TextEncoder().encode(editingTemplate.message);
      const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
      const encodedMessage = btoa(binString);
      
      await axios.put(`${API}/message-templates/${editingTemplate.id}`, {
        name: editingTemplate.name,
        message: `B64:${encodedMessage}`,
        days_interval: editingTemplate.days_interval,
        active: editingTemplate.active
      }, { withCredentials: true });
      
      toast.success('Template atualizado!');
      setIsEditOpen(false);
      fetchTemplates();
    } catch (error) {
      toast.error('Erro ao atualizar template');
    }
  };

  const handleToggleActive = async (template) => {
    try {
      await axios.put(`${API}/message-templates/${template.id}`, { active: !template.active }, { withCredentials: true });
      fetchTemplates();
    } catch (error) {
      toast.error('Erro ao atualizar status');
    }
  };

  const handleEditConsent = (procedure) => {
    setEditingProcedure(procedure);
    setConsentText(procedure.consent_template || '');
    setIsConsentEditOpen(true);
  };

  const handleSaveConsent = async () => {
    if (!editingProcedure) return;
    try {
      await axios.put(`${API}/procedures/${editingProcedure.id}`, { consent_template: consentText }, { withCredentials: true });
      toast.success(`Termo de "${editingProcedure.name}" atualizado!`);
      setIsConsentEditOpen(false);
      fetchProcedures();
    } catch (error) {
      toast.error('Erro ao salvar termo de consentimento');
    }
  };

  const getTemplateIcon = (type) => {
    switch (type) {
      case 'birthday': return <Gift className="w-6 h-6 text-pink-500" />;
      case 'botox_return': return <Syringe className="w-6 h-6 text-purple-500" />;
      case 'inactive_patient': return <UserX className="w-6 h-6 text-amber-500" />;
      case 'consent_link': return <Shield className="w-6 h-6 text-emerald-500" />;
      default: return <MessageCircle className="w-6 h-6 text-gray-500" />;
    }
  };

  const getTemplateColor = (type) => {
    switch (type) {
      case 'birthday': return 'border-pink-200 bg-pink-50/50';
      case 'botox_return': return 'border-purple-200 bg-purple-50/50';
      case 'inactive_patient': return 'border-amber-200 bg-amber-50/50';
      case 'consent_link': return 'border-emerald-200 bg-emerald-50/50';
      default: return 'border-border/60';
    }
  };

  const getProcedureColor = (index) => {
    const colors = ['border-emerald-200 bg-emerald-50/50','border-blue-200 bg-blue-50/50','border-violet-200 bg-violet-50/50','border-rose-200 bg-rose-50/50','border-orange-200 bg-orange-50/50','border-cyan-200 bg-cyan-50/50','border-teal-200 bg-teal-50/50'];
    return colors[index % colors.length];
  };

  const getProcedureIcon = (name) => {
    const lower = name.toLowerCase();
    if (lower.includes('botox') || lower.includes('toxina')) return <Syringe className="w-6 h-6 text-emerald-600" />;
    if (lower.includes('preenchimento') || lower.includes('hialurônico')) return <Syringe className="w-6 h-6 text-blue-600" />;
    if (lower.includes('harmonização')) return <Syringe className="w-6 h-6 text-violet-600" />;
    if (lower.includes('skin') || lower.includes('boost')) return <Syringe className="w-6 h-6 text-rose-600" />;
    if (lower.includes('peim') || lower.includes('vaso')) return <Syringe className="w-6 h-6 text-orange-600" />;
    if (lower.includes('bio') || lower.includes('colágeno')) return <Syringe className="w-6 h-6 text-cyan-600" />;
    if (lower.includes('prp') || lower.includes('nano')) return <Syringe className="w-6 h-6 text-teal-600" />;
    return <Syringe className="w-6 h-6 text-gray-600" />;
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
      <div data-testid="crm-settings-page" className="p-6 md:p-8 lg:p-12">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Settings className="w-8 h-8 text-muted-foreground" />
            <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-foreground">
              Configurações do CRM
            </h1>
          </div>
          <p className="text-base text-muted-foreground">
            Templates de mensagens e termos de consentimento
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-8 bg-secondary/50 p-1 rounded-xl">
            <TabsTrigger value="messages" className="gap-2 px-6 py-2.5 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm" data-testid="tab-messages">
              <MessageCircle className="w-4 h-4" />Mensagens de CRM
            </TabsTrigger>
            <TabsTrigger value="consent" className="gap-2 px-6 py-2.5 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm" data-testid="tab-consent">
              <Shield className="w-4 h-4" />Termos de consentimento
            </TabsTrigger>
            <TabsTrigger value="letterhead" className="gap-2 px-6 py-2.5 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm" data-testid="tab-letterhead">
              <FileText className="w-4 h-4" />Papel Timbrado
            </TabsTrigger>
          </TabsList>

          {/* ── Messages Tab ── */}
          <TabsContent value="messages">
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {templates.map((template) => (
                <Card key={template.id} data-testid={`crm-template-${template.id}`}
                  className={`rounded-xl p-6 transition-all ${getTemplateColor(template.type)} ${!template.active ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {getTemplateIcon(template.type)}
                      <div>
                        <h3 className="font-medium text-foreground">{template.name}</h3>
                        <span className="text-xs text-muted-foreground capitalize">{template.type.replace('_', ' ')}</span>
                      </div>
                    </div>
                    <Switch checked={template.active} onCheckedChange={() => handleToggleActive(template)} data-testid={`toggle-crm-template-${template.id}`} />
                  </div>
                  <Card className="bg-white/70 p-4 rounded-lg mb-4 border-0">
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">{template.message}</p>
                  </Card>
                  {template.days_interval && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                      <Clock className="w-4 h-4" />Intervalo: <span className="font-medium">{template.days_interval} dias</span>
                    </div>
                  )}
                  <Button variant="outline" className="w-full" onClick={() => { setEditingTemplate(template); setIsEditOpen(true); }} data-testid={`edit-crm-template-${template.id}`}>
                    Editar Template
                  </Button>
                </Card>
              ))}
            </div>
            <Card className="mt-8 bg-blue-50 border-blue-200 rounded-xl p-6">
              <h3 className="font-medium text-blue-900 mb-3">Variáveis Disponíveis</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {PLACEHOLDERS.map(p => (
                  <div key={p.tag} className="flex items-center gap-2">
                    <code className="px-2 py-1 bg-blue-100 rounded text-blue-800 text-sm">{p.tag}</code>
                    <span className="text-sm text-blue-700">{p.description}</span>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          {/* ── Consent Tab ── */}
          <TabsContent value="consent">
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {procedures.map((procedure, index) => (
                <Card key={procedure.id} data-testid={`consent-template-${procedure.id}`}
                  className={`rounded-xl p-6 transition-all ${getProcedureColor(index)}`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {getProcedureIcon(procedure.name)}
                      <div>
                        <h3 className="font-medium text-foreground">{procedure.name}</h3>
                        <span className="text-xs text-muted-foreground">{procedure.duration_minutes} min</span>
                      </div>
                    </div>
                    {procedure.consent_template ? (
                      <span className="flex items-center gap-1 text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full"><CheckCircle className="w-3 h-3" />Configurado</span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-100 px-2 py-1 rounded-full"><Clock className="w-3 h-3" />Pendente</span>
                    )}
                  </div>
                  <Card className="bg-white/70 p-4 rounded-lg mb-4 border-0 max-h-40 overflow-hidden relative">
                    {procedure.consent_template ? (
                      <>
                        <p className="text-sm whitespace-pre-wrap text-muted-foreground line-clamp-6">{procedure.consent_template}</p>
                        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white/90 to-transparent"></div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground/50 italic text-center py-4">Nenhum termo configurado</p>
                    )}
                  </Card>
                  <Button variant="outline" className="w-full gap-2" onClick={() => handleEditConsent(procedure)} data-testid={`edit-consent-${procedure.id}`}>
                    <Pencil className="w-4 h-4" />Editar Termo de Consentimento
                  </Button>
                </Card>
              ))}
            </div>
            <Card className="mt-8 bg-emerald-50 border-emerald-200 rounded-xl p-6">
              <h3 className="font-medium text-emerald-900 mb-3 flex items-center gap-2"><Shield className="w-5 h-5" />Sobre os Termos de Consentimento</h3>
              <div className="text-sm text-emerald-800 space-y-2">
                <p>Cada procedimento pode ter seu próprio termo de consentimento específico, incluindo informações sobre riscos, contraindicações e cuidados pós-procedimento.</p>
                <p>Os termos configurados aqui serão exibidos automaticamente ao assinar o consentimento do paciente no CRM.</p>
              </div>
            </Card>
          </TabsContent>

          {/* ── Letterhead Tab ── */}
          <TabsContent value="letterhead">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">

              {/* Coluna esquerda: formulários */}
              <div className="xl:col-span-2 space-y-6">

                {/* Cabeçalho */}
                <Card className="rounded-xl p-6 border border-border/60">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-border/60">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-primary" />
                      <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Informações do Cabeçalho</h3>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Label className="text-[10px] uppercase text-muted-foreground">Cabeçalho</Label>
                        <Switch checked={letterheadConfig.show_header !== false} onCheckedChange={v => setLh('show_header', v)} data-testid="toggle-show-header" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-[10px] uppercase text-muted-foreground">Rodapé</Label>
                        <Switch checked={letterheadConfig.show_footer !== false} onCheckedChange={v => setLh('show_footer', v)} data-testid="toggle-show-footer" />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label>Cor do Cabeçalho</Label>
                      <div className="flex items-center gap-3 mt-1">
                        <input type="color" value={letterheadConfig.header_color}
                          onChange={e => setLh('header_color', e.target.value)}
                          className="w-10 h-10 rounded cursor-pointer border border-border" data-testid="letterhead-color-input" />
                        <Input value={letterheadConfig.header_color}
                          onChange={e => setLh('header_color', e.target.value)}
                          className="flex-1" data-testid="letterhead-color-text" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>CRO / Registro Profissional</Label>
                        <Input value={letterheadConfig.cro} onChange={e => setLh('cro', e.target.value)} placeholder="Ex: CRO-MG 12345" data-testid="letterhead-cro-input" />
                      </div>
                      <div>
                        <Label>CNPJ</Label>
                        <Input value={letterheadConfig.cnpj} onChange={e => setLh('cnpj', e.target.value)} placeholder="Ex: 12.345.678/0001-00" data-testid="letterhead-cnpj-input" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Endereço</Label>
                        <Input value={letterheadConfig.address} onChange={e => setLh('address', e.target.value)} placeholder="Rua, número - Bairro, Cidade/UF" data-testid="letterhead-address-input" />
                      </div>
                      <div>
                        <Label>E-mail</Label>
                        <Input value={letterheadConfig.email} onChange={e => setLh('email', e.target.value)} placeholder="contato@clinica.com" data-testid="letterhead-email-input" />
                      </div>
                    </div>
                    <div>
                      <Label>Texto do Rodapé do PDF</Label>
                      <Input value={letterheadConfig.footer_text} onChange={e => setLh('footer_text', e.target.value)}
                        placeholder="Ex: Este documento é confidencial e protegido pela LGPD." data-testid="letterhead-footer-input" />
                    </div>
                  </div>
                </Card>

                {/* Margens */}
                <Card className="rounded-xl p-6 border border-border/60">
                  <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border/60">
                    <Maximize className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Margens da Página (mm)</h3>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <NumField label="Superior" value={letterheadConfig.margin_top} onChange={v => setLh('margin_top', v)} unit="mm" min={5} max={50} />
                    <NumField label="Inferior" value={letterheadConfig.margin_bottom} onChange={v => setLh('margin_bottom', v)} unit="mm" min={5} max={50} />
                    <NumField label="Esquerda" value={letterheadConfig.margin_left} onChange={v => setLh('margin_left', v)} unit="mm" min={5} max={50} />
                    <NumField label="Direita" value={letterheadConfig.margin_right} onChange={v => setLh('margin_right', v)} unit="mm" min={5} max={50} />
                  </div>
                </Card>

                {/* Fontes */}
                <Card className="rounded-xl p-6 border border-border/60">
                  <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border/60">
                    <Type className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Tamanhos de Fonte (pt)</h3>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <NumField label="Título principal" value={letterheadConfig.font_size_title} onChange={v => setLh('font_size_title', v)} unit="pt" min={8} max={32} />
                    <NumField label="Subtítulo" value={letterheadConfig.font_size_subtitle} onChange={v => setLh('font_size_subtitle', v)} unit="pt" min={6} max={20} />
                    <NumField label="Título de seção" value={letterheadConfig.font_size_section} onChange={v => setLh('font_size_section', v)} unit="pt" min={6} max={20} />
                    <NumField label="Corpo do texto" value={letterheadConfig.font_size_body} onChange={v => setLh('font_size_body', v)} unit="pt" min={6} max={16} />
                    <NumField label="Texto pequeno" value={letterheadConfig.font_size_small} onChange={v => setLh('font_size_small', v)} unit="pt" min={5} max={12} />
                    <NumField label="Rodapé legal" value={letterheadConfig.font_size_legal} onChange={v => setLh('font_size_legal', v)} unit="pt" min={5} max={12} />
                  </div>
                </Card>

                {/* Espaçamentos */}
                <Card className="rounded-xl p-6 border border-border/60">
                  <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border/60">
                    <AlignLeft className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Espaçamentos (mm)</h3>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <NumField label="Após cabeçalho" value={letterheadConfig.spacing_after_header} onChange={v => setLh('spacing_after_header', v)} unit="mm" min={0} max={20} />
                    <NumField label="Após título" value={letterheadConfig.spacing_after_title} onChange={v => setLh('spacing_after_title', v)} unit="mm" min={0} max={20} />
                    <NumField label="Após seção" value={letterheadConfig.spacing_after_section} onChange={v => setLh('spacing_after_section', v)} unit="mm" min={0} max={20} />
                    <NumField label="Entre seções" value={letterheadConfig.spacing_between_sections} onChange={v => setLh('spacing_between_sections', v)} unit="mm" min={0} max={30} />
                  </div>
                </Card>

                {/* Imagem de fundo */}
                <Card className="rounded-xl p-6 border border-border/60">
                  <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/60">
                    <Image className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Imagem de Fundo (Papel Timbrado)</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">Envie uma imagem PNG/JPG que será usada como fundo do PDF. Ideal: tamanho A4 (210x297mm).</p>
                  <input ref={bgFileInputRef} type="file" accept="image/png,image/jpeg,image/jpg" className="hidden" onChange={handleBgUpload} data-testid="letterhead-bg-file-input" />
                  {letterheadConfig.background_image ? (
                    <div className="space-y-3">
                      <div className="border border-border rounded-lg overflow-hidden bg-gray-50">
                        <img src={letterheadConfig.background_image} alt="Papel timbrado" className="w-full h-auto max-h-64 object-contain" data-testid="letterhead-bg-preview" />
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1 gap-2" onClick={() => bgFileInputRef.current?.click()}>
                          <Upload className="w-4 h-4" />Trocar Imagem
                        </Button>
                        <Button variant="outline" className="gap-2 text-destructive hover:bg-destructive/10"
                          onClick={() => setLh('background_image', '')} data-testid="letterhead-bg-remove">
                          <Trash2 className="w-4 h-4" />Remover
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                      onClick={() => bgFileInputRef.current?.click()} data-testid="letterhead-bg-upload-area">
                      <Image className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                      <p className="text-sm font-medium text-muted-foreground">Clique para enviar imagem de fundo</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">PNG ou JPG, máximo 2MB</p>
                    </div>
                  )}
                </Card>

                <Button onClick={handleSaveLetterhead} className="w-full sm:w-auto bg-primary text-primary-foreground gap-2" disabled={savingLetterhead} data-testid="save-letterhead-button">
                  <Save className="w-4 h-4" />
                  {savingLetterhead ? 'Salvando...' : 'Salvar Papel Timbrado'}
                </Button>
              </div>

              {/* Coluna direita: preview + resumo (fixo) */}
              <div className="xl:col-span-1">
                <div className="sticky top-8 space-y-4">
                  <Card className="p-5 bg-card border border-border/60 shadow-sm rounded-xl">
                    <PDFPreview config={letterheadConfig} clinicName={clinicName} />
                    <p className="text-xs text-muted-foreground text-center mt-3 leading-relaxed">
                      Pré-visualização aproximada. O PDF final pode ter pequenas diferenças.
                    </p>
                  </Card>

                  <Card className="p-4 bg-card border border-border/60 shadow-sm rounded-xl">
                    <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Resumo atual</p>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between"><span className="text-muted-foreground">Margens (T/D/B/E)</span><span>{letterheadConfig.margin_top}/{letterheadConfig.margin_right}/{letterheadConfig.margin_bottom}/{letterheadConfig.margin_left} mm</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Corpo do texto</span><span>{letterheadConfig.font_size_body} pt</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Título</span><span>{letterheadConfig.font_size_title} pt</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Cor principal</span>
                        <span className="flex items-center gap-1.5">
                          <span style={{ background: letterheadConfig.header_color }} className="w-3 h-3 rounded-full inline-block border border-border" />
                          {letterheadConfig.header_color}
                        </span>
                      </div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Imagem de fundo</span><span>{letterheadConfig.background_image ? '✓ Carregada' : '— Nenhuma'}</span></div>
                    </div>
                  </Card>

                  <Card className="bg-emerald-50 border-emerald-200 rounded-xl p-4">
                    <h4 className="font-medium text-emerald-900 mb-2 flex items-center gap-2 text-sm">
                      <FileText className="w-4 h-4" />Como funciona
                    </h4>
                    <ul className="text-xs text-emerald-800 space-y-1">
                      <li>— A imagem de fundo aparece <strong>por trás</strong> do conteúdo</li>
                      <li>— Nome e logo vêm das <strong>Configurações Gerais</strong></li>
                      <li>— Margens e fontes afetam o PDF gerado</li>
                      <li>— Use fundo claro para facilitar a leitura</li>
                    </ul>
                  </Card>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Dialog: Editar Template */}
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
                  <Input value={editingTemplate.name} onChange={e => setEditingTemplate({ ...editingTemplate, name: e.target.value })} data-testid="edit-crm-template-name" />
                </div>
                <div>
                  <Label>Mensagem</Label>
                  <Textarea value={editingTemplate.message} onChange={e => setEditingTemplate({ ...editingTemplate, message: e.target.value })} rows={8} className="font-mono text-sm" data-testid="edit-crm-template-message" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Clique para inserir:</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {PLACEHOLDERS.map(p => (
                      <button key={p.tag} type="button"
                        onClick={() => setEditingTemplate({ ...editingTemplate, message: editingTemplate.message + p.tag })}
                        className="px-2 py-1 bg-secondary rounded text-xs font-mono hover:bg-secondary/80 transition-colors" title={p.description}>
                        {p.tag}
                      </button>
                    ))}
                  </div>
                </div>
                {(editingTemplate.type === 'botox_return' || editingTemplate.type === 'inactive_patient') && (
                  <div>
                    <Label>Intervalo de dias para alerta</Label>
                    <Input type="number" value={editingTemplate.days_interval || ''} onChange={e => setEditingTemplate({ ...editingTemplate, days_interval: parseInt(e.target.value) || null })} data-testid="edit-crm-template-days" />
                    <p className="text-xs text-muted-foreground mt-1">
                      {editingTemplate.type === 'botox_return' ? 'Alerta após X dias do último botox (padrão: 150 = 5 meses)' : 'Alerta após X dias sem procedimentos (padrão: 90 = 3 meses)'}
                    </p>
                  </div>
                )}
                <Button onClick={handleUpdateTemplate} className="w-full bg-primary text-primary-foreground" data-testid="save-crm-template">
                  <Save className="w-4 h-4 mr-2" />Salvar Template
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Dialog: Editar Termo */}
        <Dialog open={isConsentEditOpen} onOpenChange={setIsConsentEditOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden p-0">
            <div className="sticky top-0 bg-card border-b border-border p-6 z-10">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  Termo de Consentimento - {editingProcedure?.name}
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground mt-1">Edite o texto do termo de consentimento específico para este procedimento</p>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <Textarea value={consentText} onChange={e => setConsentText(e.target.value)} rows={20}
                className="text-sm resize-y min-h-[300px]"
                placeholder="Digite o texto do termo de consentimento para este procedimento..."
                data-testid="consent-template-editor" />
            </div>
            <div className="sticky bottom-0 bg-card border-t border-border p-6">
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setIsConsentEditOpen(false)} className="flex-1">Cancelar</Button>
                <Button onClick={handleSaveConsent} className="flex-1 bg-primary text-primary-foreground gap-2" data-testid="save-consent-template">
                  <Save className="w-4 h-4" />Salvar Termo de Consentimento
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default CRMSettings;
