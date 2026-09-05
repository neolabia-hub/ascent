/**
 * A QUE EMPRESA PERTENECE LA PANTALLA QUE SE ESTA MIRANDO.
 *
 * ─── EL DOMINIO RAIZ ES CONFIGURACION, NO ADIVINANZA ───
 *
 * Antes esto contaba los puntos del host: "si tiene tres trozos o mas, el primero es la empresa".
 * Funciona con `transprensa.neopulse.app` y **miente con todo lo demas**: en `neopulse.duckdns.org`
 * o en `neo-pulse.vercel.app` —los dos hosts gratuitos con los que sale el piloto— deduciria que
 * existe una empresa llamada "neopulse", pediria el ingreso contra un tenant inexistente y no
 * habria manera de entrar. Igual con cualquier `algo.onrender.com`.
 *
 * Un host no dice donde termina el dominio raiz; eso solo lo sabe quien lo configuro. Asi que se
 * declara en `NEXT_PUBLIC_ROOT_HOST` y la regla pasa a ser exacta:
 *
 *   NEXT_PUBLIC_ROOT_HOST=neopulse.app
 *     transprensa.neopulse.app  -> "transprensa"   (el subdominio ES la empresa)
 *     neopulse.app / www....    -> el host no dice la empresa; se sigue buscando
 *
 *   NEXT_PUBLIC_ROOT_HOST=neopulse.duckdns.org
 *     neopulse.duckdns.org      -> el host no dice la empresa; entra por `?tenant=`
 *
 * Sin la variable NO se deduce nada del host. Es deliberado: en un producto multi-empresa es mejor
 * equivocarse hacia "no lo se" que hacia "creo que es esta", porque acertar por accidente la
 * empresa equivocada no se nota hasta que alguien ve datos que no son suyos.
 *
 * Orden de resolucion:
 *   1. Subdominio del host, SOLO si `NEXT_PUBLIC_ROOT_HOST` esta puesto y el host cuelga de el.
 *   2. Query param `?tenant=`.
 *   3. `NEXT_PUBLIC_DEV_TENANT` (por defecto "transprensa").
 *
 * PENDIENTE conocido: el paso 3 hace que un despliegue con dominio propio al que se le olvide
 * `NEXT_PUBLIC_ROOT_HOST` caiga en "transprensa" en silencio. Con una sola empresa es inocuo; con
 * dos, no. Se cierra cuando entre la segunda: ahi el valor por defecto tiene que desaparecer y la
 * pantalla debe PEDIR la empresa en vez de suponerla.
 */
const DEFAULT_DEV_TENANT = 'transprensa';

function normalizar(valor: string | undefined): string {
  return (valor ?? '').split(':')[0]?.toLowerCase().trim() ?? '';
}

export function resolveTenantSlug(host: string, searchParams?: URLSearchParams): string {
  const hostname = normalizar(host);
  const raiz = normalizar(process.env.NEXT_PUBLIC_ROOT_HOST);

  if (raiz && hostname.endsWith(`.${raiz}`)) {
    const etiqueta = hostname.slice(0, -(raiz.length + 1));
    // `www` no es una empresa; y un subdominio de varios niveles (a.b.raiz) tampoco: si llega algo
    // asi es un error de DNS, y resolverlo a medias lo esconderia.
    if (etiqueta && etiqueta !== 'www' && !etiqueta.includes('.')) {
      return etiqueta;
    }
  }

  const queryTenant = searchParams?.get('tenant');
  if (queryTenant) {
    return queryTenant;
  }

  return process.env.NEXT_PUBLIC_DEV_TENANT ?? DEFAULT_DEV_TENANT;
}
