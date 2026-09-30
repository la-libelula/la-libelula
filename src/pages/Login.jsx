import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Lock, Loader2 } from 'lucide-react';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errorMsg, setErrorMsg] = useState(null);
    const [resetMsg, setResetMsg] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const { signIn, session, loading, resetPassword } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (!loading && session) {
            navigate('/');
        }
    }, [session, loading, navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg(null);
        setResetMsg(null);
        setIsLoading(true);

        try {
            await signIn(email, password);
            navigate('/');
        } catch (err) {
            setErrorMsg('Error de autenticación. Verifica tus credenciales.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleResetPassword = async () => {
        if (!email) {
            setErrorMsg('Por favor, introduce tu email para recuperar la contraseña.');
            return;
        }
        
        setErrorMsg(null);
        setResetMsg(null);
        setIsResetting(true);
        
        try {
            await resetPassword(email);
            setResetMsg('Si existe una cuenta asociada a ese correo, recibirás un enlace para restablecer la contraseña.');
        } catch (err) {
            setErrorMsg('Se ha producido un error al intentar solicitar la recuperación.');
        } finally {
            setIsResetting(false);
        }
    };

    return (
        <div style={{ maxWidth: '400px', margin: '4rem auto', padding: '2rem', backgroundColor: 'white', borderRadius: '12px', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem', color: 'var(--color-primary)' }}>
                <Lock size={40} />
            </div>
            <h1 style={{ textAlign: 'center', fontSize: '1.5rem', marginBottom: '2rem', color: 'var(--color-text)' }}>Iniciar Sesión</h1>
            
            {errorMsg && (
                <div style={{ padding: '0.75rem', marginBottom: '1.5rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '8px', fontSize: '0.9rem', textAlign: 'center' }}>
                    {errorMsg}
                </div>
            )}
            
            {resetMsg && (
                <div style={{ padding: '0.75rem', marginBottom: '1.5rem', backgroundColor: '#e0f2fe', color: '#0369a1', borderRadius: '8px', fontSize: '0.9rem', textAlign: 'center' }}>
                    {resetMsg}
                </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--color-text)' }}>Email</label>
                    <input 
                        type="email" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}
                    />
                </div>
                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--color-text)' }}>Contraseña</label>
                    <input 
                        type="password" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}
                    />
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button 
                        type="button" 
                        onClick={handleResetPassword}
                        disabled={isResetting}
                        style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '0.85rem', cursor: isResetting ? 'not-allowed' : 'pointer', textDecoration: 'underline' }}
                    >
                        {isResetting ? 'Solicitando...' : '¿Has olvidado tu contraseña?'}
                    </button>
                </div>

                <button 
                    type="submit" 
                    disabled={isLoading}
                    style={{ marginTop: '0.5rem', padding: '0.75rem', borderRadius: '8px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none', fontWeight: 600, cursor: isLoading ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                >
                    {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Iniciar sesión'}
                </button>
            </form>
        </div>
    );
};

export default Login;
