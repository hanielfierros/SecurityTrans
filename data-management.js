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
import { DataLoader } from "./data-loader.js";
import * as G from "./charts.js";
import * as CMP from "./comparisons.js";
import * as SD from "./service-details.js";
import * as SCI from "./scientific-models.js";
import { MODULOS, ejecutar, renderResultado } from "./data-management-analytics.js";

let rawServicios = [];
let serviciosNorm = [];
let porFolio = new Map();
let catalogos = null;
let historial = null;
let filtradosNorm = [];
let filtradosRaw = [];
let analisisActual = null;

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
    rawServicios = await DataLoader.resumen();
    serviciosNorm = datos.servicios;
    porFolio = new Map(serviciosNorm.map(s => [s.folio, s]));

    filtradosNorm = [...serviciosNorm];
    filtradosRaw = [...rawServicios];

    renderVehiculo();
    renderFiltros();
    bindFilterEvents();
    renderKpis();
    renderChartTabs();
    renderModulos();
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

function renderVehiculo() {
  const el = document.getElementById("VEHICLE_PROFILE");
  if (!el || !catalogos) return;
  const v = catalogos.vehiculos[0];
  el.innerHTML = `
    ${vp("Número económico", v.unidad_referencia, "real")}
    ${vp("Marca", v.marca, "real")}
    ${vp("Modelo", v.modelo_operativo + " (" + v.modelo_cientifico + ")", "real")}
    ${vp("Placa (ficticia)", v.placa_ficticia, "simulado")}
    ${vp("Carrocería", v.carroceria, "real")}
    ${vp("Blindaje", v.blindaje, "real")}
    ${vp("Motor", v.motor, "pendiente")}
    ${vp("Potencia", v.potencia_kW + " kW", "pendiente")}
    ${vp("Transmisión", v.transmision, "pendiente")}
    ${vp("Tanque", v.capacidad_tanque_L + " L", "real")}
    ${vp("Masa vehicular (blindada)", v.masa_vacio_blindado_kg + " kg", "pendiente")}
    ${vp("Rendimiento administrativo", v.rend_admin_ref_kmL + " km/L", "real")}
    ${vp("Kilometraje", historial.odo_final_acumulado_km + " km", "calculado")}
    ${vp("Servicios registrados", rawServicios.length + "", "calculado")}
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

  llenarSelect("F_OPERADOR", catalogos.operadores.map(x => [x.ID_OPERADOR, x.nombre]));
  llenarSelect("F_VEHICULO", catalogos.vehiculos.map(x => [x.ID_VEHICULO, x.unidad_referencia + " · " + x.modelo_operativo]));
  llenarSelect("F_RUTA", catalogos.rutas.map(x => [x.ID_RUTA, x.origen + " → " + x.destino]));
  llenarSelect("F_TIPO_UNIDAD", [...new Set(catalogos.vehiculos.map(x => x.carroceria))].map(c => [c, c]));

  // Estado de servicio: sin datos en las fuentes actuales.
  const estServ = document.getElementById("F_ESTADO_SERVICIO");
  if (estServ) {
    estServ.innerHTML = `<option value="">Todos</option>`;
    estServ.title = "No existe campo de estado de servicio (activo/cerrado) en los datos actuales.";
  }

  document.getElementById("F_FECHA_INI").disabled = filtroState.rango !== "custom";
  document.getElementById("F_FECHA_FIN").disabled = filtroState.rango !== "custom";
  actualizarResumenFiltros();
}

// Se vincula una única vez para evitar listeners duplicados.
function bindFilterEvents() {
  document.getElementById("B_APLICAR_FILTROS").addEventListener("click", aplicarFiltros);
  document.getElementById("B_LIMPIAR_FILTROS").addEventListener("click", limpiarFiltros);
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
}

function limpiarFiltros() {
  Object.assign(filtroState, { rango: "todos", fechaIni: "", fechaFin: "", operador: "", vehiculo: "", ruta: "", tipoUnidad: "", estadoServicio: "", integridad: "", naturaleza: "" });
  renderFiltros();
  aplicarFiltros();
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

  const fechas = filtradosNorm.map(s => s.fechaISO).filter(Boolean);
  const dias = fechas.length ? Math.max(1, (Math.max(...fechas) - Math.min(...fechas)) / 86400000 + 1) : null;
  const utilizacion = (dias != null && dias > 0 && a.horas != null) ? (a.horas / (dias * 24) * 100) : null;

  const kpis = [
    ["Servicios realizados", String(n), "", "calculado"],
    ["Servicios activos", "Datos insuficientes", "", "insuficiente"],
    ["Servicios cerrados", "Datos insuficientes", "", "insuficiente"],
    ["Kilómetros recorridos", DM.fmtNum(a.km, 0), "km", "calculado"],
    ["Litros consumidos", DM.fmtNum(a.litros, 1), "L", "calculado"],
    ["Gasto total", DM.fmtMXN(a.costo), "MXN", "calculado"],
    ["Costo por kilómetro", "$" + costoKm, "MXN/km", "calculado"],
    ["Rendimiento ponderado", rendPond, "km/L", "calculado"],
    ["Cumplimiento de entregas", "Datos insuficientes", "", "insuficiente"],
    ["Utilización de flota", utilizacion != null ? DM.fmtNum(utilizacion, 1) + "%" : "No calculable", "proxy", "calculado"],
    ["Ingresos y margen", "Datos insuficientes", "", "insuficiente"],
  ];

  document.getElementById("KPI_GRID").innerHTML = kpis.map(k =>
    `<div class="kpi"><div class="kpi-label">${k[0]}</div><div class="kpi-value">${k[1]}</div><div class="kpi-unit">${k[2]}</div><div class="kpi-note">${chip(k[3])}</div></div>`
  ).join("");

  const renta = document.getElementById("RENTABILIDAD_NOTA");
  if (renta) {
    renta.textContent = "Datos insuficientes para calcular rentabilidad.";
  }
}

// ---------------------------------------------------------------------------
// Gráficas históricas (migrado)
// ---------------------------------------------------------------------------
const TABS = [
  ["Rendimiento", (s) => G.g01Rendimiento(s, 3.6, null)],
  ["Combustible", (s) => G.g02Combustible(s)],
  ["Presupuesto vs costo", (s) => G.g03Presupuesto(s)],
  ["Kilometraje", (s, h) => G.g04Kilometraje(h)],
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

function ejecutarAnalisis(id, moduloId) {
  analisisActual = { id, moduloId };
  const area = document.getElementById("DM_RESULT_" + moduloId);
  const recent = document.getElementById("DM_RECENT_" + moduloId);
  const ctx = { servicios: filtradosNorm, data: { catalogos, historial, vehiculos: catalogos.vehiculos, operadores: catalogos.operadores, rutas: catalogos.rutas, disponibilidad: DM.disponibilidad(filtradosNorm), actualizado: new Date().toISOString() } };
  const resultado = ejecutar(id, ctx);
  renderResultado(resultado, area);
  if (recent) recent.innerHTML = `<strong>Último análisis:</strong> ${resultado.titulo}`;
  area.scrollIntoView({ behavior: "smooth", block: "nearest" });
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

  body.innerHTML = datos.map(s => {
    const celdas = COLS_TABLA.map(c => `<td data-label="${c[1]}" class="num">${s[c[0]]}</td>`).join("");
    const alertas = s.diferencia_no_explicada_L > 5 ? "⚠" : "";
    return `<tr>
      <td><button class="btn" data-expand="${s.folio}" aria-expanded="false" aria-controls="R_SERVICE_DETAIL">+</button></td>
      ${celdas}
      <td data-label="Estado">${chip("simulado")}</td>
      <td data-label="Alertas">${alertas}</td>
    </tr>`;
  }).join("");

  document.getElementById("IR_META").textContent = `${datos.length} registros`;

  head.querySelectorAll("th[data-col]").forEach(th => {
    th.addEventListener("click", () => {
      const col = th.dataset.col;
      filtradosRaw.sort((a, b) => (a[col] < b[col] ? -1 : 1));
      renderTabla();
    });
  });

  body.querySelectorAll("[data-expand]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (SD.servicioAbierto() === btn.dataset.expand) { SD.cerrarServicio(); }
      else { await SD.abrirServicio(btn.dataset.expand); }
    });
  });
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
