'use client';

import { useEffect, useState } from 'react';
import { getAccessToken } from '@/lib/api';

/**
 * Puente entre la aplicacion y el service worker (`public/sw.js`).
 *
 * Hace tres cosas y ninguna es cosmetica:
 *  1. REGISTRA el worker (sin el no hay nada offline).
 *  2. Le pasa el access token vigente. El worker reintenta envios encolados horas despues, y el
 *     token dura 15 minutos: sin esto, el avance de alguien se perderia por una cabecera vencida.
 *  3. Le avisa al recuperar senal para que vacie la cola sin esperar a Background Sync (que solo
 *     existe en Chromium).
 *
 * Ademas avisa EN PANTALLA cuando no hay conexion. Un aviso honesto evita el peor escenario:
 * alguien repitiendo una leccion porque creyo que no se habia guardado.
 */
export function ServiceWorkerBridge() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    // En DESARROLLO no se registra, y si quedo uno registrado se da de baja.
    //
    // El worker cachea el armazon para que la aplicacion abra sin senal, que es justo lo que
    // arruina el trabajo del dia: cambias una pantalla, recargas, y el navegador te sigue
    // sirviendo la anterior desde el cache. Depurar eso cuesta horas y parece un fallo del
    // codigo. Sin senal solo hay que funcionar en produccion.
    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => undefined);
      return;
    }

    const sendAuth = () => {
      const token = getAccessToken();
      navigator.serviceWorker.controller?.postMessage({ type: 'AUTH', token });
    };

    void navigator.serviceWorker
      .register('/sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then(() => {
        sendAuth();
        navigator.serviceWorker.controller?.postMessage({ type: 'FLUSH_QUEUE' });
      })
      .catch(() => {
        // Sin worker la aplicacion sigue funcionando con red; no hay nada que avisar.
      });

    const handleOnline = () => {
      setOffline(false);
      sendAuth();
      navigator.serviceWorker.controller?.postMessage({ type: 'FLUSH_QUEUE' });
    };
    const handleOffline = () => setOffline(true);

    setOffline(!navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 bg-warn px-4 py-2 text-center text-sm font-medium text-white"
    >
      Sin conexion. Puedes seguir: tu avance se guarda y se envia al volver la senal.
    </div>
  );
}

/** Borra del telefono los datos cacheados de la persona. Se llama al cerrar sesion. */
export function clearOfflineData(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_DATA' });
}
