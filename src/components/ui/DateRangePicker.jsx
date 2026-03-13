import React, { useState, useRef, useEffect } from 'react';
import {
    format,
    addMonths,
    subMonths,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameMonth,
    isSameDay,
    isAfter,
    isBefore,
    parseISO,
    isValid
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from 'lucide-react';

const DateRangePicker = ({ label, checkIn, checkOut, onChange, required }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const containerRef = useRef(null);

    // Parse dates to Date objects safely
    const parseDate = (dateStr) => {
        if (!dateStr) return null;
        const date = parseISO(dateStr);
        return isValid(date) ? date : null;
    };

    const startDate = parseDate(checkIn);
    const endDate = parseDate(checkOut);

    // Handle clicks outside to close
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleDayClick = (day) => {
        if (!startDate || (startDate && endDate)) {
            // Start new selection
            onChange({ checkIn: format(day, 'yyyy-MM-dd'), checkOut: '' });
        } else {
            // Complete selection
            if (isBefore(day, startDate)) {
                // If clicked before start, make it the new start
                onChange({ checkIn: format(day, 'yyyy-MM-dd'), checkOut: '' });
            } else if (isSameDay(day, startDate)) {
                // Ignore click on same day (or reset if preferred)
                return;
            } else {
                // Valid end date
                onChange({ checkIn: format(startDate, 'yyyy-MM-dd'), checkOut: format(day, 'yyyy-MM-dd') });
                setIsOpen(false); // Close on completion
            }
        }
    };

    const isInRange = (day) => {
        if (!startDate || !endDate) return false;
        return isAfter(day, startDate) && isBefore(day, endDate);
    };

    const isSelected = (day) => {
        return (startDate && isSameDay(day, startDate)) || (endDate && isSameDay(day, endDate));
    };

    const renderCalendar = () => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(monthStart);
        const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
        const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
        const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

        const weekDays = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

        return (
            <div style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <button type="button" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} style={{ padding: '0.5rem', background: 'none', border: 'none', cursor: 'pointer' }}>
                        <ChevronLeft size={20} />
                    </button>
                    <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>
                        {format(currentMonth, 'MMMM yyyy', { locale: es })}
                    </span>
                    <button type="button" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} style={{ padding: '0.5rem', background: 'none', border: 'none', cursor: 'pointer' }}>
                        <ChevronRight size={20} />
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center' }}>
                    {weekDays.map(d => (
                        <div key={d} style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', paddingBottom: '0.5rem' }}>{d}</div>
                    ))}
                    {days.map((day, idx) => {
                        const isOutside = !isSameMonth(day, monthStart);
                        const selected = isSelected(day);
                        const inRange = isInRange(day);
                        const isStart = startDate && isSameDay(day, startDate);
                        const isEnd = endDate && isSameDay(day, endDate);

                        return (
                            <div
                                key={idx}
                                onClick={() => handleDayClick(day)}
                                style={{
                                    padding: '0.5rem 0',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                    position: 'relative',
                                    color: isOutside ? 'var(--color-border)' : 'inherit',
                                    backgroundColor: inRange ? 'rgba(30, 58, 36, 0.1)' : 'transparent',
                                    borderRadius: isStart ? '8px 0 0 8px' : isEnd ? '0 8px 8px 0' : '0'
                                }}
                            >
                                <div style={{
                                    width: '32px',
                                    height: '32px',
                                    margin: '0 auto',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '50%',
                                    backgroundColor: selected ? 'var(--color-primary)' : 'transparent',
                                    color: selected ? 'white' : 'inherit',
                                    fontWeight: selected ? 700 : 400
                                }}>
                                    {format(day, 'd')}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
            </label>
            
            <div 
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    padding: '0.75rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-background)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    cursor: 'pointer'
                }}
            >
                <CalendarIcon size={18} color="var(--color-primary)" />
                <span style={{ fontSize: '0.95rem', flex: 1 }}>
                    {startDate ? format(startDate, 'd MMM', { locale: es }) : 'Entrada'} 
                    {' → '}
                    {endDate ? format(endDate, 'd MMM', { locale: es }) : 'Salida'}
                </span>
                {(startDate || endDate) && (
                    <X 
                        size={16} 
                        style={{ cursor: 'pointer' }} 
                        onClick={(e) => {
                            e.stopPropagation();
                            onChange({ checkIn: '', checkOut: '' });
                        }} 
                    />
                )}
            </div>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    zIndex: 100,
                    backgroundColor: 'var(--color-surface)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-lg)',
                    marginTop: '0.5rem',
                    width: '300px',
                    border: '1px solid var(--color-border)'
                }}>
                    {renderCalendar()}
                </div>
            )}
        </div>
    );
};

export default DateRangePicker;
