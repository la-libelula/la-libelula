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
import { HOUSES } from '../../utils/constants';

const Calendar = ({ bookings, onDateClick, onBookingClick }) => {
    const [currentDate, setCurrentDate] = useState(new Date());

    const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
    const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday start
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const dateFormat = "d";
    const rows = [];
    let days = [];
    let day = startDate;
    let formattedDate = "";

    const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

    // Helper to find bookings for a specific day
    const getBookingsForDay = (day) => {
        return bookings.filter(booking => {
            const start = parseISO(booking.checkIn);
            const end = parseISO(booking.checkOut);
            // Check if day is within interval [start, end)
            // Usually check-out day is free for next guest, so we use isWithinInterval but handle boundaries carefully
            // Actually, standard hotel logic: check-in day is booked, check-out day is half-booked/free.
            // Let's assume inclusive start, exclusive end for visualization logic essentially.

            // Simple check: is day >= start AND day < end
            return day >= start && day < end;
            // Note: This comparison works with Date objects if times are normalized, but safer to use timestamps or date-fns utils
        });
    };

    const weekDays = [
        { long: 'Lun', short: 'L' },
        { long: 'Mar', short: 'M' },
        { long: 'Mié', short: 'X' },
        { long: 'Jue', short: 'J' },
        { long: 'Vie', short: 'V' },
        { long: 'Sáb', short: 'S' },
        { long: 'Dom', short: 'D' }
    ];

    return (
        <div className="calendar-container" style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--color-primary)', color: 'white' }}>
                <button onClick={prevMonth} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: '0.4rem' }}>
                    <ChevronLeft size={20} />
                </button>
                <h2 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-serif)', fontWeight: 800, letterSpacing: '0.02em', textTransform: 'capitalize', margin: 0, color: 'white' }}>
                    {format(currentDate, 'MMMM yyyy', { locale: es })}
                </h2>
                <button onClick={nextMonth} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: '0.4rem' }}>
                    <ChevronRight size={20} />
                </button>
            </div>

            {/* Calendar Grid - Mobile Fixed Support */}
            <div style={{ width: '100%', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', backgroundColor: 'var(--color-background)', borderBottom: '1px solid var(--color-border)' }}>
                    {weekDays.map((d) => (
                        <div key={d.long} style={{ padding: '0.5rem 0.1rem', textAlign: 'center', fontWeight: 600, fontSize: 'var(--calendar-font-size)', color: 'var(--color-text-muted)' }}>
                            <span className="day-long">{d.long}</span>
                            <span className="day-short">{d.short}</span>
                        </div>
                    ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', autoRows: 'minmax(60px, auto)' }}>
                    village                    {calendarDays.map((dayItem, index) => {
                        const dayBookings = getBookingsForDay(dayItem);

                        return (
                            <div
                                key={dayItem.toISOString()}
                                style={{
                                    borderRight: '1px solid var(--color-border)',
                                    borderBottom: '1px solid var(--color-border)',
                                    padding: '0.15rem',
                                    backgroundColor: !isSameMonth(dayItem, monthStart) ? 'var(--color-background)' : 'white',
                                    opacity: !isSameMonth(dayItem, monthStart) ? 0.5 : 1,
                                    position: 'relative',
                                    minHeight: '70px'
                                }}
                                onClick={() => onDateClick(dayItem)}
                            >
                                <div style={{ textAlign: 'right', fontSize: 'var(--calendar-font-size)', fontWeight: isSameDay(dayItem, new Date()) ? 'bold' : 'normal', color: isSameDay(dayItem, new Date()) ? 'var(--color-primary)' : 'inherit' }}>
                                    {format(dayItem, dateFormat)}
                                </div>

                                <div style={{ marginTop: '0.1rem', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                    {dayBookings.map(booking => {
                                        const house = HOUSES.find(h => h.id === booking.houseId);
                                        const color = house ? (house.id === 'gredos' ? 'var(--color-primary)' : 'var(--color-secondary)') : 'gray';
                                        return (
                                            <div
                                                key={booking.id}
                                                style={{
                                                    fontSize: 'var(--calendar-booking-font)',
                                                    backgroundColor: color,
                                                    color: 'white',
                                                    padding: '1px 2px',
                                                    borderRadius: '2px',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    cursor: 'pointer',
                                                    opacity: 0.9,
                                                    lineHeight: '1.1'
                                                }}
                                                title={`${house?.name} - ${booking.guestName}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onBookingClick && onBookingClick(booking);
                                                }}
                                            >
                                                {booking.guestName}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default Calendar;
