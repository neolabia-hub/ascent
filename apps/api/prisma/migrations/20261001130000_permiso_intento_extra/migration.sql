-- El permiso se llama por lo que hace en pantalla: «Dar un intento más» (2026-10-01).
UPDATE "permissions"
SET "description" = 'Dar un intento más a quien agotó los intentos de una evaluación'
WHERE "code" = 'enrollments:unblock';
