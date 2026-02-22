import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, ReceiptEuro, BarChart3, Home, Clock, Menu, X as CloseIcon } from 'lucide-react';

const Layout = () => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const navItems = [
        { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/bookings', icon: CalendarDays, label: 'Reservas' },
        { to: '/expenses', icon: ReceiptEuro, label: 'Gastos' },
        { to: '/stats', icon: BarChart3, label: 'Estadísticas' },
        { to: '/history', icon: Clock, label: 'Histórico' },
    ];

    const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

    return (
        <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--color-background)', flexDirection: 'column' }}>
            {/* Mobile Header */}
            <header style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                backgroundColor: 'var(--color-surface)',
                borderBottom: '1px solid var(--color-border)',
                position: 'sticky',
                top: 0,
                zIndex: 20,
                height: '60px'
            }} className="mobile-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '32px', height: '32px', backgroundColor: 'var(--color-primary)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                        <Home size={18} />
                    </div>
                    <span style={{ fontSize: '1.1rem', fontFamily: 'var(--font-serif)', fontWeight: 700, color: 'var(--color-primary)' }}>La Libélula</span>
                </div>
                <button
                    onClick={toggleMobileMenu}
                    style={{ background: 'none', border: 'none', color: 'var(--color-primary)', display: 'flex', alignItems: 'center' }}
                >
                    {isMobileMenuOpen ? <CloseIcon size={24} /> : <Menu size={24} />}
                </button>
            </header>

            <div style={{ display: 'flex', flex: 1, position: 'relative' }}>
                {/* Sidebar */}
                <aside
                    style={{
                        width: '250px',
                        backgroundColor: 'var(--color-surface)',
                        borderRight: '1px solid var(--color-border)',
                        display: 'flex',
                        flexDirection: 'column',
                        position: 'fixed',
                        height: 'calc(100vh - 60px)',
                        left: 0,
                        top: '60px',
                        zIndex: 15,
                        overflowY: 'auto',
                        transition: 'transform 0.3s ease',
                        transform: isMobileMenuOpen ? 'translateX(0)' : 'translateX(-100%)',
                        boxShadow: isMobileMenuOpen ? 'var(--shadow-lg)' : 'none',
                        paddingBottom: '80px' // Clearance for mobile bars
                    }}
                    className="sidebar"
                >
                    <nav style={{ flex: 1, padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        {navItems.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                onClick={() => setIsMobileMenuOpen(false)}
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
                                    transition: 'all 0.2s',
                                    fontSize: '0.95rem'
                                })}
                            >
                                <item.icon size={20} />
                                {item.label}
                            </NavLink>
                        ))}
                    </nav>

                    <div style={{ padding: '1rem', borderTop: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.7rem', textAlign: 'center' }}>
                        <p>© 2026</p>
                    </div>
                </aside>

                {/* Sidebar Overlay */}
                {isMobileMenuOpen && (
                    <div
                        onClick={() => setIsMobileMenuOpen(false)}
                        style={{
                            position: 'fixed',
                            top: '60px',
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: 'rgba(0,0,0,0.3)',
                            zIndex: 14
                        }}
                    />
                )}

                {/* Desktop and Main Sidebar - Overridden by media query in CSS */}
                <aside
                    className="sidebar-desktop"
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
                >
                    <div style={{ padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', borderBottom: '1px solid var(--color-border)', marginBottom: '1rem' }}>
                        <div style={{ width: '48px', height: '48px', backgroundColor: 'var(--color-primary)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: 'var(--shadow-md)' }}>
                            <Home size={28} />
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <h1 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-serif)', fontWeight: 700, margin: 0, color: 'var(--color-primary)' }}>La Libélula</h1>
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
                        <p>© 2026 v1.0</p>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="main-content" style={{
                    flex: 1,
                    marginLeft: '250px',
                    padding: '2rem',
                    maxWidth: '100%',
                    minHeight: '100vh'
                }}>
                    <div className="container">
                        <Outlet />
                    </div>
                </main>
            </div>

            <style>{`
                @media (max-width: 768px) {
                    .mobile-header { display: flex !important; }
                    .sidebar-desktop { display: none !important; }
                    .main-content { margin-left: 0 !important; padding: 1rem !important; }
                    .sidebar { display: flex !important; }
                }
                @media (min-width: 769px) {
                    .mobile-header { display: none !important; }
                    .sidebar-desktop { display: flex !important; }
                    .sidebar { display: none !important; }
                }
            `}</style>
        </div>
    );
};

export default Layout;
