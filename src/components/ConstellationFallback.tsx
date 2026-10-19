/** A light, deterministic first paint, also used on devices without WebGL. */
export function ConstellationFallback() {
  return <svg viewBox="0 0 600 520" className="constellation-fallback" aria-hidden="true">
    <g transform="translate(300 260) rotate(-24)" fill="none" stroke="#dbc6a0" strokeWidth="0.8">
      {Array.from({ length: 19 }, (_, i) => <ellipse key={i} rx={30 + i * 10} ry={210} opacity={0.07 + (i % 4) * 0.035} />)}
      {Array.from({ length: 13 }, (_, i) => <ellipse key={i} rx={210} ry={20 + i * 15} opacity="0.11" />)}
    </g>
    {[[190, 180], [425, 140], [365, 355], [120, 280], [445, 310]].map(([x, y], i) => <g key={i}>
      <line x1="300" y1="260" x2={x} y2={y} stroke="#dbc6a0" opacity="0.15" />
      <circle cx={x} cy={y} r="4" fill={i % 2 ? "#aaa0e5" : "#dbc6a0"} />
    </g>)}
    <circle cx="300" cy="260" r="7" fill="#f2f0e9" />
  </svg>;
}
