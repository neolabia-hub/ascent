-- El programa tambien necesita decir de que trata antes de que alguien vea sus modulos
-- (2026-09-15, feedback del cliente sobre la interfaz de Programas).
ALTER TABLE "learning_paths" ADD COLUMN "description" TEXT;
