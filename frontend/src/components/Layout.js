import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  LayoutDashboard, Package, History, BarChart3, QrCode,
  LogOut, Settings, Calendar, Users, ChevronDown, Box,
  Gift, Syringe, UserX, ShieldAlert, FileText,
  DollarSign, TrendingUp, Sun, Moon, Menu, X,
  ChevronRight, GripVertical, Pencil, Lock, Check
} from 'lucide-react';

/* ─── Sidebar width ──────────────────────────────────── */
const SIDEBAR_W = 280;

/* ─── Route groups ───────────────────────────────────── */
const estoqueRoutes    = ['/dashboard', '/products', '/movements', '/reports', '/scanner', '/settings'];
const crmRoutes        = ['/crm', '/dashboard-pacientes', '/prontuario'];

/* ─── Sub-items data ─────────────────────────────────── */
const SUB_ITEMS = {
  estoque: [
    { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/products',   icon: Package,          label: 'Produtos' },
    { to: '/movements',  icon: History,           label: 'Movimentações' },
    { to: '/reports',    icon: BarChart3,          label: 'Relatórios' },
    { to: '/scanner',    icon: QrCode,             label: 'Scanner QR' },
    { to: '/settings',   icon: Settings,           label: 'Configurações' },
  ],
  agenda: [
    { to: '/agenda',               icon: Calendar, label: 'Agenda', exact: true },
    { to: '/agenda/configuracoes', icon: Settings, label: 'Configurações' },
  ],
  crm: [
    { to: '/crm',                 icon: Users,          label: 'Pacientes',      exact: true },
    { to: '/prontuario',          icon: FileText,        label: 'Prontuário' },
    { to: '/dashboard-pacientes', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/crm/aniversarios',    icon: Gift,            label: 'Aniversários',  accent: '#f472b6' },
    { to: '/crm/botox',           icon: Syringe,         label: 'Retorno Botox', accent: '#c084fc' },
    { to: '/crm/inativos',        icon: UserX,           label: 'Inativos',      accent: '#fbbf24' },
    { to: '/crm/configuracoes',   icon: Settings,        label: 'Configurações' },
  ],
  financeiro: [
    { to: '/financeiro',            icon: DollarSign, label: 'Fluxo de Caixa' },
    { to: '/financeiro/relatorios', icon: TrendingUp,  label: 'Relatórios' },
  ],
  admin: [
    { to: '/admin/users', icon: Users, label: 'Usuários' },
  ],
};

/* ─── Section definitions ────────────────────────────── */
const SECTION_DEFS = {
  estoque:    { id: 'estoque',    icon: Box,        label: 'Estoque',        testId: 'nav-estoque' },
  agenda:     { id: 'agenda',     icon: Calendar,   label: 'Agenda',         testId: 'nav-agenda' },
  crm:        { id: 'crm',        icon: Users,      label: 'CRM',            testId: 'nav-crm' },
  financeiro: { id: 'financeiro', icon: DollarSign, label: 'Financeiro',     testId: 'nav-financeiro' },
};

const DEFAULT_ORDER = ['estoque', 'agenda', 'crm', 'financeiro'];
const LS_KEY = 'sidebar-section-order';

const loadOrder = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY));
    if (Array.isArray(saved) && saved.length === DEFAULT_ORDER.length &&
        DEFAULT_ORDER.every(id => saved.includes(id))) return saved;
  } catch { /* ignore */ }
  return DEFAULT_ORDER;
};

/* ─── Mobile nav items (follow section order) ─────────── */
const buildMobileNav = (order) => {
  const map = {
    estoque:    { to: '/dashboard',  icon: Box,        label: 'Estoque' },
    agenda:     { to: '/agenda',     icon: Calendar,   label: 'Agenda' },
    crm:        { to: '/crm',        icon: Users,      label: 'CRM' },
    financeiro: { to: '/financeiro', icon: DollarSign, label: 'Finanças' },
  };
  const result = order.slice(0, 4).map(id => map[id]).filter(Boolean);
  result.push({ to: '/settings', icon: Settings, label: 'Config' });
  return result;
};

/* ─── SubLink ────────────────────────────────────────── */
const SubLink = ({ to, icon: Icon, label, exact, accent }) => (
  <NavLink to={to} end={exact}
    className={({ isActive }) => `
      group relative flex items-center gap-3 px-3 py-2.5 rounded-xl
      transition-all duration-150 ease-out
      ${isActive
        ? 'bg-primary/10 text-primary font-semibold'
        : 'text-foreground/60 hover:bg-muted/50 hover:text-foreground'}
    `}
  >
    {({ isActive }) => (
      <>
        {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-primary" />}
        <Icon className="w-4 h-4 flex-shrink-0" style={accent && !isActive ? { color: accent } : {}} />
        <span className="text-sm leading-none">{label}</span>
        {isActive && <ChevronRight className="w-3 h-3 ml-auto opacity-50" />}
      </>
    )}
  </NavLink>
);

/* ─── Draggable Section ──────────────────────────────── */
const DraggableSection = ({
  id, icon: Icon, label, testId, accentColor,
  isActive, isOpen, onToggle, children,
  isDragging, isDragOver,
  onDragStart, onDragEnter, onDragOver, onDragEnd, onDrop,
  editMode,
}) => (
  <div
    draggable={editMode}
    onDragStart={editMode ? onDragStart : undefined}
    onDragEnter={editMode ? onDragEnter : undefined}
    onDragOver={editMode ? onDragOver : undefined}
    onDragEnd={editMode ? onDragEnd : undefined}
    onDrop={editMode ? onDrop : undefined}
    className={`
      relative rounded-2xl transition-all duration-200
      ${editMode ? 'cursor-default' : ''}
      ${isDragging && editMode ? 'opacity-40 scale-[0.98]' : 'opacity-100'}
      ${isDragOver && editMode ? 'ring-2 ring-primary/40 ring-offset-1 ring-offset-transparent bg-primary/5' : ''}
    `}
  >
    <button
      data-testid={testId}
      onClick={onToggle}
      className={`
        group w-full flex items-center justify-between px-3 py-3.5 rounded-2xl
        transition-all duration-200 ease-out select-none
        ${isActive
          ? 'bg-primary/12 text-primary'
          : 'text-foreground/70 hover:bg-muted/60 hover:text-foreground'}
      `}
    >
      {/* Active bar */}
      <span className={`
        absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full transition-all duration-300
        ${isActive && !editMode ? 'h-7 bg-primary opacity-100' : 'h-0 opacity-0'}
      `} />

      <div className="flex items-center gap-3.5 flex-1 min-w-0">
        {/* Drag handle — only visible & active in editMode */}
        <span
          title={editMode ? 'Arraste para reordenar' : ''}
          className={`
            flex-shrink-0 transition-all duration-200
            ${editMode
              ? 'cursor-grab active:cursor-grabbing text-primary/60 hover:text-primary animate-pulse'
              : 'opacity-0 w-0 overflow-hidden pointer-events-none'
            }
          `}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4" />
        </span>

        {/* Icon badge */}
        <span className={`
          flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0 transition-all duration-200
          ${editMode
            ? 'bg-primary/10 ring-1 ring-primary/20'
            : isActive
              ? 'bg-primary/15 text-primary'
              : 'bg-muted/50 text-foreground/60 group-hover:bg-muted group-hover:text-foreground'}
        `}>
          <Icon
            className="w-[17px] h-[17px]"
            style={accentColor && !isActive ? { color: accentColor } : {}}
          />
        </span>

        <span className={`text-[15px] font-medium tracking-tight truncate ${isActive && !editMode ? 'text-primary' : ''}`}>
          {label}
        </span>
      </div>

      <ChevronDown className={`
        w-4 h-4 flex-shrink-0 ml-1 transition-transform duration-300 ease-out
        ${isOpen ? 'rotate-180 text-primary' : 'text-foreground/40'}
        ${editMode ? 'opacity-30' : ''}
      `} />
    </button>

    {/* Submenu — hidden in edit mode */}
    <div className={`
      overflow-hidden transition-all duration-300 ease-out
      ${isOpen && !editMode ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}
    `}>
      <div className="ml-10 pl-3 border-l-2 border-border/40 mt-0.5 mb-1 space-y-0.5">
        {children}
      </div>
    </div>
  </div>
);

/* ─── Theme Toggle ───────────────────────────────────── */
const ThemeToggle = ({ compact = false }) => {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      data-testid="theme-toggle-btn"
      onClick={toggleTheme}
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
        : <Moon className={compact ? 'w-4 h-4' : 'w-[18px] h-[18px]'} />}
    </button>
  );
};

/* ─── Sidebar Content ────────────────────────────────── */
const SidebarContent = ({
  user, isAdmin, location,
  sectionOrder, setSectionOrder,
  openMap, toggleOpen,
  handleLogout, onLinkClick,
  editMode, setEditMode,
}) => {
  const dragId     = useRef(null);
  const dragOverId = useRef(null);

  const isActive = useCallback((id) => {
    const p = location.pathname;
    if (id === 'estoque')    return estoqueRoutes.some(r => p.startsWith(r));
    if (id === 'agenda')     return p.startsWith('/agenda');
    if (id === 'crm')        return crmRoutes.some(r => p.startsWith(r));
    if (id === 'financeiro') return p.startsWith('/financeiro');
    if (id === 'admin')      return p.startsWith('/admin');
    return false;
  }, [location.pathname]);

  const handleDragStart = (id) => () => { dragId.current = id; };
  const handleDragEnter = (id) => () => { dragOverId.current = id; };
  const handleDragOver  = (e)  => { e.preventDefault(); };
  const handleDrop      = (id) => (e) => {
    e.preventDefault();
    if (!dragId.current || dragId.current === id) return;
    const from = sectionOrder.indexOf(dragId.current);
    const to   = sectionOrder.indexOf(id);
    if (from === -1 || to === -1) return;
    const next = [...sectionOrder];
    next.splice(from, 1);
    next.splice(to, 0, dragId.current);
    setSectionOrder(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    dragId.current     = null;
    dragOverId.current = null;
    // Auto-lock after drop
    setTimeout(() => setEditMode(false), 600);
  };
  const handleDragEnd = () => {
    dragId.current    = null;
    dragOverId.current = null;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Logo */}
      <div className="px-5 pt-6 pb-5 flex items-center gap-3.5">
        <div className="w-11 h-11 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25 flex-shrink-0">
          <Package className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <p className="text-base font-bold text-foreground leading-tight tracking-tight">Estética</p>
          <p className="text-xs text-muted-foreground mt-0.5">Sistema de Gestão</p>
        </div>
      </div>

      <div className="mx-4 h-px bg-border/50 mb-3" />

      {/* Nav */}
      <nav className="px-3 flex-1 overflow-y-auto space-y-1 pb-4" onClick={onLinkClick}>

        {/* MÓDULOS header with edit/lock toggle */}
        <div className="px-1 pb-2 flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50">
            Módulos
          </p>
          <button
            data-testid="edit-order-btn"
            onClick={(e) => { e.stopPropagation(); setEditMode(m => !m); }}
            title={editMode ? 'Concluir edição' : 'Reordenar módulos'}
            className={`
              flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold
              transition-all duration-200 active:scale-95
              ${editMode
                ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/50'
              }
            `}
          >
            {editMode
              ? <><Check className="w-3 h-3" /> Concluído</>
              : <><Pencil className="w-3 h-3" /> Editar</>
            }
          </button>
        </div>

        {/* Edit mode banner */}
        {editMode && (
          <div className="mx-1 mb-2 px-3 py-2 rounded-xl bg-primary/8 border border-primary/20 flex items-center gap-2">
            <GripVertical className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <p className="text-[11px] text-primary font-medium leading-tight">
              Arraste as seções para reordenar
            </p>
          </div>
        )}

        {sectionOrder.map((id) => {
          const def = SECTION_DEFS[id];
          if (!def) return null;
          return (
            <DraggableSection
              key={id}
              {...def}
              isActive={isActive(id)}
              isOpen={openMap[id]}
              onToggle={() => !editMode && toggleOpen(id)}
              isDragging={false}
              isDragOver={false}
              onDragStart={handleDragStart(id)}
              onDragEnter={handleDragEnter(id)}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDrop={handleDrop(id)}
              editMode={editMode}
            >
              {SUB_ITEMS[id]?.map(i => <SubLink key={i.to} {...i} />)}
            </DraggableSection>
          );
        })}

        {/* Admin (always last, not draggable) */}
        {isAdmin && (
          <>
            <div className="mx-4 h-px bg-border/40 my-2" />
            <p className="px-4 pb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50">
              Sistema
            </p>
            <div className="relative rounded-2xl">
              <button
                data-testid="nav-admin"
                onClick={() => toggleOpen('admin')}
                className={`
                  w-full flex items-center justify-between px-3 py-3.5 rounded-2xl
                  transition-all duration-200 select-none
                  ${isActive('admin') ? 'bg-rose-500/10 text-rose-500' : 'text-foreground/70 hover:bg-muted/60 hover:text-foreground'}
                `}
              >
                {isActive('admin') && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-7 rounded-r-full bg-rose-500" />}
                <div className="flex items-center gap-3.5 flex-1">
                  <span className="w-4 h-4 flex-shrink-0" />
                  <span className={`flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0
                    ${isActive('admin') ? 'bg-rose-500/15' : 'bg-muted/50'}`}>
                    <ShieldAlert className="w-[17px] h-[17px] text-rose-400" />
                  </span>
                  <span className="text-[15px] font-medium tracking-tight">Administração</span>
                </div>
                <ChevronDown className={`w-4 h-4 flex-shrink-0 ml-1 transition-transform duration-300 ${openMap['admin'] ? 'rotate-180' : ''}`} />
              </button>
              <div className={`overflow-hidden transition-all duration-300 ${openMap['admin'] ? 'max-h-[200px] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="ml-10 pl-3 border-l-2 border-border/40 mt-0.5 mb-1 space-y-0.5">
                  {SUB_ITEMS.admin.map(i => <SubLink key={i.to} {...i} />)}
                </div>
              </div>
            </div>
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-border/50">
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-muted/40 hover:bg-muted/60 transition-colors mb-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/40 to-primary/20 flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-sm font-bold text-primary">{user?.name?.charAt(0)?.toUpperCase() || 'U'}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-foreground truncate leading-tight">{user?.name}</p>
              {isAdmin && (
                <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-rose-500/15 text-rose-400 uppercase tracking-wide">
                  Admin
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            data-testid="logout-btn"
            onClick={handleLogout}
            className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl border border-border/60
              bg-muted/50 hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive
              text-muted-foreground text-sm font-medium transition-all duration-200 active:scale-95"
          >
            <LogOut className="w-4 h-4" /> Sair
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─── Layout ─────────────────────────────────────────── */
const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const drawerRef = useRef(null);

  const [mobileOpen,    setMobileOpen]    = useState(false);
  const [sectionOrder,  setSectionOrder]  = useState(loadOrder);
  const [editMode,      setEditMode]      = useState(false);

  /* Track which sections are open */
  const initOpen = useCallback(() => {
    const p = location.pathname;
    return {
      estoque:    estoqueRoutes.some(r => p.startsWith(r)),
      agenda:     p.startsWith('/agenda'),
      crm:        crmRoutes.some(r => p.startsWith(r)),
      financeiro: p.startsWith('/financeiro'),
      admin:      p.startsWith('/admin'),
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [openMap, setOpenMap] = useState(initOpen);
  const toggleOpen = (id) => setOpenMap(m => ({ ...m, [id]: !m[id] }));

  const isAdmin = user?.role === 'admin';

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const handleLogout = async () => { await logout(); navigate('/login'); };

  const sidebarProps = {
    user, isAdmin, location,
    sectionOrder, setSectionOrder,
    openMap, toggleOpen,
    handleLogout,
    editMode, setEditMode,
  };

  const mobileNavItems = buildMobileNav(sectionOrder);

  return (
    <div className="min-h-screen bg-background">

      {/* ── Desktop Sidebar (lg+) ── */}
      <aside
        data-testid="desktop-sidebar"
        style={{ width: SIDEBAR_W, transition: 'background-color .3s,border-color .3s' }}
        className="hidden lg:flex lg:flex-col fixed inset-y-0 left-0 z-30 border-r border-border/50 bg-[hsl(var(--sidebar-bg))] shadow-xl shadow-black/5"
      >
        <SidebarContent {...sidebarProps} onLinkClick={undefined} />
      </aside>

      {/* ── Tablet Rail (md–lg) ── */}
      <aside className="hidden md:flex lg:hidden flex-col fixed inset-y-0 left-0 z-30 w-16 border-r border-border/50 bg-[hsl(var(--sidebar-bg))]">
        <div className="flex justify-center pt-5 pb-4">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-md">
            <Package className="w-5 h-5 text-primary-foreground" />
          </div>
        </div>
        <div className="h-px bg-border/40 mx-3 mb-3" />
        <nav className="flex-1 flex flex-col items-center gap-1 px-2 overflow-y-auto pb-4">
          {[
            { to: '/dashboard',  icon: Box,        tip: 'Estoque',     active: estoqueRoutes.some(r => location.pathname.startsWith(r)) },
            { to: '/agenda',     icon: Calendar,   tip: 'Agenda',      active: location.pathname.startsWith('/agenda') },
            { to: '/crm',        icon: Users,      tip: 'CRM',         active: crmRoutes.some(r => location.pathname.startsWith(r)) },
            { to: '/financeiro', icon: DollarSign, tip: 'Financeiro',  active: location.pathname.startsWith('/financeiro') },
            { to: '/settings',   icon: Settings,   tip: 'Config',      active: false },
            ...(isAdmin ? [{ to: '/admin/users', icon: ShieldAlert, tip: 'Admin', active: location.pathname.startsWith('/admin') }] : []),
          ].map(({ to, icon: Icon, tip, active }) => (
            <NavLink key={to} to={to} title={tip}
              className={`flex items-center justify-center w-11 h-11 rounded-xl transition-all duration-200
                ${active ? 'bg-primary/15 text-primary shadow-sm shadow-primary/20' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}>
              <Icon className="w-5 h-5" />
            </NavLink>
          ))}
        </nav>
        <div className="flex flex-col items-center gap-2 px-2 py-4 border-t border-border/40">
          <ThemeToggle compact />
          <button onClick={handleLogout} title="Sair"
            className="flex items-center justify-center w-11 h-11 rounded-xl border border-border/50 bg-muted/40 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all">
            <LogOut className="w-[18px] h-[18px]" />
          </button>
        </div>
      </aside>

      {/* ── Mobile Top Bar ── */}
      <header className="md:hidden fixed top-0 inset-x-0 z-40 h-14 bg-[hsl(var(--sidebar-bg))]/95 backdrop-blur-xl border-b border-border/50 flex items-center px-4 gap-3">
        <button data-testid="mobile-menu-btn" onClick={() => setMobileOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-muted/60 text-foreground hover:bg-muted transition-colors active:scale-95">
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

      {/* ── Mobile Overlay ── */}
      <div
        className={`md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity duration-300
          ${mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setMobileOpen(false)}
      />
      {/* ── Mobile Drawer ── */}
      <div ref={drawerRef} style={{ width: SIDEBAR_W }}
        className={`md:hidden fixed top-0 left-0 h-full z-50 bg-[hsl(var(--sidebar-bg))] border-r border-border/50 shadow-2xl
          transition-transform duration-300 ease-out ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <button onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-xl bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
        <SidebarContent {...sidebarProps} onLinkClick={() => setMobileOpen(false)} />
      </div>

      {/* ── Main Content ── */}
      <main className="w-full min-h-screen pt-14 md:pt-0 pb-16 md:pb-0 md:pl-16 lg:pl-[280px]">
        <div className="page-enter w-full min-h-full">
          {children}
        </div>
      </main>

      {/* ── Mobile Bottom Nav ── */}
      <nav data-testid="mobile-bottom-nav"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[hsl(var(--sidebar-bg))]/95 backdrop-blur-xl border-t border-border/50">
        <div className="flex items-stretch justify-around px-1">
          {mobileNavItems.map(({ to, icon: Icon, label }) => {
            const active = location.pathname.startsWith(to);
            return (
              <NavLink key={to} to={to} data-testid={`mobile-nav-${label.toLowerCase()}`}
                className={`flex flex-col items-center justify-center gap-1 flex-1 py-2.5 transition-all duration-200
                  ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                <span className={`flex items-center justify-center w-10 h-7 rounded-lg transition-all duration-200 ${active ? 'bg-primary/12' : ''}`}>
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
