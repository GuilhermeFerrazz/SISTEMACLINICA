import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import { Card } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BarChart3, AlertTriangle, TrendingDown } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Reports = () => {
  const [consumptionData, setConsumptionData] = useState([]);
  const [expiringProducts, setExpiringProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const [consumptionRes, expiringRes] = await Promise.all([
        axios.get(`${API}/reports/consumption`, { withCredentials: true }),
        axios.get(`${API}/reports/expiring`, { withCredentials: true }),
      ]);
      setConsumptionData(consumptionRes.data);
      setExpiringProducts(expiringRes.data);
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-6 md:p-8 lg:p-12">
          <div className="animate-pulse">
            <div className="h-8 bg-muted rounded w-1/4 mb-6"></div>
            <div className="space-y-6">
              <div className="h-64 bg-muted rounded-xl"></div>
              <div className="h-64 bg-muted rounded-xl"></div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div data-testid="reports-page" className="p-6 md:p-8 lg:p-12">
        <div className="mb-8">
          <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-foreground mb-2">
            Relatórios
          </h1>
          <p className="text-base text-muted-foreground">
            Análise de consumo e alertas de vencimento
          </p>
        </div>

        <div className="space-y-8">
          {/* Consumption Chart */}
          <Card className="bg-card border border-border/60 shadow-[0_4px_24px_rgba(0,0,0,0.02)] rounded-xl overflow-hidden p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-primary/10 p-2 rounded-lg">
                <BarChart3 className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-medium tracking-tight text-foreground">
                Consumo por Data
              </h2>
            </div>

            {consumptionData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={consumptionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '0.75rem',
                    }}
                  />
                  <Bar dataKey="quantity" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12">
                <TrendingDown className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">Nenhum dado de consumo disponível</p>
              </div>
            )}
          </Card>

          {/* Expiring Products */}
          <Card className="bg-card border border-border/60 shadow-[0_4px_24px_rgba(0,0,0,0.02)] rounded-xl overflow-hidden p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-warning/10 p-2 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-warning" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-medium tracking-tight text-foreground">
                Produtos Próximos ao Vencimento
              </h2>
            </div>

            {expiringProducts.length > 0 ? (
              <div className="space-y-4">
                {expiringProducts.map((product) => (
                  <div
                    key={product.id}
                    data-testid={`expiring-product-${product.id}`}
                    className="flex items-center justify-between p-4 rounded-lg border border-warning/20 bg-warning/5 hover:bg-warning/10 transition-all duration-200"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-warning/10 flex items-center justify-center">
                        <AlertTriangle className="w-6 h-6 text-warning" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{product.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Lote: {product.batch_number} • Fornecedor: {product.supplier}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-medium text-warning">
                        {product.days_until_expiry} dias
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Vence em {new Date(product.expiration_date).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <AlertTriangle className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">Nenhum produto próximo ao vencimento</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default Reports;