import React, { useState, useRef } from 'react';

const BarChart = ({ data, series, height = 300, title }) => {
    const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, content: null });
    const containerRef = useRef(null);

    if (!data || data.length === 0) return <div>No hay datos para mostrar</div>;

    const padding = { top: 40, right: 20, bottom: 40, left: 75 };
    const chartWidth = 800;
    const chartHeight = height;

    const innerWidth = chartWidth - padding.left - padding.right;
    const innerHeight = chartHeight - padding.top - padding.bottom;

    // Find max value across all series to scale Y axis
    const allValues = data.flatMap(d => series.map(s => d[s.key] || 0));
    const maxValue = Math.max(...allValues, 100); // 100 as min ceiling
    const yTickCount = 5;
    const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) => (maxValue / yTickCount) * i);

    const getY = (value) => padding.top + innerHeight - (value / maxValue) * innerHeight;

    const handleMouseMove = (e, d, index) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        
        // Basic cursor positions relative to container
        let x = e.clientX - rect.left;
        let y = e.clientY - rect.top;

        // Tooltip dimensions (approximate)
        const tooltipWidth = 160; 
        const tooltipHeight = 120; // Height without Beneficio Total

        // Prevent cutting off on the right edge (e.g. November/December)
        if (x + (tooltipWidth / 2) > rect.width) {
            x = rect.width - (tooltipWidth / 2) - 10;
        }
        // Prevent cutting off on the left edge
        if (x - (tooltipWidth / 2) < 0) {
            x = (tooltipWidth / 2) + 10;
        }

        // Prevent cutting off on the top edge (e.g. very tall bars)
        if (y - tooltipHeight < 0) {
            y = tooltipHeight + 10;
        }

        setTooltip({
            show: true,
            x: x,
            y: y - 10,
            content: (
                <div style={{
                    backgroundColor: 'white',
                    padding: '8px',
                    borderRadius: '4px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    border: '1px solid #eee',
                    fontSize: '0.8rem',
                    minWidth: '140px'
                }}>
                    <div style={{ fontWeight: 700, marginBottom: '8px', color: '#333', textAlign: 'center', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>
                        Año {d.name}
                    </div>
                    {series.map(s => {
                        const itemColor = s.colors ? s.colors[index % s.colors.length] : s.color;
                        return (
                            <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: itemColor }}></div>
                                    <span style={{ color: '#555' }}>{s.label}</span>
                                </div>
                                <strong style={{ color: itemColor }}>
                                    {d[s.key].toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                                </strong>
                            </div>
                        );
                    })}
                </div>
            )
        });
    };

    const handleMouseLeave = () => {
        setTooltip({ ...tooltip, show: false });
    };

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
            {title && <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--color-text)' }}>{title}</h3>}

            {/* Legend */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {series.map(s => (
                    <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: s.color }}></div>
                        {s.label}
                    </div>
                ))}
            </div>

            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
                {/* Y Axis Grid Lines */}
                {yTicks.map((tick, i) => {
                    const y = getY(tick);
                    return (
                        <g key={i}>
                            <line
                                x1={padding.left}
                                y1={y}
                                x2={chartWidth - padding.right}
                                y2={y}
                                stroke="var(--color-border)"
                                strokeWidth="1"
                                strokeDasharray="4,4"
                            />
                            <text
                                x={padding.left - 10}
                                y={y}
                                textAnchor="end"
                                alignmentBaseline="middle"
                                fontSize="12"
                                fill="var(--color-text-muted)"
                            >
                                {Math.round(tick).toLocaleString('es-ES')} €
                            </text>
                        </g>
                    );
                })}

                {/* Bars and X Axis */}
                {data.map((d, index) => {
                    const groupWidth = innerWidth / data.length;
                    const groupX = padding.left + (index * groupWidth);
                    // Available width for all bars in a group, minus some padding
                    const internalPadding = 20;
                    const widthPerGroup = groupWidth - internalPadding;
                    const barWidth = widthPerGroup / series.length;

                    return (
                        <g key={index} onMouseMove={(e) => handleMouseMove(e, d, index)} onMouseLeave={handleMouseLeave} style={{ cursor: 'pointer' }}>
                            {/* Hover highlight background for the whole group */}
                            <rect
                                x={groupX}
                                y={padding.top}
                                width={groupWidth}
                                height={innerHeight}
                                fill="transparent"
                                className="bar-group-hover"
                                style={{ transition: 'fill 0.2s' }}
                            />

                            {/* X Axis Label */}
                            <text
                                x={groupX + (groupWidth / 2)}
                                y={chartHeight - padding.bottom + 20}
                                textAnchor="middle"
                                fontSize="13"
                                fontWeight="600"
                                fill="var(--color-text)"
                            >
                                {d.name}
                            </text>

                            {/* Individual Bars */}
                            {series.map((s, sIdx) => {
                                const barX = groupX + (internalPadding / 2) + (sIdx * barWidth);
                                const value = d[s.key] || 0;
                                const yPos = getY(value);
                                const barHeight = (value / maxValue) * innerHeight;
                                // Para que las barras de cero no se vean raras, mínimo 1px
                                const actualBarHeight = Math.max(barHeight, 1);
                                const actualYPos = Math.min(yPos, padding.top + innerHeight - 1);
                                const barColor = s.colors ? s.colors[index % s.colors.length] : s.color;

                                return (
                                    <rect
                                        key={s.key}
                                        x={barX + 2} // Small internal gap between bars
                                        y={actualYPos}
                                        width={Math.max(barWidth - 4, 2)}
                                        height={actualBarHeight}
                                        fill={barColor}
                                        rx="3" // Rounded corners
                                        ry="3"
                                        style={{ transition: 'all 0.3s ease-out' }}
                                    />
                                );
                            })}
                        </g>
                    );
                })}
            </svg>

            <style>{`
                .bar-group-hover:hover {
                    fill: rgba(0,0,0,0.03);
                }
            `}</style>

            {/* Tooltip Overlay */}
            {tooltip.show && (
                <div style={{
                    position: 'absolute',
                    left: tooltip.x,
                    top: tooltip.y,
                    transform: 'translateX(-50%) translateY(-100%)',
                    pointerEvents: 'none',
                    zIndex: 100,
                    transition: 'all 0.05s linear'
                }}>
                    {tooltip.content}
                </div>
            )}
        </div>
    );
};

export default BarChart;
