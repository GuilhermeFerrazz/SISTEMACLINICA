import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Toaster } from 'sonner';
import axios from 'axios';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Movements from './pages/Movements';
import Reports from './pages/Reports';
import Scanner from './pages/Scanner';
import Settings from './pages/Settings';
import Agenda from './pages/Agenda';
import AgendaSettings from './pages/AgendaSettings';
import CRM from './pages/CRM';
import PatientsDashboard from './pages/PatientsDashboard';
import CRMAniversarios from './pages/CRMAniversarios';
import CRMBotoxReturn from './pages/CRMBotoxReturn';
import CRMInativos from './pages/CRMInativos';
import CRMSettings from './pages/CRMSettings';
import AdminUsers from './pages/AdminUsers';
import ConsentSign from './pages/ConsentSign';
import AppointmentConfirm from './pages/AppointmentConfirm';
import MedicalRecords from './pages/MedicalRecords';
import Atendimento from './pages/Atendimento';
import Finance from './pages/Finance';
import FinanceReports from './pages/FinanceReports';
import Pricing from './pages/Pricing';
import PricingConfig from './pages/PricingConfig';
import '@/App.css';

const FaviconUpdater = () => {
  const { user } = useAuth();
  
  useEffect(() => {
    // Não tenta carregar favicon dinâmico se estiver na página pública de assinatura
    if (window.location.pathname.includes('/assinar/')) return;
    if (window.location.pathname.includes('/confirmar/')) return;
    // Só busca settings se o usuário estiver autenticado (evita 401 desnecessário na tela de login)
    if (!user) return;

    const updateFavicon = async () => {
      try {
        const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
        const { data } = await axios.get(`${BACKEND_URL}/api/settings`, { withCredentials: true });
        if (data && data.logo_url) {
          let link = document.querySelector("link[rel~='icon']");
          if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.getElementsByTagName('head')[0].appendChild(link);
          }
          link.href = data.logo_url;
        }
      } catch (err) {
        console.error("Erro ao carregar favicon:", err);
      }
    };

    updateFavicon();
  }, [user]);

  return null;
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
        <FaviconUpdater />
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/assinar/:token" element={<ConsentSign />} />
          <Route path="/confirmar/:token" element={<AppointmentConfirm />} />
          
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/products"
            element={
              <ProtectedRoute>
                <Products />
              </ProtectedRoute>
            }
          />
          <Route
            path="/movements"
            element={
              <ProtectedRoute>
                <Movements />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <Reports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scanner"
            element={
              <ProtectedRoute>
                <Scanner />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
          
          {/* Agenda Routes */}
          <Route
            path="/agenda"
            element={
              <ProtectedRoute>
                <Agenda />
              </ProtectedRoute>
            }
          />
          <Route
            path="/agenda/configuracoes"
            element={
              <ProtectedRoute>
                <AgendaSettings />
              </ProtectedRoute>
            }
          />
          
          {/* CRM Routes */}
          <Route
            path="/crm"
            element={
              <ProtectedRoute>
                <CRM />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard-pacientes"
            element={
              <ProtectedRoute>
                <PatientsDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/crm/aniversarios"
            element={
              <ProtectedRoute>
                <CRMAniversarios />
              </ProtectedRoute>
            }
          />
          <Route
            path="/crm/botox"
            element={
              <ProtectedRoute>
                <CRMBotoxReturn />
              </ProtectedRoute>
            }
          />
          <Route
            path="/crm/inativos"
            element={
              <ProtectedRoute>
                <CRMInativos />
              </ProtectedRoute>
            }
          />
          <Route
            path="/crm/configuracoes"
            element={
              <ProtectedRoute>
                <CRMSettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/prontuario"
            element={
              <ProtectedRoute>
                <MedicalRecords />
              </ProtectedRoute>
            }
          />
          <Route
            path="/atendimento/:patientId"
            element={
              <ProtectedRoute>
                <Atendimento />
              </ProtectedRoute>
            }
          />
          <Route
            path="/atendimento/agenda/:appointmentId"
            element={
              <ProtectedRoute>
                <Atendimento />
              </ProtectedRoute>
            }
          />

          {/* Finance Routes */}
          <Route 
            path="/financeiro" 
            element={
              <ProtectedRoute>
                <Finance />
              </ProtectedRoute>
            }
          />
          <Route 
            path="/financeiro/relatorios" 
            element={
              <ProtectedRoute>
                <FinanceReports />
              </ProtectedRoute>
            }
          />

          {/* Pricing Routes */}
          <Route
            path="/precificacao"
            element={
              <ProtectedRoute>
                <Pricing />
              </ProtectedRoute>
            }
          />
          <Route
            path="/precificacao/configuracoes"
            element={
              <ProtectedRoute>
                <PricingConfig />
              </ProtectedRoute>
            }
          />

          {/* Admin Routes */}
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute>
                <AdminUsers />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
