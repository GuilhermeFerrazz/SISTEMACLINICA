import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Settings, Save, CreditCard, TrendingUp, Calculator, Info, Percent, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PricingConfigPage = () => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchConfig(); }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/pricing/config`, { withCredentials: true });
      setConfig(res.data);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const updateField = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));
  const updateCardFee = (idx, key, value) => {
    setConfig(prev => {
      const fees = [...prev.card_fees];
      fees[idx] = { ...fees[idx], [key]: value };
      return { ...prev, card_fees: fees };
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await axios.put(`${API}/pricing/config`, config, { withCredentials: true });
      toast.success('Configurações salvas com sucesso');
      await fetchConfig();
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.detail || 'Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) {
    return (
      <Layout>
        <div className="p-6 text-center text-muted-foreground">Carregando...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Configurações de Precificação</h1>
              <p className="text-sm text-muted-foreground">
                Ajuste os parâmetros usados para calcular o preço sugerido dos procedimentos.
              </p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} data-testid="btn-save-pricing-config">
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </Button>
        </div>

        {/* Custos fixos */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold">Custos fixos da clínica</h2>
          </div>
          <p className="text-sm text-muted-foreground -mt-2">
            Escolha como você quer alocar os custos fixos (aluguel, salários, contabilidade, etc) em cada procedimento.
          </p>

          <div className="space-y-2">
            <Label>Modo de alocação</Label>
            <Select
              value={config.cost_allocation_mode}
              onValueChange={(v) => updateField('cost_allocation_mode', v)}
            >
              <SelectTrigger className="w-full md:w-[400px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">% indireto sobre o preço (mais simples)</SelectItem>
                <SelectItem value="monthly">Rateio mensal (custo total ÷ atendimentos)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {config.cost_allocation_mode === 'percent' ? (
            <div className="space-y-2">
              <Label>Custos indiretos (%)</Label>
              <div className="relative w-full md:w-[200px]">
                <Input
                  type="number" step="0.01" min="0" max="100"
                  value={config.indirect_costs_percent ?? 0}
                  onChange={(e) => updateField('indirect_costs_percent', parseFloat(e.target.value) || 0)}
                  data-testid="input-indirect-percent"
                />
                <Percent className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
              <p className="text-xs text-muted-foreground flex items-start gap-1">
                <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                Esse % é aplicado sobre o preço bruto do procedimento (ex: 20% significa que de cada R$ 100 do preço, R$ 20 cobrem custos fixos).
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Custos fixos mensais (R$)</Label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input
                    type="number" step="0.01" min="0"
                    className="pl-9"
                    value={config.monthly_fixed_costs ?? 0}
                    onChange={(e) => updateField('monthly_fixed_costs', parseFloat(e.target.value) || 0)}
                    data-testid="input-monthly-fixed"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Atendimentos esperados por mês</Label>
                <Input
                  type="number" min="0"
                  value={config.expected_appointments_per_month ?? 0}
                  onChange={(e) => updateField('expected_appointments_per_month', parseInt(e.target.value) || 0)}
                  data-testid="input-expected-appointments"
                />
              </div>
              <p className="text-xs text-muted-foreground md:col-span-2 flex items-start gap-1">
                <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                Cada atendimento absorve: R$ {((config.monthly_fixed_costs || 0) / Math.max(1, config.expected_appointments_per_month || 1)).toFixed(2)}
              </p>
            </div>
          )}
        </Card>

        {/* Custos variáveis */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-semibold">Custos variáveis</h2>
          </div>
          <div className="space-y-2">
            <Label>% sobre o preço final</Label>
            <div className="relative w-full md:w-[200px]">
              <Input
                type="number" step="0.01" min="0" max="100"
                value={config.variable_costs_percent ?? 0}
                onChange={(e) => updateField('variable_costs_percent', parseFloat(e.target.value) || 0)}
                data-testid="input-variable-percent"
              />
              <Percent className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
              Energia, água, lavanderia, materiais de consumo geral — coisas que escalam com cada procedimento.
            </p>
          </div>
        </Card>

        {/* Lucro */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-500" />
            <h2 className="text-lg font-semibold">Lucro desejado</h2>
          </div>
          <div className="space-y-2">
            <Label>Margem de lucro líquido (%)</Label>
            <div className="relative w-full md:w-[200px]">
              <Input
                type="number" step="0.01" min="0" max="500"
                value={config.desired_profit_percent ?? 0}
                onChange={(e) => updateField('desired_profit_percent', parseFloat(e.target.value) || 0)}
                data-testid="input-profit-percent"
              />
              <Percent className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
              Quanto do preço final você quer que sobre como lucro líquido (ex: 50% = de cada R$ 100 cobrados, R$ 50 são lucro).
              Você pode sobrescrever esta margem em procedimentos específicos.
            </p>
          </div>
        </Card>

        {/* Taxas de cartão */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-violet-500" />
            <h2 className="text-lg font-semibold">Taxas de cartão</h2>
          </div>
          <p className="text-sm text-muted-foreground -mt-2">
            Configure as taxas de cada modalidade. Desabilite as que você não usa.
            A modalidade marcada como <strong>padrão</strong> aparecerá no card de cada procedimento.
          </p>

          <div className="space-y-2">
            <Label>Modalidade padrão (exibida nos cards)</Label>
            <Select
              value={config.default_card_fee_id || ''}
              onValueChange={(v) => updateField('default_card_fee_id', v)}
            >
              <SelectTrigger className="w-full md:w-[400px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(config.card_fees || []).filter(f => f.enabled).map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.name} — {f.rate_percent}%</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left p-2 font-medium">Ativo</th>
                  <th className="text-left p-2 font-medium">Modalidade</th>
                  <th className="text-left p-2 font-medium">Parcelas</th>
                  <th className="text-left p-2 font-medium">Taxa (%)</th>
                </tr>
              </thead>
              <tbody>
                {(config.card_fees || []).map((fee, idx) => (
                  <tr key={fee.id || idx} className="border-t">
                    <td className="p-2">
                      <Switch
                        checked={fee.enabled !== false}
                        onCheckedChange={(v) => updateCardFee(idx, 'enabled', v)}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        value={fee.name || ''}
                        onChange={(e) => updateCardFee(idx, 'name', e.target.value)}
                        className="h-8"
                      />
                    </td>
                    <td className="p-2 w-24">
                      <Input
                        type="number" min="1" max="24"
                        value={fee.installments || 1}
                        onChange={(e) => updateCardFee(idx, 'installments', parseInt(e.target.value) || 1)}
                        className="h-8"
                      />
                    </td>
                    <td className="p-2 w-32">
                      <div className="relative">
                        <Input
                          type="number" step="0.01" min="0" max="50"
                          value={fee.rate_percent ?? 0}
                          onChange={(e) => updateCardFee(idx, 'rate_percent', parseFloat(e.target.value) || 0)}
                          className="h-8 pr-7"
                        />
                        <Percent className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} size="lg" data-testid="btn-save-pricing-config-bottom">
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </Button>
        </div>
      </div>
    </Layout>
  );
};

export default PricingConfigPage;
