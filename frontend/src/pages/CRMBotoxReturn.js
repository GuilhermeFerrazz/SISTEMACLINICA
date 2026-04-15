import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Syringe, MessageCircle, Phone, Calendar, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CRMBotoxReturn = () => {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    try {
      const { data } = await axios.get(`${API}/patients/alerts/botox-return`, { withCredentials: true });
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
      const { data } = await axios.get(`${API}/patients/${patient.id}/whatsapp-message?message_type=botox_return`, { withCredentials: true });
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
      <div data-testid="crm-botox-page" className="p-6 md:p-8 lg:p-12">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Syringe className="w-8 h-8 text-purple-500" />
            <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-foreground">
              Retorno de Botox
            </h1>
          </div>
          <p className="text-base text-muted-foreground">
            Pacientes que precisam de retorno (5 meses desde último procedimento)
          </p>
        </div>

        {patients.length === 0 ? (
          <Card className="bg-card border border-border/60 rounded-xl p-12 text-center">
            <Syringe className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhum paciente precisa de retorno de botox no momento</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {patients.map((patient) => (
              <Card 
                key={patient.id} 
                data-testid={`botox-card-${patient.id}`}
                className="bg-card border border-border/60 rounded-xl p-5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center">
                      <Syringe className="w-7 h-7 text-purple-500" />
                    </div>
                    <div>
                      <p className="font-medium text-lg text-foreground">{patient.name}</p>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {patient.phone}
                        </span>
                      </div>
                      <p className="text-sm text-purple-600 font-medium mt-1">
                        Último botox: {formatDate(patient.last_botox_date)} ({patient.days_since_botox} dias atrás)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      onClick={() => handleSendWhatsApp(patient)}
                      className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
                      data-testid={`send-botox-${patient.id}`}
                    >
                      <MessageCircle className="w-4 h-4" />
                      Lembrar Retorno
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

export default CRMBotoxReturn;
