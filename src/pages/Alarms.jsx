import React, { useState, useEffect } from 'react';
import { Bell, Activity, Clock, CheckCircle2, XCircle, AlertCircle, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const ALARM_TYPES = {
  heating: 'Calefacción',
  fridge: 'Frigorífico',
  hot_water: 'Agua caliente',
  outdoor_light: 'Luz exterior'
};

const HOUSES = {
  gredos: 'La Libélula de Gredos',
  valles: 'La Libélula de Valles'
};

const STATUS_LABELS = {
  pending: 'Pendiente',
  sent: 'Enviado',
  failed: 'Fallido',
  obsolete: 'Obsoleto'
};

const Alarms = () => {
  const [settings, setSettings] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorSettings, setErrorSettings] = useState(null);
  const [errorLogs, setErrorLogs] = useState(null);

  const { session, signOut, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [adminStatus, setAdminStatus] = useState('checking'); // 'checking', 'unauthorized', 'forbidden', 'authorized'

  useEffect(() => {
    if (authLoading) return;

    if (!session) {
      setAdminStatus('unauthorized');
      return;
    }

    const checkAuth = async () => {
      try {
        const res = await fetch('/api/alarms/auth-check', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });
        if (res.status === 200) {
          setAdminStatus('authorized');
        } else if (res.status === 403) {
          setAdminStatus('forbidden');
        } else {
          setAdminStatus('unauthorized');
        }
      } catch {
        setAdminStatus('unauthorized');
      }
    };
    
    checkAuth();
  }, [session, authLoading]);

  const handleLogout = async () => {
    await signOut();
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [settingsRes, logsRes] = await Promise.all([
          fetch('/api/alarms/settings').catch(() => null),
          fetch('/api/alarms/log').catch(() => null)
        ]);

        if (settingsRes && settingsRes.ok) {
          const sData = await settingsRes.json();
          if (sData.ok) setSettings(sData.settings);
          else setErrorSettings('No se pudo cargar la configuración de alarmas.');
        } else {
          setErrorSettings('No se pudo cargar la configuración de alarmas.');
        }

        if (logsRes && logsRes.ok) {
          const lData = await logsRes.json();
          if (lData.ok) setLogs(lData.logs);
          else setErrorLogs('No se pudo cargar el histórico de avisos.');
        } else {
          setErrorLogs('No se pudo cargar el histórico de avisos.');
        }
      } catch (err) {
        setErrorSettings('No se pudo cargar la configuración de alarmas.');
        setErrorLogs('No se pudo cargar el histórico de avisos.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const formatDays = (days) => {
    if (days === 0) return 'Mismo día';
    if (days === 1) return '1 día antes';
    return `${days} días antes`;
  };

  const formatDateTime = (isoString) => {
    if (!isoString) return '-';
    try {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } catch {
      return isoString;
    }
  };

  const renderStatusIcon = (status) => {
    switch(status) {
      case 'pending': return <Clock size={16} color="var(--color-primary)" />;
      case 'sent': return <CheckCircle2 size={16} color="green" />;
      case 'failed': return <XCircle size={16} color="red" />;
      case 'obsolete': return <AlertCircle size={16} color="gray" />;
      default: return null;
    }
  };

  const getHouseSettings = (houseId) => settings.filter(s => s.house_id === houseId);

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '2rem' }}>
            <style>{`@media (max-width: 768px) {
          .alarms-desktop-only { display: none !important; }
          .alarms-mobile-only { display: inline-flex !important; justify-content: center; width: 100%; }
          .alarms-config-padding { padding: 1rem 0.5rem !important; }
          .alarms-config-grid { 
            grid-template-columns: 1.8fr 50px 2.2fr 1fr !important; 
            gap: 0.5rem !important; 
            font-size: 0.85rem !important; 
          }
          .alarms-status-cell { justify-content: center !important; }
          .alarms-status-header { text-align: center !important; }
          .alarms-status-badge { padding: 4px 0 !important; width: 28px !important; text-align: center; }
        }
        @media (min-width: 769px) {
          .alarms-mobile-only { display: none !important; }
          .alarms-config-grid { grid-template-columns: 1fr 1fr 1fr 1fr !important; }
        }`}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ backgroundColor: 'var(--color-primary)', padding: '0.75rem', borderRadius: '12px', display: 'flex', color: 'white' }}>
            <Bell size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--color-text)', margin: 0 }}>Alarmas</h1>
            <p className="alarms-desktop-only" style={{ color: 'var(--color-text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.95rem' }}>Configuración y estado de los avisos (Modo Lectura)</p>
          </div>
        </div>

        {/* Admin State Zone */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {authLoading || adminStatus === 'checking' ? (
            <div className="alarms-desktop-only" style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Verificando sesión...</div>
          ) : adminStatus === 'unauthorized' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div className="alarms-desktop-only" style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Para administrar las alarmas, inicia sesión.</div>
              <button 
                onClick={() => navigate('/login')}
                style={{ padding: '0.5rem 1rem', borderRadius: '8px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}
              >
                Iniciar sesión
              </button>
            </div>
          ) : adminStatus === 'forbidden' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div className="alarms-desktop-only" style={{ fontSize: '0.9rem', color: '#991b1b', backgroundColor: '#fee2e2', padding: '0.4rem 0.8rem', borderRadius: '8px' }}>Usuario sin permisos para administrar alarmas.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div className="alarms-desktop-only" style={{ fontSize: '0.9rem', color: '#166534', backgroundColor: '#dcfce7', padding: '0.4rem 0.8rem', borderRadius: '8px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 size={16} /> Administrador autenticado
              </div>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <Activity className="animate-spin" style={{ margin: '0 auto 1rem', display: 'block' }} />
          Cargando alarmas...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {errorSettings && (
            <div style={{ padding: '1rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '8px' }}>
              {errorSettings}
            </div>
          )}

          {!errorSettings && ['gredos', 'valles'].map(houseId => (
            <div key={houseId} style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
              <div style={{ backgroundColor: '#f8fafc', padding: '1rem 1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-text)' }}>{HOUSES[houseId]}</h2>
              </div>
              <div className="alarms-config-padding" style={{ padding: '1.5rem' }}>
                <div className="alarms-config-grid" style={{ display: 'grid', gap: '1rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>
                  <div>Tarea</div>
                  <div className="alarms-status-header">Estado</div>
                  <div>Antelación</div>
                  <div>Hora</div>
                </div>
                {getHouseSettings(houseId).map(setting => (
                  <div key={setting.id} className="alarms-config-grid" style={{ display: 'grid', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
                    <div style={{ fontWeight: 500 }}>{ALARM_TYPES[setting.alarm_type] || setting.alarm_type}</div>
                    <div className="alarms-status-cell" style={{ display: 'flex' }}>
                      <span className="alarms-status-badge" style={{ 
                        display: 'inline-block', 
                        padding: '4px 12px', 
                        borderRadius: '20px', 
                        fontSize: '0.8rem', 
                        fontWeight: 600,
                        backgroundColor: setting.is_enabled ? '#dcfce7' : '#f1f5f9',
                        color: setting.is_enabled ? '#166534' : '#64748b'
                      }}>
                        <span className="alarms-desktop-only">{setting.is_enabled ? 'Activada' : 'Desactivada'}</span>
                        <span className="alarms-mobile-only">{setting.is_enabled ? 'A' : 'D'}</span>
                      </span>
                    </div>
                    <div>{formatDays(setting.days_before)}</div>
                    <div>{setting.alarm_time.slice(0, 5)}</div>
                  </div>
                ))}
                {getHouseSettings(houseId).length === 0 && (
                  <div style={{ color: 'var(--color-text-muted)' }}>No hay configuración disponible.</div>
                )}
              </div>
            </div>
          ))}

          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--color-text)', marginBottom: '1rem', marginTop: '1rem' }}>Últimos avisos</h2>
            
            {errorLogs ? (
              <div style={{ padding: '1rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '8px' }}>
                {errorLogs}
              </div>
            ) : logs.length === 0 ? (
              <div style={{ padding: '2rem', backgroundColor: 'white', borderRadius: '12px', border: '1px solid var(--color-border)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                Todavía no hay avisos registrados.
              </div>
            ) : (
              <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid var(--color-border)', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
                  <thead style={{ backgroundColor: '#f8fafc', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                    <tr>
                      <th style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)' }}>Creado</th>
                      <th style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)' }}>Casa</th>
                      <th style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)' }}>Tarea</th>
                      <th style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)' }}>Programado para</th>
                      <th style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)' }}>Estado</th>
                      <th style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)' }}>Intento / Enviado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => (
                      <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '1rem', fontSize: '0.9rem' }}>{formatDateTime(log.created_at)}</td>
                        <td style={{ padding: '1rem', fontSize: '0.9rem', fontWeight: 500 }}>{HOUSES[log.house_id] || log.house_id}</td>
                        <td style={{ padding: '1rem', fontSize: '0.9rem' }}>{ALARM_TYPES[log.alarm_type] || log.alarm_type}</td>
                        <td style={{ padding: '1rem', fontSize: '0.9rem' }}>{formatDateTime(log.scheduled_for)}</td>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
                            {renderStatusIcon(log.status)}
                            {STATUS_LABELS[log.status] || log.status}
                          </div>
                        </td>
                        <td style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                          {log.sent_at ? formatDateTime(log.sent_at) : (log.last_attempt_at ? `Intento: ${formatDateTime(log.last_attempt_at)}` : '-')}
                          {log.error_message && <div style={{ color: '#991b1b', marginTop: '4px', fontSize: '0.8rem' }}>Error: {log.error_message}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Alarms;













