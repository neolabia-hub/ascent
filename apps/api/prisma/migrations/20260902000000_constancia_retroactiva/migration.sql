-- RELLENAR LA DECISION EN LAS VERSIONES QUE SE PUBLICARON ANTES DE QUE EXISTIERA (Decision #111).
--
-- ─── POR QUE ESTO NO CONTRADICE EL CONGELADO ───
--
-- La regla del proyecto es que la version publicada congela lo que regia el intento y no se toca
-- despues (Decision #27). Esto no la incumple: estas versiones no se publicaron con la decision
-- "no emite" — se publicaron **sin decision ninguna**, porque la columna nacio horas despues con
-- DEFAULT false. Lo que hay ahi no es una eleccion de nadie, es el relleno de la migracion.
--
-- La diferencia importa: sobrescribir una decision seria reescribir el pasado; rellenar un hueco
-- que nunca se decidio es dejar el pasado como habria quedado si la columna hubiera existido.
--
-- ─── Y POR QUE HAY QUE HACERLO ───
--
-- Sin esto, TODA la formacion ya publicada se queda sin constancia para siempre y en silencio. El
-- sintoma seria el peor posible: alguien termina su induccion, no le llega el papel, y no hay nada
-- en pantalla que explique por que. La unica salida seria republicar cada formacion a mano —crear
-- una version nueva de cada una— sin ningun cambio real de contenido, solo para mover un booleano.
--
-- Se aplica la MISMA cascada que usa el codigo (`certificate-policy.ts`): manda lo que decidio la
-- actividad y, si no decidio nada, lo que dice su tipo.
--
-- SOLO toca las versiones cuya actividad sigue viva y cuyo tipo dice que si. Lo que ya estaba en
-- `true` no se toca, y las pildoras se quedan como estan.

UPDATE "activity_versions" v
SET "issues_certificate" = true
FROM "activities" a
JOIN "activity_types" t ON t.id = a.activity_type_id
WHERE v.activity_id = a.id
  AND a.deleted_at IS NULL
  AND v."issues_certificate" = false
  AND COALESCE(
        a."issues_certificate",
        (t.config ->> 'issuesCertificate')::boolean,
        false
      ) = true;

-- Las horas tambien: si la actividad ya tenia un valor, la version publicada deberia haberlo
-- copiado. Hoy no hay ninguna con horas puestas —el campo acaba de nacer— asi que esto no cambia
-- nada todavia; queda escrito para que la migracion sea completa y no a medias.
UPDATE "activity_versions" v
SET "certificate_hours" = a."certificate_hours"
FROM "activities" a
WHERE v.activity_id = a.id
  AND v."certificate_hours" IS NULL
  AND a."certificate_hours" IS NOT NULL;
