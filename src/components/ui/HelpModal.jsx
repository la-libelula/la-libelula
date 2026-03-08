import React, { useState } from 'react';
import { X, ChevronRight, ChevronLeft, HelpCircle, LayoutDashboard, Calendar, ReceiptEuro, BarChart3, Clock } from 'lucide-react';

const HelpModal = ({ isOpen, onClose }) => {
    const [step, setStep] = useState(0);

    const tutorialSteps = [
        {
            title: "¡Bienvenido a La Libélula!",
            content: "Esta aplicación está diseñada para que gestiones tus casas rurales de la forma más sencilla posible. Vamos a ver cómo funciona cada sección.",
            icon: HelpCircle,
            color: "var(--color-primary)"
        },
        {
            title: "Dashboard (Inicio)",
            content: "Aquí tienes el resumen rápido del año: ingresos netos, gastos totales y beneficio. También verás un listado de las próximas reservas que están por llegar.",
            icon: LayoutDashboard,
            color: "#10b981"
        },
        {
            title: "Calendario de Reservas",
            content: "Es el corazón de la app. Puedes ver la ocupación por días. Las reservas se muestran como barras continuas. Pulsa en cualquier día para ver el detalle o añadir una nueva reserva.",
            icon: Calendar,
            color: "#0ea5e9"
        },
        {
            title: "Gestión de Gastos",
            content: "Anota aquí cualquier gasto de mantenimiento, luz, limpieza, etc. Selecciona la casa correspondiente para que luego las estadísticas sean exactas.",
            icon: ReceiptEuro,
            color: "#ef4444"
        },
        {
            title: "Estadísticas Visuales",
            content: "Compara este año con los anteriores. Hemos añadido una gráfica interactiva para que veas la evolución mes a mes. ¡Pasa el dedo por los puntos de la gráfica para ver los detalles!",
            icon: BarChart3,
            color: "#f59e0b"
        },
        {
            title: "Histórico Completo",
            content: "Todas tus reservas pasadas ordenadas por meses (de Enero a Diciembre). Ideal para consultar datos de clientes de temporadas anteriores.",
            icon: Clock,
            color: "var(--color-secondary)"
        }
    ];

    if (!isOpen) return null;

    const currentStep = tutorialSteps[step];

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
            zIndex: 1000,
            padding: '1rem',
            backdropFilter: 'blur(4px)'
        }} onClick={onClose}>
            <div style={{
                backgroundColor: 'white',
                width: '100%',
                maxHeight: '90vh',
                maxWidth: '450px',
                borderRadius: '24px',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                overflow: 'hidden'
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{
                    padding: '1.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid #f0f0f0'
                }}>
                    <h2 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--color-primary)' }}>Ayuda</h2>
                    <button onClick={onClose} style={{ background: '#f5f5f5', border: 'none', borderRadius: '50%', padding: '8px', cursor: 'pointer', display: 'flex' }}>
                        <X size={20} color="#666" />
                    </button>
                </div>

                {/* Content */}
                <div style={{ padding: '2rem 1.5rem', textAlign: 'center', flex: 1, overflowY: 'auto' }}>
                    <div style={{
                        width: '80px',
                        height: '80px',
                        backgroundColor: `${currentStep.color}15`,
                        borderRadius: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 1.5rem',
                        color: currentStep.color
                    }}>
                        <currentStep.icon size={40} />
                    </div>

                    <h3 style={{ fontSize: '1.4rem', marginBottom: '1rem', color: '#1a1a1a' }}>{currentStep.title}</h3>
                    <p style={{ lineHeight: '1.6', color: '#666', fontSize: '1.05rem', margin: 0 }}>
                        {currentStep.content}
                    </p>
                </div>

                {/* Footer / Navigation */}
                <div style={{ padding: '1.5rem', borderTop: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fafafa' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        {tutorialSteps.map((_, i) => (
                            <div
                                key={i}
                                style={{
                                    width: i === step ? '20px' : '8px',
                                    height: '8px',
                                    borderRadius: '4px',
                                    backgroundColor: i === step ? 'var(--color-primary)' : '#ddd',
                                    transition: 'all 0.3s ease'
                                }}
                            />
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        {step > 0 && (
                            <button
                                onClick={() => setStep(step - 1)}
                                style={{
                                    padding: '0.75rem',
                                    borderRadius: '50%',
                                    border: '1px solid #ddd',
                                    background: 'white',
                                    cursor: 'pointer',
                                    display: 'flex'
                                }}
                            >
                                <ChevronLeft size={20} />
                            </button>
                        )}

                        <button
                            onClick={() => step < tutorialSteps.length - 1 ? setStep(step + 1) : onClose()}
                            style={{
                                padding: '0.75rem 1.5rem',
                                borderRadius: '12px',
                                border: 'none',
                                background: 'var(--color-primary)',
                                color: 'white',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: '0 4px 12px rgba(46, 90, 53, 0.2)'
                            }}
                        >
                            {step < tutorialSteps.length - 1 ? (
                                <>Siguiente <ChevronRight size={18} /></>
                            ) : (
                                "¡Entendido!"
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HelpModal;
