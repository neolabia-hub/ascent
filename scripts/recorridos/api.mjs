// Cliente minimo para los recorridos de punta a punta.
export const API = 'http://localhost:3012/v1';

export function crearCliente() {
  let token = '';
  /** Con que se entro, para volver a entrar si la sesion vence a mitad de un recorrido largo. */
  let credenciales = null;
  /*
    SI LA API DICE «DEMASIADAS PETICIONES» (429), SE ESPERA Y SE REINTENTA (2026-10-02). Desde que el
    limite es por PERSONA (300/min), un recorrido que limpia decenas de reglas seguidas con el mismo
    administrador lo alcanza. Eso es el limite haciendo su trabajo, no un fallo de lo que se prueba:
    se espera lo que pide la API y se sigue. Cada espera se anota, para que se vea si ocurrio.
  */
  const pedir = async (ruta, opciones = {}, intento = 1) => {
    const r0 = await fetch(`${API}${ruta}`, {
      ...opciones,
      headers: {
        ...(opciones.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(opciones.headers ?? {}),
      },
    });
    // `reintentar: false` lo usa el recorrido de LIMITES, que justamente quiere ver el 429.
    if (r0.status === 429 && opciones.reintentar !== false && intento <= 5) {
      const espera = Number(r0.headers.get('retry-after-persona') ?? r0.headers.get('retry-after') ?? 5);
      console.log(`   ... 429 en ${ruta}: se espera ${espera} s (limite por persona)`);
      await new Promise((listo) => setTimeout(listo, Math.max(1, espera) * 1000));
      return pedir(ruta, opciones, intento + 1);
    }
    /*
      SESION VENCIDA (401): SE VUELVE A ENTRAR Y SE REINTENTA (2026-10-02). El token dura 15 minutos y
      los recorridos largos, dentro de la bateria completa, los pasan: `estandar` se caia en su limpieza
      final con todo lo anterior en verde. La aplicacion real renueva sola su sesion; este cliente no lo
      hacia. Se anota cada vez. Ningun recorrido espera un 401 a proposito (revisado al ponerlo).
    */
    if (r0.status === 401 && credenciales && ruta !== '/auth/login' && intento <= 2) {
      console.log(`   ... 401 en ${ruta}: sesion vencida, se vuelve a entrar`);
      await entrarCon(credenciales.identifier, credenciales.password);
      return pedir(ruta, opciones, intento + 1);
    }
    const r = r0;
    const texto = await r.text();
    let cuerpo = null;
    try { cuerpo = texto ? JSON.parse(texto) : null; } catch { cuerpo = texto; }
    return { estado: r.status, cuerpo, ok: r.status < 400 };
  };
  return {
    pedir,
    get: (ruta) => pedir(ruta),
    post: (ruta, body) => pedir(ruta, { method: 'POST', body: JSON.stringify(body ?? {}) }),
    patch: (ruta, body) => pedir(ruta, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
    entrar: (identifier, password) => entrarCon(identifier, password),
  };
  async function entrarCon(identifier, password) {
    const r = await pedir('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ tenantSlug: 'transprensa', identifier, password }),
    });
    if (!r.ok) throw new Error(`login ${identifier}: ${r.estado} ${JSON.stringify(r.cuerpo)}`);
    token = r.cuerpo.accessToken;
    credenciales = { identifier, password };
    return r.cuerpo;
  }
}

let fallos = 0;
export function paso(n, titulo) { console.log(`\n${n}. ${titulo}`); }
export function ok(texto) { console.log(`   OK   ${texto}`); }
export function mal(texto) { fallos += 1; console.log(`   MAL  ${texto}`); }
export function comprobar(condicion, bien, malo) { condicion ? ok(bien) : mal(malo ?? bien); }
export function resumen() {
  console.log(fallos === 0 ? '\n=== TODO BIEN ===' : `\n=== ${fallos} FALLO(S) ===`);
  return fallos;
}
