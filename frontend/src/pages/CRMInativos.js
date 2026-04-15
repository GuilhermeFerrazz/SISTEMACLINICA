import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserX, MessageCircle, Phone, Calendar, ChevronRight, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CRMInativos = () => {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    try {
      const { data } = await axios.get(`${API}/patients/alerts/inactive`, { withCredentials: true });
      setPatients(data);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao carregar pacientes');
    } finally {
      setLoading(false);
    }
  };

  const handleSendWhatsApp = async (patient) => {
    try {
      const { data } = await axios.get(`${API}/patients/${patient.id}/whatsapp-message?message_type=inactive_patient`, { withCredentials: true });
      if (data.whatsapp_url) {
        window.open(data.whatsapp_url, '_blank');
      } else {
        let phone = (patient.phone || '').replace(/[\s\-\(\)]/g, '');
        if (phone && !phone.startsWith('55')) phone = '55' + phone;
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(data.message)}`;
        window.open(url, '_blank');
      }
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
            <div className="h-64 bg-muted rounded-xl"></div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div data-testid="crm-inativos-page" className="p-6 md:p-8 lg:p-12">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <UserX className="w-8 h-8 text-amber-500" />
            <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-foreground">
              Pacientes Inativos
            </h1>
          </div>
          <p className="text-base text-muted-foreground">
            Pacientes sem procedimentos há mais de 3 meses
          </p>
        </div>

        {patients.length === 0 ? (
          <Card className="bg-card border border-border/60 rounded-xl p-12 text-center">
            <UserX className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhum paciente inativo no momento</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {patients.map((patient) => (
              <Card 
                key={patient.id} 
                data-testid={`inactive-card-${patient.id}`}
                className="bg-card border border-border/60 rounded-xl p-5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center">
                      <UserX className="w-7 h-7 text-amber-500" />
                    </div>
                    <div>
                      <p className="font-medium text-lg text-foreground">{patient.name}</p>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {patient.phone}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm mt-1">
                        <span className="flex items-center gap-1 text-amber-600 font-medium">
                          <Clock className="w-3 h-3" />
                          Inativo há {patient.days_inactive} dias
                        </span>
                        {patient.last_procedure && (
                          <span className="text-muted-foreground">
                            Último: {patient.last_procedure}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      onClick={() => handleSendWhatsApp(patient)}
                      className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
                      data-testid={`send-inactive-${patient.id}`}
                    >
                      <MessageCircle className="w-4 h-4" />
                      Reativar Paciente
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => navigate('/crm')}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
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

export default CRMInativos;
