import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import Layout from '../components/Layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  User, Stethoscope, Package, DollarSign, ChevronRight,
  Plus, Trash2, AlertTriangle, CheckCircle, Clock, Search, ArrowLeft,
  Camera, ImagePlus, X, Download, Timer, Activity
} from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const OPTS = { withCredentials: true };

const METODOS = ['Pix', 'Dinheiro', 'Cartão de Crédito', 'Cartão de Débito', 'Transferência'];
const STATUS_PAG = [
  { value: 'paid', label: 'Pago' },
  { value: 'pending', label: 'Pendente' },
  { value: 'partial', label: 'Parcial' },
];

const EMPTY_ANAM = {
  queixa_principal: '', historia_atual: '', medicamentos_uso: '',
  alergias_informadas: '', antecedentes_esteticos: '',
  gestante_lactante: false, doencas_cronicas: '', cirurgias_previas: '',
  uso_anticoagulantes: false, herpes_labial: false, fumante: false,
  expectativas: '', foto_autorizada: true,
};

const EMPTY_FORM = {
  procedure_id: '', procedure_name: '', date: new Date().toISOString().split('T')[0],
  chief_complaint: '', clinical_notes: '',
  diagnosis: '', treatment_plan: '',
  techniques_used: '', observations: '',
  evolution_notes: '',
  next_session_notes: '', next_session_date: '',
  photos_before: [], photos_after: [],
  payment_amount: '', payment_method: 'Pix', payment_status: 'paid',
};

const fmtTimer = (sec) => {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600).toString().padStart(2, '0');
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${h}:${m}:${ss}`;
};

const fmtBRL = (v) => `R$ ${(parseFloat(v) || 0).toFixed(2).replace('.', ',')}`;

// Compressão de imagem para não estourar o banco
const compressImage = (file) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 1200;
        let w = img.width, h = img.height;
        if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } }
        else { if (h > MAX) { w *= MAX / h; h = MAX; } }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
    };
  });

export default function Atendimento() {
  const { patientId: patientIdParam, appointmentId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isFromAgenda = location.pathname.includes('/atendimento/agenda/');

  const [appointment, setAppointment] = useState(null);
  const [patient, setPatient] = useState(null);
  const [procedures, setProcedures] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('anamnese');
  const [anam, setAnam] = useState(EMPTY_ANAM);
  const [form, setForm] = useState(EMPTY_FORM);
  const [prodsUsed, setProdsUsed] = useState([]);
  const [search, setSearch] = useState('');
  const [procPrice, setProcPrice] = useState('');
  const [discount, setDiscount] = useState('');
  const [isCompressing, setIsCompressing] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState('');
  const [savedRecord, setSavedRecord] = useState(null);

  // Cronômetro
  const startedAtRef = useRef(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerRef = useRef(null);
  const [endedAt, setEndedAt] = useState(null);

  const beforeInputRef = useRef(null);
  const afterInputRef = useRef(null);

  // Inicia cronômetro ao montar
  useEffect(() => {
    startedAtRef.current = new Date();
    timerRef.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAtRef.current.getTime()) / 1000));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let pid = patientIdParam;
      let apt = null;
      if (isFromAgenda && appointmentId) {
        const r = await axios.get(`${API}/appointments/${appointmentId}`, OPTS);
        apt = r.data;
        pid = apt.patient_id;
        setAppointment(apt);
      }
      const [patR, procR, prodR, anamR] = await Promise.all([
        axios.get(`${API}/patients/${pid}`, OPTS),
        axios.get(`${API}/procedures`, OPTS),
        axios.get(`${API}/products`, OPTS),
        axios.get(`${API}/patients/${pid}/anamnese`, OPTS).catch(() => ({ data: {} })),
      ]);
      setPatient(patR.data);
      setProcedures(procR.data || []);
      setProducts((prodR.data || []).filter(p => p.quantity > 0));
      if (anamR.data?.anamnese) {
        setAnam({ ...EMPTY_ANAM, ...anamR.data.anamnese });
        toast.info('Anamnese pré-preenchida da última consulta');
      }
      // Pré-seleciona procedimento do agendamento
      if (apt && apt.procedure_id) {
        const proc = (procR.data || []).find(p => p.id === apt.procedure_id);
        if (proc) {
          setForm(f => ({ ...f, procedure_id: proc.id, procedure_name: proc.name, date: apt.date || f.date }));
          if (proc.price) setProcPrice(String(proc.price));
        }
      }
    } catch (e) {
      console.error(e);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [patientIdParam, appointmentId, isFromAgenda]);

  useEffect(() => { load(); }, [load]);

  const selectProc = (proc) => {
    setForm(f => ({ ...f, procedure_id: proc.id, procedure_name: proc.name }));
    if (proc.price) setProcPrice(String(proc.price));
  };

  const addProd = (prod) => {
    if (prodsUsed.find(p => p.product_id === prod.id)) { toast.error('Já adicionado'); return; }
    setProdsUsed(prev => [...prev, {
      product_id: prod.id, product_name: prod.name,
      quantity: prod.unit === 'UI' ? 50 : 1,
      unit: prod.unit || 'un', batch_number: prod.batch_number || '',
      available: prod.quantity,
    }]);
    setSearch('');
  };

  const total = Math.max(0, (parseFloat(procPrice) || 0) - (parseFloat(discount) || 0));
  useEffect(() => {
    if (total > 0) setForm(f => ({ ...f, payment_amount: total.toFixed(2) }));
  }, [total]);

  const handlePhotoUpload = async (type, e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setIsCompressing(true);
    const newPhotos = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      try { newPhotos.push(await compressImage(file)); }
      catch { toast.error('Erro ao processar imagem'); }
    }
    if (newPhotos.length) {
      setForm(f => ({ ...f, [type]: [...f[type], ...newPhotos] }));
      toast.success(`${newPhotos.length} foto(s) anexada(s)`);
    }
    setIsCompressing(false);
    e.target.value = '';
  };

  const removePhoto = (type, idx) => {
    setForm(f => ({ ...f, [type]: f[type].filter((_, i) => i !== idx) }));
  };

  const save = async () => {
    if (!form.procedure_id) {
      toast.error('Selecione um procedimento');
      setTab('procedimento');
      return;
    }
    for (const p of prodsUsed) {
      if (p.quantity > p.available) {
        toast.error(`Estoque insuficiente: ${p.product_name}`);
        setTab('produtos');
        return;
      }
    }

    // Encerra cronômetro
    const endTime = new Date();
    const duration = Math.floor((endTime.getTime() - startedAtRef.current.getTime()) / 1000);
    setEndedAt(endTime);
    if (timerRef.current) clearInterval(timerRef.current);

    setSaving(true);
    try {
      const payload = {
        ...form,
        patient_id: patient.id,
        payment_amount: form.payment_amount ? parseFloat(form.payment_amount) : null,
        payment_discount: discount ? parseFloat(discount) : null,
        anamnese: anam,
        products_used: prodsUsed.map(({ product_id, product_name, quantity, unit, batch_number }) =>
          ({ product_id, product_name, quantity, unit, batch_number })),
        consultation_started_at: startedAtRef.current.toISOString(),
        consultation_ended_at: endTime.toISOString(),
        consultation_duration_seconds: duration,
      };
      if (isFromAgenda && appointmentId) payload.appointment_id = appointmentId;
      if (!payload.next_session_date) delete payload.next_session_date;

      const { data } = await axios.post(`${API}/medical-records`, payload, OPTS);
      setSavedRecord(data);
      toast.success('Atendimento finalizado!');
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.detail || 'Erro ao salvar');
      // Reinicia cronômetro em caso de falha
      timerRef.current = setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - startedAtRef.current.getTime()) / 1000));
      }, 1000);
    } finally {
      setSaving(false);
    }
  };

  const downloadReceipt = async () => {
    if (!savedRecord?.id) return;
    try {
      const r = await axios.get(`${API}/medical-records/${savedRecord.id}/receipt-pdf`, {
        ...OPTS, responseType: 'blob'
      });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recibo_${patient?.name?.replace(/ /g, '_') || 'paciente'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Recibo gerado');
    } catch {
      toast.error('Erro ao gerar recibo');
    }
  };

  const filtProd = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  if (loading) return (
    <Layout>
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Carregando consulta...</p>
        </div>
      </div>
    </Layout>
  );

  return (
    <Layout>
      <div data-testid="atendimento-page" className="p-4 md:p-8 max-w-5xl mx-auto overflow-x-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate(-1)}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              data-testid="back-button"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold truncate flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Consulta em andamento
              </h1>
              {patient && (
                <p className="text-sm text-muted-foreground truncate">
                  {patient.name}
                  {appointment && (
                    <> · agendado {new Date(appointment.date + 'T00:00:00').toLocaleDateString('pt-BR')} {appointment.time}</>
                  )}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {/* Timer */}
            <div
              data-testid="consultation-timer"
              className={`px-4 py-2 rounded-lg font-mono font-bold text-sm flex items-center gap-2 border ${
                endedAt
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-primary/10 border-primary/30 text-primary animate-pulse'
              }`}
            >
              <Timer className="w-4 h-4" />
              {fmtTimer(elapsedSec)}
            </div>
            <Button
              onClick={save}
              disabled={saving || !!savedRecord}
              className="gap-2"
              data-testid="finalize-consultation-button"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Finalizar
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Info paciente + data */}
        {patient && (
          <Card className="p-4 mb-5 border border-border/60 bg-muted/20">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{patient.name}</p>
                  <p className="text-xs text-muted-foreground">{patient.phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Data</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-36 h-8 text-sm"
                  data-testid="record-date-input"
                />
              </div>
            </div>
            {(patient.allergies || anam.alergias_informadas) && (
              <div className="mt-2 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-md">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Alergias: {patient.allergies || anam.alergias_informadas}</span>
              </div>
            )}
          </Card>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-5 flex flex-wrap h-auto gap-1">
            <TabsTrigger value="anamnese" className="gap-1.5 text-xs sm:text-sm" data-testid="tab-anamnese">
              <User className="w-3.5 h-3.5" />Anamnese
            </TabsTrigger>
            <TabsTrigger value="procedimento" className="gap-1.5 text-xs sm:text-sm" data-testid="tab-procedimento">
              <Stethoscope className="w-3.5 h-3.5" />Procedimento
            </TabsTrigger>
            <TabsTrigger value="fotos" className="gap-1.5 text-xs sm:text-sm" data-testid="tab-fotos">
              <Camera className="w-3.5 h-3.5" />Fotos
              {(form.photos_before.length + form.photos_after.length) > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-xs">
                  {form.photos_before.length + form.photos_after.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="produtos" className="gap-1.5 text-xs sm:text-sm" data-testid="tab-produtos">
              <Package className="w-3.5 h-3.5" />Produtos
              {prodsUsed.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-xs">{prodsUsed.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="orcamento" className="gap-1.5 text-xs sm:text-sm" data-testid="tab-orcamento">
              <DollarSign className="w-3.5 h-3.5" />Orçamento
            </TabsTrigger>
          </TabsList>

          {/* ANAMNESE */}
          <TabsContent value="anamnese" className="space-y-4">
            <Card className="p-5 border border-border/60 space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Queixa e História</h3>
              {[
                { key: 'queixa_principal', label: 'Queixa Principal', rows: 2, ph: 'O que traz o paciente hoje?' },
                { key: 'historia_atual', label: 'História Atual', rows: 3, ph: 'Evolução, tratamentos anteriores...' },
                { key: 'expectativas', label: 'Expectativas do Paciente', rows: 2, ph: 'O que o paciente espera?' },
              ].map(({ key, label, rows, ph }) => (
                <div key={key}>
                  <Label>{label}</Label>
                  <Textarea
                    rows={rows}
                    placeholder={ph}
                    value={anam[key]}
                    onChange={e => setAnam(a => ({ ...a, [key]: e.target.value }))}
                    data-testid={`anam-${key}`}
                  />
                </div>
              ))}
            </Card>

            <Card className="p-5 border border-border/60 space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Histórico de Saúde</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { key: 'medicamentos_uso', label: 'Medicamentos em uso', ph: 'Medicamentos e doses' },
                  { key: 'alergias_informadas', label: 'Alergias conhecidas', ph: 'Medicamentos, substâncias...' },
                  { key: 'doencas_cronicas', label: 'Doenças crônicas', ph: 'Diabetes, hipertensão...' },
                  { key: 'cirurgias_previas', label: 'Cirurgias / Procedimentos prévios', ph: 'Cirurgias anteriores, implantes...' },
                  { key: 'antecedentes_esteticos', label: 'Antecedentes Estéticos', ph: 'Botox prévio, preenchimento...' },
                ].map(({ key, label, ph }) => (
                  <div key={key}>
                    <Label>{label}</Label>
                    <Textarea
                      rows={2}
                      placeholder={ph}
                      value={anam[key]}
                      onChange={e => setAnam(a => ({ ...a, [key]: e.target.value }))}
                      data-testid={`anam-${key}`}
                    />
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5 border border-border/60 space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Contraindicações</h3>
              {[
                { key: 'gestante_lactante', label: 'Gestante ou amamentando', alert: true },
                { key: 'uso_anticoagulantes', label: 'Uso de anticoagulantes', alert: true },
                { key: 'herpes_labial', label: 'Histórico de herpes labial', alert: true },
                { key: 'fumante', label: 'Fumante', alert: false },
                { key: 'foto_autorizada', label: 'Autoriza uso de fotos', alert: false },
              ].map(({ key, label, alert }) => (
                <div key={key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {alert && anam[key] && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                    <span className={`text-sm ${alert && anam[key] ? 'text-amber-700 font-medium' : ''}`}>{label}</span>
                  </div>
                  <Switch
                    checked={!!anam[key]}
                    onCheckedChange={v => setAnam(a => ({ ...a, [key]: v }))}
                    data-testid={`switch-${key}`}
                  />
                </div>
              ))}
            </Card>
            <div className="flex justify-end">
              <Button onClick={() => setTab('procedimento')} className="gap-2">
                Procedimento <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </TabsContent>

          {/* PROCEDIMENTO */}
          <TabsContent value="procedimento" className="space-y-4">
            <Card className="p-5 border border-border/60 space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Procedimento *</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {procedures.map(proc => (
                  <button
                    key={proc.id}
                    type="button"
                    onClick={() => selectProc(proc)}
                    className={`p-3 rounded-lg border text-left text-sm transition-all ${
                      form.procedure_id === proc.id
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border/60 hover:border-primary/50'
                    }`}
                    data-testid={`proc-${proc.id}`}
                  >
                    <div className="font-medium truncate">{proc.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />{proc.duration_minutes} min
                      {proc.price && <span>· R$ {Number(proc.price).toFixed(2).replace('.', ',')}</span>}
                    </div>
                  </button>
                ))}
              </div>

              {[
                { key: 'chief_complaint', label: 'Queixa / Motivo da Consulta', rows: 2, ph: 'Resumo da queixa...' },
                { key: 'clinical_notes', label: 'Anotações Clínicas / Exame', rows: 3, ph: 'Exame clínico, avaliação facial, áreas a tratar...' },
                { key: 'diagnosis', label: 'Diagnóstico / Avaliação', rows: 2, ph: 'Diagnóstico estético...' },
                { key: 'treatment_plan', label: 'Plano de Tratamento', rows: 2, ph: 'Plano proposto...' },
                { key: 'techniques_used', label: 'Técnicas Utilizadas', rows: 2, ph: 'Retroinjeção, ponto a ponto, cânula...' },
                { key: 'observations', label: 'Recomendações pós-procedimento', rows: 3, ph: 'Cuidados, retorno, orientações...' },
                { key: 'evolution_notes', label: 'Notas de Evolução', rows: 2, ph: 'Resultados observados, evolução...' },
                { key: 'next_session_notes', label: 'Notas para Próxima Sessão', rows: 2, ph: 'O que fazer na próxima visita...' },
              ].map(({ key, label, rows, ph }) => (
                <div key={key}>
                  <Label>{label}</Label>
                  <Textarea
                    rows={rows}
                    placeholder={ph}
                    value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    data-testid={`field-${key}`}
                  />
                </div>
              ))}
              <div>
                <Label>Data da Próxima Sessão</Label>
                <Input
                  type="date"
                  value={form.next_session_date}
                  onChange={e => setForm(f => ({ ...f, next_session_date: e.target.value }))}
                  className="max-w-xs"
                />
              </div>
            </Card>
            <div className="flex justify-end">
              <Button onClick={() => setTab('fotos')} className="gap-2">
                Fotos <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </TabsContent>

          {/* FOTOS */}
          <TabsContent value="fotos" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { type: 'photos_before', label: 'Fotos Antes', ref: beforeInputRef },
                { type: 'photos_after', label: 'Fotos Depois', ref: afterInputRef },
              ].map(({ type, label, ref }) => (
                <Card key={type} className="p-5 border border-border/60">
                  <Label className="text-sm font-medium flex items-center gap-2 mb-3">
                    <Camera className="w-4 h-4" /> {label} ({form[type].length})
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    {form[type].map((photo, i) => (
                      <div key={i} className="relative group rounded-lg overflow-hidden border border-border aspect-square">
                        <img
                          src={photo}
                          alt={`${label} ${i + 1}`}
                          className="w-full h-full object-cover cursor-pointer"
                          onClick={() => setViewingPhoto(photo)}
                        />
                        <button
                          onClick={() => removePhoto(type, i)}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => ref.current?.click()}
                      disabled={isCompressing}
                      className={`border-2 border-dashed border-border rounded-lg aspect-square flex flex-col items-center justify-center text-muted-foreground transition-colors ${isCompressing ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary/50 hover:text-primary'}`}
                      data-testid={`add-${type}`}
                    >
                      {isCompressing ? (
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                      ) : (
                        <ImagePlus className="w-6 h-6" />
                      )}
                      <span className="text-xs mt-1">{isCompressing ? '...' : 'Adicionar'}</span>
                    </button>
                  </div>
                  <input
                    ref={ref}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={e => handlePhotoUpload(type, e)}
                  />
                </Card>
              ))}
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setTab('produtos')} className="gap-2">
                Produtos <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </TabsContent>

          {/* PRODUTOS */}
          <TabsContent value="produtos" className="space-y-4">
            <Card className="p-5 border border-border/60">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-4">
                Buscar Produto do Estoque (Baixa Automática)
              </h3>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Pesquisar produto..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  data-testid="product-search-input"
                />
              </div>
              {search && (
                <div className="border border-border/60 rounded-lg overflow-hidden max-h-52 overflow-y-auto mb-4">
                  {filtProd.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground text-center">Nenhum produto encontrado</p>
                  ) : filtProd.map(prod => (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => addProd(prod)}
                      className="w-full p-3 text-left hover:bg-muted/50 border-b border-border/30 last:border-0 flex items-center justify-between"
                      data-testid={`add-product-${prod.id}`}
                    >
                      <div>
                        <p className="text-sm font-medium">{prod.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Lote: {prod.batch_number} · Estoque:{' '}
                          <span className={prod.quantity < 20 ? 'text-amber-600 font-medium' : 'text-green-600 font-medium'}>
                            {prod.quantity} {prod.unit}
                          </span>
                        </p>
                      </div>
                      <Plus className="w-4 h-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}

              {prodsUsed.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-border/60 rounded-lg">
                  <Package className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Pesquise e adicione produtos utilizados</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">Produtos adicionados:</p>
                  {prodsUsed.map(pu => {
                    const over = pu.quantity > pu.available;
                    return (
                      <div
                        key={pu.product_id}
                        className={`flex items-center gap-3 p-3 rounded-lg border ${
                          over ? 'border-red-300 bg-red-50' : 'border-border/60 bg-muted/10'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{pu.product_name}</p>
                          <p className="text-xs text-muted-foreground">Disponível: {pu.available} {pu.unit}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Input
                            type="number"
                            step={pu.unit === 'UI' ? 1 : 0.5}
                            min={0.5}
                            max={pu.available}
                            value={pu.quantity}
                            onChange={e => setProdsUsed(prev => prev.map(p =>
                              p.product_id === pu.product_id ? { ...p, quantity: Number(e.target.value) } : p
                            ))}
                            className={`w-24 h-8 text-sm text-center ${over ? 'border-red-400' : ''}`}
                            data-testid={`qty-${pu.product_id}`}
                          />
                          <span className="text-xs text-muted-foreground w-6">{pu.unit}</span>
                          <button
                            onClick={() => setProdsUsed(prev => prev.filter(p => p.product_id !== pu.product_id))}
                            className="text-red-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        {over && <p className="w-full text-xs text-red-500">Excede o estoque disponível!</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
            <div className="flex justify-end">
              <Button onClick={() => setTab('orcamento')} className="gap-2">
                Orçamento <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </TabsContent>

          {/* ORÇAMENTO */}
          <TabsContent value="orcamento" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-5 border border-border/60 space-y-4">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Orçamento</h3>
                <div>
                  <Label>Valor do Procedimento (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={procPrice}
                    onChange={e => setProcPrice(e.target.value)}
                    data-testid="procedure-price-input"
                  />
                </div>
                <div>
                  <Label>Desconto (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={discount}
                    onChange={e => setDiscount(e.target.value)}
                    data-testid="discount-input"
                  />
                </div>
                <div className="border-t pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Procedimento</span>
                    <span>{fmtBRL(procPrice)}</span>
                  </div>
                  {parseFloat(discount) > 0 && (
                    <div className="flex justify-between text-sm text-red-500">
                      <span>Desconto</span>
                      <span>- {fmtBRL(discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Total</span>
                    <span className="text-primary" data-testid="total-amount">{fmtBRL(total)}</span>
                  </div>
                </div>
              </Card>

              <Card className="p-5 border border-border/60 space-y-4">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Pagamento</h3>
                <div>
                  <Label>Valor Cobrado (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.payment_amount}
                    onChange={e => setForm(f => ({ ...f, payment_amount: e.target.value }))}
                    data-testid="payment-amount-input"
                  />
                </div>
                <div>
                  <Label className="mb-2 block">Forma de Pagamento</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {METODOS.map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, payment_method: m }))}
                        className={`p-2 rounded-lg border text-sm transition-all ${
                          form.payment_method === m
                            ? 'border-primary bg-primary/10 text-primary font-medium'
                            : 'border-border/60 hover:border-primary/50'
                        }`}
                        data-testid={`payment-method-${m}`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="mb-2 block">Status</Label>
                  <div className="flex gap-2 flex-wrap">
                    {STATUS_PAG.map(s => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, payment_status: s.value }))}
                        className={`px-4 py-2 rounded-lg border text-sm transition-all ${
                          form.payment_status === s.value
                            ? 'border-primary bg-primary/10 text-primary font-medium'
                            : 'border-border/60 hover:border-primary/50'
                        }`}
                        data-testid={`payment-status-${s.value}`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </Card>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={save}
                disabled={saving || !!savedRecord}
                size="lg"
                className="gap-2"
                data-testid="finalize-consultation-button-bottom"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Finalizar Atendimento
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {/* Dialog de sucesso após salvar */}
        <Dialog open={!!savedRecord} onOpenChange={(o) => { if (!o) navigate('/agenda'); }}>
          <DialogContent className="max-w-md" data-testid="success-dialog">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-700">
                <CheckCircle className="w-6 h-6" />
                Atendimento Finalizado
              </DialogTitle>
              <DialogDescription>
                Tudo foi registrado com sucesso.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded-lg bg-muted/30 border border-border/40">
                  <p className="text-xs text-muted-foreground">Duração</p>
                  <p className="font-mono font-bold text-primary">{fmtTimer(elapsedSec)}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border border-border/40">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="font-bold text-primary">{fmtBRL(form.payment_amount)}</p>
                </div>
              </div>
              {prodsUsed.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  ✓ {prodsUsed.length} produto(s) com baixa de estoque
                </p>
              )}
              {parseFloat(form.payment_amount) > 0 && (
                <p className="text-xs text-muted-foreground">✓ Lançamento financeiro criado</p>
              )}
              {isFromAgenda && (
                <p className="text-xs text-muted-foreground">✓ Agendamento marcado como concluído</p>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                onClick={downloadReceipt}
                variant="outline"
                className="flex-1 gap-2"
                data-testid="download-receipt-button"
              >
                <Download className="w-4 h-4" />
                Baixar Recibo PDF
              </Button>
              <Button
                onClick={() => navigate('/agenda')}
                className="flex-1 gap-2"
                data-testid="back-to-agenda-button"
              >
                Voltar à Agenda
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Photo viewer */}
        {viewingPhoto && (
          <Dialog open={!!viewingPhoto} onOpenChange={() => setViewingPhoto('')}>
            <DialogContent className="max-w-3xl p-2">
              <img src={viewingPhoto} alt="Foto" className="w-full h-auto rounded" />
            </DialogContent>
          </Dialog>
        )}
      </div>
    </Layout>
  );
}
