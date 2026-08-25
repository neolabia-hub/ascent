import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Aplica prisma/sql/rls.sql como OWNER via psql dentro del contenedor de Postgres.
 * Dev: contenedor neo-pulse-postgres (docker/docker-compose.yml). En produccion el deploy
 * ejecuta el mismo SQL con psql contra la base (ver runbook cuando exista).
 * Los DO $$ ... $$ impiden usar prisma.$executeRawUnsafe (una sola sentencia por llamada).
 */
const here = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(here, '..', 'prisma', 'sql', 'rls.sql');
const sql = readFileSync(sqlPath, 'utf8');

const container = process.env.PG_CONTAINER ?? 'neo-pulse-postgres';
const dbUser = process.env.PG_OWNER_USER ?? 'neopulse';
const dbName = process.env.PG_DB ?? 'neopulse';

console.log(`RLS: aplicando ${sqlPath} en ${container} (${dbUser}@${dbName})`);
execFileSync('docker', ['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', dbUser, '-d', dbName], {
  input: sql,
  stdio: ['pipe', 'inherit', 'inherit'],
});
console.log('RLS: OK');
