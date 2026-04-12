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
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';

const CHANNEL_COLORS = {
    booking: '#003580', // Booking.com blue
    airbnb: '#FF5A5F',  // Airbnb red
    web: '#22c55e',     // Web green
    direct: '#94a3b8'    // Direct/Other gray
};

const Calendar = ({ bookings, onDateClick, onBookingClick }) => {
    const { houses } = useApp();
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

            return (isWithinInterval(day, { start, end }) || isSameDay(day, start)) && !isSameDay(day, end);
        }).map(booking => {
            const start = parseISO(booking.checkIn);
            const end = parseISO(booking.checkOut);
            const isStart = isSameDay(day, start);

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
                <button onClick={nextMonth} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: '0.4rem' }}>
                    <ChevronRight size={20} />
                </button>
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
                                style={{ position: 'relative' }}
                            >
                                {/* Indicadores de canal (puntos) arriba a la izquierda */}
                                <div style={{
                                    position: 'absolute',
                                    top: '4px',
                                    left: '4px',
                                    display: 'flex',
                                    gap: '2px',
                                    zIndex: 5
                                }}>
                                    {['gredos', 'valles'].map(houseId => {
                                        const b = dayBookings.find(db => (db.house_id || db.houseId) === houseId);
                                        if (!b) return null;
                                        
                                        const channelId = b.channel_id || b.channelId || 'direct';
                                        const color = CHANNEL_COLORS[channelId] || CHANNEL_COLORS.direct;
                                        return (
                                            <div 
                                                key={houseId} 
                                                style={{
                                                    width: '6px',
                                                    height: '6px',
                                                    borderRadius: '50%',
                                                    backgroundColor: color,
                                                    boxShadow: '0 0 1px rgba(0,0,0,0.2)'
                                                }}
                                                title={`${houseId === 'gredos' ? 'Gredos' : 'Valles'}: ${channelId}`}
                                            />
                                        );
                                    })}
                                </div>

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
                                        gap: '4px',
                                        padding: isSelected ? '4px 0' : '1px 0',
                                        width: '100%',
                                        marginTop: 'auto',
                                        minHeight: isSelected ? 'auto' : '18px',
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
                                                            position: 'relative',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center'
                                                        }}
                                                        title={`${house?.name} - ${booking.guestName}`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onBookingClick && onBookingClick(booking);
                                                        }}
                                                    >
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {booking.guestName}
                                                        </span>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            ['gredos', 'valles'].map(houseId => {
                                                const laneBookings = dayBookings.filter(b => (b.house_id || b.houseId) === houseId);
                                                if (laneBookings.length === 0) return <div key={houseId} style={{ height: '8px' }} />;

                                                 const booking = laneBookings[0];
                                                 const house = houses.find(h => h.id === houseId);
                                                 const color = house?.color === 'secondary' ? 'var(--color-secondary)' : 'var(--color-primary)';

                                                 return (
                                                     <div
                                                         key={booking.id}
                                                         className="calendar-booking-bar"
                                                         style={{
                                                             backgroundColor: color,
                                                             height: '8px',
                                                             width: '100%',
                                                             marginLeft: booking.isStart ? '15%' : '0',
                                                             marginRight: booking.isEnd ? '15%' : '0',
                                                             borderTopLeftRadius: booking.isStart ? '10px' : '0',
                                                             borderBottomLeftRadius: booking.isStart ? '10px' : '0',
                                                             borderTopRightRadius: booking.isEnd ? '10px' : '0',
                                                             borderBottomRightRadius: booking.isEnd ? '10px' : '0',
                                                             opacity: 0.9,
                                                             boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                                             display: 'flex',
                                                             alignItems: 'center',
                                                             justifyContent: 'center',
                                                             overflow: 'hidden',
                                                             position: 'relative'
                                                         }}
                                                         title={booking.guestName}
                                                     />
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
        </div>
    );
};

export default Calendar;
