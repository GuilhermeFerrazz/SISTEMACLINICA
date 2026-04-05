import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  LayoutDashboard, Package, History, BarChart3, QrCode,
  LogOut, Settings, Calendar, Users, ChevronDown, Box,
  Gift, Syringe, UserX, ShieldAlert, FileText,
  DollarSign, TrendingUp, Sun, Moon, Menu, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';

/* ─── Route groups ───────────────────────────────────── */
const estoqueRoutes  = ['/dashboard', '/products', '/movements', '/reports', '/scanner', '/settings'];
const agendaRoutes   = ['/agenda'];
const crmRoutes      = ['/crm', '/dashboard-pacientes', '/prontuario'];
const financeiroRoutes = ['/financeiro'];
const adminRoutes    = ['/admin'];

/* ─── Nav sub-items ──────────────────────────────────── */
const estoqueSubItems = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/products',   icon: Package,         label: 'Produtos' },
  { to: '/movements',  icon: History,         label: 'Movimentações' },
  { to: '/reports',    icon: BarChart3,        label: 'Relatórios' },
  { to: '/scanner',    icon: QrCode,           label: 'Scanner QR' },
  { to: '/settings',   icon: Settings,         label: 'Configurações' },
];
const agendaSubItems = [
  { to: '/agenda',                icon: Calendar,  label: 'Agenda',          exact: true },
  { to: '/agenda/configuracoes',  icon: Settings,  label: 'Configurações' },
];
const crmSubItems = [
  { to: '/crm',                  icon: Users,          label: 'Pacientes',        exact: true },
  { to: '/prontuario',           icon: FileText,        label: 'Prontuário' },
  { to: '/dashboard-pacientes',  icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/crm/aniversarios',     icon: Gift,            label: 'Aniversários',     accent: 'text-pink-400' },
  { to: '/crm/botox',            icon: Syringe,         label: 'Retorno Botox',    accent: 'text-purple-400' },
  { to: '/crm/inativos',         icon: UserX,           label: 'Inativos',         accent: 'text-amber-400' },
  { to: '/crm/configuracoes',    icon: Settings,        label: 'Configurações' },
];
const financeiroSubItems = [
  { to: '/financeiro',             icon: DollarSign,  label: 'Fluxo de Caixa' },
  { to: '/financeiro/relatorios',  icon: TrendingUp,  label: 'Relatórios' },
];
const adminSubItems = [
  { to: '/admin/users', icon: Users, label: 'Usuários' },
];

const mobileNavItems = [
  { to: '/dashboard',  icon: Box,        label: 'Estoque' },
  { to: '/agenda',     icon: Calendar,   label: 'Agenda' },
  { to: '/financeiro', icon: DollarSign, label: 'Finanças' },
  { to: '/crm',        icon: Users,      label: 'CRM' },
  { to: '/settings',   icon: Settings,   label: 'Config' },
];

/* ─── Sidebar Section Component ─────────────────────── */
const SideSection = ({ icon: Icon, label, isActive, isOpen, onToggle, children, testId, accent }) => (
  <div>
    <button
      data-testid={testId}
      onClick={onToggle}
      className={`relative w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200 group
        ${isActive
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
        }`}
    >
      {isActive && <span className="absolute left-0 top-1/4 bottom-1/4 w-[3px] rounded-r-full bg-primary" />}
      <div className="flex items-center gap-3">
        <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${accent || ''} ${isActive ? 'text-primary' : ''}`} />
        <span className="text-sm">{label}</span>
      </div>
      <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-250 ${isOpen ? 'rotate-180' : ''}`} />
    </button>

    {isOpen && (
      <div className="mt-1 ml-3 pl-3 border-l border-border/50 space-y-0.5 pb-1">
        {children}
      </div>
    )}
  </div>
);

/* ─── Sub-nav link ───────────────────────────────────── */
const SubLink = ({ to, icon: Icon, label, exact, accent }) => (
  <NavLink
    to={to}
    end={exact}
    className={({ isActive }) =>
      `relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200
      ${isActive
        ? 'bg-primary/10 text-primary font-medium'
        : `${accent || 'text-muted-foreground'} hover:bg-secondary/50 hover:text-foreground`
      }`
    }
  >
    {({ isActive }) => (
      <>
        {isActive && <span className="absolute left-0 top-1/4 bottom-1/4 w-[3px] rounded-r-full bg-primary" />}
        <Icon className={`w-4 h-4 flex-shrink-0 ${accent || ''}`} />
        <span>{label}</span>
      </>
    )}
  </NavLink>
);

/* ─── Theme Toggle ───────────────────────────────────── */
const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      data-testid="theme-toggle-btn"
      onClick={toggleTheme}
      aria-label="Alternar tema"
      className="w-9 h-9 flex items-center justify-center rounded-xl border border-border bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95"
    >
      {theme === 'dark'
        ? <Sun  className="w-4 h-4 text-amber-400" />
        : <Moon className="w-4 h-4" />
      }
    </button>
  );
};

/* ─── Main Layout ────────────────────────────────────── */
const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isEstoqueActive    = estoqueRoutes.some((r)  => location.pathname.startsWith(r));
  const isAgendaActive     = location.pathname.startsWith('/agenda');
  const isCrmActive        = crmRoutes.some((r)      => location.pathname.startsWith(r));
  const isFinanceiroActive = location.pathname.startsWith('/financeiro');
  const isAdminActive      = location.pathname.startsWith('/admin');

  const [estoqueOpen,    setEstoqueOpen]    = useState(isEstoqueActive);
  const [agendaOpen,     setAgendaOpen]     = useState(isAgendaActive);
  const [crmOpen,        setCrmOpen]        = useState(isCrmActive);
  const [financeiroOpen, setFinanceiroOpen] = useState(isFinanceiroActive);
  const [adminOpen,      setAdminOpen]      = useState(isAdminActive);

  const isAdmin = user?.role === 'admin';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  /* ── Sidebar content (shared between desktop + mobile drawer) ── */
  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-md flex-shrink-0">
          <Package className="w-4 h-4 text-primary-foreground" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground leading-tight">Estética</p>
          <p className="text-[10px] text-muted-foreground">Sistema de Gestão</p>
        </div>
      </div>

      <div className="px-3 flex-1 overflow-y-auto space-y-0.5">
        <SideSection
          icon={Box} label="Estoque" testId="nav-estoque"
          isActive={isEstoqueActive} isOpen={estoqueOpen}
          onToggle={() => setEstoqueOpen(!estoqueOpen)}
        >
          {estoqueSubItems.map((i) => <SubLink key={i.to} {...i} />)}
        </SideSection>

        <SideSection
          icon={Calendar} label="Agenda" testId="nav-agenda"
          isActive={isAgendaActive} isOpen={agendaOpen}
          onToggle={() => setAgendaOpen(!agendaOpen)}
        >
          {agendaSubItems.map((i) => <SubLink key={i.to} {...i} />)}
        </SideSection>

        <SideSection
          icon={Users} label="CRM" testId="nav-crm"
          isActive={isCrmActive} isOpen={crmOpen}
          onToggle={() => setCrmOpen(!crmOpen)}
        >
          {crmSubItems.map((i) => <SubLink key={i.to} {...i} />)}
        </SideSection>

        <SideSection
          icon={DollarSign} label="Financeiro" testId="nav-financeiro"
          isActive={isFinanceiroActive} isOpen={financeiroOpen}
          onToggle={() => setFinanceiroOpen(!financeiroOpen)}
        >
          {financeiroSubItems.map((i) => <SubLink key={i.to} {...i} />)}
        </SideSection>

        {isAdmin && (
          <SideSection
            icon={ShieldAlert} label="Administração" testId="nav-admin"
            isActive={isAdminActive} isOpen={adminOpen}
            onToggle={() => setAdminOpen(!adminOpen)}
            accent="text-rose-400"
          >
            {adminSubItems.map((i) => <SubLink key={i.to} {...i} />)}
          </SideSection>
        )}
      </div>

      {/* Footer: user + theme toggle */}
      <div className="px-4 py-4 border-t border-border/60 mt-auto">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-primary">
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground truncate leading-tight">
                {user?.name}
                {isAdmin && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-rose-500/15 text-rose-400">Admin</span>
                )}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <ThemeToggle />
            <button
              data-testid="logout-btn"
              onClick={handleLogout}
              aria-label="Sair"
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-border bg-secondary/50 hover:bg-destructive/10 hover:border-destructive/30 text-muted-foreground hover:text-destructive transition-all duration-200 active:scale-95"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">

      {/* ── Desktop Sidebar ──────────────────────────────── */}
      <aside
        data-testid="desktop-sidebar"
        className="w-64 hidden md:flex md:flex-col fixed inset-y-0 left-0 z-30 border-r border-border/60 bg-[hsl(var(--sidebar-bg))]"
        style={{ transition: 'background-color 0.3s ease, border-color 0.3s ease' }}
      >
        <SidebarContent />
      </aside>

      {/* ── Mobile Menu Button ───────────────────────────── */}
      <button
        data-testid="mobile-menu-btn"
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-40 w-10 h-10 flex items-center justify-center rounded-xl bg-card border border-border shadow-md text-foreground"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* ── Mobile Drawer Overlay ────────────────────────── */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 flex"
          onClick={() => setMobileOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-72 h-full bg-[hsl(var(--sidebar-bg))] border-r border-border shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg bg-secondary text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* ── Main Content ─────────────────────────────────── */}
      <main className="flex-1 md:ml-64 pb-16 md:pb-0 min-h-screen overflow-auto">
        <div className="page-enter">
          {children}
        </div>
      </main>

      {/* ── Mobile Bottom Navigation ─────────────────────── */}
      <nav
        data-testid="mobile-bottom-nav"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-xl border-t border-border"
      >
        <div className="flex items-center justify-around px-2 py-1.5">
          {mobileNavItems.map((item) => {
            const isActive = location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                data-testid={`mobile-nav-${item.label.toLowerCase()}`}
                className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all duration-200
                  ${isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? 'scale-110' : ''} transition-transform duration-200`} />
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
