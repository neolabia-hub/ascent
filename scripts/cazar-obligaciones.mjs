/**
 * Caza la intermitencia de "la obligacion nace sola": crea N personas por la API y comprueba que
 * cada una salga con sus obligaciones. Mide el tiempo del alta, que es lo que la prueba de
 * navegador no puede ver.
 */
const API = process.env.API ?? 'http://localhost:3012';
const VECES = Number(process.env.VECES ?? 40);

const login = async () => {
  const r = await fetch(`${API}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantSlug: 'transprensa', identifier: '999999999', password: 'Transprensa2026*' }),
  });
  if (!r.ok) throw new Error(`login ${r.status}: ${await r.text()}`);
  return (await r.json()).accessToken;
};

const token = await login();
const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const catalogo = async (clave) => (await fetch(`${API}/v1/catalogs/${clave}`, { headers: auth })).json();
const [cargos, areas] = await Promise.all([catalogo('job-titles'), catalogo('areas')]);
const cargo = cargos.find((c) => c.active);
const area = areas.find((a) => a.active);

let sinObligaciones = 0;
const tiempos = [];

for (let i = 0; i < VECES; i++) {
  const sufijo = `${Date.now()}${i}`.slice(-9);
  const t0 = Date.now();
  const alta = await fetch(`${API}/v1/users`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      documentNumber: `55${sufijo}`,
      fullName: `Caza Obligacion ${sufijo}`,
      email: `caza.${sufijo}@prueba.test`,
      emailKind: 'PERSONAL',
      jobTitleId: cargo.id,
      areaId: area.id,
      roleCode: 'USUARIO',
      employmentType: 'DIRECTO',
    }),
  });
  const ms = Date.now() - t0;
  tiempos.push(ms);

  if (!alta.ok) {
    console.log(`  ${i}: ALTA FALLO ${alta.status} ${(await alta.text()).slice(0, 160)}`);
    sinObligaciones++;
    continue;
  }
  const { user } = await alta.json();

  const r = await fetch(`${API}/v1/assignments?userId=${user.id}&pageSize=5`, { headers: auth });
  const cuerpo = await r.json();
  const total = cuerpo.total ?? (Array.isArray(cuerpo.items) ? cuerpo.items.length : 0);
  if (total === 0) {
    sinObligaciones++;
    console.log(`  ${i}: SIN OBLIGACIONES tras ${ms} ms  (usuario ${user.id})`);
  }
}

tiempos.sort((a, b) => a - b);
const p = (q) => tiempos[Math.min(tiempos.length - 1, Math.floor(tiempos.length * q))];
console.log(`\naltas: ${VECES}   sin obligaciones: ${sinObligaciones}`);
console.log(`alta en ms  ->  min ${tiempos[0]}   mediana ${p(0.5)}   p90 ${p(0.9)}   max ${tiempos.at(-1)}`);
