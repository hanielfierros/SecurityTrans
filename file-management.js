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
  (Array.isArray(cats) ? cats : []).forEach(c => sel.appendChild(new Option(c, c)));
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
    renderMensajes(lista);
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

async function enviarMensaje() {
  if (!servicioIdActual) return;
  const cat = $id("CATEGORIA").value;
  const msg = $id("MENSAJE").value.trim();
  if (!msg) return;
  const btn = $id("BTN_ENVIAR");
  btn.disabled = true;
  try {
    await WixApi.enviarMensaje(servicioIdActual, cat, msg, "CHAT");
    $id("MENSAJE").value = "";
    await cargarMensajes();
  } catch (e) {
    $id("CHAT_STATUS").textContent = "No se pudo enviar: " + e.message;
  } finally { btn.disabled = false; }
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
