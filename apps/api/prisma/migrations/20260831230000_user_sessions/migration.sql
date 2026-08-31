-- UNA PERSONA PUEDE TENER VARIAS SESIONES A LA VEZ (Decision #91).
--
-- El token de refresco vivia en UNA columna de `users`, asi que solo cabia una sesion: entrar
-- desde el telefono cerraba la del computador, y cualquier segundo login tumbaba el anterior en
-- cuanto caducaba su token de acceso (15 minutos despues). Eso es lo que se veia como "se cerro
-- la sesion sola y sin motivo".
--
-- Cada sesion pasa a ser una FILA. Se cierra la suya y no la de los demas.
--
-- `previous_hash` + `previous_valid_until` son la VENTANA DE GRACIA del rotado: el refresco
-- cambia el token, y dos pestanas que refrescan a la vez se invalidarian entre si —la primera
-- rota, la segunda presenta el viejo y se queda fuera—. Con unos segundos de gracia, la segunda
-- entra igual.
--
-- La columna vieja `users.refresh_token_hash` NO se borra: se deja de usar y se limpia. Borrarla
-- en la misma migracion que introduce el reemplazo deja sin vuelta atras si algo sale mal.

CREATE TABLE "user_sessions" (
  "id"                   UUID         NOT NULL,
  "tenant_id"            UUID         NOT NULL,
  "user_id"              UUID         NOT NULL,
  "token_hash"           TEXT         NOT NULL,
  "previous_hash"        TEXT,
  "previous_valid_until" TIMESTAMP(3),
  "user_agent"           TEXT,
  "ip_address"           TEXT,
  "expires_at"           TIMESTAMP(3) NOT NULL,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_sessions_user_id_expires_at_idx" ON "user_sessions"("user_id", "expires_at");
CREATE INDEX "user_sessions_token_hash_idx" ON "user_sessions"("token_hash");

ALTER TABLE "user_sessions"
  ADD CONSTRAINT "user_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AISLAMIENTO MULTI-TENANT, igual que el resto de tablas con `tenant_id`. Sin esto, una sesion
-- seria legible desde otro tenant, que es exactamente lo que la politica existe para impedir.
ALTER TABLE "user_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "user_sessions"
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "user_sessions" TO neopulse_app;

-- Las sesiones vivas de la columna vieja se descartan: quien este dentro vuelve a entrar una vez.
-- Es preferible a arrastrar un refresco que ya no tiene fila donde vivir.
UPDATE "users" SET "refresh_token_hash" = NULL WHERE "refresh_token_hash" IS NOT NULL;
