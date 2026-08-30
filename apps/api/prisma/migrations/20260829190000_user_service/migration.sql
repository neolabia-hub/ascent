-- Linea de servicio de la persona (almacenamiento, masivo, paqueteo).
--
-- OPCIONAL a proposito: hay clientes que no organizan a su gente por servicio, y una columna
-- obligatoria les bloquearia la carga masiva entera por un dato que no usan. Quien no lo llene
-- simplemente no puede dirigir formacion "por servicio"; todo lo demas le funciona igual.
ALTER TABLE "users" ADD COLUMN "service_id" UUID;

ALTER TABLE "users"
  ADD CONSTRAINT "users_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Se consulta al resolver audiencias por servicio, siempre junto al tenant.
CREATE INDEX "users_tenant_service_idx" ON "users"("tenant_id", "service_id");
