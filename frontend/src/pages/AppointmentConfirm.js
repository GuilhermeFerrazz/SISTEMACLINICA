import React, { useState, useEffect } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AppointmentConfirm = () => {
  const token = window.location.pathname.split('/confirmar/')[1];
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [status, setStatus]   = useState(null); // 'confirmed' | 'cancelled' | null
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/confirmacao/${token}`);
        setData(res.data);
        if (res.data.status !== 'pending') setStatus(res.data.status);
      } catch (e) {
        const detail = e?.response?.data?.detail || '';
        if (detail === 'Este link expirou' || e?.response?.status === 410)
          setError('expirado');
        else
          setError('invalido');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const respond = async (action) => {
    setSubmitting(true);
    try {
      await axios.post(`${API}/confirmacao/${token}/respond`, { action });
      setStatus(action === 'confirm' ? 'confirmed' : 'cancelled');
    } catch (e) {
      const detail = e?.response?.data?.detail || '';
      if (detail === 'already_responded') {
        setError('ja_respondido');
      } else {
        setError('erro_resposta');
      }
    } finally {
      setSubmitting(false);
    }
  };

  /* ─── helpers de UI ─── */
  const weekday = (dateStr) => {
    const days = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
    const [d, m, y] = dateStr.split('/').map(Number);
    return days[new Date(y, m - 1, d).getDay()];
  };

  /* ─── Loading ─── */
  if (loading) return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.spinner} />
        <p style={{ color: '#94a3b8', marginTop: 20, fontSize: 14 }}>Carregando...</p>
      </div>
    </div>
  );

  /* ─── Erros ─── */
  if (error) {
    const msgs = {
      expirado:      { icon: '⏰', title: 'Link Expirado',          sub: 'Este link de confirmação já não é mais válido.\nEntre em contato com a clínica.' },
      invalido:      { icon: '🔗', title: 'Link Inválido',           sub: 'Não foi possível encontrar este agendamento.\nVerifique se o link está correto.' },
      ja_respondido: { icon: '✅', title: 'Já Respondido',           sub: 'Você já confirmou ou cancelou este agendamento anteriormente.' },
      erro_resposta: { icon: '⚠️', title: 'Erro ao Processar',       sub: 'Ocorreu um problema. Tente novamente ou entre em contato com a clínica.' },
    };
    const m = msgs[error] || msgs.invalido;
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <span style={{ fontSize: 52 }}>{m.icon}</span>
          <h2 style={{ ...styles.heading, marginTop: 16 }}>{m.title}</h2>
          <p style={styles.sub}>{m.sub}</p>
          {data?.clinic_phone && (
            <a href={`tel:${data.clinic_phone}`} style={styles.btnSecondary}>
              📞 Ligar para a clínica
            </a>
          )}
        </div>
      </div>
    );
  }

  /* ─── Já respondido (vem do banco) ─── */
  if (status === 'confirmed') return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ ...styles.badge, background: '#dcfce7', color: '#16a34a' }}>✓ Confirmado</div>
        <span style={{ fontSize: 64, marginTop: 16 }}>🎉</span>
        <h2 style={{ ...styles.heading, marginTop: 12 }}>Consulta Confirmada!</h2>
        <p style={styles.sub}>
          Sua presença foi confirmada. Te esperamos!
        </p>
        <AppointmentCard data={data} weekday={weekday} />
        {data?.clinic_phone && (
          <a href={`https://wa.me/${data.clinic_phone.replace(/\D/g,'')}`}
             target="_blank" rel="noreferrer" style={styles.btnWhatsApp}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style={{marginRight:8}}>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
            </svg>
            Falar com a clínica
          </a>
        )}
      </div>
    </div>
  );

  if (status === 'cancelled') return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ ...styles.badge, background: '#fee2e2', color: '#dc2626' }}>✕ Cancelado</div>
        <span style={{ fontSize: 64, marginTop: 16 }}>😔</span>
        <h2 style={{ ...styles.heading, marginTop: 12 }}>Consulta Cancelada</h2>
        <p style={styles.sub}>
          Sua consulta foi cancelada. Ficamos à disposição quando quiser remarcar!
        </p>
        <AppointmentCard data={data} weekday={weekday} />
        {data?.clinic_phone && (
          <a href={`https://wa.me/${data.clinic_phone.replace(/\D/g,'')}`}
             target="_blank" rel="noreferrer" style={styles.btnWhatsApp}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style={{marginRight:8}}>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
            </svg>
            Remarcar pelo WhatsApp
          </a>
        )}
      </div>
    </div>
  );

  /* ─── Tela principal de confirmação ─── */
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {data?.clinic_logo && (
          <img src={data.clinic_logo} alt="Logo" style={styles.logo} />
        )}
        <h1 style={styles.clinicName}>{data?.clinic_name}</h1>
        <p style={styles.greeting}>Olá, <strong>{data?.patient_name?.split(' ')[0]}</strong>! 👋</p>
        <p style={{ ...styles.sub, marginBottom: 0 }}>
          Você tem um agendamento marcado. Confirme ou cancele sua presença.
        </p>

        <div style={styles.appointmentBox}>
          <div style={styles.apptRow}>
            <span style={styles.apptIcon}>📅</span>
            <div>
              <div style={styles.apptLabel}>Data</div>
              <div style={styles.apptValue}>{weekday(data?.date)}, {data?.date}</div>
            </div>
          </div>
          <div style={styles.divider} />
          <div style={styles.apptRow}>
            <span style={styles.apptIcon}>🕐</span>
            <div>
              <div style={styles.apptLabel}>Horário</div>
              <div style={styles.apptValue}>{data?.time}</div>
            </div>
          </div>
          <div style={styles.divider} />
          <div style={styles.apptRow}>
            <span style={styles.apptIcon}>💉</span>
            <div>
              <div style={styles.apptLabel}>Procedimento</div>
              <div style={styles.apptValue}>{data?.procedure_name}</div>
            </div>
          </div>
        </div>

        <button
          style={{ ...styles.btnConfirm, opacity: submitting ? 0.7 : 1 }}
          onClick={() => respond('confirm')}
          disabled={submitting}
        >
          {submitting ? '...' : '✅  Confirmar minha presença'}
        </button>

        <button
          style={{ ...styles.btnCancel, opacity: submitting ? 0.7 : 1 }}
          onClick={() => respond('cancel')}
          disabled={submitting}
        >
          {submitting ? '...' : '❌  Cancelar consulta'}
        </button>

        <p style={styles.footer}>
          Dúvidas? Entre em contato com a clínica.
          {data?.clinic_phone && (
            <> <a href={`tel:${data.clinic_phone}`} style={styles.link}>{data.clinic_phone}</a></>
          )}
        </p>
      </div>
    </div>
  );
};

const AppointmentCard = ({ data, weekday }) => (
  <div style={{ ...styles.appointmentBox, marginTop: 20, width: '100%' }}>
    <div style={styles.apptRow}>
      <span style={styles.apptIcon}>📅</span>
      <div>
        <div style={styles.apptLabel}>Data</div>
        <div style={styles.apptValue}>{weekday(data?.date)}, {data?.date}</div>
      </div>
    </div>
    <div style={styles.divider} />
    <div style={styles.apptRow}>
      <span style={styles.apptIcon}>🕐</span>
      <div>
        <div style={styles.apptLabel}>Horário</div>
        <div style={styles.apptValue}>{data?.time}</div>
      </div>
    </div>
    <div style={styles.divider} />
    <div style={styles.apptRow}>
      <span style={styles.apptIcon}>💉</span>
      <div>
        <div style={styles.apptLabel}>Procedimento</div>
        <div style={styles.apptValue}>{data?.procedure_name}</div>
      </div>
    </div>
  </div>
);

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #f0fdf4 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
  },
  card: {
    background: '#ffffff',
    borderRadius: 24,
    padding: '36px 28px',
    maxWidth: 420,
    width: '100%',
    boxShadow: '0 4px 40px rgba(0,0,0,0.10)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  logo: {
    height: 56,
    objectFit: 'contain',
    marginBottom: 8,
  },
  clinicName: {
    fontSize: 18,
    fontWeight: 700,
    color: '#0f172a',
    margin: '0 0 20px',
    letterSpacing: '-0.3px',
  },
  greeting: {
    fontSize: 20,
    color: '#0f172a',
    margin: '0 0 8px',
  },
  heading: {
    fontSize: 22,
    fontWeight: 700,
    color: '#0f172a',
    margin: '0 0 8px',
  },
  sub: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 1.6,
    margin: '0 0 24px',
    whiteSpace: 'pre-line',
  },
  badge: {
    display: 'inline-block',
    padding: '6px 16px',
    borderRadius: 99,
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 4,
  },
  appointmentBox: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 16,
    padding: '20px',
    width: '100%',
    marginTop: 20,
    marginBottom: 24,
  },
  apptRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '4px 0',
    textAlign: 'left',
  },
  apptIcon: {
    fontSize: 22,
    flexShrink: 0,
  },
  apptLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  apptValue: {
    fontSize: 15,
    fontWeight: 600,
    color: '#1e293b',
    marginTop: 2,
  },
  divider: {
    height: 1,
    background: '#e2e8f0',
    margin: '12px 0',
  },
  btnConfirm: {
    width: '100%',
    padding: '16px',
    borderRadius: 14,
    border: 'none',
    background: 'linear-gradient(135deg, #16a34a, #22c55e)',
    color: '#fff',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    marginBottom: 12,
    boxShadow: '0 4px 16px rgba(22,163,74,0.30)',
    transition: 'transform 0.1s, opacity 0.2s',
  },
  btnCancel: {
    width: '100%',
    padding: '16px',
    borderRadius: 14,
    border: '2px solid #fecaca',
    background: '#fff5f5',
    color: '#dc2626',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    marginBottom: 20,
    transition: 'transform 0.1s, opacity 0.2s',
  },
  btnWhatsApp: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    padding: '14px 28px',
    borderRadius: 14,
    background: '#25d366',
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    textDecoration: 'none',
    boxShadow: '0 4px 14px rgba(37,211,102,0.35)',
  },
  btnSecondary: {
    display: 'inline-block',
    marginTop: 16,
    padding: '12px 24px',
    borderRadius: 12,
    border: '2px solid #e2e8f0',
    color: '#475569',
    fontSize: 14,
    fontWeight: 600,
    textDecoration: 'none',
  },
  footer: {
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 1.5,
  },
  link: {
    color: '#0ea5e9',
    textDecoration: 'none',
  },
  spinner: {
    width: 40,
    height: 40,
    border: '3px solid #e2e8f0',
    borderTop: '3px solid #0ea5e9',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};

// Inject spinner keyframes
const styleTag = document.createElement('style');
styleTag.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(styleTag);

export default AppointmentConfirm;
