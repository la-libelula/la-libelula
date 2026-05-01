import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, ReceiptEuro, BarChart3, Home, Clock, Menu, X as CloseIcon, LogOut, User, ShieldCheck, HelpCircle, Bell, BellOff, Link as LinkIcon, CheckCircle2 } from 'lucide-react';
import HelpModal from '../ui/HelpModal.jsx';
import PinModal from '../ui/PinModal.jsx';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';

const Layout = () => {
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [isPinModalOpen, setIsPinModalOpen] = useState(false);
    const [showCopyToast, setShowCopyToast] = useState(false);
    const { visualNotification, setVisualNotification, isSettingsAuthorized, setIsSettingsAuthorized } = useApp();
    const navigate = useNavigate();

    const [copiedHouse, setCopiedHouse] = useState('');

    const handleCopyLink = (house) => {
        const url = `https://la-libelula-seven.vercel.app/reservas/index.html?casa=${house}`;
        navigator.clipboard.writeText(url);
        setCopiedHouse(house === 'gredos' ? 'Gredos' : 'Valles');
        setShowCopyToast(true);
        setTimeout(() => setShowCopyToast(false), 2500);
    };

    const navItems = [
        { to: '/', icon: LayoutDashboard, label: 'Panel' },
        { to: '/bookings', icon: CalendarDays, label: 'Reservas' },
        { to: '/expenses', icon: ReceiptEuro, label: 'Gastos' },
        { to: '/stats', icon: BarChart3, label: 'Stats' },
        { to: '/history', icon: Clock, label: 'Historial' },
        { to: '/settings', icon: ShieldCheck, label: 'Precios' },
    ];

    return (
        <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--color-background)', flexDirection: 'column' }}>
            <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
            <PinModal 
                isOpen={isPinModalOpen} 
                onClose={() => setIsPinModalOpen(false)} 
                onSuccess={() => {
                    setIsPinModalOpen(false);
                    setIsSettingsAuthorized(true);
                    navigate('/settings');
                }} 
            />

            {/* Visual Notification Toast */}
            {visualNotification && (
                <div style={{
                    position: 'fixed',
                    top: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 1000,
                    backgroundColor: 'var(--color-primary)',
                    color: 'white',
                    padding: '1rem 1.5rem',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    minWidth: '300px',
                    border: '2px solid white',
                    animation: 'slideDown 0.5s ease'
                }}>
                    <div style={{ backgroundColor: 'white', color: 'var(--color-primary)', borderRadius: '50%', padding: '8px' }}>
                        <Bell className="animate-bounce" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: '1rem' }}>¡NUEVA RESERVA WEB!</div>
                        <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>{visualNotification.guest_name}</div>
                    </div>
                    <button 
                        onClick={() => setVisualNotification(null)}
                        style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}
                    >
                        <CloseIcon size={20} />
                    </button>
                    <style>{`
                        @keyframes slideDown {
                            from { transform: translate(-50%, -100%); opacity: 0; }
                            to { transform: translate(-50%, 0); opacity: 1; }
                        }
                        @keyframes fadeIn {
                            from { opacity: 0; transform: translate(-50%, 20px); }
                            to { opacity: 1; transform: translate(-50%, 0); }
                        }
                    `}</style>
                </div>
            )}

            {/* Link Copied Toast */}
            {showCopyToast && (
                <div style={{
                    position: 'fixed',
                    bottom: '90px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 2000,
                    backgroundColor: '#1e3a24',
                    color: 'white',
                    padding: '0.75rem 1.25rem',
                    borderRadius: '50px',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    border: '1px solid rgba(255,255,255,0.2)',
                    animation: 'fadeIn 0.3s ease-out'
                }}>
                    <CheckCircle2 size={18} color="#4ade80" />
                    Enlace de <strong>{copiedHouse}</strong> copiado
                </div>
            )}

            {/* Mobile Header (Simplified) */}
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
                        <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-primary)', letterSpacing: '-0.03em', display: 'block', lineHeight: 1 }}>La Libélula</span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {/* Link Valles */}
                    <button
                        onClick={() => handleCopyLink('valles')}
                        style={{
                            background: 'rgba(46, 90, 53, 0.08)',
                            border: '1px solid rgba(46, 90, 53, 0.2)',
                            color: 'var(--color-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            cursor: 'pointer',
                            position: 'relative'
                        }}
                        title="Copiar link La Libélula Valles"
                    >
                        <LinkIcon size={20} />
                        <span style={{ position: 'absolute', bottom: '-2px', right: '-2px', background: 'var(--color-secondary)', color: 'white', fontSize: '10px', width: '16px', height: '16px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>V</span>
                    </button>

                    {/* Link Gredos */}
                    <button
                        onClick={() => handleCopyLink('gredos')}
                        style={{
                            background: 'rgba(46, 90, 53, 0.08)',
                            border: '1px solid rgba(46, 90, 53, 0.2)',
                            color: 'var(--color-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            cursor: 'pointer',
                            position: 'relative'
                        }}
                        title="Copiar link La Libélula Gredos"
                    >
                        <LinkIcon size={20} />
                        <span style={{ position: 'absolute', bottom: '-2px', right: '-2px', background: 'var(--color-primary)', color: 'white', fontSize: '10px', width: '16px', height: '16px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>G</span>
                    </button>
                    <button
                        onClick={() => setIsHelpOpen(true)}
                        style={{
                            background: 'rgba(46, 90, 53, 0.08)',
                            border: '1px solid rgba(46, 90, 53, 0.2)',
                            color: 'var(--color-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '8px',
                            borderRadius: '50%',
                            cursor: 'pointer'
                        }}
                    >
                        <HelpCircle size={22} />
                    </button>
                </div>
            </header>

            <div style={{ display: 'flex', flex: 1, position: 'relative' }}>
                {/* Desktop Sidebar (Left) */}
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
                            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: 'var(--color-primary)', letterSpacing: '-0.04em' }}>La Libélula</h1>
                            <p style={{ fontSize: '0.7rem', color: 'var(--color-accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', margin: 0 }}>Gestión Pro</p>
                        </div>
                    </div>
                    <nav style={{ flex: 1, padding: '0 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {navItems.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                onClick={(e) => {
                                    if (item.to === '/settings' && !isSettingsAuthorized) {
                                        e.preventDefault();
                                        setIsPinModalOpen(true);
                                    }
                                }}
                                className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
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

                    <div style={{ padding: '1rem', borderTop: '1px solid var(--color-border-light)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <button
                            onClick={() => handleCopyLink('gredos')}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                padding: '0.85rem 1rem',
                                borderRadius: 'var(--radius-md)',
                                background: 'white',
                                border: '1px solid var(--color-border)',
                                color: 'var(--color-text)',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                fontSize: '0.9rem',
                                width: '100%'
                            }}
                            className="sidebar-copy-btn"
                        >
                            <LinkIcon size={18} color="var(--color-primary)" />
                            <span>Link Gredos</span>
                        </button>

                        <button
                            onClick={() => handleCopyLink('valles')}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                padding: '0.85rem 1rem',
                                borderRadius: 'var(--radius-md)',
                                background: 'white',
                                border: '1px solid var(--color-border)',
                                color: 'var(--color-text)',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                fontSize: '0.9rem',
                                width: '100%'
                            }}
                            className="sidebar-copy-btn"
                        >
                            <LinkIcon size={18} color="var(--color-secondary)" />
                            <span>Link Valles</span>
                        </button>

                        <button
                            onClick={() => setIsHelpOpen(true)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                padding: '0.85rem 1rem',
                                borderRadius: 'var(--radius-md)',
                                background: 'var(--color-primary)',
                                border: 'none',
                                color: 'white',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                fontSize: '0.9rem',
                                fontWeight: 600,
                                width: '100%',
                                boxShadow: '0 4px 12px rgba(46, 90, 53, 0.2)'
                            }}
                        >
                            <HelpCircle size={18} />
                            <span>Ayuda y Soporte</span>
                        </button>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', textAlign: 'center', opacity: 0.6 }}>© 2026 La Libélula</p>
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

            {/* Mobile Bottom Navigation Bar */}
            <nav className="mobile-bottom-nav" style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                height: '70px',
                backgroundColor: 'var(--color-surface)',
                borderTop: '1px solid var(--color-border)',
                display: 'none', // Overridden by media query
                justifyContent: 'space-around',
                alignItems: 'center',
                zIndex: 100,
                paddingBottom: 'env(safe-area-inset-bottom)',
                paddingLeft: '5px',
                paddingRight: '5px',
                boxShadow: '0 -4px 20px rgba(0,0,0,0.05)'
            }}>
                {navItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={(e) => {
                            if (item.to === '/settings' && !isSettingsAuthorized) {
                                e.preventDefault();
                                setIsPinModalOpen(true);
                            }
                        }}
                        style={({ isActive }) => ({
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            textDecoration: 'none',
                            color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                            flex: 1,
                            height: '100%',
                            transition: 'all 0.2s'
                        })}
                    >
                        {({ isActive }) => (
                            <>
                                <div style={{
                                    padding: '4px 12px',
                                    borderRadius: '16px',
                                    backgroundColor: isActive ? 'rgba(46, 90, 53, 0.1)' : 'transparent',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s'
                                }}>
                                    <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                                </div>
                                <span style={{ fontSize: '0.65rem', fontWeight: isActive ? 700 : 500 }}>{item.label}</span>
                            </>
                        )}
                    </NavLink>
                ))}
            </nav>

            <style>{`
                @media (max-width: 768px) {
                    .mobile-header { display: flex !important; }
                    .sidebar-desktop { display: none !important; }
                    .main-content { margin-left: 0 !important; padding: 1rem 0.5rem 80px 0.5rem !important; }
                    .mobile-bottom-nav { display: flex !important; }
                }
                @media (min-width: 769px) {
                    .mobile-header { display: none !important; }
                    .sidebar-desktop { display: flex !important; }
                    .mobile-bottom-nav { display: none !important; }
                }
            `}</style>
        </div>
    );
};

export default Layout;
