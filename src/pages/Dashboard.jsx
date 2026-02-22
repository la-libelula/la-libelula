import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import Card from '../components/ui/Card';
import { HOUSES } from '../utils/constants';
import { ArrowUpRight, ArrowDownRight, Wallet, Calendar, TrendingUp } from 'lucide-react';
import { format, startOfYear, endOfYear, parseISO } from 'date-fns';

const Dashboard = () => {
    const { bookings, expenses, loading } = useApp();
    const currentYear = new Date().getFullYear();

    const stats = useMemo(() => {
        const start = startOfYear(new Date());
        const end = endOfYear(new Date());

        // Filter by current year
        const yearBookings = (bookings || []).filter(b => {
            if (!b.checkIn) return false;
            const date = parseISO(b.checkIn);
            return date >= start && date <= end;
        });

        const yearExpenses = (expenses || []).filter(e => {
            if (!e.date) return false;
            const date = parseISO(e.date);
            return date >= start && date <= end;
        });

        // Calculate totals
        const totalRevenue = yearBookings.reduce((sum, b) => sum + (parseFloat(b.netIncome) || 0), 0);
        const totalExpenses = yearExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
        const profit = totalRevenue - totalExpenses;

        const occupancy = yearBookings.reduce((acc, b) => {
            if (!b.checkIn || !b.checkOut) return acc;
            // approximate days
            const s = parseISO(b.checkIn);
            const e = parseISO(b.checkOut);
            const days = (e - s) / (1000 * 60 * 60 * 24);
            return acc + days;
        }, 0);

        return { totalRevenue, totalExpenses, profit, occupancy };
    }, [bookings, expenses]);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ width: '40px', height: '40px', border: '4px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                <p style={{ color: 'var(--color-text-muted)' }}>Sincronizando con la nube...</p>
                <style>{`
                    @keyframes spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                `}</style>
            </div>
        );
    }

    const StatCard = ({ title, value, icon: Icon, color, subtext }) => (
        <Card className="hover:translate-y-[-2px] transition-transform">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', fontWeight: 500 }}>{title}</span>
                <div style={{
                    backgroundColor: `${color}20`, // 20% opacity
                    color: color,
                    padding: '0.5rem',
                    borderRadius: '0.5rem'
                }}>
                    <Icon size={20} />
                </div>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text)' }}>
                {value}
            </div>
            {subtext && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>{subtext}</div>}
        </Card>
    );

    // Helper to avoid issues with referencing before declaration
    const parseDateHelper = (dateString) => {
        try {
            return parseISO(dateString);
        } catch (e) {
            return new Date();
        }
    };

    return (
        <div>
            <h2 style={{ marginBottom: '0.5rem' }}>Dashboard</h2>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '2rem' }}>Resumen del año {currentYear}</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                <StatCard
                    title="Ingresos Netos"
                    value={stats.totalRevenue.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    icon={TrendingUp}
                    color="#10b981"
                    subtext="Después de comisiones"
                />
                <StatCard
                    title="Gastos Totales"
                    value={stats.totalExpenses.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    icon={Wallet}
                    color="#ef4444"
                />
                <StatCard
                    title="Beneficio Neto"
                    value={stats.profit.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    icon={props => stats.profit >= 0 ? <ArrowUpRight {...props} /> : <ArrowDownRight {...props} />}
                    color={stats.profit >= 0 ? '#0ea5e9' : '#ef4444'}
                />
                <StatCard
                    title="Días Ocupados"
                    value={Math.round(stats.occupancy)}
                    icon={Calendar}
                    color="#f59e0b"
                    subtext="Total días reservados"
                />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <Card title="Próximas Reservas">
                    {(bookings || [])
                        .filter(b => b.checkIn && parseDateHelper(b.checkIn) >= new Date())
                        .sort((a, b) => parseDateHelper(a.checkIn) - parseDateHelper(b.checkIn))
                        .slice(0, 5)
                        .map(b => (
                            <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid var(--color-border)' }}>
                                <div>
                                    <div style={{ fontWeight: 500 }}>{b.guestName}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{b.checkIn} - {HOUSES.find(h => h.id === b.houseId)?.name}</div>
                                </div>
                                <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                                    {b.checkIn ? format(parseISO(b.checkIn), 'dd MMM') : '-'}
                                </div>
                            </div>
                        ))}
                    {(!bookings || bookings.filter(b => b.checkIn && parseDateHelper(b.checkIn) >= new Date()).length === 0) && <p style={{ color: 'var(--color-text-muted)' }}>No hay reservas próximas.</p>}
                </Card>
            </div>
        </div>
    );
};

export default Dashboard;
