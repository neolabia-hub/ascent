-- El permiso catalog:force_delete pasa a llamarse por lo que es, la Papelera, y deja de decir
-- "solo por persona": desde el 2026-09-30 tambien se puede marcar en un rol (pedido del cliente).
-- Ningun rol lo trae de entrada; se concede a mano.
UPDATE "permissions"
SET "description" = 'Papelera: eliminar formaciones de prueba ya usadas y restaurar lo eliminado'
WHERE "code" = 'catalog:force_delete';
