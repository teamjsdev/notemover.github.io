import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const API_BASE = "https://hotcrave-api-staging-274560140811.southamerica-east1.run.app";
const BUSINESS_WEB_BASE = "https://jsdevmobile.com/hotcrave/b/";
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBG67zAGYRofpCxu02oRKfPjD_v1HHiOrM",
  authDomain: "hotcrave-app.firebaseapp.com",
  projectId: "hotcrave-app",
  appId: "1:274560140811:web:841b72c8b3c8a0fae4e90e",
};

const appRoot = document.querySelector("#app");
let auth = null;
let currentUser = null;
let businessContext = null;
let entitlements = null;
let products = [];
let hotEvents = [];
let activeView = "hot-events";

function configured() {
  return Object.values(FIREBASE_CONFIG).every((value) => value && !value.startsWith("REPLACE_WITH_"));
}

function render(html) {
  appRoot.innerHTML = html;
  window.scrollTo({ top: 0, behavior: "instant" });
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
  if (status === "SOLD_OUT") return "status-sold";
  if (status === "EXPIRED") return "status-expired";
  if (status === "AVAILABLE_NOW") return "status-live";
  return "status-ready";
}

function apiErrorMessage(error) {
  const messages = {
    PRODUCT_NOT_FOUND: "No encontramos ese producto.",
    PRODUCT_INACTIVE: "Ese producto no está activo.",
    PRODUCT_LIMIT_REACHED: "Alcanzaste el límite de productos de tu plan.",
    CUSTOM_PRODUCT_REQUIRES_PREMIUM: "Los productos personalizados requieren HotCrave Premium.",
    CUSTOM_CATEGORY_REQUIRES_PREMIUM: "Las categorías personalizadas requieren HotCrave Premium.",
    INVALID_PRODUCT_CATEGORY: "La categoría no es válida para este producto.",
    HOT_EVENT_LIMIT_REACHED: "Alcanzaste el límite de Hot Events activos de tu plan.",
    INVALID_HOT_EVENT_DURATION: "La duración seleccionada no está disponible para tu plan.",
    HOT_EVENT_NOT_FOUND: "No encontramos ese Hot Event.",
    HOT_EVENT_EXPIRED: "Ese Hot Event ya venció.",
    HOT_EVENT_NOT_ACTIVE: "Ese Hot Event ya no está disponible para marcar como agotado.",
    BUSINESS_NOT_FOUND: "No encontramos tu negocio.",
  };
  return messages[error?.code] || "No se pudo completar la operación. Intentá nuevamente.";
}

async function api(path, options = {}) {
  const token = await currentUser.getIdToken();
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
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

function isManager() {
  return ["OWNER", "MANAGER"].includes(businessContext?.membership?.role);
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

async function loadEntitlements() {
  try {
    entitlements = await api("/me/entitlements");
  } catch {
    entitlements = null;
  }
}

async function refreshData() {
  await Promise.all([loadBusinessData(), loadEntitlements()]);
}

async function loadBusinessData() {
  businessContext = await loadBusiness();
  await Promise.all([loadProducts(), loadHotEvents()]);
}

function shell(content) {
  const business = businessContext.business;
  const items = [
    ["hot-events", "♨", "Hot Events"],
    ["profile", "◉", "Perfil"],
    ["products", "▦", "Productos"],
    ["qr", "⌁", "QR"],
    ["premium", "★", "Premium"],
    ["dashboard", "•", "Resumen"],
  ];
  const nav = items.map(([view, icon, label]) => `<button class="${activeView === view ? "nav-active" : ""}" data-view="${view}"><span aria-hidden="true">${icon}</span>${label}</button>`).join("");
  return `<div class="business-shell"><header class="topbar"><div><p class="eyebrow">CALENTITOS · NEGOCIOS</p><strong>Panel de negocio</strong></div><div class="topbar-actions"><span class="business-name">${escapeHtml(business?.name || "Tu negocio")}</span><button id="logout" class="secondary">Cerrar sesión</button></div></header><main class="dashboard"><nav class="business-nav" aria-label="Administración">${nav}</nav>${content}</main></div>`;
}

function loadingPage(message = "Cargando…") {
  render(`<section class="loading-shell"><div class="spinner"></div><p>${escapeHtml(message)}</p></section>`);
}

function pageHeading(eyebrow, title, description = "") {
  return `<section class="page-heading"><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1>${description ? `<p class="muted">${escapeHtml(description)}</p>` : ""}</section>`;
}

function hotEventsView(message = "", error = false) {
  const business = businessContext.business;
  const limit = business?.plan === "PREMIUM" ? 10 : 1;
  const active = hotEvents.filter((event) => {
    const status = effectiveStatus(event);
    return status !== "SOLD_OUT" && status !== "EXPIRED";
  }).length;
  const options = products.map((product) => `<option value="${escapeHtml(product.productId)}">${escapeHtml(product.name)}</option>`).join("");
  const eventCards = hotEvents.length
    ? hotEvents.slice().sort((a, b) => new Date(b.createdAt || b.availableAt || 0) - new Date(a.createdAt || a.availableAt || 0)).map((event) => {
        const product = products.find((item) => item.productId === event.productId);
        const status = effectiveStatus(event);
        const canSoldOut = isManager() && status === "AVAILABLE_NOW";
        return `<article class="event-card"><div class="event-card-main"><div class="event-title-row"><h3>${escapeHtml(product?.name || "Producto")}</h3><span class="event-status ${statusClass(status)}">${escapeHtml(statusLabel(status))}</span></div><p class="muted">Disponible: ${escapeHtml(formatDate(event.availableAt))}</p><p class="event-expiry">Vence: ${escapeHtml(formatDate(event.expiresAt))}</p></div>${canSoldOut ? `<button class="secondary sold-out" data-event-id="${escapeHtml(event.hotEventId)}">Marcar agotado</button>` : ""}</article>`;
      }).join("")
    : `<div class="empty-card"><span>♨</span><h3>No hay Hot Events todavía</h3><p class="muted">Publicá el primero y avisá cuando haya comida recién hecha.</p></div>`;

  const publishForm = isManager()
    ? `<section class="publish-card"><div><p class="eyebrow">NUEVO AVISO</p><h2>Comida recién hecha</h2><p class="muted">Elegí un producto y cuándo querés avisar.</p></div><form id="hot-event-form"><label>Producto<select name="productId" required ${products.length ? "" : "disabled"}>${products.length ? `<option value="">Seleccioná un producto</option>${options}` : "<option>No hay productos activos</option>"}</select></label><fieldset><legend>Estado inicial</legend><label class="radio-option"><input type="radio" name="status" value="AVAILABLE_NOW" checked> Disponible ahora</label><label class="radio-option"><input type="radio" name="status" value="READY_IN_15_MIN"> Listo en 15 minutos</label><label class="radio-option"><input type="radio" name="status" value="READY_IN_30_MIN"> Listo en 30 minutos</label></fieldset><button class="primary" type="submit" ${products.length ? "" : "disabled"}>Publicar Hot Event</button></form></section>`
    : `<section class="info-card"><strong>Solo los responsables del negocio pueden publicar Hot Events.</strong><p class="muted">Tu rol actual es ${escapeHtml(businessContext.membership?.role || "Miembro")}.</p></section>`;

  render(shell(`${pageHeading("PRIORIDAD", "Hot Events", `${active} de ${limit} activos. Publicá rápido cuando tengas comida recién hecha.`)}${message ? `<p class="${error ? "error" : "success"}" role="status">${escapeHtml(message)}</p>` : ""}${publishForm}<section class="section-heading compact"><p class="eyebrow">HISTORIAL</p><h2>Tus Hot Events</h2></section><div class="event-list">${eventCards}</div>`));
  bindShell();
  document.querySelector("#hot-event-form")?.addEventListener("submit", createHotEvent);
  document.querySelectorAll(".sold-out").forEach((button) => button.addEventListener("click", () => markSoldOut(button.dataset.eventId)));
}

function dashboardView() {
  const business = businessContext.business;
  const active = hotEvents.filter((event) => {
    const status = effectiveStatus(event);
    return status !== "SOLD_OUT" && status !== "EXPIRED";
  }).length;
  const limit = business?.plan === "PREMIUM" ? 10 : 1;
  render(shell(`${pageHeading("RESUMEN", "Tu negocio", "Accedé rápidamente a todas las herramientas de Calentitos.")}<section class="hero-card"><div><p class="eyebrow">ESTADO</p><h2>${escapeHtml(business?.name || "Tu negocio")}</h2><p class="muted">Plan ${escapeHtml(business?.plan || "FREE")} · ${escapeHtml(businessContext.membership?.role || "Miembro")}</p></div><button class="primary" id="open-hot-events">Publicar Hot Event</button></section><div class="stats-grid"><button class="stat-card stat-action" data-view="hot-events"><span>♨</span><strong>${active} / ${limit}</strong><p>Hot Events activos</p></button><button class="stat-card stat-action" data-view="products"><span>▦</span><strong>${products.length}</strong><p>Productos activos</p></button><button class="stat-card stat-action" data-view="qr"><span>⌁</span><strong>QR</strong><p>Compartí tu negocio</p></button><button class="stat-card stat-action" data-view="profile"><span>◉</span><strong>Perfil</strong><p>Información pública</p></button></div>`));
  bindShell();
  document.querySelector("#open-hot-events")?.addEventListener("click", () => showHotEvents());
}

function profileView(message = "", error = false) {
  const business = businessContext.business;
  const editable = isManager();
  render(shell(`${pageHeading("PERFIL", "Información del negocio", "Estos datos son los que identifican y presentan a tu negocio en Calentitos.")}${message ? `<p class="${error ? "error" : "success"}" role="status">${escapeHtml(message)}</p>` : ""}<section class="form-card"><form id="profile-form"><label>Nombre del negocio<input name="name" maxlength="120" value="${escapeHtml(business?.name)}" required ${editable ? "" : "disabled"}></label><label>Ubicación<input name="location" maxlength="160" value="${escapeHtml(business?.location)}" required ${editable ? "" : "disabled"}></label><p class="muted small">Las coordenadas actuales del negocio se conservan al editar estos datos.</p><button class="primary" type="submit" ${editable ? "" : "disabled"}>Guardar cambios</button></form></section>`));
  bindShell();
  document.querySelector("#profile-form")?.addEventListener("submit", updateProfile);
}

function productsView(message = "", error = false) {
  const business = businessContext.business;
  const premium = business?.plan === "PREMIUM" || entitlements?.businessPlan === "PREMIUM";
  const customCount = products.filter((product) => product.type === "CUSTOM").length;
  const productCards = products.length
    ? products.map((product) => `<article class="product-card"><div><h3>${escapeHtml(product.name)}</h3><p class="muted">${escapeHtml(product.type === "CUSTOM" ? (product.category || "Personalizado") : "Producto predefinido")}</p></div><span class="type-pill">${escapeHtml(product.type === "CUSTOM" ? "Personalizado" : "Predefinido")}</span></article>`).join("")
    : `<div class="empty-card"><span>▦</span><h3>No hay productos activos</h3><p class="muted">Los productos disponibles aparecerán acá.</p></div>`;
  const createForm = isManager()
    ? `<section class="form-card"><div><p class="eyebrow">NUEVO PRODUCTO</p><h2>Agregar producto personalizado</h2><p class="muted">${premium ? `${customCount} / 100 productos personalizados utilizados.` : "Los productos personalizados están disponibles con Premium."}</p></div><form id="product-form"><label>Nombre<input name="name" maxlength="120" placeholder="Ej. Medialuna rellena" required ${premium ? "" : "disabled"}></label><label>Categoría<input name="category" maxlength="80" placeholder="Ej. Panadería" required ${premium ? "" : "disabled"}></label><button class="primary" type="submit" ${premium ? "" : "disabled"}>Agregar producto</button></form></section>`
    : "";
  render(shell(`${pageHeading("PRODUCTOS", "Catálogo", "Administrá los productos que podés usar para publicar Hot Events.")}${message ? `<p class="${error ? "error" : "success"}" role="status">${escapeHtml(message)}</p>` : ""}${createForm}<section class="section-heading compact"><p class="eyebrow">ACTIVOS</p><h2>${products.length} productos</h2></section><div class="product-list">${productCards}</div>`));
  bindShell();
  document.querySelector("#product-form")?.addEventListener("submit", createProduct);
}

function qrView() {
  const business = businessContext.business;
  const url = `${BUSINESS_WEB_BASE}${encodeURIComponent(business.businessId)}`;
  render(shell(`${pageHeading("QR", "Código QR del negocio", "Este enlace es permanente y lleva a la experiencia pública de tu negocio.")}<section class="qr-card"><div class="qr-frame"><canvas id="business-qr" width="280" height="280" aria-label="Código QR de tu negocio"></canvas></div><div class="qr-actions"><p class="muted qr-url">${escapeHtml(url)}</p><div class="button-row"><button id="download-qr" class="primary">Descargar QR</button><button id="copy-qr" class="secondary">Copiar enlace</button></div><p id="qr-message" class="small muted" role="status"></p></div></section>`));
  bindShell();
  if (typeof QRCode === "undefined") {
    document.querySelector("#qr-message").textContent = "No se pudo cargar el generador de QR. Recargá la página.";
    return;
  }
  const canvas = document.querySelector("#business-qr");
  QRCode.toCanvas(canvas, url, { width: 280, margin: 2 }, (error) => {
    if (error) document.querySelector("#qr-message").textContent = "No se pudo generar el QR.";
  });
  document.querySelector("#download-qr")?.addEventListener("click", () => downloadQr(canvas, business.name));
  document.querySelector("#copy-qr")?.addEventListener("click", () => copyBusinessUrl(url));
}

function premiumView() {
  const business = businessContext.business;
  const premium = business?.plan === "PREMIUM" || entitlements?.businessPlan === "PREMIUM";
  render(shell(`${pageHeading("PREMIUM", "HotCrave Premium", "Más capacidad para negocios que publican con frecuencia.")}<section class="premium-card ${premium ? "premium-active" : ""}"><div><span class="premium-badge">${premium ? "PREMIUM ACTIVO" : "PLAN GRATUITO"}</span><h2>${premium ? "Tu negocio tiene Premium" : "Potenciá tu negocio"}</h2><p class="muted">${premium ? "Disfrutás de las funciones Premium disponibles para tu negocio." : "Publicá hasta 10 Hot Events activos, agregá hasta 100 productos personalizados, usá categorías personalizadas y configurá la duración de los Hot Events."}</p></div><div class="premium-features"><div><strong>10</strong><span>Hot Events activos</span></div><div><strong>100</strong><span>productos personalizados</span></div><div><strong>15–60 min</strong><span>duración configurable</span></div><div><strong>Sin anuncios</strong><span>experiencia Premium</span></div></div>${!premium ? `<p class="security-note">La suscripción se gestiona mediante Google Play en la app Android. El estado Premium que se muestra acá proviene del backend.</p>` : ""}</section>`));
  bindShell();
}

async function updateProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  button.textContent = "Guardando…";
  try {
    const business = await api("/business/me", {
      method: "PATCH",
      body: JSON.stringify({ name: form.name.value.trim(), location: form.location.value.trim(), latitude: businessContext.business.latitude, longitude: businessContext.business.longitude }),
    });
    businessContext.business = business;
    profileView("Los datos del negocio fueron actualizados.");
  } catch (error) {
    profileView(apiErrorMessage(error), true);
  }
}

async function createProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  button.textContent = "Agregando…";
  try {
    await api("/business/me/products", {
      method: "POST",
      body: JSON.stringify({ name: form.name.value.trim(), type: "CUSTOM", status: "ACTIVE", category: form.category.value.trim() }),
    });
    await loadProducts();
    productsView("El producto fue agregado al catálogo.");
  } catch (error) {
    productsView(apiErrorMessage(error), true);
  }
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

async function downloadQr(canvas, businessName) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${businessName || "calentitos"}-qr.png`.replace(/[^a-z0-9._-]+/gi, "-");
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

async function copyBusinessUrl(url) {
  const message = document.querySelector("#qr-message");
  try {
    await navigator.clipboard.writeText(url);
    message.textContent = "Enlace copiado.";
  } catch {
    message.textContent = "No se pudo copiar automáticamente. Seleccioná el enlace para copiarlo.";
  }
}

function showHotEvents() {
  activeView = "hot-events";
  hotEventsView();
}

function showView(view) {
  activeView = view;
  if (view === "hot-events") hotEventsView();
  else if (view === "profile") profileView();
  else if (view === "products") productsView();
  else if (view === "qr") qrView();
  else if (view === "premium") premiumView();
  else dashboardView();
}

function bindShell() {
  document.querySelector("#logout")?.addEventListener("click", () => signOut(auth));
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
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

async function signedIn(user) {
  currentUser = user;
  loadingPage("Accediendo a tu negocio…");
  try {
    businessContext = await loadBusiness();
    if (!businessContext) {
      render(`<section class="message-shell"><h1>No encontramos un negocio</h1><p class="muted">Esta cuenta no tiene un negocio asociado.</p><button id="logout" class="secondary">Cerrar sesión</button></section>`);
      document.querySelector("#logout")?.addEventListener("click", () => signOut(auth));
      return;
    }
    await Promise.all([loadProducts(), loadHotEvents(), loadEntitlements()]);
    showHotEvents();
  } catch (error) {
    render(`<section class="message-shell"><h1>No pudimos acceder</h1><p class="muted">${escapeHtml(error?.message || "Revisá tu conexión e intentá nuevamente.")}</p><button id="retry" class="primary">Reintentar</button><button id="logout" class="secondary">Cerrar sesión</button></section>`);
    document.querySelector("#retry")?.addEventListener("click", () => signedIn(user));
    document.querySelector("#logout")?.addEventListener("click", () => signOut(auth));
  }
}

if (!configured()) {
  render(`<section class="message-shell"><div class="brand-mark">♨</div><h1>Configuración pendiente</h1><p class="muted">La interfaz web de negocios está creada, pero falta conectar la configuración pública de Firebase.</p><p class="security-note">No se debe colocar ninguna clave privada, service account ni secreto en este sitio.</p></section>`);
} else {
  auth = getAuth(initializeApp(FIREBASE_CONFIG));
  onAuthStateChanged(auth, (user) => user ? signedIn(user) : login());
}
