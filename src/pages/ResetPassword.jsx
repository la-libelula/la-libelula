import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Loader2, CheckCircle2 } from 'lucide-react';

const ResetPassword = () => {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [errorMsg, setErrorMsg] = useState(null);
    const [successMsg, setSuccessMsg] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { updatePassword, session, signOut } = useAuth();
    const navigate = useNavigate();

    // The user lands here with a hash like #access_token=...&type=recovery
    // Supabase automatically detects it and sets a temporary session.
    // If there's no session, the link is invalid or expired.
    
    // We check for the session to render either the form or an error message.
    const hasSession = !!session;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg(null);
        
        if (newPassword !== confirmPassword) {
            setErrorMsg('Las contraseñas no coinciden.');
            return;
        }

        if (newPassword.length < 6) {
            setErrorMsg('La contraseña debe tener al menos 6 caracteres.');
            return;
        }

        setIsLoading(true);

        try {
            await updatePassword(newPassword);
            setSuccessMsg(true);
            // Sign out the temporary recovery session so they can login properly
            await signOut();
        } catch (err) {
            setErrorMsg('Se ha producido un error al intentar cambiar la contraseña.');
        } finally {
            setIsLoading(false);
        }
    };

    if (!hasSession && !successMsg) {
        return (
            <div style={{ maxWidth: '400px', margin: '4rem auto', padding: '2rem', backgroundColor: 'white', borderRadius: '12px', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', textAlign: 'center' }}>
                <div style={{ color: '#991b1b', marginBottom: '1rem' }}>
                    <KeyRound size={40} style={{ margin: '0 auto' }} />
                </div>
                <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--color-text)' }}>Enlace no válido</h1>
                <p style={{ color: 'var(--color-text-muted)', marginBottom: '2rem' }}>
                    El enlace de recuperación no es válido o ha caducado.
                </p>
                <button 
                    onClick={() => navigate('/login')}
                    style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer', width: '100%' }}
                >
                    Volver a iniciar sesión
                </button>
            </div>
        );
    }

    if (successMsg) {
        return (
            <div style={{ maxWidth: '400px', margin: '4rem auto', padding: '2rem', backgroundColor: 'white', borderRadius: '12px', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', textAlign: 'center' }}>
                <div style={{ color: '#166534', marginBottom: '1rem' }}>
                    <CheckCircle2 size={40} style={{ margin: '0 auto' }} />
                </div>
                <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--color-text)' }}>¡Contraseña actualizada!</h1>
                <p style={{ color: 'var(--color-text-muted)', marginBottom: '2rem' }}>
                    Contraseña actualizada correctamente.
                </p>
                <button 
                    onClick={() => navigate('/login')}
                    style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer', width: '100%' }}
                >
                    Ir a iniciar sesión
                </button>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '400px', margin: '4rem auto', padding: '2rem', backgroundColor: 'white', borderRadius: '12px', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem', color: 'var(--color-primary)' }}>
                <KeyRound size={40} />
            </div>
            <h1 style={{ textAlign: 'center', fontSize: '1.5rem', marginBottom: '2rem', color: 'var(--color-text)' }}>Restablecer Contraseña</h1>
            
            {errorMsg && (
                <div style={{ padding: '0.75rem', marginBottom: '1.5rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '8px', fontSize: '0.9rem', textAlign: 'center' }}>
                    {errorMsg}
                </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--color-text)' }}>Nueva Contraseña</label>
                    <input 
                        type="password" 
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        minLength={6}
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}
                    />
                </div>
                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--color-text)' }}>Repetir Contraseña</label>
                    <input 
                        type="password" 
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={6}
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}
                    />
                </div>
                
                <button 
                    type="submit" 
                    disabled={isLoading}
                    style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '8px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none', fontWeight: 600, cursor: isLoading ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                >
                    {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Guardar nueva contraseña'}
                </button>
            </form>
        </div>
    );
};

export default ResetPassword;
