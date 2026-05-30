import { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import './Dashboard.css';

// ── Paleta corporativa ────────────────────────────────────────────────────────
const C = {
  tipoCambio: '#1d4ed8',
  maximo:     '#0ea5e9',
  minimo:     '#0284c7',
  turistas:   '#0369a1',
  border:     '#e2e8f0',
};

const ORDEN_MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];
const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// ── Helper: parsea números con formato español "1.234,56" → 1234.56 ──────────
function parseNum(str) {
  if (!str) return 0;
  return parseFloat(String(str).replace(/\./g, '').replace(',', '.')) || 0;
}

function fmt(n, dec = 2) {
  return Number(n).toLocaleString('es-CR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function avg(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, accent }) {
  return (
    <div className="kpi-card" style={{ borderTop: `4px solid ${accent}` }}>
      <p className="kpi-label">{label}</p>
      <p className="kpi-value" style={{ color: accent }}>{value}</p>
    </div>
  );
}

// ── Tooltip personalizado ─────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label, prefix = '₡', suffix = '', labelFormatter, dec = 2 }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="custom-tooltip">
      <p className="tooltip-label">{labelFormatter ? labelFormatter(label) : label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {prefix}{fmt(p.value, dec)}{suffix}
        </p>
      ))}
    </div>
  );
}

// ── Heatmap Reservas BCCR ─────────────────────────────────────────────────────
function HeatmapReservas({ data }) {
  const [tooltip, setTooltip] = useState(null); // { x, y, label, val }

  const matrix = useMemo(() => {
    const years = [...new Set(data.map(d => d.año))].sort();
    return years.map(year => ({
      year,
      months: ORDEN_MESES.map(mes => {
        const row = data.find(d => d.año === year && d.mes === mes);
        return row ? row.reservas : null;
      }),
    }));
  }, [data]);

  const allVals = matrix.flatMap(r => r.months).filter(v => v !== null);
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);

  function cellColor(val) {
    if (val === null) return '#f1f5f9';
    const t = (val - minV) / (maxV - minV || 1);
    return `rgb(${Math.round(239 + (30 - 239) * t)},${Math.round(246 + (58 - 246) * t)},${Math.round(255 + (138 - 255) * t)})`;
  }

  return (
    <div className="chart-card" style={{ position: 'relative' }}>
      <h3 className="chart-title">Reservas BCCR — Mapa de Calor (millones USD)</h3>
      <div className="heatmap-wrapper">
        <table className="heatmap-table">
          <thead>
            <tr>
              <th>Año</th>
              {MESES_CORTO.map(m => <th key={m}>{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {matrix.map(({ year, months }) => (
              <tr key={year}>
                <td className="heatmap-year">{year}</td>
                {months.map((val, mi) => (
                  <td
                    key={mi}
                    className="heatmap-cell"
                    style={{ background: cellColor(val), cursor: val !== null ? 'default' : 'not-allowed' }}
                    onMouseEnter={e => val !== null && setTooltip({
                      x: e.clientX, y: e.clientY,
                      label: `${MESES_CORTO[mi]} ${year}`,
                      val,
                    })}
                    onMouseMove={e => val !== null && setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : t)}
                    onMouseLeave={() => setTooltip(null)}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="heatmap-legend">
        <span>{fmt(minV, 0)} M</span>
        <div className="heatmap-gradient" />
        <span>{fmt(maxV, 0)} M</span>
      </div>
      {tooltip && (
        <div
          className="custom-tooltip"
          style={{ position: 'fixed', top: tooltip.y + 12, left: tooltip.x + 12, pointerEvents: 'none', zIndex: 9999 }}
        >
          <p className="tooltip-label">{tooltip.label}</p>
          <p style={{ color: '#1d4ed8' }}>{fmt(tooltip.val)} USD</p>
        </div>
      )}
    </div>
  );
}

// ── Tabla histórica ───────────────────────────────────────────────────────────
function TablaHistorica({ raw }) {
  const [query, setQuery]       = useState('');
  const [filterAño, setFilterAño] = useState('');

  const headers = raw.length ? Object.keys(raw[0]) : [];
  const años = useMemo(() => [...new Set(raw.map(r => r['Año']).filter(Boolean))].sort(), [raw]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return raw.filter(row =>
      (!filterAño || row['Año'] === filterAño) &&
      (!q || Object.values(row).some(v => String(v).toLowerCase().includes(q)))
    );
  }, [raw, query, filterAño]);

  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => {
      const ya = parseInt(a['Año']), yb = parseInt(b['Año']);
      if (ya !== yb) return ya - yb;
      return ORDEN_MESES.indexOf(a['Mes']?.trim()) - ORDEN_MESES.indexOf(b['Mes']?.trim());
    })
  , [filtered]);

  return (
    <div className="chart-card">
      <h3 className="chart-title">Datos Históricos Completos</h3>
      <div className="table-filters">
        <select
          className="table-select"
          value={filterAño}
          onChange={e => setFilterAño(e.target.value)}
        >
          <option value="">Todos los años</option>
          {años.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {headers.map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'row-even' : ''}>
                {headers.map(h => <td key={h}>{row[h]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="table-count">{sorted.length} registros</p>
    </div>
  );
}

// ── Dashboard principal ───────────────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData]       = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    fetch('/datos_economicos.csv')
      .then(r => { if (!r.ok) throw new Error('No se pudo cargar el CSV'); return r.text(); })
      .then(text => {
        const { data: rows } = Papa.parse(text, { header: true, skipEmptyLines: true });
        setRawRows(rows);
        setData(rows.map(row => ({
          año:        parseInt(row['Año']),
          mes:        row['Mes']?.trim(),
          tipoCambio: parseNum(row['Tipo de Cambio']),
          maximo:     parseNum(row['Máximo']),
          minimo:     parseNum(row['Mínimo']),
          reservas:   parseNum(row['Reservas BCCR']),
          turistas:   parseNum(row['Turistas']),
        })).filter(d => d.año && d.mes));
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  // Filtros globales
  const [filtroAño, setFiltroAño] = useState('');
  const [filtroMes, setFiltroMes] = useState('');

  const añosDisponibles = useMemo(() => [...new Set(data.map(d => d.año))].sort(), [data]);

  const dataFiltrada = useMemo(() =>
    data.filter(d =>
      (!filtroAño || d.año === parseInt(filtroAño)) &&
      (!filtroMes || d.mes === filtroMes)
    )
  , [data, filtroAño, filtroMes]);

  // Gráfico de líneas — serie cronológica, eje X: año-mes
  const lineData = useMemo(() =>
    [...dataFiltrada]
      .sort((a, b) => a.año - b.año || ORDEN_MESES.indexOf(a.mes) - ORDEN_MESES.indexOf(b.mes))
      .map(d => ({
        periodo:    `${d.año}-${String(ORDEN_MESES.indexOf(d.mes) + 1).padStart(2, '0')}`,
        año:        d.año,
        tipoCambio: d.tipoCambio,
        maximo:     d.maximo,
        minimo:     d.minimo,
      }))
  , [dataFiltrada]);

  const turistasData = useMemo(() => {
    const map = {};
    dataFiltrada.forEach(({ año, turistas }) => {
      if (!map[año]) map[año] = 0;
      map[año] += turistas;
    });
    return Object.keys(map).sort().map(año => ({ periodo: año, Turistas: map[año] }));
  }, [dataFiltrada]);

  const kpis = useMemo(() => {
    if (!dataFiltrada.length) return null;
    const tc = dataFiltrada.map(d => d.tipoCambio);
    const mx = dataFiltrada.map(d => d.maximo);
    const mn = dataFiltrada.map(d => d.minimo);
    return {
      tcMax: Math.max(...tc), tcMin: Math.min(...tc), tcAvg: avg(tc),
      mxMax: Math.max(...mx), mnMin: Math.min(...mn),
    };
  }, [dataFiltrada]);

  if (loading) return <div className="dash-state">Cargando datos…</div>;
  if (error)   return <div className="dash-state dash-error">⚠ {error}</div>;

  return (
    <div className="dash-root">

      {/* ── 1. TÍTULO Y DESCRIPCIÓN ── */}
      <header className="dash-header">
        <div className="dash-header-inner">
          <div>
            <h1 className="dash-title">Dashboard de Indicadores Económicos — Costa Rica</h1>

          </div>

        </div>
        <div className="dash-description">
          <p>
            Este dashboard analiza la evolución del tipo de cambio USD/CRC entre <strong>{data[0]?.año}</strong> y <strong>{data[data.length - 1]?.año}</strong>,
            integrando variables como las reservas internacionales del Banco Central (BCCR) y el ingreso de turistas,
            con el objetivo de identificar patrones y factores asociados a la apreciación del colón costarricense frente al dólar.
          </p>
        </div>
      </header>

      <main className="dash-main">

        {/* ── 2. FILTROS ── */}
        <section className="section-block">

          <div className="filters-bar">
            <div className="filter-item">
              <label className="filter-label">Año</label>
              <select className="table-select" value={filtroAño} onChange={e => setFiltroAño(e.target.value)}>
                <option value="">Todos</option>
                {añosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="filter-item">
              <label className="filter-label">Mes</label>
              <select className="table-select" value={filtroMes} onChange={e => setFiltroMes(e.target.value)}>
                <option value="">Todos</option>
                {ORDEN_MESES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* ── 3. KPIs ── */}
        {kpis && (
          <section className="section-block">

            <div className="kpi-grid">
              <KpiCard label="Tipo Cambio Máximo"   value={`₡ ${fmt(kpis.tcMax)}`} accent="#1d4ed8" />
              <KpiCard label="Tipo Cambio Mínimo"   value={`₡ ${fmt(kpis.tcMin)}`} accent="#3b82f6" />
              <KpiCard label="Tipo Cambio Promedio" value={`₡ ${fmt(kpis.tcAvg)}`} accent="#60a5fa" />
            </div>
          </section>
        )}

        {/* ── 4. VISUALIZACIONES PRINCIPALES ── */}
        <section className="section-block">

          <div className="dash-grid-2">
            <div className="chart-card">
              <h3 className="chart-title">Evolución Histórica — Tipo de Cambio (₡)</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={lineData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis
                    dataKey="periodo"
                    tick={{ fontSize: 11 }}
                    interval="preserveStartEnd"
                    tickFormatter={v => v.split('-')[0]}
                    ticks={lineData
                      .filter((d, i, arr) => i === 0 || d.año !== arr[i - 1].año)
                      .map(d => d.periodo)}
                  />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} tickFormatter={v => `₡${fmt(v, 0)}`} width={80} />
                  <Tooltip content={<CustomTooltip labelFormatter={v => { const [y, m] = v.split('-'); return `${MESES_CORTO[+m - 1]} ${y}`; }} />} />
                  <Legend />
                  <Line type="monotone" dataKey="tipoCambio" name="Tipo de Cambio" stroke={C.tipoCambio} dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="maximo"     name="Máximo"         stroke={C.maximo}     dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="minimo"     name="Mínimo"         stroke={C.minimo}     dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <h3 className="chart-title">Ingreso de Turistas por Período</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={turistasData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} width={60} />
                  <Tooltip content={<CustomTooltip prefix="" suffix="" dec={0} />} isAnimationActive={false} />
                  <Legend />
                  <Bar dataKey="Turistas" fill={C.turistas} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* ── 5. VISUALIZACIONES SECUNDARIAS ── */}
        <section className="section-block">
          <HeatmapReservas data={dataFiltrada} />
          <TablaHistorica raw={rawRows} />
        </section>

        {/* ── 6. CONCLUSIONES ── */}
        <section className="section-block">
          <div className="conclusion-card">
            <div>
              <p className="conclusion-titulo">Conclusiones y Hallazgos</p>
              <p className="conclusion-texto">
                Entre 2022 y 2025, el tipo de cambio USD/CRC disminuyó significativamente, pasando de más de ₡700 a cerca de ₡500 por dólar, lo que evidencia una apreciación del colón. Durante este período, las reservas internacionales del BCCR se mantuvieron altas y el turismo se recuperó con fuerza tras la pandemia, aumentando la entrada de divisas al país. Esto generó una mayor oferta de dólares en el mercado, contribuyendo a la reducción del tipo de cambio y mostrando una relación inversa entre el ingreso de turistas y el valor del dólar.
              </p>
            </div>
          </div>
        </section>

      </main>

      {/* ── Footer ── */}
      <footer className="dash-footer">
        <p className="footer-title">Fuentes de datos oficiales</p>
        <div className="footer-sources">
          <a href="https://www.bccr.fi.cr" target="_blank" rel="noreferrer" className="footer-link">🏦 Banco Central de Costa Rica (BCCR)</a>
          <span className="footer-sep">·</span>
          <a href="https://www.ict.go.cr" target="_blank" rel="noreferrer" className="footer-link">✈ Instituto Costarricense de Turismo (ICT)</a>
          <span className="footer-sep">·</span>
          <a href="https://es.investing.com/currencies/usd-crc-user-rankings" target="_blank" rel="noreferrer" className="footer-link">📈 Investing.com — USD/CRC</a>
        </div>
      </footer>

    </div>
  );
}
