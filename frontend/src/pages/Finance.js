import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  TrendingUp, TrendingDown, DollarSign, Plus, 
  Filter, Calendar, Trash2, ArrowUpCircle, ArrowDownCircle 
} from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Finance = () => {
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({ monthly_income: 0, monthly_expense: 0, monthly_profit: 0 });
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    type: 'income',
    category: 'Procedimento',
    payment_method: 'Pix',
    date: new Date().toISOString().split('T')[0],
    status: 'paid'
  });

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    try {
      const [transRes, summaryRes] = await Promise.all([
        axios.get(`${API}/finance/transactions`, { withCredentials: true }),
        axios.get(`${API}/finance/summary`, { withCredentials: true })
      ]);
      setTransactions(transRes.data);
      setSummary(summaryRes.data);
    } catch (error) {
      toast.error("Erro ao carregar dados financeiros");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.description || !formData.amount) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }
    try {
      await axios.post(`${API}/finance/transactions`, {
        ...formData,
        amount: parseFloat(formData.amount)
      }, { withCredentials: true });
      
      toast.success("Transação registrada!");
      setIsAddOpen(false);
      setFormData({ ...formData, description: '', amount: '' });
      fetchData();
    } catch (error) {
      toast.error("Erro ao salvar transação");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Deseja excluir esta transação?")) return;
    try {
      await axios.delete(`${API}/finance/transactions/${id}`, { withCredentials: true });
      toast.success("Transação excluída");
      fetchData();
    } catch (error) {
      toast.error("Erro ao excluir");
    }
  };

  return (
    <Layout>
      <div className="p-6 md:p-8 lg:p-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-4xl font-light tracking-tight text-foreground">Gestão Financeira</h1>
            <p className="text-muted-foreground">Controle de faturamento e despesas da clínica</p>
          </div>

          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-primary text-primary-foreground">
                <Plus className="w-4 h-4" /> Nova Transação
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Registrar Movimentação</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant={formData.type === 'income' ? 'default' : 'outline'}
                    onClick={() => setFormData({...formData, type: 'income', category: 'Procedimento'})}
                    className="gap-2"
                  >
                    <ArrowUpCircle className="w-4 h-4" /> Entrada
                  </Button>
                  <Button 
                    variant={formData.type === 'expense' ? 'destructive' : 'outline'}
                    onClick={() => setFormData({...formData, type: 'expense', category: 'Produtos'})}
                    className="gap-2"
                  >
                    <ArrowDownCircle className="w-4 h-4" /> Saída
                  </Button>
                </div>
                
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Input 
                    placeholder="Ex: Botox Paciente Maria ou Aluguel" 
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Valor (R$)</Label>
                    <Input 
                      type="number" 
                      placeholder="0,00"
                      value={formData.amount}
                      onChange={(e) => setFormData({...formData, amount: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data</Label>
                    <Input 
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({...formData, date: e.target.value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Select value={formData.category} onValueChange={(v) => setFormData({...formData, category: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Procedimento">Procedimento</SelectItem>
                        <SelectItem value="Produtos">Produtos</SelectItem>
                        <SelectItem value="Aluguel">Aluguel</SelectItem>
                        <SelectItem value="Marketing">Marketing</SelectItem>
                        <SelectItem value="Outros">Outros</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Pagamento</Label>
                    <Select value={formData.payment_method} onValueChange={(v) => setFormData({...formData, payment_method: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pix">Pix</SelectItem>
                        <SelectItem value="Cartão">Cartão</SelectItem>
                        <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button onClick={handleCreate} className="w-full mt-4">Salvar Transação</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Resumo Financeiro */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="p-6 border-l-4 border-l-green-500 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-full"><TrendingUp className="text-green-600" /></div>
              <div>
                <p className="text-sm text-muted-foreground uppercase font-semibold">Entradas (Mês)</p>
                <h3 className="text-2xl font-bold">R$ {summary.monthly_income.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
              </div>
            </div>
          </Card>
          
          <Card className="p-6 border-l-4 border-l-red-500 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-100 rounded-full"><TrendingDown className="text-red-600" /></div>
              <div>
                <p className="text-sm text-muted-foreground uppercase font-semibold">Saídas (Mês)</p>
                <h3 className="text-2xl font-bold">R$ {summary.monthly_expense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
              </div>
            </div>
          </Card>

          <Card className="p-6 border-l-4 border-l-primary shadow-sm">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-full"><DollarSign className="text-primary" /></div>
              <div>
                <p className="text-sm text-muted-foreground uppercase font-semibold">Lucro Líquido</p>
                <h3 className="text-2xl font-bold">R$ {summary.monthly_profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
              </div>
            </div>
          </Card>
        </div>

        {/* Lista de Transações */}
        <Card className="overflow-hidden border-border/60">
          <div className="p-4 border-b bg-muted/30 flex justify-between items-center">
            <h3 className="font-medium">Últimas Movimentações</h3>
            <Button variant="ghost" size="sm" className="gap-2"><Filter className="w-4 h-4" /> Filtrar</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/10 text-left text-muted-foreground">
                  <th className="p-4 font-medium">Data</th>
                  <th className="p-4 font-medium">Descrição</th>
                  <th className="p-4 font-medium">Categoria</th>
                  <th className="p-4 font-medium">Método</th>
                  <th className="p-4 font-medium text-right">Valor</th>
                  <th className="p-4 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-b hover:bg-muted/5 transition-colors">
                    <td className="p-4 whitespace-nowrap text-muted-foreground">
                      {new Date(t.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="p-4 font-medium text-foreground">{t.description}</td>
                    <td className="p-4">
                      <span className="px-2 py-1 rounded-full bg-secondary text-[10px] uppercase font-bold">
                        {t.category}
                      </span>
                    </td>
                    <td className="p-4 text-muted-foreground">{t.payment_method}</td>
                    <td className={`p-4 text-right font-bold ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                      {t.type === 'income' ? '+' : '-'} R$ {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-4 text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(t.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan="6" className="p-12 text-center text-muted-foreground">
                      Nenhuma movimentação registrada neste período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default Finance;
