import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Save, AlertTriangle, X, ChevronLeft, ChevronRight, Ban, Euro, Clock } from 'lucide-react';

const Settings = () => {
    const { 
        calendarSettings, 
        updateCalendarSetting, 
        updateBulkCalendarSettings, 
        updateHouseSettings, 
        deleteBulkCalendarSettings, 
        deleteCalendarSetting, 
        houses 
    } = useApp();
    const [selectedHouse, setSelectedHouse] = useState('gredos');
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(null);
    const [price, setPrice] = useState('');
    const [minStay, setMinStay] = useState('2');
    const [isBlocked, setIsBlocked] = useState(false);
    const [saving, setSaving] = useState(false);
    
    // Master Rates States
    const currentHouse = houses.find(h => h.id === selectedHouse);
    const [masterNight, setMasterNight] = useState('');
    const [masterWeekly, setMasterWeekly] = useState('');
    const [masterMonthly, setMasterMonthly] = useState('');

    useEffect(() => {
        if (currentHouse) {
            setMasterNight(currentHouse.price_night || 185);
            setMasterWeekly(currentHouse.price_weekly || 960);
            setMasterMonthly(currentHouse.price_monthly || 2200);
        }
    }, [selectedHouse, houses]);

    // Bulk Mode States
    const [isBulkMode, setIsBulkMode] = useState(false);
    const [bulkStart, setBulkStart] = useState('');
    const [bulkEnd, setBulkEnd] = useState('');
    const [selectedWeekdays, setSelectedWeekdays] = useState([false, false, false, false, false, true, true]); // Por defecto Viernes y Sabado
    const [bulkPrice, setBulkPrice] = useState('');
    const [bulkMinStay, setBulkMinStay] = useState('2');
    const [bulkIsBlocked, setBulkIsBlocked] = useState(false);

    // Helpers
    const formatLocalDate = (date) => {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const renderCalendar = () => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        // Adjust for Monday start (0=Mon, 6=Sun)
        let startOffset = firstDay === 0 ? 6 : firstDay - 1;

        const days = [];
        // Empty cells
        for (let i = 0; i < startOffset; i++) days.push(<div key={`empty-${i}`} className="cal-day empty"></div>);
        
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const setting = calendarSettings.find(s => s.date === dateStr && s.house_id === selectedHouse);
            
            const isSelected = selectedDate === dateStr;
            const hasOverride = setting && (
                setting.price_override !== null || 
                setting.min_stay > 2 || 
                setting.is_blocked === true
            );

            // Cálculo de límite de 2 años
            const today = new Date();
            today.setHours(0,0,0,0);
            const limitDate = new Date(today);
            limitDate.setDate(limitDate.getDate() + 730);
            const isTooFar = new Date(dateStr) > limitDate;

            const basePrice = currentHouse?.price_night || 185;

            days.push(
                <div 
                    key={d} 
                    onClick={() => handleDateClick(dateStr, setting)}
                    className={`cal-day ${isSelected ? 'selected' : ''} ${hasOverride ? 'override' : ''} ${setting?.is_blocked || isTooFar ? 'blocked' : ''}`}
                    style={{
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '70px',
                        border: '1px solid var(--color-border-light)',
                        cursor: 'pointer',
                        borderRadius: '8px',
                        transition: 'all 0.2s',
                        backgroundColor: isSelected ? 'var(--color-primary-light)' : (isTooFar ? '#f9fafb' : 'transparent'),
                        borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border-light)',
                        opacity: isTooFar ? 0.6 : 1
                    }}
                >
                    <span style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '2px' }}>{d}</span>
                    <span style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: hasOverride && setting.price_override ? 800 : 500,
                        color: hasOverride && setting.price_override ? 'var(--color-primary)' : 'var(--color-text-muted)',
                        opacity: hasOverride && setting.price_override ? 1 : 0.6
                    }}>
                        {isTooFar ? '---' : (setting?.price_override || basePrice)}€
                    </span>
                    {(setting?.is_blocked || isTooFar) && (
                        <div style={{ position: 'absolute', top: '5px', right: '5px', color: '#ef4444' }}>
                            <Ban size={12} />
                            {isTooFar && <span style={{ fontSize: '10px', marginLeft: '2px' }}>Auto</span>}
                        </div>
                    )}
                    {setting?.min_stay > 2 && !isTooFar && (
                        <div style={{ position: 'absolute', bottom: '5px', right: '5px', fontSize: '0.6rem', color: '#6366f1' }}>{setting.min_stay}n</div>
                    )}
                </div>
            );
        }
        return days;
    };

    const handleDateClick = (dateStr, setting) => {
        setSelectedDate(dateStr);
        setPrice(setting?.price_override || '');
        setMinStay(setting?.min_stay || '2');
        setIsBlocked(setting?.is_blocked || false);
    };

    const handleSave = async () => {
        if (!selectedDate) return;
        setSaving(true);
        const data = {
            house_id: selectedHouse,
            date: selectedDate,
            price_override: price ? parseFloat(price) : null,
            min_stay: parseInt(minStay),
            is_blocked: isBlocked
        };
        await updateCalendarSetting(data);
        setSaving(false);
    };

    const handleDelete = async () => {
        if (!selectedDate) return;
        setSaving(true);
        await deleteCalendarSetting(selectedHouse, selectedDate);
        setPrice('');
        setMinStay('2');
        setIsBlocked(false);
        setSaving(false);
    };

    const handleBulkApply = async () => {
        if (!bulkStart || !bulkEnd) {
            alert('Por favor selecciona el rango de fechas.');
            return;
        }

        const start = new Date(bulkStart);
        const end = new Date(bulkEnd);
        
        if (end < start) {
            alert('La fecha de fin no puede ser anterior a la de inicio.');
            return;
        }

        const settingsToUpdate = [];
        let tempDate = new Date(start);

        while (tempDate <= end) {
            const dayOfWeek = tempDate.getDay(); // 0: Sun, 1: Mon, ..., 6: Sat
            // Adjust dayOfWeek to L=0, M=1... D=6 for our array selectedWeekdays
            const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

            if (selectedWeekdays[adjustedDay]) {
                settingsToUpdate.push({
                    house_id: selectedHouse,
                    date: formatLocalDate(tempDate),
                    price_override: bulkPrice ? parseFloat(bulkPrice) : null,
                    min_stay: parseInt(bulkMinStay),
                    is_blocked: bulkIsBlocked
                });
            }
            tempDate.setDate(tempDate.getDate() + 1);
        }

        if (settingsToUpdate.length === 0) {
            alert('No hay días que coincidan con la selección dentro de ese rango.');
            return;
        }

        if (window.confirm(`Vas a actualizar ${settingsToUpdate.length} días. ¿Estás seguro?`)) {
            setSaving(true);
            await updateBulkCalendarSettings(settingsToUpdate);
            setSaving(false);
            alert('¡Actualización masiva completada!');
        }
    };

    const handleBulkDelete = async () => {
        if (!bulkStart || !bulkEnd) {
            alert('Por favor selecciona el rango de fechas.');
            return;
        }
        
        if (window.confirm(`¿Estás seguro de que quieres BORRAR todos los ajustes para los días seleccionados en este rango? Volverán a los valores estándar.`)) {
            setSaving(true);
            await deleteBulkCalendarSettings(selectedHouse, bulkStart, bulkEnd, selectedWeekdays);
            setSaving(false);
            alert('Ajustes borrados correctamente.');
        }
    };

    const handlePrevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
    const handleNextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));

    const handleSaveMasterRates = async () => {
        if (!masterNight || !masterWeekly || !masterMonthly) {
            alert('Por favor, rellena todos los campos de tarifas maestras.');
            return;
        }

        try {
            setSaving(true);
            await updateHouseSettings(selectedHouse, {
                price_night: parseInt(masterNight) || 185,
                price_weekly: parseInt(masterWeekly) || 960,
                price_monthly: parseInt(masterMonthly) || 2200
            });
            alert('Tarifas maestras actualizadas correctamente.');
        } catch (error) {
            console.error('Error al guardar tarifas:', error);
            alert('Error técnico: ' + (error.message || 'Error desconocido') + '. Por favor, dímelo para que lo arregle.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ padding: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--color-primary)', marginBottom: '0.25rem' }}>Ajustes de Calendario</h1>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Configura precios especiales, mínimos de estancia y bloqueos manuales.</p>
                </div>
                
                <div style={{ display: 'flex', gap: '0.5rem', backgroundColor: 'var(--color-surface)', padding: '4px', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
                    {houses.map(h => (
                        <button
                            key={h.id}
                            onClick={() => { setSelectedHouse(h.id); setSelectedDate(null); }}
                            style={{
                                padding: '8px 20px',
                                borderRadius: '10px',
                                border: 'none',
                                fontWeight: 700,
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                backgroundColor: selectedHouse === h.id ? 'var(--color-primary)' : 'transparent',
                                color: selectedHouse === h.id ? 'white' : 'var(--color-text-muted)',
                                transition: 'all 0.2s'
                            }}
                        >
                            {h.name}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '2rem' }} className="settings-grid">
                {/* CALENDAR COLUMN */}
                <div className="glass-card" style={{ padding: '1.5rem', borderRadius: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, textTransform: 'capitalize' }}>
                            {new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(currentMonth)}
                        </h2>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={handlePrevMonth} style={btnNavStyle}><ChevronLeft size={20} /></button>
                            <button onClick={handleNextMonth} style={btnNavStyle}><ChevronRight size={20} /></button>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
                        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                            <div key={d} style={{ textAlign: 'center', fontWeight: 800, fontSize: '0.8rem', color: 'var(--color-text-muted)', paddingBottom: '10px' }}>
                                {d}
                            </div>
                        ))}
                        {renderCalendar()}
                    </div>
                </div>

                {/* EDITOR COLUMN */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="glass-card" style={{ padding: '1.5rem', borderRadius: '20px', border: '2px solid var(--color-primary-light)' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            Configurar Tarifas
                        </h3>
                        
                        <div style={{ display: 'flex', gap: '8px', backgroundColor: 'var(--color-surface)', padding: '6px', borderRadius: '14px', marginBottom: '1.5rem', border: '1px solid var(--color-border)' }}>
                            <button 
                                onClick={() => setIsBulkMode(false)}
                                style={{
                                    flex: 1, padding: '10px', borderRadius: '10px', border: 'none', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer',
                                    backgroundColor: !isBulkMode ? 'var(--color-primary)' : 'transparent',
                                    color: !isBulkMode ? 'white' : 'var(--color-text-muted)',
                                    boxShadow: !isBulkMode ? '0 4px 12px rgba(30, 58, 138, 0.2)' : 'none',
                                    transition: 'all 0.3s'
                                }}
                            >Individual</button>
                            <button 
                                onClick={() => setIsBulkMode(true)}
                                style={{
                                    flex: 1, padding: '10px', borderRadius: '10px', border: 'none', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer',
                                    backgroundColor: isBulkMode ? 'var(--color-primary)' : 'transparent',
                                    color: isBulkMode ? 'white' : 'var(--color-text-muted)',
                                    boxShadow: isBulkMode ? '0 4px 12px rgba(30, 58, 138, 0.2)' : 'none',
                                    transition: 'all 0.3s'
                                }}
                            >Masiva (Lotes)</button>
                        </div>

                        {!isBulkMode ? (
                            selectedDate ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    <h4 style={{ fontSize: '0.8rem', color: 'var(--color-primary)', fontWeight: 800, textTransform: 'uppercase' }}>Día: {selectedDate}</h4>
                                    <div>
                                        <label style={labelStyle}><Euro size={14} /> Precio Noche Special (€)</label>
                                        <input 
                                            type="number" 
                                            value={price} 
                                            onChange={e => setPrice(e.target.value)}
                                            placeholder="Ej: 220"
                                            style={inputStyle}
                                        />
                                        <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>Dejar vacío para usar precio estándar.</p>
                                    </div>

                                    <div>
                                        <label style={labelStyle}><Clock size={14} /> Mínimo de noches</label>
                                        <select value={minStay} onChange={e => setMinStay(e.target.value)} style={inputStyle}>
                                            <option value="1">1 noche</option>
                                            <option value="2">2 noches (Estándar)</option>
                                            <option value="3">3 noches (Puente corto)</option>
                                            <option value="4">4 noches (Semana Santa/Navidad)</option>
                                            <option value="5">5 noches</option>
                                        </select>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '12px', backgroundColor: 'rgba(239, 68, 68, 0.05)', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.1)' }}>
                                        <input 
                                            type="checkbox" 
                                            id="blocked" 
                                            checked={isBlocked} 
                                            onChange={e => setIsBlocked(e.target.checked)}
                                            style={{ width: '20px', height: '20px', accentColor: '#ef4444', cursor: 'pointer' }}
                                        />
                                        <label htmlFor="blocked" style={{ fontWeight: 700, color: '#ef4444', cursor: 'pointer', fontSize: '0.9rem' }}>Cerrar calendario este día</label>
                                    </div>

                                    <button 
                                        onClick={handleSave} 
                                        disabled={saving}
                                        style={{
                                            marginTop: '1rem',
                                            padding: '1rem',
                                            backgroundColor: 'var(--color-primary)',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: 'var(--radius-md)',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.5rem',
                                            opacity: saving ? 0.7 : 1
                                        }}
                                    >
                                        <Save size={20} />
                                        {saving ? 'Guardando...' : 'Aplicar Cambios'}
                                    </button>

                                    <button 
                                        onClick={handleDelete} 
                                        disabled={saving}
                                        style={{
                                            padding: '0.75rem',
                                            backgroundColor: 'transparent',
                                            color: '#ef4444',
                                            border: '1px solid rgba(239, 68, 68, 0.2)',
                                            borderRadius: 'var(--radius-md)',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.5rem',
                                            fontSize: '0.85rem',
                                            transition: 'all 0.2s',
                                            opacity: saving ? 0.5 : 1
                                        }}
                                        onMouseOver={e => e.target.style.backgroundColor = 'rgba(239, 68, 68, 0.05)'}
                                        onMouseOut={e => e.target.style.backgroundColor = 'transparent'}
                                    >
                                        <Ban size={16} />
                                        Limpiar ajustes de este día
                                    </button>
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--color-text-muted)' }}>
                                    <AlertTriangle size={48} style={{ opacity: 0.1, marginBottom: '1rem' }} />
                                    <p>Toca cualquier día para cambiar su precio o bloquearlo.</p>
                                </div>
                            )
                        ) : (
                            /* BULK EDITOR FORM */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                <div>
                                    <label style={labelStyle}>Rango de fecha</label>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <input type="date" value={bulkStart} onChange={e => setBulkStart(e.target.value)} style={{ ...inputStyle, padding: '0.5rem' }} />
                                        <span style={{ color: 'var(--color-text-muted)' }}>-</span>
                                        <input type="date" value={bulkEnd} onChange={e => setBulkEnd(e.target.value)} style={{ ...inputStyle, padding: '0.5rem' }} />
                                    </div>
                                </div>

                                <div>
                                    <label style={labelStyle}>Días de la semana</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((day, idx) => (
                                            <button
                                                key={day}
                                                onClick={() => {
                                                    const newDays = [...selectedWeekdays];
                                                    newDays[idx] = !newDays[idx];
                                                    setSelectedWeekdays(newDays);
                                                }}
                                                style={{
                                                    width: '32px', height: '32px', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer',
                                                    backgroundColor: selectedWeekdays[idx] ? 'var(--color-primary)' : 'white',
                                                    color: selectedWeekdays[idx] ? 'white' : 'var(--color-text-muted)'
                                                }}
                                            >{day}</button>
                                        ))}
                                    </div>
                                </div>

                                <hr style={{ border: 'none', borderTop: '1px solid var(--color-border-light)', margin: '0.5rem 0' }} />

                                <div>
                                    <label style={labelStyle}><Euro size={14} /> Nuevo Precio (€)</label>
                                    <input type="number" value={bulkPrice} onChange={e => setBulkPrice(e.target.value)} placeholder="Ej: 210" style={inputStyle} />
                                </div>

                                <div>
                                    <label style={labelStyle}><Clock size={14} /> Mínimo de noches</label>
                                    <select value={bulkMinStay} onChange={e => setBulkMinStay(e.target.value)} style={inputStyle}>
                                        <option value="1">1 noche</option>
                                        <option value="2">2 (Estándar)</option>
                                        <option value="3">3 (Puente)</option>
                                        <option value="4">4 (Largo)</option>
                                        <option value="5">5 noches</option>
                                    </select>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '10px', backgroundColor: 'rgba(239, 68, 68, 0.05)', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.1)' }}>
                                    <input type="checkbox" id="bulkBlocked" checked={bulkIsBlocked} onChange={e => setBulkIsBlocked(e.target.checked)} style={{ width: '18px', height: '18px' }} />
                                    <label htmlFor="bulkBlocked" style={{ fontWeight: 700, color: '#ef4444', fontSize: '0.8rem' }}>Cerrar calendario</label>
                                </div>

                                <button 
                                    onClick={handleBulkApply} 
                                    disabled={saving}
                                    style={{
                                        marginTop: '0.5rem',
                                        padding: '1rem',
                                        backgroundColor: 'var(--color-primary)',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: 'var(--radius-md)',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                        opacity: saving ? 0.7 : 1
                                    }}
                                >
                                    <Save size={20} />
                                    {saving ? 'Procesando...' : 'Aplicar masivamente'}
                                </button>

                                <button 
                                    onClick={handleBulkDelete} 
                                    disabled={saving}
                                    style={{
                                        padding: '0.75rem',
                                        backgroundColor: 'transparent',
                                        color: '#ef4444',
                                        border: '1px solid rgba(239, 68, 68, 0.2)',
                                        borderRadius: 'var(--radius-md)',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                        fontSize: '0.85rem',
                                        transition: 'all 0.2s',
                                        opacity: saving ? 0.5 : 1
                                    }}
                                    onMouseOver={e => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.05)'}
                                    onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    <Ban size={16} />
                                    Borrar ajustes en este rango
                                </button>

                                <p style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                                    ⚠️ Esta acción sobrescribirá todos los ajustes existentes para los días seleccionados en ese rango.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* MASTER RATES CARD */}
                    <div className="glass-card" style={{ padding: '1.5rem', borderRadius: '20px', border: '1px solid var(--color-border)' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1.25rem', color: 'var(--color-text)' }}>Tarifas Maestras ({currentHouse?.name})</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ ...labelStyle, fontSize: '0.7rem' }}>Precio Base Noche (€)</label>
                                <input type="number" value={masterNight} onChange={e => setMasterNight(e.target.value)} style={{ ...inputStyle, padding: '0.5rem 0.75rem' }} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div>
                                    <label style={{ ...labelStyle, fontSize: '0.7rem' }}>Oferta Semana (€)</label>
                                    <input type="number" value={masterWeekly} onChange={e => setMasterWeekly(e.target.value)} style={{ ...inputStyle, padding: '0.5rem 0.75rem' }} />
                                </div>
                                <div>
                                    <label style={{ ...labelStyle, fontSize: '0.7rem' }}>Oferta Mes (€)</label>
                                    <input type="number" value={masterMonthly} onChange={e => setMasterMonthly(e.target.value)} style={{ ...inputStyle, padding: '0.5rem 0.75rem' }} />
                                </div>
                            </div>
                            <button 
                                onClick={handleSaveMasterRates}
                                disabled={saving}
                                style={{
                                    marginTop: '0.5rem',
                                    padding: '0.75rem',
                                    backgroundColor: 'white',
                                    color: 'var(--color-primary)',
                                    border: '2px solid var(--color-primary)',
                                    borderRadius: '12px',
                                    fontWeight: 800,
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    opacity: saving ? 0.7 : 1
                                }}
                                onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-primary)'; e.currentTarget.style.color = 'white'; }}
                                onMouseOut={e => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.color = 'var(--color-primary)'; }}
                            >Actualizar Tarifas Maestras</button>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                @media (max-width: 1024px) {
                    .settings-grid { grid-template-columns: 1fr !important; }
                }
                .cal-day:hover {
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                    transform: translateY(-2px);
                    z-index: 5;
                }
                .cal-day.override {
                    border-left: 4px solid var(--color-primary) !important;
                }
                .cal-day.blocked {
                    background-color: rgba(239, 68, 68, 0.05) !important;
                    border-color: rgba(239, 68, 68, 0.2) !important;
                    color: #ef4444;
                }
            `}</style>
        </div>
    );
};

const btnNavStyle = {
    background: 'white',
    border: '1px solid var(--color-border)',
    color: 'var(--color-primary)',
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s'
};

const labelStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '0.8rem',
    fontWeight: 700,
    color: 'var(--color-text-muted)',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
};

const inputStyle = {
    width: '100%',
    padding: '0.75rem 1rem',
    borderRadius: '12px',
    border: '1px solid var(--color-border)',
    fontSize: '1rem',
    color: 'var(--color-text)',
    outline: 'none',
    backgroundColor: 'white'
};

export default Settings;
