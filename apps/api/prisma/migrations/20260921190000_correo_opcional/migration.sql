-- EL CORREO DE UNA PERSONA PASA A SER OPCIONAL
--
-- Lo trajo el cliente cargando su plantilla: hay gente que no tiene correo, y la fila se rechazaba.
-- La salida practica era inventar una direccion (`1116267708@empresa.com`), que es peor que no
-- tener ninguna: parece un correo, nadie lo lee, y despues no hay forma de distinguir quien tiene
-- uno de verdad.
--
-- No deja a nadie fuera: se entra con la CEDULA o con el correo (Decision #10), asi que quien no
-- tiene correo entra con su cedula. Lo unico que pierde es lo que se manda por correo, y por eso
-- tiene que constar como nulo: para no contarlo como entregado.
--
-- El indice unico (tenant_id, email) NO estorba: en Postgres los nulos no chocan entre si, asi que
-- puede haber cualquier cantidad de personas sin correo sin que ninguna choque con otra.
--
-- Solo AFLOJA una restriccion: no toca ni una fila de datos y se puede aplicar con el sistema
-- arriba. Idempotente, como manda el RUNBOOK.

ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
