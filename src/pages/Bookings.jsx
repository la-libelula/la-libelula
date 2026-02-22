import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import Calendar from '../components/bookings/Calendar';
import BookingForm from '../components/bookings/BookingForm';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { Plus, X } from 'lucide-react';

const Bookings = () => {
    const { bookings, loading } = useApp();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedBooking, setSelectedBooking] = useState(null);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ width: '40px', height: '40px', border: '4px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                <p style={{ color: 'var(--color-text-muted)' }}>Cargando reservas...</p>
                <style>{`
                    @keyframes spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                `}</style>
            </div>
        );
    }

    const handleDateClick = (date) => {
        console.log("Clicked date:", date);
    };

    const handleBookingClick = (booking) => {
        setSelectedBooking(booking);
        setIsFormOpen(true);
    };

    const handleCloseForm = () => {
        setIsFormOpen(false);
        setSelectedBooking(null);
    }

    return (
        <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2>Reservas</h2>
                <Button onClick={() => setIsFormOpen(true)} icon={Plus}>
                    Nueva Reserva
                </Button>
            </div>

            <Card>
                <Calendar
                    bookings={bookings}
                    onDateClick={handleDateClick}
                    onBookingClick={handleBookingClick}
                />
            </Card>

            {/* Modal Overlay for Form */}
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
                            <h3>{selectedBooking ? 'Editar Reserva' : 'Nueva Reserva'}</h3>
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

export default Bookings;
