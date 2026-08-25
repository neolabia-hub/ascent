# Investigación: Modelado de dominio en plataformas LMS/LXP (estado del arte)

Investigado con agente (Fable) el 2026-08-25. Para NEO PULSE (LMS SaaS multi-tenant,
TypeScript + NestJS + Prisma + PostgreSQL + Next.js). Fuentes al final.

---

## 1. Separación CATÁLOGO vs EJECUCIÓN

### Vocabulario real de cada plataforma

| Plataforma | Unidad de catálogo | Instancia programada | Inscripción | Registro histórico |
|---|---|---|---|---|
| SAP SuccessFactors Learning | Item (unidad asignable mínima) | Scheduled Offering (clase con fechas/instructor) | Enrollment / Registration | Learning History record |
| Cornerstone OnDemand | Learning Object (LO) | Event → Session | Registration / Transcript entry | Transcript |
| Workday Learning | Course | Course Offering | Enrollment | Learning record |
| Docebo | Course | Session (ILT) con Events | Enrollment | Enrollment archivada |
| Absorb | Course | Session (ILT) | Enrollment | Enrollment + Course Version |
| TalentLMS | Course | ILT Session | Enrollment | Progress record |
| Moodle | Course (el curso ES la ejecución) | Cohort/grupos; NO separa | Enrolment | Grade history |
| Open edX | Course | Course Run (re-run copia contenido, nunca datos de alumnos) | CourseEnrollment | Persistent grades |

### El estándar de la industria: CUATRO capas

1. **Curso** (catálogo): definición abstracta — código, título, tipo, competencias.
2. **Versión de curso** (contenido publicado): qué materiales y qué evaluación componen esta edición.
3. **Oferta / Sesión / Convocatoria** (ejecución): "este curso, con estas fechas, este instructor,
   este cupo". Obligatoria para presencial/virtual en vivo; para autoservicio es una "oferta
   abierta" permanente.
4. **Inscripción** (enrollment): relación persona-oferta con estado propio (inscrito, en progreso,
   aprobado, reprobado, retirado). Debajo viven los **intentos** (attempts).

Además, todos separan **Asignación** (la obligación: "debes hacer esto antes del 30/09", por regla
o por un jefe) de **Inscripción** (la participación concreta). Pueden existir una sin la otra.

**Recomendación:** cinco entidades — `course` → `course_version` → `offering` → `enrollment` →
`attempt` — más `assignment` como hermana de `enrollment`. "Convocatoria/Sesión" como rótulo de
UI; `offering` como nombre técnico.

**Advertencia:** fusionar curso y ejecución (error de Moodle) obliga a clonar el curso por cada
cohorte y fragmenta los reportes históricos. Fusionar asignación con inscripción impide
representar "obligado pero aún no inscrito" — el estado que más importa en cumplimiento.

## 2. Versionado de contenido

- Absorb "Course Versioning": versión nueva es operación deliberada que NO altera inscripciones
  existentes; los completados conservan estado y registro.
- Docebo archiva la finalización anterior al renovar.
- SuccessFactors/Cornerstone: el registro de finalización es INMUTABLE (ítem, revisión, fecha,
  nota). SF impide actualizar en sitio un SCORM publicado: obliga a re-versionar.
- Open edX: re-run = copy-on-publish del curso completo, cero datos de alumnos.

**Patrones:**
1. **Versión inmutable + copy-on-publish (el bueno):** el editor trabaja sobre borrador; "publicar"
   congela (crea versión N+1 con su árbol de actividades y su versión de examen). Las versiones
   publicadas nunca se editan. Las inscripciones apuntan a la versión con la que arrancaron.
2. **Snapshot en el registro** (complemento): al aprobar, el registro copia por VALOR lo esencial
   (título, versión, nota, nota mínima exigida, checksum del contenido).
3. **Política de migración explícita al publicar:** completados → intactos (siempre); en progreso →
   terminar en la vieja o reiniciar en la nueva; no iniciados → mover a la nueva.

**Advertencia:** con contenido mutable "en vivo" no se puede responder "¿qué examen presentó esta
persona en marzo de 2024?"; y cambiar la nota mínima reprueba retroactivamente. La "solución" de
Moodle (borrar intentos para poder editar) es inaceptable en formación de cumplimiento.

## 3. Asignación por regla (dynamic audiences / smart groups)

- **SuccessFactors — Assignment Profiles** (el patrón más maduro): reglas sobre atributos del
  empleado que actúan como un where clause; se ejecutan periódicamente y ante cambios de datos
  maestros. Al desactivar: retirar asignaciones pendientes SIN tocar jamás lo completado.
- **Docebo:** grupos automáticos (membresía dinámica por condiciones de perfil) + enrollment rules
  (grupo → cursos). El evento "entró al grupo" dispara la inscripción.

**Semántica clave:**
1. La membresía es DERIVADA, no editada: un job (evento + barrido nocturno) recalcula la
   proyección `audience_member`.
2. Entra alguien nuevo: asignación con fecha límite calculada desde SU fecha de entrada a la
   audiencia (no desde la creación de la regla).
3. Sale del grupo: la asignación pendiente se marca "retirada por salida de audiencia" (no se
   borra); el historial completado jamás se toca. Nunca DELETE: cambio de estado.
4. Estática vs dinámica: la estática congela la foto; la dinámica es suscripción viva. Ambas
   producen la misma fila `assignment` con `source = MANUAL | RULE | STATIC_SNAPSHOT` + `rule_id`.

**Advertencia:** audiencia como consulta en vivo (sin proyección con historia joined_at/left_at)
hace irreproducible el cumplimiento histórico ("¿por qué tenía asignado esto en junio?"). Borrar
la asignación al salir de la audiencia destruye evidencia = hallazgo de auditoría en SST.

## 4. Recurrencia y recertificación

- **SF — Curricula con Retraining:** "initial period" (primera vez) + "retraining period"
  (siguientes: N días/meses/años desde la finalización, O fecha fija anual — "todo vence el 31 de
  enero"). El estado por usuario se CALCULA.
- **Docebo — Certifications & Retraining:** la certificación es entidad propia con vigencia; al
  acercarse el vencimiento se habilita la renovación, que ARCHIVA la finalización anterior; el
  curso de renovación puede ser distinto al inicial.

**Piezas del modelo:**
1. `Requirement/Certification` (definición): qué la otorga, vigencia (validity_months o fecha fija
   anual), ventana de renovación (p. ej. desde 60 días antes), política de gracia.
2. `Grant` por persona (instancia): granted_at, valid_until, status. Cada renovación = fila NUEVA
   (historial de rondas); la anterior pasa a superseded.
3. Estados CALCULADOS (vigente / por vencer / vencido) desde valid_until vs hoy; materializables
   para filtros, pero la fórmula es la fuente.
4. Disparo de siguiente ronda: worker detecta ventana de renovación → crea nueva assignment con
   due = valid_until; avisos a 60/30/7 días. Si la persona salió de la audiencia, no se dispara.
5. "Reinducción cada 12 meses" sin certificado = el mismo motor con recurrencia en la
   assignment_rule (recurring assignment), sin credencial.

**Advertencia:** "estado = vigente" como campo actualizado por cron en una sola fila pierde el
historial de rondas. "¿Estaba certificado cuando ocurrió el accidente del 12 de mayo?" es LA
pregunta legal, y exige filas por ronda con rangos de vigencia.

## 5. Rutas de aprendizaje (Learning Path / Curriculum / Program)

- La ruta es un contenedor ordenado de ítems (cursos, exámenes, otras rutas) en secciones/pasos.
- Prerrequisitos por ítem: "requiere A y B" o "K de N" (Docebo soporta electivas y "unlock
  interval"). El "siguiente" se resuelve por prerrequisitos satisfechos, no por orden visual.
- Finalización calculada: % de ítems obligatorios; ítems opcionales/electivas ("2 de estos 5").
- Crédito previo: si ya aprobó el curso C por otra vía, la ruta lo reconoce (equivalencia por
  curso, no por inscripción).

**Recomendación:** `learning_path` → `path_section` → `path_item` (is_required,
min_required_in_section, prerequisite_item_ids). Estado por persona recalculado por evento de
finalización. Fase 1: secuencia lineal; DAG schema-ready sin UI.

**Advertencia:** desbloqueo solo en frontend = se salta por API; el guard va en servidor.
Finalización de ruta como flag escrito una vez = rutas "completas" con hijos vencidos.

## 6. Evaluaciones (referencia: Moodle Quiz + Question Bank)

- **Banco de preguntas** independiente del examen, en categorías/pools jerárquicos y etiquetas.
  La pregunta SE VERSIONA.
- Tipos: opción única, múltiple, V/F, emparejamiento, respuesta corta, numérica, ensayo (manual),
  completar espacios. Fase 1 corporativa: única, múltiple, V/F, ensayo/evidencia manual.
- Selección aleatoria: "toma N al azar de la categoría X"; cada intento MATERIALIZA su selección.
- Barajado de preguntas y de opciones, por intento.
- Intentos: máximo, tiempo límite. Política de calificación multi-intento: más alta | promedio |
  primero | último (la más alta es el default corporativo).
- Retroalimentación en tres niveles (opción, pregunta, global por rango) + política de revisión
  (qué ve el alumno y cuándo — crítico si el banco se reutiliza).
- Calificación manual: intento en "pendiente de calificación"; se guarda quién y cuándo calificó.
- El intento guarda SNAPSHOT completo: qué preguntas cayeron, en qué orden, qué opciones en qué
  orden, qué respondió, puntaje por pregunta. Referencia a la VERSIÓN de la pregunta, nunca a la viva.

**Advertencia:** sin selección materializada por intento no se puede recalificar tras detectar una
pregunta defectuosa ("anular la pregunta 7 y recalificar todos los intentos") ni defender una
impugnación.

## 7. Estándares e-learning

| Estándar | Qué resuelve | Costo real | ¿Fase 1 en 2026? |
|---|---|---|---|
| SCORM 1.2 | Paquetes de Articulate/Captivate/iSpring reportan estado, nota, tiempo | Runtime mínimo (manifest + API adapter + cmi.core + suspend_data): 3-6 semanas para "1.2 suficientemente conformante". Trampas: suspend_data gigantes, paquetes mal formados, commit-flood | SÍ, pero solo 1.2 single-SCO, con librería (p. ej. scorm-again) o motor de terceros |
| SCORM 2004 | Secuenciación/navegación | La secuenciación son meses; la mayoría del contenido real no la usa. Rustici estima 5+ años-dev para soporte completo | NO propio. Aceptar 2004 tratado como single-SCO sin sequencing |
| xAPI (Tin Can) | Statements actor-verbo-objeto a un LRS; analítica multi-fuente | Un LRS conformante es un proyecto en sí | NO. Dejar la costura: tabla de eventos propia exportable a statements |
| cmi5 | "El SCORM moderno" (xAPI + lanzamiento definido) | Requiere LRS; adopción de contenido minoritaria en 2026 | NO. Reevaluar Fase 2-3 |
| LTI 1.3 | Lanzar herramientas externas con SSO y retorno de nota | 4-8 semanas como Platform | Solo con caso de uso concreto; raro en corporativo pequeño |
| Common Cartridge | Intercambio académico de cursos | Medio | NO. Irrelevante |

Síntesis: para registro auditable de finalización, SCORM 1.2 da el 80-90% del valor con una
fracción del costo. Presupuestar banco de pruebas con paquetes reales (Rise, Storyline, iSpring)
antes de dar por hecho "soportamos SCORM".

## 8. Certificados

1. **El certificado es un registro, no un PDF.** La fila guarda: a quién, qué (curso/ruta +
   versión), nota, emisión, vigencia, plantilla usada, número. El PDF se renderiza una vez y se
   guarda como artefacto INMUTABLE (no se re-renderiza si la plantilla cambia).
2. Numeración: serie por tenant/año (`CERT-2026-000123`) con contador transaccional FOR UPDATE.
3. **Código de verificación público aleatorio NO adivinable** (nunca el consecutivo: enumera la
   base). URL pública `verify.../c/{codigo}`: válido/revocado/vencido + datos mínimos (Habeas Data).
4. QR en el PDF apuntando a esa URL.
5. Vencimiento y REVOCACIÓN (revoked_at + reason): la página pública refleja el estado actual
   aunque el PDF viva para siempre.
6. Plantilla por tenant: HTML con placeholders, logo, colores, 1-2 firmantes (imagen + nombre +
   cargo), versionada; el certificado registra qué versión usó. Render HTML→PDF (Playwright).

## 9. Multi-tenancy en PostgreSQL

Consenso 2026: **base compartida + tenant_id + RLS** es el default para SaaS B2B. Filtro en el ORM
(Prisma Client Extension) + RLS como red de seguridad (`SET LOCAL app.tenant_id`). Esquema por
tenant: N migraciones coordinadas, Prisma lo soporta mal. Base por tenant: solo como SKU
enterprise del MISMO código. Los LMS SaaS comparables (TalentLMS, Docebo, Absorb) corren pool
compartido con aislamiento lógico. Coincide con la decisión ya validada en SAC-NEO (AR-01/#37).

**Advertencia:** posponer RLS "hasta el segundo cliente" es la trampa conocida; una fuga
cross-tenant en un LMS (historiales laborales, evaluaciones) es catastrófica.

## 10. Parametrización por tenant

1. **Tablas de catálogo por tenant** (el caballo de batalla): tipos de actividad, estados, cargos,
   sedes = filas con tenant_id, code, name, is_system, active, display_order. Seed crea los del
   sistema (no borrables); el admin agrega los suyos por UI. FK + snapshot de etiqueta en
   históricos. Para TODO lo que se lista/filtra/reporta.
2. **Settings JSONB del tenant** (validado con Zod versionado): escalares y flags — nota mínima
   default, intentos default, rótulos de UI, toggles de módulos.
3. **Cascada de resolución** para valores tipo nota mínima: default plataforma → override tenant →
   override curso → SNAPSHOT en la versión publicada (la que rige el intento). Cambiar el setting
   no reinterpreta exámenes rendidos.
4. **Campos dinámicos:** tabla de definiciones + valores JSONB en la entidad (90% del beneficio
   del EAV sin su costo).
5. **EAV puro: evitar.** El JSONB indexable de Postgres lo dejó obsoleto.

Nunca `if (tenant === 'X')` en código: toda diferencia entre clientes es dato.

**Advertencia simétrica:** hardcodear el catálogo = deploy por cliente nuevo; meter TODO en JSONB
(estados y tipos que participan en joins) = sin integridad referencial ni validación de
transiciones. Estados y tipos van en tablas, siempre.

---

## MODELO DE DATOS SUGERIDO (42 tablas)

Convenciones: `tenant_id NOT NULL` en toda tabla de datos (RLS), `id UUID PK`, `created_at`;
mutables agregan `version INT` + `updated_at` + `updated_by`; todo `code` es
`UNIQUE(tenant_id, code)`; bajas lógicas; históricos inmutables (solo INSERT).

**Núcleo tenant y personas**
1. `tenants` — id, name, slug, timezone, plan, settings JSONB, active
2. `users` — tenant_id, email, password_hash, full_name, document_number, job_title_id, org_unit_id, location_id, hired_at, role_id, active, profile_extra JSONB
3. `org_units` — tenant_id, parent_id (árbol), name, code, active
4. `job_titles` — tenant_id, name, code, active
5. `locations` — tenant_id, name, code, active (regionales/sedes)
6-9. `roles` / `permissions` / `role_permissions` / `user_permission_overrides` — RBAC + overrides

**Catálogo y versionado**
10. `courses` — tenant_id, code, title, description, course_type_id, modality (SELF_PACED|ILT|VIRTUAL|BLENDED), owner_org_unit_id, tags, active, current_version_id
11. `course_types` — tenant_id, name, code, is_system, active (tipo de actividad configurable)
12. `course_versions` — course_id, version_number, status (DRAFT|PUBLISHED|RETIRED), published_at/by, passing_score, completion_criteria JSONB, migration_policy — INMUTABLE al publicar
13. `course_activities` — course_version_id, type (VIDEO|DOCUMENT|SCORM|ASSESSMENT|ASSIGNMENT_UPLOAD|LIVE_SESSION|LINK), title, display_order, is_required, config JSONB, content_package_id, assessment_id
14. `content_packages` — tenant_id, kind (SCORM_12|SCORM_2004|FILE|VIDEO), storage_key, manifest JSONB, size, checksum — inmutable; re-subir = paquete nuevo

**Ejecución**
15. `offerings` — tenant_id, course_version_id, code, kind (OPEN|COHORT|ILT_SESSION), starts_at, ends_at, capacity, instructor_user_id, location_id, meeting_url, status
16. `enrollments` — tenant_id, offering_id, course_version_id (snapshot), user_id, assignment_id NULL, status (ENROLLED|IN_PROGRESS|PASSED|FAILED|WITHDRAWN|EXPIRED), enrolled_at, started_at, completed_at, final_score, score_snapshot JSONB (por VALOR), UNIQUE(offering_id, user_id)
17. `activity_progress` — enrollment_id, course_activity_id, status, score, time_spent_s, first_at, last_at, data JSONB (suspend_data SCORM)
18. `learning_events` — tenant_id, user_id, enrollment_id, verb (LAUNCHED|PROGRESSED|COMPLETED|PASSED|FAILED...), object_type/id, result JSONB, occurred_at — append-only; costura xAPI

**Asignación por regla**
19. `audiences` — tenant_id, name, rule JSONB (condiciones evaluables en SQL), is_dynamic, active
20. `audience_members` — audience_id, user_id, joined_at, left_at NULL — proyección materializada, nunca DELETE
21. `assignment_rules` — tenant_id, audience_id, target_type (COURSE|PATH|CERTIFICATION), target_id, due_days_after_join, recurrence JSONB (cada N meses | fecha fija anual), active
22. `assignments` — tenant_id, user_id, target_type/id, source (MANUAL|RULE|STATIC_SNAPSHOT), rule_id NULL, assigned_by NULL, due_at, status (PENDING|IN_PROGRESS|COMPLETED|WITHDRAWN_LEFT_AUDIENCE|WAIVED), cycle_number, completed_enrollment_id NULL

**Rutas**
23. `learning_paths` — tenant_id, code, title, status, current_version (versionadas como cursos)
24. `path_items` — path_id, section_name, item_type (COURSE|PATH), item_id, display_order, is_required, min_required_in_section NULL, prerequisite_item_ids UUID[]
25. `path_enrollments` — path_id, user_id, status, progress_pct, completed_at

**Evaluaciones**
26. `question_banks` — tenant_id, name
27. `question_categories` — bank_id, parent_id, name
28. `questions` — category_id, current_version_id, active
29. `question_versions` — question_id, version_number, qtype (SINGLE|MULTI|TRUE_FALSE|ESSAY|FILL_IN), stem, options JSONB, correct JSONB, feedback JSONB, points — INMUTABLE
30. `assessments` — tenant_id, title
31. `assessment_versions` — assessment_id, version_number, time_limit_min, max_attempts, grading_policy (HIGHEST|LAST|FIRST|AVERAGE), passing_score, shuffle_questions, shuffle_options, review_policy JSONB, status
32. `assessment_sections` — assessment_version_id, mode (FIXED|RANDOM_FROM_POOL), category_id NULL, pick_count NULL, fixed_question_version_ids UUID[]
33. `attempts` — enrollment_id, assessment_version_id, user_id, attempt_number, status (IN_PROGRESS|SUBMITTED|GRADED|PENDING_MANUAL), started_at, submitted_at, score, passed
34. `attempt_questions` — attempt_id, question_version_id (snapshot de lo servido), display_order, options_order JSONB, points_possible, points_awarded, graded_by NULL, graded_at NULL, answer JSONB

**Certificación y certificados**
35. `certifications` — tenant_id, name, code, awarded_by_target (course/path), renewal_target NULL, validity_months NULL, fixed_expiry_rule JSONB NULL, renewal_window_days, active
36. `certification_grants` — certification_id, user_id, cycle_number, granted_at, valid_until, status (ACTIVE|EXPIRING|EXPIRED|SUPERSEDED|REVOKED), source_enrollment_id — una fila por ronda, inmutable
37. `certificate_templates` — tenant_id, name, version, html_template, signers JSONB, active
38. `certificates` — tenant_id, user_id, grant_id/enrollment_id, serial_number (serie tenant/año), verification_code (aleatorio UNIQUE indexado), template_id + template_version, render_snapshot JSONB, pdf_storage_key, issued_at, valid_until, revoked_at NULL, revoked_reason
39. `sequence_counters` — tenant_id, entity_type, year, last_value (PK compuesta, FOR UPDATE)

**Transversales**
40. `audit_logs` — tenant_id, user_id, action, resource_type/id, old/new_values JSONB — inmutable
41. `notifications` — outbox: PENDING en la misma transacción
42. `notification_templates` — por tenant, Handlebars

Relaciones clave: `enrollment` congela `course_version_id`; `attempt_questions` congela
`question_version_id`; `certificates` congela el render; `audience_members` y
`certification_grants` guardan historia por rangos, nunca sobreescriben. Las cuatro preguntas
letales de auditoría — qué vio, qué respondió, qué se le exigió, si estaba vigente en una fecha —
se responden con un SELECT.

---

## Fuentes principales

- SAP Help: Assignment Profiles, Deactivate and Unassign, Retraining in Curricula, Annual retraining fixed date, KBA 2485268, KBA 2747663
- Cornerstone: Learning Object API (csod.dev), LMS Hierarchy
- Workday: Learning Terminology
- Open edX: Re-running a Course
- Docebo: Groups, Enrollment rules, Learning plans, Certifications and retraining, Certificates, Versioning best practices
- Absorb: Course Versioning
- Moodle: Building Quiz, Question bank, Quiz grading methods, Restrict access
- Estándares: Rustici Engine, LMSPedia SCORM vs xAPI, Forasoft, iCAN, Blackboard LTI 1.3, 1EdTech
- Certificados: Accredible, Sertifier, Certify.one
- Multi-tenancy: Nile RLS, AWS Database Blog RLS, Propelius, Ensolvers, WorkOS
(URLs completas en el transcript de investigación de la sesión 2026-08-25.)
