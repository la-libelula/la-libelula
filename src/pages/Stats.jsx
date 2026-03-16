import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import Card from '../components/ui/Card';
import Select from '../components/ui/Select';
import Chart from '../components/ui/Chart';
import BarChart from '../components/ui/BarChart';
import { HOUSES } from '../utils/constants';
import { startOfYear, endOfYear, parseISO, getYear, format, getMonth } from 'date-fns';
import { es } from 'date-fns/locale';

const Stats = () => {
    const { bookings, expenses, loading } = useApp();
    const currentYear = new Date().getFullYear();
    const [selectedYear1, setSelectedYear1] = useState(currentYear);
    const [selectedYear2, setSelectedYear2] = useState(currentYear - 1);
    const [selectedYear3, setSelectedYear3] = useState(currentYear - 2);
    const [selectedHouse, setSelectedHouse] = useState('all');

    const MONTHS = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

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

    const chartData = useMemo(() => {
        return MONTHS.map((month, index) => {
            const data = { name: month };

            // Year 1 Data
            const y1Bookings = (bookings || []).filter(b => {
                if (!b.checkIn) return false;
                const date = parseISO(b.checkIn);
                const matchesHouse = selectedHouse === 'all' || b.houseId === selectedHouse;
                return matchesHouse && getYear(date) === selectedYear1 && getMonth(date) === index;
            });
            data.year1 = y1Bookings.reduce((sum, b) => sum + (parseFloat(b.netIncome) || 0), 0);

            // Year 2 Data
            const y2Bookings = (bookings || []).filter(b => {
                if (!b.checkIn) return false;
                const date = parseISO(b.checkIn);
                const matchesHouse = selectedHouse === 'all' || b.houseId === selectedHouse;
                return matchesHouse && getYear(date) === selectedYear2 && getMonth(date) === index;
            });
            data.year2 = y2Bookings.reduce((sum, b) => sum + (parseFloat(b.netIncome) || 0), 0);

            return data;
        });
    }, [bookings, selectedYear1, selectedYear2, selectedHouse]);

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

        const grossRevenue = yearBookings.reduce((sum, b) => sum + (parseFloat(b.totalAmount) || 0), 0);
        const revenue = yearBookings.reduce((sum, b) => sum + (parseFloat(b.netIncome) || 0), 0);
        const expenseTotal = yearExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

        return { grossRevenue, revenue, expenseTotal, profit: revenue - expenseTotal, count: yearBookings.length };
    };

    const stats1 = calculateStats(selectedYear1);
    const stats2 = calculateStats(selectedYear2);
    const stats3 = calculateStats(selectedYear3);

    const barChartData = useMemo(() => {
        // Collect actual chosen years, sort them chronologically
        const chosenYears = Array.from(new Set([selectedYear3, selectedYear2, selectedYear1])).sort((a, b) => a - b);
        
        return chosenYears.map(year => {
            const stats = calculateStats(year);
            return {
                name: year.toString(),
                gross: stats.grossRevenue,
                net: stats.revenue,
                expenses: stats.expenseTotal
            };
        });
    }, [selectedYear1, selectedYear2, selectedYear3, bookings, expenses, selectedHouse]);

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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', marginBottom: '2rem' }}>
                <div>
                    <Select
                        label="Año A (Actual)"
                        value={selectedYear1}
                        onChange={(e) => setSelectedYear1(parseInt(e.target.value))}
                        options={years.map(y => ({ value: y, label: y }))}
                    />
                    <Card title={`Resultados ${selectedYear1}`}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Ingresos Brutos:</span>
                                <span>{formatCurrency(stats1.grossRevenue)}</span>
                            </div>
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
                                <span>Beneficio Limpio:</span>
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
                        label="Año B (Anterior)"
                        value={selectedYear2}
                        onChange={(e) => setSelectedYear2(parseInt(e.target.value))}
                        options={years.map(y => ({ value: y, label: y }))}
                    />
                    <Card title={`Resultados ${selectedYear2}`}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Ingresos Brutos:</span>
                                <span>{formatCurrency(stats2.grossRevenue)}</span>
                            </div>
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
                                <span>Beneficio Limpio:</span>
                                <span style={{ fontWeight: 800, color: stats2.profit >= 0 ? 'var(--color-primary)' : '#ef4444' }}>{formatCurrency(stats2.profit)}</span>
                            </div>
                        </div>
                    </Card>
                </div>

                <div>
                    <Select
                        label="Año C (Histórico)"
                        value={selectedYear3}
                        onChange={(e) => setSelectedYear3(parseInt(e.target.value))}
                        options={years.map(y => ({ value: y, label: y }))}
                    />
                    <Card title={`Resultados ${selectedYear3}`}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Ingresos Brutos:</span>
                                <span>{formatCurrency(stats3.grossRevenue)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Ingresos Netos:</span>
                                <span style={{ fontWeight: 700, color: 'var(--color-secondary)' }}>{formatCurrency(stats3.revenue)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Gastos Totales:</span>
                                <span style={{ fontWeight: 700, color: '#ef4444' }}>{formatCurrency(stats3.expenseTotal)}</span>
                            </div>
                            <div style={{ height: '1px', backgroundColor: 'var(--color-border)' }}></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem' }}>
                                <span>Beneficio Limpio:</span>
                                <span style={{ fontWeight: 800, color: stats3.profit >= 0 ? 'var(--color-primary)' : '#ef4444' }}>{formatCurrency(stats3.profit)}</span>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>

            <Card title="Comparativa Económica Anual (Bruto vs Neto vs Gastos)" style={{ marginBottom: '2rem' }}>
                <BarChart
                    data={barChartData}
                    series={[
                        { key: 'gross', label: 'Ingresos Brutos', color: '#cbd5e1' }, // Gris claro o dorado
                        { key: 'net', label: 'Ingresos Netos', color: 'var(--color-primary)' }, // Verde
                        { key: 'expenses', label: 'Gastos Estructura', color: '#ef4444' } // Rojo
                    ]}
                />
            </Card>

            <Card title="Evolución Mensual (Netos)" style={{ marginBottom: '2rem' }}>
                <Chart
                    data={chartData}
                    series={[
                        { key: 'year1', label: `${selectedYear1}`, color: 'var(--color-primary)' },
                        { key: 'year2', label: `${selectedYear2}`, color: 'var(--color-secondary)' }
                    ]}
                />
            </Card>

            <Card style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Crecimiento Beneficio (Año A vs Año B)</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: (stats1.profit - stats2.profit) >= 0 ? 'var(--color-secondary)' : '#ef4444' }}>
                            {formatCurrency(stats1.profit - stats2.profit)}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Crecimiento Netos</div>
                        <div style={{ fontWeight: 600 }}>{formatCurrency(stats1.revenue - stats2.revenue)}</div>
                    </div>
                </div>
            </Card>
        </div>
    );
};

export default Stats;
