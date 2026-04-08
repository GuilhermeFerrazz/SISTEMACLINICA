import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  Users, Gift, Syringe, UserX, Calendar, BarChart3,
  MessageCircle, Clock, ChevronRight, Shield, AlertCircle,
  Activity, TrendingUp, ArrowUpRight
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/* ─── Helpers ──────────────────────────────────────── */
const formatDate = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

const today = () => new Date().toLocaleDateString('pt-BR', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

/* ─── KPI Card (same sober style as Dashboard) ─────── */
const KpiCard = ({ title, value, icon: Icon, gradient, subLabel, subValue, testId, onClick }) => (
  <div
    data-testid={testId}
    onClick={onClick}
    className={`relative overflow-hidden rounded-2xl p-6 cursor-pointer
      ${gradient} transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl active:scale-[0.99] group`}
  >
    <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10 group-hover:bg-white/15 transition-colors" />
    <div className="absolute -right-2 top-8 w-16 h-16 rounded-full bg-white/8" />
    <div className="relative z-10">
      <div className="flex items-start justify-between mb-4">
        <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm">
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/70 mb-1">{title}</p>
      <p className="text-4xl font-bold tracking-tight text-white mb-2">{value ?? 0}</p>
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

/* ─── Alert Patient Card ────────────────────────────── */
const AlertCard = ({ patient, icon: Icon, iconBg, iconColor, description, onWhatsApp, testId }) => (
  <div
    data-testid={testId}
    className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-card hover:bg-muted/30 transition-colors"
  >
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div>
        <p className="font-semibold text-sm text-foreground">{patient.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
    <Button
      size="sm"
      variant="outline"
      onClick={onWhatsApp}
      className="gap-1.5 text-xs rounded-xl h-8 border-border/60 hover:border-emerald-500/50 hover:text-emerald-600 transition-all"
    >
      <MessageCircle className="w-3.5 h-3.5" />
      WhatsApp
    </Button>
  </div>
);

/* ─── Chart Tooltip ─────────────────────────────────── */
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3 shadow-xl text-sm">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.fill }} className="font-medium">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
};

/* ─── Main Component ────────────────────────────────── */
const PatientsDashboard = () => {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [alerts, setAlerts]       = useState(null);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState('birthdays');

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/dashboard/patients`,     { withCredentials: true }),
      axios.get(`${API}/patients/alerts/all`,    { withCredentials: true }),
    ])
      .then(([dRes, aRes]) => { setDashboard(dRes.data); setAlerts(aRes.data); })
      .catch(() => toast.error('Erro ao carregar dashboard'))
      .finally(() => setLoading(false));
  }, []);

  const handleWhatsApp = async (patientId, type) => {
    try {
      const { data } = await axios.get(
        `${API}/patients/${patientId}/whatsapp-message?message_type=${type}`,
        { withCredentials: true }
      );
      if (data.message && data.phone) {
        const phone = data.phone.replace(/\D/g, '');
        const finalPhone = phone.startsWith('55') ? phone : `55${phone}`;
        const whatsappUrl = `https://wa.me/${finalPhone}?text=${encodeURIComponent(data.message)}`;
        window.open(whatsappUrl, '_blank');
      } else if (data.whatsapp_url) {
        window.open(data.whatsapp_url, '_blank');
      }
    } catch {
      toast.error('Erro ao gerar link do WhatsApp');
    }
  };

  /* Build chart data from top procedures */
  const procedureChart = (dashboard?.top_procedures || []).map((p) => ({
    name: p.name.length > 14 ? p.name.slice(0, 13) + '…' : p.name,
    count: p.count,
  }));

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
            <div className="lg:col-span-2 h-96 bg-muted rounded-2xl" />
            <div className="h-96 bg-muted rounded-2xl" />
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div data-testid="patients-dashboard-page" className="p-6 md:p-8 space-y-6 w-full max-w-[1400px]">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
              Dashboard de Pacientes
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5 capitalize">{today()}</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/8 border border-primary/15">
            <Activity className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">Visão geral CRM</span>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            testId="kpi-total-patients"
            title="Total de Pacientes"
            value={dashboard?.total_patients}
            icon={Users}
            gradient="bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-700"
            subLabel="Com consentimento"
            subValue={`${dashboard?.consent_percentage || 0}%`}
            onClick={() => navigate('/crm')}
          />
          <KpiCard
            testId="kpi-today-appointments"
            title="Atendimentos Hoje"
            value={dashboard?.today_appointments}
            icon={Calendar}
            gradient="bg-gradient-to-br from-sky-800 via-sky-700 to-cyan-700"
            subLabel="No mês"
            subValue={dashboard?.month_appointments || 0}
            onClick={() => navigate('/agenda')}
          />
          <KpiCard
            testId="kpi-completed-month"
            title="Concluídos no Mês"
            value={dashboard?.completed_this_month}
            icon={TrendingUp}
            gradient="bg-gradient-to-br from-indigo-800 via-indigo-700 to-violet-700"
            subLabel="Agendados"
            subValue={dashboard?.month_appointments || 0}
            onClick={() => navigate('/agenda')}
          />
          <KpiCard
            testId="kpi-alerts"
            title="Alertas Pendentes"
            value={alerts?.total_alerts}
            icon={AlertCircle}
            gradient="bg-gradient-to-br from-rose-800 via-rose-700 to-pink-700"
            subLabel="Tipos"
            subValue="Aniv • Botox • Inativos"
            onClick={() => setActiveTab('birthdays')}
          />
        </div>

        {/* ── Alerts + Right Panel ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Alerts Tabs */}
          <div
            data-testid="alerts-panel"
            className="lg:col-span-2 bg-card border border-border/60 rounded-2xl overflow-hidden shadow-sm"
          >
            <div className="px-6 py-5 border-b border-border/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-primary/10">
                  <AlertCircle className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">Alertas de Relacionamento</h2>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="px-6 pt-4">
                <TabsList className="grid w-full grid-cols-3 rounded-xl bg-muted/50 p-1 h-auto">
                  <TabsTrigger value="birthdays" data-testid="tab-birthdays"
                    className="rounded-lg gap-2 py-2 text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm">
                    <Gift className="w-3.5 h-3.5" />
                    Aniversários
                    <span className="px-1.5 py-0.5 rounded-full bg-pink-100 dark:bg-pink-500/20 text-pink-600 dark:text-pink-400 text-[10px] font-bold">
                      {alerts?.birthdays?.length || 0}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="botox" data-testid="tab-botox"
                    className="rounded-lg gap-2 py-2 text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm">
                    <Syringe className="w-3.5 h-3.5" />
                    Botox
                    <span className="px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400 text-[10px] font-bold">
                      {alerts?.botox_returns?.length || 0}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="inactive" data-testid="tab-inactive"
                    className="rounded-lg gap-2 py-2 text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm">
                    <UserX className="w-3.5 h-3.5" />
                    Inativos
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-bold">
                      {alerts?.inactive_patients?.length || 0}
                    </span>
                  </TabsTrigger>
                </TabsList>
              </div>

              <ScrollArea className="h-[360px]">
                {/* Birthdays */}
                <TabsContent value="birthdays" className="p-5 m-0 space-y-3">
                  {alerts?.birthdays?.length > 0 ? alerts.birthdays.map((p) => (
                    <AlertCard
                      key={p.id} patient={p} icon={Gift}
                      iconBg="bg-pink-100 dark:bg-pink-500/15"
                      iconColor="text-pink-500"
                      description={p.is_today ? '🎉 Aniversário HOJE!' : `Aniversário em ${p.days_until_birthday} dia(s)`}
                      onWhatsApp={() => handleWhatsApp(p.id, 'birthday')}
                      testId={`birthday-${p.id}`}
                    />
                  )) : (
                    <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
                      <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
                        <Gift className="w-6 h-6 opacity-40" />
                      </div>
                      <p className="text-sm">Nenhum aniversário nos próximos 7 dias</p>
                    </div>
                  )}
                </TabsContent>

                {/* Botox */}
                <TabsContent value="botox" className="p-5 m-0 space-y-3">
                  {alerts?.botox_returns?.length > 0 ? alerts.botox_returns.map((p) => (
                    <AlertCard
                      key={p.id} patient={p} icon={Syringe}
                      iconBg="bg-violet-100 dark:bg-violet-500/15"
                      iconColor="text-violet-500"
                      description={`Último botox: ${formatDate(p.last_botox_date)} (${p.days_since_botox} dias)`}
                      onWhatsApp={() => handleWhatsApp(p.id, 'botox_return')}
                      testId={`botox-${p.id}`}
                    />
                  )) : (
                    <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
                      <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
                        <Syringe className="w-6 h-6 opacity-40" />
                      </div>
                      <p className="text-sm">Nenhum paciente precisa de retorno</p>
                    </div>
                  )}
                </TabsContent>

                {/* Inactive */}
                <TabsContent value="inactive" className="p-5 m-0 space-y-3">
                  {alerts?.inactive_patients?.length > 0 ? alerts.inactive_patients.map((p) => (
                    <AlertCard
                      key={p.id} patient={p} icon={UserX}
                      iconBg="bg-amber-100 dark:bg-amber-500/15"
                      iconColor="text-amber-500"
                      description={`Inativo há ${p.days_inactive} dias • ${p.last_procedure}`}
                      onWhatsApp={() => handleWhatsApp(p.id, 'inactive_patient')}
                      testId={`inactive-${p.id}`}
                    />
                  )) : (
                    <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
                      <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
                        <UserX className="w-6 h-6 opacity-40" />
                      </div>
                      <p className="text-sm">Nenhum paciente inativo (+90 dias)</p>
                    </div>
                  )}
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </div>

          {/* Right Column */}
          <div className="space-y-5">

            {/* Procedures Chart */}
            <div
              data-testid="procedures-chart"
              className="bg-card border border-border/60 rounded-2xl p-5 shadow-sm"
            >
              <SectionHeader title="Procedimentos do Mês" icon={BarChart3} />
              {procedureChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={procedureChart} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={20} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" name="Realizados" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[160px] text-sm text-muted-foreground">
                  Sem procedimentos este mês
                </div>
              )}
            </div>

            {/* Month Resume */}
            <div
              data-testid="month-resume"
              className="bg-card border border-border/60 rounded-2xl p-5 shadow-sm"
            >
              <SectionHeader title="Resumo do Mês" icon={TrendingUp} />
              <div className="space-y-3">
                {[
                  { label: 'Agendamentos', value: dashboard?.month_appointments || 0, color: 'text-foreground' },
                  { label: 'Concluídos',   value: dashboard?.completed_this_month || 0, color: 'text-emerald-500' },
                  { label: 'Com LGPD',     value: dashboard?.patients_with_consent || 0, color: 'text-sky-500' },
                  { label: 'Total Pacientes', value: dashboard?.total_patients || 0, color: 'text-indigo-500' },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                    <span className="text-sm text-muted-foreground">{row.label}</span>
                    <span className={`text-xl font-bold ${row.color}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Patients */}
            <div
              data-testid="recent-patients"
              className="bg-card border border-border/60 rounded-2xl p-5 shadow-sm"
            >
              <SectionHeader
                title="Pacientes Recentes"
                icon={Clock}
                action={() => navigate('/crm')}
                actionLabel="Ver todos"
              />
              {dashboard?.recent_patients?.length > 0 ? (
                <div className="space-y-1">
                  {dashboard.recent_patients.slice(0, 5).map((p) => (
                    <div
                      key={p.id}
                      onClick={() => navigate('/crm')}
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-muted/50 cursor-pointer transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          {p.name?.charAt(0)?.toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-foreground">{p.name}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum paciente recente</p>
              )}
            </div>

          </div>
        </div>

        {/* ── Birthday Today Banner ── */}
        {dashboard?.birthdays_today?.length > 0 && (
          <div className="bg-gradient-to-r from-rose-800 via-rose-700 to-pink-700 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-xl bg-white/20">
                <Gift className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-semibold text-white">Aniversário Hoje!</h3>
            </div>
            <div className="space-y-2">
              {dashboard.birthdays_today.map((p) => (
                <div key={p.id} className="flex items-center justify-between bg-white/10 rounded-xl px-4 py-2.5">
                  <span className="text-white font-medium text-sm">{p.name}</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleWhatsApp(p.id, 'birthday')}
                    className="text-xs h-7 rounded-lg bg-white/20 text-white hover:bg-white/30 border-0"
                  >
                    Enviar Parabéns
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
};

export default PatientsDashboard;
