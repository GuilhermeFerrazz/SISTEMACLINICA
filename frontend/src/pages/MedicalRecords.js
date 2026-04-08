import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Html5QrcodeScanner } from 'html5-qrcode';
import Layout from '../components/Layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText, Plus, Search, User, Calendar, ChevronRight, Clock,
  Camera, Trash2, Download, Pencil, ArrowLeft, Save, Shield,
  Syringe, Eye, X, ClipboardList, AlertTriangle, ImagePlus, QrCode
} from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const MedicalRecords = () => {
  const [patients, setPatients] = useState([]);
  const [filteredPatients, setFilteredPatients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [records, setRecords] = useState([]);
  const [procedures, setProcedures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [products, setProducts] = useState([]);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isPhotoViewOpen, setIsPhotoViewOpen] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState('');
  const [isCompressing, setIsCompressing] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanner, setScanner] = useState(null);
  const beforeInputRef = useRef(null);
  const afterInputRef = useRef(null);
  const [formData, setFormData] = useState({
    procedure_id: '', procedure_name: '', date: new Date().toISOString().split('T')[0],
    chief_complaint: '', clinical_notes: '', diagnosis: '', treatment_plan: '',
    products_used: [], // Alterado de products_applied para products_used para manter consistência
    techniques_used: '', observations: '',
    photos_before: [], photos_after: [],
    evolution_notes: '', next_session_notes: '', next_session_date: '',
    payment_amount: '', payment_method: '', payment_status: 'paid'
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchPatients(); fetchProcedures(); fetchProducts(); }, []);

  useEffect(() => {
    if (searchTerm) {
      setFilteredPatients(patients.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.phone.includes(searchTerm) || (p.cpf && p.cpf.includes(searchTerm))
      ));
    } else { setFilteredPatients(patients); }
  }, [searchTerm, patients]);

  const fetchPatients = async () => {
    try {
      const { data } = await axios.get(`${API}/patients`, { withCredentials: true });
      setPatients(data);
      setFilteredPatients(data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const fetchProcedures = async () => {
    try {
      const { data } = await axios.get(`${API}/procedures`, { withCredentials: true });
      setProcedures(data);
    } catch (e) { console.error(e); }
  };

  const fetchProducts = async () => {
    try {
      const { data } = await axios.get(`${API}/products`, { withCredentials: true });
      setProducts(data);
    } catch (e) { console.error(e); }
  };

  const fetchRecords = async (patientId) => {
    try {
      const { data } = await axios.get(`${API}/medical-records/patient/${patientId}`, { withCredentials: true });
      setRecords(data);
    } catch (e) { console.error(e); }
  };

  const handleSelectPatient = (patient) => {
    setSelectedPatient(patient);
    fetchRecords(patient.id);
  };

  const handleBack = () => { setSelectedPatient(null); setRecords([]); };

  const resetForm = () => {
    setFormData({
      procedure_id: '', procedure_name: '', date: new Date().toISOString().split('T')[0],
      chief_complaint: '', clinical_notes: '', diagnosis: '', treatment_plan: '',
      products_used: [], techniques_used: '', observations: '',
      photos_before: [], photos_after: [],
      evolution_notes: '', next_session_notes: '', next_session_date: '',
      payment_amount: '', payment_method: '', payment_status: 'paid'
    });
  };

  const handleProcedureSelect = (procId) => {
    const proc = procedures.find(p => p.id === procId);
    setFormData(prev => ({ 
      ...prev, 
      procedure_id: procId, 
      procedure_name: proc?.name || '',
      payment_amount: proc?.price || ''
    }));
  };

  const addProductUsage = (productId) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    setFormData(prev => {
      const existing = prev.products_used.find(p => p.product_id === productId);
      if (existing) return prev;
      
      const isUI = product.unit === 'UI' || product.name.toLowerCase().includes('botox') || product.name.toLowerCase().includes('toxina');
      
      return {
        ...prev,
        products_used: [...prev.products_used, {
          product_id: product.id,
          product_name: product.name,
          quantity: 1,
          unit: isUI ? 'UI' : 'un',
          batch_number: product.batch_number
        }]
      };
    });
  };

  const removeProductUsage = (index) => {
    setFormData(prev => ({
      ...prev,
      products_used: prev.products_used.filter((_, i) => i !== index)
    }));
  };

  const updateProductQty = (index, qty) => {
    const newProducts = [...formData.products_used];
    newProducts[index].quantity = parseFloat(qty) || 0;
    setFormData(prev => ({ ...prev, products_used: newProducts }));
  };

  const handleScanSuccess = async (decodedText) => {
    try {
      const { data } = await axios.get(`${API}/qr/scan/${decodedText}`, { withCredentials: true });
      const product = data;
      const isUI = product.unit === 'UI' || product.name.toLowerCase().includes('botox') || product.name.toLowerCase().includes('toxina');
      
      setFormData(prev => {
        const existing = prev.products_used.find(p => p.product_id === product.id);
        if (existing) return prev;
        return {
          ...prev,
          products_used: [
            ...prev.products_used,
            { 
              product_id: product.id, 
              product_name: product.name, 
              quantity: 1, 
              unit: isUI ? 'UI' : 'un',
              batch_number: product.batch_number 
            }
          ]
        };
      });
      
      toast.success(`${product.name} adicionado!`);
      closeScanner();
    } catch (error) {
      console.error('Error scanning QR code:', error);
      toast.error('Produto não encontrado');
    }
  };

  const openScanner = () => {
    setIsScannerOpen(true);
    setTimeout(() => {
      const html5QrcodeScanner = new Html5QrcodeScanner(
        'qr-reader-records',
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
      );
      html5QrcodeScanner.render(handleScanSuccess, (error) => {
        // Ignorar erros de scan contínuos para não poluir o console
      });
      setScanner(html5QrcodeScanner);
    }, 500);
  };

  const closeScanner = () => {
    if (scanner) {
      scanner.clear().catch(e => console.error(e));
      setScanner(null);
    }
    setIsScannerOpen(false);
  };

  // Motor de Compressão Web para não estourar o banco do MongoDB
  const compressImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1200; // Limita em Full HD para caber no banco
          const MAX_HEIGHT = 1200;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
          } else {
            if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          // Exporta JPEG com 70% de qualidade (Reduz arquivos de 3MB pra 150KB)
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
      };
    });
  };

  const handlePhotoUpload = async (type, e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    setIsCompressing(true);
    const newPhotos = [];
    
    for (let file of files) {
      if (!file.type.startsWith('image/')) {
        toast.error('Apenas arquivos de imagem são permitidos.');
        continue;
      }
      try {
        const compressedBase64 = await compressImage(file);
        newPhotos.push(compressedBase64);
      } catch (err) {
        toast.error('Erro ao processar uma das imagens.');
      }
    }
    
    if (newPhotos.length > 0) {
      setFormData(prev => ({
        ...prev,
        [type]: [...prev[type], ...newPhotos]
      }));
      toast.success(`${newPhotos.length} foto(s) otimizada(s) e anexada(s)`);
    }
    
    setIsCompressing(false);
    e.target.value = '';
  };

  const removePhoto = (type, index) => {
    setFormData(prev => ({
      ...prev,
      [type]: prev[type].filter((_, i) => i !== index)
    }));
  };

  const handleCreate = async () => {
    if (!formData.procedure_id) { toast.error('Selecione um procedimento'); return; }
    try {
      await axios.post(`${API}/medical-records`, {
        patient_id: selectedPatient.id,
        ...formData
      }, { withCredentials: true });
      toast.success('Prontuário criado com sucesso!');
      setIsCreateOpen(false);
      resetForm();
      fetchRecords(selectedPatient.id);
    } catch (e) { toast.error('Erro ao criar prontuário. O documento pode estar muito grande.'); }
  };

  const handleUpdate = async () => {
    if (!selectedRecord) return;
    try {
      await axios.put(`${API}/medical-records/${selectedRecord.id}`, formData, { withCredentials: true });
      toast.success('Prontuário atualizado!');
      setIsEditOpen(false);
      fetchRecords(selectedPatient.id);
    } catch (e) { toast.error('Erro ao atualizar. O documento pode estar muito grande.'); }
  };

  const handleDelete = async (recordId) => {
    if (!window.confirm('Tem certeza que deseja excluir este prontuário?')) return;
    try {
      await axios.delete(`${API}/medical-records/${recordId}`, { withCredentials: true });
      toast.success('Prontuário excluído');
      fetchRecords(selectedPatient.id);
    } catch (e) { toast.error('Erro ao excluir'); }
  };

  const handleExportRecords = async () => {
    try {
      const { data } = await axios.get(`${API}/medical-records/patient/${selectedPatient.id}/export`, { withCredentials: true });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `prontuario_${selectedPatient.name.replace(/ /g, '_')}.json`;
      a.click(); URL.revokeObjectURL(url);
      toast.success('Prontuários exportados (LGPD)');
    } catch (e) { toast.error('Erro ao exportar'); }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm(`ATENÇÃO: Isso excluirá TODOS os prontuários de ${selectedPatient.name}. Esta ação é irreversível. Deseja continuar?`)) return;
    try {
      await axios.delete(`${API}/medical-records/patient/${selectedPatient.id}/all`, { withCredentials: true });
      toast.success('Todos os prontuários excluídos (LGPD)');
      setRecords([]);
    } catch (e) { toast.error('Erro ao excluir'); }
  };

  const openEdit = (record) => {
    setSelectedRecord(record);
    setFormData({
      procedure_id: record.procedure_id, procedure_name: record.procedure_name,
      date: record.date, chief_complaint: record.chief_complaint || '',
      clinical_notes: record.clinical_notes || '', diagnosis: record.diagnosis || '',
      treatment_plan: record.treatment_plan || '', 
      products_used: record.products_used || [],
      techniques_used: record.techniques_used || '', observations: record.observations || '',
      photos_before: record.photos_before || [], photos_after: record.photos_after || [],
      evolution_notes: record.evolution_notes || '', next_session_notes: record.next_session_notes || '',
      next_session_date: record.next_session_date || '',
      payment_amount: record.payment_amount || '',
      payment_method: record.payment_method || '',
      payment_status: record.payment_status || 'paid'
    });
    setIsEditOpen(true);
  };

  // Photo grid component
  const PhotoGrid = ({ photos, label, type, editable }) => (
    <div>
      <Label className="text-sm font-medium flex items-center gap-2 mb-2">
        <Camera className="w-4 h-4" /> {label} ({photos.length})
      </Label>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo, i) => (
          <div key={i} className="relative group rounded-lg overflow-hidden border border-border aspect-square">
            <img src={photo} alt={`${label} ${i+1}`} className="w-full h-full object-cover cursor-pointer"
              onClick={() => { setViewingPhoto(photo); setIsPhotoViewOpen(true); }}
            />
            {editable && (
              <button onClick={() => removePhoto(type, i)}
                className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        {editable && (
          <button onClick={() => type === 'photos_before' ? beforeInputRef.current?.click() : afterInputRef.current?.click()}
            disabled={isCompressing}
            className={`border-2 border-dashed border-border rounded-lg aspect-square flex flex-col items-center justify-center text-muted-foreground transition-colors ${isCompressing ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary/50 hover:text-primary'}`}>
            {isCompressing ? <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div> : <ImagePlus className="w-6 h-6" />}
            <span className="text-xs mt-1">{isCompressing ? '...' : 'Adicionar'}</span>
          </button>
        )}
      </div>
    </div>
  );

  // Record form fields (shared between create and edit)
  const RecordFormFields = () => (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Procedimento *</Label>
          <Select value={formData.procedure_id} onValueChange={handleProcedureSelect}>
            <SelectTrigger data-testid="record-procedure-select"><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              {procedures.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Data *</Label>
          <Input type="date" value={formData.date} onChange={e => setFormData(prev => ({...prev, date: e.target.value}))} data-testid="record-date-input" />
        </div>
      </div>

      {/* Integração Financeira Rápida */}
      <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 space-y-3">
        <h3 className="text-sm font-medium flex items-center gap-2 text-primary">
          <Download className="w-4 h-4" /> Pagamento e Faturamento
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label className="text-xs">Valor Cobrado (R$)</Label>
            <Input 
              type="number" 
              value={formData.payment_amount} 
              onChange={e => setFormData(prev => ({...prev, payment_amount: e.target.value}))}
              placeholder="0,00"
            />
          </div>
          <div>
            <Label className="text-xs">Forma de Pagamento</Label>
            <Select value={formData.payment_method} onValueChange={val => setFormData(prev => ({...prev, payment_method: val}))}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Pix">Pix</SelectItem>
                <SelectItem value="Cartão de Crédito">Cartão de Crédito</SelectItem>
                <SelectItem value="Cartão de Débito">Cartão de Débito</SelectItem>
                <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                <SelectItem value="Transferência">Transferência</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={formData.payment_status} onValueChange={val => setFormData(prev => ({...prev, payment_status: val}))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="paid">Pago (Recebido)</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div>
        <Label>Queixa Principal</Label>
        <Textarea value={formData.chief_complaint} onChange={e => setFormData(prev => ({...prev, chief_complaint: e.target.value}))}
          placeholder="Queixa principal do paciente..." rows={2} data-testid="record-complaint-input" />
      </div>
      <div>
        <Label>Anotações Clínicas</Label>
        <Textarea value={formData.clinical_notes} onChange={e => setFormData(prev => ({...prev, clinical_notes: e.target.value}))}
          placeholder="Exame clínico, avaliação facial, áreas a tratar..." rows={3} data-testid="record-clinical-notes" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Diagnóstico / Avaliação</Label>
          <Textarea value={formData.diagnosis} onChange={e => setFormData(prev => ({...prev, diagnosis: e.target.value}))}
            placeholder="Diagnóstico estético..." rows={2} data-testid="record-diagnosis" />
        </div>
        <div>
          <Label>Plano de Tratamento</Label>
          <Textarea value={formData.treatment_plan} onChange={e => setFormData(prev => ({...prev, treatment_plan: e.target.value}))}
            placeholder="Plano de tratamento proposto..." rows={2} data-testid="record-treatment-plan" />
        </div>
      </div>
      <div>
        <Label>Técnicas Utilizadas</Label>
        <Textarea value={formData.techniques_used} onChange={e => setFormData(prev => ({...prev, techniques_used: e.target.value}))}
          placeholder="Técnicas, pontos de aplicação, volumes..." rows={2} data-testid="record-techniques" />
      </div>

      {/* Integração com Estoque */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" /> Produtos Utilizados (Baixa Automática)
          </Label>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={openScanner} className="h-8 gap-2 text-xs">
              <QrCode className="w-3 h-3" /> Escanear
            </Button>
            <Select onValueChange={addProductUsage}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="Selecionar..." />
              </SelectTrigger>
              <SelectContent>
                {products.filter(p => p.quantity > 0).map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} (Lote: {p.batch_number})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {formData.products_used.length > 0 ? (
          <div className="space-y-2">
            {formData.products_used.map((p, i) => (
              <div key={i} className="flex items-center justify-between p-2 bg-secondary/20 rounded-lg border border-border/40">
                <div className="flex-1">
                  <p className="text-sm font-medium">{p.product_name}</p>
                  <p className="text-xs text-muted-foreground">Lote: {p.batch_number}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">{p.unit === 'UI' ? 'U.I.:' : 'Qtd:'}</Label>
                    <Input 
                      type="number" 
                      step={p.unit === 'UI' ? '0.1' : '1'}
                      className="w-20 h-8 text-center" 
                      value={p.quantity} 
                      onChange={e => updateProductQty(i, e.target.value)}
                      min="0.1"
                    />
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeProductUsage(i)} className="text-destructive h-8 w-8 p-0">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic bg-secondary/10 p-2 rounded text-center">Nenhum produto vinculado a este atendimento</p>
        )}
      </div>

      {/* Scanner Dialog */}
      <Dialog open={isScannerOpen} onOpenChange={closeScanner}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-primary" /> Escanear Produto
            </DialogTitle>
          </DialogHeader>
          <div id="qr-reader-records" className="w-full overflow-hidden rounded-lg"></div>
          <Button variant="outline" onClick={closeScanner} className="w-full mt-4">Fechar</Button>
        </DialogContent>
      </Dialog>
      <div>
        <Label>Observações</Label>
        <Textarea value={formData.observations} onChange={e => setFormData(prev => ({...prev, observations: e.target.value}))}
          placeholder="Observações durante ou após o procedimento..." rows={2} data-testid="record-observations" />
      </div>
      {/* Photos */}
      <div className="grid grid-cols-2 gap-4">
        <PhotoGrid photos={formData.photos_before} label="Fotos Antes" type="photos_before" editable />
        <PhotoGrid photos={formData.photos_after} label="Fotos Depois" type="photos_after" editable />
      </div>
      <input ref={beforeInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handlePhotoUpload('photos_before', e)} />
      <input ref={afterInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handlePhotoUpload('photos_after', e)} />
      <div>
        <Label>Notas de Evolução</Label>
        <Textarea value={formData.evolution_notes} onChange={e => setFormData(prev => ({...prev, evolution_notes: e.target.value}))}
          placeholder="Evolução do paciente, resultados observados..." rows={2} data-testid="record-evolution" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Orientações Próxima Sessão</Label>
          <Textarea value={formData.next_session_notes} onChange={e => setFormData(prev => ({...prev, next_session_notes: e.target.value}))}
            placeholder="Cuidados pós, retorno..." rows={2} data-testid="record-next-notes" />
        </div>
        <div>
          <Label>Data Próxima Sessão</Label>
          <Input type="date" value={formData.next_session_date} onChange={e => setFormData(prev => ({...prev, next_session_date: e.target.value}))} data-testid="record-next-date" />
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (<Layout><div className="p-6 md:p-8 lg:p-12"><div className="animate-pulse space-y-6"><div className="h-10 bg-muted rounded w-1/4"></div><div className="h-64 bg-muted rounded-xl"></div></div></div></Layout>);
  }

  return (
    <Layout>
      <div data-testid="medical-records-page" className="p-6 md:p-8 lg:p-12">
        {!selectedPatient ? (
          <>
            {/* Patient Selection */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <FileText className="w-8 h-8 text-muted-foreground" />
                <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-foreground">Prontuário Eletrônico</h1>
              </div>
              <p className="text-base text-muted-foreground">Selecione um paciente para acessar o prontuário</p>
            </div>

            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input placeholder="Buscar paciente por nome, telefone ou CPF..." value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)} className="pl-10 h-12 text-lg" data-testid="patient-search" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPatients.map(patient => (
                <Card key={patient.id} data-testid={`patient-select-${patient.id}`}
                  className="p-4 cursor-pointer hover:shadow-md hover:border-primary/30 transition-all border border-border/60"
                  onClick={() => handleSelectPatient(patient)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{patient.name}</p>
                        <p className="text-sm text-muted-foreground">{patient.phone}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </Card>
              ))}
            </div>
            {filteredPatients.length === 0 && (
              <div className="text-center py-16"><User className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-lg text-muted-foreground">Nenhum paciente encontrado</p></div>
            )}
          </>
        ) : (
          <>
            {/* Patient Records View */}
            <div className="mb-8">
              <Button variant="ghost" onClick={handleBack} className="mb-4 gap-2" data-testid="back-to-patients">
                <ArrowLeft className="w-4 h-4" /> Voltar
              </Button>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h1 className="text-3xl font-light tracking-tight text-foreground">{selectedPatient.name}</h1>
                      <p className="text-sm text-muted-foreground">{selectedPatient.phone} {selectedPatient.cpf ? `| CPF: ${selectedPatient.cpf}` : ''}</p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => { resetForm(); setIsCreateOpen(true); }} className="gap-2 bg-primary text-primary-foreground" data-testid="new-record-button">
                    <Plus className="w-4 h-4" /> Novo Prontuário
                  </Button>
                </div>
              </div>
            </div>

            {/* LGPD Actions */}
            <Card className="p-4 mb-6 bg-blue-50 border-blue-200 rounded-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900">LGPD - Direitos do Titular</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={handleExportRecords} data-testid="export-records-button">
                    <Download className="w-3 h-3" /> Exportar Prontuários
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1 text-xs text-destructive hover:bg-destructive/10" onClick={handleDeleteAll} data-testid="delete-all-records-button">
                    <Trash2 className="w-3 h-3" /> Excluir Todos
                  </Button>
                </div>
              </div>
            </Card>

            {/* Records Timeline */}
            {records.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-border rounded-xl">
                <ClipboardList className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-lg text-muted-foreground mb-2">Nenhum prontuário registrado</p>
                <p className="text-sm text-muted-foreground/70">Clique em "Novo Prontuário" para começar</p>
              </div>
            ) : (
              <div className="space-y-4">
                {records.map((record, idx) => (
                  <Card key={record.id} data-testid={`record-card-${record.id}`}
                    className="rounded-xl border border-border/60 overflow-hidden hover:shadow-md transition-all">
                    <div className="flex">
                      {/* Date sidebar */}
                      <div className="w-24 bg-primary/5 flex flex-col items-center justify-center p-3 border-r border-border/60 shrink-0">
                        <Calendar className="w-5 h-5 text-primary mb-1" />
                        <span className="text-xs font-bold text-primary">{new Date(record.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
                        <span className="text-xs text-muted-foreground">{new Date(record.date + 'T12:00:00').getFullYear()}</span>
                      </div>
                      <div className="flex-1 p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-medium text-foreground flex items-center gap-2">
                              <Syringe className="w-4 h-4 text-primary" />
                              {record.procedure_name}
                            </h3>
                            {record.chief_complaint && (
                              <p className="text-sm text-muted-foreground mt-1">Queixa: {record.chief_complaint}</p>
                            )}
                            {record.clinical_notes && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{record.clinical_notes}</p>
                            )}
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                              {record.photos_before?.length > 0 && <span className="flex items-center gap-1"><Camera className="w-3 h-3" /> {record.photos_before.length} antes</span>}
                              {record.photos_after?.length > 0 && <span className="flex items-center gap-1"><Camera className="w-3 h-3" /> {record.photos_after.length} depois</span>}
                              {record.created_by && <span>por {record.created_by}</span>}
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button variant="ghost" size="sm" onClick={() => { setSelectedRecord(record); setIsViewOpen(true); }} data-testid={`view-record-${record.id}`}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => openEdit(record)} data-testid={`edit-record-${record.id}`}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(record.id)} className="text-destructive">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* Create Dialog */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden p-0">
            <div className="sticky top-0 bg-card border-b border-border p-6 z-10">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-primary" /> Novo Prontuário - {selectedPatient?.name}
                </DialogTitle>
              </DialogHeader>
            </div>
            <ScrollArea className="max-h-[65vh] px-6 py-4">
              <RecordFormFields />
            </ScrollArea>
            <div className="sticky bottom-0 bg-card border-t border-border p-4 flex gap-3">
              <Button variant="outline" onClick={() => setIsCreateOpen(false)} className="flex-1">Cancelar</Button>
              <Button onClick={handleCreate} disabled={isCompressing} className="flex-1 bg-primary text-primary-foreground gap-2" data-testid="save-record-button">
                <Save className="w-4 h-4" /> {isCompressing ? 'Processando Imagens...' : 'Salvar Prontuário'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden p-0">
            <div className="sticky top-0 bg-card border-b border-border p-6 z-10">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Pencil className="w-5 h-5 text-primary" /> Editar Prontuário
                </DialogTitle>
              </DialogHeader>
            </div>
            <ScrollArea className="max-h-[65vh] px-6 py-4">
              <RecordFormFields />
            </ScrollArea>
            <div className="sticky bottom-0 bg-card border-t border-border p-4 flex gap-3">
              <Button variant="outline" onClick={() => setIsEditOpen(false)} className="flex-1">Cancelar</Button>
              <Button onClick={handleUpdate} disabled={isCompressing} className="flex-1 bg-primary text-primary-foreground gap-2" data-testid="update-record-button">
                <Save className="w-4 h-4" /> {isCompressing ? 'Processando Imagens...' : 'Atualizar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* View Dialog */}
        <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden p-0">
            <div className="sticky top-0 bg-card border-b border-border p-6 z-10">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-primary" /> Prontuário - {selectedRecord?.procedure_name}
                </DialogTitle>
              </DialogHeader>
            </div>
            {selectedRecord && (
              <ScrollArea className="max-h-[70vh] px-6 py-4">
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-secondary/30 p-3 rounded-lg">
                      <p className="text-xs text-muted-foreground">Data</p>
                      <p className="font-medium">{new Date(selectedRecord.date + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                    </div>
                    <div className="bg-secondary/30 p-3 rounded-lg">
                      <p className="text-xs text-muted-foreground">Procedimento</p>
                      <p className="font-medium">{selectedRecord.procedure_name}</p>
                    </div>
                  </div>

                  {selectedRecord.chief_complaint && (
                    <div><Label className="text-xs text-muted-foreground">Queixa Principal</Label>
                      <p className="text-sm mt-1">{selectedRecord.chief_complaint}</p></div>
                  )}
                  {selectedRecord.clinical_notes && (
                    <div><Label className="text-xs text-muted-foreground">Anotações Clínicas</Label>
                      <p className="text-sm mt-1 whitespace-pre-wrap">{selectedRecord.clinical_notes}</p></div>
                  )}
                  {selectedRecord.diagnosis && (
                    <div><Label className="text-xs text-muted-foreground">Diagnóstico</Label>
                      <p className="text-sm mt-1">{selectedRecord.diagnosis}</p></div>
                  )}
                  {selectedRecord.treatment_plan && (
                    <div><Label className="text-xs text-muted-foreground">Plano de Tratamento</Label>
                      <p className="text-sm mt-1">{selectedRecord.treatment_plan}</p></div>
                  )}
                  {selectedRecord.techniques_used && (
                    <div><Label className="text-xs text-muted-foreground">Técnicas Utilizadas</Label>
                      <p className="text-sm mt-1">{selectedRecord.techniques_used}</p></div>
                  )}
                  {selectedRecord.observations && (
                    <div><Label className="text-xs text-muted-foreground">Observações</Label>
                      <p className="text-sm mt-1">{selectedRecord.observations}</p></div>
                  )}

                  {/* Produtos Utilizados */}
                  {selectedRecord.products_used?.length > 0 && (
                    <div className="bg-primary/5 p-3 rounded-lg border border-primary/10">
                      <Label className="text-xs text-primary font-medium flex items-center gap-1 mb-2">
                        <Plus className="w-3 h-3" /> Produtos Utilizados
                      </Label>
                      <div className="space-y-1">
                        {selectedRecord.products_used.map((p, i) => (
                          <div key={i} className="flex justify-between text-sm">
	                            <span>{p.product_name} <span className="text-xs text-muted-foreground">(Lote: {p.batch_number})</span></span>
	                            <span className="font-medium">{p.quantity} {p.unit || 'un'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Dados Financeiros */}
                  {selectedRecord.payment_amount > 0 && (
                    <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                      <Label className="text-xs text-green-700 font-medium flex items-center gap-1 mb-1">
                        <Download className="w-3 h-3" /> Faturamento do Atendimento
                      </Label>
                      <div className="flex justify-between items-center">
                        <p className="text-lg font-bold text-green-800">R$ {parseFloat(selectedRecord.payment_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-200 text-green-800 font-medium">
                          {selectedRecord.payment_method} - {selectedRecord.payment_status === 'paid' ? 'Pago' : 'Pendente'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Photos */}
                  {(selectedRecord.photos_before?.length > 0 || selectedRecord.photos_after?.length > 0) && (
                    <div className="grid grid-cols-2 gap-4">
                      {selectedRecord.photos_before?.length > 0 && (
                        <PhotoGrid photos={selectedRecord.photos_before} label="Fotos Antes" type="photos_before" editable={false} />
                      )}
                      {selectedRecord.photos_after?.length > 0 && (
                        <PhotoGrid photos={selectedRecord.photos_after} label="Fotos Depois" type="photos_after" editable={false} />
                      )}
                    </div>
                  )}

                  {selectedRecord.evolution_notes && (
                    <div><Label className="text-xs text-muted-foreground">Notas de Evolução</Label>
                      <p className="text-sm mt-1 whitespace-pre-wrap">{selectedRecord.evolution_notes}</p></div>
                  )}
                  {selectedRecord.next_session_notes && (
                    <div><Label className="text-xs text-muted-foreground">Próxima Sessão</Label>
                      <p className="text-sm mt-1">{selectedRecord.next_session_notes}</p>
                      {selectedRecord.next_session_date && <p className="text-xs text-muted-foreground mt-1">Data: {new Date(selectedRecord.next_session_date + 'T12:00:00').toLocaleDateString('pt-BR')}</p>}
                    </div>
                  )}

                  <div className="border-t border-border pt-3 text-xs text-muted-foreground">
                    <p>Criado por: {selectedRecord.created_by} em {new Date(selectedRecord.created_at).toLocaleString('pt-BR')}</p>
                    {selectedRecord.updated_by && <p>Atualizado por: {selectedRecord.updated_by} em {new Date(selectedRecord.updated_at).toLocaleString('pt-BR')}</p>}
                  </div>
                </div>
              </ScrollArea>
            )}
          </DialogContent>
        </Dialog>

        {/* Photo Viewer */}
        <Dialog open={isPhotoViewOpen} onOpenChange={setIsPhotoViewOpen}>
          <DialogContent className="max-w-4xl p-2 bg-black/90 border-none shadow-none">
            <img src={viewingPhoto} alt="Foto do prontuário" className="w-full max-h-[85vh] object-contain rounded-lg" />
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default MedicalRecords;
