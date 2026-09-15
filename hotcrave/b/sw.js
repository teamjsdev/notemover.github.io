self.addEventListener('push', event => {
  console.log('[HotCrave SW] push event recibido', {
    hasData: Boolean(event.data),
  });

  if (!event.data) {
    console.warn('[HotCrave SW] push sin datos');
    return;
  }

  let data;
  try {
    data = event.data.json();
    console.log('[HotCrave SW] payload recibido', data);
  } catch (error) {
    console.error('[HotCrave SW] no se pudo parsear el payload', error);
    return;
  }

  if (data.type !== 'HOT_EVENT') {
    console.warn('[HotCrave SW] payload ignorado: tipo inesperado', data.type);
    return;
  }

  const available = data.status === 'AVAILABLE_NOW';
  const title = available ? '🔥 Hot Event disponible' : '🔥 Nuevo Hot Event';
  const body = data.businessName && data.productName
    ? `${data.businessName}: ${data.productName}`
    : 'Hay una novedad de un negocio que seguís.';

  console.log('[HotCrave SW] HOT_EVENT válido, mostrando notificación', {
    title,
    body,
    businessId: data.businessId || '',
    hotEventId: data.hotEventId || '',
  });

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: `hot-event-${data.hotEventId || data.businessId || 'unknown'}`,
      renotify: true,
      data: {
        businessId: data.businessId || '',
        hotEventId: data.hotEventId || '',
      },
    }).then(() => {
      console.log('[HotCrave SW] showNotification completado correctamente');
    }).catch(error => {
      console.error('[HotCrave SW] showNotification falló', error);
      throw error;
    })
  );
});

self.addEventListener('notificationclick', event => {
  console.log('[HotCrave SW] notificationclick', event.notification.data);
  event.notification.close();
  const businessId = event.notification.data?.businessId;
  if (!businessId) {
    console.warn('[HotCrave SW] notificationclick sin businessId');
    return;
  }
  const url = `/hotcrave/b/${encodeURIComponent(businessId)}`;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(openWindows => {
    const existing = openWindows.find(client => 'focus' in client);
    if (existing) {
      existing.navigate(url);
      return existing.focus();
    }
    return clients.openWindow(url);
  }));
});
