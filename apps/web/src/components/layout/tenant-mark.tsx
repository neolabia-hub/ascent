'use client';

import { useTenant } from '@/components/providers/tenant-provider';
import { useMediaUrl } from '@/lib/use-media-url';
import { cn } from '@/components/ui/cn';

/**
 * LA MARCA DE LA EMPRESA arriba de la barra lateral.
 *
 * Faltaba: las dos barras pintaban la INICIAL del nombre en un cuadro de color, que es lo que se
 * pone mientras no hay logo, no lo que se deja cuando ya lo han subido. Quien entra a la
 * plataforma de su empresa espera ver el logo de su empresa; una "T" azul se lee como que la
 * pagina no cargo del todo.
 *
 * Vive en un solo sitio porque son DOS barras —la de quien administra y la del aprendiz— y ya se
 * habian escrito dos veces las mismas nueve lineas. La inicial se queda como respaldo: un hueco
 * donde deberia ir el logo se lee como que algo esta roto.
 *
 * `object-contain` sobre pastilla blanca, nunca `cover`: un logotipo puede ser cuadrado, redondo o
 * una palabra alargada, y con `cover` el primero que se subio salio cortado por la mitad.
 */
export function TenantMark({ collapsed = false }: { collapsed?: boolean }) {
  const { name, branding } = useTenant();
  const logo = useMediaUrl(branding.logoKey);

  /*
    EL LOGO: EN SU CAJA, MAS GRANDE Y CON LAS ESQUINAS REDONDAS (Decision #109).

    Se probo sacarlo de la caja y dejarlo suelto como rectangulo ancho, quitando el nombre al lado
    —el razonamiento era que un logotipo suele SER el nombre escrito, asi que repetirlo sobraba—.
    Se vio y quedaba peor: sin caja, el logo flotaba sin apoyarse en nada y perdia el nombre, que
    es lo que de verdad identifica la empresa cuando el logotipo es un simbolo y no una palabra.

    Asi que vuelve la caja, con dos arreglos sobre la original:

      TAMANO   36 -> 44 px, que es de donde venia la queja de que se veia diminuto.
      FORMA    esquinas de 16 px (`rounded-2xl`), no de 8. Un cuadrado de canto vivo dentro de una
               barra que es una tarjeta muy redondeada se lee como una pieza de otro sitio; con el
               mismo radio que su contenedor, pertenece.

    `object-contain` y NUNCA `cover`: un logotipo puede ser cuadrado, redondo o una palabra
    alargada, y con `cover` el primero que se subio salio cortado por la mitad.
  */
  return (
    <div className={cn('flex items-center gap-2.5', collapsed && 'justify-center')}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt={branding.companyDisplayName || name}
          className="h-11 w-11 shrink-0 rounded-2xl border border-line bg-white object-contain p-1.5"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl font-display text-base font-bold text-white"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      {!collapsed ? (
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-semibold leading-tight text-ink-900">{name}</p>
          {/*
            EL NOMBRE DEL PRODUCTO, pequeño y debajo del de la empresa. Ese es el orden correcto
            dentro de la aplicacion: la persona que entra trabaja en su empresa, no en NEO PULSE.
            Pero tiene que estar, porque si no, nadie sabe como se llama la herramienta que usa
            todos los dias —y es lo que escribe en el asunto cuando pide ayuda—.
          */}
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">NEO PULSE</p>
        </div>
      ) : null}
    </div>
  );
}
