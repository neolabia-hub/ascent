-- LA CAPA DE PLATAFORMA (Decision #100): quien opera el producto, no quien lo usa.
--
-- Hasta hoy el producto solo conocia UNA clase de persona: alguien que pertenece a una empresa.
-- Eso funciona para todo lo que hace la plataforma DENTRO de un cliente, y deja de funcionar para
-- lo que esta POR ENCIMA de todos: los datos de contacto del proveedor, y manana el listado y el
-- alta de clientes.
--
-- ESTAS TRES TABLAS NO TIENEN `tenant_id` Y NO LLEVAN RLS, y es a proposito: no pertenecen a
-- ninguna empresa. La politica de aislamiento existe para que un cliente no vea lo de otro; aqui
-- no hay nada de ningun cliente que proteger. Lo que las protege es que solo se llega a ellas con
-- un token de plataforma, que se emite en su propio ingreso.
--
-- POR QUE UNA CUENTA APARTE Y NO UNA BANDERA EN UN USUARIO DE UN TENANT. Se considero marcar la
-- cuenta que ya existe dentro de TRANSPRENSA y era mas rapido, pero deja al proveedor viviendo
-- dentro de un cliente: el dia que ese tenant se desactive —o que ese cliente se vaya— el acceso
-- a la administracion de TODOS los demas se iria con el. Y un administrador de cliente que llegue
-- a tocar roles no puede tener ni la posibilidad teorica de concederse esto.

CREATE TABLE "platform_users" (
  "id"                    UUID         NOT NULL,
  "email"                 TEXT         NOT NULL,
  "full_name"             TEXT         NOT NULL,
  "password_hash"         TEXT         NOT NULL,
  "active"                BOOLEAN      NOT NULL DEFAULT true,
  "failed_login_attempts" INTEGER      NOT NULL DEFAULT 0,
  "locked_until"          TIMESTAMP(3),
  "last_login_at"         TIMESTAMP(3),
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_users_email_key" ON "platform_users"("email");

-- Misma mecanica que `user_sessions` (Decision #91), y por el mismo motivo: varias sesiones a la
-- vez, el token de refresco rotado y una ventana de gracia para que dos pestanas que refrescan a
-- la vez no se tumben entre si.
CREATE TABLE "platform_sessions" (
  "id"                   UUID         NOT NULL,
  "platform_user_id"     UUID         NOT NULL,
  "token_hash"           TEXT         NOT NULL,
  "previous_hash"        TEXT,
  "previous_valid_until" TIMESTAMP(3),
  "user_agent"           TEXT,
  "ip_address"           TEXT,
  "expires_at"           TIMESTAMP(3) NOT NULL,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_sessions_platform_user_id_expires_at_idx"
  ON "platform_sessions"("platform_user_id", "expires_at");
CREATE INDEX "platform_sessions_token_hash_idx" ON "platform_sessions"("token_hash");

ALTER TABLE "platform_sessions"
  ADD CONSTRAINT "platform_sessions_platform_user_id_fkey"
  FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- UNA SOLA FILA, y la restriccion lo garantiza en la base de datos y no por convenio.
--
-- `id` fijo en 1 con CHECK: sin eso, un fallo cualquiera crearia una segunda fila y a partir de
-- ahi habria dos verdades sobre el contacto del proveedor, con la lectura decidiendo cual gana por
-- orden de insercion. Es la clase de dato del que solo puede haber uno.
CREATE TABLE "platform_settings" (
  "id"            INTEGER      NOT NULL DEFAULT 1,
  "support_name"  TEXT         NOT NULL DEFAULT '',
  "support_email" TEXT         NOT NULL DEFAULT '',
  "support_phone" TEXT         NOT NULL DEFAULT '',
  "support_note"  TEXT         NOT NULL DEFAULT '',
  "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_settings_singleton" CHECK ("id" = 1)
);

INSERT INTO "platform_settings" ("id") VALUES (1);

GRANT SELECT, INSERT, UPDATE, DELETE ON "platform_users"    TO neopulse_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "platform_sessions" TO neopulse_app;
GRANT SELECT, UPDATE                 ON "platform_settings" TO neopulse_app;
