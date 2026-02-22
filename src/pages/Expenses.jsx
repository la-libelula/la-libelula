import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import ExpenseForm from '../components/expenses/ExpenseForm';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { Plus, X, ReceiptEuro } from 'lucide-react';
import Select from '../components/ui/Select';
import { HOUSES, EXPENSE_CATEGORIES } from '../utils/constants';

const Expenses = () => {
    const { expenses, loading } = useApp();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedExpense, setSelectedExpense] = useState(null);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
    const [selectedHouse, setSelectedHouse] = useState('all');
    const [selectedCategory, setSelectedCategory] = useState('all');

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ width: '40px', height: '40px', border: '4px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                <p style={{ color: 'var(--color-text-muted)' }}>Cargando gastos...</p>
                <style>{`
                    @keyframes spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                `}</style>
            </div>
        );
    }

    // Get unique years from expenses
    const availableYears = [...new Set(expenses.map(e => new Date(e.date).getFullYear().toString()))]
        .sort((a, b) => b - a);

    // Ensure current year is always an option
    if (!availableYears.includes(new Date().getFullYear().toString())) {
        availableYears.push(new Date().getFullYear().toString());
    }

    const filteredExpenses = expenses.filter(e => {
        const expDate = new Date(e.date);
        const matchesYear = selectedYear === 'all' || expDate.getFullYear().toString() === selectedYear;
        const matchesHouse = selectedHouse === 'all' || e.houseId === selectedHouse;
        const matchesCategory = selectedCategory === 'all' || e.categoryId === selectedCategory;
        return matchesYear && matchesHouse && matchesCategory;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

    const getHouseName = (id) => {
        const house = HOUSES.find(h => h.id === id);
        return house ? house.name : id;
    };

    const getCategoryName = (id) => {
        const cat = EXPENSE_CATEGORIES.find(c => c.id === id);
        return cat ? cat.name : id;
    };

    const handleEditExpense = (expense) => {
        setSelectedExpense(expense);
        setIsFormOpen(true);
    };

    const handleCloseForm = () => {
        setIsFormOpen(false);
        setSelectedExpense(null);
    };

    return (
        <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2>Gastos</h2>
                <Button onClick={() => setIsFormOpen(true)} icon={Plus}>
                    Nuevo Gasto
                </Button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem', alignItems: 'flex-end' }}>
                <Select
                    label="Año"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    options={[
                        { value: 'all', label: 'Todos' },
                        ...availableYears.map(year => ({ value: year, label: year }))
                    ]}
                />
                <Select
                    label="Casa"
                    value={selectedHouse}
                    onChange={(e) => setSelectedHouse(e.target.value)}
                    options={[
                        { value: 'all', label: 'Todas' },
                        ...HOUSES.map(h => ({ value: h.id, label: h.name }))
                    ]}
                />
                <Select
                    label="Categoría"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    options={[
                        { value: 'all', label: 'Todas' },
                        ...EXPENSE_CATEGORIES.map(c => ({ value: c.id, label: c.name }))
                    ]}
                />
                <div style={{ minWidth: '200px' }}>
                    <Card style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', border: '1px solid var(--color-border)', backgroundColor: '#fff9f0' }}>
                        <div style={{ backgroundColor: 'rgba(139, 69, 19, 0.1)', color: '#8b4513', padding: '0.5rem', borderRadius: '8px' }}>
                            <ReceiptEuro size={20} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total Gastos</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#8b4513' }}>
                                {totalExpenses.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                            </div>
                        </div>
                    </Card>
                </div>
            </div>

            <Card>
                {filteredExpenses.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                        <p>No hay gastos que coincidan con los filtros.</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                    <th style={{ padding: '1rem', fontWeight: 600 }}>Fecha</th>
                                    <th style={{ padding: '1rem', fontWeight: 600 }}>Concepto</th>
                                    <th style={{ padding: '1rem', fontWeight: 600 }}>Casa</th>
                                    <th style={{ padding: '1rem', fontWeight: 600 }}>Categoría</th>
                                    <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>Importe</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredExpenses.map((expense) => (
                                    <tr
                                        key={expense.id}
                                        style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', transition: 'background-color 0.2s' }}
                                        onClick={() => handleEditExpense(expense)}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-background)'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        <td style={{ padding: '1rem' }}>{expense.date}</td>
                                        <td style={{ padding: '1rem' }}>{expense.description || '-'}</td>
                                        <td style={{ padding: '1rem' }}>{getHouseName(expense.houseId)}</td>
                                        <td style={{ padding: '1rem' }}>{getCategoryName(expense.categoryId)}</td>
                                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 500 }}>
                                            {parseFloat(expense.amount).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* Modal Overlay for Form */}
            {isFormOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 50
                }}>
                    <div style={{
                        backgroundColor: 'var(--color-surface)',
                        borderRadius: 'var(--radius-lg)',
                        padding: '2rem',
                        width: '100%',
                        maxWidth: '500px',
                        position: 'relative'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3>{selectedExpense ? 'Editar Gasto' : 'Nuevo Gasto'}</h3>
                            <button
                                onClick={handleCloseForm}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}
                            >
                                <X />
                            </button>
                        </div>

                        <ExpenseForm
                            onClose={handleCloseForm}
                            initialData={selectedExpense}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default Expenses;
