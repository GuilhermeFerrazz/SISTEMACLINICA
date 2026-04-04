import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Gift, MessageCircle, Phone, Calendar, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CRMAniversarios = () => {
  const navigate = useNavigate();
  const [birthdays, setBirthdays] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBirthdays();
  }, []);

  const fetchBirthdays = async () => {
    try {
      const { data } = await axios.get(`${API}/patients/alerts/birthdays`, { withCredentials: true });
      setBirthdays(data);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao carregar aniversários');
    } finally {
      setLoading(false);
    }
  };

  const handleSendWhatsApp = async (patient) => {
    try {
      const { data } = await axios.get(`${API}/patients/${patient.id}/whatsapp-message?message_type=birthday`, { withCredentials: true });
      let phone = (patient.phone || '').replace(/[\s\-\(\)]/g, '');
      if (phone && !phone.startsWith('55')) phone = '55' + phone;
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(data.message)}`;
      window.open(url, '_blank');
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
      <div data-testid="crm-aniversarios-page" className="p-6 md:p-8 lg:p-12">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Gift className="w-8 h-8 text-pink-500" />
            <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-foreground">
              Aniversários
            </h1>
          </div>
          <p className="text-base text-muted-foreground">
            Pacientes com aniversário nos próximos 7 dias
          </p>
        </div>

        {birthdays.length === 0 ? (
          <Card className="bg-card border border-border/60 rounded-xl p-12 text-center">
            <Gift className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhum aniversário nos próximos 7 dias</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {birthdays.map((patient) => (
              <Card 
                key={patient.id} 
                data-testid={`birthday-card-${patient.id}`}
                className={`bg-card border rounded-xl p-5 ${patient.is_today ? 'border-pink-300 bg-gradient-to-r from-pink-50 to-purple-50' : 'border-border/60'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center ${patient.is_today ? 'bg-gradient-to-br from-pink-400 to-purple-400' : 'bg-pink-100'}`}>
                      <Gift className={`w-7 h-7 ${patient.is_today ? 'text-white' : 'text-pink-500'}`} />
                    </div>
                    <div>
                      <p className="font-medium text-lg text-foreground">{patient.name}</p>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {patient.phone}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(patient.birth_date)}
                        </span>
                      </div>
                      <p className={`text-sm font-medium mt-1 ${patient.is_today ? 'text-pink-600' : 'text-muted-foreground'}`}>
                        {patient.is_today ? '🎉 Aniversário HOJE!' : `Aniversário em ${patient.days_until_birthday} dia${patient.days_until_birthday > 1 ? 's' : ''}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      onClick={() => handleSendWhatsApp(patient)}
                      className="bg-green-600 hover:bg-green-700 text-white gap-2"
                      data-testid={`send-birthday-${patient.id}`}
                    >
                      <MessageCircle className="w-4 h-4" />
                      Enviar Parabéns
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

export default CRMAniversarios;
