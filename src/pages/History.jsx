import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import Card from '../components/ui/Card';
import Select from '../components/ui/Select';
import { HOUSES, CHANNELS } from '../utils/constants';
import { format, parseISO, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import BookingForm from '../components/bookings/BookingForm';
import { X, Calendar, TrendingUp, Wallet, BarChart2 } from 'lucide-react';

const History = () => {
    const { bookings, loading } = useApp();
    const [selectedHouse, setSelectedHouse] = useState('all');
    const [selectedChannel, setSelectedChannel] = useState('all');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedBooking, setSelectedBooking] = useState(null);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ width: '40px', height: '40px', border: '4px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                <p style={{ color: 'var(--color-text-muted)' }}>Cargando historial...</p>
                <style>{`
                    @keyframes spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                `}</style>
            </div>
        );
    }

    // Get unique years from bookings
    const availableYears = [...new Set(bookings.map(b => new Date(b.checkIn).getFullYear().toString()))]
        .sort((a, b) => b - a);

    // Ensure current year is always an option
    if (!availableYears.includes(new Date().getFullYear().toString())) {
        availableYears.push(new Date().getFullYear().toString());
    }

    const filteredBookings = bookings.filter(b => {
        const checkInDate = new Date(b.checkIn);
        const matchesHouse = selectedHouse === 'all' || b.houseId === selectedHouse;
        const matchesChannel = selectedChannel === 'all' || b.channelId === selectedChannel;
        const matchesYear = selectedYear === 'all' || checkInDate.getFullYear().toString() === selectedYear;
        return matchesHouse && matchesChannel && matchesYear;
    }).sort((a, b) => new Date(b.checkIn) - new Date(a.checkIn));

    const totalDays = filteredBookings.reduce((sum, b) => {
        return sum + differenceInDays(parseISO(b.checkOut), parseISO(b.checkIn));
    }, 0);

    const totalRevenue = filteredBookings.reduce((sum, b) => sum + (parseFloat(b.totalAmount) || 0), 0);
    const totalNet = filteredBookings.reduce((sum, b) => sum + (parseFloat(b.netIncome) || 0), 0);

    // Calculate Monthly Average
    const today = new Date();
    const currentYear = today.getFullYear().toString();
    const currentMonth = today.getMonth() + 1; // 1-12

    let monthlyAverage = 0;
    if (selectedYear === 'all') {
        // Average per total months across all years with bookings
        if (availableYears.length > 0) {
            monthlyAverage = totalNet / (availableYears.length * 12);
        }
    } else if (selectedYear === currentYear) {
        monthlyAverage = totalNet / currentMonth;
    } else {
        // Past years always divide by 12
        monthlyAverage = totalNet / 12;
    }

    const getChannelName = (id) => {
        const channel = CHANNELS.find(c => c.id === id);
        return channel ? channel.name : id;
    };

    const getHouseName = (id) => {
        const house = HOUSES.find(h => h.id === id);
        return house ? house.name : id;
    };

    const handleEditBooking = (booking) => {
        setSelectedBooking(booking);
        setIsFormOpen(true);
    };

    const handleCloseForm = () => {
        setIsFormOpen(false);
        setSelectedBooking(null);
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h2 style={{ margin: 0 }}>Histórico de Reservas</h2>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', width: '100%', justifyContent: 'flex-start', maxWidth: '600px' }}>
                    <div style={{ flex: '1 1 100px' }}>
                        <Select
                            label="Año"
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(e.target.value)}
                            options={[
                                { value: 'all', label: 'Todos' },
                                ...availableYears.map(year => ({ value: year, label: year }))
                            ]}
                        />
                    </div>
                    <div style={{ flex: '1 1 150px' }}>
                        <Select
                            label="Casa"
                            value={selectedHouse}
                            onChange={(e) => setSelectedHouse(e.target.value)}
                            options={[
                                { value: 'all', label: 'Todas las Casas' },
                                ...HOUSES.map(h => ({ value: h.id, label: h.name }))
                            ]}
                        />
                    </div>
                    <div style={{ flex: '1 1 150px' }}>
                        <Select
                            label="Canal"
                            value={selectedChannel}
                            onChange={(e) => setSelectedChannel(e.target.value)}
                            options={[
                                { value: 'all', label: 'Todos los Canales' },
                                ...CHANNELS.map(c => ({ value: c.id, label: c.name }))
                            ]}
                        />
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                <Card style={{ backgroundColor: 'var(--color-primary)', color: 'white', display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.5rem' }}>
                    <div style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: '0.5rem', borderRadius: '10px' }}>
                        <Calendar size={24} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.75rem', opacity: 0.9, fontWeight: 500 }}>Días Alquilados</div>
                        <div style={{ fontSize: '1.50rem', fontWeight: 800 }}>{totalDays} <span style={{ fontSize: '0.875rem', fontWeight: 400 }}>noches</span></div>
                    </div>
                </Card>

                <Card style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.5rem' }}>
                    <div style={{ backgroundColor: 'rgba(46, 90, 53, 0.1)', color: 'var(--color-primary)', padding: '0.5rem', borderRadius: '10px' }}>
                        <TrendingUp size={24} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Bruto Total</div>
                        <div style={{ fontSize: '1.50rem', fontWeight: 800 }}>{totalRevenue.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</div>
                    </div>
                </Card>

                <Card style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.5rem' }}>
                    <div style={{ backgroundColor: 'rgba(46, 90, 53, 0.15)', color: 'var(--color-primary)', padding: '0.5rem', borderRadius: '10px' }}>
                        <Wallet size={24} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Neto Total</div>
                        <div style={{ fontSize: '1.50rem', fontWeight: 800, color: 'var(--color-primary)' }}>{totalNet.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</div>
                    </div>
                </Card>

                <Card style={{ backgroundColor: '#ffffff', border: '1px solid var(--color-border)', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.5rem' }}>
                    <div style={{ backgroundColor: 'rgba(46, 90, 53, 0.1)', color: 'var(--color-primary)', padding: '0.5rem', borderRadius: '10px' }}>
                        <BarChart2 size={24} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Media Mensual</div>
                        <div style={{ fontSize: '1.50rem', fontWeight: 800, color: 'var(--color-secondary)' }}>
                            {monthlyAverage.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                        </div>
                    </div>
                </Card>
            </div>

            <Card>
                {filteredBookings.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                        <p>No hay reservas que coincidan con el filtro.</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                    <th style={{ padding: '1rem', fontWeight: 600 }}>Entrada</th>
                                    <th style={{ padding: '1rem', fontWeight: 600 }}>Salida</th>
                                    <th style={{ padding: '1rem', fontWeight: 600 }}>Días</th>
                                    <th style={{ padding: '1rem', fontWeight: 600 }}>Casa</th>
                                    <th style={{ padding: '1rem', fontWeight: 600 }}>Cliente</th>
                                    <th style={{ padding: '1rem', fontWeight: 600 }}>Canal</th>
                                    <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>Total</th>
                                    <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>Neto</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredBookings.map((booking) => {
                                    const nights = differenceInDays(parseISO(booking.checkOut), parseISO(booking.checkIn));
                                    return (
                                        <tr
                                            key={booking.id}
                                            onClick={() => handleEditBooking(booking)}
                                            style={{
                                                borderBottom: '1px solid var(--color-border)',
                                                cursor: 'pointer',
                                                transition: 'background-color 0.2s'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-background)'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            <td style={{ padding: '1rem' }}>
                                                {format(parseISO(booking.checkIn), 'dd/MM/yyyy')}
                                            </td>
                                            <td style={{ padding: '1rem' }}>
                                                {format(parseISO(booking.checkOut), 'dd/MM/yyyy')}
                                            </td>
                                            <td style={{ padding: '1rem', fontWeight: 600, color: 'var(--color-text)' }}>
                                                {nights}
                                            </td>
                                            <td style={{ padding: '1rem' }}>
                                                <span style={{
                                                    padding: '0.25rem 0.5rem',
                                                    borderRadius: '4px',
                                                    fontSize: '0.75rem',
                                                    backgroundColor: booking.houseId === 'gredos' ? 'var(--color-primary)' : 'var(--color-secondary)',
                                                    color: 'white'
                                                }}>
                                                    {booking.houseId === 'gredos' ? 'Gredos' : 'Valles'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '1rem', fontWeight: 500 }}>{booking.guestName}</td>
                                            <td style={{ padding: '1rem' }}>{getChannelName(booking.channelId)}</td>
                                            <td style={{ padding: '1rem', textAlign: 'right' }}>
                                                {parseFloat(booking.totalAmount).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                                            </td>
                                            <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 600, color: 'var(--color-primary)' }}>
                                                {parseFloat(booking.netIncome).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* Modal para Editar */}
            {isFormOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 50
                }}>
                    <div style={{
                        backgroundColor: 'var(--color-surface)',
                        borderRadius: 'var(--radius-lg)',
                        padding: '2rem',
                        width: '100%',
                        maxWidth: '600px',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        position: 'relative'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3>Editar Reserva</h3>
                            <button
                                onClick={handleCloseForm}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}
                            >
                                <X />
                            </button>
                        </div>
                        <BookingForm
                            onClose={handleCloseForm}
                            initialData={selectedBooking}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default History;
