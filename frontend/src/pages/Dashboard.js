import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts';
import {
  Package, AlertTriangle, TrendingDown, ArrowUpRight,
  ArrowDownRight, DollarSign, Activity, ShoppingBag,
  TrendingUp, Clock, ChevronRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/* ─── Helpers ──────────────────────────────────────── */
const fmtBRL = (v) =>
  `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const today = () => {
  const d = new Date();
  return d.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};

/* ─── Animated Number ──────────────────────────────── */
const Num = ({ value, prefix = '', className = '' }) => (
  <span className={className}>{prefix}{Number(value || 0).toLocaleString('pt-BR')}</span>
);

/* ─── KPI Card ─────────────────────────────────────── */
const KpiCard = ({ title, value, icon: Icon, gradient, textColor, subLabel, subValue, trend, testId, onClick }) => (
  <div
    data-testid={testId}
    onClick={onClick}
    className={`relative overflow-hidden rounded-2xl p-6 cursor-pointer
      ${gradient}
      transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl active:scale-[0.99] group`}
  >
    {/* Decorative circle */}
    <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10 group-hover:bg-white/15 transition-colors" />
    <div className="absolute -right-2 top-8 w-16 h-16 rounded-full bg-white/8" />

    <div className="relative z-10">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-2.5 rounded-xl bg-white/20 backdrop-blur-sm`}>
          <Icon className={`w-5 h-5 ${textColor}`} />
        </div>
        {trend !== undefined && (
          <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-white/20 ${textColor}`}>
            {trend >= 0
              ? <ArrowUpRight className="w-3 h-3" />
              : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/70 mb-1">{title}</p>
      <p className={`text-4xl font-bold tracking-tight ${textColor} mb-2`}>
        <Num value={value} />
      </p>
      {subLabel && (
        <p className="text-xs text-white/60">
          {subLabel}: <span className="font-semibold text-white/80">{subValue}</span>
        </p>
      )}
      <div className="mt-3 flex items-center gap-1 text-xs text-white/60 group-hover:text-white/80 transition-colors">
        <span>Ver detalhes</span>
        <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </div>
  </div>
);

/* ─── Bar Chart Tooltip ────────────────────────────── */
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3 shadow-xl text-sm">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.fill || p.color }} className="font-medium">
          {p.name === 'entrada' ? '+ Entrada' : '- Saída'}: {p.value}
        </p>
      ))}
    </div>
  );
};

/* ─── Section Header ───────────────────────────────── */
const SectionHeader = ({ title, icon: Icon, action, actionLabel }) => (
  <div className="flex items-center justify-between mb-5">
    <div className="flex items-center gap-2.5">
      <div className="p-2 rounded-xl bg-primary/10">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
    </div>
    {action && (
      <button
        onClick={action}
        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
      >
        {actionLabel} <ChevronRight className="w-3 h-3" />
      </button>
    )}
  </div>
);

/* ─── Dashboard ────────────────────────────────────── */
const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats]       = useState(null);
  const [finance, setFinance]   = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/reports/dashboard`,   { withCredentials: true }),
      axios.get(`${API}/finance/summary`,     { withCredentials: true }),
    ])
      .then(([dashRes, finRes]) => {
        setStats(dashRes.data);
        setFinance(finRes.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  /* Build chart data from recent movements */
  const buildChartData = () => {
    if (!stats?.recent_movements?.length) return [];
    const days = {};
    stats.recent_movements.forEach((m) => {
      const d = new Date(m.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      if (!days[d]) days[d] = { day: d, entrada: 0, saida: 0 };
      if (m.type === 'entrada') days[d].entrada += m.quantity;
      else days[d].saida += m.quantity;
    });
    return Object.values(days).slice(-7);
  };

  const chartData = buildChartData();
  const BAR_COLORS_IN  = ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0'];
  const BAR_COLORS_OUT = ['#f43f5e', '#fb7185', '#fda4af', '#fecdd3'];

  const firstName = user?.name?.split(' ')[0] || 'Usuário';

  /* ── Skeleton ── */
  if (loading) {
    return (
      <Layout>
        <div className="p-6 md:p-8 space-y-6 animate-pulse">
          <div className="h-10 bg-muted rounded-xl w-1/3" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-44 bg-muted rounded-2xl" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 h-72 bg-muted rounded-2xl" />
            <div className="h-72 bg-muted rounded-2xl" />
          </div>
          <div className="h-64 bg-muted rounded-2xl" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div data-testid="dashboard-page" className="p-6 md:p-8 space-y-6 w-full max-w-[1400px]">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
              Olá, {firstName}! 👋
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5 capitalize">{today()}</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/8 border border-primary/15">
            <Activity className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">Sistema ativo</span>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            testId="kpi-total-produtos"
            title="Total de Produtos"
            value={stats?.total_products}
            icon={Package}
            gradient="bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-700"
            textColor="text-white"
            subLabel="Qtd. total"
            subValue={stats?.total_quantity || 0}
            trend={5}
            onClick={() => navigate('/products')}
          />
          <KpiCard
            testId="kpi-movimentacoes"
            title="Movimentações"
            value={(stats?.recent_movements || []).length}
            icon={Activity}
            gradient="bg-gradient-to-br from-sky-800 via-sky-700 to-cyan-700"
            textColor="text-white"
            subLabel="Tipo"
            subValue="Recentes"
            trend={12}
            onClick={() => navigate('/movements')}
          />
          <KpiCard
            testId="kpi-vencimentos"
            title="Próx. Vencimento"
            value={stats?.expiring_count}
            icon={AlertTriangle}
            gradient="bg-gradient-to-br from-indigo-800 via-indigo-700 to-violet-700"
            textColor="text-white"
            subLabel="Prazo"
            subValue="30 dias"
            trend={stats?.expiring_count > 0 ? -3 : 0}
            onClick={() => navigate('/reports')}
          />
          <KpiCard
            testId="kpi-estoque-baixo"
            title="Estoque Baixo"
            value={stats?.low_stock_count}
            icon={TrendingDown}
            gradient="bg-gradient-to-br from-rose-800 via-rose-700 to-pink-700"
            textColor="text-white"
            subLabel="Limite"
            subValue="< 5 unid."
            trend={stats?.low_stock_count > 0 ? -8 : 0}
            onClick={() => navigate('/products')}
          />
        </div>

        {/* ── Chart + Finance Panel ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Bar Chart */}
          <div
            data-testid="movements-chart"
            className="lg:col-span-2 bg-card border border-border/60 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow"
          >
            <SectionHeader
              title="Movimentações de Estoque"
              icon={Activity}
              action={() => navigate('/movements')}
              actionLabel="Ver todas"
            />
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} barGap={4} barCategoryGap="35%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false} tickLine={false} width={30}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted)/0.4)', radius: 8 }} />
                  <Bar dataKey="entrada" name="entrada" radius={[6, 6, 0, 0]} fill="#10b981" maxBarSize={32} />
                  <Bar dataKey="saida"   name="saida"   radius={[6, 6, 0, 0]} fill="#f43f5e" maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-[220px] text-muted-foreground gap-3">
                <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
                  <Activity className="w-6 h-6 opacity-40" />
                </div>
                <p className="text-sm">Nenhuma movimentação registrada</p>
              </div>
            )}
            {/* Chart legend */}
            <div className="flex items-center gap-5 mt-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />Entrada
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-3 h-3 rounded-full bg-rose-500 inline-block" />Saída
              </div>
            </div>
          </div>

          {/* Finance Summary Panel */}
          <div
            data-testid="finance-summary-panel"
            className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col"
          >
            <SectionHeader
              title="Financeiro"
              icon={DollarSign}
              action={() => navigate('/financeiro')}
              actionLabel="Abrir"
            />

            <div className="space-y-4 flex-1">
              {/* Income */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/15">
                    <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Entradas (mês)</p>
                    <p className="font-bold text-emerald-600 dark:text-emerald-400">
                      {fmtBRL(finance?.monthly_income)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Expense */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-rose-500/15">
                    <ArrowDownRight className="w-4 h-4 text-rose-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Saídas (mês)</p>
                    <p className="font-bold text-rose-600 dark:text-rose-400">
                      {fmtBRL(finance?.monthly_expense)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Profit */}
              <div className={`flex items-center justify-between p-3.5 rounded-xl border
                ${(finance?.monthly_profit || 0) >= 0
                  ? 'bg-primary/8 dark:bg-primary/10 border-primary/20'
                  : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20'
                }`}>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/15">
                    <TrendingUp className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Lucro líquido</p>
                    <p className={`font-bold text-lg ${(finance?.monthly_profit || 0) >= 0 ? 'text-primary' : 'text-rose-500'}`}>
                      {fmtBRL(finance?.monthly_profit)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => navigate('/financeiro/relatorios')}
              className="mt-4 w-full py-2.5 rounded-xl border border-primary/30 text-primary text-sm font-medium
                hover:bg-primary/8 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
            >
              Ver relatórios <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Recent Movements Table ── */}
        <div
          data-testid="recent-movements-card"
          className="bg-card border border-border/60 rounded-2xl overflow-hidden shadow-sm"
        >
          <div className="px-6 py-5 border-b border-border/60 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10">
                <Clock className="w-4 h-4 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Movimentações Recentes</h2>
            </div>
            <button
              onClick={() => navigate('/movements')}
              className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors"
            >
              Ver todas <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          {stats?.recent_movements?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/30">
                    <th className="text-left px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Produto</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Responsável</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Data</th>
                    <th className="text-center px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Qtd</th>
                    <th className="text-center px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent_movements.map((m, idx) => (
                    <tr
                      key={m.id}
                      data-testid={`movement-row-${m.id}`}
                      className={`border-b border-border/30 transition-colors hover:bg-muted/40
                        ${idx % 2 === 0 ? '' : 'bg-muted/10'}`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${m.type === 'entrada' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          <span className="font-medium text-foreground text-sm">{m.product_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{m.user_name || '—'}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {new Date(m.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`font-bold text-sm ${m.type === 'entrada' ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {m.type === 'entrada' ? '+' : '-'}{m.quantity}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide
                          ${m.type === 'entrada'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                            : 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400'
                          }`}>
                          {m.type}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                <ShoppingBag className="w-7 h-7 opacity-40" />
              </div>
              <p className="text-sm font-medium">Nenhuma movimentação recente</p>
              <button
                onClick={() => navigate('/movements')}
                className="text-xs text-primary hover:underline"
              >
                Registrar primeira movimentação
              </button>
            </div>
          )}
        </div>

      </div>
    </Layout>
  );
};

export default Dashboard;
