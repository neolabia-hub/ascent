/**
 * `distDir` sale del entorno para que puedan convivir DOS instancias del front.
 *
 * Next escribe dev y build en la misma carpeta `.next`, asi que un `pnpm build` mientras alguien
 * mira la aplicacion en modo desarrollo le deja la pantalla en "Cargando..." para siempre y todo
 * el JavaScript en 404 (incidente del 2026-08-27). Con esto, el stack de mirar
 * (`scripts/mirar.ps1`) usa `.next-mirar` y las pruebas y los builds se quedan con `.next`: ni se
 * ven ni se pisan.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
};

export default nextConfig;
