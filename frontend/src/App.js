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
import MedicalRecords from './pages/MedicalRecords';
import Finance from './pages/Finance';
import FinanceReports from './pages/FinanceReports';
import '@/App.css';

const FaviconUpdater = () => {
  const { user } = useAuth();
  
  useEffect(() => {
    const updateFavicon = async () => {
      try {
        const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
        const { data } = await axios.get(`${BACKEND_URL}/api/settings`);
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
