# NEO PULSE — Plataforma SaaS de Formación Corporativa (LMS Multi-tenant)
**Desarrollado por:** NEO IO | **Cliente piloto:** TRANSPRENSA | **Versión:** 1.0 (Documento maestro inicial)

---

> ## FUENTES DE ESTE DOCUMENTO — NO BORRAR ENTRE SESIONES
>
> ### Cómo mantener todo esto
> - `docs/COMO-DOCUMENTAR.md` — **la regla vinculante**: qué documento se actualiza ante cada
>   tipo de cambio. Se documenta por CONCEPTO de negocio, no por módulo. Consúltala antes de
>   cerrar cualquier cambio.
>
> ### Documentación viva (se corrige; NO envejece con los sprints)
> - `docs/glosario.md` — **EL diccionario del dominio.** Qué es una actividad formativa, una
>   convocatoria, una asignación, el plan y sus métricas. Léelo ANTES de discutir cualquier
>   funcionalidad: si dos personas usan la misma palabra distinto, el sistema sale mal.
> - `docs/arquitectura.md` — cómo está construido HOY: aislamiento entre empresas, las tres
>   reglas de inmutabilidad, dónde vive cada cosa, seguridad, calidad y deuda técnica.
>
> ### Por decidir
> - `docs/ideas-producto.md` — ideas de producto NO comprometidas, con veredicto honesto de cada
>   una (incluido "no lo haría" y por qué). Consúltalo antes de proponer funcionalidad nueva:
>   varias ya están modeladas sin construir, y otras están descartadas con razón.
>
> ### Histórico
> - `docs/HANDOFF.md` — **DIARIO DE SESIONES.** En qué iba esto, qué quedó a medias y con qué
>   continuar. Se anexa por arriba (lo más reciente primero). Léelo al empezar una sesión.
> - `docs/sprints/` — BITÁCORA por sprint: qué se construyó, por qué, cómo se
>   verificó y qué quedó pendiente. Es historia: envejece a propósito.
> - `docs/00-brief-crudo.md` — transcripción LITERAL de lo que dictó el cliente. Solo se ANEXA.
> - `docs/01-decisiones-preliminares.md` — acta de decisiones de la sesión de descubrimiento.
> - `docs/research/02-microlearning-y-tendencias.md` — investigación de producto (microlearning,
>   editor de tarjetas, gamificación, PWA, IA) con fuentes.
> - `docs/research/03-modelado-dominio-lms.md` — cómo modelan el dominio SAP SuccessFactors,
>   Docebo, Cornerstone, Absorb, Moodle, Open edX; 42 tablas de referencia.
> - `docs/research/04-normativa-colombiana.md` — qué exige la norma colombiana (SST, PESV,
>   SARLAFT, BASC, ISO, BPM, Habeas Data, firma electrónica) al registro de capacitación.
>
> Este CLAUDE.md es la síntesis gobernante. Ante conflicto, rige este documento; ante duda de
> POR QUÉ se decidió algo, consultar las fuentes de arriba.
>
> Proyecto INDEPENDIENTE de SAC-NEO (repo, despliegue y ciclo de vida propios). Comparte
> filosofía, stack y convenciones, no código.
>
> ANTES de tocar Docker o puertos: `docs/02-aislamiento-proyectos.md` — tabla de recursos
> reservados por proyecto (compose `name:`, contenedores, volúmenes, puertos, roles de DB) para
> que SAC-NEO y NEO PULSE nunca se pisen en la máquina de desarrollo.

---

## 0. Estado del Proyecto

**Fase actual:** Construcción. Sprints 0 a 4 terminados; entre el 4 y el 5 se están cerrando
huecos del contenido y la entrega (medios por URL firmada, medición de YouTube, actualizar una
convocatoria a la versión nueva, presentaciones convertidas a diapositivas). Ver `docs/HANDOFF.md`.

**Completado:**
- [x] Brief del cliente capturado (3 bloques)
- [x] Investigación de producto, dominio y normativa (3 informes con fuentes)
- [x] Modelo conceptual del dominio adoptado y ratificado por el cliente
- [x] Decisiones estructurales confirmadas (este documento, secciones 2 y 10)
- [x] Documento maestro v1.0
- [x] Decisiones #31-#34 cerradas (nombres, subdominio por tenant, cargo único, español único)
- [x] **Sprint 0** — fundaciones: monorepo, schema (58 modelos), RLS verificado, auth por subdominio
- [x] **Sprint 1** — administración: catálogos, personas + carga masiva, aprobaciones, notificaciones,
      sistema de diseño Pulso (`.claude/skills/pulse-ui`)
- [x] **Sprint 2** — catálogo formativo: versionado copy-on-publish inmutable, lecciones en tarjetas
      con editor y vista previa móvil, banco de preguntas versionado, constructor de exámenes,
      almacenamiento con validación por firma binaria. Infraestructura de producción decidida
      (`docs/03-infraestructura-produccion.md`)
- [x] **Sprint 3** — entrega de la formación: audiencias dinámicas con historia, requisitos y motor
      de obligaciones por rondas (ON_HIRE previo al ingreso, recurrencia, vencidas, retiro al salir
      de la audiencia), matriz cargo × actividad, convocatorias con proyectados derivados y
      congelados, y plan anual con cumplimiento y cobertura aislados (`docs/sprints/03-*.md`)
- [x] **Sprint 4** — experiencia del aprendiz: superficie propia móvil-first (grupo `(learner)`),
      reproductor de tarjetas a pantalla completa con telemetría tolerante a señal intermitente,
      exámenes con intentos y bloqueo, repetición espaciada + sesión de repaso diaria, racha
      privada y puntos, PWA instalable con service worker propio (cache + cola de reenvío en
      IndexedDB), cadencia de píldoras con tope semanal, y cierre del ciclo ejecución → obligación
      → cobertura del plan (`docs/sprints/04-*.md`)
- [x] **Entre el 4 y el 5** — archivos servidos por URL firmada, medición real de los videos de
      YouTube, la convocatoria puede apuntar a la versión vigente, la **presentación** como tipo
      de contenido propio, y el **reproductor con chrome propio** (carril plegable, índice de la
      formación e información de la pieza). Decisiones #43 a #51; diario en `docs/HANDOFF.md`

**Pendiente de confirmar con el cliente:**
- [ ] Validar con Transprensa: contenido exacto de la constancia/certificado y firmantes
- [ ] Confirmar si Transprensa compra contenido SCORM hoy (decide si el runtime entra en F2)
- [ ] Confirmar umbral SARLAFT aplicable (Res. 4607/2026) contra la Circular Única
- [ ] Event Storming + PRD + OpenAPI + ADRs formales (mismo pipeline SDD de SAC-NEO)

---

## 1. Visión del Producto

Plataforma SaaS multi-tenant de formación corporativa que centraliza y digitaliza inducciones,
reinducciones, plan anual de capacitación, capacitaciones extraordinarias y microlearning
(píldoras), con evaluaciones, encuestas, certificados verificables, reportes de cumplimiento y
evidencia que resiste auditoría (SG-SST, PESV, BASC, SARLAFT, BPM, ISO).

**Dos experiencias, un motor:**
- **Administración (escritorio):** catálogo formativo, plan anual, convocatorias, asignaciones
  por regla, banco de preguntas, certificados, reportes e indicadores de cumplimiento.
- **Usuario final (móvil primero):** PWA instalable; lecciones en tarjetas tipo stories de 3-7
  minutos; repetición espaciada de lo que falló; racha personal privada; sus pendientes,
  vencimientos y certificados. Funciona con cobertura intermitente (conductores en carretera).

**Principios de producto (derivados de la investigación):**
1. La unidad de contenido es la TARJETA; una lección es una pila de 5-15 tarjetas. No existe
   "subir un curso": existe crear una lección.
2. Un PDF nunca es una lección. Es fuente para generar tarjetas (IA + revisión humana) o
   material de consulta adjunto.
3. La completitud NO es la métrica: se mide conocimiento por tema/área, retención a 7/30 días y
   tiempo-en-pieza (con detección de "click siguiente" anómalo).
4. Todo registro de formación es EVIDENCIA legal: inmutable, versionado, firmado
   electrónicamente, retenido 20 años tras el retiro (SST) y exportable para el auditor.
5. Nada hardcodeado por cliente: toda diferencia entre tenants es dato (catálogos, settings,
   rótulos, branding), nunca `if (tenant === 'X')`.

**Usuarios del sistema:**

| Rol | Función |
|---|---|
| **Superadmin** (NEO IO) | Operación de la plataforma: tenants, planes, soporte. No ve datos de negocio salvo soporte autorizado |
| **Admin** | Control total del tenant: configuración, catálogos, usuarios, todo el contenido y reportes |
| **Analista** | Gestiona la formación de SU área/proceso. Sus cambios sobre contenido publicado requieren aprobación del Admin con justificación (flujo de aprobaciones + notificaciones) |
| **Instructor** | Dicta convocatorias: toma asistencia, firma actas, califica preguntas manuales de sus sesiones (es un permiso, no exige rol aparte) |
| **Usuario final** | Consulta y realiza lo asignado: inducciones, capacitaciones, píldoras; ve sus certificados y vencimientos |

---

## 2. Modelo Conceptual del Dominio (LA decisión estructural)

Cinco capas + dos entidades transversales. Cada capa responde UNA pregunta distinta. Este es el
patrón de SAP SuccessFactors / Docebo / Cornerstone, ratificado por el cliente.

```
ACTIVIDAD FORMATIVA (activities)          ¿QUÉ se aprende?
  Catálogo reutilizable por años. Tipo parametrizable por tenant.
  │
  └── VERSIÓN (activity_versions)         ¿Qué vio EXACTAMENTE la persona?
      Contenido + evaluación congelados al publicar (copy-on-publish, INMUTABLE).
      │
      └── CONVOCATORIA (offerings)        ¿CUÁNDO, dónde, cómo, con quién?
          Evento con fecha/instructor/lugar/proyectados, o permanente (autoservicio),
          o híbrida (ambas condiciones).
          │
          ├── ASIGNACIÓN (assignments)    ¿QUIÉN tiene la OBLIGACIÓN y por qué regla?
          │   Existe sin participación. Estado clave: "obligado sin inscribir".
          │   Fuentes: manual | regla de audiencia | plan | requisito recurrente.
          │
          └── EJECUCIÓN (enrollments)     ¿Qué OCURRIÓ con Usuario 1 en esa convocatoria?
              inscrito → asistió → progresó → terminó → aprobó/reprobó. Nota final.
              │
              └── INTENTOS (attempts)     ¿Qué ocurrió en CADA evaluación?
                  Qué preguntas cayeron, en qué orden, qué respondió, qué sacó.

PLAN DE CAPACITACIÓN (training_plans)     ¿Qué se PLANEÓ para el año?
  Entidad empresarial PROPIA (no un tipo de actividad). Sus renglones REFERENCIAN
  convocatorias planificadas; el plan no posee la actividad.

REQUISITO RECURRENTE (assignment_rules)   ¿Qué obligación está VIGENTE en el tiempo?
  "Reinducción cada 12 meses", "todo ingreso hace la inducción general", "el carné de
  manipulación vence al año". Un motor las evalúa y GENERA asignaciones.
```

### Reglas de oro del modelo (irrompibles)

1. **Asignación ≠ Inscripción.** Se enlazan (`assignment.completed_enrollment_id`) cuando la
   ejecución satisface la obligación; jamás se fusionan.
2. **Métricas del plan CONGELADAS.** Se calculan exclusivamente de ejecuciones nacidas del plan
   (`assignment.source = PLAN`). El que ingresó en agosto no hace la convocatoria de marzo ni
   aparece como incumplido del plan: su formación nace de la regla de ingreso (asignación
   individual, medida aparte). Capacitaciones extraordinarias y píldoras tampoco tocan el plan.
3. **Proyectados se DERIVA y se congela.** Al publicar la convocatoria, el sistema calcula los
   proyectados desde la regla de asignación (cargos/áreas/regionales destino) y los congela.
   Ajuste manual solo con justificación auditada.
4. **Versiones publicadas son INMUTABLES.** Editar = nueva versión (borrador → publicar). La
   ejecución histórica apunta a la versión que la persona realmente cursó. Política de migración
   al publicar: completados intactos (siempre); en progreso terminan en la vieja o reinician en
   la nueva; no iniciados pasan a la nueva (configurable).
5. **Historia, nunca borrado.** `audience_members` guarda joined_at/left_at; las asignaciones
   retiradas se marcan (WITHDRAWN_LEFT_AUDIENCE), no se borran; las concesiones de certificación
   son una fila por ronda. Las cuatro preguntas letales de auditoría — qué vio, qué respondió,
   qué se le exigía y si estaba vigente en una fecha — se responden con un SELECT.
6. **El motor es COMÚN a todos los tipos.** Inducción general, específica, reinducción,
   capacitación del plan, extraordinaria y píldora comparten contenido, progreso, evaluación,
   encuesta, certificado y auditoría. Lo que cambia por tipo es configuración.

### Tipos de actividad (parametrizables por tenant, tabla `activity_types`)

Seed Transprensa (otro tenant crea los suyos sin código):

| Código | Rótulo UI | Comportamiento configurado |
|---|---|---|
| INDUCCION_GENERAL | Inducción general | Obligatoria a todo ingreso, previa al inicio de labores (D1072), autoservicio |
| INDUCCION_ESPECIFICA | Inducción específica | Asignada por CARGO (matriz cargo → actividades) |
| REINDUCCION | Reinducción | Recurrente (cada N meses, parametrizable) |
| PLAN | Capacitación del plan | Solo vive dentro de un plan anual; métricas de plan |
| EXTRA | Capacitación extraordinaria | Fuera del plan; asignable a usuario/cargo/área/regional; métricas propias |
| MICROLEARNING | Píldora | 3-7 min, tarjetas, alimenta el motor de repetición espaciada |

Cada tipo configura: icono/color, obligatoriedad, forma de asignación por defecto, si genera
certificado, si exige evaluación y/o encuesta, recurrencia por defecto, si participa del plan.

---

## 3. Reglas de Negocio Fundamentales

### 3.1 Multi-tenant y parametrización total

```
Todo por tenant, configurable desde UI, sin deploy:
  - Identidad: nombre, NIT, logo, colores (tema de marca), textos institucionales.
  - Reglas de negocio: nota mínima de aprobación (Transprensa: 90%), intentos máximos por
    defecto, espera entre intentos, vigencias, cadencia de píldoras, tope de notificaciones.
  - Rótulos de UI: fijos en español en F1 ("Actividad formativa", "Convocatoria", "Plan de
    capacitación"); el rótulo por tenant queda previsto en settings SIN UI (Decisión #31).
  - Catálogos propios (3.2). Plantillas de certificado propias. Templates de notificación.
Resolución en cascada con snapshot: default plataforma → override tenant → override actividad →
SNAPSHOT en la versión publicada. Cambiar el setting NO reinterpreta exámenes ya rendidos.
```

### 3.2 Catálogos por tenant (todos CRUD desde UI, `UNIQUE(tenant_id, code)`)

**Área vs. Proceso** (Decisión #57), porque se parecen y no son lo mismo:

| | Área | Proceso |
|---|---|---|
| Responde | ¿Dónde trabaja esta PERSONA? | ¿De qué trata esta CAPACITACIÓN? |
| Cuelga de | `users.area_id` | `activities.process_id` |
| Ejemplo | Logística, Comercial, SGI | SST, PESV, SARLAFT, BASC |
| Anida | sí (`areas.parent_id`) | vía su área (`processes.area_id`) |

Un proceso pertenece a un área: SARLAFT y SST cuelgan de SGI y siguen teniendo responsables
distintos. Por eso el alcance sobre un ÁREA alcanza todos sus procesos (la jefatura de SGI ve cómo
va todo lo suyo) y el alcance sobre un PROCESO alcanza solo ese (el de SARLAFT no ve SST).

```
areas          Unidad organizacional de PERSONAS (Logística, Comercial, Gestión Humana...).
processes      Sistema de gestión / proceso que ORIGINA la formación. Seed Transprensa:
               SGI | LOGISTICA | SST | PESV | SEGURIDAD | GESTION HUMANA | SAC | COMERCIAL |
               CONTABILIDAD | CONTROL INTERNO | SARLAFT | COMPRAS | EXCELENCIA DEL SERVICIO.
               Cada proceso tiene responsable (jefe) y área a cargo. PERSONA pertenece a ÁREA;
               ACTIVIDAD pertenece a PROCESO. Son catálogos DISTINTOS.
job_titles     Cargos (Conductor, Auxiliar de bodega, Analista SST...).
job_title_types Tipos de cargo (Administrativo, Operativo, Comercial...).
services       Servicios del negocio (Almacenamiento, Masivo, Paqueteo).
regionals      Regionales/sedes.
norms          Normas aplicables (BASC, Res. 2674/2013 BPM-HACCP, Trinorma, RES-PESV, N/A).
               Una actividad puede tributar a VARIAS normas (activity_norms N:M).
activity_types Tipos de actividad formativa (sección 2).
executed_by    Ejecutada por: PROPIOS | TEMPORALES | ARL | EPS | OTROS (+ texto libre si OTROS).
```

### 3.3 Usuarios y acceso

```
IDENTIDAD Y LOGIN
  - Login por CÉDULA o correo, indistinto. La cédula es la llave estable; el correo (personal al
    inicio, corporativo después) es canal de notificación y recuperación. Cambiarlo (admin o el
    propio usuario en su perfil) NO rompe cuenta ni histórico.
  - Alta con: nombre, tipo+número de documento, teléfono, correo (personal o corporativo),
    cargo, área, regional, FECHA DE INGRESO (hired_at — dispara inducción previa al inicio),
    forma de vinculación (DIRECTO | CONTRATISTA | TEMPORAL | EN_MISION — la inducción SST cubre
    a todos, D1072 art. 2.2.4.6.11) y actor vial opcional (PESV Paso 10).
  - Contraseña inicial generada automática segura (patrón cédula + caracteres aleatorios).
    Cambio OBLIGATORIO en primer ingreso. El admin puede forzar cambio a petición.
  - Carga masiva desde archivo (XLSX/CSV): plantilla descargable, validación por fila, reporte
    de errores, sin bloquear las filas buenas.
  - Al activar la cuenta el usuario acepta: (a) autorización de tratamiento de datos (Habeas
    Data, versión de política registrada) y (b) ACUERDO DE USO DE FIRMA ELECTRÓNICA
    (D2364/2012 art. 5) — esto blinda probatoriamente asistencias y evaluaciones.

ROLES (autorización SIEMPRE por permisos, nunca por nombre de rol en el código)
  - Superadmin: plataforma (tenants, planes). Fuera del RBAC del tenant.
  - Admin: control total del tenant.
  - Analista: gestión de formación de su(s) área(s)/proceso(s) asignados. Sus EDICIONES sobre
    contenido publicado o convocatorias generan una SOLICITUD DE APROBACIÓN al Admin con
    justificación (approval_requests + notificaciones). Crear borradores no requiere aprobación;
    publicar/modificar lo publicado sí.
  - Usuario final: realiza lo asignado, consulta su historial y certificados.
```

### 3.4 Contenido formativo

```
Una VERSIÓN de actividad se compone de ÍTEMS ordenados (activity_contents):
  LESSON     Lección de tarjetas (el formato principal; editor propio, sección 3.5)
  PRESENTATION Presentación (PDF/PPT/PPTX/ODP) CONVERTIDA a una imagen por diapositiva y
             reproducida dentro del producto: se registra qué diapositiva vio y cuánto tiempo.
             Se completa viéndolas TODAS (decisión #47)
  VIDEO      Subido (R2) o embebido YouTube/Vimeo; registra % visto; puede exigirse completo
  DOCUMENT   Material de APOYO (manual, política, instructivo) en visor, con la confirmación de
             lectura de la persona y nada más. NUNCA publicable como lección
  ASSESSMENT Evaluación (sección 3.6). Se rinde APARTE, a pantalla completa (decisión #50)
  SURVEY     Encuesta (sección 3.8)
  SCORM      Paquete de terceros — schema-ready desde F1, runtime en F2 (solo SCORM 1.2
             single-SCO, con librería tipo scorm-again; jamás SCORM como formato de autoría)
  LINK       Recurso externo
Cada ítem: is_required, display_order, config JSONB (p. ej. min_watch_pct).
Completar la actividad = criterio configurable (todos los requeridos + aprobar evaluación).
```

### 3.5 Editor de lecciones (tarjetas) y píldoras

```
Lección = pila de 5-15 tarjetas swipeables (patrón 7taps / SC Training). Editor con vista previa
de celular SIEMPRE visible. Bloques Fase 1:
  TEXTO+IMAGEN | VIDEO CORTO (tope 3 min, advertencia a los 90 s) | QUIZ (refuerzo, no nota) |
  FLIP CARD (frente/reverso) | ENCUESTA rápida | PALABRA FALTANTE (arrastrar)
Fase 2: HOTSPOT sobre imagen, EMPAREJAR. Fase 3+: role-play IA.

PÍLDORA (MICROLEARNING): actividad de tipo MICROLEARNING cuyo contenido es UNA lección de 3-7
minutos + 3-5 preguntas. Asignable a usuario/cargo/área/regional. Alimenta:
  - REPETICIÓN ESPACIADA (motor determinista 2-7-14-30 días): las preguntas falladas reingresan
    a la cola de repaso del usuario con mayor frecuencia; las dominadas salen (test out). La
    "sesión de repaso" del día se arma automáticamente (3-5 min).
  - CADENCIA gobernada por el sistema: 2-3 píldoras/semana por defecto (configurable por
    tenant); diaria solo en la primera semana de onboarding; tope duro de notificaciones.
  - RACHA personal PRIVADA (unidad = lección completada; 1-2 protectores de racha) y puntos por
    logro real. PROHIBIDO: ranking individual público, badges por login, moneda virtual.
  - F2: retos COLECTIVOS por área con metas de equipo.

IA (F1, con humano en el circuito SIEMPRE):
  - Generar borrador de tarjetas y banco de preguntas desde un documento subido (política,
    procedimiento, manual). El admin/analista edita y aprueba; NUNCA se publica sin revisión.
  - Generación de distractores plausibles para preguntas.
  - F3+: tutor conversacional (la evidencia 2026 dice que aún rinde mejor en demo que en
    producción; no antes de pilotar).
```

### 3.6 Evaluaciones

```
- BANCO DE PREGUNTAS por tenant, en categorías, con VERSIONADO de pregunta (editar = versión
  nueva; los intentos históricos referencian la versión servida).
- Tipos F1: selección única, múltiple, verdadero/falso, abierta con calificación manual.
- El examen define secciones FIJAS y/o ALEATORIAS ("toma N de la categoría X"); baraja preguntas
  y opciones POR INTENTO. Cada intento MATERIALIZA su selección (attempt_questions): permite
  recalificar si una pregunta resulta defectuosa y defender impugnaciones.
- Nota mínima: cascada tenant → actividad → snapshot en versión (Transprensa: 90%).
- INTENTOS LIMITADOS configurables (tenant/actividad) con espera opcional entre intentos.
  Política de nota con múltiples intentos: MÁS ALTA (default) | ÚLTIMO | PRIMERO | PROMEDIO.
- Al agotar intentos: la ejecución queda BLOQUEADA (estado FAILED), se notifica al analista del
  proceso y al jefe del área para refuerzo, y queda visible como no conforme en el reporte de
  cumplimiento. El refuerzo/rehabilitación es una acción explícita auditada.
- Calificación manual: intento en PENDING_MANUAL; se registra quién calificó y cuándo.
- Política de revisión configurable: qué ve el usuario tras el intento (crítico con banco
  reutilizado).
- Anti "click siguiente": tiempo mínimo por tarjeta/pregunta y detección de completitud en
  tiempo anómalo (marca para revisión, no bloquea).
```

### 3.7 Convocatorias, asistencia y firma

```
CONVOCATORIA (offering) de una versión publicada:
  - PRESENCIAL: evento con fecha, hora inicio/fin, INTENSIDAD desglosada teórica/práctica
    (exigencia PESV; suma para las 10 h/año de BPM), lugar, instructor (filtrado por usuarios
    del área del proceso), ejecutada_por, cupo, PROYECTADOS (derivados y congelados al
    publicar), observaciones.
  - VIRTUAL AUTOSERVICIO: convocatoria permanente (ventana de fechas opcional, sin asistencia
    física). Métricas: asignados → iniciaron → completaron → aprobaron.
  - HÍBRIDA: parte presencial + parte virtual; completar exige AMBAS condiciones.

ASISTENCIA presencial (evidencia de auditoría), tres mecanismos combinables por convocatoria:
  1. Lista digital del instructor: presente / ausente / justificado sobre los asignados.
  2. Código QR de sesión (rotativo, con vencimiento): el asistente lo escanea desde su celular;
     queda usuario autenticado + sello de tiempo exacto.
  3. Firma en pantalla del asistente: se captura y almacena como imagen; el sistema genera el
     ACTA de la sesión (PDF) con la lista, firmas y metadatos.
  Validez legal (Ley 527/1999 + D2364/2012): login individual + sello de tiempo + registro
  inmutable + acuerdo de firma electrónica aceptado en el alta. La firma manuscrita digitalizada
  se trata como dato biométrico (autorización explícita, Habeas Data).
  El acta física escaneada puede adjuntarse como documento complementario.
```

### 3.8 Encuestas y evaluación de eficacia (Kirkpatrick en producto)

```
Nivel 1 REACCIÓN: encuesta de satisfacción al terminar (plantillas por tenant).
Nivel 2 APRENDIZAJE: la evaluación (3.6); pre-test opcional para comparar.
Nivel 3 COMPORTAMIENTO: EVALUACIÓN DE EFICACIA DIFERIDA — a N días de completar (configurable),
  el JEFE del participante recibe un instrumento corto (¿aplica lo aprendido?); resultado
  registrado con evaluador y fecha; si es negativa dispara acción de refuerzo (asignación).
Nivel 4 RESULTADOS: vía indicadores (accidentalidad, siniestralidad) — fuera del producto F1.
Cada actividad configura: ninguna | satisfacción | eficacia | ambas.
```

### 3.9 Certificados y constancias

```
- El certificado es un REGISTRO, no un PDF: a quién, qué (actividad + versión), nota, fecha,
  vigencia, plantilla usada, número de serie. El PDF se renderiza UNA vez (HTML → PDF con
  Playwright) y se guarda como artefacto INMUTABLE en R2 (cambiar la plantilla después no
  altera lo emitido).
- Numeración por serie tenant/año: CERT-2026-000123 (sequence_counters con FOR UPDATE).
- CÓDIGO DE VERIFICACIÓN público aleatorio NO adivinable (nunca el consecutivo) + QR en el PDF
  → página pública /verificar/{codigo}: VÁLIDO | REVOCADO | VENCIDO + datos mínimos.
- REVOCACIÓN con motivo (emitido por error, fraude); la página pública refleja el estado actual.
- Plantilla por tenant: HTML con placeholders, logo, colores, 1-2 firmantes (imagen de firma +
  nombre + cargo), VERSIONADA; el certificado registra qué versión usó.
- CONTENIDO MÍNIMO (consenso de auditoría CO): identificación completa del participante (con
  cargo, área y vinculación), tema y temario (snapshot), tipo de actividad, fecha, intensidad
  horaria (teórica/práctica), modalidad, lugar, capacitador con perfil/idoneidad, resultado de
  evaluación, consecutivo, y vínculo al programa anual que la origina.
- CONSTANCIA DE SESIÓN (acta): lista de participantes con firmas y metadatos, exportable.
- Certificaciones con VIGENCIA (certifications + grants por ronda): "manipulación de alimentos
  vence al año", "reinducción cada 12 meses". Estados vigente | por vencer | vencido CALCULADOS
  de valid_until. El worker dispara la renovación (nueva asignación) al entrar en ventana, con
  avisos a 60/30/7 días al empleado y su jefe. Anclaje por finalización (+N meses) O fecha fija
  anual — ambos.
```

### 3.10 Plan de capacitación anual

```
training_plans: año, nombre, objetivo, metas, alcance, estado (BORRADOR → APROBADO → ACTIVO →
CERRADO), aprobado por/fecha. ENTIDAD EMPRESARIAL PROPIA.
plan_items: renglones que REFERENCIAN convocatorias planificadas (mes programado, proyectados
congelados). El plan no posee actividades; reprogramar o partir una convocatoria en dos sedes no
reescribe el plan.
EDICIÓN DEL PLAN VIVO (Decisión #55): en BORRADOR se agrega y se quita libremente. APROBADO/ACTIVO
admite AGREGAR jornadas con justificación (nacen obligando) y REPROGRAMAR el mes (marca
RESCHEDULED); no admite BORRAR renglones —eso es CANCELAR—. CERRADO no admite nada.
Los proyectados congelados se AJUSTAN con motivo auditado (Decisión #56), nunca en línea.
MÉTRICAS DEL PLAN (independientes por definición):
  - Cumplimiento del programa = convocatorias ejecutadas / programadas x 100.
  - Cobertura = capacitados / proyectados x 100 (por convocatoria, por proceso, por mes).
  - Congeladas frente a: ingresos tardíos, extraordinarias, píldoras, inducciones (regla de
    oro 2 de la sección 2). Es el indicador que verifica el ítem 1.2.1 de la Res. 0312.
El plan filtra por proceso/sistema de gestión: el plan SST, el plan PESV y el plan BASC son
vistas del mismo plan anual etiquetadas por proceso, exportables por separado para cada auditor.
```

### 3.11 Cumplimiento normativo (qué debe evidenciar el producto)

| Norma | Exigencia | Respuesta del producto |
|---|---|---|
| D1072/2015 art. 2.2.4.6.11 | Inducción PREVIA al inicio de labores, a todos (cualquier vinculación); reinducción periódica | `hired_at` + regla de ingreso; alerta si la inducción no está completa antes de la fecha; recurrencia de reinducción |
| D1072/2015 art. 2.2.4.6.13 | Registros de capacitación SST retenidos 20 AÑOS tras el retiro; se admite electrónico | Retención por tipo de registro con base legal; sin borrado físico; anonimización selectiva que PRESERVA el registro formativo |
| Res. 0312/2019 ítems 1.2.1-1.2.2 | Programa anual + soportes; lista de participantes de inducción/reinducción | Plan anual + indicadores ejecutadas/programadas y cobertura + actas exportables |
| PESV Res. 40595/2022 Paso 10 | Plan anual de formación por ACTOR VIAL, intensidad teórica/práctica, competencia documentada de 9 roles | Campo actor vial en usuario; intensidad desglosada; matriz de competencia cargo vs formación real |
| SARLAFT (Res. 2328/2025, 4607/2026) | Capacitación anual, constancias con asistentes/fechas/temas | Actividad recurrente anual etiquetada SARLAFT + constancias |
| BASC V6:2022 | Programa anual documentado + evaluación anual de eficacia | Plan etiquetado BASC + flujo de eficacia (3.8) |
| ISO 9001/45001/14001 cl. 7.2-7.3 | Competencia, evaluación de eficacia, información documentada | Matriz de competencia + eficacia diferida + historial por persona |
| Res. 2674/2013 art. 12 (BPM) | 10 horas/año por manipulador; plan continuo; idoneidad del capacitador | Acumulador de horas por persona/norma/año + vigencia anual del carné + perfil del capacitador adjuntable |
| Ley 1581/2012 + D1377/2013 | Autorización, política, derechos del titular, datos sensibles | Consentimiento versionado en el alta; firma digitalizada como biométrico; flujo de consultas/reclamos; contrato Responsable-Encargado |
| Ley 527/1999 + D2364/2012 | Validez de firma electrónica | Acuerdo de firma en el alta + sello de tiempo + hash + log inmutable |

### 3.12 Notificaciones

```
Fase 1: EMAIL (Resend) + in-app (WebSocket). Outbox transaccional (notifications con status
PENDING escrito en la MISMA transacción del cambio de dominio).
Eventos: asignación nueva, recordatorio de vencimiento (60/30/7 días), inducción incompleta
antes del ingreso, intentos agotados (a analista + jefe), solicitud de aprobación (a admin),
resultado de aprobación (a analista), convocatoria próxima (a proyectados e instructor),
eficacia pendiente (a jefe), certificado emitido.
Nudges de píldoras: adaptativos por comportamiento (solo a inactivos, en su franja horaria
histórica), con TOPE semanal por usuario. Jamás calendario fijo masivo.
Fase 2: WhatsApp Business (canal natural del personal operativo; la investigación LATAM muestra
completitud altísima entregando por WhatsApp).
```

---

## 4. Metodología de Desarrollo

La misma que probó SAC-NEO — **SDD + DDD-lite + Vertical Slice + ADR + API-first**:

```
SDD gobierna: especificación antes que código (este documento → Event Storming → PRD → OpenAPI → ADRs).
DDD-lite: bounded contexts = Identidad y Acceso | Catálogo Formativo | Ejecución y Asignación |
          Evaluaciones | Cumplimiento y Certificación | Plan Anual | Engagement (píldoras,
          repetición, racha) | Notificaciones | Auditoría | Plataforma (tenants).
Vertical Slice: cada caso de uso es un slice autónomo (command + handler + query + spec).
Zod = FUENTE ÚNICA de tipos (packages/shared); OpenAPI se GENERA (zod-to-openapi). Sin DTOs duplicados.
ADRs para toda decisión estructural. Conventional Commits. main siempre deployable.
```

Sin microservicios (equipo pequeño; módulos NestJS desacoplados extraíbles después). Sin Event
Sourcing (audit JSONB + learning_events dan el beneficio). Sin Clean Architecture ceremonial.

---

## 5. Stack Tecnológico

Heredado de SAC-NEO (probado en producción por este equipo), con las adiciones propias de un LMS:

### Frontend
| Tecnología | Razón |
|---|---|
| Next.js 14+ App Router | SSR, layouts, auth server-side |
| TypeScript 5+ strict | Sin `any`, end-to-end |
| TailwindCSS + shadcn/ui | Sistema de diseño; tema de marca POR TENANT (CSS variables) |
| TanStack Query 5 + Zustand | Server state + client state |
| React Hook Form + Zod | Formularios y validación compartida |
| Recharts | Dashboard de indicadores |
| **PWA (next-pwa / service worker propio)** | Instalable, offline-first: cachea lecciones asignadas, cola de sincronización de resultados al reconectar |
| **Player de tarjetas propio** | Swipe, mobile-first, telemetría de tiempo-en-tarjeta |

### Backend
| Tecnología | Razón |
|---|---|
| NestJS 10+ | DI, Guards, módulos |
| Prisma 5+ + PostgreSQL 15+ | ORM type-safe; RLS; JSONB para settings/reglas |
| Redis 7+ + BullMQ 5+ | Cache, colas: RequirementWorker (recurrencia/vencimientos), AudienceWorker (reevaluación de audiencias), ReviewWorker (repetición espaciada), NotifyWorker, RetentionWorker |
| Passport.js (JWT RS256) | Access 15 min + refresh httpOnly con rotación |
| Multer + Sharp | Media de tarjetas (imágenes optimizadas) |
| **Playwright (server)** | Render de certificados y actas HTML → PDF |
| Handlebars + Resend | Templates y envío de email |
| **API Claude (AIAdapter)** | Generación de borradores de tarjetas/preguntas desde documentos (humano aprueba) |

### Infraestructura
| Componente | Tecnología |
|---|---|
| Storage | Cloudflare R2 (videos, media, PDFs de certificados, firmas) |
| Monorepo | Turborepo (`apps/web`, `apps/api`, `packages/shared`) |
| CI/CD | GitHub Actions |
| Hosting | **VPS dedicado propio** (NO comparte nada con el entorno de SAC-NEO, que es piloto/demo). Todo el stack en Docker Compose sobre un VPS. Análisis y recomendación: `docs/03-infraestructura-produccion.md` — resumen: R2 obligatorio por el egress cero del video; VPS en Vultr/DigitalOcean Miami (mejor latencia a Colombia) o Hetzner Ashburn (mejor precio/potencia); AWS descartado por sobreprecio y egress |
| Monitoreo | Sentry + Betterstack |
| Video embebido | YouTube/Vimeo (F1); subido a R2 con streaming simple; transcoding en F2 si hace falta |

### Multi-tenancy: defensa en profundidad (idéntica a SAC-NEO, Decisión AR-01)
```
Capa 1 — Prisma Client Extension: fuerza where.tenant_id en toda lectura y lo setea en toda
         escritura. Un handler no puede "olvidar" el filtro.
Capa 2 — PostgreSQL RLS: políticas por tabla USING (tenant_id = current_setting('app.tenant_id')::uuid);
         el TenantInterceptor ejecuta SET LOCAL por request. Desde Fase 1, ANTES del riesgo.
Acceso por SUBDOMINIO por tenant (Decisión #32): transprensa.neopulse.app identifica el tenant
ANTES del login (necesario porque el login es por cédula, única solo dentro del tenant); el
branding carga desde la pantalla de login; cookies aisladas por subdominio. DNS wildcard.
```

---

## 6. Modelo de Datos Completo

Convenciones globales: toda tabla de datos lleva `tenant_id NOT NULL` (RLS) salvo las de
plataforma; `id UUID PK`, `created_at`; mutables agregan `version INT` (optimistic lock),
`updated_at`, `updated_by`; todo `code` es `UNIQUE(tenant_id, code)`; baja lógica (`active` /
`deleted_at`); históricos INMUTABLES (solo INSERT). En la UI nunca aparecen estos nombres:
aparecen los rótulos en español parametrizables.

### 6.1 Plataforma y tenants

```sql
tenants
  id, name, slug (unique), nit, timezone (America/Bogota), plan, active
  branding JSONB      -- logo_key, colores, textos institucionales
  settings JSONB      -- validado con Zod versionado: passing_score_default (Transprensa: 90),
                      -- max_attempts_default, retry_wait_hours, pill_cadence_per_week,
                      -- notification_weekly_cap, labels {activity: "Actividad formativa", ...},
                      -- efficacy_days_default, feature flags
```

### 6.2 Organización (catálogos)

```sql
areas               id, tenant_id, name, code, parent_id NULL, manager_user_id NULL, active
processes           id, tenant_id, name, code, responsible_user_id, area_id NULL, active
                    -- SGI | LOGISTICA | SST | PESV | ... (persona→área; actividad→proceso)
job_titles          id, tenant_id, name, code, job_title_type_id, active
job_title_types     id, tenant_id, name, code, active   -- Administrativo|Operativo|Comercial
services            id, tenant_id, name, code, active    -- Almacenamiento|Masivo|Paqueteo
regionals           id, tenant_id, name, code, active
norms               id, tenant_id, name, code, active    -- BASC|RES_2674|TRINORMA|RES_PESV|NA
                    -- + annual_hours_required INT NULL (BPM: 10 h/año)
```

### 6.3 Usuarios y acceso

```sql
users
  id, tenant_id, document_type (CEDULA|CE|PASAPORTE|NIT), document_number  -- UNIQUE(tenant, doc)
  full_name, phone
  email, email_kind (PERSONAL|CORPORATE)   -- login por documento O email; email = canal
  password_hash, must_change_password BOOLEAN, last_login, refresh_token_hash
  job_title_id, area_id, regional_id NULL
  hired_at DATE                    -- dispara inducción previa al inicio (D1072)
  employment_type                  -- DIRECTO | CONTRATISTA | TEMPORAL | EN_MISION
  road_actor NULL                  -- CONDUCTOR | MOTOCICLISTA | CICLISTA | PEATON | PASAJERO (PESV)
  terminated_at DATE NULL          -- ancla de la retención de 20 años (SST)
  habeas_data_consent_at, habeas_data_version
  esign_agreement_accepted_at, esign_agreement_version   -- acuerdo de firma electrónica (D2364)
  role_id, active, created_by, created_at, deleted_at

roles                    id, tenant_id, name, is_system    -- Admin, Analista, Usuario (seed)
permissions              id, code UNIQUE, category, description
role_permissions         role_id, permission_id
user_permission_overrides user_id, permission_id, granted BOOLEAN, set_by, set_at
analyst_scopes           user_id, process_id NULL, area_id NULL
                         -- qué procesos/áreas gestiona cada analista

user_import_batches      id, tenant_id, filename, storage_key, status, total/ok/failed, created_by
user_import_rows         batch_id, row_number, raw JSONB, status (OK|ERROR), error_detail, user_id NULL
```

### 6.4 Catálogo formativo

```sql
activity_types
  id, tenant_id, name, code, icon, color_hex, is_system, active, display_order
  config JSONB   -- requires_assessment, requires_survey, requires_efficacy, issues_certificate,
                 -- default_assignment_mode, default_recurrence_months NULL, is_micro,
                 -- participates_in_plan, requires_before_hire (inducción general)

activities                      -- "Actividad formativa" en UI
  id, tenant_id, code, name, description
  activity_type_id, process_id, responsible_user_id     -- responsable del proceso
  modality (PRESENCIAL|VIRTUAL|HIBRIDA)                 -- default; la convocatoria puede precisar
  current_version_id NULL, tags TEXT[]
  active, version, updated_at, updated_by, deleted_at

activity_norms       activity_id, norm_id              -- N:M (tributa a varias normas)
activity_services    activity_id, service_id           -- alcance
activity_regionals   activity_id, regional_id
activity_job_titles  activity_id, job_title_id         -- "dirigido a (cargos)" por defecto

activity_versions               -- INMUTABLE al publicar (copy-on-publish)
  id, activity_id, version_number
  status (DRAFT|PUBLISHED|RETIRED), published_at, published_by
  passing_score INT              -- SNAPSHOT resuelto de la cascada (tenant→actividad)
  max_attempts INT, retry_wait_hours INT NULL
  completion_criteria JSONB, syllabus_snapshot JSONB   -- temario para constancias
  migration_policy (FINISH_OLD|RESTART_NEW|MOVE_NOT_STARTED) -- qué pasa con inscritos al publicar N+1
  estimated_minutes INT

activity_contents               -- ítems ordenados de la versión
  id, activity_version_id, type (LESSON|PRESENTATION|VIDEO|DOCUMENT|ASSESSMENT|SURVEY|SCORM|LINK)
  title, description NULL, display_order, is_required, config JSONB   -- min_watch_pct, min_seconds...
                                                       -- description: editorial, la lee quien cursa
  lesson_id NULL, content_package_id NULL, assessment_version_id NULL, survey_template_id NULL

lessons              id, tenant_id, title, estimated_minutes, status (DRAFT|PUBLISHED)
lesson_cards         id, lesson_id, card_type (TEXT_IMAGE|VIDEO_SHORT|QUIZ|FLIP|POLL|FILL_GAP)
                     display_order, payload JSONB, media_key NULL
                     -- F2: HOTSPOT | MATCH

content_packages     -- archivos y video; SCORM schema-ready (runtime F2)
  id, tenant_id, kind (FILE|VIDEO|PRESENTATION|SCORM_12|SCORM_2004), storage_key, original_name,
  mime_type, size_bytes, checksum, manifest JSONB NULL  -- inmutable; re-subir = paquete nuevo
                                                        -- PRESENTATION: manifest lista las diapositivas

activity_templates   id, tenant_id NULL (NULL = biblioteca NEO global), name, payload JSONB
                     -- "crear actividad desde plantilla"
```

### 6.5 Convocatorias y ejecución

```sql
offerings                        -- "Convocatoria" en UI
  id, tenant_id, activity_version_id, code
  kind (EVENT|PERMANENT|HYBRID)
  modality (PRESENCIAL|VIRTUAL|HIBRIDA)
  scheduled_date DATE NULL, start_time, end_time
  window_start DATE NULL, window_end DATE NULL          -- autoservicio / parte virtual
  intensity_theory_hours NUMERIC, intensity_practice_hours NUMERIC   -- desglose PESV/BPM
  instructor_user_id NULL, instructor_external_name NULL
  instructor_credential_key NULL                        -- idoneidad adjuntable (licencia SST...)
  executed_by (PROPIOS|TEMPORALES|ARL|EPS|OTROS), executed_by_other NULL
  location, regional_id NULL, capacity NULL
  projected_count INT, projected_frozen_at, projected_adjust_reason NULL  -- derivado y congelado
  session_code NULL, session_code_expires_at            -- QR de asistencia (rotativo)
  status (DRAFT|PUBLISHED|IN_PROGRESS|COMPLETED|CANCELLED), cancelled_reason
  observations, version, updated_at, updated_by

enrollments                      -- "Ejecución/Inscripción": qué ocurrió con la persona
  id, tenant_id, offering_id, user_id, activity_version_id   -- SNAPSHOT de versión
  assignment_id NULL
  status (ENROLLED|IN_PROGRESS|COMPLETED|PASSED|FAILED|WITHDRAWN|EXPIRED)
  enrolled_at, started_at, completed_at, final_score NUMERIC NULL
  score_snapshot JSONB           -- por VALOR: título, versión, nota mínima exigida, temario ref,
                                 -- y cargo/área/vinculación del usuario AL MOMENTO (Decisión #33)
  blocked_at NULL, blocked_reason NULL, unblocked_by NULL     -- intentos agotados → refuerzo
  UNIQUE(offering_id, user_id)

activity_progress    enrollment_id, activity_content_id, status, pct, time_spent_s,
                     first_at, last_at, data JSONB      -- suspend_data SCORM futuro

attendance_records               -- evidencia presencial
  id, tenant_id, offering_id, user_id
  status (PRESENT|ABSENT|JUSTIFIED), justification NULL
  method (INSTRUCTOR|QR|SIGNATURE), checked_at, marked_by NULL
  signature_key NULL             -- imagen de firma en R2 (dato biométrico: consentimiento)
  UNIQUE(offering_id, user_id)

session_acts                     -- acta de la sesión generada (PDF inmutable)
  id, tenant_id, offering_id, pdf_storage_key, generated_at, generated_by, content_hash

learning_events                  -- append-only; costura xAPI
  id, tenant_id, user_id, enrollment_id NULL
  verb (LAUNCHED|PROGRESSED|COMPLETED|PASSED|FAILED|ATTENDED|SIGNED|CARD_VIEWED|REVIEW_ANSWERED)
  object_type, object_id, result JSONB, occurred_at
```

### 6.6 Asignación por regla y requisitos recurrentes

```sql
audiences            id, tenant_id, name, rule JSONB, is_dynamic, active
                     -- condiciones sobre job_title/job_title_type/area/regional/employment_type
audience_members     audience_id, user_id, joined_at, left_at NULL   -- proyección; nunca DELETE

assignment_rules                 -- el "Requisito": obligación viva en el tiempo
  id, tenant_id, audience_id, target_type (ACTIVITY|PATH|CERTIFICATION), target_id
  trigger (ON_JOIN|ON_HIRE|SCHEDULED)      -- ON_HIRE: inducción, due ANTES de hired_at
  due_days_after_trigger INT, recurrence JSONB NULL   -- {every_months} | {fixed_date "01-31"}
  active, created_by

assignments                      -- la OBLIGACIÓN individual
  id, tenant_id, user_id, target_type, target_id
  source (MANUAL|RULE|PLAN|STATIC_SNAPSHOT), rule_id NULL, plan_item_id NULL, assigned_by NULL
  cycle_number INT DEFAULT 1     -- ronda de recurrencia
  due_at, status (PENDING|IN_PROGRESS|COMPLETED|OVERDUE|WITHDRAWN_LEFT_AUDIENCE|WAIVED)
  waived_by NULL, waived_reason NULL
  completed_enrollment_id NULL   -- el enlace asignación → ejecución que la satisfizo
  assigned_at
```

### 6.7 Plan de capacitación anual

```sql
training_plans
  id, tenant_id, year, name, objective, goals TEXT, scope TEXT
  status (DRAFT|APPROVED|ACTIVE|CLOSED), approved_by NULL, approved_at NULL
  version, updated_at, updated_by

plan_items                       -- renglón del plan: REFERENCIA la convocatoria, no la posee
  id, tenant_plan... (tenant_id, plan_id), offering_id
  planned_month INT, projected_snapshot INT      -- congelado al aprobar el plan
  status (PLANNED|EXECUTED|RESCHEDULED|CANCELLED), rescheduled_to_item_id NULL
  notes
-- MÉTRICAS DEL PLAN: exclusivamente sobre enrollments cuyo assignment.source = PLAN y
-- assignment.plan_item_id pertenece al plan. Nada externo las altera (regla de oro 2).
```

### 6.8 Rutas de aprendizaje (F1 lineal; DAG schema-ready)

```sql
learning_paths       id, tenant_id, code, name, status, active
path_items           id, path_id, section_name, item_type (ACTIVITY|PATH), item_id,
                     display_order, is_required, min_required_in_section NULL,
                     prerequisite_item_ids UUID[]        -- guard SIEMPRE en servidor
path_enrollments     id, tenant_id, path_id, user_id, status, progress_pct, completed_at
                     -- reconoce finalizaciones previas vigentes (equivalencia por actividad)
```

### 6.9 Evaluaciones

```sql
question_categories  id, tenant_id, parent_id NULL, name       -- banco por tenant, jerárquico
questions            id, tenant_id, category_id, current_version_id, active
question_versions    -- INMUTABLE
  id, question_id, version_number
  qtype (SINGLE|MULTI|TRUE_FALSE|ESSAY), stem, options JSONB, correct JSONB,
  feedback JSONB, points NUMERIC, created_by, created_at

assessments          id, tenant_id, title, current_version_id
assessment_versions  -- INMUTABLE al publicar
  id, assessment_id, version_number, status (DRAFT|PUBLISHED)
  time_limit_min NULL, max_attempts NULL     -- NULL = hereda de activity_version
  grading_policy (HIGHEST|LAST|FIRST|AVERAGE) DEFAULT HIGHEST
  passing_score NULL, shuffle_questions BOOLEAN, shuffle_options BOOLEAN
  review_policy JSONB            -- qué ve el usuario tras el intento

assessment_sections  id, assessment_version_id, mode (FIXED|RANDOM_FROM_POOL)
                     category_id NULL, pick_count NULL, fixed_question_version_ids UUID[]

attempts
  id, tenant_id, enrollment_id, assessment_version_id, user_id, attempt_number
  status (IN_PROGRESS|SUBMITTED|GRADED|PENDING_MANUAL), started_at, submitted_at
  score NUMERIC NULL, passed BOOLEAN NULL
  anomaly_flags JSONB NULL       -- completitud en tiempo anómalo, etc.

attempt_questions               -- SNAPSHOT de lo servido: la defensa ante impugnaciones
  id, attempt_id, question_version_id, display_order, options_order JSONB
  answer JSONB NULL, points_possible, points_awarded NULL
  graded_by NULL, graded_at NULL, invalidated BOOLEAN DEFAULT false  -- anular y recalificar
```

### 6.10 Encuestas y eficacia

```sql
survey_templates     id, tenant_id, kind (SATISFACTION|EFFICACY), name,
                     questions JSONB, scheduled_days_after NULL (eficacia), active, version
survey_responses     id, tenant_id, survey_template_id (+version), enrollment_id
                     respondent_user_id      -- participante (satisfacción) o JEFE (eficacia)
                     answers JSONB, result (POSITIVE|NEGATIVE|NA) NULL,
                     follow_up_assignment_id NULL   -- refuerzo disparado si eficacia negativa
                     responded_at
efficacy_schedules   id, tenant_id, enrollment_id, due_at, evaluator_user_id (jefe),
                     status (PENDING|SENT|RESPONDED|EXPIRED)
```

### 6.11 Certificación y certificados

```sql
certifications                   -- requisito certificable con vigencia
  id, tenant_id, name, code, awarded_by_type (ACTIVITY|PATH), awarded_by_id
  renewal_target_id NULL         -- actividad de renovación (puede ser distinta)
  validity_months NULL, fixed_expiry_rule JSONB NULL   -- ambos anclajes
  renewal_window_days INT DEFAULT 60, active

certification_grants             -- UNA FILA POR RONDA, inmutable
  id, tenant_id, certification_id, user_id, cycle_number
  granted_at, valid_until NULL
  status (ACTIVE|SUPERSEDED|REVOKED)     -- por vencer/vencido se CALCULAN de valid_until
  source_enrollment_id

certificate_templates
  id, tenant_id, name, version_number, html_template, signers JSONB   -- [{name,title,image_key}]
  active

certificates                     -- el registro; el PDF es artefacto congelado
  id, tenant_id, user_id, enrollment_id NULL, grant_id NULL
  serial_number                  -- CERT-2026-000123 (serie por tenant/año)
  verification_code              -- aleatorio, UNIQUE, indexado, NO adivinable
  template_id, template_version, render_snapshot JSONB   -- todos los datos por VALOR
  pdf_storage_key, issued_at, valid_until NULL
  revoked_at NULL, revoked_by NULL, revoked_reason NULL

sequence_counters    tenant_id, entity_type (CERTIFICATE|OFFERING|PLAN|...), year, last_value
                     PRIMARY KEY (tenant_id, entity_type, year)   -- FOR UPDATE
```

### 6.12 Engagement: repetición espaciada, racha, puntos

```sql
review_queue                     -- motor determinista 2-7-14-30 (tipo Leitner)
  id, tenant_id, user_id, question_version_id, source_enrollment_id
  stage INT (0..4), due_at, lapses INT, last_result (PASS|FAIL) NULL, retired BOOLEAN
  -- fallada → stage baja y due_at se acerca; dominada (stage 4 aprobado) → retired (test out)

user_streaks         user_id (PK), tenant_id, current_streak, longest_streak,
                     last_activity_date, freezes_available INT DEFAULT 2
                     -- PRIVADA: solo la ve el usuario. Unidad = lección completada
points_ledger        id, tenant_id, user_id, points, reason_code, ref_type/ref_id, created_at
```

### 6.13 Aprobaciones (flujo del Analista) e IA

```sql
approval_requests
  id, tenant_id, requested_by, entity_type, entity_id
  action (PUBLISH|EDIT_PUBLISHED|CANCEL_OFFERING|...), payload JSONB (el cambio propuesto)
  justification TEXT NOT NULL
  status (PENDING|APPROVED|REJECTED), decided_by NULL, decided_at NULL, decision_note NULL
  -- Notifica al Admin al crear y al Analista al decidir. El cambio se APLICA solo al aprobar.

ai_generation_jobs
  id, tenant_id, source_document_key, target (LESSON_CARDS|QUESTIONS|BOTH)
  status (QUEUED|RUNNING|DRAFT_READY|APPROVED|DISCARDED)
  draft JSONB                    -- tarjetas/preguntas propuestas; NUNCA se publica sin revisión
  requested_by, reviewed_by NULL, created_at
```

### 6.14 Transversales

```sql
documents            id, tenant_id, entity_type, entity_id, storage_key, original_name,
                     mime_type, size_bytes, uploaded_by, created_at
                     -- pre-signed URLs, magic bytes, límites por archivo

notifications        -- outbox transaccional
  id, tenant_id, event_type, channel (EMAIL|IN_APP), recipient_user_id NULL, recipient_email,
  status (PENDING|SENT|FAILED|READ), subject, body, reference_type/id,
  sent_at, read_at, failed_reason, retry_count
notification_templates id, tenant_id, event_type, channel, subject_template, body_template, active

audit_logs           id BIGSERIAL, tenant_id, user_id, action, resource_type, resource_id,
                     old_values JSONB, new_values JSONB, ip_address, user_agent, created_at
                     -- inmutable

retention_policies   id, tenant_id, record_class (SST_TRAINING|GENERAL_TRAINING|AUDIT|PII),
                     retention_years INT, legal_basis TEXT, action_on_expiry (ANONYMIZE|DELETE)
                     -- SST_TRAINING: 20 años desde users.terminated_at (D1072 art. 2.2.4.6.13),
                     -- ANONYMIZE selectivo: se scrubea PII de contacto pero el REGISTRO
                     -- formativo (quién, qué, cuándo, nota, firma) SE PRESERVA por mandato legal
```

---

## 7. Sistema de Permisos

Dos preguntas distintas, y hacen falta las dos:

- **QUÉ puede hacer** — permisos efectivos = rol + overrides individuales (conceder / retirar).
  Guards solo por PERMISOS, nunca por nombre de rol. Cache Redis TTL 5 min (pendiente).
- **SOBRE QUÉ PARTE de la empresa** — `analyst_scopes`. Se aplica en las consultas de catálogo,
  convocatorias y plan (`api/src/common/analyst-scope.ts`, Decisión #54). **Tener alcance es lo que
  restringe**: sin filas se ve todo el tenant; con filas, solo esos procesos. Las filas que traen
  solo área acotan personas, no el catálogo.

Ambas se editan en el mismo sitio —el cajón de permisos de la persona— porque juzgar una sin la
otra lleva a errores caros: conceder "publicar" no significa lo mismo en toda la empresa que en SST.

```
-- Catálogo y contenido
catalog:read | catalog:manage_draft | catalog:publish        -- publicar = Admin o aprobación
lessons:manage | ai:generate
-- Convocatorias y ejecución
offerings:read | offerings:manage | offerings:publish
attendance:take (instructor) | attendance:sign (todo usuario autenticado sobre SU asistencia)
enrollments:read_all | enrollments:read_scope | enrollments:read_own
enrollments:unblock          -- rehabilitar tras intentos agotados (refuerzo)
-- Asignación y plan
assignments:manage | audiences:manage | plans:manage | plans:approve
-- Evaluaciones
questions:manage | attempts:grade_manual | attempts:invalidate_question
-- Certificados
certificates:issue | certificates:revoke | certificate_templates:manage
-- Cumplimiento
reports:read_all | reports:read_scope | reports:export | audit:read
-- Administración
users:manage | users:import | roles:manage | users:manage_permissions
config:manage_catalogs | config:manage_tenant | approvals:decide
-- Reglas del flujo Analista: tiene *:manage_draft y offerings:manage sobre su scope, pero
-- catalog:publish y EDIT de lo publicado pasan por approval_requests (justificación obligatoria).
```

---

## 8. Estructura del Monorepo

```
neo-pulse/
├── apps/
│   ├── web/                    # Next.js 14 (PWA)
│   │   └── src/app/
│   │       ├── (auth)/
│   │       ├── (admin)/        # escritorio: catálogo, plan, convocatorias, reportes, config
│   │       │   ├── contenido/          # "Contenido formativo"
│   │       │   ├── plan/
│   │       │   ├── convocatorias/
│   │       │   ├── personas/
│   │       │   ├── reportes/
│   │       │   ├── aprobaciones/
│   │       │   └── configuracion/      # catálogos, branding, plantillas, roles
│   │       ├── (learner)/      # móvil-first: mis pendientes, player de tarjetas, repaso,
│   │       │                   # racha, certificados, perfil
│   │       └── verificar/[codigo]/     # página PÚBLICA de verificación de certificados
│   └── api/                    # NestJS — vertical slices por bounded context
│       └── src/modules/
│           ├── auth/  tenants/  users/  org/          # identidad y organización
│           ├── catalog/  lessons/  content/           # catálogo formativo
│           ├── offerings/  enrollments/  attendance/  # ejecución
│           ├── assignments/  audiences/  plans/       # obligación y plan
│           ├── assessments/  surveys/                 # evaluación y eficacia
│           ├── certifications/  certificates/         # cumplimiento
│           ├── engagement/                            # repetición espaciada, racha, puntos
│           ├── approvals/  ai/  notifications/  audit/  analytics/
│           └── workers/       # Requirement, Audience, Review, Notify, Retention (BullMQ)
├── packages/shared/            # Zod = fuente única; OpenAPI generado
└── docs/                       # brief, decisiones, research, adr/, prd/, api/
```

---

## 9. Decisiones Irreversibles — Registro

| # | Decisión | Razón |
|---|---|---|
| 1 | Modelo de 5 capas: `activities → activity_versions → offerings → assignments/enrollments → attempts` | Patrón SAP/Docebo/Cornerstone; ratificado por el cliente. Fusionar capas rompe métricas y auditoría |
| 2 | Asignación ≠ Inscripción; se enlazan, no se fusionan | "Obligado sin inscribir" es el estado clave de cumplimiento |
| 3 | Plan anual = ENTIDAD PROPIA que referencia convocatorias; jamás un tipo de actividad | El Plan es objeto empresarial con metas, aprobación e indicadores propios |
| 4 | Métricas del plan congeladas (solo `assignment.source = PLAN`) | Ingresos tardíos, extras y píldoras no reescriben el histórico del plan |
| 5 | Proyectados DERIVADOS de la regla y congelados al publicar; ajuste manual auditado | El indicador de cumplimiento debe ser dato, no opinión |
| 6 | Versiones de contenido y pregunta INMUTABLES (copy-on-publish) + snapshot por valor en registros | "¿Qué examen presentó en marzo?" debe responderse siempre |
| 7 | Intento materializa su selección (`attempt_questions`) | Recalificación e impugnaciones |
| 8 | Tipos de actividad como TABLA por tenant (`activity_types`), no enum | Otro tenant crea ONBOARDING/RECERTIFICACION sin código |
| 9 | Área ≠ Proceso: catálogos distintos (persona→área, actividad→proceso) | SARLAFT no tiene personas; los reportes por área saldrían sucios |
| 10 | Login por cédula o correo; el correo es canal, no llave | Operativos sin correo corporativo; cambio de correo no rompe cuenta |
| 11 | Audiencias con historia (`joined_at/left_at`); asignaciones se retiran, nunca se borran | Cumplimiento histórico reproducible; borrar evidencia = hallazgo |
| 12 | Requisitos recurrentes como motor (reglas → worker → asignaciones por ronda `cycle_number`) | Reinducción anual y vencimientos sin intervención manual |
| 13 | Certificación por rondas (`certification_grants`, una fila por ciclo); estados calculados de `valid_until` | "¿Estaba certificado el 12 de mayo?" es LA pregunta legal |
| 14 | Certificado = registro + PDF congelado + código de verificación aleatorio público + revocación | Estándar Accredible/Credly; el consecutivo jamás es el código público |
| 15 | Firma electrónica: acuerdo en el alta (D2364 art. 5) + login individual + sello de tiempo + registro inmutable | Validez probatoria de asistencia y evaluación digital |
| 16 | Retención SST: 20 años tras retiro; anonimización selectiva que PRESERVA el registro formativo | D1072 art. 2.2.4.6.13 prima sobre temporalidad de Habeas Data |
| 17 | Multi-tenant: Prisma Client Extension + RLS Postgres desde Fase 1 | Igual que SAC-NEO (AR-01); la red antes del riesgo |
| 18 | Toda diferencia entre tenants es DATO (catálogos, settings Zod-validados, rótulos, branding); nunca `if (tenant)` | Cliente nuevo = configuración, no desarrollo |
| 19 | Guards solo por permisos, nunca nombres de rol; Analista con scope + flujo de aprobación con justificación | Regla de oro heredada de SAC-NEO |
| 20 | Unidad de contenido = TARJETA; lección = pila de 5-15; un PDF nunca es una lección | Antipatrón número 1 de los LMS fallidos, bloqueado por diseño |
| 21 | PWA offline-first para el usuario final; distribución por link/QR sin tienda | Deskless workers con cobertura intermitente |
| 22 | Repetición espaciada determinista 2-7-14-30 con refuerzo por fallo y test-out | El motor de retención; no necesita LLM |
| 23 | Gamificación: racha privada + puntos por logro; retos por área en F2; JAMÁS ranking individual público | Evidencia: la comparación pública expulsa a los de abajo |
| 24 | IA solo con humano en el circuito (borradores de tarjetas/preguntas); nada se publica sin revisión | Lo maduro de la IA en LMS 2026; el tutor conversacional espera a F3 |
| 25 | SCORM: schema-ready en F1; runtime 1.2 single-SCO en F2 solo si un tenant lo necesita; jamás autoría SCORM | 3-6 semanas de trampas que el MVP no necesita |
| 26 | BD/código en inglés estándar (activities/offerings/enrollments); UI 100% español con rótulos por tenant | Vocabulario de industria + producto local |
| 27 | Nota mínima y reglas académicas en cascada con SNAPSHOT en la versión publicada | Cambiar el setting no reinterpreta exámenes rendidos |
| 28 | `learning_events` append-only con vocabulario tipo xAPI desde F1 | xAPI/cmi5 futuro = exportador, no migración |
| 29 | Intentos limitados; agotados → bloqueo + notificación a analista/jefe + rehabilitación auditada | La evaluación mide; el indicador no se infla solo |
| 30 | Intensidad horaria SIEMPRE desglosada teórica/práctica; actividad tributa a N normas | PESV Paso 10 y acumulador BPM 10 h/año |
| 31 | BD/código en inglés; UI en español FIJO en F1 (rótulo por tenant previsto en settings, sin UI) | Cerrado con el cliente 2026-08-25; los rótulos son datos, no riesgo |
| 32 | Acceso por SUBDOMINIO por tenant (transprensa.neopulse.app): el tenant se identifica ANTES del login | El login por cédula es ambiguo sin contexto de tenant; branding desde la pantalla de login; cookies aisladas |
| 33 | Un colaborador tiene UN cargo y UN área vigentes; cambio de cargo reevalúa audiencias; ejecuciones y certificados guardan SNAPSHOT de cargo/área del momento | El histórico no se reescribe; auditoría exige el cargo que tenía al capacitarse |
| 34 | Español único en F1: sin tablas de traducción de UI ni de contenido | i18n hoy es sobreingeniería para el mercado objetivo; se agrega cuando exista el cliente que lo pida |
| 35 | **Motor de obligaciones idempotente**: índice único (requisito, persona, ronda) + `skipDuplicates`. Corre en caliente al alta/cambio de cargo y en frío cada hora | El alta y el cron pueden dispararlo a la vez; duplicar obligaciones corrompe todo indicador de cumplimiento |
| 36 | **La recurrencia se ancla en la finalización** (`assignments.completed_at`), no en el vencimiento, y la ronda siguiente abre con ventana (60 días por defecto) | Anclar al vencimiento castiga a quien se adelanta; sin ventana, la reinducción anual nacería ya vencida |
| 37 | **Regla de audiencia con una sola definición y dos derivaciones** (filtro de base + predicado en memoria) | Dos implementaciones separadas discreparían, y la lista que ve el analista dejaría de coincidir con las obligaciones que nacen |
| 38 | **Proyectados e inscripción masiva se acotan a la regional de la convocatoria** | Una jornada en Neiva no le promete nada a Barranquilla: numerador y denominador de la cobertura deben hablar de la misma gente |
| 39 | **Fechas de calendario ≠ instantes**: `fromDateOnly` para columnas `@db.Date`, `toBogotaDate` para timestamps | Leer `hired_at` como instante corría un día TODOS los vencimientos anclados al ingreso (fallo real, Sprint 3) |
| 40 | **El plan aprobado no se edita**; reprogramar un renglón lo marca como RESCHEDULED | Sus renglones ya obligan a personas reales; editarlo en silencio reescribiría el pasado |
| 41 | **Un envío encolado sin señal devuelve 503, nunca un éxito fingido.** El service worker guarda el avance y lo reintenta, pero la pantalla dice la verdad ("lo guardaremos al recuperar señal") | Devolver un 202 con la forma que espera la interfaz le mentiría al usuario sobre su propio registro formativo y rompería el código que lee la respuesta. Solo se encola el AVANCE (acumulativo e idempotente): la entrega de un examen y el repaso devuelven nota y mueven estado, y hacerlos a espaldas de la persona es peor que pedirle señal |
| 42 | **A dónde entra cada persona se decide por PERMISOS, no por nombre de rol ni por dispositivo**: quien solo tiene `enrollments:read_own` entra a la superficie del aprendiz | Los roles son configurables por empresa; los permisos no. Mandar al panel a quien tiene un solo permiso es mandarlo a una pantalla donde todo está prohibido |
| 43 | **Los archivos se sirven por URL FIRMADA, no con el token de sesión.** Una ruta pide la firma (con sesión, comprobando el tenant); otra sirve el archivo validando HMAC + caducidad | Una etiqueta `<img>`, `<video>` o `<iframe>` no puede enviar la cabecera de autorización. Exigirla hacía que NINGÚN archivo subido se viera (401). La alternativa —abrir el endpoint— dejaría los archivos de una empresa al alcance de quien adivine una clave |
| 44 | **Solo se EXIGE ver un video cuando se puede MEDIR.** Del archivo propio —y desde 2026-08-27 también del enlace de YouTube, vía su API de reproductor— se miden los segundos distintos reproducidos y el avance se bloquea hasta el mínimo; donde no se puede medir se registra como DECLARACIÓN de la persona, y se dice en pantalla | La plataforma no controla el reproductor de un tercero, pero YouTube sí expone posición y duración: donde hay forma de comprobarlo, se comprueba. Donde no la hay, fingirlo es peor que reconocerlo, porque este registro tiene que sostenerse ante un auditor. Se miden segundos distintos y no la posición máxima, porque arrastrar la barra al final daría el video por visto en dos segundos |
| 45 | **Publicar una versión nueva NO reapunta las convocatorias: hay que hacerlo a propósito.** La convocatoria avisa que hay una versión más nueva, muestra a cuántos inscritos movería y a cuántos no, y al actualizar aplica la política de migración que se eligió AL PUBLICAR esa versión. La versión destino viaja explícita: si se publicó otra mientras se decidía, se rechaza (`VERSION_SUPERSEDED`) | Mover a gente ya citada de contenido es un acto con consecuencias, no un efecto colateral de publicar. Antes la política de migración se guardaba y no la leía nadie, y el administrador creía haber actualizado la formación mientras el aprendiz seguía cursando la anterior. Dos frenos que ninguna política levanta: una ejecución cerrada nunca cambia de versión (es evidencia), y quien ya tiene otra ejecución abierta de la versión destino se queda donde está —dos ejecuciones suyas de la misma versión dejarían el avance sin saber a cuál ir—. El avance del que se mueve no se borra: deja de contar solo, y sigue ahí para auditoría |
| 46 | **El avance registra CÓMO se supo** (`MEASURED` / `DECLARED`), y se conserva en su peor forma: una declaración no asciende a medición porque un envío posterior venga medido | El auditor no pregunta solo el porcentaje, pregunta de dónde salió. Y si una pieza se dio por cumplida con la palabra de la persona, eso es lo que hay que poder decir dentro de dos años |
| 47 | **Una presentación no se sirve: se CONVIERTE en una imagen por diapositiva** y se reproduce con el reproductor del producto. Es un tipo de contenido propio (`PRESENTATION`), no una variante de `DOCUMENT`, y se completa viéndolas todas. El original se guarda igual, pero no es lo que se reproduce | Un PDF embebido en un visor no permite registrar nada: la persona hace scroll y lo único honesto que se puede afirmar es que confirmó haberlo abierto. Convertida, sí se puede decir qué diapositiva vio y cuánto tiempo, y eso es lo que la vuelve evidencia. Además se ve igual en cualquier teléfono, sin depender del Office de nadie. Se pierden animaciones, videos incrustados e hipervínculos, y se avisa al subir: es la misma limitación que tiene el conversor de Docebo, por la misma razón. Umbral por debajo del 100% no aplica —no hay barra que arrastrar: cada diapositiva se pasa a mano—, así que saltarse la mitad es no haberla visto |
| 48 | **PowerPoint exige LibreOffice en el servidor y eso se dice ANTES de subir**, no al fallar. El PDF se convierte siempre, sin binarios del sistema | Enterarse de que el servidor no puede convertir un `.pptx` después de esperar la subida entera es la peor forma de enterarse. La pantalla pregunta al abrir el cajón y ofrece la salida real: exportar a PDF desde PowerPoint, que es un clic y da el mismo resultado |
| 49 | **El reproductor lleva chrome propio en escritorio**: carril de la aplicación plegado a iconos, barra superior con el nombre de la FORMACIÓN y el avance total, e índice de la formación a la DERECHA. En móvil no aparece ninguno de los dos. Solo se desplaza el escenario | La regla anterior —ningún elemento de navegación mientras se cursa, para no invitar a irse— era buena y costaba más de lo que ahorraba: en una formación de siete partes, quien cursa necesita saber dónde está y cuánto le falta, y sin barra la única forma era salirse a mirarlo. Se conserva la intención reduciendo el chrome a lo justo: el carril nace plegado y no se despliega solo, y la barra lleva un título, no un menú. El índice va a la derecha porque al plegarlo el escenario crece hacia ese lado y su borde izquierdo NO se mueve; a la izquierda, mostrarlo u ocultarlo desplazaría el video entero de sitio a mitad de una lección |
| 50 | **La evaluación se rinde APARTE, a pantalla completa; la encuesta de satisfacción irá bajo el contenido** | No es una diferencia estética: el examen MIDE, y dejar el video o las diapositivas a la vista mientras se responde lo convierte en un examen a libro abierto, que es exactamente lo que no puede ser un registro con nota mínima del 90% que se presenta ante un auditor. Además tiene intentos limitados, bloqueo al agotarlos y cronómetro: es otro modo, y la pantalla debe decirlo. La encuesta de satisfacción no mide a nadie —califica la capacitación y al capacitador—, así que ahí sí es correcto que aparezca debajo del contenido, con la pieza a la vista |
| 51 | **Una pieza de contenido tiene DESCRIPCIÓN propia**, distinta de la de la actividad, y se muestra junto al contenido en el reproductor | Quien entra a la parte 4 de 7 no quiere saber de qué iba la inducción entera: quiere saber qué va a ver ahora y por qué se lo exigen. Va como columna y no dentro de `config` porque `config` guarda AJUSTES (mínimo de reproducción, segundos mínimos, url externa) y esto es contenido editorial que una persona lee: el día que haya que buscarlo, exportarlo o limitarlo, no debería haber que hurgar dentro de un JSON |
| 52 | **Cuánto hay que ver de un video lo decide la EMPRESA** (`minWatchPctDefault` en los ajustes del tenant), y una formación concreta puede pedir otra cosa. La cascada es formación → empresa → plataforma, y la resuelve el servidor, que devuelve el número ya resuelto a la pantalla | Estaba clavado en 90 en dos sitios distintos —la regla del servidor y el reproductor—, así que una empresa que capacita en SST y quiere exigir el video entero no tenía forma de pedirlo. Lo resuelve el servidor y no el cliente porque si la pantalla dijera 90 y la regla exigiera 100, la persona vería abrirse el botón y el servidor no le daría la pieza por vista |
| 53 | **La evaluación tiene ANTESALA dentro del reproductor**, aunque se rinda aparte: allí se dice la nota mínima, los intentos usados y que al agotarlos la formación se bloquea, antes de gastar uno | Una evaluación no es un medio y caía en el reproductor de archivos: terminaba diciendo "este contenido no tiene material cargado" con un botón de "Ya lo leí". Además un examen se empieza a propósito, nunca por inercia: la antesala es donde se dice lo que cuesta |
| 54 | **El alcance del Analista se APLICA en las consultas, y TENER alcance es lo que restringe.** Un usuario sin filas en `analyst_scopes` ve todo el tenant; uno con filas ve solo esos procesos en catálogo, convocatorias y plan —y las métricas del plan se calculan sobre lo que ve—. En lectura de una ficha ajena se responde 404; al crear o MOVER algo a un proceso ajeno, 403 (`PROCESS_OUT_OF_SCOPE`) | `analyst_scopes` existía desde Sprint 1, se guardaba y no la leía ninguna consulta: un analista de SST abría el catálogo y veía las 52 capacitaciones de toda la empresa. Se resuelve con un dato del usuario y no con un permiso nuevo por módulo (`catalog:read_all`/`read_scope`) porque el alcance no es una capacidad sino un ámbito: fundirlos obliga a duplicar cada permiso de lectura del producto y a mantenerlos sincronizados a mano. Sigue respetando la Decisión #19 —aquí no se mira el nombre del rol en ningún sitio—. El 404 en lectura evita confirmar que un id ajeno existe; el 403 en escritura sí explica, porque el proceso lo eligió quien llama en un desplegable que ya vio. Se cierra también MOVER: sin esa comprobación, el analista de SST cambiaba el proceso de su capacitación a PESV y le dejaba al de PESV un renglón que no pidió |
| 55 | **Un plan aprobado admite AGREGAR jornadas, con justificación; lo que no admite es BORRAR.** En BORRADOR se agrega sin motivo; en APROBADO/EN EJECUCIÓN el motivo es obligatorio y el renglón nace ya materializado (proyectados congelados + obligaciones creadas); CERRADO no admite nada. Quitar un renglón sigue siendo solo de borrador: después se CANCELA | La Decisión #40 —"el plan aprobado no se edita"— tenía razón en la intención y era demasiado apretada en la práctica: si en agosto abren una regional, esa jornada tiene que entrar en el plan del año. Prohibirlo no evitaba el cambio, lo sacaba del sistema, que es justo lo que el plan existe para impedir. La distinción que importa es otra: AGREGAR no reescribe el pasado, BORRAR sí. Y el renglón nuevo obliga desde que entra, porque un renglón que no genera obligaciones es un adorno en una pantalla que nadie va a cumplir. La convocatoria puede entrar en borrador —el camino natural es crearla desde el propio plan— y al publicarla se sincroniza el `projected_snapshot` del renglón con el número que se acaba de congelar |
| 56 | **Los proyectados de una convocatoria publicada se AJUSTAN con motivo obligatorio**, desde el propio plan (`POST /offerings/:id/adjust-projected`). Actualiza el número de la convocatoria Y el `projected_snapshot` de sus renglones no ejecutados en planes no cerrados. Pasa por la misma compuerta que publicar: quien no tiene `offerings:publish` lo propone | La regla de oro 3 siempre previó la válvula ("ajuste manual solo con justificación auditada") pero solo existía al publicar, y el caso real es posterior: se congelaron 45 y entraron siete personas en marzo, así que el 100% de cobertura sería mentira. Toca los dos números a propósito: corregir solo el de la convocatoria dejaría la ficha diciendo 52 y el indicador dividiendo por 45, que es peor que no corregir nada porque el error queda escondido. No toca lo EJECUTADO ni los planes CERRADOS: eso es historia (regla de oro 5) |
| 57 | **ÁREA y PROCESO son cosas distintas y se quedan separadas; lo que se añade es que el proceso CUELGA de un área** (`processes.area_id`, ya en el modelo). El alcance se da sobre un área —y alcanza todos sus procesos, y los de sus subáreas— o sobre un proceso suelto | La duda era razonable porque los dos catálogos se parecen (Logística está en ambos), pero responden preguntas distintas: el **área** es dónde trabaja una PERSONA, el **proceso** es de qué trata una CAPACITACIÓN. Unificarlos rompe el caso más común: una formación de SARLAFT se le exige a comercial, cartera y logística a la vez, así que "SARLAFT" como área sería el par de personas que lo llevan, no su audiencia. Con la jerarquía se resuelve lo que preocupaba sin fusionar nada: la jefatura de SGI recibe alcance sobre el ÁREA SGI y ve SARLAFT, SST y PESV; el responsable de SARLAFT recibe alcance sobre ese PROCESO y no ve los otros, aunque compartan área |
| 58 | **Lo que la pantalla ofrece se decide por PERMISO, no por rol** (`useCan` sobre los permisos efectivos del perfil). Esconder un botón NO es la seguridad —esa vive en los guards del servidor— sino decir la verdad | El AppShell ya pedía el perfil y se lo guardaba, así que las pantallas enseñaban todos los botones a todo el mundo: el Analista veía "Aprobar plan", un permiso (`plans:approve`) que su rol no tiene, y se enteraba al pulsarlo con un 403 seco. Ofrecer una acción prohibida es prometer algo que no se va a cumplir |
| 59 | **A quién se le exige se decide en UN solo sitio: la pestaña Quiénes.** De la ficha de la actividad salen los cargos, servicios y regionales; queda solo la NORMA, que es clasificación para indicadores. Y los PROYECTADOS se derivan de quienes ya están obligados, no de un campo aparte | Había que elegir los cargos dos veces —en la ficha para que salieran los proyectados y en Quiénes para crear la obligación— y las dos listas se separaban en cuanto alguien tocaba una: el denominador de la cobertura dejaba de hablar de la misma gente que el numerador. Servicios y regionales de la ficha no decidían nada en absoluto, solo se guardaban. Derivando de las obligaciones, proyectado y obligado son la misma gente por construcción y no pueden discrepar. Los datos viejos NO se borran: el update es parcial y las tablas siguen ahí |
| 60 | **Los criterios de una asignación se CRUZAN (Y); las personas sueltas se SUMAN (O).** "Auxiliares Y de Antioquia" alcanza solo a los auxiliares de Antioquia. Se reutiliza `buildAudienceWhere`, la misma función que resuelve las audiencias | `createManual` metía todo en un único `OR`, así que "cargo Auxiliar + regional Antioquia" obligaba a todos los auxiliares del país MÁS a todo el mundo de Antioquia. La formación le caía a cientos de personas que nadie quiso obligar, y quien la creó no tenía forma de notarlo hasta que llegaran las quejas. Las audiencias ya lo hacían bien con `match: ALL`: el arreglo es usar esa, no escribir una segunda (Decisión #37) |
| 61 | **La persona tiene SERVICIO, opcional** (`users.service_id`), y es un criterio más de audiencia y de asignación. Quien no lo tenga puesto no entra por ese criterio: no se adivina | Sin él, "dirigido a almacenamiento" no tenía forma de resolverse a personas. Opcional porque hay clientes que no organizan así a su gente, y una columna obligatoria bloquearía su carga masiva entera por un dato que no usan: quien lo deje vacío simplemente no usa ese criterio y todo lo demás le funciona igual. Va también en la plantilla de carga masiva, junto a `fecha_nacimiento` |

---

## 10. Plan de Sprints — Fase 1 (8 semanas)

### Sprint 0 — Fundaciones (Semana 1)
Monorepo Turborepo + Docker Compose (PG+Redis); Prisma schema completo (todas las tablas §6);
RLS + Prisma Extension; NestJS base (filters, pipes, interceptors, TenantInterceptor); Auth
completo (login cédula/email, JWT RS256, refresh httpOnly, cambio forzado primer ingreso,
acuerdos Habeas Data + firma electrónica en activación); seed Transprensa (tenant, catálogos
§3.2, roles/permisos, settings con nota 90); Next.js base con tema por tenant; CI verde.
**DoD:** Admin de Transprensa se loguea; branding del tenant aplicado; RLS verificado con test.

### Sprint 1 — Organización, usuarios y configuración (Semana 2)
CRUD de todos los catálogos (áreas, procesos, cargos, tipos, servicios, regionales, normas,
tipos de actividad); CRUD usuarios + carga masiva XLSX con reporte por fila; generador de
contraseñas; roles y overrides; scopes de analista; flujo de aprobaciones (approval_requests +
notificaciones in-app/email); branding y settings del tenant por UI.
**DoD:** carga masiva de 100 usuarios en minutos; analista intenta editar y se genera solicitud.

### Sprint 2 — Catálogo formativo y evaluaciones (Semana 3)
CRUD actividades + versionado draft/publish con política de migración; editor de lecciones
(6 bloques, vista previa móvil); video con control de avance; documentos en visor; banco de
preguntas versionado; constructor de exámenes (secciones fijas/aleatorias, barajado, intentos,
política de nota); plantillas de actividad.
**DoD:** se crea "Inducción General Corporativa" v1 con lección + video + examen de banco
aleatorio y se publica; editarla crea v2 sin tocar v1.

### Sprint 3 — Convocatorias, asignaciones, plan (Semana 4)
Convocatorias (evento/permanente/híbrida) con proyectados derivados y congelados; audiencias
dinámicas + workers de reevaluación; reglas de asignación (ON_HIRE con due antes de hired_at,
recurrencia); asignación manual (usuario/cargo/área/regional); plan anual (crear, aprobar,
renglones-referencia, métricas congeladas); matriz cargo → inducciones específicas.
**DoD:** entra un usuario nuevo por carga masiva y le nacen automáticamente su inducción general
(due antes de su fecha de ingreso) y las específicas de su cargo; el plan 2026 muestra
cumplimiento y cobertura que no se mueven al asignarle nada extra a nadie.

### Sprint 4 — Experiencia del usuario final (Semana 5)
PWA instalable con offline básico (cachear lecciones asignadas, sincronizar resultados); player
de tarjetas con telemetría; flujo completo: pendientes → lección → examen (intentos, bloqueo,
notificación de refuerzo) → resultado; motor de repetición espaciada + sesión de repaso diaria;
racha privada + puntos; píldoras con cadencia y tope de notificaciones.
**DoD:** un auxiliar de bodega completa una píldora desde el celular sin señal estable; sus
preguntas falladas reaparecen a los 2 días; su racha avanza.

### Sprint 5 — Asistencia, certificados, encuestas, cumplimiento (Semana 6)
Asistencia presencial (lista instructor + QR de sesión + firma en pantalla) y acta PDF; motor de
certificaciones con vigencia y renovación (worker + avisos 60/30/7); certificados (plantillas por
tenant, serie, PDF congelado, página pública de verificación con QR, revocación); encuestas de
satisfacción y eficacia diferida con refuerzo; acumulador de horas por norma (BPM 10 h/año).
**DoD:** una sesión presencial queda con acta firmada exportable; un certificado se verifica
públicamente por QR y se puede revocar; el jefe recibe la eficacia a los 30 días.

### Sprint 6 — Reportes, IA, auditoría y salida (Semanas 7-8)
Dashboard de indicadores (cumplimiento del plan por proceso, cobertura, vencimientos, matriz de
competencia cargo vs formación, historial por persona, conocimiento por tema/área, retención
7/30 días); exportaciones para auditor (constancias, actas, historiales); generación IA de
borradores de tarjetas/preguntas desde PDF con flujo de aprobación; audit log completo con
visor; retención y anonimización selectiva; hardening (rate limit por cuenta, magic bytes,
pre-signed URLs); E2E Playwright del flujo completo; deploy a producción; capacitación de
administradores; cursos piloto cargados.
**DoD:** el auditor simulado obtiene, para una persona cualquiera, su historial completo con
soportes en menos de un minuto. Piloto en producción.

---

## 10.5 Estrategia de Calidad, Pruebas y Monitoreo (MANDATORIA)

```
PRUEBAS (piramide por sprint):
  - Unitarias (Jest): cada handler de negocio lleva su .spec (logica de dominio: gating de
    intentos, congelado de proyectados, calculo de vigencias, motor de repeticion espaciada).
  - Integracion: verify-rls (aislamiento multi-tenant) corre en CI contra Postgres de servicio;
    cualquier PR que rompa el aislamiento NO se mergea.
  - E2E (Playwright): al cierre de cada sprint funcional se agrega el flujo completo del sprint.
    Flujo maestro (crece sprint a sprint): login -> crear actividad -> publicar version ->
    convocatoria -> asignacion -> usuario final completa leccion + examen -> certificado ->
    verificacion publica. Los e2e NO corren desde /mnt/c (leccion SAC-NEO); corren nativos.
  - Datos de prueba: seed idempotente + factories por test; nunca depender de datos manuales.

MONITOREO Y PREVENCION (deteccion ANTES del incidente):
  - Sentry (API + Web) desde Sprint 1: todo 5xx y toda excepcion de frontend reportada.
  - Health checks: /v1/health (API), y por worker BullMQ (heartbeat) cuando existan colas.
  - Uptime externo (Betterstack) sobre health + login sintetico en produccion.
  - Metricas operativas minimas: latencia p95 por endpoint, errores por minuto, profundidad de
    colas, jobs fallidos (dead letter) con alerta por correo al equipo.
  - Auditoria inmutable (audit_logs) + learning_events append-only: reconstruir cualquier
    incidente sin adivinar.
  - Backups: pg_dump diario + retencion 14 dias + copia offsite R2 (mismo patron SAC-NEO)
    DESDE el primer dia de produccion. Un piloto sin backup no es un piloto.
  - Presupuesto de error: si un despliegue produce errores nuevos en Sentry, se revierte
    primero y se diagnostica despues (main siempre deployable).

ENTORNO DE DESARROLLO (leccion 2026-08-25):
  - Los comandos corren con Node NATIVO de Windows (PowerShell) sobre el repo en Documents.
    WSL solo para utilidades shell. RAZON: WSL accede a /mnt/c por el puente 9P, que degrada
    10-30x los builds con node_modules grandes (fue la lentitud cronica de SAC-NEO).
  - Docker/puertos: respetar docs/02-aislamiento-proyectos.md.
```

## 11. Seguridad

```
Autenticación: JWT RS256, access 15 min, refresh 7 días httpOnly con rotación y hash en DB.
  Rate limit de /auth por CUENTA (documento/email) + IP combinados (NAT corporativo).
Autorización: PermissionGuard + scopes de analista; visibilidad filtrada a nivel de query.
Tenant: Prisma Extension + RLS (SET LOCAL app.tenant_id). Tests de aislamiento en CI.
Página pública de verificación: sin auth, rate-limited, datos mínimos, sin enumeración
  (código aleatorio, respuestas homogéneas).
Archivos: magic bytes, pre-signed URLs (1 h), límites de tamaño; firmas manuscritas y
  credenciales de instructores en claves privadas de R2.
Evaluaciones: correct JSONB nunca viaja al cliente; corrección solo en servidor; desbloqueos de
  secuencia validados en servidor.
Datos: PII cifrable en reposo (Postgres + disco cifrado); auditoría inmutable; sanitización
  HTML; ValidationPipe whitelist + forbidNonWhitelisted; Helmet + CORS whitelist.
Habeas Data: consentimiento y versión registrados; firma digitalizada = dato biométrico con
  autorización explícita; flujo de consultas (10 días) y reclamos (15 días); contrato
  Responsable-Encargado por tenant.
```

---

## 12. Convenciones de Código

Idénticas a SAC-NEO (estándar del equipo):
- **Calidad ante todo**; sin atajos sin justificación documentada.
- **SIN emojis ni símbolos decorativos en NINGUNA parte** (código, UI, docs, commits, logs).
  Etiquetas de texto: "OK", "PENDIENTE", "VENCIDO", "CRÍTICO".
- TypeScript `strict`, sin `any` (usar `unknown` + type guards), sin código muerto.
- Zod fuente única en `packages/shared`; OpenAPI generado; sin DTOs duplicados.
- Vertical Slice: `features/<caso-de-uso>/` con command/handler/spec; handlers usan Prisma
  directo; controllers solo HTTP.
- Archivos `kebab-case.ts`; Conventional Commits; branches `feat/...`; `main` deployable.
- UI: TODO en español; los nombres técnicos (activities, offerings) jamás se muestran.

---

## 13. Variables de Entorno Críticas

```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_PRIVATE_KEY_PATH=./keys/private.pem
JWT_PUBLIC_KEY_PATH=./keys/public.pem
REFRESH_TOKEN_SECRET=...
MEDIA_URL_SECRET=...              # firma de las URL de archivos (si falta, reusa el pepper de refresco)
R2_ACCOUNT_ID=... / R2_ACCESS_KEY_ID=... / R2_SECRET_ACCESS_KEY=... / R2_BUCKET_NAME=neo-pulse-files
RESEND_API_KEY=... / RESEND_FROM_EMAIL=noreply@neopulse.app
ANTHROPIC_API_KEY=...            # generación de borradores (AIAdapter)
PUBLIC_VERIFY_BASE_URL=https://app.neopulse.app/verificar
NODE_ENV / PORT=3002 / FRONTEND_URL / APP_TIMEZONE=America/Bogota
```

---

## 14. Pendientes por Confirmar

| # | Pregunta | Impacto | Estado |
|---|---|---|---|
| P1 | Contenido y firmantes exactos de la constancia/certificado de Transprensa | certificate_templates seed | Validar con cliente |
| P2 | ¿Transprensa compra contenido SCORM hoy? | Runtime SCORM en F2 sí/no | Validar con cliente |
| P3 | Umbral SARLAFT aplicable (Res. 4607/2026, régimen completo vs simplificado) | Etiquetado y periodicidad del plan SARLAFT | Validar contra Circular Única |
| P4 | Lista definitiva de cargos y matriz cargo → inducciones específicas | Seed Sprint 3 | Levantar con Gestión Humana |
| P5 | Parametrización real del plan 2026 (actividades, meses, proyectados) | Piloto Sprint 6 | Levantar con cliente |
| P6 | WhatsApp Business como canal (F2): proveedor y presupuesto | NotifyWorker F2 | No bloquea F1 |

---

*Documento maestro v1.0 — generado desde el brief del cliente (docs/00), las decisiones de
descubrimiento (docs/01) y tres investigaciones con fuentes (docs/research/02-04).*
*Fuente de verdad del proyecto — actualizar ante cualquier cambio de decisión.*
*Última actualización: 2026-08-25.*
