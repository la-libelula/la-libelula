import React, { useState } from 'react';
import { Lock, X } from 'lucide-react';

const PinModal = ({ isOpen, onClose, onSuccess }) => {
    const [pin, setPin] = useState('');
    const [error, setError] = useState(false);
    const CORRECT_PIN = '3232'; // Tu nuevo PIN solicitado

    const handleSubmit = (e) => {
        e.preventDefault();
        if (pin === CORRECT_PIN) {
            onSuccess();
            setPin('');
            setError(false);
        } else {
            setError(true);
            setPin('');
            setTimeout(() => setError(false), 2000);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            backdropFilter: 'blur(4px)'
        }}>
            <div style={{
                backgroundColor: 'white',
                padding: '2.5rem',
                borderRadius: 'var(--radius-lg)',
                width: '100%',
                maxWidth: '400px',
                textAlign: 'center',
                boxShadow: 'var(--shadow-lg)',
                position: 'relative'
            }}>
                <button 
                    onClick={onClose}
                    style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}
                >
                    <X size={20} />
                </button>

                <div style={{ 
                    backgroundColor: 'rgba(46, 90, 53, 0.1)', 
                    width: '64px', 
                    height: '64px', 
                    borderRadius: '50%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    margin: '0 auto 1.5rem',
                    color: 'var(--color-primary)'
                }}>
                    <Lock size={32} />
                </div>

                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-primary)', marginBottom: '0.5rem' }}>Acceso Restringido</h2>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>Introduce el PIN de 4 dígitos para gestionar tarifas y bloqueos.</p>

                <form onSubmit={handleSubmit}>
                    <input
                        type="password"
                        maxLength="4"
                        pattern="\d*"
                        inputMode="numeric"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        autoFocus
                        style={{
                            width: '180px',
                            height: '60px',
                            fontSize: '2rem',
                            textAlign: 'center',
                            letterSpacing: '0.5em',
                            borderRadius: 'var(--radius-md)',
                            border: `2px solid ${error ? '#ef4444' : 'var(--color-border)'}`,
                            backgroundColor: 'white',
                            color: 'var(--color-text)',
                            marginBottom: '1rem',
                            outline: 'none',
                            transition: 'all 0.2s',
                            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)'
                        }}
                    />
                    
                    {error && (
                        <p style={{ color: '#ef4444', fontWeight: 600, fontSize: '0.85rem', marginBottom: '1rem' }}>PIN incorrecto, inténtalo de nuevo.</p>
                    )}

                    <button
                        type="submit"
                        style={{
                            width: '100%',
                            padding: '1rem',
                            backgroundColor: 'var(--color-primary)',
                            color: 'white',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontSize: '1rem'
                        }}
                    >
                        Entrar a Configuración
                    </button>
                </form>
            </div>
        </div>
    );
};

export default PinModal;
