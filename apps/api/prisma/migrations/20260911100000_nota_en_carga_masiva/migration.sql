-- Aviso (no error) en cada fila de una carga masiva de personas: informa que un cargo, area,
-- regional o servicio que no estaba en el catalogo se creo solo, sobre la marcha.
ALTER TABLE "user_import_rows" ADD COLUMN IF NOT EXISTS "note" TEXT;
