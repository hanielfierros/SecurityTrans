/* ============================================================
   SECURITYTRANS — DATA MANAGEMENT · Capa de adaptación de datos
   ------------------------------------------------------------
   Responsabilidades:
     - Leer las fuentes existentes (catalogos.json, services-summary.json,
       vehicle-history.json) mediante DataLoader.
     - Normalizar nombres de campos, validar números, fechas y unidades.
     - Establecer relaciones entre operador, vehículo, ruta y servicio.
     - Detectar campos ausentes (ingresos, mantenimiento, casetas, etc.).
     - Agregar métricas y devolver resultados uniformes para los análisis.

   Reglas de integridad:
     - Nunca se divide entre cero.
     - Nunca se trata un valor nulo como cero.
     - Los litros de repostaje no se igualan a litros consumidos.
     - Los datos simulados se marcan explícitamente como SIMULADO.
   ============================================================ */

import { DataLoader } from "./data-loader.js";

// Umbrales de anomalía (proxy determinista, documentado).
const UMBRAL_DIF_NO_EXPLICADA_L = 5;   // diferencia no explicada > 5 L
const UMBRAL_RALENTI_H = 2;             // ralentí > 2 h

// Campos que el análisis requeriría pero que NO existen en las fuentes actuales.
const CAMPOS_AUSENTES = {
  ingresos: "No existe campo de ingresos (ingresos_MXN).",
  mantenimiento: "No existe campo de gasto de mantenimiento.",
  casetas: "No existe campo de gasto en casetas.",
  fallas: "No existe campo de fallas reportadas.",
  estado_servicio: "No existe campo de estado del servicio (activo/cerrado).",
  tiempo_planificado: "No existe tiempo planificado por servicio en el resumen.",
  carga: "No existe campo de carga transportada.",
  incidencias_formales: "No existe campo formal de incidencias; se usa una señal proxy documentada.",
};

// Reglas de anomalía aplicables a cada servicio (señales proxy).
function señalesDeAnomalia(s) {
  const reglas = [];
  if (num(s.diferencia_no_explicada_L) > UMBRAL_DIF_NO_EXPLICADA_L) {
    reglas.push("diferencia_no_explicada_L > " + UMBRAL_DIF_NO_EXPLICADA_L + " L");
  }
  if (num(s.tiempo_ralenti_h) > UMBRAL_RALENTI_H) {
    reglas.push("tiempo_ralenti_h > " + UMBRAL_RALENTI_H + " h");
  }
  return reglas;
}

// Normalización de un servicio a un modelo unificado.
function normalizarServicio(s, rutas) {
  const distancia = num(s.distancia_km);
  const litros = num(s.consumo_total_L);
  const costo = num(s.costo_consumo_MXN);
  const tiempoTotal = num(s.tiempo_total_h);
  const tiempoMov = num(s.tiempo_movimiento_h);

  const ruta = rutas.find(r => r.ID_RUTA === s.id_ruta) || null;
  const distanciaPlan = ruta ? num(ruta.distancia_administrativa_km) : null;

  const desviacionDist = (distancia != null && distanciaPlan != null) ? distancia - distanciaPlan : null;

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
    id_ruta: s.id_ruta || "RUT-0001",
    id_vehiculo: s.id_vehiculo || "VEH-0001",
    naturaleza: s.naturaleza || "SIMULADO",

    // Distancia
    distancia_km: distancia,
    distancia_planificada_km: distanciaPlan,
    desviacion_distancia_km: desviacionDist,
    desviacion_distancia_pct: (desviacionDist != null && distanciaPlan) ? (desviacionDist / distanciaPlan * 100) : null,

    // Tiempo
    tiempo_total_h: tiempoTotal,
    tiempo_movimiento_h: tiempoMov,
    tiempo_ralenti_h: num(s.tiempo_ralenti_h),
    tiempo_detenido_h: (tiempoTotal != null && tiempoMov != null) ? (tiempoTotal - tiempoMov) : null,
    n_paradas: num(s.n_paradas),
    velocidad_promedio_kmh: num(s.velocidad_promedio_kmh),
    velocidad_maxima_kmh: num(s.velocidad_maxima_kmh),

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
    costo_por_km_MXN: num(s.costo_por_km_MXN),
    ahorro_sobrecosto_MXN: num(s.ahorro_sobrecosto_MXN),

    // Derivados (con protección de división entre cero)
    precio_promedio_L_MXN: (costo != null && litros != null && litros > 0) ? costo / litros : null,

    // Señales de anomalía (proxy)
    señales: señalesDeAnomalia(s),
    incidencias_proxy: señalesDeAnomalia(s).length,
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

// Agrupa servicios por clave (id_operador, id_vehiculo, id_ruta, etc.).
function agrupar(servicios, clave) {
  const map = new Map();
  servicios.forEach(s => {
    const k = s[clave] || "—";
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(s);
  });
  return [...map.entries()].map(([k, lista]) => ({ clave: k, servicios: lista }));
}

// Métricas agregadas ponderadas de un conjunto de servicios.
function agregados(lista) {
  const n = lista.length;
  let km = 0, litros = 0, costo = 0, presupuesto = 0, ahorro = 0, ralenti = 0, horas = 0, incidencias = 0;
  let kmValidos = 0, litrosValidos = 0, costoValido = 0;

  lista.forEach(s => {
    if (s.distancia_km != null) { km += s.distancia_km; kmValidos++; }
    if (s.litros_consumidos_L != null) { litros += s.litros_consumidos_L; litrosValidos++; }
    if (s.costo_consumo_MXN != null) { costo += s.costo_consumo_MXN; costoValido++; }
    if (s.presupuesto_MXN != null) presupuesto += s.presupuesto_MXN;
    if (s.ahorro_sobrecosto_MXN != null) ahorro += s.ahorro_sobrecosto_MXN;
    if (s.tiempo_ralenti_h != null) ralenti += s.tiempo_ralenti_h;
    if (s.tiempo_total_h != null) horas += s.tiempo_total_h;
    incidencias += s.incidencias_proxy || 0;
  });

  return {
    n,
    km,
    litros,
    costo,
    presupuesto,
    ahorro,
    ralenti,
    horas,
    incidencias,
    kmValidos,
    litrosValidos,
    costoValido,
    rendimiento_kmL: (litros > 0) ? (km / litros) : null,
    consumo_L_100km: (km > 0) ? (litros / km * 100) : null,
    costo_km_MXN: (km > 0) ? (costo / km) : null,
    precio_promedio_L_MXN: (litros > 0) ? (costo / litros) : null,
    costo_medio_por_servicio_MXN: (n > 0) ? (costo / n) : null,
  };
}

// Índice de integridad: proporción de campos clave presentes en un servicio.
function integridadServicio(s) {
  const camposClave = [
    "distancia_km", "litros_consumidos_L", "costo_consumo_MXN",
    "rendimiento_kmL", "tiempo_total_h", "velocidad_promedio_kmh",
  ];
  const presentes = camposClave.filter(c => s[c] != null).length;
  return { presentes, total: camposClave.length, completo: presentes === camposClave.length };
}

// Detección de campos ausentes a nivel de conjunto de datos.
function disponibilidad(servicios) {
  const ausentes = [];
  if (servicios.every(s => s.ingresos_MXN == null)) ausentes.push("ingresos");
  // Los campos siguientes no existen en el modelo unificado:
  ausentes.push("mantenimiento", "casetas", "fallas", "estado_servicio", "tiempo_planificado", "carga", "incidencias_formales");
  return { ausentes: [...new Set(ausentes)] };
}

// Carga y normaliza todas las fuentes.
async function cargarDatos() {
  const [catalogos, resumen, historial] = await Promise.all([
    DataLoader.catalogos(),
    DataLoader.resumen(),
    DataLoader.historial(),
  ]);
  const servicios = resumen.map(s => normalizarServicio(s, catalogos.rutas || []));
  return {
    catalogos,
    historial,
    servicios,
    vehiculos: catalogos.vehiculos || [],
    operadores: catalogos.operadores || [],
    rutas: catalogos.rutas || [],
    disponibilidad: disponibilidad(servicios),
    actualizado: new Date().toISOString(),
  };
}

// Formateadores deterministas.
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
  cargarDatos,
  agrupar,
  agregados,
  integridadServicio,
  disponibilidad,
  num,
  fmtNum,
  fmtMXN,
  fmtPct,
  fmtEntero,
  CAMPOS_AUSENTES,
  UMBRAL_DIF_NO_EXPLICADA_L,
  UMBRAL_RALENTI_H,
};
