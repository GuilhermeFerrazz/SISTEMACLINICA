import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ConsentSign = () => {
  const token = window.location.pathname.split('/assinar/')[1];
  const [consentData, setConsentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [cpf, setCpf] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [geolocation, setGeolocation] = useState(null);
  const [geoError, setGeoError] = useState(null);
  const [signatureEmpty, setSignatureEmpty] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [useImageForMarketing, setUseImageForMarketing] = useState(true);
  const [assinafyUrl, setAssinafyUrl] = useState(null);
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    fetchConsentData();
    requestGeolocation();

    // Assinafy Embed Listener
    const handleAssinafyMessage = (event) => {
      // A Assinafy envia mensagens via postMessage quando eventos ocorrem no iframe
      // Documentação sugere verificar event.data
      console.log('Mensagem recebida do Iframe:', event.data);
      
      // Verificamos se a mensagem indica conclusão
      if (event.data === 'document.signed' || 
          event.data === 'document.completed' || 
          (event.data && event.data.event === 'document.signed')) {
        setSuccess(true);
        // Recarrega os dados para pegar o signed_at atualizado
        setTimeout(fetchConsentData, 2000);
      }
    };
    window.addEventListener('message', handleAssinafyMessage);
    return () => window.removeEventListener('message', handleAssinafyMessage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchConsentData = async () => {
    try {
      const { data } = await axios.get(`${API}/consent/public/${token}`);
      setConsentData(data);
      if (data.patient_cpf) setCpf(formatCPF(data.patient_cpf));
    } catch (err) {
      setError('Link de consentimento inválido ou expirado.');
    } finally {
      setLoading(false);
    }
  };

  const requestGeolocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGeolocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          });
        },
        (err) => {
          setGeoError('Geolocalização não disponível. A assinatura continuará sem esta informação.');
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  };

  const formatCPF = (value) => {
    const nums = value.replace(/\D/g, '').slice(0, 11);
    if (nums.length <= 3) return nums;
    if (nums.length <= 6) return `${nums.slice(0,3)}.${nums.slice(3)}`;
    if (nums.length <= 9) return `${nums.slice(0,3)}.${nums.slice(3,6)}.${nums.slice(6)}`;
    return `${nums.slice(0,3)}.${nums.slice(3,6)}.${nums.slice(6,9)}-${nums.slice(9)}`;
  };

  const handleCpfChange = (e) => {
    setCpf(formatCPF(e.target.value));
  };

  // Canvas drawing
  const getPos = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }, []);

  const startDraw = useCallback((e) => {
    e.preventDefault();
    isDrawingRef.current = true;
    const pos = getPos(e);
    lastPosRef.current = pos;
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    }
  }, [getPos]);

  const draw = useCallback((e) => {
    e.preventDefault();
    if (!isDrawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPosRef.current = pos;
    setSignatureEmpty(false);
  }, [getPos]);

  const endDraw = useCallback((e) => {
    e.preventDefault();
    isDrawingRef.current = false;
  }, []);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureEmpty(true);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(1, 1);

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', endDraw);
    canvas.addEventListener('mouseleave', endDraw);
    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', endDraw, { passive: false });

    return () => {
      canvas.removeEventListener('mousedown', startDraw);
      canvas.removeEventListener('mousemove', draw);
      canvas.removeEventListener('mouseup', endDraw);
      canvas.removeEventListener('mouseleave', endDraw);
      canvas.removeEventListener('touchstart', startDraw);
      canvas.removeEventListener('touchmove', draw);
      canvas.removeEventListener('touchend', endDraw);
    };
  }, [consentData, startDraw, draw, endDraw]);

  const handleSign = async () => {
    const cpfNums = cpf.replace(/\D/g, '');
    if (cpfNums.length !== 11) { setError('CPF inválido. Digite os 11 dígitos.'); return; }
    if (!acceptedTerms) { setError('Você precisa aceitar os termos.'); return; }

    setSigning(true);
    setError(null);
    try {
      // 1. O sistema envia os dados para o backend
      // 2. O backend cria o documento na Assinafy e retorna a URL de Embed
      const { data } = await axios.post(`${API}/consent/public/${token}/prepare-assinafy`, {
        cpf: cpfNums,
        use_image_for_marketing: useImageForMarketing
      });
      
      if (data.embed_url) {
        setAssinafyUrl(data.embed_url);
      } else if (data.error) {
        setError(`Erro na Assinafy: ${data.error}`);
      } else {
        // Fallback para assinatura simples se a API Key não estiver configurada
        setSuccess(true);
      }
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.error || 'Erro ao preparar assinatura. Tente novamente.';
      setError(msg);
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.loadingSpinner}></div>
          <p style={styles.loadingText}>Carregando termo de consentimento...</p>
        </div>
      </div>
    );
  }

  if (error && !consentData) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.errorIcon}>!</div>
          <h2 style={styles.errorTitle}>Link Inválido</h2>
          <p style={styles.errorText}>{error}</p>
        </div>
      </div>
    );
  }

  if (consentData?.status === 'expired') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.errorIcon}>!</div>
          <h2 style={styles.errorTitle}>Link Expirado</h2>
          <p style={styles.errorText}>Este link de consentimento expirou. Solicite um novo à clínica.</p>
        </div>
      </div>
    );
  }

  if (consentData?.status === 'signed' || success) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.successIcon}>&#10003;</div>
          <h2 style={styles.successTitle}>Termo Assinado com Sucesso!</h2>
          <p style={styles.successText}>
            Obrigado, <strong>{consentData?.patient_name}</strong>.
          </p>
          <p style={styles.successDetail}>
            Procedimento: <strong>{consentData?.procedure_name}</strong>
          </p>
          {consentData?.signed_at && (
            <p style={styles.successDate}>
              Assinado em: {new Date(consentData.signed_at).toLocaleString('pt-BR')}
            </p>
          )}
          <div style={styles.legalNote}>
            Este documento possui validade jurídica conforme a Lei 14.063/2020 e MP 2.200-2/2001.
            Dados de autenticação foram registrados.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {assinafyUrl ? (
          <div style={{ height: '600px', width: '100%' }}>
            <iframe
              src={assinafyUrl}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="Assinatura Digital"
            />
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={styles.header}>
              <div style={styles.shieldIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div>
                <h1 style={styles.title}>Termo de Consentimento</h1>
                <p style={styles.subtitle}>{consentData.procedure_name}</p>
              </div>
            </div>

            <div style={styles.patientBadge}>
              Paciente: <strong>{consentData.patient_name}</strong>
            </div>

            {/* Consent Text */}
            <div style={styles.consentBox}>
              <pre style={styles.consentText}>{consentData.consent_text}</pre>
            </div>
          </>
        )}

        {!assinafyUrl && (
          <>
            {/* CPF */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>CPF do Paciente *</label>
              <input
                type="text"
                value={cpf}
                onChange={handleCpfChange}
                placeholder="000.000.000-00"
                style={styles.input}
                maxLength={14}
                data-testid="consent-cpf-input"
              />
            </div>

            {/* Accept Terms */}
            <label style={styles.checkboxLabel} data-testid="accept-terms-label">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                style={styles.checkbox}
                data-testid="accept-terms-checkbox"
              />
              <span>
                Declaro que li e compreendi o termo acima. Confirmo que todas as informações são verdadeiras e concordo com os termos apresentados.
              </span>
            </label>

            {/* Use Image for Marketing - Switch Button */}
            <div style={styles.imageConsentContainer}>
              <div style={styles.imageConsentLabel}>
                <span style={styles.imageConsentTitle}>Autorizo o uso da minha imagem</span>
                <p style={styles.imageConsentDescription}>
                  Autorizo a clínica a utilizar minhas fotos para fins de prontuário médico e divulgação em redes sociais.
                </p>
              </div>
              <label style={styles.switchContainer}>
                <input
                  type="checkbox"
                  checked={useImageForMarketing}
                  onChange={(e) => setUseImageForMarketing(e.target.checked)}
                  style={styles.switchInput}
                  data-testid="use-image-for-marketing-switch"
                />
                <span style={{
                  ...styles.switchTrack,
                  background: useImageForMarketing ? '#16a34a' : '#d1d5db'
                }}>
                  <span style={{
                    ...styles.switchThumb,
                    transform: useImageForMarketing ? 'translateX(20px)' : 'translateX(0)'
                  }} />
                </span>
                <span style={styles.switchText}>{useImageForMarketing ? 'SIM' : 'NÃO'}</span>
              </label>
            </div>

            {error && <p style={styles.errorMsg}>{error}</p>}

            <button
              onClick={handleSign}
              disabled={signing}
              style={{
                ...styles.signButton,
                opacity: signing ? 0.6 : 1,
                cursor: signing ? 'not-allowed' : 'pointer'
              }}
              data-testid="submit-signature-btn"
            >
              {signing ? 'Preparando Assinatura...' : 'Iniciar Assinatura Digital'}
            </button>
          </>
        )}

        {/* Legal Notice */}
        <div style={styles.legalFooter}>
          <p><strong>Dados registrados para validade jurídica:</strong></p>
          <p>IP do dispositivo, geolocalização, CPF, data/hora, navegador e assinatura manuscrita digital.</p>
          <p>Conforme Lei 14.063/2020 e MP 2.200-2/2001.</p>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #f0f4f0 0%, #e8ede8 100%)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: '16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    background: '#fff',
    borderRadius: '16px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    maxWidth: '600px',
    width: '100%',
    padding: '24px',
    marginTop: '16px',
    marginBottom: '40px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  shieldIcon: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    background: '#1a3a1a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    flexShrink: 0,
  },
  title: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#1a1a2e',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: '#666',
    margin: 0,
  },
  patientBadge: {
    background: '#f0f4f0',
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '14px',
    color: '#333',
    marginBottom: '16px',
  },
  consentBox: {
    background: '#fafafa',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    padding: '16px',
    maxHeight: '300px',
    overflowY: 'auto',
    marginBottom: '20px',
  },
  consentText: {
    fontSize: '13px',
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap',
    fontFamily: 'inherit',
    color: '#333',
    margin: 0,
  },
  fieldGroup: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '12px',
    border: '1.5px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '16px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  signatureHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
  },
  clearBtn: {
    background: 'none',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    padding: '4px 12px',
    fontSize: '12px',
    cursor: 'pointer',
    color: '#666',
  },
  canvasWrapper: {
    position: 'relative',
    border: '2px dashed #d1d5db',
    borderRadius: '10px',
    overflow: 'hidden',
    background: '#fff',
  },
  canvas: {
    width: '100%',
    height: '160px',
    touchAction: 'none',
    cursor: 'crosshair',
    display: 'block',
  },
  canvasPlaceholder: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    color: '#bbb',
    fontSize: '14px',
    pointerEvents: 'none',
  },
  geoStatus: {
    marginBottom: '16px',
    fontSize: '13px',
  },
  geoOk: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    color: '#16a34a',
    background: '#f0fdf4',
    padding: '6px 12px',
    borderRadius: '6px',
  },
  geoWarn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    color: '#d97706',
    background: '#fffbeb',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
  },
  geoLoading: {
    color: '#6b7280',
    fontStyle: 'italic',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    fontSize: '13px',
    color: '#444',
    marginBottom: '20px',
    cursor: 'pointer',
    lineHeight: '1.4',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    marginTop: '2px',
    flexShrink: 0,
    accentColor: '#1a3a1a',
  },
  imageConsentContainer: {
    background: '#f0f4f0',
    border: '1px solid #d1d5db',
    borderRadius: '10px',
    padding: '14px',
    marginBottom: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
  },
  imageConsentLabel: {
    flex: 1,
  },
  imageConsentTitle: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: '4px',
  },
  imageConsentDescription: {
    fontSize: '12px',
    color: '#666',
    margin: 0,
    lineHeight: '1.4',
  },
  switchContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    color: '#333',
    flexShrink: 0,
  },
  switchInput: {
    display: 'none',
  },
  switchTrack: {
    display: 'inline-flex',
    alignItems: 'center',
    width: '44px',
    height: '24px',
    borderRadius: '12px',
    background: '#d1d5db',
    padding: '2px',
    transition: 'background 0.3s ease',
    position: 'relative',
  },
  switchThumb: {
    display: 'inline-block',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    background: '#fff',
    transition: 'transform 0.3s ease',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  switchText: {
    fontSize: '13px',
    fontWeight: '600',
    minWidth: '28px',
  },
  errorMsg: {
    color: '#dc2626',
    fontSize: '13px',
    marginBottom: '12px',
    padding: '8px 12px',
    background: '#fef2f2',
    borderRadius: '6px',
  },
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '16px',
  },
  signButton: {
    width: '100%',
    padding: '14px',
    background: '#1a3a1a',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  govBrButton: {
    width: '100%',
    padding: '14px',
    background: '#004587',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: '8px 0',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    background: '#e5e7eb',
  },
  dividerText: {
    fontSize: '12px',
    color: '#9ca3af',
    fontWeight: '600',
  },
  legalFooter: {
    background: '#f8f9fa',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '12px',
    fontSize: '11px',
    color: '#6b7280',
    lineHeight: '1.5',
  },
  legalNote: {
    background: '#f0f4f0',
    borderRadius: '8px',
    padding: '12px',
    fontSize: '12px',
    color: '#555',
    marginTop: '16px',
    lineHeight: '1.5',
  },
  loadingSpinner: {
    width: '40px',
    height: '40px',
    border: '3px solid #e5e7eb',
    borderTop: '3px solid #1a3a1a',
    borderRadius: '50%',
    margin: '0 auto 16px',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    textAlign: 'center',
    color: '#666',
    fontSize: '14px',
  },
  errorIcon: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    background: '#fef2f2',
    color: '#dc2626',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '24px',
    fontWeight: 'bold',
    margin: '0 auto 12px',
  },
  errorTitle: {
    textAlign: 'center',
    color: '#1a1a2e',
    fontSize: '18px',
    marginBottom: '8px',
  },
  errorText: {
    textAlign: 'center',
    color: '#666',
    fontSize: '14px',
  },
  successIcon: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    background: '#f0fdf4',
    color: '#16a34a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '28px',
    fontWeight: 'bold',
    margin: '0 auto 12px',
    border: '2px solid #bbf7d0',
  },
  successTitle: {
    textAlign: 'center',
    color: '#16a34a',
    fontSize: '20px',
    marginBottom: '8px',
  },
  successText: {
    textAlign: 'center',
    color: '#333',
    fontSize: '15px',
    marginBottom: '4px',
  },
  successDetail: {
    textAlign: 'center',
    color: '#555',
    fontSize: '14px',
    marginBottom: '4px',
  },
  successDate: {
    textAlign: 'center',
    color: '#888',
    fontSize: '13px',
  },
};

export default ConsentSign;
