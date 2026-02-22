import React from 'react';

const Select = ({ label, error, options = [], className = '', ...props }) => {
    return (
        <div className={`form-group ${className}`} style={{ marginBottom: '1rem' }}>
            {label && (
                <label
                    style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--color-text)' }}
                >
                    {label}
                </label>
            )}
            <select
                style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${error ? '#ef4444' : 'var(--color-border)'}`,
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-text)',
                    fontSize: '1rem',
                    outline: 'none',
                    cursor: 'pointer'
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--color-primary)'}
                onBlur={(e) => e.target.style.borderColor = error ? '#ef4444' : 'var(--color-border)'}
                {...props}
            >
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
            {error && (
                <p style={{ marginTop: '0.25rem', fontSize: '0.875rem', color: '#ef4444' }}>
                    {error}
                </p>
            )}
        </div>
    );
};

export default Select;
