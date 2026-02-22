import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, ReceiptEuro, BarChart3, Home, Clock } from 'lucide-react';

const Layout = () => {
    const navItems = [
        { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/bookings', icon: CalendarDays, label: 'Reservas' },
        { to: '/expenses', icon: ReceiptEuro, label: 'Gastos' },
        { to: '/stats', icon: BarChart3, label: 'Estadísticas' },
        { to: '/history', icon: Clock, label: 'Histórico' },
    ];

    return (
        <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--color-background)' }}>
            {/* Sidebar - Desktop */}
            <aside
                style={{
                    width: '250px',
                    backgroundColor: 'var(--color-surface)',
                    borderRight: '1px solid var(--color-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'fixed',
                    height: '100vh',
                    left: 0,
                    top: 0,
                    zIndex: 10
                }}
                className="sidebar"
            >
                <div style={{ padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', borderBottom: '1px solid var(--color-border)', marginBottom: '1rem' }}>
                    <div style={{ width: '48px', height: '48px', backgroundColor: 'var(--color-primary)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: 'var(--shadow-md)' }}>
                        <Home size={28} />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <h1 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-serif)', fontWeight: 700, margin: 0, color: 'var(--color-primary)' }}>La Libélula</h1>
                        <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Gestivo Rural</span>
                    </div>
                </div>

                <nav style={{ flex: 1, padding: '0 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) =>
                                isActive ? 'nav-item active' : 'nav-item'
                            }
                            style={({ isActive }) => ({
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                padding: '0.75rem 1rem',
                                borderRadius: 'var(--radius-md)',
                                color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                                backgroundColor: isActive ? 'var(--color-background)' : 'transparent',
                                fontWeight: isActive ? 600 : 500,
                                textDecoration: 'none',
                                transition: 'all 0.2s'
                            })}
                        >
                            <item.icon size={20} />
                            {item.label}
                        </NavLink>
                    ))}
                </nav>

                <div style={{ padding: '1.5rem', borderTop: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.75rem', textAlign: 'center' }}>
                    <p>© 2026 Gestión Rural v1.0</p>
                </div>
            </aside>

            {/* Main Content */}
            <main style={{
                flex: 1,
                marginLeft: '250px', // Matches sidebar width
                padding: '2rem',
                maxWidth: '100%',
                minHeight: '100vh'
            }}>
                <div className="container">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default Layout;
