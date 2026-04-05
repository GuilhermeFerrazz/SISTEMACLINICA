import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  LayoutDashboard, Package, History, BarChart3, QrCode,
  LogOut, Settings, Calendar, Users, ChevronDown, Box,
  Gift, Syringe, UserX, ShieldAlert, FileText,
  DollarSign, TrendingUp, Sun, Moon, Menu, X, ChevronRight
} from 'lucide-react';

/* ─── Sidebar width ──────────────────────────────────── */
const SIDEBAR_W = 280; // px

/* ─── Route groups ───────────────────────────────────── */
const estoqueRoutes    = ['/dashboard', '/products', '/movements', '/reports', '/scanner', '/settings'];
const agendaRoutes     = ['/agenda'];
const crmRoutes        = ['/crm', '/dashboard-pacientes', '/prontuario'];
const financeiroRoutes = ['/financeiro'];
const adminRoutes      = ['/admin'];

/* ─── Nav data ───────────────────────────────────────── */
const estoqueSubItems = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/products',   icon: Package,          label: 'Produtos' },
  { to: '/movements',  icon: History,           label: 'Movimentações' },
  { to: '/reports',    icon: BarChart3,          label: 'Relatórios' },
  { to: '/scanner',    icon: QrCode,             label: 'Scanner QR' },
  { to: '/settings',   icon: Settings,           label: 'Configurações' },
];
const agendaSubItems = [
  { to: '/agenda',               icon: Calendar, label: 'Agenda', exact: true },
  { to: '/agenda/configuracoes', icon: Settings, label: 'Configurações' },
];
const crmSubItems = [
  { to: '/crm',                 icon: Users,          label: 'Pacientes',      exact: true },
  { to: '/prontuario',          icon: FileText,        label: 'Prontuário' },
  { to: '/dashboard-pacientes', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/crm/aniversarios',    icon: Gift,            label: 'Aniversários',   accent: '#f472b6' },
  { to: '/crm/botox',           icon: Syringe,         label: 'Retorno Botox',  accent: '#c084fc' },
  { to: '/crm/inativos',        icon: UserX,           label: 'Inativos',       accent: '#fbbf24' },
  { to: '/crm/configuracoes',   icon: Settings,        label: 'Configurações' },
];
const financeiroSubItems = [
  { to: '/financeiro',            icon: DollarSign, label: 'Fluxo de Caixa' },
  { to: '/financeiro/relatorios', icon: TrendingUp,  label: 'Relatórios' },
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

/* ─── Section accordion ─────────────────────────────── */
const SideSection = ({ icon: Icon, label, isActive, isOpen, onToggle, children, testId, accentColor }) => (
  <div className="relative">
    <button
      data-testid={testId}
      onClick={onToggle}
      className={`
        group w-full flex items-center justify-between px-4 py-3.5 rounded-2xl
        transition-all duration-200 ease-out select-none
        ${isActive
          ? 'bg-primary/12 text-primary'
          : 'text-foreground/70 hover:bg-muted/60 hover:text-foreground'
        }
      `}
    >
      {/* Left accent bar */}
      <span className={`
        absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full
        transition-all duration-300
        ${isActive ? 'h-7 bg-primary opacity-100' : 'h-0 opacity-0'}
      `} />

      <div className="flex items-center gap-3.5">
        <span className={`
          flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0
          transition-all duration-200
          ${isActive
            ? 'bg-primary/15 text-primary'
            : 'bg-muted/50 text-foreground/60 group-hover:bg-muted group-hover:text-foreground'
          }
        `}>
          <Icon style={accentColor && !isActive ? { color: accentColor } : {}} className="w-[18px] h-[18px]" />
        </span>
        <span className={`text-[15px] font-medium tracking-tight ${isActive ? 'text-primary' : ''}`}>
          {label}
        </span>
      </div>

      <ChevronDown className={`
        w-4 h-4 flex-shrink-0 transition-transform duration-300 ease-out
        ${isOpen ? 'rotate-180 text-primary' : 'text-foreground/40'}
      `} />
    </button>

    {/* Submenu with smooth height animation */}
    <div className={`
      overflow-hidden transition-all duration-300 ease-out
      ${isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}
    `}>
      <div className="ml-5 pl-4 border-l-2 border-border/40 mt-0.5 mb-1 space-y-0.5">
        {children}
      </div>
    </div>
  </div>
);

/* ─── Sub-link ───────────────────────────────────────── */
const SubLink = ({ to, icon: Icon, label, exact, accent }) => (
  <NavLink
    to={to}
    end={exact}
    className={({ isActive }) => `
      group relative flex items-center gap-3 px-3 py-2.5 rounded-xl
      transition-all duration-150 ease-out
      ${isActive
        ? 'bg-primary/10 text-primary font-semibold'
        : 'text-foreground/60 hover:bg-muted/50 hover:text-foreground'
      }
    `}
  >
    {({ isActive }) => (
      <>
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-primary" />
        )}
        <Icon
          className="w-4 h-4 flex-shrink-0 transition-colors duration-150"
          style={accent && !isActive ? { color: accent } : {}}
        />
        <span className="text-sm leading-none">{label}</span>
        {isActive && <ChevronRight className="w-3 h-3 ml-auto opacity-50" />}
      </>
    )}
  </NavLink>
);

/* ─── Theme Toggle ───────────────────────────────────── */
const ThemeToggle = ({ compact = false }) => {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      data-testid="theme-toggle-btn"
      onClick={toggleTheme}
      aria-label="Alternar tema"
      title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
      className={`
        flex items-center justify-center rounded-xl border border-border/60
        bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground
        transition-all duration-200 active:scale-95
        ${compact ? 'w-9 h-9' : 'w-10 h-10'}
      `}
    >
      {theme === 'dark'
        ? <Sun  className={compact ? 'w-4 h-4 text-amber-400' : 'w-[18px] h-[18px] text-amber-400'} />
        : <Moon className={compact ? 'w-4 h-4' : 'w-[18px] h-[18px]'} />
      }
    </button>
  );
};

/* ─── Sidebar inner content ─────────────────────────── */
const SidebarContent = ({ user, isAdmin, isEstoqueActive, isAgendaActive, isCrmActive, isFinanceiroActive, isAdminActive,
  estoqueOpen, setEstoqueOpen, agendaOpen, setAgendaOpen, crmOpen, setCrmOpen,
  financeiroOpen, setFinanceiroOpen, adminOpen, setAdminOpen, handleLogout, onLinkClick }) => (
  <div className="flex flex-col h-full overflow-hidden">

    {/* ── Logo ── */}
    <div className="px-5 pt-6 pb-5 flex items-center gap-3.5">
      <div className="w-11 h-11 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25 flex-shrink-0">
        <Package className="w-5 h-5 text-primary-foreground" />
      </div>
      <div>
        <p className="text-base font-bold text-foreground leading-tight tracking-tight">Estética</p>
        <p className="text-xs text-muted-foreground mt-0.5">Sistema de Gestão</p>
      </div>
    </div>

    {/* ── Divider ── */}
    <div className="mx-4 h-px bg-border/50 mb-3" />

    {/* ── Nav ── */}
    <nav className="px-3 flex-1 overflow-y-auto space-y-1 pb-4" onClick={onLinkClick}>
      {/* Section label */}
      <p className="px-4 pb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">
        Módulos
      </p>

      <SideSection icon={Box} label="Estoque" testId="nav-estoque"
        isActive={isEstoqueActive} isOpen={estoqueOpen} onToggle={() => setEstoqueOpen(o => !o)}>
        {estoqueSubItems.map(i => <SubLink key={i.to} {...i} />)}
      </SideSection>

      <SideSection icon={Calendar} label="Agenda" testId="nav-agenda"
        isActive={isAgendaActive} isOpen={agendaOpen} onToggle={() => setAgendaOpen(o => !o)}>
        {agendaSubItems.map(i => <SubLink key={i.to} {...i} />)}
      </SideSection>

      <SideSection icon={Users} label="CRM" testId="nav-crm"
        isActive={isCrmActive} isOpen={crmOpen} onToggle={() => setCrmOpen(o => !o)}>
        {crmSubItems.map(i => <SubLink key={i.to} {...i} />)}
      </SideSection>

      <SideSection icon={DollarSign} label="Financeiro" testId="nav-financeiro"
        isActive={isFinanceiroActive} isOpen={financeiroOpen} onToggle={() => setFinanceiroOpen(o => !o)}>
        {financeiroSubItems.map(i => <SubLink key={i.to} {...i} />)}
      </SideSection>

      {isAdmin && (
        <>
          <div className="mx-4 h-px bg-border/40 my-2" />
          <p className="px-4 pb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">
            Sistema
          </p>
          <SideSection icon={ShieldAlert} label="Administração" testId="nav-admin"
            isActive={isAdminActive} isOpen={adminOpen} onToggle={() => setAdminOpen(o => !o)}
            accentColor="#f87171">
            {adminSubItems.map(i => <SubLink key={i.to} {...i} />)}
          </SideSection>
        </>
      )}
    </nav>

    {/* ── Footer ── */}
    <div className="px-4 py-4 border-t border-border/50">
      {/* User card */}
      <div className="flex items-center gap-3 p-3 rounded-2xl bg-muted/40 hover:bg-muted/60 transition-colors mb-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/40 to-primary/20 flex items-center justify-center flex-shrink-0 shadow-sm">
          <span className="text-sm font-bold text-primary">
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-foreground truncate leading-tight">
              {user?.name}
            </p>
            {isAdmin && (
              <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-rose-500/15 text-rose-400 uppercase tracking-wide">
                Admin
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
        </div>
      </div>

      {/* Actions row */}
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <button
          data-testid="logout-btn"
          onClick={handleLogout}
          title="Sair"
          className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl border border-border/60 bg-muted/50
            hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive
            text-muted-foreground text-sm font-medium transition-all duration-200 active:scale-95"
        >
          <LogOut className="w-4 h-4" />
          <span>Sair</span>
        </button>
      </div>
    </div>
  </div>
);

/* ─── Layout ─────────────────────────────────────────── */
const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [mobileOpen,     setMobileOpen]     = useState(false);
  const drawerRef = useRef(null);

  const isEstoqueActive    = estoqueRoutes.some(r    => location.pathname.startsWith(r));
  const isAgendaActive     = location.pathname.startsWith('/agenda');
  const isCrmActive        = crmRoutes.some(r        => location.pathname.startsWith(r));
  const isFinanceiroActive = location.pathname.startsWith('/financeiro');
  const isAdminActive      = location.pathname.startsWith('/admin');

  const [estoqueOpen,    setEstoqueOpen]    = useState(isEstoqueActive);
  const [agendaOpen,     setAgendaOpen]     = useState(isAgendaActive);
  const [crmOpen,        setCrmOpen]        = useState(isCrmActive);
  const [financeiroOpen, setFinanceiroOpen] = useState(isFinanceiroActive);
  const [adminOpen,      setAdminOpen]      = useState(isAdminActive);

  const isAdmin = user?.role === 'admin';

  // Close mobile drawer on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Prevent body scroll when drawer open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const handleLogout = async () => { await logout(); navigate('/login'); };

  const sidebarProps = {
    user, isAdmin,
    isEstoqueActive, isAgendaActive, isCrmActive, isFinanceiroActive, isAdminActive,
    estoqueOpen, setEstoqueOpen,
    agendaOpen, setAgendaOpen,
    crmOpen, setCrmOpen,
    financeiroOpen, setFinanceiroOpen,
    adminOpen, setAdminOpen,
    handleLogout,
  };

  return (
    <div className="min-h-screen bg-background flex">

      {/* ════════════════════════════════════════════
          DESKTOP SIDEBAR (lg+)
      ════════════════════════════════════════════ */}
      <aside
        data-testid="desktop-sidebar"
        style={{ width: SIDEBAR_W, transition: 'background-color .3s,border-color .3s' }}
        className="hidden lg:flex lg:flex-col fixed inset-y-0 left-0 z-30 border-r border-border/50 bg-[hsl(var(--sidebar-bg))] shadow-xl shadow-black/5"
      >
        <SidebarContent {...sidebarProps} onLinkClick={undefined} />
      </aside>

      {/* ════════════════════════════════════════════
          TABLET SIDEBAR (md – lg)
          Narrower 64px icon-only rail
      ════════════════════════════════════════════ */}
      <aside
        className="hidden md:flex lg:hidden flex-col fixed inset-y-0 left-0 z-30 w-16 border-r border-border/50 bg-[hsl(var(--sidebar-bg))]"
      >
        {/* Logo icon */}
        <div className="flex justify-center pt-5 pb-4">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-md">
            <Package className="w-5 h-5 text-primary-foreground" />
          </div>
        </div>

        <div className="h-px bg-border/40 mx-3 mb-3" />

        {/* Icon nav */}
        <nav className="flex-1 flex flex-col items-center gap-1 px-2 overflow-y-auto pb-4">
          {[
            { to: '/dashboard', icon: Box,        tip: 'Estoque',     active: isEstoqueActive },
            { to: '/agenda',    icon: Calendar,   tip: 'Agenda',      active: isAgendaActive },
            { to: '/crm',       icon: Users,      tip: 'CRM',         active: isCrmActive },
            { to: '/financeiro',icon: DollarSign, tip: 'Financeiro',  active: isFinanceiroActive },
            { to: '/settings',  icon: Settings,   tip: 'Config',      active: false },
            ...(isAdmin ? [{ to: '/admin/users', icon: ShieldAlert, tip: 'Admin', active: isAdminActive }] : []),
          ].map(({ to, icon: Icon, tip, active }) => (
            <NavLink
              key={to} to={to} title={tip}
              className={`
                flex items-center justify-center w-11 h-11 rounded-xl transition-all duration-200
                ${active
                  ? 'bg-primary/15 text-primary shadow-sm shadow-primary/20'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                }
              `}
            >
              <Icon className="w-5 h-5" />
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="flex flex-col items-center gap-2 px-2 py-4 border-t border-border/40">
          <ThemeToggle compact />
          <button
            onClick={handleLogout} title="Sair"
            className="flex items-center justify-center w-11 h-11 rounded-xl border border-border/50
              bg-muted/40 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all duration-200"
          >
            <LogOut className="w-[18px] h-[18px]" />
          </button>
        </div>
      </aside>

      {/* ════════════════════════════════════════════
          MOBILE TOP BAR
      ════════════════════════════════════════════ */}
      <header className="md:hidden fixed top-0 inset-x-0 z-40 h-14 bg-[hsl(var(--sidebar-bg))]/95 backdrop-blur-xl border-b border-border/50 flex items-center px-4 gap-3">
        <button
          data-testid="mobile-menu-btn"
          onClick={() => setMobileOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-muted/60 text-foreground hover:bg-muted transition-colors active:scale-95"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <Package className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <span className="text-sm font-bold text-foreground">Estética</span>
        </div>
        <ThemeToggle compact />
      </header>

      {/* ════════════════════════════════════════════
          MOBILE DRAWER
      ════════════════════════════════════════════ */}
      {/* Overlay */}
      <div
        className={`md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setMobileOpen(false)}
      />
      {/* Drawer panel */}
      <div
        ref={drawerRef}
        style={{ width: SIDEBAR_W }}
        className={`
          md:hidden fixed top-0 left-0 h-full z-50
          bg-[hsl(var(--sidebar-bg))] border-r border-border/50 shadow-2xl
          transition-transform duration-300 ease-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-xl bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        <SidebarContent {...sidebarProps} onLinkClick={() => setMobileOpen(false)} />
      </div>

      {/* ════════════════════════════════════════════
          MAIN CONTENT
      ════════════════════════════════════════════ */}
      <main
        style={{ '--sidebar-w': SIDEBAR_W + 'px' }}
        className="
          flex-1 min-h-screen overflow-auto
          pt-14 md:pt-0
          pb-16 md:pb-0
          md:ml-16 lg:ml-[280px]
        "
      >
        <div className="page-enter min-h-full">
          {children}
        </div>
      </main>

      {/* ════════════════════════════════════════════
          MOBILE BOTTOM NAV
      ════════════════════════════════════════════ */}
      <nav
        data-testid="mobile-bottom-nav"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[hsl(var(--sidebar-bg))]/95 backdrop-blur-xl border-t border-border/50"
      >
        <div className="flex items-stretch justify-around px-1">
          {mobileNavItems.map(({ to, icon: Icon, label }) => {
            const active = location.pathname.startsWith(to);
            return (
              <NavLink
                key={to} to={to}
                data-testid={`mobile-nav-${label.toLowerCase()}`}
                className={`flex flex-col items-center justify-center gap-1 flex-1 py-2.5 transition-all duration-200
                  ${active ? 'text-primary' : 'text-muted-foreground'}`}
              >
                <span className={`
                  flex items-center justify-center w-10 h-7 rounded-lg transition-all duration-200
                  ${active ? 'bg-primary/12' : 'bg-transparent'}
                `}>
                  <Icon className={`w-5 h-5 transition-transform duration-200 ${active ? 'scale-110' : ''}`} />
                </span>
                <span className={`text-[10px] font-semibold leading-none ${active ? 'text-primary' : 'text-muted-foreground/80'}`}>
                  {label}
                </span>
              </NavLink>
            );
          })}
        </div>
      </nav>

    </div>
  );
};

export default Layout;
