-- OBLIGACIONES VIVAS DE FORMACIONES YA ELIMINADAS (2026-09-30).
--
-- El borrado normal de una formacion (sin convocatorias) dejaba vivas sus obligaciones SUELTAS y sus
-- reglas. En produccion «DGGGD» seguia contando una persona «esperando convocatoria» en Seguimiento,
-- y al pulsar no salia nada porque la lista oculta lo borrado. El borrado ya las apaga; esto arregla
-- lo que quedo de antes. Idempotente: una segunda pasada no encuentra nada que cambiar.
UPDATE assignment_rules r
   SET active = false
  FROM activities a
 WHERE a.id = r.target_id
   AND r.target_type = 'ACTIVITY'
   AND a.deleted_at IS NOT NULL
   AND r.active = true;

UPDATE assignments s
   SET status = 'WAIVED',
       waived_reason = 'La formación se eliminó'
  FROM activities a
 WHERE a.id = s.target_id
   AND s.target_type = 'ACTIVITY'
   AND a.deleted_at IS NOT NULL
   AND s.status IN ('PENDING', 'IN_PROGRESS', 'OVERDUE');
