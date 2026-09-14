const API_BASE = 'https://hotcrave-api-staging-274560140811.southamerica-east1.run.app';
const VAPID_PUBLIC_KEY = 'BDg-XcXynucOK0vVTmk0WorOaga5lcd9ewEtpBh75Z8Hn9_b6iI_LKlkw1ZoU6I5iPm2g26rDfLIPJ3eE9PlQLI';

const state = { businessId: null, business: null, following: false, subscription: null };

const app = document.getElementById('app');
const content = document.createElement('div');
content.className = 'content';
app.replaceChildren(content);

function escapePathSegment(value) {
  return encodeURIComponent(value);
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  });
  if (!response.ok) {
    let message = 'No se pudo completar la solicitud.';
    try { message = (await response.json()).message || message; } catch (_) {}
    throw new Error(message);
  }
  return response.status === 204 ? null : response.json();
}

function card(title, body) {
  const element = document.createElement('section');
  element.className = 'card';
  const heading = document.createElement('h2');
  heading.textContent = title;
  const paragraph = document.createElement('p');
  paragraph.textContent = body;
  element.append(heading, paragraph);
  return element;
}

function renderLoading() {
  content.replaceChildren(card('Calentitos', 'Cargando información del negocio…'));
}

function renderError(message) {
  const section = card('No pudimos acceder', message);
  const link = document.createElement('a');
  link.href = '/';
  link.className = 'button secondary';
  link.textContent = 'Ir al inicio';
  section.append(link);
  content.replaceChildren(section);
}

function renderBusiness() {
  const business = state.business;
  content.replaceChildren();

  const hero = document.createElement('section');
  hero.className = 'hero-card';
  const eyebrow = document.createElement('span');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'CALENTITOS';
  const title = document.createElement('h1');
  title.textContent = business.name;
  const location = document.createElement('p');
  location.textContent = business.location;
  hero.append(eyebrow, title, location);
  content.append(hero);

  const productsSection = document.createElement('section');
  productsSection.className = 'card';
  const productsTitle = document.createElement('h2');
  productsTitle.textContent = 'Productos';
  productsSection.append(productsTitle);
  const products = state.products || [];
  if (!products.length) {
    const empty = document.createElement('p');
    empty.textContent = 'Este negocio todavía no tiene productos publicados.';
    productsSection.append(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'product-list';
    products.forEach(product => {
      const item = document.createElement('li');
      item.textContent = product.name;
      list.append(item);
    });
    productsSection.append(list);
  }
  content.append(productsSection);

  if (state.hotEvent) {
    const event = state.hotEvent;
    const eventCard = document.createElement('section');
    eventCard.className = 'card hot-card';
    const heading = document.createElement('h2');
    heading.textContent = '🔥 Hot Event';
    const product = document.createElement('p');
    product.textContent = event.product.name;
    const status = document.createElement('strong');
    status.textContent = event.hotEvent.status === 'AVAILABLE_NOW' ? 'Disponible ahora' : event.hotEvent.status === 'SOLD_OUT' ? 'Agotado' : 'Próximamente';
    eventCard.append(heading, product, status);
    content.append(eventCard);
  }

  const notificationCard = document.createElement('section');
  notificationCard.className = 'card notification-card';
  const notificationTitle = document.createElement('h2');
  notificationTitle.textContent = state.following ? 'Alertas activadas' : '¿Querés enterarte cuando haya algo nuevo?';
  const notificationText = document.createElement('p');
  notificationText.textContent = state.following ? 'Recibirás una notificación cuando este negocio publique un Hot Event.' : 'Seguí este negocio desde tu iPhone o navegador compatible para recibir alertas de Hot Events.';
  const button = document.createElement('button');
  button.className = 'button primary';
  button.type = 'button';
  button.textContent = state.following ? 'Dejar de recibir alertas' : 'Activar alertas';
  button.addEventListener('click', () => toggleNotifications(button));
  notificationCard.append(notificationTitle, notificationText, button);
  content.append(notificationCard);

  const note = document.createElement('p');
  note.className = 'privacy-note';
  note.textContent = 'Las notificaciones son opcionales y podés desactivarlas cuando quieras.';
  content.append(note);
}

async function load() {
  const match = window.location.pathname.match(/^\/hotcrave\/b\/([^/]+)\/?$/i);
  if (!match) {
    renderError('El enlace de este código QR no es válido.');
    return;
  }
  state.businessId = decodeURIComponent(match[1]);
  if (!/^business_[A-Za-z0-9_-]{12,64}$/.test(state.businessId)) {
    renderError('El enlace de este código QR no es válido.');
    return;
  }

  renderLoading();
  try {
    const [business, productsResponse, hotEventsResponse] = await Promise.all([
      api(`/business/${escapePathSegment(state.businessId)}`),
      api(`/business/${escapePathSegment(state.businessId)}/products`),
      api('/hot-events'),
    ]);
    state.business = business;
    state.products = productsResponse.products || [];
    state.hotEvent = (hotEventsResponse.hotEvents || []).find(item => item.business.businessId === state.businessId) || null;
    document.title = `${business.name} · Calentitos`;
    renderBusiness();
  } catch (error) {
    renderError(error.message);
  }
}

function base64UrlToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}

function isIos() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

async function toggleNotifications(button) {
  button.disabled = true;
  try {
    if (state.following) {
      if (state.subscription) {
        await api('/web/push/subscriptions', {
          method: 'DELETE',
          body: JSON.stringify({ businessId: state.businessId, ...state.subscription.toJSON(), p256dh: state.subscription.toJSON().keys.p256dh, auth: state.subscription.toJSON().keys.auth }),
        });
      }
      state.following = false;
      state.subscription = null;
      renderBusiness();
      return;
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      throw new Error('Este navegador no admite notificaciones web.');
    }

    if (isIos() && !isStandalone()) {
      throw new Error('En iPhone, primero agregá Calentitos a la pantalla de inicio y luego activá las alertas desde allí.');
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Las notificaciones no fueron habilitadas.');

    const registration = await navigator.serviceWorker.register('/hotcrave/b/sw.js', { scope: '/hotcrave/b/' });
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC_KEY) });
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('No se pudo crear la suscripción de notificaciones.');

    await api('/web/push/subscriptions', {
      method: 'PUT',
      body: JSON.stringify({ businessId: state.businessId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }),
    });
    state.subscription = subscription;
    state.following = true;
    renderBusiness();
  } catch (error) {
    button.disabled = false;
    alert(error.message);
  }
}

load();
