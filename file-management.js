/* ============================================================
   SECURITYTRANS — FILE MANAGEMENT (lógica)

   Propósito:
     Gestión documental y operativa de servicios con Wix: login, catálogos,
     servicios, detalle con tarjeta de información, check de salida (46
     puntos), chat compartido estilo mensajería y cierre de servicio.

   Seguridad:
     - XSS: todo contenido del backend se renderiza con textContent.
     - Sin eval, sin credenciales hardcodeadas, sin console de secretos.
     - Token solo en sessionStorage.

   Restricciones:
     - La carga de documentos/fotos permanece deshabilitada (backend pendiente).
   ============================================================ */

import { WixApi, getToken, setToken, clearToken } from "./wix-api.js";

const SESSION_KEY = "st_session_data";
const AREAS = {
  OPERACIONES_LOGISTICA: { nombre: "Operaciones - Logística", color: "#2563EB" },
  ADMINISTRACION: { nombre: "Administración", color: "#7C3AED" },
  CONDUCTOR: { nombre: "Conductor", color: "#15803D" },
};

const GRUPOS_FALLBACK = {
  PERSONAL: "Documentación personal del conductor",
  VEHICULAR: "Documentación del vehículo",
  DOCUMENTOS_CARGA: "Documentación de la carga",
  VEHICULO: "Inspección física del vehículo",
  SEGURIDAD: "Material y equipo de seguridad",
  CARGA: "Inspección de la carga",
};

const ESTADOS_CHECK = ["PENDIENTE", "VERIFICADO", "ANOMALIA", "NO_APLICA"];
const TIPOS_SISTEMA = { CREACION: "Servicio creado", CAMBIO: "Actualización del servicio",
  CHECKLIST: "Check de salida registrado", CIERRE: "Servicio cerrado" };

const ETAPAS = [
  { id: "ALTA_SERVICIO", nombre: "Alta de servicio" },
  { id: "CARGA", nombre: "Carga" },
  { id: "INICIO_RUTA", nombre: "Inicio de ruta" },
  { id: "DESCARGA", nombre: "Descarga" },
  { id: "ENTREGA_DOCS", nombre: "Entrega de docs" },
  { id: "CIERRE_SERVICIO", nombre: "Cierre de servicio" },
];

// ---------------------------------------------------------------------------
// Utilidades de sesión
// ---------------------------------------------------------------------------
function guardarSesion(d) { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(d)); } catch (e) {} }
function leerSesion() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { return null; } }
function limpiarSesion() { clearToken(); try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {} }
function $id(id) { return document.getElementById(id); }
function areaDesdeURL() { return new URLSearchParams(location.search).get("area") || ""; }

// ---------------------------------------------------------------------------
// Utilidades de texto / DOM (seguras)
// ---------------------------------------------------------------------------
function el(tag, cls, texto) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (texto !== undefined) e.textContent = texto;   // textContent: sin XSS
  return e;
}

// Convierte cualquier valor (cadena u objeto) a texto legible (nunca [object Object]).
function textoDe(v) {
  if (v === undefined || v === null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object") {
    return v.title || v.nombre || v.nombreCompleto || v.name || v.descripcion
      || v.origen || v.destino || "";
  }
  return String(v);
}

function iniciales(nombre) {
  const n = (nombre || "").toString().trim();
  if (!n) return "?";
  return n.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase();
}

function fechaHora(v) {
  if (!v) return "";
  try {
    return new Date(v).toLocaleString("es-MX", { timeZone: "America/Mexico_City",
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit",
      minute: "2-digit", second: "2-digit", hour12: false });
  } catch (e) { return String(v); }
}
function diaClave(v) {
  if (!v) return "";
  try {
    return new Date(v).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" });
  } catch (e) { return String(v); }
}
function horaCorta() { return new Date().toLocaleTimeString("es-MX", { hour12: false }); }

// Clasifica errores de login (no todo error HTTP 400 es contraseña).
function clasificarError(e) {
  const msg = (e && e.message) ? String(e.message) : "";
  if (/acceso demo|contrase|password|incorrect/i.test(msg)) return "Contraseña incorrecta. Verifique su acceso.";
  if (/sesi.n expirada|token|401|no autentic/i.test(msg)) return "Su sesión ha expirado. Inicie sesión nuevamente.";
  if (/contactar|conectar|servidor|fetch|red|network|cors|origin|failed|fall/i.test(msg)) return "No fue posible conectar con el servidor.";
  return msg || "No fue posible conectar con el servidor.";
}

// ===========================================================================
// LOGIN
// ===========================================================================
function flujoLogin() {
  const area = areaDesdeURL();
  const info = AREAS[area];
  if (!info) { const b = $id("LOGIN_ERROR"); b.textContent = "Área no reconocida."; b.hidden = false; return; }
  $id("AREA_TITLE").textContent = info.nombre;
  $id("AREA_SUB").textContent = "Área: " + area;
  document.body.classList.add("fm-area-" + area);
  $id("BTN_VOLVER").addEventListener("click", () => location.href = "./file-management.html");
  $id("BTN_INGRESAR").addEventListener("click", ingresar);

  async function ingresar() {
    const usuario = $id("USERNAME").value.trim();
    const passwordRaw = $id("PASSWORD").value;
    if (!usuario) { mostrarError("Ingrese su nombre de usuario."); return; }
    if (!passwordRaw || passwordRaw.trim() === "") { mostrarError("Ingrese su contraseña."); return; }
    $id("BTN_INGRESAR").disabled = true;
    $id("LOGIN_LOADING").hidden = false;
    $id("LOGIN_ERROR").hidden = true;
    try {
      const resp = await WixApi.login(usuario, passwordRaw, area);
      const token = resp?.data?.token || resp?.token || resp?.data?.sessionToken;
      if (!token) { mostrarError("El servidor no devolvió un token de sesión."); return; }
      setToken(token);
      try { sessionStorage.setItem("st_usuario", usuario); } catch (e) {}
      location.href = "./file-panel.html";
    } catch (e) {
      mostrarError(clasificarError(e));
    } finally {
      $id("BTN_INGRESAR").disabled = false;
      $id("LOGIN_LOADING").hidden = true;
    }
  }
  function mostrarError(m) { const b = $id("LOGIN_ERROR"); b.textContent = m; b.hidden = false; }
}

// ===========================================================================
// PANEL
// ===========================================================================
let sesion = null;
let servicioIdActual = null;
let versionActual = 1;
let timer = null;
let cargandoMensajes = false;
let esMovil = () => window.innerWidth <= 900;
const vistos = new Map();  // servicioId -> Set(mensajeId)
let adjunto = null;        // { file, objectUrl, nombreArchivo, tipoArchivo, base64 }
let enviando = false;      // evita envíos concurrentes
let visorUrl = null;       // URL del adjunto abierto en el visor
let visorNombre = null;    // nombre del adjunto abierto en el visor
let visorZoom = 1;
let mensajesActuales = []; // últimos mensajes del servicio (para el panel de documentos)

function flujoPanel() {
  if (!getToken()) { location.href = "./file-management.html"; return; }
  (async () => {
    try { sesion = (await WixApi.session())?.data || {}; guardarSesion(sesion); }
    catch (e) { sesion = leerSesion(); if (!sesion) { limpiarSesion(); location.href = "./file-management.html"; return; } }
    const area = sesion.area || areaDesdeURL() || "";
    let usuarioLocal = null; try { usuarioLocal = sessionStorage.getItem("st_usuario"); } catch (e) {}
    sesion.usuario = sesion.usuario || sesion.nombre || sesion.user || usuarioLocal || "—";
    document.body.classList.add("fm-area-" + area);
    $id("TOP_AREA").textContent = AREAS[area]?.nombre || area;
    $id("TOP_USER").textContent = sesion.usuario;
    $id("BTN_LOGOUT").addEventListener("click", cerrarSesion);
    $id("BTN_ENVIAR").addEventListener("click", enviarMensaje);
    $id("MENSAJE").addEventListener("keydown", onTeclaMensaje);
    $id("BTN_ADJUNTAR").addEventListener("click", () => { $id("FILE_INPUT").removeAttribute("capture"); $id("FILE_INPUT").click(); });
    $id("BTN_CAMARA").addEventListener("click", () => { $id("FILE_INPUT").setAttribute("capture", "environment"); $id("FILE_INPUT").click(); });
    $id("FILE_INPUT").addEventListener("change", (e) => seleccionarAdjunto(e.target.files && e.target.files[0]));
    configurarVisor();
    document.addEventListener("click", manejarBotonesMoviles);
    poblarCategorias();
    await cargarCatalogosYServicios(area);
    iniciarPolling(area);
  })();
}

function cerrarSesion() { detenerPolling(); limpiarSesion(); location.href = "./file-management.html"; }

function manejarBotonesMoviles(e) {
  const t = e.target.closest("[data-accion]"); if (!t) return;
  const accion = t.dataset.accion;
  if (accion === "chat") {
    if (esMovil()) { $id("PANEL").classList.add("hidden-mobile"); $id("CHAT").classList.remove("hidden-mobile"); }
    $id("CHAT").scrollIntoView({ behavior: "smooth" });
  } else if (accion === "panel") {
    if (esMovil()) { $id("CHAT").classList.add("hidden-mobile"); $id("PANEL").classList.remove("hidden-mobile"); }
    $id("PANEL").scrollIntoView({ behavior: "smooth" });
  }
}

function poblarCategorias() {
  const sel = $id("CATEGORIA");
  const cats = sesion?.categorias || sesion?.categories || sesion?.categoriasPermitidas || ["Mensaje General"];
  sel.innerHTML = "";
  (Array.isArray(cats) ? cats : []).forEach(c => {
    // En OPERACIONES_LOGISTICA se oculta la categoría "Ruta" (solo en el frontend).
    if (sesion?.area === "OPERACIONES_LOGISTICA" && String(c).trim().toLowerCase() === "ruta") return;
    sel.appendChild(new Option(c, c));
  });
}

// ===========================================================================
// Timeline de progreso del servicio (solo local, sin Backend)
// ===========================================================================
function claveTimeline() {
  const u = sesion?.usuario || "anonimo";
  return "securitytrans:fm:timeline:v1:" + servicioIdActual + ":" + (sesion?.area || "") + ":" + u;
}

function leerEtapas() {
  try {
    const raw = localStorage.getItem(claveTimeline());
    if (raw) { const d = JSON.parse(raw); if (d && d.etapas) return d.etapas; }
  } catch (e) { /* dato corrupto: se recupera el valor por defecto */ }
  // Por defecto: "Alta de servicio" ya está completada (el servicio existe).
  return { ALTA_SERVICIO: true, CARGA: false, INICIO_RUTA: false, DESCARGA: false, ENTREGA_DOCS: false, CIERRE_SERVICIO: false };
}

function guardarEtapas(etapas) {
  try {
    localStorage.setItem(claveTimeline(), JSON.stringify({ version: 1, etapas, actualizadoLocal: new Date().toISOString() }));
  } catch (e) { /* degradación a memoria (sin persistencia) */ }
}

function renderTimeline(soloLectura) {
  const cont = $id("TIMELINE"); if (!cont) return;
  cont.innerHTML = "";
  if (!servicioIdActual) { cont.hidden = true; return; }
  cont.hidden = false;
  cont.dataset.readonly = soloLectura ? "1" : "0";
  const etapas = leerEtapas();

  const track = el("div", "fm-timeline-track");
  ETAPAS.forEach(et => {
    const completado = !!etapas[et.id];
    const step = el("div", "fm-step" + (completado ? " completado" : ""));
    step.dataset.etapa = et.id;
    const btn = el("button", "dot", completado ? "✓" : "");
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(completado));
    btn.setAttribute("aria-label", et.nombre + (completado ? " (completada)" : " (pendiente)"));
    btn.title = et.nombre;
    if (soloLectura) {
      btn.disabled = true;
    } else {
      btn.addEventListener("click", () => {
        const e2 = leerEtapas();
        e2[et.id] = !e2[et.id];
        guardarEtapas(e2);
        renderTimeline(false);  // solo re-renderiza el Timeline (no toca el Backend)
      });
    }
    step.appendChild(btn);
    step.appendChild(el("span", "label", et.nombre));
    track.appendChild(step);
  });
  cont.appendChild(track);

  const completadas = ETAPAS.filter(et => etapas[et.id]).length;
  const pct = Math.round(completadas / 6 * 100);
  const info = el("div", "fm-timeline-info");
  info.appendChild(el("span", "", "Progreso del servicio · " + completadas + " de 6 etapas"));
  info.appendChild(el("span", "pct", pct + "% completado"));
  cont.appendChild(info);
  cont.appendChild(el("div", "fm-timeline-note", "Seguimiento local — Las marcaciones se guardan únicamente en este navegador."));
}

// ---------------------------------------------------------------------------
// Catálogos y servicios
// ---------------------------------------------------------------------------
let catalogo = { conductores: [], vehiculos: [], rutas: [] };

async function cargarCatalogosYServicios(area) {
  $id("PANEL_CONTENT").innerHTML = "";
  try { const c = await WixApi.catalogos(); catalogo = normalizarCatalogo(c?.data); } catch (e) { catalogo = { conductores: [], vehiculos: [], rutas: [] }; }
  const servicios = await obtenerServicios();
  renderPanel(area, servicios);
}

function normalizarCatalogo(d) {
  d = d || {};
  return {
    conductores: d.conductores || d.Conductores || [],
    vehiculos: d.vehiculos || d.Vehiculos || [],
    rutas: d.rutas || d.Rutas || [],
  };
}

async function obtenerServicios() {
  try { const r = await WixApi.servicios(); return Array.isArray(r?.data) ? r.data : (r?.data?.servicios || []); }
  catch (e) { return []; }
}

function renderPanel(area, servicios) {
  const cont = $id("PANEL_CONTENT");
  cont.innerHTML = "";

  if (area === "OPERACIONES_LOGISTICA") cont.appendChild(cardCrearServicio());

  cont.appendChild(cardServicioSeleccionado(area));
  if (area === "CONDUCTOR") cont.appendChild(cardChecklist());
  cont.appendChild(cardDocumentos());
  cont.appendChild(cardServicios(area, servicios));

  const btnChat = el("button", "fm-btn primary", "Abrir chat");
  btnChat.dataset.accion = "chat";
  btnChat.style.marginTop = "12px";
  cont.appendChild(btnChat);
}

// --- AJ-06: Crear servicio ---
function cardCrearServicio() {
  const card = el("div", "fm-card");
  card.appendChild(el("h3", "", "Crear servicio"));

  const folio = campo("Folio del servicio", "input", "text");
  const conductor = campo("Conductor", "select");
  const vehiculo = campo("Vehículo", "select");
  const ruta = campo("Ruta", "select");

  llenarSelect(conductor.input, catalogo.conductores, "conductorId");
  llenarSelect(vehiculo.input, catalogo.vehiculos, "vehiculoId");
  llenarSelect(ruta.input, catalogo.rutas, "rutaId");

  const msg = el("p", "fm-error", ""); msg.hidden = true;
  const btn = el("button", "fm-btn primary", "Crear servicio");
  btn.addEventListener("click", async () => {
    const f = folio.input.value.trim();
    if (!f) { msg.textContent = "Ingrese el folio del servicio."; msg.hidden = false; return; }
    if (!conductor.input.value || !vehiculo.input.value || !ruta.input.value) {
      msg.textContent = "Seleccione conductor, vehículo y ruta."; msg.hidden = false; return;
    }
    btn.disabled = true; btn.textContent = "Creando…"; msg.hidden = true;
    try {
      const resp = await WixApi.crearServicio(f, conductor.input.value, vehiculo.input.value, ruta.input.value);
      const sid = resp?.data?.servicioId || resp?.data?.id || resp?.data?._id;
      if (!sid) throw new Error("No se recibió el identificador del servicio.");
      // limpiar y refrescar
      folio.input.value = ""; conductor.input.value = ""; vehiculo.input.value = ""; ruta.input.value = "";
      msg.textContent = "Servicio creado correctamente."; msg.hidden = false; msg.style.color = "var(--fm-success)";
      await seleccionarServicio(sid);
      await refrescarServicios();
    } catch (e) {
      msg.textContent = "No fue posible confirmar el resultado. Consulte el servicio antes de intentar nuevamente.";
      msg.hidden = false; msg.style.color = "var(--fm-danger)";
      await refrescarServicios();
    } finally { btn.disabled = false; btn.textContent = "Crear servicio"; }
  });

  card.append(folio.wrap, conductor.wrap, vehiculo.wrap, ruta.wrap, msg, btn);
  return card;
}

function campo(label, tipo, tipoInput) {
  const wrap = el("div", "fm-field");
  const l = el("label", "", label);
  const input = el(tipo, "", "");
  if (tipoInput) input.type = tipoInput;
  wrap.append(l, input);
  return { wrap, input };
}

function llenarSelect(sel, items, idKey) {
  sel.appendChild(new Option("— seleccione —", ""));
  (Array.isArray(items) ? items : []).forEach(it => {
    const id = it[idKey] || it.id || it._id || "";
    const nombre = textoDe(it) || id;
    sel.appendChild(new Option(nombre, id));
  });
}

// --- AJ-02..05: Tarjeta de servicio seleccionado ---
function cardServicioSeleccionado(area) {
  const card = el("div", "fm-card");
  card.appendChild(el("h3", "", "Servicio seleccionado"));
  const body = el("div", "fm-empty", "Seleccione un servicio para ver su detalle.");
  body.id = "SERVICIO_DETALLE";
  card.appendChild(body);
  return card;
}

async function seleccionarServicio(sid) {
  servicioIdActual = sid;
  vistos.set(sid, vistos.get(sid) || new Set());
  try {
    const resp = await WixApi.servicio(sid);
    const d = resp?.data || {};
    versionActual = d.version || d.Version || d.servicio?.version || 1;
    renderInfoCard(d);
    const estado = textoDe(d.estado || d.servicio?.estado || "").toUpperCase();
    $id("TOP_FOLIO").textContent = "Folio: " + (textoDe(d.folio || d.servicio?.folio) || sid);
    $id("TOP_STATUS").textContent = estado || "";
    actualizarChatHeader(d);
    actualizarModoLectura(estado === "CERRADO");
    renderTimeline(estado === "CERRADO");
    if (sesion.area === "CONDUCTOR") await cargarChecklist();
    await cargarMensajes();
  } catch (e) { $id("SERVICIO_DETALLE").textContent = e.message; }
}

function renderInfoCard(d) {
  const cont = $id("SERVICIO_DETALLE"); if (!cont) return;
  cont.innerHTML = "";
  const s = d.servicio || d;

  // Cabecera del servicio
  const head = el("div", "fm-service-head");
  const folio = el("span", "folio", textoDe(s.folio) || "—");
  const estado = textoDe(s.estado || "").toUpperCase();
  const chip = el("span", "estado fm-estado-" + estado, estado || "—");
  head.append(folio, chip);
  cont.appendChild(head);

  const meta = el("div", "fm-service-meta");
  meta.textContent = "Creado: " + fechaHora(s.fechaCreacion || s.createdAt)
    + (s.creadoPor ? " · Por: " + textoDe(s.creadoPor) : "")
    + (s.fechaCierre ? " · Cierre: " + fechaHora(s.fechaCierre) : "")
    + (s.cerradoPor ? " · Por: " + textoDe(s.cerradoPor) : "");
  cont.appendChild(meta);

  const grid = el("div", "fm-info-grid");

  // Operador
  const conductor = d.conductor || s.conductor || {};
  grid.appendChild(bloqueInfo("🧑‍✈️", textoDe(conductor) || "Conductor",
    ["Identificador: " + textoDe(conductor.conductorId || conductor.id || "No disponible"),
     "Licencia: " + textoDe(conductor.numeroLicencia || "No disponible"),
     "Examen médico: " + textoDe(conductor.numeroExamenMedico || "No disponible")]));

  // Vehículo
  const vehiculo = d.vehiculo || s.vehiculo || {};
  grid.appendChild(bloqueInfo("🚚", textoDe(vehiculo) || "Vehículo",
    ["Modelo: " + textoDe(vehiculo.modelo || "No disponible"),
     "Placas: " + textoDe(vehiculo.placas || "No disponible"),
     "Identificador: " + textoDe(vehiculo.vehiculoId || vehiculo.id || "No disponible")]));

  // Ruta
  const ruta = d.ruta || s.ruta || {};
  const origen = textoDe(ruta.origen || "—");
  const destino = textoDe(ruta.destino || "—");
  const rutaBloque = el("div", "fm-info-block");
  rutaBloque.appendChild(el("span", "ico", "🗺️"));
  const rdatos = el("div", "datos");
  rdatos.appendChild(el("div", "nombre", textoDe(ruta) || "Ruta"));
  const rlinea = el("div", "fm-ruta-line");
  rlinea.appendChild(el("span", "", origen));
  rlinea.appendChild(el("span", "arrow", "→"));
  rlinea.appendChild(el("span", "", destino));
  rdatos.appendChild(rlinea);
  rdatos.appendChild(el("div", "detalle", "Identificador: " + textoDe(ruta.rutaId || ruta.id || "No disponible")));
  rutaBloque.appendChild(rdatos);
  grid.appendChild(rutaBloque);

  cont.appendChild(grid);

  // Cierre (solo OPERACIONES_LOGISTICA, servicio abierto)
  if (sesion.area === "OPERACIONES_LOGISTICA" && (estado !== "CERRADO")) {
    const btn = el("button", "fm-btn", "Cerrar servicio");
    btn.style.cssText = "margin-top:14px;color:var(--fm-danger);border-color:var(--fm-danger)";
    btn.addEventListener("click", () => confirmarCierre(sid, s));
    cont.appendChild(btn);
  }
  if (estado === "CERRADO") {
    cont.appendChild(el("div", "fm-readonly", "Servicio cerrado · Solo lectura"));
  }
}

function bloqueInfo(icono, nombre, detalles) {
  const b = el("div", "fm-info-block");
  b.appendChild(el("span", "ico", icono));
  const d = el("div", "datos");
  d.appendChild(el("div", "nombre", nombre));
  detalles.forEach(t => d.appendChild(el("div", "detalle", t)));
  b.appendChild(d);
  return b;
}

async function confirmarCierre(sid, s) {
  const ok = confirm("Al cerrar este servicio, ninguna de las áreas podrá agregar información, modificar datos ni enviar mensajes. Esta acción no puede revertirse.");
  if (!ok) return;
  try {
    await WixApi.cerrarServicio(sid, versionActual);
    await seleccionarServicio(sid);
    await refrescarServicios();
  } catch (e) {
    alert("No fue posible confirmar el resultado. Consulte el servicio antes de intentar nuevamente.\n" + e.message);
  }
}

// --- Documentos del servicio (panel) ---
function cardDocumentos() {
  const card = el("div", "fm-card");
  card.appendChild(el("h3", "", "Documentos del servicio"));
  const body = el("div", "fm-empty", "Seleccione un servicio para ver sus documentos.");
  body.id = "DOCUMENTOS";
  card.appendChild(body);
  return card;
}

function renderDocumentos(lista) {
  const cont = $id("DOCUMENTOS"); if (!cont) return;
  const docs = (Array.isArray(lista) ? lista : []).filter(m => m.tieneArchivo);
  cont.innerHTML = "";
  if (!docs.length) { cont.appendChild(el("div", "fm-empty", "Sin documentos en este servicio.")); return; }
  const grid = el("div", "fm-docs-grid");
  docs.forEach(m => {
    const fila = el("div", "fm-doc-row");
    fila.appendChild(el("span", "ico", (m.tipoArchivo || "").toLowerCase() === "application/pdf" ? "📄" : "🖼️"));
    const datos = el("div", "datos");
    datos.appendChild(el("div", "nombre", m.nombreArchivo || "documento"));
    datos.appendChild(el("div", "meta", textoDe(m.categoria || "") + " · " + textoDe(m.usuario || "") + " · " + fechaHora(m.fechaEnvio) + " · " + formatoTamano(m.tamanoArchivo)));
    fila.appendChild(datos);
    const acc = el("div", "acciones");
    const bVer = el("button", "", "Ver"); bVer.addEventListener("click", () => verAdjunto(m));
    const bDes = el("button", "", "Descargar"); bDes.addEventListener("click", () => descargarAdjunto(m));
    acc.append(bVer, bDes);
    fila.appendChild(acc);
    grid.appendChild(fila);
  });
  cont.appendChild(grid);
}

// --- AJ-07..10: Lista de servicios ---
function cardServicios(area, servicios) {
  const card = el("div", "fm-card");
  card.appendChild(el("h3", "", "Servicios registrados"));

  const filtros = el("div", "fm-filtros");
  const buscar = el("input", "", ""); buscar.type = "search"; buscar.placeholder = "Buscar folio u operador…";
  const estSel = el("select", "", "");
  ["Todos", "Abiertos", "Cerrados"].forEach(o => estSel.appendChild(new Option(o, o)));
  filtros.append(buscar, estSel);
  card.appendChild(filtros);

  const resumen = el("div", "fm-progress", "");
  const tabla = el("div", "table-wrap");
  const tbl = el("table", "fm-table");
  tabla.appendChild(tbl);
  card.appendChild(resumen); card.appendChild(tabla);

  const render = () => {
    const term = buscar.value.toLowerCase();
    const fEstado = estSel.value;
    const lista = (Array.isArray(servicios) ? servicios : [])
      .filter(s => !term || (textoDe(s.folio).toLowerCase().includes(term) || textoDe(s.conductor).toLowerCase().includes(term) || textoDe(s.conductorId).toLowerCase().includes(term)))
      .filter(s => {
        const e = textoDe(s.estado).toUpperCase();
        if (fEstado === "Abiertos") return e === "ABIERTO";
        if (fEstado === "Cerrados") return e === "CERRADO";
        return true;
      });
    const abiertos = lista.filter(s => textoDe(s.estado).toUpperCase() === "ABIERTO").length;
    const cerrados = lista.length - abiertos;
    resumen.textContent = `Abiertos: ${abiertos} · Cerrados: ${cerrados} · Total: ${lista.length}`;

    tbl.innerHTML = "";
    const th = el("tr");
    ["Folio", "Operador", "Vehículo", "Ruta", "Estado", "Creación", ""].forEach(h => th.appendChild(el("th", "", h)));
    tbl.appendChild(th);
    lista.forEach(s => {
      const tr = el("tr");
      tr.appendChild(td(textoDe(s.folio) || s._id || ""));
      tr.appendChild(td(textoDe(s.conductor) || textoDe(s.conductorId) || ""));
      tr.appendChild(td(textoDe(s.vehiculo) || textoDe(s.vehiculoId) || ""));
      tr.appendChild(td(textoDe(s.ruta) || textoDe(s.rutaId) || ""));
      tr.appendChild(td(textoDe(s.estado) || ""));
      tr.appendChild(td(fechaHora(s.fechaCreacion || s.createdAt)));
      const tacc = el("td");
      const b = el("button", "fm-btn", "Ver detalle");
      b.addEventListener("click", () => seleccionarServicio(s.servicioId || s.id || s._id));
      tacc.appendChild(b);
      tr.appendChild(tacc);
      tbl.appendChild(tr);
    });
  };
  buscar.addEventListener("input", render);
  estSel.addEventListener("change", render);
  render();
  return card;
}
function td(t) { const d = el("td", "", ""); d.textContent = t === undefined || t === null ? "" : String(t); return d; }

// --- AJ-01: Checklist (46 puntos, 6 grupos) ---
function cardChecklist() {
  const card = el("div", "fm-card");
  card.appendChild(el("h3", "", "Check de salida"));
  const body = el("div", "fm-empty", "Seleccione un servicio para cargar su check de salida.");
  body.id = "CHECKLIST";
  card.appendChild(body);
  return card;
}

async function cargarChecklist() {
  const cont = $id("CHECKLIST"); if (!cont) return;
  cont.innerHTML = "";
  try {
    const r = await WixApi.checklistPlantilla();
    const plantilla = normalizarPlantilla(r?.data);
    renderChecklist(cont, plantilla);
  } catch (e) {
    cont.appendChild(el("p", "fm-error", "No fue posible cargar la plantilla: " + e.message));
  }
}

function normalizarPlantilla(d) {
  if (!d) return [];
  if (Array.isArray(d)) return d;                       // grupos o items
  if (Array.isArray(d.grupos)) return d.grupos;
  if (Array.isArray(d.items)) return d.items;
  if (Array.isArray(d.puntos)) return d.puntos;
  if (Array.isArray(d.data)) return d.data;
  return [];
}

function renderChecklist(cont, plantilla) {
  // Determinar si es estructura de grupos o plana
  const esGrupos = plantilla.some(g => g && Array.isArray(g.puntos));
  let grupos;
  if (esGrupos) {
    grupos = plantilla.map(g => ({ grupoId: g.grupoId, titulo: g.titulo || GRUPOS_FALLBACK[g.grupoId] || "Grupo", puntos: g.puntos || [] }));
  } else {
    // plana: agrupar por grupoId o un solo grupo
    const porGrupo = {};
    plantilla.forEach(it => {
      const g = it.grupoId || it.grupo || "GENERAL";
      (porGrupo[g] = porGrupo[g] || []).push(it);
    });
    grupos = Object.keys(porGrupo).map(g => ({ grupoId: g, titulo: GRUPOS_FALLBACK[g] || g, puntos: porGrupo[g] }));
  }

  const total = grupos.reduce((a, g) => a + g.puntos.length, 0);
  const estados = new Map();

  // Barra de progreso global
  const prog = el("div", "fm-progress", "");
  const barra = el("div", "fm-progress-bar"); barra.appendChild(el("div"));
  cont.append(prog, barra);

  const actualizar = () => {
    const n = estados.size;
    const v = [...estados.values()].filter(x => x === "VERIFICADO").length;
    const p = [...estados.values()].filter(x => x === "PENDIENTE").length;
    const a = [...estados.values()].filter(x => x === "ANOMALIA").length;
    const na = [...estados.values()].filter(x => x === "NO_APLICA").length;
    const respondidos = n - p;
    prog.textContent = `Total: ${n} · Respondidos: ${respondidos} · Sin responder: ${p} · Verificados: ${v} · Pendientes: ${p} · Anomalías: ${a} · No aplica: ${na} · Avance: ${n ? Math.round(respondidos / n * 100) : 0}%`;
    barra.firstChild.style.width = (n ? respondidos / n * 100 : 0) + "%";
    // actualizar progreso por grupo
    document.querySelectorAll("[data-grupo]").forEach(det => {
      const gid = det.dataset.grupo;
      const pts = det.querySelectorAll("select").length;
      const vs = [...det.querySelectorAll("select")].filter(s => s.value === "VERIFICADO").length;
      const pdot = det.querySelector(".prog");
      if (pdot) pdot.textContent = `${vs}/${pts}`;
    });
  };

  grupos.forEach(g => {
    const det = el("details", "fm-check-grupo");
    det.dataset.grupo = g.grupoId;
    const sum = el("summary");
    sum.appendChild(el("span", "", g.titulo));
    sum.appendChild(el("span", "prog", `0/${g.puntos.length}`));
    det.appendChild(sum);
    (g.puntos || []).forEach(p => {
      const id = p.puntoId || p.id || p._id || Math.random().toString(36);
      estados.set(id, "PENDIENTE");
      const fila = el("div", "fm-check-item");
      fila.appendChild(el("span", "desc", p.descripcion || p.nombre || p.item || ""));
      const sel = el("select");
      ESTADOS_CHECK.forEach(e => sel.appendChild(new Option(e, e)));
      sel.value = "PENDIENTE";
      const obs = el("input", "obs", ""); obs.type = "text"; obs.placeholder = "Observaciones (obligatoria para Anomalía y No aplica)";
      sel.addEventListener("change", () => {
        estados.set(id, sel.value);
        obs.required = (sel.value === "ANOMALIA" || sel.value === "NO_APLICA");
        actualizar();
      });
      fila.append(sel, obs);
      det.appendChild(fila);
    });
    cont.appendChild(det);
  });

  const btn = el("button", "fm-btn primary", "Enviar checklist");
  btn.style.marginTop = "14px";
  btn.addEventListener("click", async () => {
    if (!servicioIdActual) { alert("Seleccione un servicio primero."); return; }
    // validar ANOMALIA/NO_APLICA con observación
    for (const fila of cont.querySelectorAll(".fm-check-item")) {
      const sel = fila.querySelector("select");
      const obs = fila.querySelector(".obs");
      if ((sel.value === "ANOMALIA" || sel.value === "NO_APLICA") && !obs.value.trim()) {
        alert("Los puntos en Anomalía o No aplica requieren una observación.");
        obs.focus(); return;
      }
    }
    const items = [...estados.entries()].map(([id, est]) => {
      const fila = [...cont.querySelectorAll(".fm-check-item")].find(f => f.querySelector("select") && estados.get(id));
      const obs = fila ? fila.querySelector(".obs").value : "";
      return { puntoId: id, estado: est, observacion: obs };
    });
    btn.disabled = true;
    try {
      await WixApi.guardarChecklist(servicioIdActual, versionActual, items);
      alert("Checklist enviado correctamente.");
      await seleccionarServicio(servicioIdActual);
    } catch (e) {
      alert("No fue posible confirmar el resultado. Consulte el servicio antes de intentar nuevamente.\n" + e.message);
    } finally { btn.disabled = false; }
  });
  cont.appendChild(btn);
  actualizar();
}

async function refrescarServicios() {
  const servicios = await obtenerServicios();
  // re-render solo la tarjeta de servicios
  const cont = $id("PANEL_CONTENT");
  const nueva = cardServicios(sesion.area, servicios);
  const existente = [...cont.children].find(c => c.querySelector && c.querySelector("h3") && c.querySelector("h3").textContent === "Servicios registrados");
  if (existente) cont.replaceChild(nueva, existente);
}

// ---------------------------------------------------------------------------
// AJ-12: Chat compartido
// ---------------------------------------------------------------------------
function actualizarChatHeader(d) {
  const s = d.servicio || d;
  $id("CHAT_TITULO").textContent = "Folio: " + (textoDe(s.folio) || servicioIdActual || "—");
  const ruta = d.ruta || s.ruta || {};
  $id("CHAT_SUB").textContent = "Ruta: " + textoDe(ruta) + (ruta.origen && ruta.destino ? " · " + textoDe(ruta.origen) + " → " + textoDe(ruta.destino) : "");
  const estado = textoDe(s.estado || "").toUpperCase();
  $id("CHAT_ESTADO").textContent = estado || "";
  $id("CHAT_AVATAR").textContent = iniciales(textoDe(s.folio) || "S");
}

function actualizarModoLectura(cerrado) {
  $id("COMPOSER").hidden = cerrado;
  $id("READONLY_BANNER").hidden = !cerrado;
  if (cerrado) $id("CHAT_EMPTY").textContent = "Servicio cerrado. Consulta disponible en modo de solo lectura.";
}

async function cargarMensajes() {
  if (!servicioIdActual || cargandoMensajes) return;
  cargandoMensajes = true;
  try {
    const r = await WixApi.mensajes(servicioIdActual);
    const lista = Array.isArray(r?.data) ? r.data : (r?.data?.mensajes || []);
    mensajesActuales = lista;
    renderMensajes(lista);
    renderDocumentos(lista);
    $id("CHAT_STATUS").textContent = "Sincronizado " + horaCorta();
  } catch (e) {
    $id("CHAT_STATUS").textContent = "Sin conexión";
  } finally { cargandoMensajes = false; }
}

function renderMensajes(lista) {
  const cont = $id("MESSAGES"); if (!cont) return;
  const set = vistos.get(servicioIdActual) || new Set();
  const nuevos = [];
  lista.forEach(m => {
    const id = m.mensajeId || m.id || m._id || "";
    if (id && set.has(id)) return;
    if (id) set.add(id);
    nuevos.push(m);
  });
  vistos.set(servicioIdActual, set);

  let ultimoDia = cont.dataset.ultimoDia || "";
  nuevos.forEach(m => {
    const dia = diaClave(m.fecha || m.fechaServidor || m.fechaEnvio);
    if (dia && dia !== ultimoDia) {
      cont.appendChild(sepDia(dia));
      ultimoDia = dia;
    }
    cont.appendChild(renderMensaje(m));
  });
  cont.dataset.ultimoDia = ultimoDia;

  // autoscroll solo si estaba abajo
  const cercaDeAbajo = cont.scrollHeight - cont.scrollTop - cont.clientHeight < 160;
  if (nuevos.length && (cercaDeAbajo || !cont.dataset.scrolled)) {
    cont.scrollTop = cont.scrollHeight;
    cont.dataset.scrolled = "1";
  }
  if (!lista.length && cont.children.length === 0) {
    cont.appendChild(el("div", "fm-empty", "No hay mensajes en este servicio."));
  }
}

function sepDia(dia) {
  const d = el("div", "fm-date-sep");
  d.appendChild(el("span", "", dia));
  return d;
}

function renderMensaje(m) {
  const tipo = (m.tipo || m.recordType || m.tipoRegistro || "MENSAJE").toUpperCase();
  const area = (m.area || m.Area || "SISTEMA").toUpperCase();
  const esSistema = TIPOS_SISTEMA[tipo] !== undefined;
  const usuario = textoDe(m.usuario || m.user || m.nombre || "Sistema");
  const propio = !esSistema && usuario === sesion.usuario;

  const msg = el("div", "fm-msg fm-area-" + area);
  if (esSistema) msg.classList.add("sistema");
  if (propio) msg.classList.add("own");

  if (!esSistema) {
    const av = el("span", "avatar", iniciales(usuario));
    msg.appendChild(av);
  }

  const bubble = el("div", "fm-bubble");
  const meta = el("div", "meta");
  if (!esSistema) {
    meta.appendChild(el("span", "area", AREAS[area]?.nombre || area));
    meta.appendChild(el("span", "", usuario));
    if (m.categoria) meta.appendChild(el("span", "", "· " + textoDe(m.categoria)));
  }
  meta.appendChild(el("span", "", fechaHora(m.fecha || m.fechaServidor || m.fechaEnvio)));
  bubble.appendChild(meta);

  const cuerpo = el("div", "cuerpo");
  cuerpo.textContent = esSistema
    ? (TIPOS_SISTEMA[tipo] + " — " + textoDe(m.mensaje || m.contenido || m.texto || "") + (m.usuario ? " (" + usuario + ")" : ""))
    : textoDe(m.mensaje || m.contenido || m.texto || "");
  bubble.appendChild(cuerpo);
  if (m.tieneArchivo) renderAdjunto(m, bubble);
  msg.appendChild(bubble);
  return msg;
}

function onTeclaMensaje(e) {
  // Enter envía (sin Shift); Shift+Enter salto de línea. En móvil, Enter = salto de línea.
  if (e.key === "Enter" && !e.shiftKey && !esMovil()) {
    e.preventDefault();
    enviarMensaje();
  }
}

// ===========================================================================
// ADJUNTOS (documentos e imágenes) — integración con Wix
// ===========================================================================
const MIMES_OK = { "application/pdf": true, "image/jpeg": true, "image/png": true };
const EXTS_OK = ["pdf", "jpg", "jpeg", "png"];
const MAX_BYTES = 10485760; // 10 MiB
const cacheDescarga = new Map(); // mensajeId -> URL autorizada

function extensionDe(file) { return (file.name.split(".").pop() || "").toLowerCase(); }

function mimeDeArchivo(file) {
  if (file.type && MIMES_OK[file.type]) return file.type;
  const ext = extensionDe(file);
  if (ext === "pdf") return "application/pdf";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  return "";
}

function formatoTamano(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function esHttps(url) {
  try { const p = new URL(url).protocol; return p === "https:" || p === "blob:"; } catch (e) { return false; }
}

function leerDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

function validarArchivo(file) {
  const ext = extensionDe(file);
  const mime = mimeDeArchivo(file);
  if (!EXTS_OK.includes(ext) || !mime) return "Formato no permitido. Use PDF, JPG, JPEG o PNG.";
  if (file.size === 0) return "El archivo está vacío.";
  if (file.size > MAX_BYTES) return "El archivo supera el límite de 10 MiB.";
  if (file.name.length > 255) return "El nombre del archivo es demasiado largo.";
  return null;
}

async function seleccionarAdjunto(file) {
  $id("FILE_INPUT").value = "";
  if (!file) return;
  const error = validarArchivo(file);
  if (error) { $id("CHAT_STATUS").textContent = error; return; }
  let base64 = "";
  try { base64 = (await leerDataUrl(file)).split(",")[1] || ""; }
  catch (e) { $id("CHAT_STATUS").textContent = "No se pudo leer el archivo."; return; }
  limpiarAdjunto();
  adjunto = { file, objectUrl: URL.createObjectURL(file), nombreArchivo: file.name, tipoArchivo: mimeDeArchivo(file), base64 };
  renderPreviewAdjunto();
  $id("ATTACH_PREVIEW").hidden = false;
  $id("CHAT_STATUS").textContent = "";
}

function renderPreviewAdjunto() {
  const cont = $id("ATTACH_PREVIEW"); if (!cont || !adjunto) return;
  cont.innerHTML = "";
  const chip = el("div", "fm-attach-chip");
  if (adjunto.tipoArchivo === "application/pdf") {
    chip.appendChild(el("span", "pdfico", "PDF"));
    const bPrev = el("button", "fm-btn", "Vista previa");
    bPrev.addEventListener("click", () => abrirVisor({ nombreArchivo: adjunto.nombreArchivo, url: adjunto.objectUrl, tipoArchivo: adjunto.tipoArchivo }));
    chip.appendChild(bPrev);
  } else {
    const img = document.createElement("img");
    img.className = "thumb"; img.src = adjunto.objectUrl; img.alt = adjunto.nombreArchivo;
    chip.appendChild(img);
  }
  const datos = el("div", "datos");
  datos.appendChild(el("div", "nombre", adjunto.nombreArchivo));
  datos.appendChild(el("div", "tamano", formatoTamano(adjunto.file.size)));
  chip.appendChild(datos);
  const cancel = el("button", "fm-btn", "✕");
  cancel.title = "Quitar adjunto"; cancel.setAttribute("aria-label", "Quitar adjunto");
  cancel.addEventListener("click", limpiarAdjunto);
  chip.appendChild(cancel);
  cont.appendChild(chip);
}

function limpiarAdjunto() {
  if (adjunto && adjunto.objectUrl) URL.revokeObjectURL(adjunto.objectUrl);
  adjunto = null;
  const cont = $id("ATTACH_PREVIEW"); if (cont) cont.hidden = true;
}

// Visor de imagen y PDF
function configurarVisor() {
  $id("VIEWER_CLOSE").addEventListener("click", cerrarVisor);
  $id("VIEWER_DOWNLOAD").addEventListener("click", () => { if (visorUrl) descargarUrl(visorUrl, visorNombre || "documento"); });
  $id("VIEWER_OPEN").addEventListener("click", () => { if (visorUrl) window.open(visorUrl, "_blank", "noopener,noreferrer"); });
  $id("VIEWER_ZOOM_IN").addEventListener("click", () => zoomVisor(1.25));
  $id("VIEWER_ZOOM_OUT").addEventListener("click", () => zoomVisor(0.8));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarVisor(); });
}

function abrirVisor({ nombreArchivo, url, tipoArchivo }) {
  if (!esHttps(url)) { $id("CHAT_STATUS").textContent = "Enlace de descarga no válido."; return; }
  visorUrl = url; visorNombre = nombreArchivo; visorZoom = 1;
  $id("VIEWER_TITLE").textContent = nombreArchivo;
  const body = $id("VIEWER_BODY"); body.innerHTML = "";
  if (tipoArchivo === "application/pdf") {
    const iframe = document.createElement("iframe");
    iframe.src = url; iframe.title = nombreArchivo;
    body.appendChild(iframe);
    $id("VIEWER_ZOOM_IN").hidden = true; $id("VIEWER_ZOOM_OUT").hidden = true;
  } else {
    const img = document.createElement("img");
    img.src = url; img.alt = nombreArchivo; img.id = "VIEWER_IMG";
    body.appendChild(img);
    $id("VIEWER_ZOOM_IN").hidden = false; $id("VIEWER_ZOOM_OUT").hidden = false;
  }
  $id("VIEWER").hidden = false;
}

function zoomVisor(f) {
  visorZoom = Math.min(5, Math.max(0.2, visorZoom * f));
  const img = $id("VIEWER_IMG"); if (img) img.style.transform = "scale(" + visorZoom + ")";
}

function cerrarVisor() {
  $id("VIEWER").hidden = true;
  $id("VIEWER_BODY").innerHTML = "";
  visorUrl = null; visorNombre = null; visorZoom = 1;
}

function descargarUrl(url, nombre) {
  if (!esHttps(url)) return;
  const a = document.createElement("a");
  a.href = url; a.download = nombre || ""; a.target = "_blank"; a.rel = "noopener noreferrer";
  document.body.appendChild(a); a.click(); a.remove();
}

async function obtenerDescarga(mensajeId) {
  if (!mensajeId) return "";
  if (cacheDescarga.has(mensajeId)) return cacheDescarga.get(mensajeId);
  const r = await WixApi.descarga(servicioIdActual, mensajeId);
  const url = r?.data?.descarga || r?.data?.url || "";
  if (url) cacheDescarga.set(mensajeId, url);
  return url;
}

async function verAdjunto(m) {
  try {
    const url = await obtenerDescarga(m.mensajeId || m.id || m._id);
    if (!url) { $id("CHAT_STATUS").textContent = "No se pudo obtener el enlace de descarga."; return; }
    abrirVisor({ nombreArchivo: m.nombreArchivo || "documento", url, tipoArchivo: m.tipoArchivo });
  } catch (e) { $id("CHAT_STATUS").textContent = e.message; }
}

async function descargarAdjunto(m) {
  try {
    const url = await obtenerDescarga(m.mensajeId || m.id || m._id);
    if (!url) { $id("CHAT_STATUS").textContent = "No se pudo obtener el enlace de descarga."; return; }
    descargarUrl(url, m.nombreArchivo || "documento");
  } catch (e) { $id("CHAT_STATUS").textContent = e.message; }
}

function renderAdjunto(m, contenedor) {
  const tipo = (m.tipoArchivo || "").toLowerCase();
  if (tipo === "application/pdf") {
    const card = el("div", "fm-doc-card");
    card.appendChild(el("span", "pdfico", "PDF"));
    const datos = el("div", "datos");
    datos.appendChild(el("div", "nombre", m.nombreArchivo || "documento.pdf"));
    datos.appendChild(el("div", "tamano", formatoTamano(m.tamanoArchivo)));
    card.appendChild(datos);
    const acc = el("div", "acciones");
    const bVer = el("button", "", "Ver documento"); bVer.addEventListener("click", () => verAdjunto(m));
    const bDes = el("button", "", "Descargar"); bDes.addEventListener("click", () => descargarAdjunto(m));
    acc.append(bVer, bDes);
    card.appendChild(acc);
    contenedor.appendChild(card);
  } else {
    const card = el("div", "fm-img-card");
    const mini = document.createElement("img"); mini.className = "mini"; mini.alt = m.nombreArchivo || "imagen";
    card.appendChild(mini);
    const datos = el("div", "datos");
    datos.appendChild(el("div", "nombre", m.nombreArchivo || "imagen"));
    datos.appendChild(el("div", "tamano", formatoTamano(m.tamanoArchivo)));
    card.appendChild(datos);
    const acc = el("div", "acciones");
    const bVer = el("button", "", "Ver"); bVer.addEventListener("click", () => verAdjunto(m));
    const bDes = el("button", "", "Descargar"); bDes.addEventListener("click", () => descargarAdjunto(m));
    acc.append(bVer, bDes);
    card.appendChild(acc);
    contenedor.appendChild(card);
    // miniatura con carga perezosa (URL on-demand, cacheada)
    obtenerDescarga(m.mensajeId || m.id || m._id).then(url => { if (url && esHttps(url)) mini.src = url; }).catch(() => {});
  }
}

async function enviarMensaje() {
  if (!servicioIdActual || enviando) return;
  const cat = $id("CATEGORIA").value;
  const texto = $id("MENSAJE").value.trim();
  if (!cat) { $id("CHAT_STATUS").textContent = "Seleccione una categoría."; return; }
  if (!texto && !adjunto) return;
  const teniaAdjunto = !!adjunto;
  enviando = true;
  const btn = $id("BTN_ENVIAR");
  btn.disabled = true;
  $id("CHAT_STATUS").textContent = teniaAdjunto ? "Subiendo archivo…" : "Enviando…";
  try {
    if (adjunto) {
      // Un solo mensaje con adjunto (texto opcional) vía st_subir_documento.
      await WixApi.subirDocumento(servicioIdActual, cat, texto,
        adjunto.nombreArchivo, adjunto.tipoArchivo, adjunto.base64, "CHAT");
    } else {
      await WixApi.enviarMensaje(servicioIdActual, cat, texto, "CHAT");
    }
    $id("MENSAJE").value = "";
    limpiarAdjunto();
    $id("CHAT_STATUS").textContent = teniaAdjunto ? "Archivo enviado correctamente" : "";
    await cargarMensajes();
  } catch (e) {
    // conservar borrador (texto y adjunto) en caso de error
    $id("CHAT_STATUS").textContent = "La carga pudo haberse completado. Actualiza el historial antes de volver a enviar. (" + e.message + ")";
  } finally {
    enviando = false; btn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------
function iniciarPolling(area) {
  if (timer) return;
  timer = setInterval(() => { if (!document.hidden && servicioIdActual) cargarMensajes(); }, 3000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && servicioIdActual) cargarMensajes(); });
}
function detenerPolling() { if (timer) { clearInterval(timer); timer = null; } }

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
if (document.getElementById("LOGIN_BOX")) {
  flujoLogin();
} else if (document.getElementById("PANEL")) {
  flujoPanel();
}
