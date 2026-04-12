import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { HOUSES, CHANNELS } from '../../utils/constants';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import DateRangePicker from '../ui/DateRangePicker';
import { differenceInDays, parseISO } from 'date-fns';
import { Save, X, Trash2, Send } from 'lucide-react';

const BookingForm = ({ onClose, initialData = null }) => {
    const { addBooking, updateBooking, deleteBooking, sendToViajeros, bookings } = useApp();
    const [isSending, setIsSending] = useState(false);
    const [sentStatus, setSentStatus] = useState(null); // 'success' | 'error' | null

    const [formData, setFormData] = useState({
        houseId: HOUSES[0].id,
        guestName: '',
        checkIn: '',
        checkOut: '',
        channelId: CHANNELS[0].id,
        totalAmount: '',
        netIncome: 0,
        deposit: 0,
        status: 'confirmed'
    });

    useEffect(() => {
        if (initialData) {
            setFormData(initialData);
        }
    }, [initialData]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const checkOverlap = (start, end, houseId, excludeId = null) => {
        const startDate = new Date(start);
        const endDate = new Date(end);

        return bookings.some(b => {
            if (b.id === excludeId) return false;
            if (b.houseId !== houseId) return false;
            const bStart = new Date(b.checkIn);
            const bEnd = new Date(b.checkOut);
            return startDate < bEnd && endDate > bStart;
        });
    };

    const handleDelete = () => {
        if (window.confirm('¿Realmente quieres anular esta reserva?')) {
            deleteBooking(initialData.id);
            onClose();
        }
    };

    const handleSendToViajeros = async () => {
        if (!initialData) return;
        
        setIsSending(true);
        setSentStatus(null);
        
        const result = await sendToViajeros(initialData);
        
        setIsSending(false);
        if (result.success) {
            setSentStatus('success');
            setTimeout(() => setSentStatus(null), 3000);
            alert('¡Reserva enviada con éxito al sistema de Viajeros!');
        } else {
            setSentStatus('error');
            alert('Error al enviar: ' + result.error);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        if (!formData.guestName || !formData.checkIn || !formData.checkOut || !formData.totalAmount) {
            alert('Por favor completa todos los campos obligatorios');
            return;
        }

        if (new Date(formData.checkIn) >= new Date(formData.checkOut)) {
            alert('La fecha de salida debe ser posterior a la de entrada');
            return;
        }

        if (checkOverlap(formData.checkIn, formData.checkOut, formData.houseId, initialData?.id)) {
            alert('¡Conflicto de fechas! Esta casa ya está reservada en esos días.');
            return;
        }

        const dataToSave = {
            ...formData,
            totalAmount: parseFloat(formData.totalAmount),
            netIncome: parseFloat(formData.netIncome),
            deposit: parseFloat(formData.deposit) || 0
        };

        if (initialData) {
            updateBooking(initialData.id, dataToSave);
        } else {
            addBooking(dataToSave);
        }
        onClose();
    };

    return (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Select
                    label="Casa Rural"
                    name="houseId"
                    value={formData.houseId}
                    onChange={handleChange}
                    options={HOUSES.map(h => ({ value: h.id, label: h.name }))}
                />
                <Input
                    label="Nombre del Cliente"
                    name="guestName"
                    value={formData.guestName}
                    onChange={handleChange}
                    required
                />
            </div>

            <DateRangePicker
                label="Fechas de Estancia"
                checkIn={formData.checkIn}
                checkOut={formData.checkOut}
                onChange={({ checkIn, checkOut }) => setFormData(prev => ({ ...prev, checkIn, checkOut }))}
                required
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Select
                    label="Canal"
                    name="channelId"
                    value={formData.channelId}
                    onChange={handleChange}
                    options={CHANNELS.map(c => ({ value: c.id, label: c.name }))}
                />
                <Input
                    label="Importe Total (€)"
                    type="number"
                    name="totalAmount"
                    value={formData.totalAmount}
                    onChange={handleChange}
                    required
                    step="0.01"
                />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Input
                    label="Anticipo / Prereserva (€)"
                    type="number"
                    name="deposit"
                    value={formData.deposit}
                    onChange={handleChange}
                    placeholder="0.00"
                    step="0.01"
                />
                <Input
                    label="Ingreso Neto Real (€)"
                    type="number"
                    name="netIncome"
                    value={formData.netIncome}
                    onChange={handleChange}
                    required
                    step="0.01"
                    title="Se calcula automáticamente pero puedes modificarlo manualmente"
                />
            </div>

            <div style={{ padding: '1rem', backgroundColor: 'var(--color-primary-light)', color: 'white', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.9 }}>
                <div style={{ fontSize: '0.875rem' }}>
                    <div>Total: {parseFloat(formData.totalAmount || 0).toFixed(2)}€</div>
                    <div>Anticipo: {parseFloat(formData.deposit || 0).toFixed(2)}€</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.875rem', display: 'block' }}>Beneficio Neto:</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                        {parseFloat(formData.netIncome || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </span>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                {initialData && (
                    <>
                        <Button type="button" onClick={handleDelete} style={{ marginRight: 'auto', backgroundColor: '#ef4444', color: 'white', borderColor: '#ef4444' }}>
                            Anular
                        </Button>
                        <Button 
                            type="button" 
                            onClick={handleSendToViajeros} 
                            disabled={isSending}
                            icon={Send}
                            style={{ 
                                backgroundColor: sentStatus === 'success' ? '#10b981' : 'var(--color-secondary)',
                                color: 'white'
                            }}
                        >
                            {isSending ? 'Enviando...' : sentStatus === 'success' ? 'Enviado' : 'Enviar a Registro'}
                        </Button>
                    </>
                )}
                <Button type="button" variant="secondary" onClick={onClose}>
                    Cancelar
                </Button>
                <Button type="submit" icon={Save}>
                    {initialData ? 'Actualizar' : 'Guardar'}
                </Button>
            </div>
        </form>
    );
};

export default BookingForm;
