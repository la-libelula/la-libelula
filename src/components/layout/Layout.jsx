import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, ReceiptEuro, BarChart3, Home, Clock, Menu, X as CloseIcon, LogOut, User, ShieldCheck, HelpCircle } from 'lucide-react';
import HelpModal from '../ui/HelpModal.jsx';

const Layout = () => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isHelpOpen, setIsHelpOpen] = useState(false);

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
            <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    <div style={{
                        width: '38px',
                        height: '38px',
                        background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%)',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        boxShadow: '0 4px 12px rgba(30, 58, 36, 0.15)'
                    }}>
                        <img src="/logo_premium.png" alt="La Libélula" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
                    </div>
                    <div>
                        <span style={{
                            fontSize: '1.2rem',
                            fontWeight: 800,
                            color: 'var(--color-primary)',
                            letterSpacing: '-0.03em',
                            display: 'block',
                            lineHeight: 1
                        }}>La Libélula</span>
                        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Gestión Rural</span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <button
                        onClick={() => setIsHelpOpen(true)}
                        title="Ayuda y Tutorial"
                        style={{
                            background: 'rgba(46, 90, 53, 0.08)',
                            border: '1px solid rgba(46, 90, 53, 0.2)',
                            color: 'var(--color-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '6px',
                            borderRadius: '50%',
                            cursor: 'pointer'
                        }}
                    >
                        <HelpCircle size={22} />
                    </button>
                    <button
                        onClick={toggleMobileMenu}
                        style={{ background: 'none', border: 'none', color: 'var(--color-primary)', display: 'flex', alignItems: 'center' }}
                    >
                        {isMobileMenuOpen ? <CloseIcon size={24} /> : <Menu size={24} />}
                    </button>
                </div>
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

                    <div style={{ padding: '1rem', borderTop: '1px solid var(--color-border)' }}>
                        <button
                            onClick={() => {
                                setIsHelpOpen(true);
                                setIsMobileMenuOpen(false);
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                padding: '0.85rem 1rem',
                                border: '1px solid rgba(46, 90, 53, 0.2)',
                                background: 'rgba(46, 90, 53, 0.08)',
                                color: 'var(--color-primary)',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'pointer',
                                fontWeight: 600,
                                width: '100%',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                            }}
                        >
                            <HelpCircle size={18} />
                            Ayuda y Tutorial
                        </button>
                    </div>

                    <div style={{ padding: '1rem', color: 'var(--color-text-muted)', fontSize: '0.75rem', textAlign: 'center', borderTop: '1px solid var(--color-border)' }}>
                        <p>© 2026 La Libélula</p>
                        <p style={{ fontSize: '0.6rem', opacity: 0.5 }}>Versión v18</p>
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
                    <div style={{
                        padding: '2rem 1.5rem',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '1.25rem',
                        borderBottom: '1px solid var(--color-border-light)',
                        marginBottom: '1rem',
                        background: 'linear-gradient(to bottom, rgba(46, 90, 53, 0.02), transparent)'
                    }}>
                        <div style={{
                            width: '56px',
                            height: '56px',
                            background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%)',
                            borderRadius: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            boxShadow: 'var(--shadow-lg)'
                        }}>
                            <img src="/logo_premium.png" alt="La Libélula" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <h1 style={{
                                fontSize: '1.5rem',
                                fontWeight: 800,
                                margin: 0,
                                color: 'var(--color-primary)',
                                letterSpacing: '-0.04em'
                            }}>La Libélula</h1>
                            <p style={{ fontSize: '0.7rem', color: 'var(--color-accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', marginTop: '0.25rem' }}>Gestión Rural</p>
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

                    <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <button
                            onClick={() => setIsHelpOpen(true)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                padding: '0.85rem 1rem',
                                border: '1px solid rgba(46, 90, 53, 0.2)',
                                background: 'rgba(46, 90, 53, 0.08)',
                                color: 'var(--color-primary)',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'pointer',
                                fontWeight: 600,
                                width: '100%',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                            }}
                        >
                            <HelpCircle size={18} />
                            Ayuda y Tutorial
                        </button>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', textAlign: 'center', marginTop: '0.5rem' }}>
                            © 2026 La Libélula<br />
                            <span style={{ fontSize: '0.6rem', opacity: 0.5 }}>Versión v18</span>
                        </p>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="main-content" style={{
                    flex: 1,
                    marginLeft: '250px',
                    padding: 'var(--main-padding)',
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
                    .main-content { margin-left: 0 !important; padding: 0.5rem !important; }
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
