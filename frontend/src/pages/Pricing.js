import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  Tag, Plus, Settings, Calculator, CreditCard, TrendingUp,
  Package, X, Check, AlertTriangle, RefreshCw, ChevronDown, ChevronUp, Search
} from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmtMoney = (v) => {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const PricingPage = () => {
  const [items, setItems] = useState([]);
  const [config, setConfig] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const [editingProc, setEditingProc] = useState(null); // procedure detail open in modal
  const [editKit, setEditKit] = useState([]); // kit items being edited
  const [overrideProfit, setOverrideProfit] = useState('');
  const [savingKit, setSavingKit] = useState(false);
  const [applyingPrice, setApplyingPrice] = useState(null); // card_fee_id

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [itemsRes, configRes, productsRes] = await Promise.all([
        axios.get(`${API}/pricing/procedures`, { withCredentials: true }),
        axios.get(`${API}/pricing/config`, { withCredentials: true }),
        axios.get(`${API}/products`, { withCredentials: true }),
      ]);
      setItems(itemsRes.data || []);
      setConfig(configRes.data);
      setProducts(productsRes.data || []);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar dados de precificação');
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i => (i.procedure_name || '').toLowerCase().includes(q));
  }, [items, search]);

  const productsById = useMemo(() => {
    const map = {};
    products.forEach(p => { map[p.qr_code_id || p.id] = p; });
    return map;
  }, [products]);

  const productsWithoutCost = useMemo(
    () => products.filter(p => !p.cost_price || p.cost_price <= 0).length,
    [products]
  );

  const openProcedure = (proc) => {
    setEditingProc(proc);
    setEditKit((proc.kit || []).map(k => ({ ...k })));
    setOverrideProfit(proc.override_profit_percent ?? '');
  };

  const closeProcedure = () => {
    setEditingProc(null);
    setEditKit([]);
    setOverrideProfit('');
  };

  const addKitItem = (productId) => {
    if (!productId) return;
    const product = productsById[productId];
    if (!product) return;
    // Se já tiver, incrementa
    const existing = editKit.find(k => k.product_id === productId);
    if (existing) {
      setEditKit(editKit.map(k => k.product_id === productId ? { ...k, quantity: (k.quantity || 0) + 1 } : k));
    } else {
      setEditKit([...editKit, {
        product_id: productId,
        product_name: product.name,
        quantity: 1,
        unit: product.unit || 'un',
        unit_cost: product.cost_price || 0,
      }]);
    }
  };

  const updateKitQty = (idx, qty) => {
    setEditKit(editKit.map((k, i) => i === idx ? { ...k, quantity: parseFloat(qty) || 0 } : k));
  };

  const removeKitItem = (idx) => {
    setEditKit(editKit.filter((_, i) => i !== idx));
  };

  const handleSaveKit = async () => {
    if (!editingProc) return;
    try {
      setSavingKit(true);
      const payload = {
        products: editKit.map(k => ({
          product_id: k.product_id,
          product_name: k.product_name,
          quantity: k.quantity,
          unit: k.unit,
          unit_cost: k.unit_cost,
        })),
      };
      if (overrideProfit === '' || overrideProfit === null) {
        payload.override_profit_percent = null;
      } else {
        payload.override_profit_percent = parseFloat(overrideProfit);
      }
      await axios.put(`${API}/procedures/${editingProc.procedure_id}`, payload, { withCredentials: true });
      toast.success('Kit atualizado');
      // Recarrega detalhe deste procedimento
      const { data } = await axios.get(`${API}/pricing/procedures/${editingProc.procedure_id}`, { withCredentials: true });
      setEditingProc(data);
      setEditKit((data.kit || []).map(k => ({ ...k })));
      // Atualiza lista
      await fetchAll();
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.detail || 'Erro ao salvar kit');
    } finally {
      setSavingKit(false);
    }
  };

  const handleApplyPrice = async (cardFeeId) => {
    if (!editingProc) return;
    try {
      setApplyingPrice(cardFeeId);
      await axios.post(
        `${API}/pricing/procedures/${editingProc.procedure_id}/apply-price`,
        { card_fee_id: cardFeeId },
        { withCredentials: true }
      );
      toast.success('Preço aplicado ao procedimento');
      await fetchAll();
      // Atualiza modal
      const { data } = await axios.get(`${API}/pricing/procedures/${editingProc.procedure_id}`, { withCredentials: true });
      setEditingProc(data);
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.detail || 'Erro ao aplicar preço');
    } finally {
      setApplyingPrice(null);
    }
  };

  /* ─── RENDER ─── */

  if (loading) {
    return (
      <Layout>
        <div className="p-6 text-center text-muted-foreground">Carregando precificação…</div>
      </Layout>
    );
  }

  const defaultCardName = config?.card_fees?.find(f => f.id === config?.default_card_fee_id)?.name
    || 'Modalidade padrão';

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start md:items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Tag className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Precificação</h1>
              <p className="text-sm text-muted-foreground">
                Preço sugerido baseado em insumos + custos fixos + variáveis + cartão + lucro.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing} data-testid="btn-refresh-pricing">
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Recalcular
            </Button>
            <Link to="/precificacao/configuracoes">
              <Button variant="outline" size="sm" data-testid="btn-pricing-config">
                <Settings className="w-4 h-4 mr-2" />
                Configurações
              </Button>
            </Link>
          </div>
        </div>

        {/* Avisos / config quick view */}
        {productsWithoutCost > 0 && (
          <Card className="p-3 border-amber-500/30 bg-amber-500/5 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <strong className="text-amber-700 dark:text-amber-400">{productsWithoutCost}</strong> produto(s) no Estoque ainda <strong>sem preço de compra cadastrado</strong>.
              {' '}Eles entram no kit como custo R$ 0.{' '}
              <Link to="/products" className="text-primary underline">Cadastrar preços agora →</Link>
            </div>
          </Card>
        )}

        {/* Config quick badges */}
        {config && (
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calculator className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Configuração ativa</span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="font-normal">
                Custos fixos: {config.cost_allocation_mode === 'percent'
                  ? `${config.indirect_costs_percent}% indireto`
                  : `${fmtMoney(config.monthly_fixed_costs)} / ${config.expected_appointments_per_month} atend`}
              </Badge>
              <Badge variant="outline" className="font-normal">Variáveis: {config.variable_costs_percent}%</Badge>
              <Badge variant="outline" className="font-normal">Lucro: {config.desired_profit_percent}%</Badge>
              <Badge variant="outline" className="font-normal flex items-center gap-1">
                <CreditCard className="w-3 h-3" /> Padrão: {defaultCardName}
              </Badge>
            </div>
          </Card>
        )}

        {/* Busca */}
        <div className="relative max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar procedimento…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-procedures"
          />
        </div>

        {/* Grid de cards */}
        {filteredItems.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            Nenhum procedimento {search ? 'encontrado' : 'cadastrado'}.
            {' '}{!search && (<Link to="/agenda/configuracoes" className="text-primary underline">Cadastrar agora →</Link>)}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.map(item => (
              <PricingCard key={item.procedure_id} item={item} onClick={() => openProcedure(item)} />
            ))}
          </div>
        )}
      </div>

      {/* Modal de detalhe */}
      <Dialog open={!!editingProc} onOpenChange={(open) => { if (!open) closeProcedure(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {editingProc && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl flex items-center gap-2">
                  <Tag className="w-5 h-5 text-primary" />
                  {editingProc.procedure_name}
                </DialogTitle>
              </DialogHeader>

              {/* Preço atual + override de lucro */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
                <Card className="p-4">
                  <Label className="text-xs text-muted-foreground">Preço atual cadastrado</Label>
                  <div className="text-2xl font-bold mt-1">
                    {editingProc.current_price ? fmtMoney(editingProc.current_price) : <span className="text-muted-foreground text-base">Sem preço</span>}
                  </div>
                </Card>
                <Card className="p-4">
                  <Label htmlFor="override-profit" className="text-xs text-muted-foreground">
                    Margem de lucro deste procedimento (opcional)
                  </Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      id="override-profit"
                      type="number" step="0.01" min="0" max="500"
                      placeholder={`Global: ${config?.desired_profit_percent || 0}%`}
                      value={overrideProfit}
                      onChange={(e) => setOverrideProfit(e.target.value)}
                      className="h-9"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Deixe vazio para usar a margem global.
                  </p>
                </Card>
              </div>

              {/* Kit de insumos */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Kit de insumos
                  </Label>
                  <Select onValueChange={(v) => addKitItem(v)} value="">
                    <SelectTrigger className="w-[280px] h-9">
                      <SelectValue placeholder="+ Adicionar produto do estoque" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.length === 0 ? (
                        <SelectItem value="__none" disabled>Nenhum produto no estoque</SelectItem>
                      ) : (
                        products.map(p => (
                          <SelectItem key={p.qr_code_id || p.id} value={p.qr_code_id || p.id}>
                            {p.name} {p.cost_price > 0 ? `— ${fmtMoney(p.cost_price)}/un` : '(sem preço)'}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {editKit.length === 0 ? (
                  <Card className="p-4 text-center text-sm text-muted-foreground">
                    Nenhum insumo no kit. Adicione produtos do estoque acima.
                  </Card>
                ) : (
                  <Card className="overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="text-left p-2 font-medium">Produto</th>
                          <th className="text-center p-2 font-medium w-24">Qtd</th>
                          <th className="text-right p-2 font-medium w-28">Custo/un</th>
                          <th className="text-right p-2 font-medium w-28">Subtotal</th>
                          <th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {editKit.map((k, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="p-2">
                              <div className="font-medium">{k.product_name}</div>
                              {!k.exists && k.exists !== undefined && (
                                <div className="text-[10px] text-amber-600">⚠ Produto removido do estoque</div>
                              )}
                            </td>
                            <td className="p-2">
                              <Input
                                type="number" step="0.01" min="0"
                                value={k.quantity}
                                onChange={(e) => updateKitQty(idx, e.target.value)}
                                className="h-8 text-center"
                              />
                            </td>
                            <td className="p-2 text-right text-muted-foreground">
                              {fmtMoney(k.unit_cost)}
                            </td>
                            <td className="p-2 text-right font-medium">
                              {fmtMoney((k.quantity || 0) * (k.unit_cost || 0))}
                            </td>
                            <td className="p-2">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeKitItem(idx)}>
                                <X className="w-4 h-4 text-muted-foreground" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/20 border-t">
                        <tr>
                          <td colSpan="3" className="p-2 text-right font-medium">Custo total dos insumos:</td>
                          <td className="p-2 text-right font-bold">
                            {fmtMoney(editKit.reduce((s, k) => s + (k.quantity || 0) * (k.unit_cost || 0), 0))}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </Card>
                )}

                <div className="flex justify-end">
                  <Button onClick={handleSaveKit} disabled={savingKit} size="sm">
                    <Check className="w-4 h-4 mr-2" />
                    {savingKit ? 'Salvando…' : 'Salvar kit'}
                  </Button>
                </div>
              </div>

              {/* Breakdown atual */}
              {editingProc.breakdown && (
                <Card className="p-4 bg-muted/30 space-y-1.5 text-sm">
                  <Label className="text-base font-semibold flex items-center gap-2 mb-2">
                    <Calculator className="w-4 h-4" />
                    Como o preço foi calculado (modalidade: {editingProc.default_suggestion?.card_fee_name || 'padrão'})
                  </Label>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-muted-foreground">Custo insumos:</span>
                    <span className="text-right font-medium">{fmtMoney(editingProc.breakdown.custo_insumos)}</span>

                    {editingProc.breakdown.custo_fixo_rateado > 0 && (
                      <>
                        <span className="text-muted-foreground">Custo fixo rateado:</span>
                        <span className="text-right font-medium">{fmtMoney(editingProc.breakdown.custo_fixo_rateado)}</span>
                      </>
                    )}

                    {editingProc.breakdown.custo_indireto_valor !== undefined && editingProc.breakdown.custo_indireto_valor > 0 && (
                      <>
                        <span className="text-muted-foreground">Indireto ({editingProc.breakdown.custo_indireto_percent}%):</span>
                        <span className="text-right font-medium">{fmtMoney(editingProc.breakdown.custo_indireto_valor)}</span>
                      </>
                    )}

                    <span className="text-muted-foreground">Variável ({editingProc.breakdown.variable_costs_percent}%):</span>
                    <span className="text-right font-medium">{fmtMoney(editingProc.breakdown.custo_variavel_valor)}</span>

                    <span className="text-muted-foreground">Taxa cartão:</span>
                    <span className="text-right font-medium">{fmtMoney(editingProc.breakdown.taxa_cartao_valor)}</span>

                    <span className="text-muted-foreground">Lucro líquido ({editingProc.breakdown.profit_percent}%):</span>
                    <span className="text-right font-bold text-emerald-600">{fmtMoney(editingProc.breakdown.lucro_valor)}</span>
                  </div>
                </Card>
              )}

              {/* Preço sugerido por modalidade */}
              <div className="space-y-2">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  Preço sugerido por modalidade de pagamento
                </Label>
                <Card className="overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="text-left p-2 font-medium">Modalidade</th>
                        <th className="text-center p-2 font-medium">Taxa</th>
                        <th className="text-right p-2 font-medium">Preço</th>
                        <th className="text-right p-2 font-medium">Parcela</th>
                        <th className="text-right p-2 font-medium">Aplicar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editingProc.suggestions.map(s => (
                        <tr key={s.card_fee_id} className={`border-t ${s.card_fee_id === config?.default_card_fee_id ? 'bg-primary/5' : ''}`}>
                          <td className="p-2 font-medium">
                            {s.card_fee_name}
                            {s.card_fee_id === config?.default_card_fee_id && (
                              <Badge variant="outline" className="ml-2 text-[10px] py-0">padrão</Badge>
                            )}
                          </td>
                          <td className="p-2 text-center text-muted-foreground">{s.rate_percent}%</td>
                          <td className="p-2 text-right font-bold text-lg text-emerald-700 dark:text-emerald-400">
                            {s.error ? <span className="text-xs text-red-500">{s.error}</span> : fmtMoney(s.price)}
                          </td>
                          <td className="p-2 text-right text-xs text-muted-foreground">
                            {s.installments > 1 && s.price ? `${s.installments}× ${fmtMoney(s.installment_value)}` : '—'}
                          </td>
                          <td className="p-2 text-right">
                            {s.price && !s.error && (
                              <Button
                                size="sm" variant="outline"
                                onClick={() => handleApplyPrice(s.card_fee_id)}
                                disabled={applyingPrice === s.card_fee_id}
                              >
                                {applyingPrice === s.card_fee_id ? '...' : 'Aplicar'}
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={closeProcedure}>Fechar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

/* ─── Card de procedimento (estilo do print da amiga) ─── */
const PricingCard = ({ item, onClick }) => {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = expanded ? item.kit : item.kit.slice(0, 4);
  const remaining = item.kit.length - visibleItems.length;

  const suggested = item.suggested_price;
  const current = item.current_price;
  const isSynced = current && suggested && Math.abs(current - suggested) < 0.01;

  return (
    <Card
      className="p-4 cursor-pointer hover:shadow-lg hover:border-primary/40 transition-all"
      onClick={onClick}
      data-testid={`pricing-card-${item.procedure_id}`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="font-semibold text-base leading-snug flex-1">{item.procedure_name}</h3>
        {isSynced ? (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
            <Check className="w-3 h-3 mr-1" /> Aplicado
          </Badge>
        ) : current ? (
          <Badge variant="outline" className="text-amber-600 border-amber-500/30">
            Atual: {fmtMoney(current)}
          </Badge>
        ) : null}
      </div>

      {/* Kit resumo */}
      {item.kit.length > 0 ? (
        <div className="space-y-1 text-xs mb-3">
          {visibleItems.map((k, idx) => (
            <div key={idx} className="flex justify-between text-muted-foreground">
              <span className="truncate pr-2"><span className="font-mono">{k.quantity}×</span> {k.product_name}</span>
              <span className="flex-shrink-0">{fmtMoney(k.line_total)}</span>
            </div>
          ))}
          {remaining > 0 && !expanded && (
            <button
              className="text-xs text-primary hover:underline flex items-center gap-1"
              onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
            >
              <ChevronDown className="w-3 h-3" /> +{remaining} {remaining === 1 ? 'item' : 'itens'}
            </button>
          )}
          {expanded && item.kit.length > 4 && (
            <button
              className="text-xs text-primary hover:underline flex items-center gap-1"
              onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
            >
              <ChevronUp className="w-3 h-3" /> recolher
            </button>
          )}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground italic mb-3">
          Sem insumos cadastrados — clique para adicionar.
        </div>
      )}

      {/* Breakdown linha a linha */}
      <div className="border-t pt-3 space-y-1 text-xs">
        <div className="flex justify-between text-muted-foreground">
          <span>Custo insumos</span>
          <span>{fmtMoney(item.breakdown.custo_insumos)}</span>
        </div>
        {item.breakdown.custo_indireto_valor > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Indireto ({item.breakdown.custo_indireto_percent}%)</span>
            <span>{fmtMoney(item.breakdown.custo_indireto_valor)}</span>
          </div>
        )}
        {item.breakdown.custo_fixo_rateado > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Fixo rateado</span>
            <span>{fmtMoney(item.breakdown.custo_fixo_rateado)}</span>
          </div>
        )}
        <div className="flex justify-between text-muted-foreground">
          <span>Variáveis ({item.breakdown.variable_costs_percent}%)</span>
          <span>{fmtMoney(item.breakdown.custo_variavel_valor)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Taxa cartão</span>
          <span>{fmtMoney(item.breakdown.taxa_cartao_valor)}</span>
        </div>
        <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-medium">
          <span>Lucro ({item.breakdown.profit_percent}%)</span>
          <span>{fmtMoney(item.breakdown.lucro_valor)}</span>
        </div>
      </div>

      {/* Preço final */}
      <div className="mt-3 pt-3 border-t border-primary/30">
        <div className="flex items-baseline justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Preço sugerido
            </span>
            <span className="text-[10px] text-muted-foreground">
              {item.default_suggestion?.card_fee_name || ''}
            </span>
          </div>
          <span className="text-2xl font-bold text-primary">{fmtMoney(suggested)}</span>
        </div>
        {item.default_suggestion && item.default_suggestion.installments > 1 && (
          <p className="text-[10px] text-right text-muted-foreground mt-0.5">
            {item.default_suggestion.installments}× {fmtMoney(item.default_suggestion.installment_value)}
          </p>
        )}
      </div>
    </Card>
  );
};

export default PricingPage;
