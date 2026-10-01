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
  const [drafts, setDrafts] = useState({});
  const [isSaving, setIsSaving] = useState({});
  const [saveError, setSaveError] = useState({});
  const [saveSuccess, setSaveSuccess] = useState({});

  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorSettings, setErrorSettings] = useState(null);
  const [errorLogs, setErrorLogs] = useState(null);

  const { session, signOut, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
  };

  useEffect(() => {
    if (authLoading) return;
    if (!session) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const fetchOptions = {
          headers: {
            'Authorization': 'Bearer ' + session.access_token
          }
        };
        const [settingsRes, logsRes] = await Promise.all([
          fetch('/api/alarms/settings', fetchOptions).catch(() => null),
          fetch('/api/alarms/log', fetchOptions).catch(() => null)
        ]);

        if (settingsRes && settingsRes.ok) {
          const sData = await settingsRes.json();
          if (sData.ok) {
            setSettings(sData.settings);
            const initialDrafts = {};
            sData.settings.forEach(st => {
              initialDrafts[st.id] = {
                is_enabled: st.is_enabled,
                days_before: st.days_before,
                alarm_time: st.alarm_time ? st.alarm_time.slice(0, 5) : ''
              };
            });
            setDrafts(initialDrafts);
          }
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
  }, [session, authLoading]);

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

  const handleDraftChange = (id, field, value) => {
    setDrafts(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
    setSaveError(prev => ({ ...prev, [id]: null }));
    setSaveSuccess(prev => ({ ...prev, [id]: false }));
  };


  const DIAGNOSTIC_REASONS = {
    invalid_check_in: 'Fecha de entrada no válida',
    invalid_alarm_time: 'Hora no válida',
    invalid_days_before: 'Antelación no válida',
    unsupported_house: 'Casa no reconocida',
    ambiguous_local_time: 'Hora local ambigua por cambio horario',
    nonexistent_local_time: 'Hora local inexistente por cambio horario'
  };

  const handleFetchPreview = async () => {
    if (!session?.access_token) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const response = await fetch('/api/alarms/preview', {
        headers: { 'Authorization': 'Bearer ' + session.access_token }
      });
      const data = await response.json();
      if (!response.ok || data.ok !== true) {
        throw new Error(data.error || 'No se pudo cargar la previsualización');
      }
      setPreviewData(data);
    } catch (err) {
      setPreviewError(err.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSave = async (id) => {
    const draft = drafts[id];
    if (!draft) return;
    
    setIsSaving(prev => ({ ...prev, [id]: true }));
    setSaveError(prev => ({ ...prev, [id]: null }));
    setSaveSuccess(prev => ({ ...prev, [id]: false }));

    try {
      const response = await fetch('/api/alarms/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({
          id: id,
          is_enabled: draft.is_enabled,
          days_before: parseInt(draft.days_before, 10),
          alarm_time: draft.alarm_time
        })
      });

      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'No se pudo guardar la configuración');
      }

      setSettings(prev => prev.map(st => st.id === id ? result.setting : st));
      
      setDrafts(prev => ({
        ...prev,
        [id]: {
          is_enabled: result.setting.is_enabled,
          days_before: result.setting.days_before,
          alarm_time: result.setting.alarm_time.slice(0, 5)
        }
      }));
      setSaveSuccess(prev => ({ ...prev, [id]: true }));
      setTimeout(() => setSaveSuccess(prev => ({ ...prev, [id]: false })), 3000);
      
    } catch (err) {
      console.error(err);
      setSaveError(prev => ({ ...prev, [id]: err.message }));
    } finally {
      setIsSaving(prev => ({ ...prev, [id]: false }));
    }
  };

  const hasDraftChanged = (id) => {
    const originalSetting = settings.find(st => st.id === id);
    const draft = drafts[id];
    if (!originalSetting || !draft) return false;
    return originalSetting.is_enabled !== draft.is_enabled ||
           originalSetting.days_before !== parseInt(draft.days_before, 10) ||
           originalSetting.alarm_time.slice(0, 5) !== draft.alarm_time;
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
            <p className="alarms-desktop-only" style={{ color: 'var(--color-text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.95rem' }}>Configuración y estado de los avisos</p>
          </div>
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
                  <div className="alarms-status-header">Activa</div>
                  <div>Antelación</div>
                  <div>Hora</div>
                  <div className="alarms-desktop-only" style={{ textAlign: 'right' }}>Acción</div>
                </div>
                {getHouseSettings(houseId).map(setting => {
                  const draft = drafts[setting.id];
                  if (!draft) return null;
                  const changed = hasDraftChanged(setting.id);
                  const saving = isSaving[setting.id];
                  const sError = saveError[setting.id];
                  const sSuccess = saveSuccess[setting.id];

                  return (
                  <div key={setting.id} style={{ marginBottom: '1.5rem' }}>
                    <div className="alarms-config-grid" style={{ display: 'grid', gap: '1rem' }}>
                      <div style={{ fontWeight: 500 }}>{ALARM_TYPES[setting.alarm_type] || setting.alarm_type}</div>
                      
                      <div className="alarms-status-cell" style={{ display: 'flex', alignItems: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={draft.is_enabled} 
                          onChange={(e) => handleDraftChange(setting.id, 'is_enabled', e.target.checked)}
                          disabled={saving}
                          style={{ width: '1.2rem', height: '1.2rem', cursor: 'pointer' }}
                        />
                      </div>
                      
                      <div>
                        <select 
                          value={draft.days_before} 
                          onChange={(e) => handleDraftChange(setting.id, 'days_before', e.target.value)}
                          disabled={saving}
                          style={{ padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--color-border)', width: '100%', maxWidth: '120px' }}
                        >
                          {[0, 1, 2, 3, 4, 5, 6, 7].map(d => (
                            <option key={d} value={d}>{d === 0 ? 'Mismo día' : d + (d > 1 ? ' días antes' : ' día antes')}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <input 
                          type="time" 
                          value={draft.alarm_time}
                          onChange={(e) => handleDraftChange(setting.id, 'alarm_time', e.target.value)}
                          disabled={saving}
                          style={{ padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--color-border)', width: '100%', maxWidth: '120px' }}
                        />
                      </div>
                      
                      <div className="alarms-action-col">
                        <button
                          onClick={() => handleSave(setting.id)}
                          disabled={saving || !changed}
                          style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: changed ? 'var(--color-primary)' : '#e2e8f0',
                            color: changed ? (saving ? '#1e293b' : 'white') : '#94a3b8',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: '600',
                            cursor: changed && !saving ? 'pointer' : 'not-allowed',
                            transition: 'all 0.2s',
                            width: 'fit-content'
                          }}
                        >
                          {saving ? 'Guardando...' : sSuccess ? 'Guardado' : 'Guardar'}
                        </button>
                      </div>
                    </div>
                    {sError && (
                      <div style={{ color: '#991b1b', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                        Error: {sError}
                      </div>
                    )}
                  </div>
                )})}
                {getHouseSettings(houseId).length === 0 && (
                  <div style={{ color: 'var(--color-text-muted)' }}>No hay configuración disponible.</div>
                )}
              </div>
            </div>
          ))}

          
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', marginTop: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--color-text)' }}>Próximos avisos</h2>
              <button 
                onClick={handleFetchPreview}
                disabled={previewLoading}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: 'var(--color-primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: previewLoading ? 'not-allowed' : 'pointer',
                  opacity: previewLoading ? 0.7 : 1
                }}
              >
                {previewLoading ? 'Calculando...' : (previewData ? 'Actualizar previsualización' : 'Previsualizar próximos avisos')}
              </button>
            </div>
            
            {previewError && (
              <div style={{ padding: '1rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '8px', marginBottom: '1rem' }}>
                Error: {previewError}
              </div>
            )}
            
            {previewData && (
              <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid var(--color-border)', padding: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem', color: 'var(--color-text-muted)' }}>
                  <div>Reservas analizadas: <strong style={{ color: 'var(--color-text)' }}>{previewData.booking_count}</strong></div>
                  <div>Avisos calculados: <strong style={{ color: 'var(--color-text)' }}>{previewData.alarm_count}</strong></div>
                </div>

                {previewData.diagnostics && previewData.diagnostics.length > 0 && (
                  <div style={{ marginBottom: '1.5rem', border: '1px solid #fecaca', borderRadius: '8px', overflow: 'hidden' }}>
                    <div style={{ backgroundColor: '#fee2e2', padding: '0.75rem 1rem', color: '#991b1b', fontWeight: '600' }}>Diagnósticos</div>
                    <div style={{ backgroundColor: 'white', padding: '1rem' }}>
                      {previewData.diagnostics.map((diag, idx) => (
                        <div key={idx} style={{ marginBottom: '0.5rem', color: '#7f1d1d', fontSize: '0.9rem' }}>
                          <span style={{ fontWeight: '600' }}>{HOUSES[diag.house_id] || diag.house_id}</span> - {ALARM_TYPES[diag.alarm_type] || diag.alarm_type}: {DIAGNOSTIC_REASONS[diag.reason] || diag.reason}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {previewData.alarms && previewData.alarms.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
                      <thead style={{ backgroundColor: '#f8fafc', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                        <tr>
                          <th style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)' }}>Casa</th>
                          <th style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)' }}>Tarea</th>
                          <th style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)' }}>Entrada</th>
                          <th style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)' }}>Antelación</th>
                          <th style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)' }}>Hora</th>
                          <th style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)' }}>Fecha/hora prevista local</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.alarms.map((alarm, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '1rem', fontSize: '0.9rem', fontWeight: 500 }}>{HOUSES[alarm.house_id] || alarm.house_id}</td>
                            <td style={{ padding: '1rem', fontSize: '0.9rem' }}>{ALARM_TYPES[alarm.alarm_type] || alarm.alarm_type}</td>
                            <td style={{ padding: '1rem', fontSize: '0.9rem' }}>{alarm.check_in}</td>
                            <td style={{ padding: '1rem', fontSize: '0.9rem' }}>{alarm.days_before === 0 ? 'Mismo día' : alarm.days_before + (alarm.days_before > 1 ? ' días antes' : ' día antes')}</td>
                            <td style={{ padding: '1rem', fontSize: '0.9rem' }}>{alarm.alarm_time}</td>
                            <td style={{ padding: '1rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-primary)' }}>{alarm.scheduled_local.replace('T', ' ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '1rem' }}>No hay avisos próximos calculados.</div>
                )}
              </div>
            )}
          </div>

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

















