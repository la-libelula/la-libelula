import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import Card from '../components/ui/Card';
import Select from '../components/ui/Select';
import { HOUSES } from '../utils/constants';
import { startOfYear, endOfYear, parseISO, getYear } from 'date-fns';

const Stats = () => {
    const { bookings, expenses, loading } = useApp();
    const currentYear = new Date().getFullYear();
    const [selectedYear1, setSelectedYear1] = useState(currentYear);
    const [selectedYear2, setSelectedYear2] = useState(currentYear - 1);
    const [selectedHouse, setSelectedHouse] = useState('all');

    // Get available years from data
    const years = useMemo(() => {
        const yearsSet = new Set([currentYear, currentYear - 1]);
        (bookings || []).forEach(b => {
            if (b.checkIn) {
                try {
                    yearsSet.add(getYear(parseISO(b.checkIn)));
                } catch (e) { }
            }
        });
        (expenses || []).forEach(e => {
            if (e.date) {
                try {
                    yearsSet.add(getYear(parseISO(e.date)));
                } catch (e) { }
            }
        });
        return Array.from(yearsSet).sort((a, b) => b - a);
    }, [bookings, expenses, currentYear]);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ width: '40px', height: '40px', border: '4px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                <p style={{ color: 'var(--color-text-muted)' }}>Analizando datos...</p>
                <style>{`
                    @keyframes spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                `}</style>
            </div>
        );
    }

    const calculateStats = (year) => {
        const start = startOfYear(new Date(year, 0, 1));
        const end = endOfYear(new Date(year, 0, 1));

        const yearBookings = (bookings || []).filter(b => {
            if (!b.checkIn) return false;
            const date = parseISO(b.checkIn);
            const matchesHouse = selectedHouse === 'all' || b.houseId === selectedHouse;
            return matchesHouse && date >= start && date <= end;
        });

        const yearExpenses = (expenses || []).filter(e => {
            if (!e.date) return false;
            const date = parseISO(e.date);
            const matchesHouse = selectedHouse === 'all' || e.houseId === selectedHouse;
            return matchesHouse && date >= start && date <= end;
        });

        const revenue = yearBookings.reduce((sum, b) => sum + (parseFloat(b.netIncome) || 0), 0);
        const expenseTotal = yearExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

        return { revenue, expenseTotal, profit: revenue - expenseTotal, count: yearBookings.length };
    };

    const stats1 = calculateStats(selectedYear1);
    const stats2 = calculateStats(selectedYear2);

    const formatCurrency = (val) => (val || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2>Comparativa Anual</h2>
                <div style={{ width: '250px' }}>
                    <Select
                        label=""
                        value={selectedHouse}
                        onChange={(e) => setSelectedHouse(e.target.value)}
                        options={[
                            { value: 'all', label: 'Todas las Casas' },
                            ...HOUSES.map(h => ({ value: h.id, label: h.name }))
                        ]}
                    />
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
                <div>
                    <Select
                        label="Año A"
                        value={selectedYear1}
                        onChange={(e) => setSelectedYear1(parseInt(e.target.value))}
                        options={years.map(y => ({ value: y, label: y }))}
                    />
                    <Card title={`Resultados ${selectedYear1}`}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Ingresos Netos:</span>
                                <span style={{ fontWeight: 700, color: 'var(--color-secondary)' }}>{formatCurrency(stats1.revenue)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Gastos Totales:</span>
                                <span style={{ fontWeight: 700, color: '#ef4444' }}>{formatCurrency(stats1.expenseTotal)}</span>
                            </div>
                            <div style={{ height: '1px', backgroundColor: 'var(--color-border)' }}></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem' }}>
                                <span>Beneficio:</span>
                                <span style={{ fontWeight: 800, color: stats1.profit >= 0 ? 'var(--color-primary)' : '#ef4444' }}>{formatCurrency(stats1.profit)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                                <span>Reservas:</span>
                                <span>{stats1.count}</span>
                            </div>
                        </div>
                    </Card>
                </div>

                <div>
                    <Select
                        label="Año B"
                        value={selectedYear2}
                        onChange={(e) => setSelectedYear2(parseInt(e.target.value))}
                        options={years.map(y => ({ value: y, label: y }))}
                    />
                    <Card title={`Resultados ${selectedYear2}`}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Ingresos Netos:</span>
                                <span style={{ fontWeight: 700, color: 'var(--color-secondary)' }}>{formatCurrency(stats2.revenue)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Gastos Totales:</span>
                                <span style={{ fontWeight: 700, color: '#ef4444' }}>{formatCurrency(stats2.expenseTotal)}</span>
                            </div>
                            <div style={{ height: '1px', backgroundColor: 'var(--color-border)' }}></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem' }}>
                                <span>Beneficio:</span>
                                <span style={{ fontWeight: 800, color: stats2.profit >= 0 ? 'var(--color-primary)' : '#ef4444' }}>{formatCurrency(stats2.profit)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                                <span>Reservas:</span>
                                <span>{stats2.count}</span>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>

            <Card title="Diferencia (Año A - Año B)">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Variación Beneficio</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: (stats1.profit - stats2.profit) >= 0 ? 'var(--color-secondary)' : '#ef4444' }}>
                            {formatCurrency(stats1.profit - stats2.profit)}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Variación Ingresos</div>
                        <div style={{ fontWeight: 600 }}>{formatCurrency(stats1.revenue - stats2.revenue)}</div>
                    </div>
                </div>
            </Card>
        </div>
    );
};

export default Stats;
