/* ============================================================
   SECURITYTRANS — Cargador de datos DEMO (fetch + caché en memoria)
   Los datos viven en ./data/demo/*.json y están marcados como
   "DATOS DEMO — INFORMACIÓN SIMULADA". No se mezclan con datos reales.
   ============================================================ */

const cache = new Map();

async function cargarDemo(nombre) {
  const ruta = "data/demo/" + nombre;
  if (cache.has(ruta)) return cache.get(ruta);
  const resp = await fetch("./" + ruta, { cache: "no-cache" });
  if (!resp.ok) throw new Error("No se pudo cargar " + ruta + " (" + resp.status + ")");
  const datos = await resp.json();
  cache.set(ruta, datos);
  return datos;
}

export const DemoLoader = {
  manifest() { return cargarDemo("manifest.json"); },
  servicios() { return cargarDemo("servicios.json"); },
  conductores() { return cargarDemo("conductores.json"); },
  vehiculos() { return cargarDemo("vehiculos.json"); },
  rutas() { return cargarDemo("rutas.json"); },
  combustible() { return cargarDemo("combustible.json"); },
  mantenimientos() { return cargarDemo("mantenimientos.json"); },
  casetas() { return cargarDemo("casetas.json"); },
  incidentes() { return cargarDemo("incidentes.json"); },
};
