-- NEO PULSE — Row-Level Security (Decision #17). Defensa en profundidad multi-tenant.
-- Ejecutar DESPUES de `prisma migrate` (como owner): pnpm db:rls
--
-- Modelo: la app se conecta con un rol NO-owner (neopulse_app) sujeto a RLS.
-- PrismaService.forTenant() ejecuta `set_config('app.tenant_id', ..., TRUE)` por transaccion.
-- Migraciones/seed corren con el owner (neopulse), que NO esta sujeto a estas policies.

-- 1) Rol de aplicacion (idempotente).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neopulse_app') THEN
    CREATE ROLE neopulse_app LOGIN PASSWORD 'neopulse_app';
  END IF;
END$$;

GRANT USAGE ON SCHEMA public TO neopulse_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO neopulse_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO neopulse_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO neopulse_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO neopulse_app;

-- 2) Habilitar RLS + policy en TODA tabla que tenga columna tenant_id.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', r.table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I;', r.table_name);
    -- NULLIF: tras un SET LOCAL revertido, la variable queda como cadena VACIA (no NULL) en la
    -- sesion del pool, y ''::uuid lanza 22P02. Con NULLIF la policy evalua a NULL (= sin filas)
    -- en vez de reventar la query. Descubierto por scripts/verify-rls.ts.
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON public.%I
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
    $f$, r.table_name);
  END LOOP;
END$$;

-- 3) Caso especial: activity_templates permite tenant_id NULL (biblioteca global de NEO,
--    legible por todos los tenants). La escritura de globales queda reservada al owner.
DROP POLICY IF EXISTS tenant_isolation ON public.activity_templates;
CREATE POLICY tenant_isolation ON public.activity_templates
  USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- NOTA: `permissions` es catalogo GLOBAL (sin tenant_id) -> no lleva RLS (legible por todos).
-- `tenants` tampoco tiene tenant_id como FK de aislamiento: el bootstrap de login (resolver slug)
-- corre via owner; el resto de accesos a tenants pasa por la capa ORM.
