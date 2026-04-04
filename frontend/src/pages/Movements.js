import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import { Card } from '@/components/ui/card';
import { History, TrendingUp, TrendingDown, Pencil } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Movements = () => {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMovements();
  }, []);

  const fetchMovements = async () => {
    try {
      const { data } = await axios.get(`${API}/movements`, {
        withCredentials: true,
      });
      setMovements(data);
    } catch (error) {
      console.error('Error fetching movements:', error);
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
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-muted rounded-xl"></div>
              ))}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div data-testid="movements-page" className="p-6 md:p-8 lg:p-12">
        <div className="mb-8">
          <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-foreground mb-2">
            Movimentações
          </h1>
          <p className="text-base text-muted-foreground">
            Histórico completo de entradas e saídas
          </p>
        </div>

        {movements.length === 0 ? (
          <Card className="p-12 text-center">
            <History className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhuma movimentação registrada</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {movements.map((movement) => (
              <Card
                key={movement.id}
                data-testid={`movement-item-${movement.id}`}
                className="bg-card border border-border/60 shadow-[0_4px_24px_rgba(0,0,0,0.02)] rounded-xl overflow-hidden hover:shadow-md transition-all duration-200 p-6"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                        movement.type === 'entrada'
                          ? 'bg-success/10 text-success'
                          : movement.type === 'edição'
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-destructive/10 text-destructive'
                      }`}
                    >
                      {movement.type === 'entrada' ? (
                        <TrendingUp className="w-6 h-6" />
                      ) : movement.type === 'edição' ? (
                        <Pencil className="w-6 h-6" />
                      ) : (
                        <TrendingDown className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-foreground">{movement.product_name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {movement.user_name} •{' '}
                        {new Date(movement.timestamp).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      {movement.notes && (
                        <p className="text-sm text-muted-foreground mt-1">{movement.notes}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {movement.type === 'edição' ? (
                      <>
                        <p className="text-lg font-medium text-blue-600">Editado</p>
                        <p className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground">
                          {movement.type}
                        </p>
                      </>
                    ) : (
                      <>
                        <p
                          className={`text-2xl font-medium ${
                            movement.type === 'entrada' ? 'text-success' : 'text-destructive'
                          }`}
                        >
                          {movement.type === 'entrada' ? '+' : '-'}{movement.quantity}
                        </p>
                        <p className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground">
                          {movement.type}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Movements;