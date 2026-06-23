import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { 
  Users, Plus, Shield, ShieldCheck, ShieldAlert, User, Mail, 
  Pencil, Trash2, Key, UserCog, BarChart3, Calendar, Package
} from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AdminUsers = () => {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user'
  });
  const [editData, setEditData] = useState({
    name: '',
    email: '',
    password: '',
    role: '',
    active: true
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [usersRes, statsRes] = await Promise.all([
        axios.get(`${API}/admin/users`, { withCredentials: true }),
        axios.get(`${API}/admin/stats`, { withCredentials: true })
      ]);
      setUsers(usersRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Error:', error);
      if (error.response?.status === 403) {
        toast.error('Acesso negado. Somente administradores podem acessar esta página.');
      } else {
        toast.error('Erro ao carregar dados');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/admin/users`, formData, { withCredentials: true });
      toast.success('Usuário criado com sucesso!');
      setIsCreateOpen(false);
      setFormData({ name: '', email: '', password: '', role: 'user' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao criar usuário');
    }
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setEditData({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      active: user.active !== false
    });
    setIsEditOpen(true);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    
    try {
      const updatePayload = {
        name: editData.name,
        email: editData.email,
        role: editData.role,
        active: editData.active
      };
      
      // Only include password if it was changed
      if (editData.password) {
        updatePayload.password = editData.password;
      }
      
      await axios.put(`${API}/admin/users/${editingUser.id}`, updatePayload, { withCredentials: true });
      toast.success('Usuário atualizado com sucesso!');
      setIsEditOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao atualizar usuário');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Tem certeza que deseja excluir este usuário? Esta ação não pode ser desfeita.')) return;
    try {
      await axios.delete(`${API}/admin/users/${userId}`, { withCredentials: true });
      toast.success('Usuário excluído com sucesso!');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao excluir usuário');
    }
  };

  const handleToggleActive = async (user) => {
    try {
      await axios.put(`${API}/admin/users/${user.id}`, {
        active: !user.active
      }, { withCredentials: true });
      toast.success(user.active ? 'Usuário desativado' : 'Usuário ativado');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao atualizar status');
    }
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'admin': return <ShieldAlert className="w-4 h-4 text-red-500" />;
      case 'manager': return <ShieldCheck className="w-4 h-4 text-blue-500" />;
      default: return <Shield className="w-4 h-4 text-gray-500" />;
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'admin': return 'Administrador';
      case 'manager': return 'Gerente';
      default: return 'Usuário';
    }
  };

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-700 border-red-200';
      case 'manager': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-6 md:p-8 lg:p-12">
          <div className="animate-pulse space-y-6">
            <div className="h-10 bg-muted rounded w-1/4"></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-muted rounded-xl"></div>)}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div data-testid="admin-users-page" className="p-6 md:p-8 lg:p-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <UserCog className="w-8 h-8 text-red-500" />
              <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-foreground">
                Administração
              </h1>
            </div>
            <p className="text-base text-muted-foreground">
              Gerenciamento de usuários e permissões
            </p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground gap-2" data-testid="create-user-button">
                <Plus className="w-5 h-5" />
                Novo Usuário
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Criar Novo Usuário</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateUser} className="space-y-4 mt-4">
                <div>
                  <Label>Nome</Label>
                  <Input
                    data-testid="new-user-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Nome completo"
                    required
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    data-testid="new-user-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@exemplo.com"
                    required
                  />
                </div>
                <div>
                  <Label>Senha</Label>
                  <Input
                    data-testid="new-user-password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Senha segura"
                    required
                  />
                </div>
                <div>
                  <Label>Função</Label>
                  <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v })}>
                    <SelectTrigger data-testid="new-user-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Usuário</SelectItem>
                      <SelectItem value="manager">Gerente</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full bg-primary text-primary-foreground" data-testid="submit-new-user">
                  Criar Usuário
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
            <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/20 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="text-2xl font-light text-foreground">{stats.total_users}</p>
                  <p className="text-xs text-muted-foreground">Usuários</p>
                </div>
              </div>
            </Card>
            <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/20 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-green-500" />
                <div>
                  <p className="text-2xl font-light text-foreground">{stats.active_users}</p>
                  <p className="text-xs text-muted-foreground">Ativos</p>
                </div>
              </div>
            </Card>
            <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border border-red-500/20 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-5 h-5 text-red-500" />
                <div>
                  <p className="text-2xl font-light text-foreground">{stats.admin_users}</p>
                  <p className="text-xs text-muted-foreground">Admins</p>
                </div>
              </div>
            </Card>
            <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/20 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-purple-500" />
                <div>
                  <p className="text-2xl font-light text-foreground">{stats.total_patients}</p>
                  <p className="text-xs text-muted-foreground">Pacientes</p>
                </div>
              </div>
            </Card>
            <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border border-amber-500/20 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-amber-500" />
                <div>
                  <p className="text-2xl font-light text-foreground">{stats.total_appointments}</p>
                  <p className="text-xs text-muted-foreground">Agendamentos</p>
                </div>
              </div>
            </Card>
            <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 border border-cyan-500/20 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <Package className="w-5 h-5 text-cyan-500" />
                <div>
                  <p className="text-2xl font-light text-foreground">{stats.total_products}</p>
                  <p className="text-xs text-muted-foreground">Produtos</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Users List */}
        <Card className="bg-card border border-border/60 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-border">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Usuários do Sistema
            </h2>
          </div>
          
          <div className="divide-y divide-border">
            {users.map((user) => (
              <div 
                key={user.id} 
                data-testid={`user-row-${user.id}`}
                className={`p-5 flex items-center justify-between hover:bg-secondary/30 transition-colors ${user.active === false ? 'opacity-50 bg-secondary/20' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    user.role === 'admin' ? 'bg-red-100' : 
                    user.role === 'manager' ? 'bg-blue-100' : 'bg-gray-100'
                  }`}>
                    {getRoleIcon(user.role)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{user.name}</p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getRoleBadgeColor(user.role)}`}>
                        {getRoleLabel(user.role)}
                      </span>
                      {user.active === false && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600">
                          Inativo
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      {user.email}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 mr-4">
                    <span className="text-xs text-muted-foreground">Ativo</span>
                    <Switch 
                      checked={user.active !== false} 
                      onCheckedChange={() => handleToggleActive(user)}
                      data-testid={`toggle-user-${user.id}`}
                    />
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleEditUser(user)}
                    className="gap-1"
                    data-testid={`edit-user-${user.id}`}
                  >
                    <Pencil className="w-3 h-3" />
                    Editar
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleDeleteUser(user.id)}
                    className="gap-1 text-destructive hover:bg-destructive/10"
                    data-testid={`delete-user-${user.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                    Excluir
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Usuário</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpdateUser} className="space-y-4 mt-4">
              <div>
                <Label>Nome</Label>
                <Input
                  data-testid="edit-user-name"
                  value={editData.name}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  data-testid="edit-user-email"
                  type="email"
                  value={editData.email}
                  onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Nova Senha (deixe em branco para manter a atual)</Label>
                <Input
                  data-testid="edit-user-password"
                  type="password"
                  value={editData.password}
                  onChange={(e) => setEditData({ ...editData, password: e.target.value })}
                  placeholder="••••••••"
                />
              </div>
              <div>
                <Label>Função</Label>
                <Select value={editData.role} onValueChange={(v) => setEditData({ ...editData, role: v })}>
                  <SelectTrigger data-testid="edit-user-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Usuário</SelectItem>
                    <SelectItem value="manager">Gerente</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label>Usuário Ativo</Label>
                <Switch 
                  checked={editData.active} 
                  onCheckedChange={(v) => setEditData({ ...editData, active: v })}
                  data-testid="edit-user-active"
                />
              </div>
              <Button type="submit" className="w-full bg-primary text-primary-foreground" data-testid="submit-edit-user">
                Salvar Alterações
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default AdminUsers;
