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
  /*
    SALIDA AUTOCONTENIDA, pero SOLO cuando se construye la imagen.

    Next copia a `standalone/` unicamente lo que el servidor necesita, y con eso la imagen baja de
    "todo node_modules" a unas decenas de MB: en una VM gratuita, la diferencia entre 1,5 GB y 200 MB
    decide si el despliegue cabe.

    Va detras de una variable porque en Windows ROMPE el build local: para armar esa carpeta, Next
    crea enlaces simbolicos hacia el store de pnpm, y sin permisos de desarrollador el sistema los
    deniega (EPERM) y la compilacion muere. Dentro del contenedor —Linux— no existe ese problema.
    Costo verlo una vez: el build de `mirar.ps1` se cayo con un error que hablaba de React y no
    tenia nada que ver con React.
  */
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
};

export default nextConfig;
