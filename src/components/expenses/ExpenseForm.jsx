import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { HOUSES, EXPENSE_CATEGORIES } from '../../utils/constants';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { Save, X } from 'lucide-react';

const ExpenseForm = ({ onClose, initialData = null }) => {
    const { addExpense, updateExpense, deleteExpense } = useApp();

    const [formData, setFormData] = useState({
        date: initialData?.date || new Date().toISOString().split('T')[0],
        houseId: initialData?.houseId || HOUSES[0].id,
        categoryId: initialData?.categoryId || EXPENSE_CATEGORIES[0].id,
        amount: initialData?.amount || '',
        description: initialData?.description || ''
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleDelete = () => {
        if (window.confirm('¿Realmente quieres eliminar este gasto?')) {
            deleteExpense(initialData.id);
            onClose();
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.amount || !formData.date) {
            alert('Por favor completa los campos obligatorios');
            return;
        }

        if (initialData) {
            updateExpense(initialData.id, formData);
        } else {
            addExpense(formData);
        }
        onClose();
    };

    return (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Input
                    label="Fecha"
                    type="date"
                    name="date"
                    value={formData.date}
                    onChange={handleChange}
                    required
                />
                <Select
                    label="Casa"
                    name="houseId"
                    value={formData.houseId}
                    onChange={handleChange}
                    options={HOUSES.map(h => ({ value: h.id, label: h.name }))}
                />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Select
                    label="Categoría"
                    name="categoryId"
                    value={formData.categoryId}
                    onChange={handleChange}
                    options={EXPENSE_CATEGORIES.map(c => ({ value: c.id, label: c.name }))}
                />
                <Input
                    label="Importe (€)"
                    type="number"
                    name="amount"
                    value={formData.amount}
                    onChange={handleChange}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    required
                />
            </div>

            <Input
                label="Descripción (Opcional)"
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Detalles adicionales..."
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                {initialData && (
                    <Button type="button" variant="danger" onClick={handleDelete} style={{ marginRight: 'auto', backgroundColor: '#ef4444', color: 'white' }}>
                        Eliminar
                    </Button>
                )}
                <Button type="button" variant="secondary" onClick={onClose}>
                    Cancelar
                </Button>
                <Button type="submit" icon={Save}>
                    {initialData ? 'Actualizar' : 'Guardar Gasto'}
                </Button>
            </div>
        </form>
    );
};

export default ExpenseForm;
