import React from 'react';
import { Loader2 } from 'lucide-react';

const Button = ({
    children,
    variant = 'primary', // primary, secondary, danger, ghost
    size = 'md', // sm, md, lg
    isLoading = false,
    icon: Icon,
    className = '',
    ...props
}) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';

    // We use vanilla CSS classes defined in index.css
    // Variants: primary, secondary, premium, etc.

    // Let's use vanilla CSS classes defined in a module or just inline styles for simplicity here,
    // or better yet, define utility classes in index.css.
    // Actually, I put .btn, .btn-primary, .btn-secondary in index.css. Let's use those.

    let btnClass = 'btn';
    if (variant === 'primary') btnClass += ' btn-primary';
    else if (variant === 'secondary') btnClass += ' btn-secondary';
    else if (variant === 'premium') btnClass += ' btn-premium';
    else if (variant === 'danger') btnClass += ' btn-danger';
    else if (variant === 'ghost') btnClass += ' btn-ghost';

    // Handling sizes manually for now via inline style or additional classes
    const sizeStyles = {
        sm: { padding: '0.25rem 0.5rem', fontSize: '0.875rem' },
        md: { padding: '0.5rem 1rem', fontSize: '1rem' },
        lg: { padding: '0.75rem 1.5rem', fontSize: '1.125rem' }
    };

    return (
        <button
            className={`${btnClass} ${className}`}
            style={{ ...sizeStyles[size] }}
            disabled={isLoading || props.disabled}
            {...props}
        >
            {isLoading && <Loader2 className="animate-spin" size={16} style={{ marginRight: '0.5rem' }} />}
            {!isLoading && Icon && <Icon size={18} style={{ marginRight: children ? '0.5rem' : 0 }} />}
            {children}
        </button>
    );
};

export default Button;
