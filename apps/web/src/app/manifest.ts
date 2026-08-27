import type { MetadataRoute } from 'next';

/**
 * Manifiesto de la PWA (Decision #21: instalable, distribuida por enlace o QR, sin tienda).
 *
 * `start_url` apunta a la superficie del APRENDIZ y no a la raiz: quien instala esto en su
 * telefono lo hace para ver lo que le toca, no para administrar nada. Los colores son de la
 * PLATAFORMA, no del tenant: la pantalla de arranque se dibuja antes de saber en que empresa
 * esta la persona.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NEO PULSE',
    short_name: 'NEO PULSE',
    description: 'Tu formacion, en el bolsillo.',
    start_url: '/hoy',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0e1114',
    theme_color: '#101418',
    lang: 'es-CO',
    dir: 'ltr',
    categories: ['education', 'business'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Mi repaso de hoy', short_name: 'Repaso', url: '/repaso' },
      { name: 'Mi formacion', short_name: 'Formacion', url: '/mi-formacion' },
    ],
  };
}
