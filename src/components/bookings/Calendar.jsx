import React, { useState } from 'react';
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameMonth,
    isSameDay,
    addMonths,
    subMonths,
    isWithinInterval,
    parseISO
} from 'date-fns';
import { es } from 'date-fns/locale'; // Spanish locale
import { ChevronLeft, ChevronRight, RefreshCw, Globe } from 'lucide-react';
import { useApp } from '../../context/AppContext';

const Calendar = ({ bookings, onDateClick, onBookingClick }) => {
    const { houses, isSyncing, syncExternal } = useApp();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDay, setSelectedDay] = useState(null);

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 }); // Comienza en Lunes
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

    const dateFormat = "d";
    const weekDays = [
        { long: 'Lunes', short: 'Lun' },
        { long: 'Martes', short: 'Mar' },
        { long: 'Miércoles', short: 'Mie' },
        { long: 'Jueves', short: 'Jue' },
        { long: 'Viernes', short: 'Vie' },
        { long: 'Sábado', short: 'Sab' },
        { long: 'Domingo', short: 'Dom' }
    ];

    const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
    const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));

    const getBookingsForDay = (day) => {
        return (bookings || []).filter(b => {
            if (!b.checkIn || !b.checkOut) return false;
            const start = parseISO(b.checkIn);
            const end = parseISO(b.checkOut);

            // Una reserva ocupa las noches entre el checkIn y el checkOut.
            // La última "noche" es el día anterior al checkOut.
            // Por tanto, mostramos la barra desde el día de checkIn hasta el día ANTERIOR al checkOut.
            return (isWithinInterval(day, { start, end }) || isSameDay(day, start)) && !isSameDay(day, end);
        }).map(booking => {
            const start = parseISO(booking.checkIn);
            const end = parseISO(booking.checkOut);
            const isStart = isSameDay(day, start);

            // Calculamos el día anterior al checkOut para saber si es el "final" visual de la barra de noches
            const lastNight = new Date(end);
            lastNight.setDate(lastNight.getDate() - 1);
            const isEnd = isSameDay(day, lastNight);

            return {
                ...booking,
                isStart,
                isEnd,
                isMiddle: !isStart && !isEnd
            };
        });
    };

    const handleCellClick = (dayItem, e) => {
        // Toggle selection
        if (selectedDay && isSameDay(dayItem, selectedDay)) {
            setSelectedDay(null);
        } else {
            setSelectedDay(dayItem);
        }
        onDateClick(dayItem);
    };

    return (
        <div className="calendar-container" style={{
            backgroundColor: 'var(--color-surface)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
            overflow: 'hidden',
            width: '100%'
        }}>
            {/* Header */}
            <div className="calendar-header" style={{
                padding: '0.75rem 1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'var(--color-primary)',
                color: 'white'
            }}>
                <button onClick={prevMonth} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: '0.4rem' }}>
                    <ChevronLeft size={20} />
                </button>
                <h2 style={{ fontSize: '1.1rem', fontFamily: 'var(--font-serif)', fontWeight: 800, letterSpacing: '0.02em', textTransform: 'capitalize', margin: 0, color: 'white' }}>
                    {format(currentDate, 'MMMM yyyy', { locale: es })}
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button 
                        onClick={(e) => { e.stopPropagation(); syncExternal(); }} 
                        disabled={isSyncing}
                        style={{ 
                            background: 'none', 
                            border: 'none', 
                            color: 'white', 
                            cursor: isSyncing ? 'default' : 'pointer', 
                            padding: '0.4rem',
                            display: 'flex',
                            alignItems: 'center',
                            opacity: isSyncing ? 0.5 : 1
                        }}
                        title="Sincronizar calendarios externos"
                    >
                        <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
                    </button>
                    <button onClick={nextMonth} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: '0.4rem' }}>
                        <ChevronRight size={20} />
                    </button>
                </div>
                <style>{`
                    @keyframes spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                    .animate-spin {
                        animation: spin 1s linear infinite;
                    }
                `}</style>
            </div>

            {/* Calendar Grid */}
            <div style={{ width: '100%', overflowX: 'auto' }}>
                <div className="calendar-grid-container" style={{
                    backgroundColor: 'var(--color-background)',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, 1fr)',
                    width: '100%'
                }}>
                    {weekDays.map((d) => (
                        <div key={d.long} style={{
                            padding: '0.5rem 0.1rem',
                            textAlign: 'center',
                            fontWeight: 700,
                            fontSize: '0.65rem',
                            color: 'var(--color-text-muted)',
                            borderBottom: '1px solid var(--color-border)',
                            backgroundColor: 'white'
                        }}>
                            <span className="day-label-desktop">{d.long}</span>
                            <span className="day-label-mobile">{d.short}</span>
                        </div>
                    ))}
                </div>

                <div className="calendar-grid-container" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, 1fr)',
                    width: '100%'
                }}>
                    {calendarDays.map((dayItem) => {
                        const dayBookings = getBookingsForDay(dayItem);
                        const isOutside = !isSameMonth(dayItem, monthStart);
                        const isToday = isSameDay(dayItem, new Date());
                        const isSelected = selectedDay && isSameDay(dayItem, selectedDay);

                        return (
                            <div
                                key={dayItem.toISOString()}
                                className={`calendar-cell ${dayBookings.length > 0 ? 'has-booking' : ''} ${isOutside ? 'outside-month' : ''} ${isSelected ? 'selected-day' : ''}`}
                                onClick={(e) => handleCellClick(dayItem, e)}
                            >
                                <div className="calendar-cell-day" style={{
                                    color: isToday ? 'var(--color-primary)' : 'inherit',
                                    fontWeight: isToday ? 'bold' : 'normal',
                                    backgroundColor: isToday ? 'rgba(30, 58, 36, 0.1)' : 'transparent',
                                    borderRadius: '50%',
                                    width: '18px',
                                    height: '18px',
                                    fontSize: '0.7rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginLeft: 'auto'
                                }}>
                                    {format(dayItem, dateFormat)}
                                </div>

                                {dayBookings.length > 0 && (
                                    <div style={{
                                        flex: 1,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: isSelected ? 'flex-start' : 'center',
                                        gap: isSelected ? '4px' : '4px', // Mayor hueco para 'línea imaginaria' clara
                                        padding: isSelected ? '4px 0' : '1px 0',
                                        width: '100%',
                                        marginTop: 'auto',
                                        minHeight: isSelected ? 'auto' : '18px', // Altura aumentada para mostrar bien el hueco
                                        position: 'relative'
                                    }}>
                                        {isSelected ? (
                                            dayBookings.map(booking => {
                                                const house = houses.find(h => h.id === (booking.house_id || booking.houseId));
                                                const color = house?.color === 'secondary' ? 'var(--color-secondary)' : 'var(--color-primary)';
                                                return (
                                                    <div
                                                        key={booking.id}
                                                        className="calendar-guest-name"
                                                        style={{
                                                            backgroundColor: color,
                                                            margin: '0 4px',
                                                            borderRadius: '4px',
                                                            border: booking.isExternal ? '1px solid white' : 'none',
                                                            position: 'relative',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            gap: '4px'
                                                        }}
                                                        title={`${house?.name} - ${booking.guestName}${booking.isExternal ? ' (Sincronizado)' : ''}`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onBookingClick && onBookingClick(booking);
                                                        }}
                                                    >
                                                        {booking.isExternal && <Globe size={10} color="white" />}
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {booking.guestName}
                                                        </span>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            // Mapeo por carriles fijos: Arriba Gredos, Abajo Valles
                                            ['gredos', 'valles'].map(houseId => {
                                                // Buscamos todas las reservas de este carril para este día
                                                const laneBookings = dayBookings.filter(b => (b.house_id || b.houseId) === houseId);
                                                if (laneBookings.length === 0) return <div key={houseId} style={{ height: '8px' }} />;

                                                 // Priorizamos la manual para la información, pero detectamos si hay sincronizada
                                                 const manualBooking = laneBookings.find(b => !b.isExternal);
                                                 const externalBooking = laneBookings.find(b => b.isExternal);
                                                 const isPlatformBlock = externalBooking?.isBlock && !manualBooking;
                                                 
                                                 const booking = manualBooking || externalBooking;
                                                 const house = houses.find(h => h.id === houseId);
                                                 
                                                 // Si es un bloqueo de plataforma y no hay reserva manual, usamos un gris suave
                                                 const color = isPlatformBlock 
                                                     ? '#94a3b8' 
                                                     : (house?.color === 'secondary' ? 'var(--color-secondary)' : 'var(--color-primary)');

                                                 return (
                                                     <div
                                                         key={booking.id}
                                                         className={`calendar-booking-bar ${externalBooking ? 'is-synced' : ''}`}
                                                         style={{
                                                             background: isPlatformBlock 
                                                                ? 'repeating-linear-gradient(45deg, #cbd5e1, #cbd5e1 5px, #94a3b8 5px, #94a3b8 10px)'
                                                                : color,
                                                             backgroundColor: color,
                                                             height: '8px',
                                                             width: '100%',
                                                             marginLeft: booking.isStart ? '15%' : '0',
                                                             marginRight: booking.isEnd ? '15%' : '0',
                                                             borderTopLeftRadius: booking.isStart ? '10px' : '0',
                                                             borderBottomLeftRadius: booking.isStart ? '10px' : '0',
                                                             borderTopRightRadius: booking.isEnd ? '10px' : '0',
                                                             borderBottomRightRadius: booking.isEnd ? '10px' : '0',
                                                             opacity: isPlatformBlock ? 0.5 : (booking.isExternal ? 0.7 : 0.9),
                                                             border: externalBooking ? '1px solid white' : 'none',
                                                             boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                                             display: 'flex',
                                                             alignItems: 'center',
                                                             justifyContent: 'center',
                                                             overflow: 'hidden',
                                                             position: 'relative'
                                                         }}
                                                         title={`${booking.guestName}${externalBooking ? ' (Sincronizado con plataforma)' : ''}`}
                                                     >
                                                         {externalBooking && (
                                                             <Globe 
                                                                 size={8} 
                                                                 color="white" 
                                                                 style={{ 
                                                                     opacity: 1,
                                                                     position: 'absolute',
                                                                     zIndex: 10
                                                                 }} 
                                                             />
                                                         )}
                                                     </div>
                                                 );
                                            })
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
            {/* Grid Footer / Debug */}
            <div style={{
                padding: '4px 8px',
                fontSize: '10px',
                color: 'var(--color-text-muted)',
                display: 'flex',
                justifyContent: 'space-between',
                borderTop: '1px solid var(--color-border-light)',
                backgroundColor: 'var(--color-background)'
            }}>
                <span>Sincronización v23</span>
                <span>{bookings.filter(b => b.isExternal).length} reservas externas detectadas</span>
            </div>
        </div >
    );
};

export default Calendar;
