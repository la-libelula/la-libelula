import React, { useState } from 'react';

const Chart = ({ data, series, categories, height = 300, title }) => {
    const [hoveredIndex, setHoveredIndex] = useState(null);
    const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, content: null });

    if (!data || data.length === 0) return <div>No hay datos para mostrar</div>;

    const padding = { top: 40, right: 20, bottom: 40, left: 60 };
    const chartWidth = 800;
    const chartHeight = height;

    const innerWidth = chartWidth - padding.left - padding.right;
    const innerHeight = chartHeight - padding.top - padding.bottom;

    // Find max value across all series to scale Y axis
    const allValues = data.flatMap(d => series.map(s => d[s.key] || 0));
    const maxValue = Math.max(...allValues, 100); // 100 as min ceiling
    const yTickCount = 5;
    const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) => (maxValue / yTickCount) * i);

    const getX = (index) => padding.left + (index * (innerWidth / (data.length - 1 || 1)));
    const getY = (value) => padding.top + innerHeight - (value / maxValue) * innerHeight;

    const handleMouseMove = (e, index, d) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        setHoveredIndex(index);
        setTooltip({
            show: true,
            x: x,
            y: y - 10,
            content: (
                <div style={{ backgroundColor: 'white', padding: '8px', borderRadius: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', border: '1px solid #eee', fontSize: '0.8rem' }}>
                    <div style={{ fontWeight: 700, marginBottom: '4px', color: '#666' }}>{d.name}</div>
                    {series.map(s => (
                        <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: s.color }}></div>
                            <span>{s.label}: <strong>{d[s.key].toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</strong></span>
                        </div>
                    ))}
                </div>
            )
        });
    };

    return (
        <div style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
            {title && <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--color-text)' }}>{title}</h3>}

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
                                {tick >= 1000 ? `${(tick / 1000).toFixed(1)}k` : Math.round(tick)}
                            </text>
                        </g>
                    );
                })}

                {/* X Axis Labels */}
                {data.map((d, i) => (
                    <text
                        key={i}
                        x={getX(i)}
                        y={chartHeight - padding.bottom + 20}
                        textAnchor="middle"
                        fontSize="12"
                        fill="var(--color-text-muted)"
                    >
                        {d.name.substring(0, 3)}
                    </text>
                ))}

                {/* Data Lines/Areas */}
                {series.map((s, sIdx) => {
                    const points = data.map((d, i) => `${getX(i)},${getY(d[s.key] || 0)}`).join(' ');
                    const areaPoints = `${getX(0)},${innerHeight + padding.top} ${points} ${getX(data.length - 1)},${innerHeight + padding.top}`;

                    return (
                        <g key={s.key}>
                            {/* Gradient Area */}
                            <path
                                d={`M ${areaPoints}`}
                                fill={s.color}
                                fillOpacity="0.1"
                            />
                            {/* Main Line */}
                            <polyline
                                points={points}
                                fill="none"
                                stroke={s.color}
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            {/* Data Points */}
                            {data.map((d, i) => (
                                <circle
                                    key={i}
                                    cx={getX(i)}
                                    cy={getY(d[s.key] || 0)}
                                    r={hoveredIndex === i ? 6 : 4}
                                    fill="white"
                                    stroke={s.color}
                                    strokeWidth="2"
                                    onMouseEnter={(e) => handleMouseMove(e, i, d)}
                                    onMouseLeave={() => {
                                        setHoveredIndex(null);
                                        setTooltip({ ...tooltip, show: false });
                                    }}
                                    style={{ cursor: 'pointer', transition: 'r 0.2s' }}
                                />
                            ))}
                        </g>
                    );
                })}

                {/* Hover Vertical Line */}
                {hoveredIndex !== null && (
                    <line
                        x1={getX(hoveredIndex)}
                        y1={padding.top}
                        x2={getX(hoveredIndex)}
                        y2={chartHeight - padding.bottom}
                        stroke="var(--color-primary)"
                        strokeWidth="1"
                        strokeOpacity="0.3"
                        pointerEvents="none"
                    />
                )}
            </svg>

            {/* Tooltip Overlay */}
            {tooltip.show && (
                <div style={{
                    position: 'absolute',
                    left: `${(tooltip.x / 800) * 100}%`,
                    top: tooltip.y,
                    transform: 'translateX(-50%) translateY(-100%)',
                    pointerEvents: 'none',
                    zIndex: 100,
                    transition: 'all 0.1s ease-out'
                }}>
                    {tooltip.content}
                </div>
            )}
        </div>
    );
};

export default Chart;
