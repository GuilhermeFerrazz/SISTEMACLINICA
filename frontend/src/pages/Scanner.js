import React, { useState, useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import axios from 'axios';
import Layout from '../components/Layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QrCode, Package, Minus } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Scanner = () => {
  const [scanner, setScanner] = useState(null);
  const [scannedProduct, setScannedProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const html5QrcodeScanner = new Html5QrcodeScanner(
      'qr-reader',
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    );

    html5QrcodeScanner.render(onScanSuccess, onScanFailure);
    setScanner(html5QrcodeScanner);

    return () => {
      html5QrcodeScanner.clear().catch((error) => {
        console.error('Failed to clear scanner:', error);
      });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScanSuccess = async (decodedText) => {
    try {
      const { data } = await axios.get(`${API}/qr/scan/${decodedText}`);
      setScannedProduct(data);
      try { if (scanner) scanner.pause(); } catch (e) { /* already paused */ }
      toast.success('Produto encontrado!');
    } catch (error) {
      console.error('Error scanning QR code:', error);
      toast.error('Produto não encontrado');
    }
  };

  const onScanFailure = (error) => {
    // Silent fail - scanner will keep trying
  };

  const handleGiveOut = async () => {
    if (!scannedProduct) return;

    setLoading(true);
    try {
      await axios.post(
        `${API}/movements`,
        {
          product_id: scannedProduct.id,
          type: 'saida',
          quantity: quantity,
          notes: notes,
        },
        { withCredentials: true }
      );
      toast.success('Saída registrada com sucesso!');
      setScannedProduct(null);
      setQuantity(1);
      setNotes('');
      try { if (scanner) scanner.resume(); } catch (e) { /* scanner not paused */ }
    } catch (error) {
      console.error('Error registering movement:', error);
      toast.error(error.response?.data?.detail || 'Erro ao registrar saída');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setScannedProduct(null);
    setQuantity(1);
    setNotes('');
    try { if (scanner) scanner.resume(); } catch (e) { /* scanner not paused */ }
  };

  return (
    <Layout>
      <div data-testid="scanner-page" className="p-6 md:p-8 lg:p-12">
        <div className="mb-8">
          <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-foreground mb-2">
            Scanner QR
          </h1>
          <p className="text-base text-muted-foreground">
            Escaneie o código QR do produto
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Scanner */}
          <Card className="bg-card border border-border/60 shadow-[0_4px_24px_rgba(0,0,0,0.02)] rounded-xl overflow-hidden p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-primary/10 p-2 rounded-lg">
                <QrCode className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-2xl font-medium tracking-tight text-foreground">
                Câmera
              </h2>
            </div>
            <div id="qr-reader" data-testid="qr-reader" className="w-full"></div>
          </Card>

          {/* Product Info */}
          <Card className="bg-card border border-border/60 shadow-[0_4px_24px_rgba(0,0,0,0.02)] rounded-xl overflow-hidden p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Package className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-2xl font-medium tracking-tight text-foreground">
                Informações do Produto
              </h2>
            </div>

            {scannedProduct ? (
              <div data-testid="scanned-product-info" className="space-y-6">
                <div className="space-y-4 p-4 rounded-lg bg-secondary/30">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground">
                      Nome
                    </p>
                    <p className="text-lg font-medium text-foreground">{scannedProduct.name}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground">
                        Categoria
                      </p>
                      <p className="text-sm font-medium text-foreground">{scannedProduct.category}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground">
                        Quantidade
                      </p>
                      <p className="text-sm font-medium text-foreground">{scannedProduct.quantity}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground">
                        Lote
                      </p>
                      <p className="text-sm font-medium text-foreground">{scannedProduct.batch_number}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground">
                        Validade
                      </p>
                      <p className="text-sm font-medium text-foreground">
                        {new Date(scannedProduct.expiration_date).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground">
                      Fornecedor
                    </p>
                    <p className="text-sm font-medium text-foreground">{scannedProduct.supplier}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="quantity">Quantidade a Retirar</Label>
                    <Input
                      data-testid="quantity-input"
                      id="quantity"
                      type="number"
                      min="1"
                      max={scannedProduct.quantity}
                      value={quantity}
                      onChange={(e) => setQuantity(parseInt(e.target.value))}
                      className="h-11"
                    />
                  </div>
                  <div>
                    <Label htmlFor="notes">Observações (opcional)</Label>
                    <Input
                      data-testid="notes-input"
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Adicione uma nota..."
                      className="h-11"
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    data-testid="give-out-button"
                    onClick={handleGiveOut}
                    disabled={loading}
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 h-11 rounded-lg font-medium gap-2"
                  >
                    <Minus className="w-4 h-4" />
                    {loading ? 'Processando...' : 'Dar Baixa'}
                  </Button>
                  <Button
                    data-testid="cancel-button"
                    onClick={handleCancel}
                    variant="outline"
                    className="h-11 px-6 rounded-lg font-medium"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <QrCode className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-muted-foreground">Escaneie um código QR para ver as informações do produto</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default Scanner;
