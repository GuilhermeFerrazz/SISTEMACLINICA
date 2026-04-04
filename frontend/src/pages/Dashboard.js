import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import { Card } from '@/components/ui/card';
import { Package, AlertTriangle, TrendingDown, Clock } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const { data } = await axios.get(`${API}/reports/dashboard`, {
        withCredentials: true,
      });
      setStats(data);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-6 md:p-8 lg:p-12">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-muted rounded w-1/4"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-32 bg-muted rounded-xl"></div>
              ))}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const statCards = [
    {
      title: 'Total de Produtos',
      value: stats?.total_products || 0,
      icon: Package,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      testId: 'stat-total-products'
    },
    {
      title: 'Quantidade Total',
      value: stats?.total_quantity || 0,
      icon: Package,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      testId: 'stat-total-quantity'
    },
    {
      title: 'Próximos ao Vencimento',
      value: stats?.expiring_count || 0,
      icon: AlertTriangle,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
      testId: 'stat-expiring-count'
    },
    {
      title: 'Estoque Baixo',
      value: stats?.low_stock_count || 0,
      icon: TrendingDown,
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
      testId: 'stat-low-stock'
    },
  ];

  return (
    <Layout>
      <div data-testid="dashboard-page" className="p-6 md:p-8 lg:p-12">
        <div className="mb-8">
          <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-foreground mb-2">
            Dashboard
          </h1>
          <p className="text-base text-muted-foreground">
            Visão geral do seu estoque
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {statCards.map((stat) => (
            <Card
              key={stat.title}
              data-testid={stat.testId}
              className="bg-card border border-border/60 shadow-[0_4px_24px_rgba(0,0,0,0.02)] rounded-xl overflow-hidden hover:shadow-md transition-all duration-200 p-6"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground mb-2">
                    {stat.title}
                  </p>
                  <p className="text-3xl font-medium text-foreground">{stat.value}</p>
                </div>
                <div className={`${stat.bgColor} p-3 rounded-lg`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Recent Movements */}
        <Card className="bg-card border border-border/60 shadow-[0_4px_24px_rgba(0,0,0,0.02)] rounded-xl overflow-hidden p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-primary/10 p-2 rounded-lg">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-medium tracking-tight text-foreground">
              Movimentações Recentes
            </h2>
          </div>

          {stats?.recent_movements && stats.recent_movements.length > 0 ? (
            <div className="space-y-4">
              {stats.recent_movements.map((movement) => (
                <div
                  key={movement.id}
                  data-testid={`recent-movement-${movement.id}`}
                  className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-secondary/50 transition-all duration-200"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        movement.type === 'entrada' ? 'bg-success' : 'bg-destructive'
                      }`}
                    ></div>
                    <div>
                      <p className="font-medium text-foreground">{movement.product_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {movement.user_name} • {new Date(movement.timestamp).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className={`font-medium ${
                        movement.type === 'entrada' ? 'text-success' : 'text-destructive'
                      }`}
                    >
                      {movement.type === 'entrada' ? '+' : '-'}{movement.quantity}
                    </p>
                    <p className="text-xs text-muted-foreground uppercase">{movement.type}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Clock className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhuma movimentação recente</p>
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
};

export default Dashboard;