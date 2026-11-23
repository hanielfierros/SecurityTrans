/* ============================================================
   SECURITYTRANS — DATA MANAGEMENT · Capa de adaptación de datos (DEMO)
   ------------------------------------------------------------
   Lee las fuentes DEMO (data/demo/*.json) mediante DemoLoader y las
   normaliza a un modelo unificado para los 58 análisis.

   Reglas de integridad:
     - Nunca se divide entre cero.
     - Nunca se trata un valor nulo como cero.
     - Los datos simulados se marcan explícitamente como DEMO.
   ============================================================ */

import { DemoLoader } from "./demo-loader.js";

const UMBRAL_DIF_NO_EXPLICADA_L = 5;
const UMBRAL_RALENTI_H = 2;

// Campos que podrían faltar si se usara otra fuente (no aplica a DEMO).
const CAMPOS_AUSENTES = {
  ingresos: "No existe campo de ingresos (ingresos_MXN).",
  mantenimiento: "No existe campo de gasto de mantenimiento.",
  casetas: "No existe campo de gasto en casetas.",
  fallas: "No existe campo de fallas reportadas.",
  estado_servicio: "No existe campo de estado del servicio (activo/cerrado).",
  tiempo_planificado: "No existe tiempo planificado por servicio.",
  carga: "No existe campo de carga transportada.",
  incidencias_formales: "No existe campo formal de incidencias.",
};

function señalesDeAnomalia(s) {
  const reglas = [];
  if (num(s.diferencia_no_explicada_L) > UMBRAL_DIF_NO_EXPLICADA_L) reglas.push("diferencia_no_explicada_L > " + UMBRAL_DIF_NO_EXPLICADA_L + " L");
  if (num(s.tiempo_ralenti_h) > UMBRAL_RALENTI_H) reglas.push("tiempo_ralenti_h > " + UMBRAL_RALENTI_H + " h");
  if (num(s.fallas) > 0) reglas.push("fallas reportadas");
  if (num(s.retraso_h) > 2) reglas.push("retraso > 2 h");
  return reglas;
}

function normalizarServicio(s, rutas) {
  const distancia = num(s.distancia_km);
  const litros = num(s.consumo_total_L);
  const costo = num(s.costo_consumo_MXN);
  const tiempoTotal = num(s.tiempo_total_h);
  const tiempoMov = num(s.tiempo_movimiento_h);
  const ingresos = num(s.ingresos_MXN);
  const costoOperativo = num(s.costo_operativo_total_MXN);

  const ruta = rutas.find(r => r.ID_RUTA === s.id_ruta) || null;
  const distanciaPlan = ruta ? num(ruta.distancia_administrativa_km) : num(s.distancia_planificada_km);
  const desviacionDist = (distancia != null && distanciaPlan != null) ? distancia - distanciaPlan : null;

  const utilidad = (ingresos != null && costoOperativo != null) ? ingresos - costoOperativo : null;
  const margen = (ingresos != null && ingresos > 0 && utilidad != null) ? utilidad / ingresos * 100 : null;

  return {
    // Identidad
    folio: s.folio,
    id_operador: s.id_operador,
    operador: s.operador,
    perfil: s.perfil,
    fecha: s.fecha,
    fechaISO: fechaISO(s.fecha),
    origen: s.origen,
    destino: s.destino,
    id_ruta: s.id_ruta,
    id_vehiculo: s.id_vehiculo,
    naturaleza: s.naturaleza || "DEMO",

    // Distancia
    distancia_km: distancia,
    distancia_planificada_km: distanciaPlan,
    desviacion_distancia_km: desviacionDist,
    desviacion_distancia_pct: (desviacionDist != null && distanciaPlan) ? (desviacionDist / distanciaPlan * 100) : null,

    // Tiempo
    tiempo_planificado_h: num(s.tiempo_planificado_h),
    tiempo_total_h: tiempoTotal,
    tiempo_movimiento_h: tiempoMov,
    tiempo_ralenti_h: num(s.tiempo_ralenti_h),
    tiempo_detenido_h: (tiempoTotal != null && tiempoMov != null) ? (tiempoTotal - tiempoMov) : null,
    n_paradas: num(s.n_paradas),
    velocidad_promedio_kmh: num(s.velocidad_promedio_kmh),
    velocidad_maxima_kmh: num(s.velocidad_maxima_kmh),
    retraso_h: num(s.retraso_h),
    puntualidad_pct: num(s.puntualidad_pct),

    // Carga
    carga_kg: num(s.carga_kg),

    // Combustible
    litros_presupuestados_L: num(s.litros_presupuestados_L),
    litros_consumidos_L: litros,
    consumo_motor_L: num(s.consumo_motor_L),
    consumo_ralenti_L: num(s.consumo_ralenti_L),
    litros_cargados_L: num(s.litros_cargados_L),
    diferencia_no_explicada_L: num(s.diferencia_no_explicada_L),

    // Rendimiento
    rendimiento_kmL: num(s.rendimiento_balance_tanque_kmL),
    rendimiento_motor_kmL: num(s.rendimiento_motor_kmL),
    consumo_L_100km: num(s.consumo_L_100km),

    // Costos
    presupuesto_MXN: num(s.presupuesto_MXN),
    costo_consumo_MXN: costo,
    costo_casetas_MXN: num(s.costo_casetas_MXN),
    costo_mantenimiento_MXN: num(s.costo_mantenimiento_MXN),
    otros_gastos_MXN: num(s.otros_gastos_MXN),
    costo_operativo_total_MXN: costoOperativo,
    costo_por_km_MXN: num(s.costo_por_km_MXN),
    ahorro_sobrecosto_MXN: num(s.ahorro_sobrecosto_MXN),

    // Ingresos / utilidad
    ingresos_MXN: ingresos,
    utilidad_MXN: utilidad,
    margen_pct: margen,

    // Derivados
    precio_promedio_L_MXN: (costo != null && litros != null && litros > 0) ? costo / litros : num(s.precio_promedio_L_MXN),

    // Estado / incidencias / fallas
    estado_servicio: s.estado_servicio || "CERRADO",
    fallas: num(s.fallas),
    incidencias: num(s.incidencias),
    señales: señalesDeAnomalia(s),
    incidencias_proxy: num(s.incidencias),
  };
}

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fechaISO(v) {
  if (!v) return null;
  const d = new Date(v + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function agrupar(servicios, clave) {
  const map = new Map();
  servicios.forEach(s => {
    const k = s[clave] || "—";
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(s);
  });
  return [...map.entries()].map(([k, lista]) => ({ clave: k, servicios: lista }));
}

function agregados(lista) {
  const n = lista.length;
  let km = 0, litros = 0, costo = 0, presupuesto = 0, ahorro = 0, ralenti = 0, horas = 0;
  let casetas = 0, mantenimiento = 0, otros = 0, costoOperativo = 0;
  let ingresos = 0, utilidad = 0, fallas = 0, incidencias = 0, retraso = 0;
  let kmValidos = 0, litrosValidos = 0, costoValido = 0, ingresosValidos = 0;

  lista.forEach(s => {
    if (s.distancia_km != null) { km += s.distancia_km; kmValidos++; }
    if (s.litros_consumidos_L != null) { litros += s.litros_consumidos_L; litrosValidos++; }
    if (s.costo_consumo_MXN != null) { costo += s.costo_consumo_MXN; costoValido++; }
    if (s.presupuesto_MXN != null) presupuesto += s.presupuesto_MXN;
    if (s.ahorro_sobrecosto_MXN != null) ahorro += s.ahorro_sobrecosto_MXN;
    if (s.tiempo_ralenti_h != null) ralenti += s.tiempo_ralenti_h;
    if (s.tiempo_total_h != null) horas += s.tiempo_total_h;
    if (s.costo_casetas_MXN != null) casetas += s.costo_casetas_MXN;
    if (s.costo_mantenimiento_MXN != null) mantenimiento += s.costo_mantenimiento_MXN;
    if (s.otros_gastos_MXN != null) otros += s.otros_gastos_MXN;
    if (s.costo_operativo_total_MXN != null) costoOperativo += s.costo_operativo_total_MXN;
    if (s.ingresos_MXN != null) { ingresos += s.ingresos_MXN; ingresosValidos++; }
    if (s.utilidad_MXN != null) utilidad += s.utilidad_MXN;
    if (s.fallas != null) fallas += s.fallas;
    if (s.incidencias != null) incidencias += s.incidencias;
    if (s.retraso_h != null) retraso += s.retraso_h;
  });

  const margen = (ingresos > 0) ? (utilidad / ingresos * 100) : null;

  return {
    n, km, litros, costo, presupuesto, ahorro, ralenti, horas,
    casetas, mantenimiento, otros, costoOperativo, ingresos, utilidad,
    fallas, incidencias, retraso,
    kmValidos, litrosValidos, costoValido, ingresosValidos,
    rendimiento_kmL: (litros > 0) ? (km / litros) : null,
    consumo_L_100km: (km > 0) ? (litros / km * 100) : null,
    costo_km_MXN: (km > 0) ? (costo / km) : null,
    costo_operativo_km_MXN: (km > 0) ? (costoOperativo / km) : null,
    precio_promedio_L_MXN: (litros > 0) ? (costo / litros) : null,
    margen_pct: margen,
    retraso_promedio_h: (n > 0) ? (retraso / n) : null,
    puntualidad_pct: (n > 0) ? (lista.filter(s => s.retraso_h != null && s.retraso_h <= 0.01).length / n * 100) : null,
  };
}

function integridadServicio(s) {
  const camposClave = [
    "distancia_km", "litros_consumidos_L", "costo_consumo_MXN", "rendimiento_kmL",
    "tiempo_total_h", "velocidad_promedio_kmh", "ingresos_MXN", "costo_operativo_total_MXN",
  ];
  const presentes = camposClave.filter(c => s[c] != null).length;
  return { presentes, total: camposClave.length, completo: presentes === camposClave.length };
}

// Detecta qué campos están ausentes en el conjunto de datos actual.
function disponibilidad(servicios) {
  if (!servicios.length) return { ausentes: [] };
  const ausentes = [];
  const todo = (f) => servicios.every(s => s[f] != null);
  if (!todo("ingresos_MXN")) ausentes.push("ingresos");
  if (!todo("costo_mantenimiento_MXN")) ausentes.push("mantenimiento");
  if (!todo("costo_casetas_MXN")) ausentes.push("casetas");
  if (!todo("fallas")) ausentes.push("fallas");
  if (!todo("estado_servicio")) ausentes.push("estado_servicio");
  if (!todo("tiempo_planificado_h")) ausentes.push("tiempo_planificado");
  if (!todo("carga_kg")) ausentes.push("carga");
  if (!todo("incidencias")) ausentes.push("incidencias_formales");
  return { ausentes };
}

async function cargarDatos() {
  const [manifest, serviciosRaw, conductores, vehiculos, rutas] = await Promise.all([
    DemoLoader.manifest(),
    DemoLoader.servicios(),
    DemoLoader.conductores(),
    DemoLoader.vehiculos(),
    DemoLoader.rutas(),
  ]);
  const operadores = conductores.map(c => ({ ID_OPERADOR: c.ID_OPERADOR, nombre: c.nombre, perfil: c.perfil }));
  const catalogos = { vehiculos, operadores, rutas };
  const servicios = serviciosRaw.map(s => normalizarServicio(s, rutas));
  return {
    manifest,
    catalogos,
    historial: null,
    servicios,
    serviciosRaw,
    vehiculos,
    operadores,
    rutas,
    disponibilidad: disponibilidad(servicios),
    actualizado: manifest.fecha_generacion || new Date().toISOString().slice(0, 10),
    esDemo: true,
    marca: manifest.marca || "DATOS DEMO — INFORMACIÓN SIMULADA",
  };
}

function fmtNum(v, dec = 2) {
  if (v == null) return "N/D";
  return Number(v).toLocaleString("es-MX", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtMXN(v) {
  if (v == null) return "N/D";
  return "$" + Number(v).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(v, dec = 1) {
  if (v == null) return "N/D";
  return Number(v).toLocaleString("es-MX", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + "%";
}
function fmtEntero(v) {
  if (v == null) return "N/D";
  return Number(v).toLocaleString("es-MX", { maximumFractionDigits: 0 });
}

export const DataManager = {
  cargarDatos, agrupar, agregados, integridadServicio, disponibilidad,
  num, fmtNum, fmtMXN, fmtPct, fmtEntero, CAMPOS_AUSENTES,
  UMBRAL_DIF_NO_EXPLICADA_L, UMBRAL_RALENTI_H,
};
