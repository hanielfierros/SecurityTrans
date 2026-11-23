/* ============================================================
   SECURITYTRANS — DATA MANAGEMENT · Motor de análisis (58 botones)
   ------------------------------------------------------------
   Contiene:
     - Configuración de los 6 módulos (A–F) con 58 análisis.
     - Funciones de análisis deterministas (sin conclusiones inventadas).
     - Renderizado uniforme de resultados (KPIs, tablas, gráficas,
       explicación generada a partir de cálculos reales y estado de datos).

   Reglas:
     - Los análisis que requieren datos inexistentes muestran
       "Datos insuficientes" y detallan qué falta.
     - Nunca se interpreta bajo costo como alta rentabilidad.
     - Nunca se presentan ahorros estimados como beneficio financiero real.
   ============================================================ */

import { DataManager as DM } from "./data-management-data.js";

// ---------------------------------------------------------------------------
// Utilidades de color y gráficas (ECharts, respetan el tema)
// ---------------------------------------------------------------------------
function colores() {
  const oscuro = document.documentElement.getAttribute("data-theme") === "dark";
  return {
    grid: oscuro ? "#414141" : "#D9D9D9",
    text: oscuro ? "#9E9E9E" : "#707070",
    principal: oscuro ? "#7FA3C9" : "#24476A",
    bueno: oscuro ? "#6BB5A8" : "#176B65",
    malo: oscuro ? "#E08A8A" : "#B91C1C",
    palette: ["#24476A", "#176B65", "#B45309", "#6B46A1", "#707070", "#B91C1C", "#2C7FB8", "#31A354", "#756BB1", "#D6616B"],
  };
}

const instanciasGrafica = new Map();

function renderGrafica(el, spec) {
  if (!el || typeof echarts === "undefined") return;
  const id = el.id;
  if (instanciasGrafica.has(id)) { instanciasGrafica.get(id).dispose(); instanciasGrafica.delete(id); }
  const chart = echarts.init(el);
  instanciasGrafica.set(id, chart);
  const c = colores();

  // Limita las categorías para mantener la gráfica legible con muchos servicios.
  const MAX_CAT = 30;
  let xData = spec.xData || [];
  let series = spec.series || [];
  if (spec.tipo !== "scatter" && xData.length > MAX_CAT) {
    xData = xData.slice(0, MAX_CAT);
    series = series.map(s => ({ ...s, data: (s.data || []).slice(0, MAX_CAT) }));
  }

  const opt = {
    grid: { left: 60, right: 24, top: 40, bottom: 48 },
    tooltip: { trigger: spec.tipo === "scatter" ? "item" : "axis" },
    legend: series.length > 1 ? { top: 0, textStyle: { color: c.text } } : undefined,
    color: c.palette,
    toolbox: { show: true, right: 8, feature: { restore: { title: "Restaurar" }, saveAsImage: { title: "Guardar imagen" } } },
    xAxis: { type: "category", data: xData, axisLabel: { color: c.text, rotate: xData.length > 6 ? 30 : 0 }, axisLine: { lineStyle: { color: c.grid } } },
    yAxis: { type: "value", name: spec.yName || "", nameTextStyle: { color: c.text }, axisLabel: { color: c.text }, splitLine: { lineStyle: { color: c.grid } } },
  };
  if (spec.tipo === "line") {
    opt.series = series.map(s => ({ name: s.name, type: "line", data: s.data, smooth: true }));
    opt.dataZoom = [{ type: "inside" }, { type: "slider", height: 18, bottom: 6 }];
  } else if (spec.tipo === "bar" || spec.tipo === "stacked") {
    opt.series = series.map(s => ({ name: s.name, type: "bar", stack: spec.tipo === "stacked" ? "total" : undefined, data: s.data }));
    opt.dataZoom = [{ type: "inside" }, { type: "slider", height: 18, bottom: 6 }];
  } else if (spec.tipo === "hbar") {
    opt.xAxis = { type: "value", axisLabel: { color: c.text }, splitLine: { lineStyle: { color: c.grid } } };
    opt.yAxis = { type: "category", data: xData, axisLabel: { color: c.text } };
    opt.grid = { left: 140, right: 60, top: 40, bottom: 32 };
    opt.series = series.map(s => ({ name: s.name, type: "bar", data: s.data }));
    opt.dataZoom = [{ type: "inside", yAxisIndex: 0 }, { type: "slider", yAxisIndex: 0, width: 14, right: 4 }];
  } else if (spec.tipo === "scatter") {
    opt.xAxis = { type: "value", name: spec.xName || "", axisLabel: { color: c.text }, splitLine: { lineStyle: { color: c.grid } } };
    opt.yAxis = { type: "value", name: spec.yName || "", axisLabel: { color: c.text }, splitLine: { lineStyle: { color: c.grid } } };
    opt.series = series.map(s => ({ name: s.name, type: "scatter", data: s.data, symbolSize: 13 }));
    opt.dataZoom = [{ type: "inside" }, { type: "slider", height: 18, bottom: 6 }];
  }
  chart.setOption(opt);
  return chart;
}

export function disposeGraficas() {
  instanciasGrafica.forEach(ch => { try { ch.dispose(); } catch (e) {} });
  instanciasGrafica.clear();
}

// ---------------------------------------------------------------------------
// Pesos del desempeño integral (transparentes y documentados)
// ---------------------------------------------------------------------------
const PESOS_INTEGRAL = [
  { metrica: "rendimiento_kmL", peso: 0.30, desc: "Rendimiento ponderado km/L (30%)" },
  { metrica: "costo_km_inverso", peso: 0.30, desc: "Menor costo por km (30%)" },
  { metrica: "ahorro", peso: 0.20, desc: "Ahorro frente a presupuesto (20%)" },
  { metrica: "incidencias_inverso", peso: 0.20, desc: "Menos incidencias (20%)" },
];

function normalizarMinMax(valores, invertir) {
  const vals = valores.filter(v => v != null);
  if (vals.length === 0) return valores.map(() => null);
  const min = Math.min(...vals), max = Math.max(...vals);
  if (max === min) return valores.map(() => 1);
  return valores.map(v => v == null ? null : invertir ? ((max - v) / (max - min)) : ((v - min) / (max - min)));
}

// ---------------------------------------------------------------------------
// Estructura de resultado uniforme
// ---------------------------------------------------------------------------
function componer(ctx, o) {
  const total = ctx.servicios.length;
  const usados = o.registros != null ? o.registros : total;
  return {
    disponible: o.disponible !== false,
    motivo: o.motivo || null,
    titulo: o.titulo,
    kpis: o.kpis || [],
    tabla: o.tabla || null,
    grafica: o.grafica || null,
    explicacion: o.explicacion || "",
    formula: o.formula || "",
    registros: usados,
    excluidos: total - usados,
    motivoExclusion: o.motivoExclusion || (total - usados > 0 ? "Registros sin datos válidos para la métrica." : "Sin exclusiones."),
    fuente: "services-summary.json · catalogos.json (datos " + (ctx.data.disponibilidad.ausentes.length ? "parciales" : "completos") + ")",
    actualizacion: ctx.data.actualizado,
    integridad: ctx.data.disponibilidad.ausentes.length
      ? "Campos ausentes: " + ctx.data.disponibilidad.ausentes.join(", ")
      : "Todos los campos requeridos disponibles.",
  };
}

function noDisponible(ctx, titulo, campo) {
  const r = componer(ctx, { titulo, disponible: false, motivo: DM.CAMPOS_AUSENTES[campo] || "Datos insuficientes." });
  r.explicacion = "No es posible calcular este análisis con los datos actuales.";
  return r;
}

function soloDemoNota() {
  return "Los datos son simulados y se muestran con fines de validación; no constituyen un registro operativo real.";
}

// ---------------------------------------------------------------------------
// Helpers de ranking / tablas
// ---------------------------------------------------------------------------
function ordenar(lista, fn, desc = true) {
  return [...lista].sort((a, b) => {
    const va = fn(a), vb = fn(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return desc ? (vb - va) : (va - vb);
  });
}

function nombreOperador(id, data) {
  const o = data.operadores.find(x => x.ID_OPERADOR === id);
  return o ? o.nombre.split(" ").slice(0, 2).join(" ") : id;
}
function nombreVehiculo(id, data) {
  const v = data.vehiculos.find(x => x.ID_VEHICULO === id);
  return v ? (v.unidad_referencia + " · " + v.modelo_operativo) : id;
}
function nombreRuta(id, data) {
  const r = data.rutas.find(x => x.ID_RUTA === id);
  return r ? (r.origen + " → " + r.destino) : id;
}

// ---------------------------------------------------------------------------
// Módulo A — DASHBOARD EJECUTIVO
// ---------------------------------------------------------------------------
const modA = {
  id: "A", titulo: "Dashboard ejecutivo", icono: "📊",
  desc: "Resumen ejecutivo de costos, eficiencia, cumplimiento e incidencias del periodo seleccionado.",
  botones: [
    { id: "A01", label: "Mayor costo operativo" },
    { id: "A02", label: "Menor costo operativo" },
    { id: "A03", label: "Servicios más rentables" },
    { id: "A04", label: "Servicios menos rentables" },
    { id: "A05", label: "Evolución de gastos" },
    { id: "A06", label: "Eficiencia de la flota" },
    { id: "A07", label: "Cumplimiento de entregas" },
    { id: "A08", label: "Resumen de incidencias" },
  ],
};

// ---------------------------------------------------------------------------
// Módulo B — ANÁLISIS DE OPERADORES
// ---------------------------------------------------------------------------
const modB = {
  id: "B", titulo: "Análisis de operadores", icono: "👥",
  desc: "Rendimiento, consumo, costos e incidencias agrupados por operador.",
  botones: [
    { id: "B01", label: "Mejor rendimiento km/L" },
    { id: "B02", label: "Peor rendimiento km/L" },
    { id: "B03", label: "Mayor gasto combustible" },
    { id: "B04", label: "Menor costo por km" },
    { id: "B05", label: "Más servicios realizados" },
    { id: "B06", label: "Más kilómetros recorridos" },
    { id: "B07", label: "Mayor ahorro estimado" },
    { id: "B08", label: "Más incidencias" },
    { id: "B09", label: "Mejor puntualidad" },
    { id: "B10", label: "Mejor desempeño integral" },
  ],
};

// ---------------------------------------------------------------------------
// Módulo C — ANÁLISIS DE UNIDADES
// ---------------------------------------------------------------------------
const modC = {
  id: "C", titulo: "Análisis de unidades", icono: "🚛",
  desc: "Comparación de unidades (vehículos) en consumo, costo, utilización y fallas.",
  botones: [
    { id: "C01", label: "Camión más gastón" },
    { id: "C02", label: "Camión más eficiente" },
    { id: "C03", label: "Mayor costo por km" },
    { id: "C04", label: "Menor costo por km" },
    { id: "C05", label: "Más kilómetros recorridos" },
    { id: "C06", label: "Mayor tiempo detenido" },
    { id: "C07", label: "Mayor gasto mantenimiento" },
    { id: "C08", label: "Mayor utilización" },
    { id: "C09", label: "Más fallas reportadas" },
    { id: "C10", label: "Ranking general de unidades" },
  ],
};

// ---------------------------------------------------------------------------
// Módulo D — ANÁLISIS DE RUTAS
// ---------------------------------------------------------------------------
const modD = {
  id: "D", titulo: "Análisis de rutas", icono: "🗺️",
  desc: "Comparación de rutas en costos, consumo, tiempos y desviaciones de distancia.",
  botones: [
    { id: "D01", label: "Ruta más rentable" },
    { id: "D02", label: "Ruta menos rentable" },
    { id: "D03", label: "Ruta más costosa" },
    { id: "D04", label: "Ruta más económica por km" },
    { id: "D05", label: "Mayor consumo combustible" },
    { id: "D06", label: "Mayor gasto en casetas" },
    { id: "D07", label: "Mayor retraso promedio" },
    { id: "D08", label: "Menor tiempo de recorrido" },
    { id: "D09", label: "Mayor desviación de distancia" },
    { id: "D10", label: "Ranking de rutas" },
  ],
};

// ---------------------------------------------------------------------------
// Módulo E — COMBUSTIBLE Y COSTOS
// ---------------------------------------------------------------------------
const modE = {
  id: "E", titulo: "Combustible y costos", icono: "⛽",
  desc: "Consumo, rendimiento, precio y desviaciones de combustible.",
  botones: [
    { id: "E01", label: "Mayor consumo en litros" },
    { id: "E02", label: "Menor rendimiento km/L" },
    { id: "E03", label: "Mayor precio por litro" },
    { id: "E04", label: "Mayor costo por km" },
    { id: "E05", label: "Consumo fuera de referencia" },
    { id: "E06", label: "Ahorro estimado" },
    { id: "E07", label: "Evolución de combustible" },
    { id: "E08", label: "Costo por tipo de unidad" },
    { id: "E09", label: "Gasto por ruta" },
    { id: "E10", label: "Desviación mensual" },
  ],
};

// ---------------------------------------------------------------------------
// Módulo F — COMPARATIVOS AVANZADOS
// ---------------------------------------------------------------------------
const modF = {
  id: "F", titulo: "Comparativos avanzados", icono: "⚖️",
  desc: "Comparaciones entre entidades, periodos, costo real vs. esperado, ranking multicriterio y anomalías.",
  botones: [
    { id: "F01", label: "Chofer vs. chofer" },
    { id: "F02", label: "Camión vs. camión" },
    { id: "F03", label: "Ruta vs. ruta" },
    { id: "F04", label: "Chofer por camión" },
    { id: "F05", label: "Camión por ruta" },
    { id: "F06", label: "Costo real vs. esperado" },
    { id: "F07", label: "Mes actual vs. anterior" },
    { id: "F08", label: "Periodo vs. periodo" },
    { id: "F09", label: "Ranking multicriterio" },
    { id: "F10", label: "Tendencias y anomalías" },
  ],
};

export const MODULOS = [modA, modB, modC, modD, modE, modF];

// ---------------------------------------------------------------------------
// Funciones de análisis
// ---------------------------------------------------------------------------
const ANALISIS = {};

// Agrega servicios por mes (para series temporales legibles).
function agregarPorMes(servicios) {
  const m = new Map();
  servicios.forEach(s => {
    const mes = s.fecha ? s.fecha.slice(0, 7) : "N/D";
    if (!m.has(mes)) m.set(mes, { mes, costo: 0, presupuesto: 0, litros: 0, ingresos: 0, utilidad: 0, n: 0, km: 0, casetas: 0, mantenimiento: 0, otros: 0, fallas: 0, incidencias: 0 });
    const e = m.get(mes);
    e.costo += (s.costo_consumo_MXN || 0);
    e.presupuesto += (s.presupuesto_MXN || 0);
    e.litros += (s.litros_consumidos_L || 0);
    e.ingresos += (s.ingresos_MXN || 0);
    e.utilidad += (s.utilidad_MXN || 0);
    e.km += (s.distancia_km || 0);
    e.casetas += (s.costo_casetas_MXN || 0);
    e.mantenimiento += (s.costo_mantenimiento_MXN || 0);
    e.otros += (s.otros_gastos_MXN || 0);
    e.fallas += (s.fallas || 0);
    e.incidencias += (s.incidencias || 0);
    e.n += 1;
  });
  return [...m.values()].sort((a, b) => a.mes.localeCompare(b.mes));
}

// --- A ---
ANALISIS.A01 = (ctx) => {
  const s = ordenar(ctx.servicios, x => x.costo_consumo_MXN, true);
  const top = s[0];
  return componer(ctx, {
    titulo: "Mayor costo operativo",
    kpis: [
      { label: "Servicio", value: top ? top.folio : "N/D", unit: "", note: "" },
      { label: "Costo operativo", value: DM.fmtMXN(top ? top.costo_consumo_MXN : null), unit: "MXN", note: "combustible" },
      { label: "Operador", value: top ? top.operador : "N/D", unit: "", note: "" },
    ],
    tabla: { headers: ["Folio", "Operador", "Distancia (km)", "Litros", "Costo (MXN)"], filas: s.map(x => [x.folio, x.operador, DM.fmtNum(x.distancia_km, 0), DM.fmtNum(x.litros_consumidos_L, 1), DM.fmtMXN(x.costo_consumo_MXN)]) },
    grafica: { tipo: "bar", xData: s.map(x => x.folio.slice(-5)), yName: "MXN", series: [{ name: "Costo operativo", data: s.map(x => +x.costo_consumo_MXN.toFixed(2)) }] },
    explicacion: "El servicio " + (top ? top.folio : "—") + " registra el mayor costo operativo (" + DM.fmtMXN(top ? top.costo_consumo_MXN : null) + " MXN). El costo operativo se refiere únicamente al consumo de combustible; no incluye mantenimiento ni casetas (datos ausentes).",
    formula: "costo operativo = costo_consumo_MXN (suma de combustible).",
  });
};

ANALISIS.A02 = (ctx) => {
  const s = ordenar(ctx.servicios, x => x.costo_consumo_MXN, false);
  const top = s[0];
  return componer(ctx, {
    titulo: "Menor costo operativo",
    kpis: [
      { label: "Servicio", value: top ? top.folio : "N/D", unit: "", note: "" },
      { label: "Costo operativo", value: DM.fmtMXN(top ? top.costo_consumo_MXN : null), unit: "MXN", note: "combustible" },
      { label: "Operador", value: top ? top.operador : "N/D", unit: "", note: "" },
    ],
    tabla: { headers: ["Folio", "Operador", "Distancia (km)", "Litros", "Costo (MXN)"], filas: s.map(x => [x.folio, x.operador, DM.fmtNum(x.distancia_km, 0), DM.fmtNum(x.litros_consumidos_L, 1), DM.fmtMXN(x.costo_consumo_MXN)]) },
    grafica: { tipo: "bar", xData: s.map(x => x.folio.slice(-5)), yName: "MXN", series: [{ name: "Costo operativo", data: s.map(x => +x.costo_consumo_MXN.toFixed(2)) }] },
    explicacion: "El servicio " + (top ? top.folio : "—") + " registra el menor costo operativo (" + DM.fmtMXN(top ? top.costo_consumo_MXN : null) + " MXN). Un menor costo no implica mayor rentabilidad; no existen datos de ingresos para calcular margen.",
    formula: "costo operativo = costo_consumo_MXN.",
  });
};

ANALISIS.A03 = (ctx) => {
  const s = ordenar(ctx.servicios, x => x.margen_pct, true);
  const top = s[0];
  return componer(ctx, {
    titulo: "Servicios más rentables",
    kpis: [
      { label: "Servicio", value: top ? top.folio : "N/D", unit: "", note: "" },
      { label: "Margen", value: top && top.margen_pct != null ? DM.fmtPct(top.margen_pct, 1) : "N/D", unit: "", note: "" },
      { label: "Utilidad", value: top ? DM.fmtMXN(top.utilidad_MXN) : "N/D", unit: "MXN", note: "" },
    ],
    tabla: { headers: ["Folio", "Operador", "Ingresos (MXN)", "Costo (MXN)", "Utilidad (MXN)", "Margen"], filas: s.slice(0, 40).map(x => [x.folio, x.operador, DM.fmtMXN(x.ingresos_MXN), DM.fmtMXN(x.costo_operativo_total_MXN), DM.fmtMXN(x.utilidad_MXN), DM.fmtPct(x.margen_pct, 1)]) },
    grafica: { tipo: "bar", xData: s.slice(0, 25).map(x => x.folio.slice(-5)), yName: "Margen %", series: [{ name: "Margen", data: s.slice(0, 25).map(x => +(x.margen_pct || 0).toFixed(1)) }] },
    explicacion: "El servicio " + (top ? top.folio : "—") + " presenta el mayor margen de utilidad (" + (top ? DM.fmtPct(top.margen_pct, 1) : "N/D") + "). Margen = utilidad operativa / ingresos × 100, usando costo operativo total (combustible + casetas + mantenimiento + otros gastos).",
    formula: "margen % = (ingresos − costo_operativo_total) / ingresos × 100.",
  });
};

ANALISIS.A04 = (ctx) => {
  const s = ordenar(ctx.servicios, x => x.margen_pct, false);
  const top = s[0];
  return componer(ctx, {
    titulo: "Servicios menos rentables",
    kpis: [
      { label: "Servicio", value: top ? top.folio : "N/D", unit: "", note: "" },
      { label: "Margen", value: top && top.margen_pct != null ? DM.fmtPct(top.margen_pct, 1) : "N/D", unit: "", note: "" },
      { label: "Utilidad", value: top ? DM.fmtMXN(top.utilidad_MXN) : "N/D", unit: "MXN", note: "" },
    ],
    tabla: { headers: ["Folio", "Operador", "Ingresos (MXN)", "Costo (MXN)", "Utilidad (MXN)", "Margen"], filas: s.slice(0, 40).map(x => [x.folio, x.operador, DM.fmtMXN(x.ingresos_MXN), DM.fmtMXN(x.costo_operativo_total_MXN), DM.fmtMXN(x.utilidad_MXN), DM.fmtPct(x.margen_pct, 1)]) },
    grafica: { tipo: "bar", xData: s.slice(0, 25).map(x => x.folio.slice(-5)), yName: "Margen %", series: [{ name: "Margen", data: s.slice(0, 25).map(x => +(x.margen_pct || 0).toFixed(1)) }] },
    explicacion: "El servicio " + (top ? top.folio : "—") + " presenta el menor margen de utilidad (" + (top ? DM.fmtPct(top.margen_pct, 1) : "N/D") + "). Un margen bajo o negativo no se interpreta como pérdida operativa salvo que exista costo total e ingreso registrados.",
    formula: "margen % = (ingresos − costo_operativo_total) / ingresos × 100.",
  });
};

ANALISIS.A05 = (ctx) => {
  const meses = agregarPorMes(ctx.servicios);
  const totalCosto = meses.reduce((a, x) => a + x.costo, 0);
  const totalPres = meses.reduce((a, x) => a + x.presupuesto, 0);
  return componer(ctx, {
    titulo: "Evolución de gastos",
    kpis: [
      { label: "Gasto total", value: DM.fmtMXN(totalCosto), unit: "MXN", note: "combustible" },
      { label: "Presupuesto total", value: DM.fmtMXN(totalPres), unit: "MXN", note: "" },
      { label: "Meses", value: String(meses.length), unit: "", note: "" },
    ],
    tabla: { headers: ["Mes", "Servicios", "Costo (MXN)", "Presupuesto (MXN)"], filas: meses.map(x => [x.mes, x.n, DM.fmtMXN(x.costo), DM.fmtMXN(x.presupuesto)]) },
    grafica: { tipo: "line", xData: meses.map(x => x.mes), yName: "MXN", series: [{ name: "Costo", data: meses.map(x => +x.costo.toFixed(2)) }, { name: "Presupuesto", data: meses.map(x => +x.presupuesto.toFixed(2)) }] },
    explicacion: "El gasto en combustible evoluciona mes a mes, con un total de " + DM.fmtMXN(totalCosto) + " MXN frente a un presupuesto de " + DM.fmtMXN(totalPres) + " MXN en el periodo.",
    formula: "gasto mensual = Σ costo_consumo_MXN por mes; presupuesto = Σ presupuesto_MXN por mes.",
  });
};

ANALISIS.A06 = (ctx) => {
  const a = DM.agregados(ctx.servicios);
  const meses = agregarPorMes(ctx.servicios).map(m => ({ mes: m.mes, kmL: m.km > 0 ? m.km / m.litros : null }));
  return componer(ctx, {
    titulo: "Eficiencia de la flota",
    kpis: [
      { label: "Rendimiento ponderado", value: a.rendimiento_kmL != null ? a.rendimiento_kmL.toFixed(2) : "No calculable", unit: "km/L", note: "ponderado" },
      { label: "Consumo", value: a.consumo_L_100km != null ? a.consumo_L_100km.toFixed(2) : "No calculable", unit: "L/100km", note: "" },
      { label: "Costo por km", value: a.costo_km_MXN != null ? DM.fmtNum(a.costo_km_MXN, 2) : "No calculable", unit: "MXN/km", note: "combustible" },
    ],
    tabla: { headers: ["Mes", "km/L ponderado"], filas: meses.map(x => [x.mes, DM.fmtNum(x.kmL, 2)]) },
    grafica: { tipo: "line", xData: meses.map(x => x.mes), yName: "km/L", series: [{ name: "Rendimiento", data: meses.map(x => +(x.kmL || 0).toFixed(2)) }] },
    explicacion: "El rendimiento ponderado de la flota es " + (a.rendimiento_kmL != null ? a.rendimiento_kmL.toFixed(2) : "no calculable") + " km/L. Se usa ponderación global (kilómetros válidos totales / litros válidos totales), no un promedio simple por servicio.",
    formula: "km/L = Σ km / Σ litros; L/100km = Σ litros / Σ km × 100; MXN/km = Σ costo / Σ km.",
  });
};

ANALISIS.A07 = (ctx) => {
  const n = ctx.servicios.length;
  const aTiempo = ctx.servicios.filter(s => s.retraso_h != null && s.retraso_h <= 0.01).length;
  const pct = n > 0 ? (aTiempo / n * 100) : null;
  const retrasoProm = n > 0 ? ctx.servicios.reduce((a, s) => a + (s.retraso_h || 0), 0) / n : null;
  const orden = ordenar(ctx.servicios, x => x.retraso_h, true);
  return componer(ctx, {
    titulo: "Cumplimiento de entregas",
    kpis: [
      { label: "Entregas a tiempo", value: String(aTiempo), unit: "", note: "" },
      { label: "Cumplimiento", value: pct != null ? DM.fmtPct(pct, 1) : "N/D", unit: "", note: "a tiempo" },
      { label: "Retraso promedio", value: DM.fmtNum(retrasoProm, 2), unit: "h", note: "" },
    ],
    tabla: { headers: ["Folio", "Fecha", "Planificado (h)", "Total (h)", "Retraso (h)", "Puntualidad"], filas: orden.slice(0, 30).map(x => [x.folio, x.fecha, DM.fmtNum(x.tiempo_planificado_h, 1), DM.fmtNum(x.tiempo_total_h, 1), DM.fmtNum(x.retraso_h, 2), DM.fmtPct(x.puntualidad_pct, 0)]) },
    grafica: { tipo: "bar", xData: orden.slice(0, 20).map(x => x.folio.slice(-5)), yName: "Retraso (h)", series: [{ name: "Retraso", data: orden.slice(0, 20).map(x => +(x.retraso_h || 0).toFixed(2)) }] },
    explicacion: "El cumplimiento de entregas a tiempo es del " + (pct != null ? DM.fmtPct(pct, 1) : "N/D") + ". Se considera a tiempo un servicio sin retraso respecto al tiempo planificado.",
    formula: "cumplimiento % = servicios con retraso_h ≈ 0 / total × 100.",
  });
};

ANALISIS.A08 = (ctx) => {
  const totalIncidencias = ctx.servicios.reduce((a, s) => a + (s.incidencias || 0), 0);
  const totalFallas = ctx.servicios.reduce((a, s) => a + (s.fallas || 0), 0);
  const conSeñales = ordenar(ctx.servicios.filter(s => s.señales.length > 0), s => s.incidencias || 0, true);
  return componer(ctx, {
    titulo: "Resumen de incidencias",
    kpis: [
      { label: "Incidencias", value: String(totalIncidencias), unit: "", note: "registradas" },
      { label: "Fallas", value: String(totalFallas), unit: "", note: "" },
      { label: "Servicios con señal", value: String(conSeñales.length), unit: "", note: "" },
    ],
    tabla: { headers: ["Folio", "Operador", "Incidencias", "Fallas", "Señales disparadas"], filas: conSeñales.slice(0, 30).map(x => [x.folio, x.operador, x.incidencias || 0, x.fallas || 0, x.señales.join("; ")]) },
    explicacion: conSeñales.length
      ? "Se registraron " + totalIncidencias + " incidencias y " + totalFallas + " fallas en " + conSeñales.length + " servicio(s). Las señales son deterministas (diferencia no explicada, ralentí, fallas o retraso) y no afirman fraude ni error humano."
      : "No se registraron incidencias ni señales de anomalía en el periodo seleccionado.",
    formula: "incidencias y fallas = Σ campos incidencias / fallas; señal = regla disparada (diferencia > " + DM.UMBRAL_DIF_NO_EXPLICADA_L + " L, ralentí > " + DM.UMBRAL_RALENTI_H + " h, fallas > 0 o retraso > 2 h).",
  });
};

// --- B ---
function filaOperador(g) {
  const a = DM.agregados(g.servicios);
  return { g, a };
}

function rankingOperadores(ctx, metrica, desc, { headers, filasFn, graficaFn }) {
  const grupos = DM.agrupar(ctx.servicios, "id_operador").map(filaOperador);
  const orden = ordenar(grupos, metrica, desc);
  const tabla = { headers, filas: orden.map(filasFn) };
  const grafica = graficaFn ? graficaFn(orden) : null;
  return { orden, tabla, grafica };
}

ANALISIS.B01 = (ctx) => {
  const { orden, tabla, grafica } = rankingOperadores(ctx, g => g.a.rendimiento_kmL, true, {
    headers: ["Operador", "Servicios", "km", "Litros", "km/L", "L/100km", "MXN/km"],
    filasFn: g => [g.g.clave, g.a.n, DM.fmtNum(g.a.km, 0), DM.fmtNum(g.a.litros, 1), DM.fmtNum(g.a.rendimiento_kmL, 2), DM.fmtNum(g.a.consumo_L_100km, 2), DM.fmtNum(g.a.costo_km_MXN, 2)],
    graficaFn: orden => ({ tipo: "hbar", xData: orden.map(g => nombreOperador(g.g.clave, ctx.data)), series: [{ name: "km/L", data: orden.map(g => +g.a.rendimiento_kmL.toFixed(2)) }] }),
  });
  const top = orden[0];
  return componer(ctx, {
    titulo: "Mejor rendimiento km/L",
    kpis: [
      { label: "Operador", value: top ? top.g.clave : "N/D", unit: "", note: "" },
      { label: "km/L ponderado", value: top ? DM.fmtNum(top.a.rendimiento_kmL, 2) : "N/D", unit: "km/L", note: "" },
      { label: "Servicios", value: top ? String(top.a.n) : "0", unit: "", note: "" },
    ],
    tabla, grafica,
    explicacion: "El operador " + (top ? top.g.clave : "—") + " presenta el mejor rendimiento ponderado (" + (top ? DM.fmtNum(top.a.rendimiento_kmL, 2) : "N/D") + " km/L). Rendimiento global = kilómetros válidos totales / litros válidos totales.",
    formula: "km/L = Σ km / Σ litros por operador (ponderado, no promedio simple).",
  });
};

ANALISIS.B02 = (ctx) => {
  const { orden, tabla, grafica } = rankingOperadores(ctx, g => g.a.rendimiento_kmL, false, {
    headers: ["Operador", "Servicios", "km", "Litros", "km/L", "L/100km", "MXN/km"],
    filasFn: g => [g.g.clave, g.a.n, DM.fmtNum(g.a.km, 0), DM.fmtNum(g.a.litros, 1), DM.fmtNum(g.a.rendimiento_kmL, 2), DM.fmtNum(g.a.consumo_L_100km, 2), DM.fmtNum(g.a.costo_km_MXN, 2)],
    graficaFn: orden => ({ tipo: "hbar", xData: orden.map(g => nombreOperador(g.g.clave, ctx.data)), series: [{ name: "km/L", data: orden.map(g => +g.a.rendimiento_kmL.toFixed(2)) }] }),
  });
  const top = orden[0];
  return componer(ctx, {
    titulo: "Peor rendimiento km/L",
    kpis: [
      { label: "Operador", value: top ? top.g.clave : "N/D", unit: "", note: "" },
      { label: "km/L ponderado", value: top ? DM.fmtNum(top.a.rendimiento_kmL, 2) : "N/D", unit: "km/L", note: "" },
      { label: "Servicios", value: top ? String(top.a.n) : "0", unit: "", note: "" },
    ],
    tabla, grafica,
    explicacion: "El operador " + (top ? top.g.clave : "—") + " presenta el rendimiento ponderado más bajo (" + (top ? DM.fmtNum(top.a.rendimiento_kmL, 2) : "N/D") + " km/L) en el periodo.",
    formula: "km/L = Σ km / Σ litros por operador.",
  });
};

ANALISIS.B03 = (ctx) => {
  const { orden, tabla, grafica } = rankingOperadores(ctx, g => g.a.costo, true, {
    headers: ["Operador", "Servicios", "Litros", "Costo (MXN)", "MXN/km"],
    filasFn: g => [g.g.clave, g.a.n, DM.fmtNum(g.a.litros, 1), DM.fmtMXN(g.a.costo), DM.fmtNum(g.a.costo_km_MXN, 2)],
    graficaFn: orden => ({ tipo: "hbar", xData: orden.map(g => nombreOperador(g.g.clave, ctx.data)), series: [{ name: "Costo (MXN)", data: orden.map(g => +g.a.costo.toFixed(2)) }] }),
  });
  const top = orden[0];
  return componer(ctx, {
    titulo: "Mayor gasto combustible",
    kpis: [
      { label: "Operador", value: top ? top.g.clave : "N/D", unit: "", note: "" },
      { label: "Gasto", value: top ? DM.fmtMXN(top.a.costo) : "N/D", unit: "MXN", note: "" },
      { label: "Litros", value: top ? DM.fmtNum(top.a.litros, 1) : "N/D", unit: "L", note: "" },
    ],
    tabla, grafica,
    explicacion: "El operador " + (top ? top.g.clave : "—") + " acumula el mayor gasto en combustible (" + (top ? DM.fmtMXN(top.a.costo) : "N/D") + " MXN) en el periodo.",
    formula: "gasto = Σ costo_consumo_MXN por operador.",
  });
};

ANALISIS.B04 = (ctx) => {
  const { orden, tabla, grafica } = rankingOperadores(ctx, g => g.a.costo_km_MXN, false, {
    headers: ["Operador", "Servicios", "km", "Costo (MXN)", "MXN/km"],
    filasFn: g => [g.g.clave, g.a.n, DM.fmtNum(g.a.km, 0), DM.fmtMXN(g.a.costo), DM.fmtNum(g.a.costo_km_MXN, 2)],
    graficaFn: orden => ({ tipo: "hbar", xData: orden.map(g => nombreOperador(g.g.clave, ctx.data)), series: [{ name: "MXN/km", data: orden.map(g => +g.a.costo_km_MXN.toFixed(2)) }] }),
  });
  const top = orden[0];
  return componer(ctx, {
    titulo: "Menor costo por km",
    kpis: [
      { label: "Operador", value: top ? top.g.clave : "N/D", unit: "", note: "" },
      { label: "Costo por km", value: top ? DM.fmtNum(top.a.costo_km_MXN, 2) : "N/D", unit: "MXN/km", note: "" },
    ],
    tabla, grafica,
    explicacion: "El operador " + (top ? top.g.clave : "—") + " presenta el menor costo por kilómetro (" + (top ? DM.fmtNum(top.a.costo_km_MXN, 2) : "N/D") + " MXN/km).",
    formula: "MXN/km = Σ costo / Σ km por operador.",
  });
};

ANALISIS.B05 = (ctx) => {
  const { orden, tabla, grafica } = rankingOperadores(ctx, g => g.a.n, true, {
    headers: ["Operador", "Servicios", "km", "Costo (MXN)"],
    filasFn: g => [g.g.clave, g.a.n, DM.fmtNum(g.a.km, 0), DM.fmtMXN(g.a.costo)],
    graficaFn: orden => ({ tipo: "hbar", xData: orden.map(g => nombreOperador(g.g.clave, ctx.data)), series: [{ name: "Servicios", data: orden.map(g => g.a.n) }] }),
  });
  const top = orden[0];
  return componer(ctx, {
    titulo: "Más servicios realizados",
    kpis: [
      { label: "Operador", value: top ? top.g.clave : "N/D", unit: "", note: "" },
      { label: "Servicios", value: top ? String(top.a.n) : "0", unit: "", note: "" },
    ],
    tabla, grafica,
    explicacion: "El operador " + (top ? top.g.clave : "—") + " registra la mayor cantidad de servicios (" + (top ? top.a.n : 0) + ") en el periodo.",
    formula: "servicios = conteo de registros por operador.",
  });
};

ANALISIS.B06 = (ctx) => {
  const { orden, tabla, grafica } = rankingOperadores(ctx, g => g.a.km, true, {
    headers: ["Operador", "Servicios", "km", "Litros"],
    filasFn: g => [g.g.clave, g.a.n, DM.fmtNum(g.a.km, 0), DM.fmtNum(g.a.litros, 1)],
    graficaFn: orden => ({ tipo: "hbar", xData: orden.map(g => nombreOperador(g.g.clave, ctx.data)), series: [{ name: "km", data: orden.map(g => +g.a.km.toFixed(0)) }] }),
  });
  const top = orden[0];
  return componer(ctx, {
    titulo: "Más kilómetros recorridos",
    kpis: [
      { label: "Operador", value: top ? top.g.clave : "N/D", unit: "", note: "" },
      { label: "Kilómetros", value: top ? DM.fmtNum(top.a.km, 0) : "N/D", unit: "km", note: "" },
    ],
    tabla, grafica,
    explicacion: "El operador " + (top ? top.g.clave : "—") + " acumula la mayor distancia recorrida (" + (top ? DM.fmtNum(top.a.km, 0) : "N/D") + " km).",
    formula: "km = Σ distancia_km por operador.",
  });
};

ANALISIS.B07 = (ctx) => {
  const { orden, tabla, grafica } = rankingOperadores(ctx, g => g.a.ahorro, true, {
    headers: ["Operador", "Servicios", "Presupuesto (MXN)", "Costo (MXN)", "Ahorro (MXN)"],
    filasFn: g => [g.g.clave, g.a.n, DM.fmtMXN(g.a.presupuesto), DM.fmtMXN(g.a.costo), DM.fmtMXN(g.a.ahorro)],
    graficaFn: orden => ({ tipo: "hbar", xData: orden.map(g => nombreOperador(g.g.clave, ctx.data)), series: [{ name: "Ahorro (MXN)", data: orden.map(g => +g.a.ahorro.toFixed(2)) }] }),
  });
  const top = orden[0];
  return componer(ctx, {
    titulo: "Mayor ahorro estimado",
    kpis: [
      { label: "Operador", value: top ? top.g.clave : "N/D", unit: "", note: "" },
      { label: "Ahorro estimado", value: top ? DM.fmtMXN(top.a.ahorro) : "N/D", unit: "MXN", note: "simulado" },
    ],
    tabla, grafica,
    explicacion: "El operador " + (top ? top.g.clave : "—") + " presenta el mayor ahorro estimado frente al presupuesto (" + (top ? DM.fmtMXN(top.a.ahorro) : "N/D") + " MXN). " + soloDemoNota(),
    formula: "ahorro estimado = Σ (presupuesto_MXN − costo_consumo_MXN) por operador. Es estimación, no ahorro financiero realizado.",
  });
};

ANALISIS.B08 = (ctx) => {
  const { orden, tabla, grafica } = rankingOperadores(ctx, g => g.a.incidencias, true, {
    headers: ["Operador", "Servicios", "Incidencias", "Fallas", "Dif. no explicada (L)", "Ralentí (h)"],
    filasFn: g => [g.g.clave, g.a.n, g.a.incidencias, g.a.fallas, DM.fmtNum(g.g.servicios.reduce((a, s) => a + (s.diferencia_no_explicada_L || 0), 0), 1), DM.fmtNum(g.a.ralenti, 2)],
    graficaFn: orden => ({ tipo: "hbar", xData: orden.map(g => nombreOperador(g.g.clave, ctx.data)), series: [{ name: "Incidencias", data: orden.map(g => g.a.incidencias) }] }),
  });
  const top = orden[0];
  return componer(ctx, {
    titulo: "Más incidencias",
    kpis: [
      { label: "Operador", value: top ? top.g.clave : "N/D", unit: "", note: "" },
      { label: "Incidencias", value: top ? String(top.a.incidencias) : "0", unit: "", note: "" },
    ],
    tabla, grafica,
    explicacion: "Las incidencias registradas por operador provienen del registro de incidentes DEMO. No se atribuye responsabilidad ni fraude a partir de un conteo; cada incidencia requiere revisión independiente.",
    formula: "incidencias = Σ incidencias por operador.",
  });
};

ANALISIS.B09 = (ctx) => {
  const grupos = DM.agrupar(ctx.servicios, "id_operador").map(g => ({ clave: g.clave, a: DM.agregados(g.servicios) }))
    .filter(g => g.a.puntualidad_pct != null);
  const orden = ordenar(grupos, g => g.a.puntualidad_pct, true);
  const top = orden[0];
  return componer(ctx, {
    titulo: "Mejor puntualidad",
    kpis: [
      { label: "Operador", value: top ? top.clave : "N/D", unit: "", note: "" },
      { label: "Puntualidad", value: top && top.a.puntualidad_pct != null ? DM.fmtPct(top.a.puntualidad_pct, 1) : "N/D", unit: "", note: "" },
      { label: "Retraso prom.", value: top ? DM.fmtNum(top.a.retraso_promedio_h, 2) : "N/D", unit: "h", note: "" },
    ],
    tabla: { headers: ["Operador", "Servicios", "Retraso prom. (h)", "Puntualidad"], filas: orden.map(g => [g.clave, g.a.n, DM.fmtNum(g.a.retraso_promedio_h, 2), DM.fmtPct(g.a.puntualidad_pct, 1)]) },
    grafica: { tipo: "hbar", xData: orden.map(g => nombreOperador(g.clave, ctx.data)), series: [{ name: "Puntualidad %", data: orden.map(g => +(g.a.puntualidad_pct || 0).toFixed(1)) }] },
    explicacion: "El operador " + (top ? top.clave : "—") + " presenta la mejor puntualidad (" + (top ? DM.fmtPct(top.a.puntualidad_pct, 1) : "N/D") + "). Retraso = max(0, tiempo_real − tiempo_planificado).",
    formula: "puntualidad % = servicios sin retraso / total × 100 por operador.",
  });
};

ANALISIS.B10 = (ctx) => {
  const grupos = DM.agrupar(ctx.servicios, "id_operador").map(g => ({ clave: g.clave, a: DM.agregados(g.servicios) }))
    .filter(g => g.a.n >= 1 && g.a.rendimiento_kmL != null && g.a.costo_km_MXN != null);
  if (grupos.length === 0) return noDisponible(ctx, "Mejor desempeño integral", "tiempo_planificado");
  const rend = normalizarMinMax(grupos.map(g => g.a.rendimiento_kmL), false);
  const costoInv = normalizarMinMax(grupos.map(g => g.a.costo_km_MXN), true);
  const ahorro = normalizarMinMax(grupos.map(g => g.a.ahorro), false);
  const incInv = normalizarMinMax(grupos.map(g => g.a.incidencias), true);
  grupos.forEach((g, i) => {
    g.score = (rend[i] || 0) * 0.30 + (costoInv[i] || 0) * 0.30 + (ahorro[i] || 0) * 0.20 + (incInv[i] || 0) * 0.20;
  });
  const orden = ordenar(grupos, g => g.score, true);
  const top = orden[0];
  return componer(ctx, {
    titulo: "Mejor desempeño integral",
    kpis: [
      { label: "Operador", value: top ? top.clave : "N/D", unit: "", note: "" },
      { label: "Puntuación", value: top ? (top.score * 100).toFixed(1) : "N/D", unit: "/100", note: "normalizada" },
    ],
    tabla: { headers: ["Operador", "km/L", "MXN/km", "Ahorro (MXN)", "Señales", "Puntaje (0–100)"], filas: orden.map(g => [g.clave, DM.fmtNum(g.a.rendimiento_kmL, 2), DM.fmtNum(g.a.costo_km_MXN, 2), DM.fmtMXN(g.a.ahorro), g.a.incidencias, (g.score * 100).toFixed(1)]) },
    grafica: { tipo: "hbar", xData: orden.map(g => nombreOperador(g.clave, ctx.data)), series: [{ name: "Puntaje", data: orden.map(g => +(g.score * 100).toFixed(1)) }] },
    explicacion: "El desempeño integral combina métricas normalizadas con pesos documentados: rendimiento (30%), menor costo por km (30%), ahorro (20%) y menos incidencias (20%). Las métricas faltantes (puntualidad) se excluyen del puntaje.",
    formula: "puntaje = 0.30·norm(km/L) + 0.30·norm(menor costo/km) + 0.20·norm(ahorro) + 0.20·norm(menos incidencias).",
  });
};

// --- C ---
function gruposUnidades(ctx) {
  return DM.agrupar(ctx.servicios, "id_vehiculo").map(g => ({ clave: g.clave, a: DM.agregados(g.servicios), n: g.servicios.length }));
}

function rankingUnidades(ctx, metrica, desc, opts) {
  const unidades = gruposUnidades(ctx);
  const orden = ordenar(unidades, metrica, desc);
  const tabla = { headers: opts.headers, filas: orden.map(opts.filasFn) };
  const grafica = opts.graficaFn ? opts.graficaFn(orden) : null;
  return { orden, tabla, grafica };
}

ANALISIS.C01 = (ctx) => {
  const { orden, tabla, grafica } = rankingUnidades(ctx, u => u.a.costo, true, {
    headers: ["Unidad", "Servicios", "Litros", "Gasto (MXN)", "km/L"],
    filasFn: u => [nombreVehiculo(u.clave, ctx.data), u.n, DM.fmtNum(u.a.litros, 1), DM.fmtMXN(u.a.costo), DM.fmtNum(u.a.rendimiento_kmL, 2)],
    graficaFn: orden => ({ tipo: "bar", xData: orden.map(u => nombreVehiculo(u.clave, ctx.data)), yName: "MXN", series: [{ name: "Gasto combustible", data: orden.map(u => +u.a.costo.toFixed(2)) }] }),
  });
  const top = orden[0];
  return componer(ctx, {
    titulo: "Camión más gastón",
    kpis: [
      { label: "Unidad", value: top ? nombreVehiculo(top.clave, ctx.data) : "N/D", unit: "", note: "" },
      { label: "Gasto total", value: top ? DM.fmtMXN(top.a.costo) : "N/D", unit: "MXN", note: "combustible" },
      { label: "Litros", value: top ? DM.fmtNum(top.a.litros, 1) : "N/D", unit: "L", note: "" },
      { label: "Rendimiento", value: top ? DM.fmtNum(top.a.rendimiento_kmL, 2) : "N/D", unit: "km/L", note: "" },
    ],
    tabla, grafica,
    explicacion: "El mayor gasto total de combustible corresponde a " + (top ? nombreVehiculo(top.clave, ctx.data) : "—") + " (" + (top ? DM.fmtMXN(top.a.costo) : "N/D") + " MXN). Nota: mayor gasto total, mayor consumo en litros y peor rendimiento normalizado no son el mismo concepto; aquí se muestran por separado.",
    formula: "gasto total = Σ costo_consumo_MXN; litros = Σ consumo_total_L; rendimiento = Σ km / Σ litros.",
  });
};

ANALISIS.C02 = (ctx) => {
  const { orden, tabla, grafica } = rankingUnidades(ctx, u => u.a.rendimiento_kmL, true, {
    headers: ["Unidad", "Servicios", "km", "Litros", "km/L", "L/100km"],
    filasFn: u => [nombreVehiculo(u.clave, ctx.data), u.n, DM.fmtNum(u.a.km, 0), DM.fmtNum(u.a.litros, 1), DM.fmtNum(u.a.rendimiento_kmL, 2), DM.fmtNum(u.a.consumo_L_100km, 2)],
    graficaFn: orden => ({ tipo: "bar", xData: orden.map(u => nombreVehiculo(u.clave, ctx.data)), yName: "km/L", series: [{ name: "Rendimiento", data: orden.map(u => +u.a.rendimiento_kmL.toFixed(2)) }] }),
  });
  const top = orden[0];
  return componer(ctx, {
    titulo: "Camión más eficiente",
    kpis: [
      { label: "Unidad", value: top ? nombreVehiculo(top.clave, ctx.data) : "N/D", unit: "", note: "" },
      { label: "km/L", value: top ? DM.fmtNum(top.a.rendimiento_kmL, 2) : "N/D", unit: "km/L", note: "" },
    ],
    tabla, grafica,
    explicacion: "La unidad " + (top ? nombreVehiculo(top.clave, ctx.data) : "—") + " presenta el mejor rendimiento ponderado (" + (top ? DM.fmtNum(top.a.rendimiento_kmL, 2) : "N/D") + " km/L).",
    formula: "km/L = Σ km / Σ litros por unidad.",
  });
};

ANALISIS.C03 = (ctx) => {
  const { orden, tabla, grafica } = rankingUnidades(ctx, u => u.a.costo_km_MXN, true, {
    headers: ["Unidad", "Servicios", "km", "Costo (MXN)", "MXN/km"],
    filasFn: u => [nombreVehiculo(u.clave, ctx.data), u.n, DM.fmtNum(u.a.km, 0), DM.fmtMXN(u.a.costo), DM.fmtNum(u.a.costo_km_MXN, 2)],
    graficaFn: orden => ({ tipo: "bar", xData: orden.map(u => nombreVehiculo(u.clave, ctx.data)), yName: "MXN/km", series: [{ name: "Costo por km", data: orden.map(u => +u.a.costo_km_MXN.toFixed(2)) }] }),
  });
  const top = orden[0];
  return componer(ctx, {
    titulo: "Mayor costo por km",
    kpis: [{ label: "Unidad", value: top ? nombreVehiculo(top.clave, ctx.data) : "N/D", unit: "", note: "" }, { label: "Costo por km", value: top ? DM.fmtNum(top.a.costo_km_MXN, 2) : "N/D", unit: "MXN/km", note: "" }],
    tabla, grafica,
    explicacion: "La unidad " + (top ? nombreVehiculo(top.clave, ctx.data) : "—") + " presenta el mayor costo por kilómetro (" + (top ? DM.fmtNum(top.a.costo_km_MXN, 2) : "N/D") + " MXN/km).",
    formula: "MXN/km = Σ costo / Σ km por unidad.",
  });
};

ANALISIS.C04 = (ctx) => {
  const { orden, tabla, grafica } = rankingUnidades(ctx, u => u.a.costo_km_MXN, false, {
    headers: ["Unidad", "Servicios", "km", "Costo (MXN)", "MXN/km"],
    filasFn: u => [nombreVehiculo(u.clave, ctx.data), u.n, DM.fmtNum(u.a.km, 0), DM.fmtMXN(u.a.costo), DM.fmtNum(u.a.costo_km_MXN, 2)],
    graficaFn: orden => ({ tipo: "bar", xData: orden.map(u => nombreVehiculo(u.clave, ctx.data)), yName: "MXN/km", series: [{ name: "Costo por km", data: orden.map(u => +u.a.costo_km_MXN.toFixed(2)) }] }),
  });
  const top = orden[0];
  return componer(ctx, {
    titulo: "Menor costo por km",
    kpis: [{ label: "Unidad", value: top ? nombreVehiculo(top.clave, ctx.data) : "N/D", unit: "", note: "" }, { label: "Costo por km", value: top ? DM.fmtNum(top.a.costo_km_MXN, 2) : "N/D", unit: "MXN/km", note: "" }],
    tabla, grafica,
    explicacion: "La unidad " + (top ? nombreVehiculo(top.clave, ctx.data) : "—") + " presenta el menor costo por kilómetro (" + (top ? DM.fmtNum(top.a.costo_km_MXN, 2) : "N/D") + " MXN/km).",
    formula: "MXN/km = Σ costo / Σ km por unidad.",
  });
};

ANALISIS.C05 = (ctx) => {
  const { orden, tabla, grafica } = rankingUnidades(ctx, u => u.a.km, true, {
    headers: ["Unidad", "Servicios", "km", "Horas"],
    filasFn: u => [nombreVehiculo(u.clave, ctx.data), u.n, DM.fmtNum(u.a.km, 0), DM.fmtNum(u.a.horas, 1)],
    graficaFn: orden => ({ tipo: "bar", xData: orden.map(u => nombreVehiculo(u.clave, ctx.data)), yName: "km", series: [{ name: "km", data: orden.map(u => +u.a.km.toFixed(0)) }] }),
  });
  const top = orden[0];
  return componer(ctx, {
    titulo: "Más kilómetros recorridos",
    kpis: [{ label: "Unidad", value: top ? nombreVehiculo(top.clave, ctx.data) : "N/D", unit: "", note: "" }, { label: "Kilómetros", value: top ? DM.fmtNum(top.a.km, 0) : "N/D", unit: "km", note: "" }],
    tabla, grafica,
    explicacion: "La unidad " + (top ? nombreVehiculo(top.clave, ctx.data) : "—") + " acumula " + (top ? DM.fmtNum(top.a.km, 0) : "N/D") + " km en el periodo.",
    formula: "km = Σ distancia_km por unidad.",
  });
};

ANALISIS.C06 = (ctx) => {
  const unidades = gruposUnidades(ctx).map(u => ({ ...u, detenido: u.a.horas != null ? (ctx.servicios.filter(s => s.id_vehiculo === u.clave).reduce((a, s) => a + (s.tiempo_detenido_h || 0), 0)) : null }));
  const orden = ordenar(unidades, u => u.detenido, true);
  const top = orden[0];
  const tabla = { headers: ["Unidad", "Servicios", "Tiempo detenido (h)", "Tiempo total (h)"], filas: orden.map(u => [nombreVehiculo(u.clave, ctx.data), u.n, DM.fmtNum(u.detenido, 1), DM.fmtNum(u.a.horas, 1)]) };
  return componer(ctx, {
    titulo: "Mayor tiempo detenido",
    kpis: [{ label: "Unidad", value: top ? nombreVehiculo(top.clave, ctx.data) : "N/D", unit: "", note: "" }, { label: "Tiempo detenido", value: top ? DM.fmtNum(top.detenido, 1) : "N/D", unit: "h", note: "" }],
    tabla, grafica: { tipo: "bar", xData: orden.map(u => nombreVehiculo(u.clave, ctx.data)), yName: "h", series: [{ name: "Detenido (h)", data: orden.map(u => +u.detenido.toFixed(1)) }] },
    explicacion: "La unidad " + (top ? nombreVehiculo(top.clave, ctx.data) : "—") + " acumula " + (top ? DM.fmtNum(top.detenido, 1) : "N/D") + " h detenida (tiempo total menos tiempo en movimiento).",
    formula: "tiempo detenido = Σ (tiempo_total_h − tiempo_movimiento_h) por unidad.",
  });
};

ANALISIS.C07 = (ctx) => {
  const unidades = gruposUnidades(ctx);
  const orden = ordenar(unidades, u => u.a.mantenimiento, true);
  const top = orden[0];
  return componer(ctx, {
    titulo: "Mayor gasto mantenimiento",
    kpis: [
      { label: "Unidad", value: top ? nombreVehiculo(top.clave, ctx.data) : "N/D", unit: "", note: "" },
      { label: "Mantenimiento", value: top ? DM.fmtMXN(top.a.mantenimiento) : "N/D", unit: "MXN", note: "" },
    ],
    tabla: { headers: ["Unidad", "Servicios", "km", "Mantenimiento (MXN)", "MXN/km"], filas: orden.map(u => [nombreVehiculo(u.clave, ctx.data), u.n, DM.fmtNum(u.a.km, 0), DM.fmtMXN(u.a.mantenimiento), DM.fmtNum(u.a.km > 0 ? u.a.mantenimiento / u.a.km : null, 2)]) },
    grafica: { tipo: "hbar", xData: orden.map(u => nombreVehiculo(u.clave, ctx.data)), series: [{ name: "Mantenimiento (MXN)", data: orden.map(u => +(u.a.mantenimiento || 0).toFixed(2)) }] },
    explicacion: "La unidad " + (top ? nombreVehiculo(top.clave, ctx.data) : "—") + " acumula el mayor gasto de mantenimiento (" + (top ? DM.fmtMXN(top.a.mantenimiento) : "N/D") + " MXN) en el periodo.",
    formula: "mantenimiento = Σ costo_mantenimiento_MXN por unidad.",
  });
};

ANALISIS.C08 = (ctx) => {
  const unidades = gruposUnidades(ctx);
  const fechas = ctx.servicios.map(s => s.fechaISO).filter(Boolean);
  const dias = fechas.length ? Math.max(1, (Math.max(...fechas) - Math.min(...fechas)) / 86400000 + 1) : null;
  const orden = unidades.map(u => ({ ...u, utilizacion: (dias != null && dias > 0 && u.a.horas != null) ? (u.a.horas / (dias * 24) * 100) : null }));
  const top = orden[0];
  return componer(ctx, {
    titulo: "Mayor utilización",
    kpis: [
      { label: "Unidad", value: top ? nombreVehiculo(top.clave, ctx.data) : "N/D", unit: "", note: "" },
      { label: "Utilización", value: top && top.utilizacion != null ? DM.fmtNum(top.utilizacion, 1) : "No calculable", unit: "% del periodo", note: "proxy" },
    ],
    tabla: { headers: ["Unidad", "Horas de operación", "Días del periodo", "Utilización (%)"], filas: orden.map(u => [nombreVehiculo(u.clave, ctx.data), DM.fmtNum(u.a.horas, 1), dias != null ? DM.fmtNum(dias, 0) : "N/D", u.utilizacion != null ? DM.fmtNum(u.utilizacion, 1) : "No calculable"]) },
    explicacion: "La utilización es un proxy: horas de operación / horas totales del periodo seleccionado. Requiere mayor contexto (disponibilidad de flota, turnos) para una interpretación completa.",
    formula: "utilización (%) = Σ tiempo_total_h / (días del periodo × 24) × 100.",
  });
};

ANALISIS.C09 = (ctx) => {
  const unidades = gruposUnidades(ctx);
  const orden = ordenar(unidades, u => u.a.fallas, true);
  const top = orden[0];
  return componer(ctx, {
    titulo: "Más fallas reportadas",
    kpis: [
      { label: "Unidad", value: top ? nombreVehiculo(top.clave, ctx.data) : "N/D", unit: "", note: "" },
      { label: "Fallas", value: top ? String(top.a.fallas) : "0", unit: "", note: "" },
    ],
    tabla: { headers: ["Unidad", "Servicios", "Fallas", "Incidencias"], filas: orden.map(u => [nombreVehiculo(u.clave, ctx.data), u.n, u.a.fallas, u.a.incidencias]) },
    grafica: { tipo: "hbar", xData: orden.map(u => nombreVehiculo(u.clave, ctx.data)), series: [{ name: "Fallas", data: orden.map(u => u.a.fallas) }] },
    explicacion: "La unidad " + (top ? nombreVehiculo(top.clave, ctx.data) : "—") + " registra la mayor cantidad de fallas (" + (top ? top.a.fallas : 0) + ") en el periodo.",
    formula: "fallas = Σ fallas por unidad.",
  });
};

ANALISIS.C10 = (ctx) => {
  const unidades = gruposUnidades(ctx);
  const tabla = { headers: ["Unidad", "Servicios", "km", "Litros", "km/L", "MXN/km", "Gasto (MXN)"], filas: unidades.map(u => [nombreVehiculo(u.clave, ctx.data), u.n, DM.fmtNum(u.a.km, 0), DM.fmtNum(u.a.litros, 1), DM.fmtNum(u.a.rendimiento_kmL, 2), DM.fmtNum(u.a.costo_km_MXN, 2), DM.fmtMXN(u.a.costo)]) };
  const notaUnica = unidades.length < 2 ? "Solo existe una unidad en los datos; no es posible establecer un ranking entre unidades." : "";
  return componer(ctx, {
    titulo: "Ranking general de unidades",
    kpis: [{ label: "Unidades", value: String(unidades.length), unit: "", note: "" }],
    tabla,
    explicacion: notaUnica || "Ranking de unidades por rendimiento y costo en el periodo seleccionado.",
    formula: "Comparación multi-métrica por unidad (km, litros, km/L, MXN/km, gasto).",
  });
};

// --- D ---
function gruposRutas(ctx) {
  return DM.agrupar(ctx.servicios, "id_ruta").map(g => ({ clave: g.clave, a: DM.agregados(g.servicios), n: g.servicios.length }));
}

ANALISIS.D01 = (ctx) => {
  const rutas = gruposRutas(ctx);
  const orden = ordenar(rutas, r => r.a.margen_pct, true);
  const top = orden[0];
  return componer(ctx, {
    titulo: "Ruta más rentable",
    kpis: [
      { label: "Ruta", value: top ? nombreRuta(top.clave, ctx.data) : "N/D", unit: "", note: "" },
      { label: "Margen", value: top && top.a.margen_pct != null ? DM.fmtPct(top.a.margen_pct, 1) : "N/D", unit: "", note: "" },
      { label: "Utilidad", value: top ? DM.fmtMXN(top.a.utilidad) : "N/D", unit: "MXN", note: "" },
    ],
    tabla: { headers: ["Ruta", "Servicios", "Ingresos (MXN)", "Costo (MXN)", "Utilidad (MXN)", "Margen"], filas: orden.map(r => [nombreRuta(r.clave, ctx.data), r.n, DM.fmtMXN(r.a.ingresos), DM.fmtMXN(r.a.costoOperativo), DM.fmtMXN(r.a.utilidad), DM.fmtPct(r.a.margen_pct, 1)]) },
    grafica: { tipo: "hbar", xData: orden.map(r => nombreRuta(r.clave, ctx.data)), series: [{ name: "Margen %", data: orden.map(r => +(r.a.margen_pct || 0).toFixed(1)) }] },
    explicacion: "La ruta " + (top ? nombreRuta(top.clave, ctx.data) : "—") + " presenta el mayor margen de utilidad (" + (top ? DM.fmtPct(top.a.margen_pct, 1) : "N/D") + "). Margen calculado con ingresos y costo operativo total.",
    formula: "margen % = (Σ ingresos − Σ costo_operativo_total) / Σ ingresos × 100 por ruta.",
  });
};

ANALISIS.D02 = (ctx) => {
  const rutas = gruposRutas(ctx);
  const orden = ordenar(rutas, r => r.a.margen_pct, false);
  const top = orden[0];
  return componer(ctx, {
    titulo: "Ruta menos rentable",
    kpis: [
      { label: "Ruta", value: top ? nombreRuta(top.clave, ctx.data) : "N/D", unit: "", note: "" },
      { label: "Margen", value: top && top.a.margen_pct != null ? DM.fmtPct(top.a.margen_pct, 1) : "N/D", unit: "", note: "" },
      { label: "Utilidad", value: top ? DM.fmtMXN(top.a.utilidad) : "N/D", unit: "MXN", note: "" },
    ],
    tabla: { headers: ["Ruta", "Servicios", "Ingresos (MXN)", "Costo (MXN)", "Utilidad (MXN)", "Margen"], filas: orden.map(r => [nombreRuta(r.clave, ctx.data), r.n, DM.fmtMXN(r.a.ingresos), DM.fmtMXN(r.a.costoOperativo), DM.fmtMXN(r.a.utilidad), DM.fmtPct(r.a.margen_pct, 1)]) },
    grafica: { tipo: "hbar", xData: orden.map(r => nombreRuta(r.clave, ctx.data)), series: [{ name: "Margen %", data: orden.map(r => +(r.a.margen_pct || 0).toFixed(1)) }] },
    explicacion: "La ruta " + (top ? nombreRuta(top.clave, ctx.data) : "—") + " presenta el menor margen de utilidad (" + (top ? DM.fmtPct(top.a.margen_pct, 1) : "N/D") + ").",
    formula: "margen % = (Σ ingresos − Σ costo_operativo_total) / Σ ingresos × 100 por ruta.",
  });
};

ANALISIS.D03 = (ctx) => {
  const rutas = gruposRutas(ctx);
  const orden = ordenar(rutas, r => r.a.costo, true);
  const top = orden[0];
  return componer(ctx, {
    titulo: "Ruta más costosa",
    kpis: [{ label: "Ruta", value: top ? nombreRuta(top.clave, ctx.data) : "N/D", unit: "", note: "" }, { label: "Costo total", value: top ? DM.fmtMXN(top.a.costo) : "N/D", unit: "MXN", note: "combustible" }],
    tabla: { headers: ["Ruta", "Servicios", "km", "Litros", "Costo (MXN)", "MXN/km"], filas: orden.map(r => [nombreRuta(r.clave, ctx.data), r.n, DM.fmtNum(r.a.km, 0), DM.fmtNum(r.a.litros, 1), DM.fmtMXN(r.a.costo), DM.fmtNum(r.a.costo_km_MXN, 2)]) },
    grafica: { tipo: "bar", xData: orden.map(r => nombreRuta(r.clave, ctx.data)), yName: "MXN", series: [{ name: "Costo", data: orden.map(r => +r.a.costo.toFixed(2)) }] },
    explicacion: "La ruta " + (top ? nombreRuta(top.clave, ctx.data) : "—") + " acumula el mayor costo (" + (top ? DM.fmtMXN(top.a.costo) : "N/D") + " MXN). No incluye casetas (datos ausentes).",
    formula: "costo = Σ costo_consumo_MXN por ruta.",
  });
};

ANALISIS.D04 = (ctx) => {
  const rutas = gruposRutas(ctx);
  const orden = ordenar(rutas, r => r.a.costo_km_MXN, false);
  const top = orden[0];
  return componer(ctx, {
    titulo: "Ruta más económica por km",
    kpis: [{ label: "Ruta", value: top ? nombreRuta(top.clave, ctx.data) : "N/D", unit: "", note: "" }, { label: "Costo por km", value: top ? DM.fmtNum(top.a.costo_km_MXN, 2) : "N/D", unit: "MXN/km", note: "" }],
    tabla: { headers: ["Ruta", "Servicios", "km", "Costo (MXN)", "MXN/km"], filas: orden.map(r => [nombreRuta(r.clave, ctx.data), r.n, DM.fmtNum(r.a.km, 0), DM.fmtMXN(r.a.costo), DM.fmtNum(r.a.costo_km_MXN, 2)]) },
    grafica: { tipo: "bar", xData: orden.map(r => nombreRuta(r.clave, ctx.data)), yName: "MXN/km", series: [{ name: "MXN/km", data: orden.map(r => +r.a.costo_km_MXN.toFixed(2)) }] },
    explicacion: "La ruta " + (top ? nombreRuta(top.clave, ctx.data) : "—") + " es la más económica por kilómetro (" + (top ? DM.fmtNum(top.a.costo_km_MXN, 2) : "N/D") + " MXN/km). La distancia más corta no equivale necesariamente a la ruta más económica; aquí solo se compara costo/km.",
    formula: "MXN/km = Σ costo / Σ km por ruta.",
  });
};

ANALISIS.D05 = (ctx) => {
  const rutas = gruposRutas(ctx);
  const orden = ordenar(rutas, r => r.a.litros, true);
  const top = orden[0];
  return componer(ctx, {
    titulo: "Mayor consumo combustible",
    kpis: [{ label: "Ruta", value: top ? nombreRuta(top.clave, ctx.data) : "N/D", unit: "", note: "" }, { label: "Litros", value: top ? DM.fmtNum(top.a.litros, 1) : "N/D", unit: "L", note: "" }],
    tabla: { headers: ["Ruta", "Servicios", "km", "Litros", "km/L"], filas: orden.map(r => [nombreRuta(r.clave, ctx.data), r.n, DM.fmtNum(r.a.km, 0), DM.fmtNum(r.a.litros, 1), DM.fmtNum(r.a.rendimiento_kmL, 2)]) },
    grafica: { tipo: "bar", xData: orden.map(r => nombreRuta(r.clave, ctx.data)), yName: "L", series: [{ name: "Litros", data: orden.map(r => +r.a.litros.toFixed(1)) }] },
    explicacion: "La ruta " + (top ? nombreRuta(top.clave, ctx.data) : "—") + " registra el mayor consumo (" + (top ? DM.fmtNum(top.a.litros, 1) : "N/D") + " L).",
    formula: "litros = Σ consumo_total_L por ruta.",
  });
};

ANALISIS.D06 = (ctx) => {
  const rutas = gruposRutas(ctx);
  const orden = ordenar(rutas, r => r.a.casetas, true);
  const top = orden[0];
  return componer(ctx, {
    titulo: "Mayor gasto en casetas",
    kpis: [
      { label: "Ruta", value: top ? nombreRuta(top.clave, ctx.data) : "N/D", unit: "", note: "" },
      { label: "Casetas", value: top ? DM.fmtMXN(top.a.casetas) : "N/D", unit: "MXN", note: "" },
    ],
    tabla: { headers: ["Ruta", "Servicios", "km", "Casetas (MXN)", "MXN/km"], filas: orden.map(r => [nombreRuta(r.clave, ctx.data), r.n, DM.fmtNum(r.a.km, 0), DM.fmtMXN(r.a.casetas), DM.fmtNum(r.a.km > 0 ? r.a.casetas / r.a.km : null, 2)]) },
    grafica: { tipo: "hbar", xData: orden.map(r => nombreRuta(r.clave, ctx.data)), series: [{ name: "Casetas (MXN)", data: orden.map(r => +(r.a.casetas || 0).toFixed(2)) }] },
    explicacion: "La ruta " + (top ? nombreRuta(top.clave, ctx.data) : "—") + " acumula el mayor gasto en casetas (" + (top ? DM.fmtMXN(top.a.casetas) : "N/D") + " MXN).",
    formula: "casetas = Σ costo_casetas_MXN por ruta.",
  });
};

ANALISIS.D07 = (ctx) => {
  const rutas = gruposRutas(ctx);
  const orden = ordenar(rutas, r => r.a.retraso_promedio_h, true);
  const top = orden[0];
  return componer(ctx, {
    titulo: "Mayor retraso promedio",
    kpis: [
      { label: "Ruta", value: top ? nombreRuta(top.clave, ctx.data) : "N/D", unit: "", note: "" },
      { label: "Retraso prom.", value: top ? DM.fmtNum(top.a.retraso_promedio_h, 2) : "N/D", unit: "h", note: "" },
    ],
    tabla: { headers: ["Ruta", "Servicios", "Retraso prom. (h)", "Puntualidad"], filas: orden.map(r => [nombreRuta(r.clave, ctx.data), r.n, DM.fmtNum(r.a.retraso_promedio_h, 2), DM.fmtPct(r.a.puntualidad_pct, 1)]) },
    grafica: { tipo: "hbar", xData: orden.map(r => nombreRuta(r.clave, ctx.data)), series: [{ name: "Retraso (h)", data: orden.map(r => +(r.a.retraso_promedio_h || 0).toFixed(2)) }] },
    explicacion: "La ruta " + (top ? nombreRuta(top.clave, ctx.data) : "—") + " presenta el mayor retraso promedio (" + (top ? DM.fmtNum(top.a.retraso_promedio_h, 2) : "N/D") + " h).",
    formula: "retraso promedio = Σ retraso_h / nº servicios por ruta.",
  });
};

ANALISIS.D08 = (ctx) => {
  const rutas = gruposRutas(ctx);
  const orden = ordenar(rutas, r => r.a.horas, false);
  const top = orden[0];
  return componer(ctx, {
    titulo: "Menor tiempo de recorrido",
    kpis: [{ label: "Ruta", value: top ? nombreRuta(top.clave, ctx.data) : "N/D", unit: "", note: "" }, { label: "Tiempo total", value: top ? DM.fmtNum(top.a.horas, 1) : "N/D", unit: "h", note: "Σ servicios" }],
    tabla: { headers: ["Ruta", "Servicios", "Tiempo total (h)", "Tiempo movimiento (h)", "Ralentí (h)"], filas: orden.map(r => [nombreRuta(r.clave, ctx.data), r.n, DM.fmtNum(r.a.horas, 1), DM.fmtNum(ctx.servicios.filter(s => s.id_ruta === r.clave).reduce((a, s) => a + (s.tiempo_movimiento_h || 0), 0), 1), DM.fmtNum(r.a.ralenti, 1)]) },
    explicacion: "La ruta " + (top ? nombreRuta(top.clave, ctx.data) : "—") + " presenta el menor tiempo de recorrido acumulado (" + (top ? DM.fmtNum(top.a.horas, 1) : "N/D") + " h).",
    formula: "tiempo = Σ tiempo_total_h por ruta.",
  });
};

ANALISIS.D09 = (ctx) => {
  const servicios = ctx.servicios.filter(s => s.desviacion_distancia_pct != null);
  const prom = servicios.length ? servicios.reduce((a, s) => a + s.desviacion_distancia_pct, 0) / servicios.length : null;
  const orden = ordenar(servicios, s => s.desviacion_distancia_pct, true);
  return componer(ctx, {
    titulo: "Mayor desviación de distancia",
    kpis: [
      { label: "Desviación media", value: prom != null ? DM.fmtPct(prom, 1) : "No calculable", unit: "", note: "planificada vs real" },
      { label: "Servicios evaluados", value: String(servicios.length), unit: "", note: "" },
    ],
    tabla: { headers: ["Folio", "Ruta", "Planificada (km)", "Real (km)", "Desviación (km)", "Desviación (%)"], filas: orden.map(s => [s.folio, nombreRuta(s.id_ruta, ctx.data), DM.fmtNum(s.distancia_planificada_km, 0), DM.fmtNum(s.distancia_km, 0), DM.fmtNum(s.desviacion_distancia_km, 0), DM.fmtPct(s.desviacion_distancia_pct, 1)]) },
    grafica: { tipo: "bar", xData: orden.map(s => s.folio.slice(-5)), yName: "%", series: [{ name: "Desviación %", data: orden.map(s => +s.desviacion_distancia_pct.toFixed(1)) }] },
    explicacion: "La desviación de distancia compara la distancia administrativa de la ruta con la distancia ejecutada. La desviación media es " + (prom != null ? DM.fmtPct(prom, 1) : "no calculable") + ".",
    formula: "desviación % = (distancia_real − distancia_planificada) / distancia_planificada × 100.",
  });
};

ANALISIS.D10 = (ctx) => {
  const rutas = gruposRutas(ctx);
  const tabla = { headers: ["Ruta", "Servicios", "km", "Litros", "Costo (MXN)", "MXN/km"], filas: rutas.map(r => [nombreRuta(r.clave, ctx.data), r.n, DM.fmtNum(r.a.km, 0), DM.fmtNum(r.a.litros, 1), DM.fmtMXN(r.a.costo), DM.fmtNum(r.a.costo_km_MXN, 2)]) };
  const notaUnica = rutas.length < 2 ? "Solo existe una ruta en los datos; no es posible establecer un ranking entre rutas." : "";
  return componer(ctx, {
    titulo: "Ranking de rutas",
    kpis: [{ label: "Rutas", value: String(rutas.length), unit: "", note: "" }],
    tabla,
    explicacion: notaUnica || "Ranking de rutas por costo y consumo en el periodo seleccionado.",
    formula: "Comparación multi-métrica por ruta.",
  });
};

// --- E ---
ANALISIS.E01 = (ctx) => {
  const s = ordenar(ctx.servicios, x => x.litros_consumidos_L, true);
  const top = s[0];
  return componer(ctx, {
    titulo: "Mayor consumo en litros",
    kpis: [{ label: "Folio", value: top ? top.folio : "N/D", unit: "", note: "" }, { label: "Litros", value: top ? DM.fmtNum(top.litros_consumidos_L, 1) : "N/D", unit: "L", note: "" }],
    tabla: { headers: ["Folio", "Fecha", "Litros", "km", "km/L"], filas: s.map(x => [x.folio, x.fecha, DM.fmtNum(x.litros_consumidos_L, 1), DM.fmtNum(x.distancia_km, 0), DM.fmtNum(x.rendimiento_kmL, 2)]) },
    grafica: { tipo: "bar", xData: s.map(x => x.folio.slice(-5)), yName: "L", series: [{ name: "Litros", data: s.map(x => +x.litros_consumidos_L.toFixed(1)) }] },
    explicacion: "El servicio " + (top ? top.folio : "—") + " presenta el mayor consumo en litros (" + (top ? DM.fmtNum(top.litros_consumidos_L, 1) : "N/D") + " L). Los litros cargados no se igualan a litros consumidos; se usa consumo total del balance.",
    formula: "litros = consumo_total_L (salida según balance).",
  });
};

ANALISIS.E02 = (ctx) => {
  const s = ordenar(ctx.servicios, x => x.rendimiento_kmL, false);
  const top = s[0];
  return componer(ctx, {
    titulo: "Menor rendimiento km/L",
    kpis: [{ label: "Folio", value: top ? top.folio : "N/D", unit: "", note: "" }, { label: "km/L", value: top ? DM.fmtNum(top.rendimiento_kmL, 2) : "N/D", unit: "km/L", note: "" }],
    tabla: { headers: ["Folio", "Fecha", "km/L", "L/100km", "Litros"], filas: s.map(x => [x.folio, x.fecha, DM.fmtNum(x.rendimiento_kmL, 2), DM.fmtNum(x.consumo_L_100km, 2), DM.fmtNum(x.litros_consumidos_L, 1)]) },
    grafica: { tipo: "bar", xData: s.map(x => x.folio.slice(-5)), yName: "km/L", series: [{ name: "km/L", data: s.map(x => +x.rendimiento_kmL.toFixed(2)) }] },
    explicacion: "El servicio " + (top ? top.folio : "—") + " presenta el menor rendimiento (" + (top ? DM.fmtNum(top.rendimiento_kmL, 2) : "N/D") + " km/L).",
    formula: "km/L = distancia / litros; L/100km = litros / distancia × 100.",
  });
};

ANALISIS.E03 = (ctx) => {
  const s = ordenar(ctx.servicios, x => x.precio_promedio_L_MXN, true);
  const top = s[0];
  return componer(ctx, {
    titulo: "Mayor precio por litro",
    kpis: [{ label: "Folio", value: top ? top.folio : "N/D", unit: "", note: "" }, { label: "Precio/L", value: top ? DM.fmtNum(top.precio_promedio_L_MXN, 2) : "No calculable", unit: "MXN/L", note: "ponderado" }],
    tabla: { headers: ["Folio", "Costo (MXN)", "Litros", "Precio/L (MXN)"], filas: s.map(x => [x.folio, DM.fmtMXN(x.costo_consumo_MXN), DM.fmtNum(x.litros_consumidos_L, 1), DM.fmtNum(x.precio_promedio_L_MXN, 2)]) },
    grafica: { tipo: "bar", xData: s.map(x => x.folio.slice(-5)), yName: "MXN/L", series: [{ name: "Precio/L", data: s.map(x => +(x.precio_promedio_L_MXN || 0).toFixed(2)) }] },
    explicacion: "El precio promedio ponderado por litro es gasto total / litros totales. El máximo corresponde al servicio " + (top ? top.folio : "—") + " (" + (top ? DM.fmtNum(top.precio_promedio_L_MXN, 2) : "N/D") + " MXN/L).",
    formula: "precio/L = costo_consumo_MXN / consumo_total_L (ponderado).",
  });
};

ANALISIS.E04 = (ctx) => {
  const s = ordenar(ctx.servicios, x => x.costo_por_km_MXN, true);
  const top = s[0];
  return componer(ctx, {
    titulo: "Mayor costo por km",
    kpis: [{ label: "Folio", value: top ? top.folio : "N/D", unit: "", note: "" }, { label: "Costo por km", value: top ? DM.fmtNum(top.costo_por_km_MXN, 2) : "N/D", unit: "MXN/km", note: "" }],
    tabla: { headers: ["Folio", "Costo (MXN)", "km", "MXN/km"], filas: s.map(x => [x.folio, DM.fmtMXN(x.costo_consumo_MXN), DM.fmtNum(x.distancia_km, 0), DM.fmtNum(x.costo_por_km_MXN, 2)]) },
    grafica: { tipo: "bar", xData: s.map(x => x.folio.slice(-5)), yName: "MXN/km", series: [{ name: "MXN/km", data: s.map(x => +x.costo_por_km_MXN.toFixed(2)) }] },
    explicacion: "El servicio " + (top ? top.folio : "—") + " presenta el mayor costo por kilómetro (" + (top ? DM.fmtNum(top.costo_por_km_MXN, 2) : "N/D") + " MXN/km).",
    formula: "MXN/km = costo_consumo_MXN / distancia_km.",
  });
};

ANALISIS.E05 = (ctx) => {
  const refPorVeh = new Map(ctx.data.vehiculos.map(v => [v.ID_VEHICULO, v.rend_admin_ref_kmL]));
  const refs = ctx.data.vehiculos.map(v => v.rend_admin_ref_kmL);
  const refProm = refs.length ? refs.reduce((a, b) => a + b, 0) / refs.length : null;
  const calcRef = s => { const r = refPorVeh.get(s.id_vehiculo); return r ? 100 / r : null; };
  const fuera = ctx.servicios.filter(s => { const rl = calcRef(s); return s.consumo_L_100km != null && rl != null && s.consumo_L_100km > rl; });
  const orden = ordenar(ctx.servicios, s => { const rl = calcRef(s); return (rl != null && s.consumo_L_100km != null) ? (s.consumo_L_100km - rl) : -Infinity; }, true);
  return componer(ctx, {
    titulo: "Consumo fuera de referencia",
    kpis: [
      { label: "Referencia media", value: refProm ? DM.fmtNum(refProm, 2) : "N/D", unit: "km/L", note: "flota" },
      { label: "Referencia media", value: refProm ? DM.fmtNum(100 / refProm, 2) : "N/D", unit: "L/100km", note: "" },
      { label: "Fuera de referencia", value: String(fuera.length), unit: "", note: "" },
    ],
    tabla: { headers: ["Folio", "Unidad", "L/100km", "Referencia (L/100km)", "Estado"], filas: orden.slice(0, 30).map(s => { const rl = calcRef(s); return [s.folio, s.id_vehiculo, DM.fmtNum(s.consumo_L_100km, 2), DM.fmtNum(rl, 2), (rl != null && s.consumo_L_100km > rl) ? "Fuera de referencia" : "Dentro de referencia"]; }) },
    grafica: { tipo: "bar", xData: orden.slice(0, 25).map(s => s.folio.slice(-5)), yName: "L/100km", series: [{ name: "Consumo", data: orden.slice(0, 25).map(s => +s.consumo_L_100km.toFixed(2)) }, { name: "Referencia", data: orden.slice(0, 25).map(s => +(calcRef(s) || 0).toFixed(2)) }] },
    explicacion: fuera.length
      ? "Se detectaron " + fuera.length + " servicio(s) con consumo superior a la referencia de su unidad (rendimiento administrativo)."
      : "Ningún servicio supera la referencia de consumo de su unidad en el periodo seleccionado.",
    formula: "referencia L/100km = 100 / rendimiento_administrativo_kmL de cada unidad; fuera de referencia = consumo_L_100km > referencia.",
  });
};

ANALISIS.E06 = (ctx) => {
  const s = ordenar(ctx.servicios, x => x.ahorro_sobrecosto_MXN, true);
  const total = s.reduce((a, x) => a + (x.ahorro_sobrecosto_MXN || 0), 0);
  return componer(ctx, {
    titulo: "Ahorro estimado",
    kpis: [{ label: "Ahorro total", value: DM.fmtMXN(total), unit: "MXN", note: "simulado" }],
    tabla: { headers: ["Folio", "Presupuesto (MXN)", "Costo (MXN)", "Ahorro (MXN)"], filas: s.map(x => [x.folio, DM.fmtMXN(x.presupuesto_MXN), DM.fmtMXN(x.costo_consumo_MXN), DM.fmtMXN(x.ahorro_sobrecosto_MXN)]) },
    grafica: { tipo: "bar", xData: s.map(x => x.folio.slice(-5)), yName: "MXN", series: [{ name: "Ahorro", data: s.map(x => +x.ahorro_sobrecosto_MXN.toFixed(2)) }] },
    explicacion: "El ahorro estimado total es " + DM.fmtMXN(total) + " MXN. " + soloDemoNota() + " El ahorro estimado no constituye ahorro financiero realizado.",
    formula: "ahorro = presupuesto_MXN − costo_consumo_MXN.",
  });
};

ANALISIS.E07 = (ctx) => {
  const meses = agregarPorMes(ctx.servicios);
  const totalL = meses.reduce((a, x) => a + x.litros, 0);
  return componer(ctx, {
    titulo: "Evolución de combustible",
    kpis: [{ label: "Litros totales", value: DM.fmtNum(totalL, 1), unit: "L", note: "" }],
    tabla: { headers: ["Mes", "Servicios", "Litros", "km"], filas: meses.map(x => [x.mes, x.n, DM.fmtNum(x.litros, 1), DM.fmtNum(x.km, 0)]) },
    grafica: { tipo: "line", xData: meses.map(x => x.mes), yName: "L", series: [{ name: "Litros", data: meses.map(x => +x.litros.toFixed(1)) }] },
    explicacion: "Evolución del consumo en litros mes a mes a lo largo del periodo seleccionado.",
    formula: "litros mensuales = Σ consumo_total_L por mes.",
  });
};

ANALISIS.E08 = (ctx) => {
  const grupos = DM.agrupar(ctx.servicios, "id_vehiculo").map(g => ({ clave: g.clave, a: DM.agregados(g.servicios) }));
  const modelo = (id) => { const v = ctx.data.vehiculos.find(x => x.ID_VEHICULO === id); return v ? v.modelo_operativo : id; };
  const orden = ordenar(grupos, g => g.a.costo, true);
  return componer(ctx, {
    titulo: "Costo por tipo de unidad",
    kpis: [{ label: "Tipos de unidad", value: String(grupos.length), unit: "", note: "" }],
    tabla: { headers: ["Tipo de unidad", "Servicios", "Litros", "Costo (MXN)", "MXN/km"], filas: orden.map(g => [modelo(g.clave), g.a.n, DM.fmtNum(g.a.litros, 1), DM.fmtMXN(g.a.costo), DM.fmtNum(g.a.costo_km_MXN, 2)]) },
    grafica: { tipo: "bar", xData: orden.map(g => modelo(g.clave)), yName: "MXN", series: [{ name: "Costo", data: orden.map(g => +g.a.costo.toFixed(2)) }] },
    explicacion: "Costo de combustible agregado por tipo de unidad. En los datos actuales existe un único tipo (" + (orden[0] ? modelo(orden[0].clave) : "N/D") + ").",
    formula: "costo = Σ costo_consumo_MXN por tipo de unidad.",
  });
};

ANALISIS.E09 = (ctx) => {
  const grupos = gruposRutas(ctx);
  const orden = ordenar(grupos, g => g.a.costo, true);
  return componer(ctx, {
    titulo: "Gasto por ruta",
    kpis: [{ label: "Rutas", value: String(grupos.length), unit: "", note: "" }],
    tabla: { headers: ["Ruta", "Servicios", "Litros", "Costo (MXN)"], filas: orden.map(g => [nombreRuta(g.clave, ctx.data), g.n, DM.fmtNum(g.a.litros, 1), DM.fmtMXN(g.a.costo)]) },
    grafica: { tipo: "bar", xData: orden.map(g => nombreRuta(g.clave, ctx.data)), yName: "MXN", series: [{ name: "Costo", data: orden.map(g => +g.a.costo.toFixed(2)) }] },
    explicacion: "Gasto en combustible agregado por ruta en el periodo seleccionado.",
    formula: "gasto = Σ costo_consumo_MXN por ruta.",
  });
};

ANALISIS.E10 = (ctx) => {
  const porMes = {};
  ctx.servicios.forEach(s => {
    const mes = s.fecha ? s.fecha.slice(0, 7) : "N/D";
    if (!porMes[mes]) porMes[mes] = { costo: 0, litros: 0, n: 0 };
    porMes[mes].costo += (s.costo_consumo_MXN || 0);
    porMes[mes].litros += (s.litros_consumidos_L || 0);
    porMes[mes].n += 1;
  });
  const meses = Object.keys(porMes).sort();
  const filas = meses.map((m, i) => {
    const prev = i > 0 ? porMes[meses[i - 1]] : null;
    const cambio = prev && prev.costo !== 0 ? ((porMes[m].costo - prev.costo) / prev.costo * 100) : null;
    return [m, porMes[m].n, DM.fmtNum(porMes[m].litros, 1), DM.fmtMXN(porMes[m].costo), cambio != null ? DM.fmtPct(cambio, 1) : "—"];
  });
  return componer(ctx, {
    titulo: "Desviación mensual",
    kpis: [{ label: "Meses", value: String(meses.length), unit: "", note: "" }],
    tabla: { headers: ["Mes", "Servicios", "Litros", "Costo (MXN)", "Cambio vs mes anterior"], filas },
    grafica: { tipo: "line", xData: meses, yName: "MXN", series: [{ name: "Costo mensual", data: meses.map(m => +porMes[m].costo.toFixed(2)) }] },
    explicacion: "Variación mensual del gasto en combustible. El cambio porcentual se calcula frente al mes anterior del periodo seleccionado.",
    formula: "cambio % = (costo_mes − costo_mes_anterior) / costo_mes_anterior × 100.",
  });
};

// --- F ---
function compararEntidad(ctx, clave, nombreFn) {
  const grupos = DM.agrupar(ctx.servicios, clave).map(g => ({ clave: g.clave, a: DM.agregados(g.servicios), n: g.servicios.length }));
  return { grupos, nombre: nombreFn };
}

ANALISIS.F01 = (ctx) => {
  const { grupos, nombre } = compararEntidad(ctx, "id_operador", (id) => nombreOperador(id, ctx.data));
  const orden = ordenar(grupos, g => g.a.rendimiento_kmL, true);
  return componer(ctx, {
    titulo: "Chofer vs. chofer",
    kpis: [{ label: "Operadores comparados", value: String(orden.length), unit: "", note: "" }],
    tabla: { headers: ["Operador", "Servicios", "km", "Litros", "km/L", "MXN/km", "Ahorro (MXN)", "Señales"], filas: orden.map(g => [nombre(g.clave), g.n, DM.fmtNum(g.a.km, 0), DM.fmtNum(g.a.litros, 1), DM.fmtNum(g.a.rendimiento_kmL, 2), DM.fmtNum(g.a.costo_km_MXN, 2), DM.fmtMXN(g.a.ahorro), g.a.incidencias]) },
    grafica: { tipo: "hbar", xData: orden.map(g => nombre(g.clave)), series: [{ name: "km/L", data: orden.map(g => +g.a.rendimiento_kmL.toFixed(2)) }] },
    explicacion: "Comparación entre operadores en rendimiento, costo y ahorro. " + soloDemoNota(),
    formula: "Métricas ponderadas por operador (Σ km / Σ litros, Σ costo / Σ km, etc.).",
  });
};

ANALISIS.F02 = (ctx) => {
  const grupos = DM.agrupar(ctx.servicios, "id_vehiculo");
  if (grupos.length < 2) return noDisponible(ctx, "Camión vs. camión", "estado_servicio");
  const orden = ordenar(grupos.map(g => ({ clave: g.clave, a: DM.agregados(g.servicios) })), g => g.a.rendimiento_kmL, true);
  return componer(ctx, {
    titulo: "Camión vs. camión",
    kpis: [{ label: "Unidades comparadas", value: String(orden.length), unit: "", note: "" }],
    tabla: { headers: ["Unidad", "Servicios", "km", "Litros", "km/L", "MXN/km"], filas: orden.map(g => [nombreVehiculo(g.clave, ctx.data), g.a.n, DM.fmtNum(g.a.km, 0), DM.fmtNum(g.a.litros, 1), DM.fmtNum(g.a.rendimiento_kmL, 2), DM.fmtNum(g.a.costo_km_MXN, 2)]) },
    grafica: { tipo: "bar", xData: orden.map(g => nombreVehiculo(g.clave, ctx.data)), yName: "km/L", series: [{ name: "km/L", data: orden.map(g => +g.a.rendimiento_kmL.toFixed(2)) }] },
    explicacion: "Comparación entre unidades.",
    formula: "Métricas ponderadas por unidad.",
  });
};

ANALISIS.F03 = (ctx) => {
  const grupos = DM.agrupar(ctx.servicios, "id_ruta");
  if (grupos.length < 2) return noDisponible(ctx, "Ruta vs. ruta", "estado_servicio");
  const orden = ordenar(grupos.map(g => ({ clave: g.clave, a: DM.agregados(g.servicios) })), g => g.a.costo_km_MXN, false);
  return componer(ctx, {
    titulo: "Ruta vs. ruta",
    kpis: [{ label: "Rutas comparadas", value: String(orden.length), unit: "", note: "" }],
    tabla: { headers: ["Ruta", "Servicios", "km", "Litros", "MXN/km", "Costo (MXN)"], filas: orden.map(g => [nombreRuta(g.clave, ctx.data), g.a.n, DM.fmtNum(g.a.km, 0), DM.fmtNum(g.a.litros, 1), DM.fmtNum(g.a.costo_km_MXN, 2), DM.fmtMXN(g.a.costo)]) },
    grafica: { tipo: "bar", xData: orden.map(g => nombreRuta(g.clave, ctx.data)), yName: "MXN/km", series: [{ name: "MXN/km", data: orden.map(g => +g.a.costo_km_MXN.toFixed(2)) }] },
    explicacion: "Comparación entre rutas.",
    formula: "Métricas ponderadas por ruta.",
  });
};

ANALISIS.F04 = (ctx) => {
  const filas = [];
  ctx.data.operadores.forEach(o => {
    const serviciosOp = ctx.servicios.filter(s => s.id_operador === o.ID_OPERADOR);
    const a = DM.agregados(serviciosOp);
    filas.push([o.nombre, a.n, DM.fmtNum(a.km, 0), DM.fmtNum(a.litros, 1), DM.fmtNum(a.rendimiento_kmL, 2), DM.fmtNum(a.costo_km_MXN, 2)]);
  });
  return componer(ctx, {
    titulo: "Chofer por camión",
    kpis: [{ label: "Operadores", value: String(ctx.data.operadores.length), unit: "", note: "" }, { label: "Unidades", value: String(ctx.data.vehiculos.length), unit: "", note: "" }],
    tabla: { headers: ["Operador", "Servicios", "km", "Litros", "km/L", "MXN/km"], filas },
    explicacion: "Matriz operador × unidad. Con una sola unidad, todos los operadores se evalúan sobre el mismo vehículo.",
    formula: "Agregación por operador (independiente de la unidad, dado que solo hay una).",
  });
};

ANALISIS.F05 = (ctx) => {
  const filas = [];
  ctx.data.vehiculos.forEach(v => {
    ctx.data.rutas.forEach(r => {
      const serviciosVR = ctx.servicios.filter(s => s.id_vehiculo === v.ID_VEHICULO && s.id_ruta === r.ID_RUTA);
      const a = DM.agregados(serviciosVR);
      filas.push([nombreVehiculo(v.ID_VEHICULO, ctx.data), nombreRuta(r.ID_RUTA, ctx.data), a.n, DM.fmtNum(a.km, 0), DM.fmtNum(a.litros, 1), DM.fmtMXN(a.costo)]);
    });
  });
  return componer(ctx, {
    titulo: "Camión por ruta",
    kpis: [{ label: "Unidades", value: String(ctx.data.vehiculos.length), unit: "", note: "" }, { label: "Rutas", value: String(ctx.data.rutas.length), unit: "", note: "" }],
    tabla: { headers: ["Unidad", "Ruta", "Servicios", "km", "Litros", "Costo (MXN)"], filas },
    explicacion: "Matriz unidad × ruta. Con una sola unidad y una sola ruta, la matriz contiene una única celda.",
    formula: "Agregación por combinación unidad-ruta.",
  });
};

ANALISIS.F06 = (ctx) => {
  const s = ordenar(ctx.servicios, x => x.fechaISO, false);
  const filas = s.map(x => {
    const dif = x.presupuesto_MXN != null && x.costo_consumo_MXN != null ? x.presupuesto_MXN - x.costo_consumo_MXN : null;
    const pct = dif != null && x.presupuesto_MXN !== 0 ? (dif / x.presupuesto_MXN * 100) : null;
    return [x.folio, DM.fmtMXN(x.presupuesto_MXN), DM.fmtMXN(x.costo_consumo_MXN), dif != null ? DM.fmtMXN(dif) : "N/D", pct != null ? DM.fmtPct(pct, 1) : "N/D"];
  });
  return componer(ctx, {
    titulo: "Costo real vs. esperado",
    kpis: [
      { label: "Costo total", value: DM.fmtMXN(s.reduce((a, x) => a + (x.costo_consumo_MXN || 0), 0)), unit: "MXN", note: "real" },
      { label: "Presupuesto total", value: DM.fmtMXN(s.reduce((a, x) => a + (x.presupuesto_MXN || 0), 0)), unit: "MXN", note: "esperado" },
    ],
    tabla: { headers: ["Folio", "Esperado (MXN)", "Real (MXN)", "Diferencia (MXN)", "Diferencia (%)"], filas },
    grafica: { tipo: "bar", xData: s.map(x => x.folio.slice(-5)), yName: "MXN", series: [{ name: "Esperado", data: s.map(x => +x.presupuesto_MXN.toFixed(2)) }, { name: "Real", data: s.map(x => +x.costo_consumo_MXN.toFixed(2)) }] },
    explicacion: "Comparación del costo real (combustible) frente al presupuesto esperado por servicio. El costo esperado proviene del presupuesto_MXN definido en los datos simulados.",
    formula: "diferencia = presupuesto_MXN − costo_consumo_MXN; diferencia % = diferencia / presupuesto × 100.",
  });
};

function mesesDelPeriodo(servicios) {
  const meses = {};
  servicios.forEach(s => {
    const m = s.fecha ? s.fecha.slice(0, 7) : "N/D";
    if (!meses[m]) meses[m] = { costo: 0, litros: 0, km: 0, n: 0 };
    meses[m].costo += (s.costo_consumo_MXN || 0);
    meses[m].litros += (s.litros_consumidos_L || 0);
    meses[m].km += (s.distancia_km || 0);
    meses[m].n += 1;
  });
  return Object.keys(meses).sort().map(m => ({ mes: m, ...meses[m] }));
}

ANALISIS.F07 = (ctx) => {
  const meses = mesesDelPeriodo(ctx.servicios);
  if (meses.length < 2) return noDisponible(ctx, "Mes actual vs. anterior", "estado_servicio");
  const actual = meses[meses.length - 1], anterior = meses[meses.length - 2];
  const cambioCosto = anterior.costo !== 0 ? ((actual.costo - anterior.costo) / anterior.costo * 100) : null;
  const cambioLitros = anterior.litros !== 0 ? ((actual.litros - anterior.litros) / anterior.litros * 100) : null;
  const filas = [
    ["Servicios", actual.n, anterior.n, actual.n - anterior.n, "—"],
    ["Costo (MXN)", DM.fmtMXN(actual.costo), DM.fmtMXN(anterior.costo), DM.fmtMXN(actual.costo - anterior.costo), cambioCosto != null ? DM.fmtPct(cambioCosto, 1) : "N/D"],
    ["Litros", DM.fmtNum(actual.litros, 1), DM.fmtNum(anterior.litros, 1), DM.fmtNum(actual.litros - anterior.litros, 1), cambioLitros != null ? DM.fmtPct(cambioLitros, 1) : "N/D"],
    ["km", DM.fmtNum(actual.km, 0), DM.fmtNum(anterior.km, 0), DM.fmtNum(actual.km - anterior.km, 0), "—"],
  ];
  return componer(ctx, {
    titulo: "Mes actual vs. anterior",
    kpis: [{ label: "Mes actual", value: actual.mes, unit: "", note: "" }, { label: "Mes anterior", value: anterior.mes, unit: "", note: "" }, { label: "Δ costo", value: cambioCosto != null ? DM.fmtPct(cambioCosto, 1) : "N/D", unit: "", note: "" }],
    tabla: { headers: ["Indicador", actual.mes, anterior.mes, "Diferencia", "Cambio (%)"], filas },
    explicacion: "Comparación entre el último mes del periodo (" + actual.mes + ") y el mes anterior (" + anterior.mes + ").",
    formula: "cambio % = (actual − anterior) / anterior × 100.",
  });
};

ANALISIS.F08 = (ctx) => {
  const ordenados = ordenar(ctx.servicios, x => x.fechaISO, false);
  if (ordenados.length < 2) return noDisponible(ctx, "Periodo vs. periodo", "estado_servicio");
  const mitad = Math.floor(ordenados.length / 2);
  const p1 = ordenados.slice(0, mitad), p2 = ordenados.slice(mitad);
  const a1 = DM.agregados(p1), a2 = DM.agregados(p2);
  const cambioCosto = a1.costo !== 0 ? ((a2.costo - a1.costo) / a1.costo * 100) : null;
  const filas = [
    ["Servicios", a1.n, a2.n],
    ["Costo (MXN)", DM.fmtMXN(a1.costo), DM.fmtMXN(a2.costo)],
    ["Litros", DM.fmtNum(a1.litros, 1), DM.fmtNum(a2.litros, 1)],
    ["km", DM.fmtNum(a1.km, 0), DM.fmtNum(a2.km, 0)],
    ["km/L", DM.fmtNum(a1.rendimiento_kmL, 2), DM.fmtNum(a2.rendimiento_kmL, 2)],
  ];
  return componer(ctx, {
    titulo: "Periodo vs. periodo",
    kpis: [{ label: "Periodo 1", value: (p1[0] ? p1[0].fecha : "—") + " → " + (p1[p1.length - 1] ? p1[p1.length - 1].fecha : "—"), unit: "", note: "" }, { label: "Periodo 2", value: (p2[0] ? p2[0].fecha : "—") + " → " + (p2[p2.length - 1] ? p2[p2.length - 1].fecha : "—"), unit: "", note: "" }, { label: "Δ costo", value: cambioCosto != null ? DM.fmtPct(cambioCosto, 1) : "N/D", unit: "", note: "" }],
    tabla: { headers: ["Indicador", "Periodo 1 (primera mitad)", "Periodo 2 (segunda mitad)"], filas },
    explicacion: "El periodo seleccionado se divide en dos mitades por fecha para comparar sus métricas.",
    formula: "Comparación de agregados entre la primera y la segunda mitad del periodo filtrado.",
  });
};

ANALISIS.F09 = (ctx) => {
  const grupos = DM.agrupar(ctx.servicios, "id_operador").map(g => ({ clave: g.clave, a: DM.agregados(g.servicios) }))
    .filter(g => g.a.rendimiento_kmL != null && g.a.costo_km_MXN != null);
  const rend = normalizarMinMax(grupos.map(g => g.a.rendimiento_kmL), false);
  const costoInv = normalizarMinMax(grupos.map(g => g.a.costo_km_MXN), true);
  const ahorro = normalizarMinMax(grupos.map(g => g.a.ahorro), false);
  const incInv = normalizarMinMax(grupos.map(g => g.a.incidencias), true);
  grupos.forEach((g, i) => { g.score = (rend[i] || 0) * 0.40 + (costoInv[i] || 0) * 0.30 + (ahorro[i] || 0) * 0.20 + (incInv[i] || 0) * 0.10; });
  const orden = ordenar(grupos, g => g.score, true);
  return componer(ctx, {
    titulo: "Ranking multicriterio",
    kpis: [{ label: "Líder", value: orden[0] ? orden[0].clave : "N/D", unit: "", note: "" }],
    tabla: { headers: ["Operador", "km/L", "MXN/km", "Ahorro (MXN)", "Señales", "Puntaje (0–100)"], filas: orden.map(g => [g.clave, DM.fmtNum(g.a.rendimiento_kmL, 2), DM.fmtNum(g.a.costo_km_MXN, 2), DM.fmtMXN(g.a.ahorro), g.a.incidencias, (g.score * 100).toFixed(1)]) },
    grafica: { tipo: "hbar", xData: orden.map(g => nombreOperador(g.clave, ctx.data)), series: [{ name: "Puntaje", data: orden.map(g => +(g.score * 100).toFixed(1)) }] },
    explicacion: "Ranking multicriterio con pesos documentados: rendimiento (40%), menor costo/km (30%), ahorro (20%) y menos incidencias (10%).",
    formula: "puntaje = 0.40·norm(km/L) + 0.30·norm(menor costo/km) + 0.20·norm(ahorro) + 0.10·norm(menos incidencias).",
  });
};

ANALISIS.F10 = (ctx) => {
  const orden = ordenar(ctx.servicios, x => x.fechaISO, false);
  const valores = orden.map(s => s.rendimiento_kmL).filter(v => v != null);
  const media = valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
  const desv = valores.length ? Math.sqrt(valores.reduce((a, b) => a + (b - media) * (b - media), 0) / valores.length) : null;
  const anomalias = ordenar(orden.filter(s => s.rendimiento_kmL != null && desv != null && desv > 0 && Math.abs((s.rendimiento_kmL - media) / desv) > 1.5),
    s => Math.abs((s.rendimiento_kmL - media) / desv), true);
  const filas = anomalias.slice(0, 30).map(s => {
    const z = ((s.rendimiento_kmL - media) / desv).toFixed(2);
    return [s.folio, s.fecha, DM.fmtNum(s.rendimiento_kmL, 2), z, "Anomalía estadística"];
  });
  const meses = agregarPorMes(ctx.servicios).map(m => ({ mes: m.mes, kmL: m.km > 0 ? m.km / m.litros : null }));
  return componer(ctx, {
    titulo: "Tendencias y anomalías",
    kpis: [
      { label: "Media km/L", value: media != null ? DM.fmtNum(media, 2) : "N/D", unit: "km/L", note: "" },
      { label: "Desv. estándar", value: desv != null ? DM.fmtNum(desv, 2) : "N/D", unit: "km/L", note: "" },
      { label: "Anomalías", value: String(anomalias.length), unit: "", note: "|z| > 1.5" },
    ],
    tabla: { headers: ["Folio", "Fecha", "km/L", "z-score", "Estado"], filas },
    grafica: { tipo: "line", xData: meses.map(x => x.mes), yName: "km/L", series: [{ name: "Rendimiento mensual", data: meses.map(x => +(x.kmL || 0).toFixed(2)) }] },
    explicacion: anomalias.length
      ? "Se identificaron " + anomalias.length + " desviación(es) estadística(s) (|z| > 1.5) en el rendimiento. Una anomalía es una desviación estadística o una regla disparada; no se afirma fraude, incumplimiento ni error humano."
      : "No se identificaron desviaciones estadísticas relevantes (|z| > 1.5) en el rendimiento del periodo.",
    formula: "z = (rendimiento − media) / desviación estándar; anomalía = |z| > 1.5.",
  });
};

// ---------------------------------------------------------------------------
// Análisis rápidos adicionales (áreas temáticas DATA MANAGEMENT 2.0)
// ---------------------------------------------------------------------------
function pctDe(x, t) { return (t > 0 && x != null) ? DM.fmtPct(x / t * 100, 1) : "N/D"; }

const ANALISIS_RAPIDOS = {
  "Q_DIST_GASTOS": (ctx) => {
    const a = DM.agregados(ctx.servicios);
    const total = a.costo + a.casetas + a.mantenimiento + a.otros;
    const filas = [
      ["Combustible", a.costo], ["Casetas", a.casetas],
      ["Mantenimiento", a.mantenimiento], ["Otros gastos", a.otros],
    ];
    return componer(ctx, {
      titulo: "Distribución de gastos",
      kpis: filas.map(([l, v]) => ({ label: l, value: DM.fmtMXN(v), unit: "MXN", note: pctDe(v, total) })),
      tabla: { headers: ["Componente", "Monto (MXN)", "% del total"], filas: filas.map(([l, v]) => [l, DM.fmtMXN(v), pctDe(v, total)]) },
      grafica: { tipo: "bar", xData: filas.map(f => f[0]), yName: "MXN", series: [{ name: "Gasto", data: filas.map(f => +f[1].toFixed(2)) }] },
      explicacion: "El combustible representa " + pctDe(a.costo, total) + " del gasto operativo total (" + DM.fmtMXN(total) + " MXN).",
      formula: "componente % = componente / Σ costo_operativo_total × 100.",
    });
  },

  "Q_MANT_POR_KM": (ctx) => {
    const unidades = gruposUnidades(ctx);
    const orden = ordenar(unidades, u => u.a.km > 0 ? u.a.mantenimiento / u.a.km : null, true);
    return componer(ctx, {
      titulo: "Mantenimiento por kilómetro",
      kpis: [{ label: "Unidades", value: String(orden.length), unit: "", note: "" }],
      tabla: { headers: ["Unidad", "Servicios", "km", "Mantenimiento (MXN)", "MXN/km"], filas: orden.map(u => [nombreVehiculo(u.clave, ctx.data), u.n, DM.fmtNum(u.a.km, 0), DM.fmtMXN(u.a.mantenimiento), DM.fmtNum(u.a.km > 0 ? u.a.mantenimiento / u.a.km : null, 2)]) },
      grafica: { tipo: "hbar", xData: orden.map(u => nombreVehiculo(u.clave, ctx.data)), series: [{ name: "MXN/km", data: orden.map(u => +(u.a.km > 0 ? u.a.mantenimiento / u.a.km : 0).toFixed(2)) }] },
      explicacion: "Costo de mantenimiento por kilómetro recorrido, por unidad.",
      formula: "MXN/km mantenimiento = Σ costo_mantenimiento_MXN / Σ km por unidad.",
    });
  },

  "Q_MANT_EVOL": (ctx) => {
    const meses = agregarPorMes(ctx.servicios).map(m => ({ mes: m.mes, mant: m.mantenimiento }));
    return componer(ctx, {
      titulo: "Evolución del gasto de mantenimiento",
      kpis: [{ label: "Mantenimiento total", value: DM.fmtMXN(ctx.servicios.reduce((a, s) => a + (s.costo_mantenimiento_MXN || 0), 0)), unit: "MXN", note: "" }],
      tabla: { headers: ["Mes", "Mantenimiento (MXN)"], filas: meses.map(x => [x.mes, DM.fmtMXN(x.mant)]) },
      grafica: { tipo: "line", xData: meses.map(x => x.mes), yName: "MXN", series: [{ name: "Mantenimiento", data: meses.map(x => +x.mant.toFixed(2)) }] },
      explicacion: "Evolución mensual del gasto de mantenimiento en el periodo.",
      formula: "mantenimiento mensual = Σ costo_mantenimiento_MXN por mes.",
    });
  },

  "Q_INCI_TIPO": (ctx) => {
    const tipos = [
      ["Fallas", ctx.servicios.filter(s => (s.fallas || 0) > 0).length],
      ["Retraso > 2 h", ctx.servicios.filter(s => (s.retraso_h || 0) > 2).length],
      ["Diferencia no explicada > 5 L", ctx.servicios.filter(s => (s.diferencia_no_explicada_L || 0) > DM.UMBRAL_DIF_NO_EXPLICADA_L).length],
      ["Ralentí > 2 h", ctx.servicios.filter(s => (s.tiempo_ralenti_h || 0) > DM.UMBRAL_RALENTI_H).length],
    ];
    return componer(ctx, {
      titulo: "Incidencias por tipo",
      kpis: tipos.map(([l, v]) => ({ label: l, value: String(v), unit: "", note: "servicios" })),
      tabla: { headers: ["Tipo de señal", "Servicios afectados"], filas: tipos.map(([l, v]) => [l, String(v)]) },
      grafica: { tipo: "bar", xData: tipos.map(t => t[0]), yName: "Servicios", series: [{ name: "Servicios", data: tipos.map(t => t[1]) }] },
      explicacion: "Distribución de señales de incidencia por tipo. Una anomalía es una desviación estadística o una regla disparada; no se afirma fraude ni error humano.",
      formula: "señal = regla determinista (fallas, retraso, diferencia no explicada o ralentí).",
    });
  },

  "Q_INCI_VEHICULO": (ctx) => {
    const unidades = gruposUnidades(ctx);
    const orden = ordenar(unidades, u => u.a.incidencias, true);
    return componer(ctx, {
      titulo: "Incidencias por vehículo",
      kpis: [{ label: "Total de incidencias", value: String(ctx.servicios.reduce((a, s) => a + (s.incidencias || 0), 0)), unit: "", note: "" }],
      tabla: { headers: ["Unidad", "Servicios", "Incidencias", "Fallas"], filas: orden.map(u => [nombreVehiculo(u.clave, ctx.data), u.n, u.a.incidencias, u.a.fallas]) },
      grafica: { tipo: "hbar", xData: orden.map(u => nombreVehiculo(u.clave, ctx.data)), series: [{ name: "Incidencias", data: orden.map(u => u.a.incidencias) }] },
      explicacion: "Incidencias registradas por vehículo en el periodo.",
      formula: "incidencias = Σ incidencias por unidad.",
    });
  },

  "Q_INCI_EVOL": (ctx) => {
    const meses = agregarPorMes(ctx.servicios).map(m => ({ mes: m.mes, inc: m.incidencias }));
    return componer(ctx, {
      titulo: "Evolución temporal de incidencias",
      kpis: [{ label: "Incidencias totales", value: String(ctx.servicios.reduce((a, s) => a + (s.incidencias || 0), 0)), unit: "", note: "" }],
      tabla: { headers: ["Mes", "Incidencias"], filas: meses.map(x => [x.mes, String(x.inc)]) },
      grafica: { tipo: "line", xData: meses.map(x => x.mes), yName: "Incidencias", series: [{ name: "Incidencias", data: meses.map(x => x.inc) }] },
      explicacion: "Evolución mensual del número de incidencias registradas.",
      formula: "incidencias mensuales = Σ incidencias por mes.",
    });
  },
};

// Áreas temáticas de acceso rápido (DATA MANAGEMENT 2.0).
export const AREAS = [
  { id: "resumen", titulo: "Resumen general", icono: "📋", desc: "Indicadores ejecutivos de la operación.", botones: [
    { id: "A06", label: "Rendimiento de la flota" }, { id: "A03", label: "Servicios más rentables" },
    { id: "A05", label: "Evolución de gastos" }, { id: "A08", label: "Resumen de incidencias" },
    { id: "F07", label: "Mes actual vs. anterior" },
  ]},
  { id: "conductores", titulo: "Conductores", icono: "👥", desc: "Rendimiento y costos por operador.", botones: [
    { id: "F01", label: "Comparar operadores" }, { id: "B01", label: "Mayor eficiencia" },
    { id: "B02", label: "Menor eficiencia" }, { id: "B03", label: "Consumo por conductor" },
    { id: "B04", label: "Costo por kilómetro" }, { id: "B09", label: "Puntualidad" },
  ]},
  { id: "vehiculos", titulo: "Vehículos", icono: "🚛", desc: "Unidades: rendimiento, costo y consumo.", botones: [
    { id: "F02", label: "Comparar vehículos" }, { id: "C02", label: "Rendimiento por unidad" },
    { id: "C03", label: "Costo por km" }, { id: "C01", label: "Vehículos más costosos" },
    { id: "E08", label: "Costo por tipo de unidad" },
  ]},
  { id: "rutas", titulo: "Rutas y servicios", icono: "🗺️", desc: "Rutas y desempeño de servicios.", botones: [
    { id: "F03", label: "Comparar rutas" }, { id: "D03", label: "Ruta más costosa" },
    { id: "D04", label: "Eficiencia por ruta" }, { id: "D09", label: "Desviación de distancia" },
    { id: "F08", label: "Periodo vs. periodo" },
  ]},
  { id: "combustible", titulo: "Combustible", icono: "⛽", desc: "Consumo, rendimiento y anomalías.", botones: [
    { id: "E07", label: "Consumo por período" }, { id: "E01", label: "Mayor consumo" },
    { id: "E03", label: "Precio por litro" }, { id: "F10", label: "Anomalías" },
    { id: "E06", label: "Ahorro potencial" },
  ]},
  { id: "mantenimiento", titulo: "Mantenimiento", icono: "🔧", desc: "Costos y frecuencia de mantenimiento.", botones: [
    { id: "C07", label: "Costos por unidad" }, { id: "Q_MANT_POR_KM", label: "Mantenimiento por km" },
    { id: "Q_MANT_EVOL", label: "Evolución de gastos" }, { id: "C09", label: "Fallas por unidad" },
  ]},
  { id: "casetas", titulo: "Casetas y costos", icono: "🛣️", desc: "Casetas y composición de costos.", botones: [
    { id: "D06", label: "Gastos por ruta" }, { id: "Q_DIST_GASTOS", label: "Distribución de gastos" },
    { id: "A05", label: "Evolución de costos" }, { id: "A01", label: "Costo por servicio" },
  ]},
  { id: "incidencias", titulo: "Incidencias", icono: "⚠️", desc: "Incidencias por tipo, actor y evolución.", botones: [
    { id: "A08", label: "Resumen de incidencias" }, { id: "B08", label: "Por conductor" },
    { id: "Q_INCI_VEHICULO", label: "Por vehículo" }, { id: "Q_INCI_TIPO", label: "Por tipo" },
    { id: "Q_INCI_EVOL", label: "Evolución temporal" },
  ]},
];

// ---------------------------------------------------------------------------
// Ejecución y renderizado
// ---------------------------------------------------------------------------
export function ejecutar(id, ctx) {
  const fn = ANALISIS[id] || ANALISIS_RAPIDOS[id];
  if (!fn) throw new Error("Análisis no definido: " + id);
  return fn(ctx);
}

function kpiHTML(k) {
  return `<div class="dm-kpi"><div class="dm-kpi-label">${k.label}</div><div class="dm-kpi-value">${k.value}</div><div class="dm-kpi-unit">${k.unit || ""}</div>${k.note ? `<div class="dm-kpi-note">${k.note}</div>` : ""}</div>`;
}

function tablaHTML(t) {
  if (!t) return "";
  const MAX_FILAS = 60;
  const total = t.filas.length;
  const filas = total > MAX_FILAS ? t.filas.slice(0, MAX_FILAS) : t.filas;
  const head = "<tr>" + t.headers.map(h => `<th>${h}</th>`).join("") + "</tr>";
  const body = filas.map(f => "<tr>" + f.map(c => `<td class="num">${c}</td>`).join("") + "</tr>").join("");
  const nota = total > MAX_FILAS ? `<p class="ir-meta">Mostrando ${MAX_FILAS} de ${total} registros.</p>` : "";
  return `<div class="table-wrap"><table class="ir dm-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>${nota}`;
}

export function renderResultado(resultado, contenedor) {
  if (!contenedor) return;
  let html = `<div class="dm-result" data-analisis="${resultado.titulo}">`;

  if (!resultado.disponible) {
    html += `<div class="alert warn"><div class="alert-head"><span>Datos insuficientes</span></div><div class="alert-body">${resultado.motivo || "Datos insuficientes."}</div></div>`;
  } else {
    html += `<div class="dm-result-title">${resultado.titulo}</div>`;

    if (resultado.kpis.length) {
      html += `<div class="dm-kpi-grid">${resultado.kpis.map(kpiHTML).join("")}</div>`;
    }

    html += tablaHTML(resultado.tabla);

    if (resultado.grafica) {
      html += `<div class="chart dm-chart" id="DM_CHART_${Math.random().toString(36).slice(2, 8)}"></div>`;
    }

    html += `<div class="dm-explicacion"><strong>Interpretación:</strong> ${resultado.explicacion}</div>`;
    if (resultado.formula) html += `<div class="dm-formula"><strong>Fórmula:</strong> ${resultado.formula}</div>`;
  }

  html += `<div class="dm-meta">
    <span><strong>Registros:</strong> ${resultado.registros}</span>
    <span><strong>Excluidos:</strong> ${resultado.excluidos} (${resultado.motivoExclusion})</span>
    <span><strong>Fuente:</strong> ${resultado.fuente}</span>
    <span><strong>Actualización:</strong> ${resultado.actualizacion}</span>
    <span><strong>Integridad:</strong> ${resultado.integridad}</span>
  </div>`;

  html += `</div>`;
  contenedor.innerHTML = html;

  if (resultado.grafica && resultado.disponible) {
    const el = contenedor.querySelector(".dm-chart");
    if (el) renderGrafica(el, resultado.grafica);
  }
}
