import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import { Card } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, BarChart3,
  PieChart as PieChartIcon, Calendar
} from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const COLORS = ['#2d6a4f', '#40916c', '#52b788', '#74c69d', '#95d5b2', '#b7e4c7'];
const EXPENSE_COLORS = ['#e63946', '#c1121f', '#ef233c', '#d62828', '#e76f51', '#f4a261'];

const formatBRL = (v) =>
  `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border border-border rounded-lg p-3 shadow-md text-sm">
      <p className="font-semibold mb-1 text-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {formatBRL(p.value)}
        </p>
      ))}
    </div>
  );
};

const FinanceReports = () => {
  const [monthly, setMonthly] = useState([]);
  const [byCategory, setByCategory] = useState([]);
  const [byPayment, setByPayment] = useState([]);
  const [summary, setSummary] = useState({ monthly_income: 0, monthly_expense: 0, monthly_profit: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAll = async () => {
    try {
      const [monthlyRes, categoryRes, paymentRes, summaryRes] = await Promise.all([
        axios.get(`${API}/finance/reports/monthly`, { withCredentials: true }),
        axios.get(`${API}/finance/reports/by-category`, { withCredentials: true }),
        axios.get(`${API}/finance/reports/by-payment`, { withCredentials: true }),
        axios.get(`${API}/finance/summary`, { withCredentials: true }),
      ]);
      setMonthly(monthlyRes.data);
      setByCategory(categoryRes.data);
      setByPayment(paymentRes.data);
      setSummary(summaryRes.data);
    } catch (err) {
      toast.error('Erro ao carregar relatórios financeiros');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          Carregando relatórios...
        </div>
      </Layout>
    );
  }

  const totalCategoryIncome = byCategory.reduce((s, c) => s + c.income, 0);

  return (
    <Layout>
      <div className="p-6 md:p-8 lg:p-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-light tracking-tight text-foreground">
            Relatórios Financeiros
          </h1>
          <p className="text-muted-foreground mt-1">
            Análise detalhada de receitas, despesas e desempenho financeiro
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="p-6 border-l-4 border-l-green-500 shadow-sm" data-testid="report-income-card">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-full">
                <TrendingUp className="text-green-600 w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">
                  Entradas (Mês)
                </p>
                <h3 className="text-2xl font-bold text-foreground">
                  {formatBRL(summary.monthly_income)}
                </h3>
              </div>
            </div>
          </Card>

          <Card className="p-6 border-l-4 border-l-red-500 shadow-sm" data-testid="report-expense-card">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-100 rounded-full">
                <TrendingDown className="text-red-600 w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">
                  Saídas (Mês)
                </p>
                <h3 className="text-2xl font-bold text-foreground">
                  {formatBRL(summary.monthly_expense)}
                </h3>
              </div>
            </div>
          </Card>

          <Card className="p-6 border-l-4 border-l-primary shadow-sm" data-testid="report-profit-card">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-full">
                <DollarSign className="text-primary w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">
                  Lucro Líquido
                </p>
                <h3 className={`text-2xl font-bold ${summary.monthly_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatBRL(summary.monthly_profit)}
                </h3>
              </div>
            </div>
          </Card>
        </div>

        {/* Evolução Mensal */}
        <Card className="p-6 mb-6 shadow-sm" data-testid="monthly-chart-card">
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 className="text-primary w-5 h-5" />
            <h2 className="text-lg font-semibold text-foreground">Evolução Mensal (6 meses)</h2>
          </div>
          {monthly.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              Nenhum dado disponível para o período
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthly} barGap={4} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `R$ ${v.toLocaleString('pt-BR')}`}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  width={90}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  formatter={(v) => (
                    <span className="text-sm text-foreground capitalize">{v}</span>
                  )}
                />
                <Bar dataKey="income" name="Entradas" fill="#40916c" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="Saídas" fill="#e63946" radius={[4, 4, 0, 0]} />
                <Bar dataKey="profit" name="Lucro" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Entradas por Categoria */}
          <Card className="p-6 shadow-sm" data-testid="category-chart-card">
            <div className="flex items-center gap-2 mb-6">
              <PieChartIcon className="text-primary w-5 h-5" />
              <h2 className="text-lg font-semibold text-foreground">
                Entradas por Categoria (mês atual)
              </h2>
            </div>
            {byCategory.filter((c) => c.income > 0).length === 0 ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                Nenhum dado disponível
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={byCategory.filter((c) => c.income > 0)}
                      dataKey="income"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={({ name, percent }) =>
                        `${name} ${(percent * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                    >
                      {byCategory
                        .filter((c) => c.income > 0)
                        .map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatBRL(v)} />
                  </PieChart>
                </ResponsiveContainer>

                {/* Legenda com valores */}
                <div className="space-y-2">
                  {byCategory
                    .filter((c) => c.income > 0)
                    .map((c, i) => (
                      <div key={c.category} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full inline-block"
                            style={{ background: COLORS[i % COLORS.length] }}
                          />
                          <span className="text-foreground">{c.category}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground text-xs">
                            {totalCategoryIncome > 0
                              ? `${((c.income / totalCategoryIncome) * 100).toFixed(1)}%`
                              : '0%'}
                          </span>
                          <span className="font-semibold text-green-600">
                            {formatBRL(c.income)}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </Card>

          {/* Método de Pagamento */}
          <Card className="p-6 shadow-sm" data-testid="payment-chart-card">
            <div className="flex items-center gap-2 mb-6">
              <Calendar className="text-primary w-5 h-5" />
              <h2 className="text-lg font-semibold text-foreground">
                Entradas por Forma de Pagamento (mês atual)
              </h2>
            </div>
            {byPayment.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                Nenhum dado disponível
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={byPayment}
                      dataKey="total"
                      nameKey="method"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={({ name, percent }) =>
                        `${name} ${(percent * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                    >
                      {byPayment.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatBRL(v)} />
                  </PieChart>
                </ResponsiveContainer>

                <div className="space-y-3">
                  {byPayment.map((p, i) => {
                    const total = byPayment.reduce((s, x) => s + x.total, 0);
                    const pct = total > 0 ? ((p.total / total) * 100).toFixed(1) : '0';
                    return (
                      <div key={p.method} className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm">
                          <span
                            className="w-3 h-3 rounded-full inline-block"
                            style={{ background: COLORS[i % COLORS.length] }}
                          />
                          <span className="text-foreground">{p.method}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="w-28 bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className="h-2 rounded-full"
                              style={{
                                width: `${pct}%`,
                                background: COLORS[i % COLORS.length],
                              }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-10 text-right">
                            {pct}%
                          </span>
                          <span className="font-semibold text-sm text-foreground w-28 text-right">
                            {formatBRL(p.total)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Despesas por Categoria */}
        {byCategory.filter((c) => c.expense > 0).length > 0 && (
          <Card className="p-6 shadow-sm mt-6" data-testid="expense-category-card">
            <div className="flex items-center gap-2 mb-6">
              <TrendingDown className="text-red-500 w-5 h-5" />
              <h2 className="text-lg font-semibold text-foreground">
                Saídas por Categoria (mês atual)
              </h2>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={byCategory.filter((c) => c.expense > 0)}
                layout="vertical"
                barCategoryGap="20%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => `R$ ${v.toLocaleString('pt-BR')}`}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="category"
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  width={100}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="expense" name="Saídas" fill="#e63946" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default FinanceReports;
