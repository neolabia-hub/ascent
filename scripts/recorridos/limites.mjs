// RECORRIDO: EL LIMITE DE PETICIONES, POR PERSONA Y POR IP (2026-10-01).
//
// Antes era uno solo por IP (300/min): una sede entera detras de la misma IP compartia ese tope. Ahora
// son dos capas —ver `apps/api/src/common/throttler-por-persona.guard.ts`—:
//   - por PERSONA, 300/min, despues de autenticar;
//   - por IP, 1.500/min, antes de todo.
//
// Se comprueba que una persona que pasa su tope queda frenada, y que OTRA persona desde la MISMA IP
// sigue trabajando. Usa su propia persona y no el administrador: los demas recorridos lo necesitan.
//
//   node scripts/recorridos/limites.mjs
import { crearCliente, paso, comprobar, resumen } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
await admin.entrar('admin@transprensa.com', 'Transprensa2026*');
const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((x) => x.active);
const areas = ((await admin.get('/catalogs/areas')).cuerpo ?? []).filter((x) => x.active);

paso(1, 'UNA PERSONA QUE PASA SU TOPE');
const doc = `LM${marca}`;
const alta = await admin.post('/users', {
  documentNumber: doc, fullName: `Limites E2E${marca}`, jobTitleId: cargos[0].id, areaId: areas[0].id,
});
const persona = crearCliente();
await persona.entrar(doc, alta.cuerpo?.generatedPassword);
let primerFreno = null;
for (let i = 1; i <= 320; i += 1) {
  // Sin reintentos: aqui se quiere VER el 429, no esperarlo.
  const r = await persona.pedir('/auth/me', { reintentar: false });
  if (r.estado === 429) {
    primerFreno = i;
    break;
  }
}
comprobar(primerFreno !== null && primerFreno > 290, `queda frenada al pasar su tope (peticion ${primerFreno})`, `freno en ${primerFreno}`);

paso(2, 'OTRA PERSONA, DESDE LA MISMA IP, SIGUE TRABAJANDO');
const delAdmin = await admin.get('/auth/me');
comprobar(delAdmin.ok, 'el administrador no se ve afectado: el tope es de cada persona, no de la IP', `${delAdmin.estado}`);

console.log(`\nCREADO PARA LIMPIAR: persona=${doc}`);
process.exit(resumen() === 0 ? 0 : 1);
