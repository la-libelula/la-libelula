import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';
import { Home, LogIn, UserPlus, AlertCircle } from 'lucide-react';

const Auth = () => {
    console.log("Auth: Rendering page");
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const { signIn } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            await signIn(email, password);
        } catch (err) {
            console.error("Auth: Error during authentication:", err);
            setError(err.message || 'Error técnico: ' + JSON.stringify(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--color-background)',
            padding: '1rem',
            backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(46, 90, 53, 0.05) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(160, 82, 45, 0.05) 0%, transparent 40%)'
        }}>
            <Card style={{ maxWidth: '420px', width: '100%', padding: '2.5rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-premium)' }} className="glass">
                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                    <div style={{
                        width: '72px',
                        height: '72px',
                        background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%)',
                        borderRadius: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        margin: '0 auto 1.25rem',
                        boxShadow: 'var(--shadow-lg)'
                    }}>
                        <img src="/logo192.png" alt="La Libélula" style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
                    </div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem', letterSpacing: '-0.04em' }}>La Libélula</h1>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <div style={{ height: '1px', width: '20px', backgroundColor: 'var(--color-accent)' }}></div>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.2em' }}>Premium Estate</span>
                        <div style={{ height: '1px', width: '20px', backgroundColor: 'var(--color-accent)' }}></div>
                    </div>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.95rem', fontWeight: 500 }}>
                        {isLogin ? 'Gestión rural' : 'Comienza tu experiencia'}
                    </p>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <Input
                        label="Correo electrónico"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="tu@email.com"
                        required
                    />
                    <Input
                        label="Contraseña"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                    />

                    {error && (
                        <div style={{
                            padding: '0.75rem',
                            backgroundColor: error.startsWith('success') ? 'rgba(46, 90, 53, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            borderRadius: 'var(--radius-md)',
                            color: error.startsWith('success') ? 'var(--color-primary)' : '#b91c1c',
                            fontSize: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}>
                            <AlertCircle size={16} />
                            <span>{error.replace('success:', '')}</span>
                        </div>
                    )}

                    <Button
                        type="submit"
                        isLoading={loading}
                        icon={LogIn}
                        style={{ width: '100%', marginTop: '0.5rem' }}
                    >
                        Entrar
                    </Button>
                </form>
            </Card>
        </div>
    );
};

export default Auth;
