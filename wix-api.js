/* ============================================================
   SECURITYTRANS — Cliente de la API Wix (FILE MANAGEMENT)

   Propósito:
     Centralizar la URL base de la API Wix, la gestión del token de sesión
     y el manejo uniforme de errores y de solicitudes autenticadas.

   Seguridad:
     - El token se guarda SOLO en sessionStorage (nunca en localStorage ni en URL).
     - No se registran contraseñas ni tokens.
     - No se guardan credenciales en el código.

   Restricciones:
     - Usa el entorno de DESARROLLO (_functions-dev). El entorno de producción
       (_functions) NO está autorizado para publicación.
   ============================================================ */

const API_BASE = "https://www.ebenezeraviation.com/_functions-dev";
const TOKEN_KEY = "st_session_token";

// ---------------------------------------------------------------------------
// Gestión del token de sesión (sessionStorage)
// ---------------------------------------------------------------------------
export function getToken() {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
}

export function setToken(token) {
  try { sessionStorage.setItem(TOKEN_KEY, token); } catch (e) {}
}

export function clearToken() {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) {}
}

// ---------------------------------------------------------------------------
// Cliente de solicitudes con manejo uniforme de errores
// ---------------------------------------------------------------------------
export async function apiRequest(method, endpoint, body = null, auth = false) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (!token) throw new Error("Sesión no disponible.");
    headers["Authorization"] = "Bearer " + token;
  }

  const opciones = { method, headers };
  if (body !== null) opciones.body = JSON.stringify(body);

  let resp;
  try {
    resp = await fetch(API_BASE + "/" + endpoint, opciones);
  } catch (e) {
    throw new Error("No fue posible contactar el servidor. Verifique su conexión.");
  }

  if (resp.status === 401) {
    clearToken();
    throw new Error("Sesión expirada. Inicie sesión nuevamente.");
  }
  if (resp.status === 403) {
    throw new Error("No tiene permiso para realizar esta acción.");
  }
  if (resp.status === 409) {
    throw new Error("El servicio fue modificado por otro usuario. Vuelva a cargar.");
  }
  if (resp.status === 429) {
    throw new Error("Demasiadas solicitudes. Espere un momento.");
  }
  if (resp.status >= 500) {
    throw new Error("Error del servidor. Intente más tarde.");
  }

  let datos;
  try {
    datos = await resp.json();
  } catch (e) {
    throw new Error("Respuesta del servidor no válida.");
  }

  if (datos && datos.status === "error") {
    throw new Error(datos.message || "Error del servidor.");
  }
  return datos;
}

// ---------------------------------------------------------------------------
// Endpoints (según el contrato documentado)
// ---------------------------------------------------------------------------
export const WixApi = {
  baseUrl: API_BASE,

  login(usuario, password, area) {
    return apiRequest("POST", "st_login", { usuario, password, area }, false);
  },

  session() {
    return apiRequest("GET", "st_session", null, true);
  },

  catalogos() {
    return apiRequest("GET", "st_catalogos", null, true);
  },

  servicios() {
    return apiRequest("GET", "st_servicios", null, true);
  },

  servicio(servicioId) {
    return apiRequest("GET", "st_servicio?servicioId=" + encodeURIComponent(servicioId), null, true);
  },

  mensajes(servicioId) {
    return apiRequest("GET", "st_mensajes?servicioId=" + encodeURIComponent(servicioId), null, true);
  },

  checklistPlantilla() {
    return apiRequest("GET", "st_checklist_plantilla", null, true);
  },

  checklists(servicioId) {
    return apiRequest("GET", "st_checklists?servicioId=" + encodeURIComponent(servicioId), null, true);
  },

  crearServicio(folio, conductorId, vehiculoId, rutaId) {
    return apiRequest("POST", "st_crear_servicio",
      { folio, conductorId, vehiculoId, rutaId }, true);
  },

  modificarServicio(servicioId, version, cambios) {
    return apiRequest("POST", "st_modificar_servicio",
      { servicioId, version, ...cambios }, true);
  },

  cerrarServicio(servicioId, version) {
    return apiRequest("POST", "st_cerrar_servicio", { servicioId, version }, true);
  },

  enviarMensaje(servicioId, categoria, mensaje, origenEnvio) {
    return apiRequest("POST", "st_enviar_mensaje",
      { servicioId, categoria, mensaje, origenEnvio }, true);
  },

  guardarChecklist(servicioId, version, items) {
    return apiRequest("POST", "st_guardar_checklist", { servicioId, version, items }, true);
  },
};
