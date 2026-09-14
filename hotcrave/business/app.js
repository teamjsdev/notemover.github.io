import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const API_BASE = "https://hotcrave-api-274560140811.southamerica-east1.run.app";
const FIREBASE_CONFIG = {
  apiKey: "REPLACE_WITH_FIREBASE_WEB_API_KEY",
  authDomain: "REPLACE_WITH_FIREBASE_AUTH_DOMAIN",
  projectId: "hotcrave-app",
  appId: "REPLACE_WITH_FIREBASE_WEB_APP_ID",
};

const appRoot = document.querySelector("#app");
let auth = null;
let currentUser = null;
let businessContext = null;

function configured() {
  return Object.values(FIREBASE_CONFIG).every((value) => value && !value.startsWith("REPLACE_WITH_"));
}
function render(html) { appRoot.innerHTML = html; }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }

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
  const token = await currentUser.getIdToken();
  const response = await fetch(`${API_BASE}/business/me`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) { if (response.status === 404) return null; throw new Error("No se pudo obtener el negocio."); }
  return response.json();
}
function dashboard() {
  const business = businessContext.business;
  const membership = businessContext.membership;
  render(`<div class="business-shell"><header class="topbar"><div><p class="eyebrow">CALENTITOS · NEGOCIOS</p><strong>Panel de negocio</strong></div><button id="logout" class="secondary">Cerrar sesión</button></header><main class="dashboard"><section class="hero-card"><div><p class="eyebrow">BIENVENIDO</p><h1>${escapeHtml(business?.name || "Tu negocio")}</h1><p class="muted">Desde acá vas a poder administrar tu presencia en Calentitos.</p></div><div class="status-pill">${escapeHtml(membership?.role || "Miembro")}</div></section><section class="section-heading"><p class="eyebrow">ADMINISTRACIÓN</p><h2>Tu negocio</h2></section><div class="feature-grid"><article class="feature-card"><span>◉</span><h3>Perfil</h3><p>Información y presentación del negocio.</p><small>Próximamente</small></article><article class="feature-card"><span>▦</span><h3>Productos</h3><p>Administrá los productos que ofrecés.</p><small>Próximamente</small></article><article class="feature-card"><span>♨</span><h3>Hot Events</h3><p>Publicá avisos de comida recién hecha.</p><small>Próximamente</small></article><article class="feature-card"><span>⌁</span><h3>QR</h3><p>Accedé al enlace público de tu negocio.</p><small>Próximamente</small></article><article class="feature-card"><span>★</span><h3>Premium</h3><p>Consultá y administrá tu plan.</p><small>Próximamente</small></article></div></main></div>`);
  document.querySelector("#logout")?.addEventListener("click", () => signOut(auth));
}
async function signedIn(user) {
  currentUser = user;
  render(`<section class="loading-shell"><div class="spinner"></div><p>Accediendo a tu negocio…</p></section>`);
  try { businessContext = await loadBusiness(); if (!businessContext) { render(`<section class="message-shell"><h1>No encontramos un negocio</h1><p class="muted">Esta cuenta no tiene un negocio asociado.</p><button id="logout" class="secondary">Cerrar sesión</button></section>`); document.querySelector("#logout")?.addEventListener("click", () => signOut(auth)); return; } dashboard(); }
  catch { render(`<section class="message-shell"><h1>No pudimos acceder</h1><p class="muted">Revisá tu conexión e intentá nuevamente.</p><button id="retry" class="primary">Reintentar</button><button id="logout" class="secondary">Cerrar sesión</button></section>`); document.querySelector("#retry")?.addEventListener("click", () => signedIn(user)); document.querySelector("#logout")?.addEventListener("click", () => signOut(auth)); }
}

if (!configured()) render(`<section class="message-shell"><div class="brand-mark">♨</div><h1>Configuración pendiente</h1><p class="muted">La interfaz web de negocios ya está creada, pero falta conectar la configuración pública de Firebase del proyecto de negocio.</p><p class="security-note">No se debe colocar ninguna clave privada, service account ni secreto en este sitio.</p></section>`);
else { auth = getAuth(initializeApp(FIREBASE_CONFIG)); onAuthStateChanged(auth, (user) => user ? signedIn(user) : login()); }
