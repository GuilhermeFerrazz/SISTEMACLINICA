import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Package, Trash2, Printer, AlertTriangle, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { DEFAULT_LABEL_CONFIG } from './Settings';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const LabelPreview = ({ product, settings }) => {
  const lc = { ...DEFAULT_LABEL_CONFIG, ...(settings?.label_config || {}) };
  const hasFillDate = lc.show_fill_date && product.fill_date && product.fill_date.length > 0;
  const responsible = product.responsible || settings?.responsible_name || '';
  const logoUrl = settings?.logo_url || '';
  const isQrLeft = lc.qr_position === 'left';

  const qrBlock = (
    <div
      style={{
        width: `${lc.qr_size + 2}mm`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <img
        src={`${API}/qr/generate/${product.qr_code_id || product.id}`}
        alt="QR Code"
        style={{ width: `${lc.qr_size}mm`, height: `${lc.qr_size}mm` }}
        crossOrigin="use-credentials"
      />
    </div>
  );

  const infoBlock = (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        gap: '0.3mm',
        paddingLeft: isQrLeft ? '1.5mm' : 0,
        paddingRight: isQrLeft ? 0 : '1.5mm',
      }}
    >
      {lc.show_expiration && (
        <div>
          <div style={{ fontSize: `${lc.font_size_label}px`, fontWeight: 'bold', textTransform: 'uppercase' }}>Validade</div>
          <div style={{ fontSize: `${lc.font_size_value}px`, fontWeight: 'bold' }}>
            {product.expiration_date
              ? new Date(product.expiration_date + 'T00:00:00').toLocaleDateString('pt-BR')
              : ''}
          </div>
        </div>
      )}
      {hasFillDate && (
        <div>
          <div style={{ fontSize: `${lc.font_size_label}px`, fontWeight: 'bold', textTransform: 'uppercase' }}>Envase</div>
          <div style={{ fontSize: `${lc.font_size_value}px` }}>
            {new Date(product.fill_date + 'T00:00:00').toLocaleDateString('pt-BR')}
          </div>
        </div>
      )}
      {lc.show_batch && (
        <div>
          <div style={{ fontSize: `${lc.font_size_label}px`, fontWeight: 'bold', textTransform: 'uppercase' }}>Lote</div>
          <div style={{ fontSize: `${lc.font_size_value}px` }}>{product.batch_number}</div>
        </div>
      )}
    </div>
  );

  return (
    <div
      id="printable-label"
      style={{
        width: `${lc.label_width}mm`,
        height: `${lc.label_height}mm`,
        padding: `${lc.padding}mm`,
        backgroundColor: 'white',
        color: 'black',
        fontFamily: "'Arial', 'Helvetica', sans-serif",
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #ccc',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {lc.show_logo && logoUrl && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5mm' }}>
          <img src={logoUrl} alt="Logo" style={{ maxHeight: '5mm', objectFit: 'contain' }} />
        </div>
      )}
      <div
        style={{
          fontSize: `${lc.font_size_name}px`,
          fontWeight: 'bold',
          textAlign: 'center',
          textTransform: 'uppercase',
          letterSpacing: '0.3px',
          lineHeight: '1.1',
          borderBottom: '0.5px solid black',
          paddingBottom: '1mm',
          marginBottom: '1mm',
        }}
      >
        {product.name}
      </div>
      <div style={{ display: 'flex', flexDirection: 'row', flex: 1 }}>
        {isQrLeft ? qrBlock : infoBlock}
        {isQrLeft ? infoBlock : qrBlock}
      </div>
      {lc.show_responsible && responsible && (
        <div
          style={{
            fontSize: `${lc.font_size_responsible}px`,
            fontWeight: 'bold',
            textAlign: 'center',
            textTransform: 'uppercase',
            borderTop: '0.5px solid black',
            paddingTop: '0.5mm',
            marginTop: '0.5mm',
            letterSpacing: '0.2px',
          }}
        >
          {responsible}
        </div>
      )}
    </div>
  );
};

const Products = () => {
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [labelProduct, setLabelProduct] = useState(null);
  const [showLabelDialog, setShowLabelDialog] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editData, setEditData] = useState({});
  const labelRef = useRef(null);
  const [formData, setFormData] = useState({
    name: '',
    category: 'injetável',
    quantity: 0,
    batch_number: '',
    expiration_date: '',
    supplier: '',
    fill_date: '',
    responsible: '',
    notes: '',
  });

  useEffect(() => {
    fetchProducts();
    fetchSettings();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data } = await axios.get(`${API}/products`, { withCredentials: true });
      setProducts(data);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('Erro ao carregar produtos');
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const { data } = await axios.get(`${API}/settings`, { withCredentials: true });
      setSettings(data);
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/products`, formData, { withCredentials: true });
      toast.success('Produto cadastrado com sucesso!');
      setIsCreateOpen(false);
      setFormData({
        name: '',
        category: 'injetável',
        quantity: 0,
        batch_number: '',
        expiration_date: '',
        supplier: '',
        fill_date: '',
        responsible: '',
        notes: '',
      });
      fetchProducts();
    } catch (error) {
      console.error('Error creating product:', error);
      toast.error('Erro ao cadastrar produto');
    }
  };

  const handleDelete = async (productId) => {
    if (!window.confirm('Tem certeza que deseja excluir este produto?')) return;
    try {
      await axios.delete(`${API}/products/${productId}`, { withCredentials: true });
      toast.success('Produto excluído com sucesso!');
      fetchProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
      toast.error('Erro ao excluir produto');
    }
  };

  const handlePrintLabel = (product) => {
    setLabelProduct(product);
    setShowLabelDialog(true);
  };

  const handleEdit = (product) => {
    setEditProduct(product);
    setEditData({
      name: product.name,
      category: product.category,
      quantity: product.quantity,
      batch_number: product.batch_number,
      expiration_date: product.expiration_date,
      supplier: product.supplier,
      fill_date: product.fill_date || '',
      responsible: product.responsible || '',
      notes: product.notes || '',
    });
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editProduct) return;
    try {
      await axios.put(`${API}/products/${editProduct.id}`, editData, { withCredentials: true });
      toast.success('Produto atualizado com sucesso!');
      setIsEditOpen(false);
      setEditProduct(null);
      fetchProducts();
    } catch (error) {
      console.error('Error updating product:', error);
      toast.error('Erro ao atualizar produto');
    }
  };

  const triggerPrint = () => {
    const printContent = document.getElementById('printable-label');
    if (!printContent) return;

    const lc = { ...DEFAULT_LABEL_CONFIG, ...(settings?.label_config || {}) };
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Etiqueta - ${labelProduct?.name}</title>
          <style>
            @page { size: ${lc.label_width}mm ${lc.label_height}mm; margin: 0; }
            body { margin: 0; padding: 0; }
          </style>
        </head>
        <body>${printContent.outerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 300);
  };

  const isExpiringSoon = (expirationDate) => {
    const exp = new Date(expirationDate);
    const today = new Date();
    const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
    return diffDays <= 30 && diffDays >= 0;
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-6 md:p-8 lg:p-12">
          <div className="animate-pulse">
            <div className="h-8 bg-muted rounded w-1/4 mb-6"></div>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-muted rounded-xl"></div>
              ))}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div data-testid="products-page" className="p-6 md:p-8 lg:p-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-foreground mb-2">
              Produtos
            </h1>
            <p className="text-base text-muted-foreground">
              Gerencie seu estoque de produtos
            </p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button
                data-testid="create-product-button"
                className="bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-6 rounded-lg font-medium gap-2"
              >
                <Plus className="w-5 h-5" />
                <span className="hidden sm:inline">Novo Produto</span>
                <span className="sm:hidden">Novo</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Cadastrar Novo Produto</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="col-span-1 sm:col-span-2">
                    <Label htmlFor="name">Nome do Produto</Label>
                    <Input
                      data-testid="product-name-input"
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="category">Categoria</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(value) => setFormData({ ...formData, category: value })}
                    >
                      <SelectTrigger data-testid="product-category-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="injetável">Injetável</SelectItem>
                        <SelectItem value="creme">Creme</SelectItem>
                        <SelectItem value="envase">Envase (Álcool, Sabão...)</SelectItem>
                        <SelectItem value="equipamento">Equipamento</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="quantity">Quantidade</Label>
                    <Input
                      data-testid="product-quantity-input"
                      id="quantity"
                      type="number"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="batch_number">Lote</Label>
                    <Input
                      data-testid="product-batch-input"
                      id="batch_number"
                      value={formData.batch_number}
                      onChange={(e) => setFormData({ ...formData, batch_number: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="expiration_date">Validade</Label>
                    <Input
                      data-testid="product-expiration-input"
                      id="expiration_date"
                      type="date"
                      value={formData.expiration_date}
                      onChange={(e) => setFormData({ ...formData, expiration_date: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="fill_date">Data de Envase</Label>
                    <Input
                      data-testid="product-fill-date-input"
                      id="fill_date"
                      type="date"
                      value={formData.fill_date}
                      onChange={(e) => setFormData({ ...formData, fill_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="responsible">Responsável</Label>
                    <Input
                      data-testid="product-responsible-input"
                      id="responsible"
                      value={formData.responsible}
                      onChange={(e) => setFormData({ ...formData, responsible: e.target.value })}
                      placeholder={settings?.responsible_name || 'Nome do responsável'}
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <Label htmlFor="supplier">Fornecedor</Label>
                    <Input
                      data-testid="product-supplier-input"
                      id="supplier"
                      value={formData.supplier}
                      onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                      required
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <Label htmlFor="notes">Observações</Label>
                    <Input
                      data-testid="product-notes-input"
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    />
                  </div>
                </div>
                <Button
                  data-testid="product-submit-button"
                  type="submit"
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Cadastrar Produto
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {products.length === 0 ? (
          <Card className="p-12 text-center">
            <Package className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">Nenhum produto cadastrado</p>
            <Button
              onClick={() => setIsCreateOpen(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Cadastrar Primeiro Produto
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {products.map((product) => (
              <Card
                key={product.id}
                data-testid={`product-item-${product.id}`}
                className="bg-card border border-border/60 shadow-[0_4px_24px_rgba(0,0,0,0.02)] rounded-xl overflow-hidden hover:shadow-md transition-all duration-200 p-4 sm:p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 sm:gap-3 mb-3 flex-wrap">
                      <h3 className="text-lg sm:text-xl font-medium text-foreground truncate">{product.name}</h3>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium border bg-secondary text-secondary-foreground whitespace-nowrap">
                        {product.category}
                      </span>
                      {isExpiringSoon(product.expiration_date) && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium border bg-warning/10 text-warning border-warning/20 flex items-center gap-1 whitespace-nowrap">
                          <AlertTriangle className="w-3 h-3" />
                          Vence em breve
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Quantidade</p>
                        <p className="font-medium text-foreground">{product.quantity}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Lote</p>
                        <p className="font-medium text-foreground">{product.batch_number}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Validade</p>
                        <p className="font-medium text-foreground">
                          {new Date(product.expiration_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Fornecedor</p>
                        <p className="font-medium text-foreground">{product.supplier}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-2 sm:ml-4 flex-shrink-0">
                    <Button
                      data-testid={`print-label-button-${product.id}`}
                      onClick={() => handlePrintLabel(product)}
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                    >
                      <Printer className="w-4 h-4" />
                    </Button>
                    <Button
                      data-testid={`edit-product-button-${product.id}`}
                      onClick={() => handleEdit(product)}
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      data-testid={`delete-product-button-${product.id}`}
                      onClick={() => handleDelete(product.id)}
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Label Preview Dialog */}
      {/* Label Preview Dialog */}
      <Dialog open={showLabelDialog} onOpenChange={setShowLabelDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pré-visualização da Etiqueta</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-6 py-4">
            <div className="border border-border rounded-lg p-4 bg-gray-50" ref={labelRef}>
              {labelProduct && <LabelPreview product={labelProduct} settings={settings} />}
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Personalizado via Configurações — Otimizado para impressora térmica
            </p>
            <Button
              data-testid="print-label-confirm-button"
              onClick={triggerPrint}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
            >
              <Printer className="w-4 h-4" />
              Imprimir Etiqueta
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Product Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Produto</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="col-span-1 sm:col-span-2">
                <Label>Nome do Produto</Label>
                <Input
                  data-testid="edit-product-name-input"
                  value={editData.name || ''}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Categoria</Label>
                <Select
                  value={editData.category || 'injetável'}
                  onValueChange={(value) => setEditData({ ...editData, category: value })}
                >
                  <SelectTrigger data-testid="edit-product-category-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="injetável">Injetável</SelectItem>
                    <SelectItem value="creme">Creme</SelectItem>
                    <SelectItem value="envase">Envase (Álcool, Sabão...)</SelectItem>
                    <SelectItem value="equipamento">Equipamento</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quantidade</Label>
                <Input
                  data-testid="edit-product-quantity-input"
                  type="number"
                  value={editData.quantity || 0}
                  onChange={(e) => setEditData({ ...editData, quantity: parseInt(e.target.value) || 0 })}
                  required
                />
              </div>
              <div>
                <Label>Lote</Label>
                <Input
                  data-testid="edit-product-batch-input"
                  value={editData.batch_number || ''}
                  onChange={(e) => setEditData({ ...editData, batch_number: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Validade</Label>
                <Input
                  data-testid="edit-product-expiration-input"
                  type="date"
                  value={editData.expiration_date || ''}
                  onChange={(e) => setEditData({ ...editData, expiration_date: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Data de Envase</Label>
                <Input
                  data-testid="edit-product-fill-date-input"
                  type="date"
                  value={editData.fill_date || ''}
                  onChange={(e) => setEditData({ ...editData, fill_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Responsável</Label>
                <Input
                  data-testid="edit-product-responsible-input"
                  value={editData.responsible || ''}
                  onChange={(e) => setEditData({ ...editData, responsible: e.target.value })}
                />
              </div>
              <div className="col-span-1 sm:col-span-2">
                <Label>Fornecedor</Label>
                <Input
                  data-testid="edit-product-supplier-input"
                  value={editData.supplier || ''}
                  onChange={(e) => setEditData({ ...editData, supplier: e.target.value })}
                  required
                />
              </div>
              <div className="col-span-1 sm:col-span-2">
                <Label>Observações</Label>
                <Input
                  data-testid="edit-product-notes-input"
                  value={editData.notes || ''}
                  onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                />
              </div>
            </div>
            <Button
              data-testid="edit-product-submit-button"
              type="submit"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Salvar Alterações
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default Products;
