import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { Toaster } from 'sonner';
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

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
  );
}

export default App;
