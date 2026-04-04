import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Settings as SettingsIcon, Upload, Save, Image, Tag, Ruler, Type, LayoutTemplate, Eye } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DEFAULT_LABEL_CONFIG = {
  label_width: 50,
  label_height: 30,
  qr_size: 18,
  qr_position: 'right',
  font_size_name: 9,
  font_size_label: 5,
  font_size_value: 6.5,
  font_size_responsible: 5,
  show_expiration: true,
  show_fill_date: true,
  show_batch: true,
  show_responsible: true,
  show_logo: false,
  padding: 1.5,
};

const SAMPLE_PRODUCT = {
  name: 'Alcool 70%',
  expiration_date: '2026-06-30',
  fill_date: '2026-03-29',
  batch_number: 'ENV001',
  responsible: 'Dr. Guilherme Ferraz',
  qr_code_id: 'sample',
  id: 'sample',
};

const LabelLivePreview = ({ config, settings }) => {
  const c = { ...DEFAULT_LABEL_CONFIG, ...config };
  const product = SAMPLE_PRODUCT;
  const responsible = product.responsible || settings?.responsible_name || '';
  const logoUrl = settings?.logo_url || '';
  const hasFillDate = c.show_fill_date && product.fill_date;
  const isQrLeft = c.qr_position === 'left';

  const qrBlock = (
    <div
      style={{
        width: `${c.qr_size + 2}mm`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {/* Placeholder QR for preview */}
      <div
        style={{
          width: `${c.qr_size}mm`,
          height: `${c.qr_size}mm`,
          background: `
            linear-gradient(45deg, #000 25%, transparent 25%),
            linear-gradient(-45deg, #000 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #000 75%),
            linear-gradient(-45deg, transparent 75%, #000 75%)
          `,
          backgroundSize: '4px 4px',
          backgroundPosition: '0 0, 0 2px, 2px -2px, -2px 0px',
          border: '2px solid black',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ background: 'white', padding: '1px 2px', fontSize: '5px', fontWeight: 'bold' }}>QR</div>
      </div>
    </div>
  );

  const infoBlock = (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        gap: '0.3mm',
        paddingLeft: isQrLeft ? '1.5mm' : 0,
        paddingRight: isQrLeft ? 0 : '1.5mm',
      }}
    >
      {c.show_expiration && (
        <div>
          <div style={{ fontSize: `${c.font_size_label}px`, fontWeight: 'bold', textTransform: 'uppercase' }}>
            Validade
          </div>
          <div style={{ fontSize: `${c.font_size_value}px`, fontWeight: 'bold' }}>
            {new Date(product.expiration_date + 'T00:00:00').toLocaleDateString('pt-BR')}
          </div>
        </div>
      )}

      {hasFillDate && (
        <div>
          <div style={{ fontSize: `${c.font_size_label}px`, fontWeight: 'bold', textTransform: 'uppercase' }}>
            Envase
          </div>
          <div style={{ fontSize: `${c.font_size_value}px` }}>
            {new Date(product.fill_date + 'T00:00:00').toLocaleDateString('pt-BR')}
          </div>
        </div>
      )}

      {c.show_batch && (
        <div>
          <div style={{ fontSize: `${c.font_size_label}px`, fontWeight: 'bold', textTransform: 'uppercase' }}>
            Lote
          </div>
          <div style={{ fontSize: `${c.font_size_value}px` }}>{product.batch_number}</div>
        </div>
      )}
    </div>
  );

  return (
    <div
      style={{
        width: `${c.label_width}mm`,
        height: `${c.label_height}mm`,
        padding: `${c.padding}mm`,
        backgroundColor: 'white',
        color: 'black',
        fontFamily: "'Arial', 'Helvetica', sans-serif",
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #ccc',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* Logo row */}
      {c.show_logo && logoUrl && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5mm' }}>
          <img src={logoUrl} alt="Logo" style={{ maxHeight: '5mm', objectFit: 'contain' }} />
        </div>
      )}

      {/* Product Name */}
      <div
        style={{
          fontSize: `${c.font_size_name}px`,
          fontWeight: 'bold',
          textAlign: 'center',
          textTransform: 'uppercase',
          letterSpacing: '0.3px',
          lineHeight: '1.1',
          borderBottom: '0.5px solid black',
          paddingBottom: '1mm',
          marginBottom: '1mm',
        }}
      >
        {product.name}
      </div>

      {/* Middle row */}
      <div style={{ display: 'flex', flexDirection: 'row', flex: 1 }}>
        {isQrLeft ? qrBlock : infoBlock}
        {isQrLeft ? infoBlock : qrBlock}
      </div>

      {/* Responsible */}
      {c.show_responsible && responsible && (
        <div
          style={{
            fontSize: `${c.font_size_responsible}px`,
            fontWeight: 'bold',
            textAlign: 'center',
            textTransform: 'uppercase',
            borderTop: '0.5px solid black',
            paddingTop: '0.5mm',
            marginTop: '0.5mm',
            letterSpacing: '0.2px',
          }}
        >
          {responsible}
        </div>
      )}
    </div>
  );
};

const Settings = () => {
  const [settings, setSettings] = useState({
    logo_url: '',
    responsible_name: '',
    clinic_name: '',
    clinic_phone: '',
  });
  const [labelConfig, setLabelConfig] = useState(DEFAULT_LABEL_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data } = await axios.get(`${API}/settings`, { withCredentials: true });
      setSettings({
        logo_url: data.logo_url || '',
        responsible_name: data.responsible_name || '',
        clinic_name: data.clinic_name || '',
        clinic_phone: data.clinic_phone || '',
      });
      if (data.label_config && Object.keys(data.label_config).length > 0) {
        setLabelConfig({ ...DEFAULT_LABEL_CONFIG, ...data.label_config });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(
        `${API}/settings`,
        { ...settings, label_config: labelConfig },
        { withCredentials: true }
      );
      toast.success('Configurações salvas com sucesso!');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      toast.error('A imagem deve ter no máximo 500KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target.result;
      setSettings({ ...settings, logo_url: base64 });
      try {
        await axios.post(`${API}/settings/logo`, { logo_data: base64 }, { withCredentials: true });
        toast.success('Logo atualizado!');
      } catch (error) {
        toast.error('Erro ao enviar logo');
      }
    };
    reader.readAsDataURL(file);
  };

  const updateConfig = (key, value) => {
    setLabelConfig((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-6 md:p-8 lg:p-12">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-muted rounded w-1/4"></div>
            <div className="h-64 bg-muted rounded-xl"></div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div data-testid="settings-page" className="p-6 md:p-8 lg:p-12">
        <div className="mb-8">
          <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-foreground mb-2">
            Configurações
          </h1>
          <p className="text-base text-muted-foreground">
            Personalize suas etiquetas e informações da clínica
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Left Column: Settings */}
          <div className="space-y-6">
            {/* Clinic Info */}
            <Card className="bg-card border border-border/60 shadow-[0_4px_24px_rgba(0,0,0,0.02)] rounded-xl p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <SettingsIcon className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-xl font-medium tracking-tight text-foreground">Informações da Clínica</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="clinic_name">Nome da Clínica</Label>
                  <Input
                    data-testid="clinic-name-input"
                    id="clinic_name"
                    value={settings.clinic_name}
                    onChange={(e) => setSettings({ ...settings, clinic_name: e.target.value })}
                    placeholder="Nome da clínica"
                    className="h-10"
                  />
                </div>
                <div>
                  <Label htmlFor="responsible_name">Responsável Padrão</Label>
                  <Input
                    data-testid="responsible-name-input"
                    id="responsible_name"
                    value={settings.responsible_name}
                    onChange={(e) => setSettings({ ...settings, responsible_name: e.target.value })}
                    placeholder="Ex: Dr. Guilherme Ferraz"
                    className="h-10"
                  />
                </div>
                {/* Logo */}
                <div className="flex items-center gap-4">
                  <div
                    className="w-16 h-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-secondary/30 overflow-hidden flex-shrink-0 cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {settings.logo_url ? (
                      <img src={settings.logo_url} alt="Logo" className="w-full h-full object-contain p-1" />
                    ) : (
                      <Upload className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <Button
                      data-testid="upload-logo-button"
                      onClick={() => fileInputRef.current?.click()}
                      variant="outline"
                      size="sm"
                      className="gap-2"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {settings.logo_url ? 'Trocar Logo' : 'Enviar Logo'}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">PNG/JPG, máx 500KB</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg"
                      className="hidden"
                      onChange={handleLogoUpload}
                    />
                  </div>
                </div>
              </div>
            </Card>

            {/* Label Editor */}
            <Card className="bg-card border border-border/60 shadow-[0_4px_24px_rgba(0,0,0,0.02)] rounded-xl p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <Tag className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-xl font-medium tracking-tight text-foreground">Editor de Etiqueta</h2>
              </div>

              {/* Dimensions */}
              <div className="space-y-5">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Ruler className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">Dimensões (mm)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Largura</Label>
                      <Input
                        data-testid="label-width-input"
                        type="number"
                        value={labelConfig.label_width}
                        onChange={(e) => updateConfig('label_width', parseFloat(e.target.value) || 50)}
                        className="h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Altura</Label>
                      <Input
                        data-testid="label-height-input"
                        type="number"
                        value={labelConfig.label_height}
                        onChange={(e) => updateConfig('label_height', parseFloat(e.target.value) || 30)}
                        className="h-9"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Layout */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <LayoutTemplate className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">Layout</span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Posição do QR Code</Label>
                      <Select
                        value={labelConfig.qr_position}
                        onValueChange={(val) => updateConfig('qr_position', val)}
                      >
                        <SelectTrigger data-testid="qr-position-select" className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="right">Direita</SelectItem>
                          <SelectItem value="left">Esquerda</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Tamanho do QR Code: {labelConfig.qr_size}mm</Label>
                      <Slider
                        data-testid="qr-size-slider"
                        value={[labelConfig.qr_size]}
                        onValueChange={([val]) => updateConfig('qr_size', val)}
                        min={8}
                        max={Math.min(labelConfig.label_width - 10, labelConfig.label_height - 5)}
                        step={1}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Padding interno: {labelConfig.padding}mm</Label>
                      <Slider
                        value={[labelConfig.padding]}
                        onValueChange={([val]) => updateConfig('padding', val)}
                        min={0.5}
                        max={4}
                        step={0.5}
                        className="mt-2"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Font Sizes */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Type className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">Tamanho das Fontes (px)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Nome do Produto</Label>
                      <Input
                        data-testid="font-name-input"
                        type="number"
                        step="0.5"
                        value={labelConfig.font_size_name}
                        onChange={(e) => updateConfig('font_size_name', parseFloat(e.target.value) || 9)}
                        className="h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Rótulos (Validade, Lote...)</Label>
                      <Input
                        data-testid="font-label-input"
                        type="number"
                        step="0.5"
                        value={labelConfig.font_size_label}
                        onChange={(e) => updateConfig('font_size_label', parseFloat(e.target.value) || 5)}
                        className="h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Valores (Datas, Números)</Label>
                      <Input
                        data-testid="font-value-input"
                        type="number"
                        step="0.5"
                        value={labelConfig.font_size_value}
                        onChange={(e) => updateConfig('font_size_value', parseFloat(e.target.value) || 6.5)}
                        className="h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Responsável</Label>
                      <Input
                        data-testid="font-responsible-input"
                        type="number"
                        step="0.5"
                        value={labelConfig.font_size_responsible}
                        onChange={(e) => updateConfig('font_size_responsible', parseFloat(e.target.value) || 5)}
                        className="h-9"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Visibility Toggles */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Eye className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">Campos Visíveis</span>
                  </div>
                  <div className="space-y-3">
                    {[
                      { key: 'show_expiration', label: 'Validade' },
                      { key: 'show_fill_date', label: 'Data de Envase' },
                      { key: 'show_batch', label: 'Lote' },
                      { key: 'show_responsible', label: 'Responsável' },
                      { key: 'show_logo', label: 'Logo da Clínica' },
                    ].map((item) => (
                      <div key={item.key} className="flex items-center justify-between">
                        <Label className="text-sm text-foreground">{item.label}</Label>
                        <Switch
                          data-testid={`toggle-${item.key}`}
                          checked={labelConfig[item.key]}
                          onCheckedChange={(checked) => updateConfig(item.key, checked)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* Save Button */}
            <Button
              data-testid="save-settings-button"
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-11 rounded-lg font-medium gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Salvando...' : 'Salvar Todas as Configurações'}
            </Button>
          </div>

          {/* Right Column: Live Preview */}
          <div>
            <Card className="bg-card border border-border/60 shadow-[0_4px_24px_rgba(0,0,0,0.02)] rounded-xl p-6 sticky top-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <Tag className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-xl font-medium tracking-tight text-foreground">Preview da Etiqueta</h2>
              </div>

              <div className="flex justify-center py-6">
                <div className="border border-border rounded-lg p-4 bg-gray-50 inline-block">
                  <LabelLivePreview config={labelConfig} settings={settings} />
                </div>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Tamanho: {labelConfig.label_width}mm x {labelConfig.label_height}mm — Edite à esquerda para personalizar
              </p>

              <div className="mt-4 p-3 rounded-lg bg-secondary/50 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Dica:</p>
                <p>O QR Code de exemplo é ilustrativo. Na impressão real, será gerado automaticamente para cada produto.</p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export { DEFAULT_LABEL_CONFIG };
export default Settings;
