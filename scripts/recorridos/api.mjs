// Cliente minimo para los recorridos de punta a punta.
export const API = 'http://localhost:3012/v1';

export function crearCliente() {
  let token = '';
  const pedir = async (ruta, opciones = {}) => {
    const r = await fetch(`${API}${ruta}`, {
      ...opciones,
      headers: {
        ...(opciones.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(opciones.headers ?? {}),
      },
    });
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
    async entrar(identifier, password) {
      const r = await pedir('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ tenantSlug: 'transprensa', identifier, password }),
      });
      if (!r.ok) throw new Error(`login ${identifier}: ${r.estado} ${JSON.stringify(r.cuerpo)}`);
      token = r.cuerpo.accessToken;
      return r.cuerpo;
    },
  };
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
