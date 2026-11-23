/* ============================================================
   SECURITYTRANS — DATA MANAGEMENT · Orquestador principal
   ------------------------------------------------------------
   - Carga y normaliza datos (DataManager).
   - Filtro global unificado (compartido por todos los análisis).
   - Resumen ejecutivo de KPIs.
   - Módulos de análisis (A–F) con 58 botones.
   - Funcionalidad FUEL MANAGEMENT migrada y preservada:
     identificación de unidad, gráficas históricas, comparaciones,
     histórico de servicios, detalle expandible y metodología.
   ============================================================ */

import { DataManager as DM } from "./data-management-data.js";
import * as G from "./charts.js";
import * as CMP from "./comparisons.js";
import * as SCI from "./scientific-models.js";
import { MODULOS, AREAS, ejecutar, renderResultado } from "./data-management-analytics.js";

let rawServicios = [];
let serviciosNorm = [];
let porFolio = new Map();
let catalogos = null;
let historial = null;
let filtradosNorm = [];
let filtradosRaw = [];
let analisisActual = null;
let areaActual = null;
let marcaDemo = "DATOS DEMO — INFORMACIÓN SIMULADA";

// Estado del filtro global
const filtroState = {
  rango: "todos",
  fechaIni: "",
  fechaFin: "",
  operador: "",
  vehiculo: "",
  ruta: "",
  tipoUnidad: "",
  estadoServicio: "",
  integridad: "",
  naturaleza: "",
  servicio: "",
  tipoIncidencia: "",
};

const COLS_TABLA = [
  ["folio", "Folio"], ["fecha", "Fecha"], ["origen", "Origen"], ["destino", "Destino"],
  ["operador", "Operador"], ["distancia_km", "Distancia"], ["tiempo_total_h", "Duración"],
  ["litros_presupuestados_L", "Litros plan."], ["consumo_motor_L", "Litros modelo"],
  ["consumo_total_L", "Salida balance"], ["rendimiento_balance_tanque_kmL", "Rendimiento"],
  ["presupuesto_MXN", "Presupuesto"], ["costo_consumo_MXN", "Costo"],
  ["ahorro_sobrecosto_MXN", "Ahorro/Sobrecosto"],
];

// ---------------------------------------------------------------------------
// Inicialización
// ---------------------------------------------------------------------------
async function init() {
  try {
    const datos = await DM.cargarDatos();
    catalogos = datos.catalogos;
    historial = datos.historial;
    rawServicios = datos.serviciosRaw;
    serviciosNorm = datos.servicios;
    porFolio = new Map(serviciosNorm.map(s => [s.folio, s]));
    marcaDemo = datos.marca || marcaDemo;

    filtradosNorm = [...serviciosNorm];
    filtradosRaw = [...rawServicios];

    renderBanner();
    renderVehiculo();
    renderFiltros();
    bindFilterEvents();
    renderKpis();
    renderChartTabs();
    renderModulos();
    renderAreas();
    renderSidebar();
    CMP.init(filtradosRaw);
    renderTabla();
    await SCI.init();
  } catch (e) {
    const kpi = document.getElementById("KPI_GRID");
    if (kpi) kpi.innerHTML = `<p class="state-msg">Error al cargar datos: ${e.message}</p>`;
  }
}

// ---------------------------------------------------------------------------
// Identificación de la unidad (migrado)
// ---------------------------------------------------------------------------
function chip(clase) {
  const mapa = { real: "Real", simulado: "Simulado", pendiente: "Estimado/Pendiente", calculado: "Calculado", insuficiente: "Insuficiente" };
  return `<span class="status-chip ${clase}">${mapa[clase] || clase}</span>`;
}

function vp(label, value, clase) {
  return `<div class="vp-item"><div class="vp-label">${label}</div><div class="vp-value">${value}</div><div class="vp-status">${chip(clase)}</div></div>`;
}

function renderBanner() {
  const el = document.getElementById("DEMO_BANNER");
  if (!el) return;
  el.innerHTML = `<strong>${marcaDemo}</strong> · Los nombres, vehículos, rutas y montos son ficticios.`;
}

function renderVehiculo() {
  const el = document.getElementById("VEHICLE_PROFILE");
  if (!el || !catalogos) return;
  const vs = catalogos.vehiculos;
  const porCat = {};
  vs.forEach(v => { porCat[v.categoria] = (porCat[v.categoria] || 0) + 1; });
  const categorias = Object.entries(porCat).map(([c, n]) => `${c}: ${n}`).join(" · ");
  const rendProm = (vs.reduce((a, v) => a + (v.rend_admin_ref_kmL || 0), 0) / vs.length).toFixed(2);
  el.innerHTML = `
    ${vp("Flota total", vs.length + " unidades", "calculado")}
    ${vp("Categorías", categorias, "real")}
    ${vp("Rendimiento admin. medio", rendProm + " km/L", "real")}
    ${vp("Servicios registrados", rawServicios.length + "", "calculado")}
    ${vp("Conductores", catalogos.operadores.length + "", "calculado")}
    ${vp("Rutas", catalogos.rutas.length + "", "calculado")}
    ${vp("Naturaleza", "DATOS DEMO", "simulado")}
  `;
}

// ---------------------------------------------------------------------------
// Filtro global unificado
// ---------------------------------------------------------------------------
function renderFiltros() {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set("F_RANGO", filtroState.rango);
  set("F_FECHA_INI", filtroState.fechaIni);
  set("F_FECHA_FIN", filtroState.fechaFin);
  set("F_OPERADOR", filtroState.operador);
  set("F_VEHICULO", filtroState.vehiculo);
  set("F_RUTA", filtroState.ruta);
  set("F_TIPO_UNIDAD", filtroState.tipoUnidad);
  set("F_ESTADO_SERVICIO", filtroState.estadoServicio);
  set("F_INTEGRIDAD", filtroState.integridad);
  set("F_NATURALEZA", filtroState.naturaleza);
  set("F_SERVICIO", filtroState.servicio);
  set("F_TIPO_INCIDENCIA", filtroState.tipoIncidencia);

  llenarSelect("F_OPERADOR", catalogos.operadores.map(x => [x.ID_OPERADOR, x.nombre]));
  llenarSelect("F_VEHICULO", catalogos.vehiculos.map(x => [x.ID_VEHICULO, x.unidad_referencia + " · " + x.modelo_operativo]));
  llenarSelect("F_RUTA", catalogos.rutas.map(x => [x.ID_RUTA, x.origen + " → " + x.destino]));
  llenarSelect("F_TIPO_UNIDAD", [...new Set(catalogos.vehiculos.map(x => x.carroceria))].map(c => [c, c]));

  // Estado de servicio: poblado desde los datos DEMO.
  llenarSelect("F_ESTADO_SERVICIO", ["ACTIVO", "CERRADO"].map(e => [e, e === "ACTIVO" ? "Activo" : "Cerrado"]));

  document.getElementById("F_FECHA_INI").disabled = filtroState.rango !== "custom";
  document.getElementById("F_FECHA_FIN").disabled = filtroState.rango !== "custom";
  actualizarResumenFiltros();
}

// Se vincula una única vez para evitar listeners duplicados.
function bindFilterEvents() {
  document.getElementById("B_APLICAR_FILTROS").addEventListener("click", aplicarFiltros);
  document.getElementById("B_LIMPIAR_FILTROS").addEventListener("click", limpiarFiltros);
  const bReset = document.getElementById("B_RESTABLECER");
  if (bReset) bReset.addEventListener("click", restablecerVista);
  document.getElementById("F_RANGO").addEventListener("change", () => {
    const personalizado = document.getElementById("F_RANGO").value === "custom";
    document.getElementById("F_FECHA_INI").disabled = !personalizado;
    document.getElementById("F_FECHA_FIN").disabled = !personalizado;
  });
}

function llenarSelect(id, pares) {
  const el = document.getElementById(id);
  if (!el) return;
  const actual = el.value;
  el.innerHTML = `<option value="">Todos</option>` + pares.map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
  el.value = actual;
}

function leerFiltros() {
  const g = (id) => { const el = document.getElementById(id); return el ? el.value : ""; };
  return {
    rango: g("F_RANGO"),
    fechaIni: g("F_FECHA_INI"),
    fechaFin: g("F_FECHA_FIN"),
    operador: g("F_OPERADOR"),
    vehiculo: g("F_VEHICULO"),
    ruta: g("F_RUTA"),
    tipoUnidad: g("F_TIPO_UNIDAD"),
    estadoServicio: g("F_ESTADO_SERVICIO"),
    integridad: g("F_INTEGRIDAD"),
    naturaleza: g("F_NATURALEZA"),
    servicio: g("F_SERVICIO"),
    tipoIncidencia: g("F_TIPO_INCIDENCIA"),
  };
}

function rangoCutoff(rango) {
  if (rango === "7" || rango === "30" || rango === "90") {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return new Date(hoy.getTime() - Number(rango) * 86400000);
  }
  return null;
}

function cumpleFiltro(s, f) {
  if (f.operador && s.id_operador !== f.operador) return false;
  if (f.vehiculo && s.id_vehiculo !== f.vehiculo) return false;
  if (f.ruta && s.id_ruta !== f.ruta) return false;
  if (f.naturaleza && s.naturaleza !== f.naturaleza) return false;
  if (f.estadoServicio && s.estado_servicio !== f.estadoServicio) return false;
  if (f.servicio && !String(s.folio).toLowerCase().includes(f.servicio.toLowerCase())) return false;
  if (f.tipoIncidencia === "con_fallas" && !((s.fallas || 0) > 0)) return false;
  if (f.tipoIncidencia === "con_incidencias" && !((s.incidencias || 0) > 0)) return false;
  if (f.tipoIncidencia === "con_retraso" && !((s.retraso_h || 0) > 2)) return false;

  if (f.tipoUnidad) {
    const v = catalogos.vehiculos.find(x => x.ID_VEHICULO === s.id_vehiculo);
    if (!v || v.carroceria !== f.tipoUnidad) return false;
  }

  const fecha = s.fechaISO;
  if (f.rango === "custom") {
    if (f.fechaIni && s.fecha < f.fechaIni) return false;
    if (f.fechaFin && s.fecha > f.fechaFin) return false;
  } else {
    const corte = rangoCutoff(f.rango);
    if (corte && (!fecha || fecha < corte)) return false;
  }

  if (f.integridad) {
    const completo = DM.integridadServicio(s).completo;
    if (f.integridad === "completos" && !completo) return false;
    if (f.integridad === "incompletos" && completo) return false;
  }

  return true;
}

function aplicarFiltros() {
  Object.assign(filtroState, leerFiltros());
  filtradosNorm = serviciosNorm.filter(s => cumpleFiltro(s, filtroState));
  const folios = new Set(filtradosNorm.map(s => s.folio));
  filtradosRaw = rawServicios.filter(s => folios.has(s.folio));

  renderKpis();
  renderTabla();
  actualizarResumenFiltros();
  actualizarEstadoModulos();
  CMP.init(filtradosRaw);

  // Redibuja el último análisis con los datos ya filtrados (contexto compartido).
  if (analisisActual) ejecutarAnalisis(analisisActual.id, analisisActual.moduloId);
  if (areaActual) ejecutarArea(areaActual.id, areaActual.areaId);
}

function limpiarFiltros() {
  Object.assign(filtroState, { rango: "todos", fechaIni: "", fechaFin: "", operador: "", vehiculo: "", ruta: "", tipoUnidad: "", estadoServicio: "", integridad: "", naturaleza: "", servicio: "", tipoIncidencia: "" });
  renderFiltros();
  aplicarFiltros();
}

function restablecerVista() {
  limpiarFiltros();
  analisisActual = null;
  MODULOS.forEach(m => { const a = document.getElementById("DM_RESULT_" + m.id); if (a) a.innerHTML = ""; const r = document.getElementById("DM_RECENT_" + m.id); if (r) r.innerHTML = ""; });
  AREAS.forEach(a => { const r = document.getElementById("DM_AREA_RESULT_" + a.id); if (r) r.innerHTML = ""; const rec = document.getElementById("DM_AREA_RECENT_" + a.id); if (rec) rec.innerHTML = ""; });
  document.getElementById("R_MAIN").scrollIntoView({ behavior: "smooth", block: "start" });
}

function actualizarResumenFiltros() {
  const el = document.getElementById("FILTER_SUMMARY");
  if (!el) return;
  const fechas = filtradosNorm.map(s => s.fecha).sort();
  el.textContent = `Servicios seleccionados: ${filtradosNorm.length} · Periodo: ${fechas[0] || "—"} a ${fechas[fechas.length - 1] || "—"} · Naturaleza: datos simulados`;
}

// ---------------------------------------------------------------------------
// KPIs ejecutivos (resumen)
// ---------------------------------------------------------------------------
function renderKpis() {
  const a = DM.agregados(filtradosNorm);
  const n = a.n;
  const rendPond = a.rendimiento_kmL != null ? a.rendimiento_kmL.toFixed(2) : "No calculable";
  const costoKm = a.costo_km_MXN != null ? DM.fmtNum(a.costo_km_MXN, 2) : "No calculable";

  const activos = filtradosNorm.filter(s => s.estado_servicio === "ACTIVO").length;
  const cerrados = filtradosNorm.filter(s => s.estado_servicio === "CERRADO").length;
  const aTiempo = filtradosNorm.filter(s => s.retraso_h != null && s.retraso_h <= 0.01).length;
  const cumplimiento = n > 0 ? (aTiempo / n * 100) : null;

  const fechas = filtradosNorm.map(s => s.fechaISO).filter(Boolean);
  const dias = fechas.length ? Math.max(1, (Math.max(...fechas) - Math.min(...fechas)) / 86400000 + 1) : null;
  const utilizacion = (dias != null && dias > 0 && a.horas != null) ? (a.horas / (dias * 24) * 100) : null;

  const ingresos = a.ingresos;
  const margen = a.margen_pct;

  const kpis = [
    ["Servicios realizados", String(n), "", "calculado"],
    ["Servicios activos", String(activos), "", "calculado"],
    ["Servicios cerrados", String(cerrados), "", "calculado"],
    ["Kilómetros recorridos", DM.fmtNum(a.km, 0), "km", "calculado"],
    ["Litros consumidos", DM.fmtNum(a.litros, 1), "L", "calculado"],
    ["Gasto total", DM.fmtMXN(a.costo), "MXN", "calculado"],
    ["Costo por kilómetro", "$" + costoKm, "MXN/km", "calculado"],
    ["Rendimiento ponderado", rendPond, "km/L", "calculado"],
    ["Cumplimiento de entregas", cumplimiento != null ? DM.fmtPct(cumplimiento, 1) : "No calculable", "", "calculado"],
    ["Utilización de flota", utilizacion != null ? DM.fmtNum(utilizacion, 1) + "%" : "No calculable", "proxy", "calculado"],
    ["Ingresos", DM.fmtMXN(ingresos), "MXN", "calculado"],
    ["Margen operativo", margen != null ? DM.fmtPct(margen, 1) : "No calculable", "", "calculado"],
  ];

  document.getElementById("KPI_GRID").innerHTML = kpis.map(k =>
    `<div class="kpi"><div class="kpi-label">${k[0]}</div><div class="kpi-value">${k[1]}</div><div class="kpi-unit">${k[2]}</div><div class="kpi-note">${chip(k[3])}</div></div>`
  ).join("");

  const renta = document.getElementById("RENTABILIDAD_NOTA");
  if (renta) {
    renta.textContent = margen != null
      ? "Rentabilidad calculada con ingresos y costo operativo total (combustible + casetas + mantenimiento + otros gastos)."
      : "Datos insuficientes para calcular rentabilidad.";
  }
}

// ---------------------------------------------------------------------------
// Gráficas históricas (migrado)
// ---------------------------------------------------------------------------
const TABS = [
  ["Rendimiento", (s) => G.g01Rendimiento(s, 3.6, null)],
  ["Combustible", (s) => G.g02Combustible(s)],
  ["Presupuesto vs costo", (s) => G.g03Presupuesto(s)],
  ["Costo por km", (s) => G.g05CostoKm(s)],
  ["Por operador", (s) => G.g06Operadores(s)],
  ["Ahorros", (s) => G.g07Ahorros(s)],
  ["Tiempo", (s) => G.g08Tiempo(s)],
  ["Ralentí", (s) => G.g09Ralenti(s)],
  ["Velocidad vs consumo", (s) => G.g12VelocidadConsumo(s)],
  ["Ralentí vs costo", (s) => G.g13RalentiCosto(s)],
];

function renderChartTabs() {
  const tabs = document.getElementById("CHART_TABS");
  if (!tabs) return;
  tabs.innerHTML = "";
  TABS.forEach((t, i) => {
    const b = document.createElement("button");
    b.className = "tab" + (i === 0 ? " active" : "");
    b.textContent = t[0];
    b.setAttribute("role", "tab");
    b.addEventListener("click", () => {
      tabs.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      dibujar(t[1]);
    });
    tabs.appendChild(b);
  });
  dibujar(TABS[0][1]);
}

function dibujar(fn) {
  const cont = document.getElementById("CHART_CONTAINER");
  if (!cont) return;
  cont.innerHTML = '<div class="chart" id="CHART_MAIN"></div>';
  if (fn.length >= 2 && historial) { fn(filtradosRaw, historial); }
  else { fn(filtradosRaw); }
}

// ---------------------------------------------------------------------------
// Módulos de análisis (A–F)
// ---------------------------------------------------------------------------
function renderModulos() {
  const cont = document.getElementById("DM_MODULES");
  if (!cont) return;
  cont.innerHTML = MODULOS.map(m => `
    <section class="region dm-module" id="DM_MOD_${m.id}" aria-label="${m.titulo}">
      <div class="region-title">${m.icono} ${m.titulo}</div>
      <div class="region-body">
        <p class="dm-desc">${m.desc}</p>
        <div class="dm-button-grid" id="DM_BUTTONS_${m.id}"></div>
        <div class="dm-status" id="DM_STATUS_${m.id}"></div>
        <div class="dm-recent" id="DM_RECENT_${m.id}"></div>
        <div class="dm-result-area" id="DM_RESULT_${m.id}"></div>
      </div>
    </section>
  `).join("");

  MODULOS.forEach(m => {
    const grid = document.getElementById("DM_BUTTONS_" + m.id);
    m.botones.forEach(b => {
      const btn = document.createElement("button");
      btn.className = "btn dm-btn";
      btn.textContent = b.label;
      btn.dataset.id = b.id;
      btn.setAttribute("aria-label", b.id + " — " + b.label);
      btn.addEventListener("click", () => ejecutarAnalisis(b.id, m.id));
      grid.appendChild(btn);
    });
  });

  actualizarEstadoModulos();
}

function actualizarEstadoModulos() {
  MODULOS.forEach(m => {
    const st = document.getElementById("DM_STATUS_" + m.id);
    if (st) st.textContent = `Datos disponibles: ${filtradosNorm.length} servicios · ${new Set(filtradosNorm.map(s => s.id_operador)).size} operadores · ${new Set(filtradosNorm.map(s => s.id_vehiculo)).size} unidades · ${new Set(filtradosNorm.map(s => s.id_ruta)).size} rutas`;
  });
}

function ctxActual() {
  return { servicios: filtradosNorm, data: { catalogos, historial, vehiculos: catalogos.vehiculos, operadores: catalogos.operadores, rutas: catalogos.rutas, disponibilidad: DM.disponibilidad(filtradosNorm), actualizado: new Date().toISOString() } };
}

function ejecutarAnalisis(id, moduloId) {
  analisisActual = { id, moduloId };
  const area = document.getElementById("DM_RESULT_" + moduloId);
  const recent = document.getElementById("DM_RECENT_" + moduloId);
  const resultado = ejecutar(id, ctxActual());
  renderResultado(resultado, area);
  if (recent) recent.innerHTML = `<strong>Último análisis:</strong> ${resultado.titulo}`;
  area.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderAreas() {
  const cont = document.getElementById("DM_AREAS");
  if (!cont) return;
  cont.innerHTML = AREAS.map(a => `
    <section class="region dm-module" id="DM_AREA_${a.id}" aria-label="${a.titulo}">
      <div class="region-title">${a.icono} ${a.titulo}</div>
      <div class="region-body">
        <p class="dm-desc">${a.desc}</p>
        <div class="dm-button-grid" id="DM_AREA_BUTTONS_${a.id}"></div>
        <div class="dm-recent" id="DM_AREA_RECENT_${a.id}"></div>
        <div class="dm-result-area" id="DM_AREA_RESULT_${a.id}"></div>
      </div>
    </section>
  `).join("");
  AREAS.forEach(a => {
    const grid = document.getElementById("DM_AREA_BUTTONS_" + a.id);
    a.botones.forEach(b => {
      const btn = document.createElement("button");
      btn.className = "btn dm-btn";
      btn.textContent = b.label;
      btn.dataset.id = b.id;
      btn.setAttribute("aria-label", b.id + " — " + b.label);
      btn.addEventListener("click", () => ejecutarArea(b.id, a.id));
      grid.appendChild(btn);
    });
  });
}

function ejecutarArea(id, areaId) {
  areaActual = { id, areaId };
  const area = document.getElementById("DM_AREA_RESULT_" + areaId);
  const recent = document.getElementById("DM_AREA_RECENT_" + areaId);
  const resultado = ejecutar(id, ctxActual());
  renderResultado(resultado, area);
  if (recent) recent.innerHTML = `<strong>Último análisis:</strong> ${resultado.titulo}`;
  area.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderSidebar() {
  const nav = document.getElementById("DM_SIDEBAR");
  if (!nav) return;
  const items = [];
  items.push({ href: "R_EXECUTIVE_KPIS", label: "📊 Resumen ejecutivo" });
  items.push({ group: "Áreas de análisis" });
  AREAS.forEach(a => items.push({ href: "DM_AREA_" + a.id, label: a.icono + " " + a.titulo }));
  items.push({ group: "Módulos A–F" });
  MODULOS.forEach(m => items.push({ href: "DM_MOD_" + m.id, label: m.id + " · " + m.titulo }));
  items.push({ group: "Más secciones" });
  items.push({ href: "R_HISTORICAL_CHARTS", label: "📈 Gráficas históricas" });
  items.push({ href: "R_SERVICE_HISTORY", label: "📄 Histórico de servicios" });

  nav.innerHTML = items.map(it => it.group
    ? `<div class="dm-side-group">${it.group}</div>`
    : `<a href="#${it.href}" class="dm-side-item" data-target="${it.href}">${it.label}</a>`).join("");

  nav.querySelectorAll(".dm-side-item").forEach(a => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const t = document.getElementById(a.dataset.target);
      if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
      nav.querySelectorAll(".dm-side-item").forEach(x => x.classList.remove("active"));
      a.classList.add("active");
    });
  });
}

// ---------------------------------------------------------------------------
// Histórico de servicios (migrado)
// ---------------------------------------------------------------------------
function renderTabla() {
  const head = document.getElementById("SERVICE_TABLE_HEAD");
  const body = document.getElementById("SERVICE_TABLE_BODY");
  if (!head || !body) return;
  const termino = (document.getElementById("IR_SEARCH").value || "").toLowerCase();

  head.innerHTML = "<th></th>" + COLS_TABLA.map(c => `<th data-col="${c[0]}">${c[1]}</th>`).join("") + "<th>Estado</th><th>Alertas</th>";

  const datos = filtradosRaw.filter(s =>
    !termino || s.folio.toLowerCase().includes(termino) || s.operador.toLowerCase().includes(termino)
    || s.origen.toLowerCase().includes(termino) || s.destino.toLowerCase().includes(termino));

  const MAX_ROWS = 500;
  const visibles = datos.slice(0, MAX_ROWS);

  body.innerHTML = visibles.map(s => {
    const celdas = COLS_TABLA.map(c => `<td data-label="${c[1]}" class="num">${s[c[0]]}</td>`).join("");
    const alertas = (s.diferencia_no_explicada_L || 0) > 5 ? "⚠" : "";
    const estado = s.estado_servicio === "ACTIVO" ? "Activo" : "Cerrado";
    return `<tr>
      <td><button class="btn" data-expand="${s.folio}" aria-expanded="false" aria-controls="R_SERVICE_DETAIL">+</button></td>
      ${celdas}
      <td data-label="Estado">${estado}</td>
      <td data-label="Alertas">${alertas}</td>
    </tr>`;
  }).join("");

  document.getElementById("IR_META").textContent = datos.length > MAX_ROWS
    ? `Mostrando ${MAX_ROWS} de ${datos.length} registros`
    : `${datos.length} registros`;

  head.querySelectorAll("th[data-col]").forEach(th => {
    th.addEventListener("click", () => {
      const col = th.dataset.col;
      filtradosRaw.sort((a, b) => (a[col] < b[col] ? -1 : 1));
      renderTabla();
    });
  });

  body.querySelectorAll("[data-expand]").forEach(btn => {
    btn.addEventListener("click", () => {
      const s = datos.find(x => x.folio === btn.dataset.expand);
      if (s) abrirDetalleDemo(s);
    });
  });
}

function abrirDetalleDemo(s) {
  const sec = document.getElementById("R_SERVICE_DETAIL");
  const body = document.getElementById("SERVICE_DETAIL_BODY");
  if (!sec || !body) return;
  sec.hidden = false;
  const kv = (l, v) => `<div class="vp-item"><div class="vp-label">${l}</div><div class="vp-value">${v}</div></div>`;
  body.innerHTML = `
    <div class="detail-section"><h4>Detalle del servicio (dato DEMO)</h4>
      <div class="vehicle-profile">
        ${kv("Folio", s.folio)} ${kv("Fecha", s.fecha)} ${kv("Operador", s.operador)}
        ${kv("Unidad", s.id_vehiculo)} ${kv("Ruta", s.id_ruta)} ${kv("Origen/Destino", s.origen + " → " + s.destino)}
        ${kv("Estado", s.estado_servicio)} ${kv("Distancia", s.distancia_km + " km")} ${kv("Carga", s.carga_kg + " kg")}
        ${kv("Tiempo total", s.tiempo_total_h + " h")} ${kv("Retraso", s.retraso_h + " h")} ${kv("Puntualidad", s.puntualidad_pct + "%")}
        ${kv("Consumo", s.consumo_total_L + " L")} ${kv("Rendimiento", s.rendimiento_balance_tanque_kmL + " km/L")} ${kv("L/100km", s.consumo_L_100km)}
        ${kv("Ingresos", "$" + Number(s.ingresos_MXN).toLocaleString("es-MX"))} ${kv("Costo operativo", "$" + Number(s.costo_operativo_total_MXN).toLocaleString("es-MX"))} ${kv("Margen", s.margen_pct + "%")}
        ${kv("Combustible", "$" + Number(s.costo_consumo_MXN).toLocaleString("es-MX"))} ${kv("Casetas", "$" + Number(s.costo_casetas_MXN).toLocaleString("es-MX"))} ${kv("Mantenimiento", "$" + Number(s.costo_mantenimiento_MXN).toLocaleString("es-MX"))}
        ${kv("Fallas", s.fallas)} ${kv("Incidencias", s.incidencias)}
      </div>
    </div>
    <p class="state-msg">${marcaDemo}. El detalle de trayectoria GPS aplica al módulo File Management (datos reales); aquí se muestra el resumen operativo del servicio DEMO.</p>`;
  sec.scrollIntoView({ behavior: "smooth", block: "start" });
}

function exportCSV() {
  const head = COLS_TABLA.map(c => c[1]).join(",");
  const filas = filtradosRaw.map(s => COLS_TABLA.map(c => `"${s[c[0]]}"`).join(",")).join("\n");
  const blob = new Blob([head + "\n" + filas], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "securitytrans_servicios.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

function debounce(fn, ms) {
  let t;
  return function () { clearTimeout(t); t = setTimeout(fn, ms); };
}

// ---------------------------------------------------------------------------
// Eventos globales
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("IR_SEARCH").addEventListener("input", debounce(renderTabla, 250));
  document.getElementById("B_EXPORT_CSV").addEventListener("click", exportCSV);
  window.addEventListener("securitytrans:theme", () => {
    const tabs = document.getElementById("CHART_TABS");
    if (tabs) {
      const activo = tabs.querySelector(".tab.active");
      if (activo) {
        const idx = [...tabs.children].indexOf(activo);
        dibujar(TABS[idx][1]);
      }
    }
    if (analisisActual) ejecutarAnalisis(analisisActual.id, analisisActual.moduloId);
  });
  init();
});
