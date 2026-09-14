import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const API_BASE = "https://hotcrave-api-staging-274560140811.southamerica-east1.run.app";
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBG67zAGYRofpCxu02oRKFjPjD_v1HHiOrM",
  authDomain: "hotcrave-app.firebaseapp.com",
  projectId: "hotcrave-app",
  appId: "1:274560140811:web:841b72c8b3c8a0fae4e90e",
};

const appRoot = document.querySelector("#app");
let auth = null;
let currentUser = null;
let businessContext = null;
let products = [];
let hotEvents = [];
let activeView = "dashboard";

function configured() {
  return Object.values(FIREBASE_CONFIG).every((value) => value && !value.startsWith("REPLACE_WITH_"));
}

function render(html) {
  appRoot.innerHTML = html;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function effectiveStatus(event, now = Date.now()) {
  if (event.status === "SOLD_OUT") return "SOLD_OUT";
  const expiresAt = new Date(event.expiresAt).getTime();
  if (Number.isFinite(expiresAt) && expiresAt <= now) return "EXPIRED";
  return event.status;
}

function statusLabel(status) {
  return {
    AVAILABLE_NOW: "Disponible ahora",
    READY_IN_15_MIN: "Listo en 15 min",
    READY_IN_30_MIN: "Listo en 30 min",
    SOLD_OUT: "Agotado",
    EXPIRED: "Expirado",
  }[status] || status;
}

function statusClass(status) {
  return status === "SOLD_OUT"
    ? "status-sold"
    : status === "EXPIRED"
      ? "status-expired"
      : status === "AVAILABLE_NOW"
        ? "status-live"
        : "status-ready";
}

function apiErrorMessage(error) {
  const messages = {
    PRODUCT_NOT_FOUND: "No encontramos ese producto.",
    PRODUCT_INACTIVE: "Ese producto no está activo.",
    HOT_EVENT_LIMIT_REACHED: "Alcanzaste el límite de Hot Events activos de tu plan.",
    INVALID_HOT_EVENT_DURATION: "La duración seleccionada no está disponible para tu plan.",
    HOT_EVENT_NOT_FOUND: "No encontramos ese Hot Event.",
    HOT_EVENT_EXPIRED: "Ese Hot Event ya venció.",
    HOT_EVENT_NOT_ACTIVE: "Ese Hot Event ya no está disponible para marcar como agotado.",
  };
  return messages[error?.code] || "No se pudo completar la operación. Intentá nuevamente.";
}

async function api(path, options = {}) {
  const token = await currentUser.getIdToken();
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (options.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) {
    let error = null;
    try { error = await response.json(); } catch {}
    const exception = new Error(error?.message || "Request failed");
    exception.code = error?.code;
    exception.status = response.status;
    throw exception;
  }
  if (response.status === 204) return null;
  return response.json();
}

function login(errorMessage = "") {
  render(`<section class="auth-shell"><div class="auth-card"><div class="brand-mark">♨</div><p class="eyebrow">CALENTITOS · NEGOCIOS</p><h1>Gestioná tu negocio</h1><p class="muted">Accedé al espacio de administración de tu negocio.</p>${errorMessage ? `<p class="error" role="alert">${escapeHtml(errorMessage)}</p>` : ""}<form id="login-form"><label>Correo electrónico<input name="email" type="email" autocomplete="email" required></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label><button class="primary" type="submit">Ingresar</button></form><p class="security-note">Usa la misma cuenta de negocio de Firebase que la app Android.</p></div></section>`);
  document.querySelector("#login-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button");
    button.disabled = true;
    button.textContent = "Ingresando…";
    try { await signInWithEmailAndPassword(auth, form.email.value.trim(), form.password.value); }
    catch (error) { login(authError(error)); }
  });
}

function authError(error) {
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(error?.code)) return "El correo o la contraseña no son correctos.";
  if (error?.code === "auth/too-many-requests") return "Demasiados intentos. Probá nuevamente más tarde.";
  return "No se pudo iniciar sesión. Intentá nuevamente.";
}

async function loadBusiness() {
  return api("/business/me");
}

async function loadProducts() {
  const response = await api("/business/me/products");
  products = response.products || [];
}

async function loadHotEvents() {
  const response = await api("/business/me/hot-events");
  hotEvents = response.hotEvents || [];
}

function shell(content) {
  const business = businessContext.business;
  return `<div class="business-shell"><header class="topbar"><div><p class="eyebrow">CALENTITOS · NEGOCIOS</p><strong>Panel de negocio</strong></div><div class="topbar-actions"><span class="business-name">${escapeHtml(business?.name || "Tu negocio")}</span><button id="logout" class="secondary">Cerrar sesión</button></div></header><main class="dashboard"><nav class="business-nav" aria-label="Administración"><button class="${activeView === "dashboard" ? "nav-active" : ""}" data-view="dashboard">Resumen</button><button class="${activeView === "hot-events" ? "nav-active" : ""}" data-view="hot-events">Hot Events</button></nav>${content}</main></div>`;
}

function dashboard() {
  const business = businessContext.business;
  const active = hotEvents.filter((event) => effectiveStatus(event) !== "SOLD_OUT" && effectiveStatus(event) !== "EXPIRED").length;
  const limit = business?.plan === "PREMIUM" ? 10 : 1;
  render(shell(`<section class="hero-card"><div><p class="eyebrow">BIENVENIDO</p><h1>${escapeHtml(business?.name || "Tu negocio")}</h1><p class="muted">Administrá tu presencia y avisá cuando haya comida recién hecha.</p></div><div class="status-pill">${escapeHtml(businessContext.membership?.role || "Miembro")}</div></section><section class="section-heading"><p class="eyebrow">ACTIVIDAD</p><h2>Hot Events</h2></section><section class="action-card"><div><h3>Publicar un Hot Event</h3><p class="muted">Avisá a tus seguidores que un producto está listo o estará disponible pronto.</p></div><button id="open-hot-events" class="primary">Administrar Hot Events</button></section><section class="stats-grid"><article class="stat-card"><span>♨</span><strong>${active} / ${limit}</strong><p>Hot Events activos</p></article><article class="stat-card"><span>▦</span><strong>${products.length}</strong><p>Productos activos</p></article></section>`));
  bindShell();
  document.querySelector("#open-hot-events")?.addEventListener("click", () => showHotEvents());
}

function hotEventsView(message = "", error = false) {
  const business = businessContext.business;
  const limit = business?.plan === "PREMIUM" ? 10 : 1;
  const active = hotEvents.filter((event) => effectiveStatus(event) !== "SOLD_OUT" && effectiveStatus(event) !== "EXPIRED").length;
  const options = products.map((product) => `<option value="${escapeHtml(product.productId)}">${escapeHtml(product.name)}</option>`).join("");
  const eventCards = hotEvents.length
    ? hotEvents.slice().sort((a, b) => {
        const aTime = new Date(a.createdAt || a.availableAt || 0).getTime();
        const bTime = new Date(b.createdAt || b.availableAt || 0).getTime();
        return bTime - aTime;
      }).map((event) => {
        const product = products.find((item) => item.productId === event.productId);
        const status = effectiveStatus(event);
        const canSoldOut = status === "AVAILABLE_NOW";
        return `<article class="event-card"><div class="event-card-main"><div class="event-title-row"><h3>${escapeHtml(product?.name || "Producto")}</h3><span class="event-status ${statusClass(status)}">${escapeHtml(statusLabel(status))}</span></div><p class="muted">Disponible: ${escapeHtml(formatDate(event.availableAt))}</p><p class="event-expiry">Vence: ${escapeHtml(formatDate(event.expiresAt))}</p></div>${canSoldOut ? `<button class="secondary sold-out" data-event-id="${escapeHtml(event.hotEventId)}">Marcar agotado</button>` : ""}</article>`;
      }).join("")
    : `<div class="empty-card"><span>♨</span><h3>No hay Hot Events todavía</h3><p class="muted">Publicá el primero desde este panel.</p></div>`;

  render(shell(`<section class="page-heading"><button id="back-dashboard" class="back-button">← Resumen</button><p class="eyebrow">ADMINISTRACIÓN</p><h1>Hot Events</h1><p class="muted">${active} de ${limit} activos. El límite depende del plan y lo valida el backend.</p></section>${message ? `<p class="${error ? "error" : "success"}" role="status">${escapeHtml(message)}</p>` : ""}<section class="publish-card"><div><p class="eyebrow">NUEVO AVISO</p><h2>Comida recién hecha</h2><p class="muted">Elegí un producto y cuándo querés avisar.</p></div><form id="hot-event-form"><label>Producto<select name="productId" required ${products.length ? "" : "disabled"}>${products.length ? `<option value="">Seleccioná un producto</option>${options}` : "<option>No hay productos activos</option>"}</select></label><fieldset><legend>Estado inicial</legend><label class="radio-option"><input type="radio" name="status" value="AVAILABLE_NOW" checked> Disponible ahora</label><label class="radio-option"><input type="radio" name="status" value="READY_IN_15_MIN"> Listo en 15 minutos</label><label class="radio-option"><input type="radio" name="status" value="READY_IN_30_MIN"> Listo en 30 minutos</label></fieldset><button class="primary" type="submit" ${products.length ? "" : "disabled"}>Publicar Hot Event</button></form></section><section class="section-heading compact"><p class="eyebrow">HISTORIAL</p><h2>Tus Hot Events</h2></section><div class="event-list">${eventCards}</div>`));
  bindShell();
  document.querySelector("#back-dashboard")?.addEventListener("click", () => dashboard());
  document.querySelector("#hot-event-form")?.addEventListener("submit", createHotEvent);
  document.querySelectorAll(".sold-out").forEach((button) => button.addEventListener("click", () => markSoldOut(button.dataset.eventId)));
}

async function createHotEvent(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  button.textContent = "Publicando…";
  try {
    await api("/business/me/hot-events", {
      method: "POST",
      body: JSON.stringify({ productId: form.productId.value, status: form.status.value }),
    });
    await loadHotEvents();
    hotEventsView("Hot Event publicado correctamente.");
  } catch (error) {
    hotEventsView(apiErrorMessage(error), true);
  }
}

async function markSoldOut(hotEventId) {
  try {
    await api(`/business/me/hot-events/${encodeURIComponent(hotEventId)}/sold-out`, { method: "POST" });
    await loadHotEvents();
    hotEventsView("El Hot Event fue marcado como agotado.");
  } catch (error) {
    hotEventsView(apiErrorMessage(error), true);
  }
}

function showHotEvents() {
  activeView = "hot-events";
  hotEventsView();
}

function bindShell() {
  document.querySelector("#logout")?.addEventListener("click", () => signOut(auth));
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.view === "hot-events") showHotEvents();
    else { activeView = "dashboard"; dashboard(); }
  }));
}

async function signedIn(user) {
  currentUser = user;
  render(`<section class="loading-shell"><div class="spinner"></div><p>Accediendo a tu negocio…</p></section>`);
  try {
    businessContext = await loadBusiness();
    if (!businessContext) {
      render(`<section class="message-shell"><h1>No encontramos un negocio</h1><p class="muted">Esta cuenta no tiene un negocio asociado.</p><button id="logout" class="secondary">Cerrar sesión</button></section>`);
      document.querySelector("#logout")?.addEventListener("click", () => signOut(auth));
      return;
    }
    await Promise.all([loadProducts(), loadHotEvents()]);
    dashboard();
  } catch (error) {
    render(`<section class="message-shell"><h1>No pudimos acceder</h1><p class="muted">Revisá tu conexión e intentá nuevamente.</p><button id="retry" class="primary">Reintentar</button><button id="logout" class="secondary">Cerrar sesión</button></section>`);
    document.querySelector("#retry")?.addEventListener("click", () => signedIn(user));
    document.querySelector("#logout")?.addEventListener("click", () => signOut(auth));
  }
}

if (!configured()) {
  render(`<section class="message-shell"><div class="brand-mark">♨</div><h1>Configuración pendiente</h1><p class="muted">La interfaz web de negocios ya está creada, pero falta conectar la configuración pública de Firebase del proyecto de negocio.</p><p class="security-note">No se debe colocar ninguna clave privada, service account ni secreto en este sitio.</p></section>`);
} else {
  auth = getAuth(initializeApp(FIREBASE_CONFIG));
  onAuthStateChanged(auth, (user) => user ? signedIn(user) : login());
}