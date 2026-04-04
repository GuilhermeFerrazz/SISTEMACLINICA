import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Users, Gift, Syringe, UserX, Calendar, TrendingUp, 
  MessageCircle, Phone, Clock, ChevronRight, Shield,
  Sparkles, BarChart3, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const PatientsDashboard = () => {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeAlertTab, setActiveAlertTab] = useState('birthdays');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [dashboardRes, alertsRes] = await Promise.all([
        axios.get(`${API}/dashboard/patients`, { withCredentials: true }),
        axios.get(`${API}/patients/alerts/all`, { withCredentials: true })
      ]);
      setDashboard(dashboardRes.data);
      setAlerts(alertsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleSendWhatsApp = async (patientId, messageType) => {
    try {
      const { data } = await axios.get(`${API}/patients/${patientId}/whatsapp-message?message_type=${messageType}`, { withCredentials: true });
      window.open(data.whatsapp_url, '_blank');
    } catch (error) {
      toast.error('Erro ao gerar link do WhatsApp');
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR');
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-6 md:p-8 lg:p-12">
          <div className="animate-pulse space-y-6">
            <div className="h-10 bg-muted rounded w-1/4"></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-muted rounded-xl"></div>)}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div data-testid="patients-dashboard-page" className="p-6 md:p-8 lg:p-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-foreground mb-2">
            Dashboard de Pacientes
          </h1>
          <p className="text-base text-muted-foreground">
            Visão geral e alertas de relacionamento
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold tracking-wider uppercase text-muted-foreground mb-1">Total Pacientes</p>
                <p className="text-3xl font-light text-foreground">{dashboard?.total_patients || 0}</p>
              </div>
              <div className="bg-primary/10 p-2 rounded-lg">
                <Users className="w-5 h-5 text-primary" />
              </div>
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/20 rounded-xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold tracking-wider uppercase text-muted-foreground mb-1">LGPD Consentido</p>
                <p className="text-3xl font-light text-foreground">{dashboard?.consent_percentage || 0}%</p>
              </div>
              <div className="bg-green-500/10 p-2 rounded-lg">
                <Shield className="w-5 h-5 text-green-500" />
              </div>
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/20 rounded-xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold tracking-wider uppercase text-muted-foreground mb-1">Atendimentos Hoje</p>
                <p className="text-3xl font-light text-foreground">{dashboard?.today_appointments || 0}</p>
              </div>
              <div className="bg-blue-500/10 p-2 rounded-lg">
                <Calendar className="w-5 h-5 text-blue-500" />
              </div>
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border border-amber-500/20 rounded-xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold tracking-wider uppercase text-muted-foreground mb-1">Alertas Pendentes</p>
                <p className="text-3xl font-light text-foreground">{alerts?.total_alerts || 0}</p>
              </div>
              <div className="bg-amber-500/10 p-2 rounded-lg">
                <AlertCircle className="w-5 h-5 text-amber-500" />
              </div>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Alerts Panel */}
          <div className="lg:col-span-2">
            <Card className="bg-card border border-border/60 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-border">
                <h2 className="text-xl font-medium flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-primary" />
                  Alertas de Relacionamento
                </h2>
              </div>
              
              <Tabs value={activeAlertTab} onValueChange={setActiveAlertTab} className="w-full">
                <div className="px-5 pt-4">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="birthdays" className="gap-2">
                      <Gift className="w-4 h-4" />
                      <span className="hidden sm:inline">Aniversários</span>
                      <span className="px-1.5 py-0.5 rounded-full bg-pink-100 text-pink-700 text-xs">{alerts?.birthdays?.length || 0}</span>
                    </TabsTrigger>
                    <TabsTrigger value="botox" className="gap-2">
                      <Syringe className="w-4 h-4" />
                      <span className="hidden sm:inline">Botox</span>
                      <span className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs">{alerts?.botox_returns?.length || 0}</span>
                    </TabsTrigger>
                    <TabsTrigger value="inactive" className="gap-2">
                      <UserX className="w-4 h-4" />
                      <span className="hidden sm:inline">Inativos</span>
                      <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs">{alerts?.inactive_patients?.length || 0}</span>
                    </TabsTrigger>
                  </TabsList>
                </div>

                <ScrollArea className="h-[400px]">
                  <TabsContent value="birthdays" className="p-5 pt-2 m-0">
                    {alerts?.birthdays?.length > 0 ? (
                      <div className="space-y-3">
                        {alerts.birthdays.map((patient) => (
                          <Card 
                            key={patient.id} 
                            className={`p-4 border ${patient.is_today ? 'border-pink-300 bg-pink-50' : 'border-border/60'}`}
                            data-testid={`birthday-alert-${patient.id}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${patient.is_today ? 'bg-pink-200' : 'bg-pink-100'}`}>
                                  <Gift className="w-5 h-5 text-pink-500" />
                                </div>
                                <div>
                                  <p className="font-medium text-foreground">{patient.name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {patient.is_today ? '🎉 Aniversário HOJE!' : `Aniversário em ${patient.days_until_birthday} dias`}
                                  </p>
                                </div>
                              </div>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={() => handleSendWhatsApp(patient.id, 'birthday')}
                                className="gap-2"
                                data-testid={`send-birthday-${patient.id}`}
                              >
                                <MessageCircle className="w-4 h-4 text-green-600" />
                                WhatsApp
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <Gift className="w-12 h-12 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-muted-foreground">Nenhum aniversário nos próximos 7 dias</p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="botox" className="p-5 pt-2 m-0">
                    {alerts?.botox_returns?.length > 0 ? (
                      <div className="space-y-3">
                        {alerts.botox_returns.map((patient) => (
                          <Card key={patient.id} className="p-4 border border-border/60" data-testid={`botox-alert-${patient.id}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                                  <Syringe className="w-5 h-5 text-purple-500" />
                                </div>
                                <div>
                                  <p className="font-medium text-foreground">{patient.name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    Último botox: {formatDate(patient.last_botox_date)} ({patient.days_since_botox} dias atrás)
                                  </p>
                                </div>
                              </div>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={() => handleSendWhatsApp(patient.id, 'botox_return')}
                                className="gap-2"
                                data-testid={`send-botox-${patient.id}`}
                              >
                                <MessageCircle className="w-4 h-4 text-green-600" />
                                WhatsApp
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <Syringe className="w-12 h-12 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-muted-foreground">Nenhum paciente precisa de retorno de botox</p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="inactive" className="p-5 pt-2 m-0">
                    {alerts?.inactive_patients?.length > 0 ? (
                      <div className="space-y-3">
                        {alerts.inactive_patients.map((patient) => (
                          <Card key={patient.id} className="p-4 border border-border/60" data-testid={`inactive-alert-${patient.id}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                                  <UserX className="w-5 h-5 text-amber-500" />
                                </div>
                                <div>
                                  <p className="font-medium text-foreground">{patient.name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    Inativo há {patient.days_inactive} dias • Último: {patient.last_procedure}
                                  </p>
                                </div>
                              </div>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={() => handleSendWhatsApp(patient.id, 'inactive_patient')}
                                className="gap-2"
                                data-testid={`send-inactive-${patient.id}`}
                              >
                                <MessageCircle className="w-4 h-4 text-green-600" />
                                WhatsApp
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <UserX className="w-12 h-12 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-muted-foreground">Nenhum paciente inativo (+90 dias)</p>
                      </div>
                    )}
                  </TabsContent>
                </ScrollArea>
              </Tabs>
            </Card>
          </div>

          {/* Right Panel */}
          <div className="space-y-6">
            {/* Top Procedures */}
            <Card className="bg-card border border-border/60 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Procedimentos do Mês
              </h3>
              {dashboard?.top_procedures?.length > 0 ? (
                <div className="space-y-3">
                  {dashboard.top_procedures.map((proc, idx) => (
                    <div key={proc.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                          {idx + 1}
                        </span>
                        <span className="text-sm text-foreground">{proc.name}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
                        {proc.count}x
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum procedimento este mês</p>
              )}
            </Card>

            {/* Month Stats */}
            <Card className="bg-gradient-to-br from-primary/5 to-transparent border border-primary/20 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                Resumo do Mês
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Agendamentos</span>
                  <span className="text-xl font-light text-foreground">{dashboard?.month_appointments || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Concluídos</span>
                  <span className="text-xl font-light text-green-600">{dashboard?.completed_this_month || 0}</span>
                </div>
              </div>
            </Card>

            {/* Recent Patients */}
            <Card className="bg-card border border-border/60 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Pacientes Recentes
              </h3>
              {dashboard?.recent_patients?.length > 0 ? (
                <div className="space-y-3">
                  {dashboard.recent_patients.slice(0, 5).map((patient) => (
                    <div 
                      key={patient.id} 
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-secondary/50 cursor-pointer transition-colors"
                      onClick={() => navigate('/crm')}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <Users className="w-4 h-4 text-primary" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{patient.name}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum paciente recente</p>
              )}
            </Card>

            {/* Birthday Today Banner */}
            {dashboard?.birthdays_today?.length > 0 && (
              <Card className="bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <Gift className="w-6 h-6" />
                  <h3 className="font-medium">Aniversário Hoje!</h3>
                </div>
                <div className="space-y-2">
                  {dashboard.birthdays_today.map((patient) => (
                    <div key={patient.id} className="flex items-center justify-between">
                      <span>{patient.name}</span>
                      <Button 
                        size="sm" 
                        variant="secondary" 
                        onClick={() => handleSendWhatsApp(patient.id, 'birthday')}
                        className="text-xs"
                      >
                        Enviar Parabéns
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default PatientsDashboard;
