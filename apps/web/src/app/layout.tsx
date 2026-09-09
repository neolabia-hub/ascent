import type { Metadata, Viewport } from 'next';
import { Outfit, Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

/**
 * LA TIPOGRAFIA (Decision #92).
 *
 * Era Inter + Manrope. Inter es la fuente mas correcta que existe para interfaz y tambien la mas
 * usada del sector: no falla nunca y no dice nada. Ese era justo el problema —el cliente lleva
 * toda la sesion pidiendo que no se vea generico— y una tipografia que se reconoce como "la de
 * todos los SaaS" trabaja en contra.
 *
 * OUTFIT para los titulos: geometrica, de formas amplias y abiertas, con un contraste claro entre
 * mayuscula y minuscula. En un titular grande se ve intencionada, no por defecto.
 *
 * PLUS JAKARTA SANS para el texto: humanista, un poco mas calida y con la altura de x algo mayor
 * que Inter, que es lo que la hace mas legible en el telefono de bodega con mala luz —el caso que
 * manda aqui—. Las dos traen los acentos y la ñ del castellano completos, que no es obvio.
 */
const outfit = Outfit({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-manrope',
  display: 'swap',
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'NEO PULSE',
  description: 'Plataforma de formación corporativa NEO PULSE',
  // iOS no lee el manifiesto: para que "Anadir a inicio" se vea bien hace falta decirselo aparte.
  appleWebApp: { capable: true, title: 'NEO PULSE', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
};

/**
 * `viewportFit: cover` es lo que permite que la barra inferior del aprendiz llegue al borde y
 * respete a la vez el area segura del telefono (`env(safe-area-inset-bottom)`).
 */
export const viewport: Viewport = {
  themeColor: '#101418',
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${outfit.variable} ${jakarta.variable}`}>
      <body className="min-h-screen bg-paper font-sans text-ink-900 antialiased">{children}</body>
    </html>
  );
}
