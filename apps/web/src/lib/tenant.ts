/**
 * Resolucion del slug del tenant a partir del host y, en desarrollo, de query params
 * o de una variable de entorno. En produccion el tenant se identifica por subdominio
 * (transprensa.neopulse.app). En desarrollo no hay subdominios reales, asi que se
 * habilitan alternativas para poder probar cada tenant sin DNS local.
 *
 * Orden de resolucion:
 *   1. Subdominio del host, si el host no es localhost ni www.
 *   2. Query param `?tenant=`.
 *   3. Variable de entorno NEXT_PUBLIC_DEV_TENANT (default "transprensa").
 */
const DEFAULT_DEV_TENANT = 'transprensa';
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

export function resolveTenantSlug(host: string, searchParams?: URLSearchParams): string {
  const hostname = host.split(':')[0]?.toLowerCase().trim() ?? '';

  if (hostname && !LOCAL_HOSTNAMES.has(hostname)) {
    const labels = hostname.split('.');
    const firstLabel = labels[0];
    const hasSubdomain = labels.length > 2;

    if (hasSubdomain && firstLabel && firstLabel !== 'www') {
      return firstLabel;
    }
  }

  const queryTenant = searchParams?.get('tenant');
  if (queryTenant) {
    return queryTenant;
  }

  return process.env.NEXT_PUBLIC_DEV_TENANT ?? DEFAULT_DEV_TENANT;
}
