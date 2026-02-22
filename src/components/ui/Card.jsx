import React from 'react';

const Card = ({ children, className = '', title, action }) => {
    // Using .card class from index.css
    return (
        <div className={`card ${className}`} style={{ marginBottom: '1rem' }}>
            {(title || action) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    {title && <h3 style={{ margin: 0 }}>{title}</h3>}
                    {action && <div>{action}</div>}
                </div>
            )}
            {children}
        </div>
    );
};

export default Card;
