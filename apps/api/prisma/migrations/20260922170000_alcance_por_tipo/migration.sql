-- QUE TIPOS DE FORMACION PUEDE TOCAR CADA ROL Y CADA PERSONA
--
-- Lo pidio el cliente: *"el rol analista solo debe poder crear tipo plan"*. Pero no se cablea
-- «PLAN» en el codigo: se CONFIGURA desde la pantalla de Permisos, por rol y por persona — porque
-- los tipos los crea el propio tenant y la siguiente empresa querra otra cosa.
--
-- ─── DOS SITIOS, Y EL DE LA PERSONA MANDA ───
--
--   role_activity_type_scopes   el techo por defecto de quien tenga ese rol
--   analyst_scopes.activity_type_id  lo de una persona concreta
--
-- Si la persona tiene tipos marcados valen los suyos —aunque sean mas que los de su rol—; si no
-- tiene ninguno, hereda los del rol; si el rol tampoco, todos. Es la misma precedencia que ya rige
-- los permisos sueltos (`user_permission_overrides`): lo individual pisa lo del rol. Tener dos
-- reglas de precedencia distintas en el mismo producto seria la forma mas corta de que alguien
-- configure una creyendo la otra.
--
-- ─── SIN FILAS NO SE ACOTA NADA ───
--
-- Esta migracion no crea ni una fila. Al aplicarla, **todos los roles y todas las personas siguen
-- pudiendo con todos los tipos**, exactamente como hasta hoy: acotar es un acto deliberado que se
-- hace desde la pantalla. Es el mismo convenio que ya usan `analyst_scopes` para procesos y areas,
-- y el que evita que un despliegue deje a alguien sin poder trabajar sin que nadie lo pidiera.
--
-- Solo AÑADE: una columna nulable y una tabla nueva. No toca una fila de datos y se puede aplicar
-- con el sistema arriba. Idempotente, como manda el RUNBOOK.

ALTER TABLE "analyst_scopes" ADD COLUMN IF NOT EXISTS "activity_type_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'analyst_scopes_activity_type_id_fkey'
  ) THEN
    ALTER TABLE "analyst_scopes"
      ADD CONSTRAINT "analyst_scopes_activity_type_id_fkey"
      FOREIGN KEY ("activity_type_id") REFERENCES "activity_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "role_activity_type_scopes" (
  "role_id"          UUID NOT NULL,
  "activity_type_id" UUID NOT NULL,
  "tenant_id"        UUID NOT NULL,
  "set_by"           UUID NOT NULL,
  "set_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "role_activity_type_scopes_pkey" PRIMARY KEY ("role_id", "activity_type_id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_activity_type_scopes_role_id_fkey') THEN
    ALTER TABLE "role_activity_type_scopes"
      ADD CONSTRAINT "role_activity_type_scopes_role_id_fkey"
      FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_activity_type_scopes_activity_type_id_fkey') THEN
    ALTER TABLE "role_activity_type_scopes"
      ADD CONSTRAINT "role_activity_type_scopes_activity_type_id_fkey"
      FOREIGN KEY ("activity_type_id") REFERENCES "activity_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- Lo consulta cada peticion de quien tiene el rol acotado: por tenant, como todo lo demas.
CREATE INDEX IF NOT EXISTS "role_activity_type_scopes_tenant_idx"
  ON "role_activity_type_scopes" ("tenant_id", "role_id");
