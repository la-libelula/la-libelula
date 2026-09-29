import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Loader2, LogOut, RefreshCw, AlertTriangle } from 'lucide-react';

const PrivateRoute = ({ children }) => {
    const { session, loading, signOut } = useAuth();
    const [authStatus, setAuthStatus] = useState('checking'); // checking, unauthorized, forbidden, authorized, error

    const checkAuth = async () => {
        setAuthStatus('checking');
        try {
            const res = await fetch('/api/auth/check', {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            });
            
            if (res.status === 200) {
                setAuthStatus('authorized');
            } else if (res.status === 401) {
                await signOut();
                setAuthStatus('unauthorized');
            } else if (res.status === 403) {
                setAuthStatus('forbidden');
            } else {
                setAuthStatus('error');
            }
        } catch {
            setAuthStatus('error');
        }
    };

    useEffect(() => {
        if (loading) return;
        
        if (!session) {
            setAuthStatus('unauthorized');
            return;
        }

        checkAuth();
    }, [session, loading]);

    if (loading || authStatus === 'checking') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f8fafc', color: 'var(--color-primary)' }}>
                <Loader2 className="animate-spin" size={48} style={{ marginBottom: '1rem' }} />
                <p style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>Cargando La Libélula...</p>
            </div>
        );
    }

    if (authStatus === 'unauthorized') {
        return <Navigate to="/login" replace />;
    }

    if (authStatus === 'forbidden') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f8fafc', padding: '2rem', textAlign: 'center' }}>
                <div style={{ backgroundColor: 'white', padding: '3rem', borderRadius: '16px', boxShadow: 'var(--shadow-md)', maxWidth: '450px', width: '100%' }}>
                    <div style={{ width: '64px', height: '64px', backgroundColor: '#fee2e2', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0 auto 1.5rem auto' }}>
                        <LogOut size={32} color="#991b1b" />
                    </div>
                    <h1 style={{ fontSize: '1.5rem', color: 'var(--color-text)', marginBottom: '1rem', fontWeight: 800 }}>Acceso no autorizado</h1>
                    <p style={{ color: 'var(--color-text-muted)', marginBottom: '2rem', lineHeight: 1.5 }}>
                        Has iniciado sesión, pero tu usuario no tiene permisos para acceder a la aplicación de gestión.
                    </p>
                    <button 
                        onClick={() => signOut()}
                        style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', gap: '0.5rem' }}
                    >
                        <LogOut size={20} /> Cerrar sesión
                    </button>
                </div>
            </div>
        );
    }

    if (authStatus === 'error') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f8fafc', padding: '2rem', textAlign: 'center' }}>
                <div style={{ backgroundColor: 'white', padding: '3rem', borderRadius: '16px', boxShadow: 'var(--shadow-md)', maxWidth: '450px', width: '100%' }}>
                    <div style={{ width: '64px', height: '64px', backgroundColor: '#fef08a', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0 auto 1.5rem auto' }}>
                        <AlertTriangle size={32} color="#a16207" />
                    </div>
                    <h1 style={{ fontSize: '1.5rem', color: 'var(--color-text)', marginBottom: '1rem', fontWeight: 800 }}>Error de conexión</h1>
                    <p style={{ color: 'var(--color-text-muted)', marginBottom: '2rem', lineHeight: 1.5 }}>
                        No se ha podido verificar tu acceso. Es posible que no tengas conexión a internet o el servidor esté temporalmente inaccesible.
                    </p>
                    <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
                        <button 
                            onClick={checkAuth}
                            style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', gap: '0.5rem' }}
                        >
                            <RefreshCw size={20} /> Reintentar
                        </button>
                        <button 
                            onClick={() => signOut()}
                            style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', backgroundColor: 'white', color: 'var(--color-text)', border: '1px solid var(--color-border)', fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', gap: '0.5rem' }}
                        >
                            <LogOut size={20} /> Cerrar sesión
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return children;
};

export default PrivateRoute;
