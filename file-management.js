/* ============================================================
   SECURITYTRANS — FILE MANAGEMENT (lógica)

   Propósito:
     Lógica del módulo FILE MANAGEMENT: login, restauración de sesión,
     catálogos, servicios, chat compartido, checklist y acciones de área.

   Seguridad:
     - XSS: el contenido de usuario se renderiza SIEMPRE con textContent.
     - Sin eval. Sin credenciales en el código ni en el almacenamiento.
     - El token vive únicamente en sessionStorage.

   Restricciones:
     - La carga de documentos/fotos queda deshabilitada hasta que el backend
       habilite la interfaz correspondiente (no se simula éxito de carga).
   ============================================================ */

import { WixApi, getToken, setToken, clearToken } from "./wix-api.js";

const SESSION_KEY = "st_session_data";
const AREAS = {
  OPERACIONES_LOGISTICA: { nombre: "Operaciones - Logística", color: "#2563EB" },
  ADMINISTRACION: { nombre: "Administración", color: "#7C3AED" },
  CONDUCTOR: { nombre: "Conductor", color: "#16A34A" },
};

// ---------------------------------------------------------------------------
// Utilidades de sesión
// ---------------------------------------------------------------------------
function guardarSesion(datos) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(datos)); } catch (e) {}
}
function leerSesion() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
}
function limpiarSesion() {
  clearToken();
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
}

function $(id) { return document.getElementById(id); }

function areaDesdeURL() {
  return new URLSearchParams(location.search).get("area") || "";
}

// Clasifica el error de login para diferenciar contraseña / red / sesión.
// No se interpreta todo error HTTP 400 como contraseña incorrecta.
function clasificarError(e) {
  const msg = (e && e.message) ? String(e.message) : "";
  if (/acceso demo|contrase|password|incorrect/i.test(msg)) {
    return "Contraseña incorrecta. Verifique su acceso.";
  }
  if (/sesi.n expirada|token|401|no autentic/i.test(msg)) {
    return "Su sesión ha expirado. Inicie sesión nuevamente.";
  }
  if (/contactar|conectar|servidor|fetch|red|network|cors|origin|failed|fall/i.test(msg)) {
    return "No fue posible conectar con el servidor.";
  }
  return msg || "No fue posible conectar con el servidor.";
}

// ===========================================================================
// LOGIN
// ===========================================================================
async function flujoLogin() {
  const area = areaDesdeURL();
  const info = AREAS[area];
  if (!info) {
    $("LOGIN_ERROR").textContent = "Área no reconocida.";
    $("LOGIN_ERROR").hidden = false;
    return;
  }
  $("AREA_TITLE").textContent = info.nombre;
  $("AREA_SUB").textContent = "Área: " + area;
  document.body.classList.add(fmClase(area));

  $("BTN_VOLVER").addEventListener("click", () => location.href = "./file-management.html");
  $("BTN_INGRESAR").addEventListener("click", ingresar);

  async function ingresar() {
    const usuario = $("USERNAME").value.trim();
    const passwordRaw = $("PASSWORD").value;
    // El nombre de usuario no puede estar vacío.
    if (!usuario) {
      mostrarError("Ingrese su nombre de usuario.");
      return;
    }
    // La contraseña no puede estar vacía ni ser solo espacios.
    // Se envía el valor ORIGINAL, sin modificar mayúsculas/minúsculas.
    if (!passwordRaw || passwordRaw.trim() === "") {
      mostrarError("Ingrese su contraseña.");
      return;
    }
    $("BTN_INGRESAR").disabled = true;
    $("LOGIN_LOADING").hidden = false;
    $("LOGIN_ERROR").hidden = true;
    try {
      const resp = await WixApi.login(usuario, passwordRaw, area);
      const token = resp?.data?.token || resp?.token || resp?.data?.sessionToken;
      if (!token) {
        mostrarError("El servidor no devolvió un token de sesión.");
        return;
      }
      // Guardar token + nombre de usuario (el usuario confirmado se obtiene con st_session).
      setToken(token);
      try { sessionStorage.setItem("st_usuario", usuario); } catch (e) {}
      location.href = "./file-panel.html";
    } catch (e) {
      mostrarError(clasificarError(e));
    } finally {
      $("BTN_INGRESAR").disabled = false;
      $("LOGIN_LOADING").hidden = true;
    }
  }

  function mostrarError(msg) {
    $("LOGIN_ERROR").textContent = msg;
    $("LOGIN_ERROR").hidden = false;
  }
}

// ===========================================================================
// PANEL
// ===========================================================================
let sesion = null;
let servicioActual = null;
let versionActual = 1;
let polling = null;
let timer = null;
let servicioAbort = null;

function fmClase(area) {
  return area === "OPERACIONES_LOGISTICA" ? "fm-op"
       : area === "ADMINISTRACION" ? "fm-adm" : "fm-cond";
}

async function flujoPanel() {
  if (!getToken()) { location.href = "./file-management.html"; return; }

  // Restaurar sesión
  try {
    const resp = await WixApi.session();
    sesion = resp?.data || {};
    guardarSesion(sesion);
  } catch (e) {
    // Intentar usar sesión guardada si el servidor no responde
    sesion = leerSesion();
    if (!sesion) { limpiarSesion(); location.href = "./file-management.html"; return; }
  }

  const area = sesion.area || areaDesdeURL() || "";
  let usuarioLocal = null;
  try { usuarioLocal = sessionStorage.getItem("st_usuario"); } catch (e) {}
  const nombre = (sesion.nombre || sesion.usuario || sesion.user || usuarioLocal || "—");
  document.body.classList.add(fmClase(area));
  $("TOP_AREA").textContent = AREAS[area]?.nombre || area;
  $("TOP_USER").textContent = nombre;
  $("BTN_LOGOUT").addEventListener("click", cerrarSesion);

  // Botón móvil "Abrir chat del servicio"
  document.addEventListener("click", manejarBotonesMoviles);

  await cargarCatalogoYServicios(area);
  iniciarPolling(area);
}

function cerrarSesion() {
  detenerPolling();
  limpiarSesion();
  location.href = "./file-management.html";
}

function manejarBotonesMoviles(e) {
  const t = e.target.closest("[data-accion]");
  if (!t) return;
  const accion = t.dataset.accion;
  const movil = window.innerWidth <= 900;
  if (accion === "chat") {
    if (movil) {
      $("PANEL").classList.add("hidden-mobile");
      $("CHAT").classList.remove("hidden-mobile");
    }
    $("CHAT").scrollIntoView({ behavior: "smooth" });
  } else if (accion === "panel") {
    if (movil) {
      $("CHAT").classList.add("hidden-mobile");
      $("PANEL").classList.remove("hidden-mobile");
    }
    $("PANEL").scrollIntoView({ behavior: "smooth" });
  }
}

// ---------------------------------------------------------------------------
// Catálogos y servicios
// ---------------------------------------------------------------------------
async function cargarCatalogoYServicios(area) {
  $("PANEL_CONTENT").innerHTML = "<p class=\"fm-empty\">Cargando…</p>";
  let catalogo = { conductores: [], vehiculos: [], rutas: [] };
  let servicios = [];
  try {
    const c = await WixApi.catalogos();
    catalogo = c?.data || catalogo;
  } catch (e) { /* catálogo no disponible */ }
  try {
    const s = await WixApi.servicios();
    servicios = s?.data || [];
  } catch (e) { /* servicios no disponibles */ }

  renderPanel(area, catalogo, servicios);
}

function renderPanel(area, catalogo, servicios) {
  const cont = $("PANEL_CONTENT");
  cont.innerHTML = "";

  // 1) Crear servicio (solo OPERACIONES_LOGISTICA)
  if (area === "OPERACIONES_LOGISTICA") {
    cont.appendChild(seccionCrearServicio(catalogo));
  }

  // 2) Gestión / detalle del servicio seleccionado
  cont.appendChild(seccionServicioActual(area));

  // 3) Historial de servicios
  cont.appendChild(seccionHistorial(area, servicios));

  // 4) Checklist (solo CONDUCTOR)
  if (area === "CONDUCTOR") {
    cont.appendChild(seccionChecklist());
  }

  // 5) Botón de chat (móvil)
  const btnChat = document.createElement("button");
  btnChat.className = "fm-btn primary";
  btnChat.textContent = "Abrir chat del servicio";
  btnChat.dataset.accion = "chat";
  cont.appendChild(btnChat);
}

function seccionCrearServicio(catalogo) {
  const sec = document.createElement("div");
  sec.className = "fm-section";
  sec.innerHTML = "<h3>Crear servicio</h3>";

  const folio = campoInput("Folio");
  const conductor = campoSelect("Conductor", catalogo.conductores || [], "conductorId");
  const vehiculo = campoSelect("Vehículo", catalogo.vehiculos || [], "vehiculoId");
  const ruta = campoSelect("Ruta", catalogo.rutas || [], "rutaId");

  const btn = document.createElement("button");
  btn.className = "fm-btn primary";
  btn.textContent = "Crear servicio";
  btn.addEventListener("click", async () => {
    if (!folio.value.trim()) { alert("Ingrese un folio."); return; }
    btn.disabled = true;
    try {
      const resp = await WixApi.crearServicio(
        folio.value.trim(),
        conductor.dataset.value || conductor.value || "",
        vehiculo.dataset.value || vehiculo.value || "",
        ruta.dataset.value || ruta.value || "");
      const servicioId = resp?.data?.servicioId || resp?.data?.id;
      if (!servicioId) throw new Error("No se recibió el identificador del servicio.");
      // Seleccionar y refrescar
      await seleccionarServicio(servicioId);
      await recargarServicios();
      alert("Servicio creado.");
    } catch (err) {
      alert("No fue posible confirmar el resultado. Consulte el servicio antes de intentar nuevamente.\n" + err.message);
    } finally { btn.disabled = false; }
  });

  sec.appendChild(folio);
  sec.appendChild(conductor);
  sec.appendChild(vehiculo);
  sec.appendChild(ruta);
  sec.appendChild(btn);
  return sec;
}

function campoInput(label) {
  const w = document.createElement("div");
  w.className = "fm-field";
  const l = document.createElement("label");
  l.textContent = label;
  const i = document.createElement("input");
  i.type = "text";
  w.appendChild(l); w.appendChild(i);
  return w;
}

function campoSelect(label, items, idKey) {
  const w = document.createElement("div");
  w.className = "fm-field";
  const l = document.createElement("label");
  l.textContent = label;
  const s = document.createElement("select");
  s.dataset.value = "";
  s.appendChild(new Option("— seleccione —", ""));
  (Array.isArray(items) ? items : []).forEach(it => {
    const id = it[idKey] || it.id || it._id || "";
    const nombre = it.nombre || it.nombreCompleto || it.name || id;
    const op = new Option(nombre, id);
    s.appendChild(op);
  });
  s.addEventListener("change", () => { s.dataset.value = s.value; });
  w.appendChild(l); w.appendChild(s);
  return w;
}

function seccionServicioActual(area) {
  const sec = document.createElement("div");
  sec.className = "fm-section";
  sec.innerHTML = "<h3>Servicio seleccionado</h3>";
  sec.id = "SERVICIO_DETALLE";
  sec.appendChild(el("p", "fm-empty", "Seleccione un servicio para ver su detalle."));
  return sec;
}

function seccionHistorial(area, servicios) {
  const sec = document.createElement("div");
  sec.className = "fm-section";
  sec.innerHTML = "<h3>Historial de servicios</h3>";

  const buscar = document.createElement("input");
  buscar.type = "search";
  buscar.placeholder = "Buscar folio…";
  buscar.className = "fm-field input";
  buscar.style.cssText = "width:100%;margin-bottom:8px;padding:8px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-surface);color:var(--color-text)";
  sec.appendChild(buscar);

  const tabla = document.createElement("table");
  tabla.className = "fm-table";
  const list = (Array.isArray(servicios) ? servicios : []);
  const render = (term) => {
    tabla.innerHTML = "";
    const head = document.createElement("tr");
    ["Folio", "Estado", "Conductor", "Vehículo", "Ruta", "Acción"].forEach(h => {
      const th = document.createElement("th"); th.textContent = h; head.appendChild(th);
    });
    tabla.appendChild(head);
    list.filter(s => !term || String(s.folio || "").toLowerCase().includes(term))
      .forEach(s => {
        const tr = document.createElement("tr");
        const folio = s.folio || s.Folio || s._id || "";
        const estado = s.estado || s.Estado || "";
        const tdFolio = el("td", "", folio); tdFolio.textContent = folio;
        tr.appendChild(tdFolio);
        tr.appendChild(el("td", "", estado));
        tr.appendChild(el("td", "", s.conductorId || s.conductor || ""));
        tr.appendChild(el("td", "", s.vehiculoId || s.vehiculo || ""));
        tr.appendChild(el("td", "", s.rutaId || s.ruta || ""));
        const tdAcc = document.createElement("td");
        const btn = document.createElement("button");
        btn.className = "fm-btn"; btn.textContent = "Ver detalle";
        btn.addEventListener("click", () => seleccionarServicio(s.servicioId || s.id || s._id));
        tdAcc.appendChild(btn);
        tr.appendChild(tdAcc);
        tabla.appendChild(tr);
      });
  };
  buscar.addEventListener("input", () => render(buscar.value.toLowerCase()));
  render("");
  sec.appendChild(buscar);
  sec.appendChild(tabla);
  return sec;
}

function seccionChecklist() {
  const sec = document.createElement("div");
  sec.className = "fm-section";
  sec.innerHTML = "<h3>Checklist de salida</h3>";
  sec.id = "CHECKLIST";
  const btn = document.createElement("button");
  btn.className = "fm-btn";
  btn.textContent = "Cargar checklist";
  btn.addEventListener("click", cargarChecklist);
  sec.appendChild(btn);
  return sec;
}

// ---------------------------------------------------------------------------
// Selección de servicio + chat
// ---------------------------------------------------------------------------
async function seleccionarServicio(servicioId) {
  servicioActual = servicioId;
  try {
    const resp = await WixApi.servicio(servicioId);
    const d = resp?.data || {};
    versionActual = d.version || d.Version || 1;
    renderServicioDetalle(d);
    $("TOP_FOLIO").textContent = "Folio: " + (d.folio || servicioId);
    $("TOP_STATUS").textContent = d.estado || "";
    $("CHAT_EMPTY").hidden = true;
    $("COMPOSER").hidden = d.estado === "CERRADO";
    if (d.estado === "CERRADO") {
      $("CHAT_EMPTY").textContent = "Servicio cerrado. Consulta disponible en modo de solo lectura.";
      $("CHAT_EMPTY").hidden = false;
    }
    cargarMensajes();
  } catch (e) {
    alert(e.message);
  }
}

function renderServicioDetalle(d) {
  const sec = $("SERVICIO_DETALLE");
  if (!sec) return;
  sec.innerHTML = "<h3>Servicio seleccionado</h3>";
  const info = [
    ["Folio", d.folio], ["Estado", d.estado], ["Conductor", d.conductorId || d.conductor],
    ["Vehículo", d.vehiculoId || d.vehiculo], ["Ruta", d.rutaId || d.ruta],
    ["Fecha de creación", d.fechaCreacion], ["Creado por", d.creadoPor],
    ["Fecha de cierre", d.fechaCierre], ["Cerrado por", d.cerradoPor],
  ];
  info.forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      const p = el("p", "", k + ": " + v);
      p.style.cssText = "margin:2px 0;font-size:0.85rem";
      sec.appendChild(p);
    }
  });

  const area = sesion.area;
  // Modificación y cierre (solo OPERACIONES_LOGISTICA y servicio abierto)
  if (area === "OPERACIONES_LOGISTICA" && d.estado !== "CERRADO") {
    const btnCerrar = document.createElement("button");
    btnCerrar.className = "fm-btn";
    btnCerrar.textContent = "Cerrar servicio";
    btnCerrar.style.cssText = "margin-top:8px;border-color:var(--color-danger);color:var(--color-danger)";
    btnCerrar.addEventListener("click", () => confirmarCierre(d));
    sec.appendChild(btnCerrar);
  }
  if (d.estado === "CERRADO") {
    sec.appendChild(el("p", "fm-readonly-banner",
      "Servicio cerrado. Consulta disponible en modo de solo lectura."));
  }
}

async function confirmarCierre(d) {
  const ok = confirm("Al cerrar este servicio, ninguna de las áreas podrá agregar información, modificar datos ni enviar mensajes. Esta acción no puede revertirse.");
  if (!ok) return;
  try {
    await WixApi.cerrarServicio(d.servicioId || d.id || d._id, versionActual);
    await seleccionarServicio(d.servicioId || d.id || d._id);
    await recargarServicios();
  } catch (e) {
    alert("No fue posible confirmar el resultado. Consulte el servicio antes de intentar nuevamente.\n" + e.message);
  }
}

async function recargarServicios() {
  await cargarCatalogoYServicios(sesion.area);
}

// ---------------------------------------------------------------------------
// Mensajes (chat compartido)
// ---------------------------------------------------------------------------
const vistos = new Set();
let cargandoMensajes = false;

async function cargarMensajes() {
  if (!servicioActual || cargandoMensajes) return;
  cargandoMensajes = true;
  try {
    const resp = await WixApi.mensajes(servicioActual);
    const lista = resp?.data?.mensajes || resp?.data || [];
    renderMensajes(Array.isArray(lista) ? lista : []);
    $("CHAT_STATUS").textContent = "Actualizado: " + horaLocal(new Date());
  } catch (e) {
    $("CHAT_STATUS").textContent = e.message;
  } finally {
    cargandoMensajes = false;
  }
}

function renderMensajes(lista) {
  const cont = $("MESSAGES");
  if (!cont) return;
  // Solo añadir mensajes nuevos (dedup por mensajeId)
  lista.forEach(m => {
    const id = m.mensajeId || m.id || m._id || "";
    if (!id || vistos.has(id)) return;
    vistos.add(id);
    cont.appendChild(renderMensaje(m));
  });
  if (lista.length && !cont.dataset.scrolled) {
    cont.scrollTop = cont.scrollHeight;
    cont.dataset.scrolled = "1";
  }
}

function renderMensaje(m) {
  const div = document.createElement("div");
  const area = m.area || m.Area || "SISTEMA";
  const tipo = m.tipo || m.recordType || m.tipoRegistro || "MENSAJE";
  div.className = "fm-msg " + (tipo !== "MENSAJE" ? "sistema " : "") + area;

  const head = document.createElement("div");
  head.className = "head";
  const areaEl = el("span", "area", (m.area || m.Area || "SISTEMA"));
  const userEl = el("span", "", m.usuario || m.usuario || m.user || "Sistema");
  const tipoEl = el("span", "", tipo);
  const fechaEl = el("span", "", fechaHora(m.fecha || m.fechaServidor || m.fechaEnvio));
  head.append(areaEl, userEl, tipoEl, fechaEl);
  div.appendChild(head);

  const cuerpo = document.createElement("div");
  cuerpo.className = "cuerpo";
  cuerpo.textContent = m.mensaje || m.contenido || m.texto || "";  // textContent evita XSS
  div.appendChild(cuerpo);

  return div;
}

function fechaHora(v) {
  if (!v) return "";
  try {
    return new Date(v).toLocaleString("es-MX", { timeZone: "America/Mexico_City",
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit",
      minute: "2-digit", second: "2-digit", hour12: false });
  } catch (e) { return String(v); }
}

function horaLocal(d) {
  return d.toLocaleTimeString("es-MX", { hour12: false });
}

// Categorías autorizadas (desde sesión)
function categoriasAutorizadas() {
  return sesion?.categorias || sesion?.categories || sesion?.categoriasPermitidas || ["Mensaje General"];
}

async function enviarMensaje() {
  if (!servicioActual) return;
  const cat = $("CATEGORIA").value;
  const msg = $("MENSAJE").value.trim();
  if (!msg) return;
  const btn = $("BTN_ENVIAR");
  btn.disabled = true;
  try {
    await WixApi.enviarMensaje(servicioActual, cat, msg, "CHAT");
    $("MENSAJE").value = "";
    await cargarMensajes();
  } catch (e) {
    // conservar la entrada del usuario en caso de error
    $("CHAT_STATUS").textContent = "No fue posible confirmar el resultado: " + e.message;
  } finally { btn.disabled = false; }
}

// ---------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------
const ESTADOS = ["PENDIENTE", "VERIFICADO", "ANOMALIA", "NO_APLICA"];
const GRUPOS = ["Documentación personal", "Documentación vehicular", "Documentación de carga",
  "Inspección vehicular", "Equipamiento de seguridad", "Inspección de carga"];

async function cargarChecklist() {
  const sec = $("CHECKLIST");
  if (!sec) return;
  let plantilla = [];
  try {
    const resp = await WixApi.checklistPlantilla();
    plantilla = resp?.data?.items || resp?.data || [];
  } catch (e) {
    sec.innerHTML = "<h3>Checklist de salida</h3><p class=\"fm-error\">" + e.message + "</p>";
    return;
  }
  const items = Array.isArray(plantilla) ? plantilla : [];
  // Si el backend no devuelve ítems, no se inventa una plantilla.
  if (!items.length) {
    sec.innerHTML = "<h3>Checklist de salida</h3><p class=\"fm-empty\">No se recibió la plantilla del checklist.</p>";
    return;
  }
  renderChecklist(sec, items);
}

function renderChecklist(sec, items) {
  sec.innerHTML = "<h3>Checklist de salida</h3>";
  const progress = el("div", "fm-checklist-progress", "");
  sec.appendChild(progress);
  const lista = document.createElement("div");
  sec.appendChild(lista);

  const estados = new Map(items.map((it, i) => [it.id || it._id || i, "PENDIENTE"]));
  const actualizarProgreso = () => {
    const n = estados.size;
    const verificados = [...estados.values()].filter(v => v === "VERIFICADO").length;
    const pendientes = [...estados.values()].filter(v => v === "PENDIENTE").length;
    progress.textContent = `Progreso: ${verificados} verificados · ${pendientes} pendientes · ${n} total`;
  };

  items.forEach((it, i) => {
    const id = it.id || it._id || i;
    const div = document.createElement("div");
    div.className = "fm-checklist-item";
    const row = document.createElement("div");
    row.className = "row";
    const nombre = el("span", "", (it.nombre || it.descripcion || it.item || "Ítem " + (i + 1)));
    nombre.style.flex = "1";
    const sel = document.createElement("select");
    ESTADOS.forEach(e => sel.appendChild(new Option(e, e)));
    sel.value = "PENDIENTE";
    const obs = document.createElement("input");
    obs.type = "text";
    obs.placeholder = "Observación (obligatoria para ANOMALIA y NO_APLICA)";
    obs.style.cssText = "flex:2;min-width:140px;padding:6px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-surface);color:var(--color-text)";
    sel.addEventListener("change", () => {
      estados.set(id, sel.value);
      obs.required = (sel.value === "ANOMALIA" || sel.value === "NO_APLICA");
      actualizarProgreso();
    });
    row.append(nombre, sel);
    div.appendChild(row);
    div.appendChild(obs);
    lista.appendChild(div);
  });

  const btn = document.createElement("button");
  btn.className = "fm-btn primary";
  btn.textContent = "Enviar checklist";
  btn.style.marginTop = "10px";
  btn.addEventListener("click", async () => {
    const itemsEstado = items.map((it, i) => {
      const id = it.id || it._id || i;
      return { id, estado: estados.get(id), observacion: "" };
    });
    btn.disabled = true;
    try {
      await WixApi.guardarChecklist(servicioActual, versionActual, itemsEstado);
      alert("Checklist enviado.");
    } catch (e) {
      alert("No fue posible confirmar el resultado. Consulte el servicio antes de intentar nuevamente.\n" + e.message);
    } finally { btn.disabled = false; }
  });
  sec.appendChild(btn);
  actualizarProgreso();
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------
function iniciarPolling(area) {
  if (polling) return;
  $("BTN_ENVIAR")?.addEventListener("click", enviarMensaje);
  // Poblar categorías
  const sel = $("CATEGORIA");
  if (sel) {
    categoriasAutorizadas().forEach(c => sel.appendChild(new Option(c, c)));
  }

  const tick = () => {
    if (document.hidden) return;         // no consultar si la página no es visible
    if (servicioActual) cargarMensajes();
  };
  timer = setInterval(tick, 3000);
  polling = true;

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && servicioActual) cargarMensajes();
  });
}

function detenerPolling() {
  if (timer) { clearInterval(timer); timer = null; }
  polling = false;
  if (servicioAbort) { servicioAbort.abort(); servicioAbort = null; }
}

// ---------------------------------------------------------------------------
// Utilidad DOM
// ---------------------------------------------------------------------------
function el(tag, cls, texto) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
if (document.getElementById("LOGIN_BOX")) {
  flujoLogin();
} else if (document.getElementById("PANEL")) {
  flujoPanel();
}
