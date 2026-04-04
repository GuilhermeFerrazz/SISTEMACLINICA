import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard, Package, History, BarChart3, QrCode, LogOut,
  Settings, Calendar, Users, ChevronDown, Box, Gift, Syringe, UserX, ShieldAlert, FileText,
  DollarSign, TrendingUp // <-- Adicionados ícones financeiros
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// 1. Adicionada a constante de rotas financeiras
const estoqueRoutes = ['/dashboard', '/products', '/movements', '/reports', '/scanner', '/settings'];
const agendaRoutes = ['/agenda', '/agenda/configuracoes'];
const crmRoutes = ['/crm', '/dashboard-pacientes', '/crm/aniversarios', '/crm/botox', '/crm/inativos', '/crm/configuracoes', '/prontuario'];
const financeiroRoutes = ['/financeiro']; // <-- Nova rota
const adminRoutes = ['/admin', '/admin/users'];

const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isEstoqueActive = estoqueRoutes.some((r) => location.pathname.startsWith(r));
  const isAgendaActive = agendaRoutes.some((r) => location.pathname === r || location.pathname.startsWith('/agenda'));
  const isCrmActive = crmRoutes.some((r) => location.pathname === r || location.pathname.startsWith('/crm') || location.pathname.startsWith('/dashboard-pacientes'));
  const isFinanceiroActive = financeiroRoutes.some((r) => location.pathname.startsWith(r)); // <-- Ativação financeira
  const isAdminActive = adminRoutes.some((r) => location.pathname.startsWith(r));

  const [estoqueOpen, setEstoqueOpen] = useState(isEstoqueActive);
  const [agendaOpen, setAgendaOpen] = useState(isAgendaActive);
  const [crmOpen, setCrmOpen] = useState(isCrmActive);
  const [financeiroOpen, setFinanceiroOpen] = useState(isFinanceiroActive); // <-- Estado do dropdown
  const [adminOpen, setAdminOpen] = useState(isAdminActive);

  const isAdmin = user?.role === 'admin';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const estoqueSubItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/products', icon: Package, label: 'Produtos' },
    { to: '/movements', icon: History, label: 'Movimentações' },
    { to: '/reports', icon: BarChart3, label: 'Relatórios' },
    { to: '/scanner', icon: QrCode, label: 'Scanner QR' },
    { to: '/settings', icon: Settings, label: 'Configurações' },
  ];

  const agendaSubItems = [
    { to: '/agenda', icon: Calendar, label: 'Agenda', exact: true },
    { to: '/agenda/configuracoes', icon: Settings, label: 'Configurações' },
  ];

  const crmSubItems = [
    { to: '/crm', icon: Users, label: 'Pacientes', exact: true },
    { to: '/prontuario', icon: FileText, label: 'Prontuário' },
    { to: '/dashboard-pacientes', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/crm/aniversarios', icon: Gift, label: 'Aniversários', color: 'text-pink-500' },
    { to: '/crm/botox', icon: Syringe, label: 'Retorno Botox', color: 'text-purple-500' },
    { to: '/crm/inativos', icon: UserX, label: 'Pacientes Inativos', color: 'text-amber-500' },
    { to: '/crm/configuracoes', icon: Settings, label: 'Configurações' },
  ];

  // 2. Definidos os sub-itens do financeiro
  const financeiroSubItems = [
    { to: '/financeiro', icon: DollarSign, label: 'Fluxo de Caixa' },
    { to: '/financeiro/relatorios', icon: TrendingUp, label: 'Relatórios' },
  ];

  const adminSubItems = [
    { to: '/admin/users', icon: Users, label: 'Usuários' },
  ];

  // 3. Atualizado o menu mobile (substituí "Config" por "Financeiro" para prioridade)
  const mobileNavItems = [
    { to: '/dashboard', icon: Box, label: 'Estoque' },
    { to: '/agenda', icon: Calendar, label: 'Agenda' },
    { to: '/financeiro', icon: DollarSign, label: 'Finanças' },
    { to: '/crm', icon: Users, label: 'CRM' },
    { to: '/settings', icon: Settings, label: 'Config' },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="w-64 border-r border-border bg-secondary/30 hidden md:flex md:flex-col md:justify-between fixed inset-y-0 left-0 z-30">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Package className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-medium text-foreground">Estética</h1>
              <p className="text-xs text-muted-foreground">Sistema de Gestão</p>
            </div>
          </div>

          <nav className="space-y-1">
            {/* Estoque Section */}
            <button
              onClick={() => setEstoqueOpen(!estoqueOpen)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-200 ${
                isEstoqueActive ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <div className="flex items-center gap-3">
                <Box className="w-5 h-5" />
                <span className="font-medium text-sm">Estoque</span>
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${estoqueOpen ? 'rotate-180' : ''}`} />
            </button>
            {estoqueOpen && (
              <div className="ml-4 pl-3 border-l border-border/60 space-y-1 py-1">
                {estoqueSubItems.map((item) => (
                  <NavLink key={item.to} to={item.to} className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}>
                    <item.icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            )}

            {/* Agenda Section */}
            <button
              onClick={() => setAgendaOpen(!agendaOpen)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-200 ${
                isAgendaActive ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5" />
                <span className="font-medium text-sm">Agenda</span>
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${agendaOpen ? 'rotate-180' : ''}`} />
            </button>
            {agendaOpen && (
              <div className="ml-4 pl-3 border-l border-border/60 space-y-1 py-1">
                {agendaSubItems.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.exact} className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}>
                    <item.icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            )}

            {/* CRM Section */}
            <button
              onClick={() => setCrmOpen(!crmOpen)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-200 ${
                isCrmActive ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5" />
                <span className="font-medium text-sm">CRM</span>
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${crmOpen ? 'rotate-180' : ''}`} />
            </button>
            {crmOpen && (
              <div className="ml-4 pl-3 border-l border-border/60 space-y-1 py-1">
                {crmSubItems.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.exact} className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${isActive ? 'bg-primary text-primary-foreground' : `${item.color || 'text-muted-foreground'} hover:bg-secondary`}`}>
                    <item.icon className={`w-4 h-4 ${item.color || ''}`} />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            )}

            {/* Financeiro Section - NOVO ITEM ADICIONADO AQUI */}
            <button
              onClick={() => setFinanceiroOpen(!financeiroOpen)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-200 ${
                isFinanceiroActive ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <div className="flex items-center gap-3">
                <DollarSign className="w-5 h-5" />
                <span className="font-medium text-sm">Financeiro</span>
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${financeiroOpen ? 'rotate-180' : ''}`} />
            </button>
            {financeiroOpen && (
              <div className="ml-4 pl-3 border-l border-border/60 space-y-1 py-1">
                {financeiroSubItems.map((item) => (
                  <NavLink key={item.to} to={item.to} className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}>
                    <item.icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            )}

            {/* Admin Section */}
            {isAdmin && (
              <>
                <button
                  onClick={() => setAdminOpen(!adminOpen)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-200 ${isAdminActive ? 'bg-red-500/10 text-red-600' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                >
                  <div className="flex items-center gap-3">
                    <ShieldAlert className="w-5 h-5 text-red-500" />
                    <span className="font-medium text-sm">Administração</span>
                  </div>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${adminOpen ? 'rotate-180' : ''}`} />
                </button>
                {adminOpen && (
                  <div className="ml-4 pl-3 border-l border-red-200 space-y-1 py-1">
                    {adminSubItems.map((item) => (
                      <NavLink key={item.to} to={item.to} className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${isActive ? 'bg-red-500 text-white' : 'text-muted-foreground hover:bg-red-50'}`}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </>
            )}
          </nav>
        </div>

        <div className="p-6 border-t border-border">
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">{user?.name}</p>
              {isAdmin && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-600">Admin</span>}
            </div>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <Button onClick={handleLogout} variant="outline" className="w-full justify-start gap-3">
            <LogOut className="w-4 h-4" />
            Sair
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto md:ml-64 pb-20 md:pb-0">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-lg border-t border-border shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-around px-2 py-2">
          {mobileNavItems.map((item) => {
            const isActive = location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg transition-all duration-200 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default Layout;
