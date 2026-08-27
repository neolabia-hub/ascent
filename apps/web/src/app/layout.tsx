import type { Metadata, Viewport } from 'next';
import { Inter, Manrope } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['500', '600', '800'],
  variable: '--font-manrope',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'NEO PULSE',
  description: 'Plataforma de formacion corporativa NEO PULSE',
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
    <html lang="es" className={`${manrope.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-paper font-sans text-ink-900 antialiased">{children}</body>
    </html>
  );
}
