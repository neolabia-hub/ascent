# NEO PULSE — Decisiones preliminares (pre-documento maestro)

Registro de lo acordado en la sesión de descubrimiento del 2026-08-25, ANTES de redactar el
CLAUDE.md definitivo. Cuando el documento maestro exista, este archivo queda como acta histórica.

## D1. Ubicación y stack
- Proyecto NUEVO e independiente: `Documents/Transprensa - NEO PULSE`, repo git propio.
- Stack: lo define el arquitecto (Claude) con criterio de escalabilidad y parametrización máxima.
  Base de partida: el stack probado de SAC-NEO (Next.js 14 + NestJS + Prisma + PostgreSQL +
  Redis/BullMQ + Tailwind/shadcn, multi-tenant con Prisma Extension + RLS), ajustado a lo que la
  investigación de dominio LMS recomiende. Notificaciones por correo (Resend u equivalente).
- Metodología: la mejor para este proyecto — se definirá en el documento maestro (base: SDD +
  DDD-lite + Vertical Slice + ADR + API-first, que ya funcionó en SAC-NEO).
- Primer entregable: documento maestro (CLAUDE.md de NEO PULSE) + modelo de datos completo,
  alimentado por investigación de internet (3 agentes: microlearning/innovación, modelado de
  dominio LMS, normativa colombiana de capacitación).

## D2. Modelo conceptual del dominio (ADOPTADO)
Separación en capas, cada una responde una pregunta distinta:

```
ACTIVIDAD FORMATIVA      ¿Qué se aprende?           (catálogo, reutilizable por años)
  └─ VERSIÓN DE CONTENIDO  ¿Qué vio exactamente?    (inmutable al publicar; auditoría)
       └─ CONVOCATORIA     ¿Cuándo/dónde/cómo?      (fecha, instructor, regional, modalidad,
                                                     proyectados; o "permanente" si autoservicio)
            ├─ ASIGNACIÓN  ¿Quién debe hacerla y por qué regla? (todos | área | cargo |
            │                tipo de cargo | regional | servicio | usuario individual)
            └─ EJECUCIÓN   ¿Qué hizo realmente cada usuario?   (progreso, asistencia,
                             intentos de evaluación, encuesta, certificado, estado)
PLAN DE CAPACITACIÓN     ¿Qué se planeó para el año? (metas, objetivos, aprobación, indicadores)
```

Reglas confirmadas:
1. Una sola entidad ActividadFormativa con TIPO parametrizable por tenant (INDUCCION_GENERAL,
   INDUCCION_ESPECIFICA, REINDUCCION, PLAN, EXTRA, MICROLEARNING para Transprensa; otros tenants
   crean los suyos sin código). El tipo configura: icono/color, obligatoriedad, forma de
   asignación, si genera certificado, si exige evaluación/encuesta, cómo se mide, recurrencia.
2. El motor de contenido, progreso, evaluación, encuesta, certificado y auditoría es COMÚN a
   todos los tipos.
3. El PLAN es entidad propia (no un tipo de actividad). Sus renglones apuntan a CONVOCATORIAS
   (corrección al análisis de base: no a actividades directamente), porque fecha/proyectados/sede
   son de la convocatoria.
4. MÉTRICAS DEL PLAN CONGELADAS: la ejecución tardía de un usuario que ingresó después de la
   fecha de la convocatoria NO altera proyectados/ejecutados/cumplimiento del plan. Su formación
   se cubre con una asignación individual/regla de ingreso, medida aparte.
5. "Proyectados" se DERIVA de la regla de asignación y se congela al publicar la convocatoria
   (no es un entero digitado a mano). Puede ajustarse manualmente con justificación auditada.
6. Entidad adicional REQUISITO/OBLIGACIÓN RECURRENTE (no estaba en el análisis de base): reglas
   vivas tipo "reinducción cada 12 meses", "todo ingreso nuevo hace X", "certificado vence a los
   N meses". Un motor las evalúa periódicamente y GENERA asignaciones. Estados de la persona
   frente al requisito: vigente | por vencer | vencido | pendiente.
7. Convocatoria presencial = evento (fecha, hora, lugar, asistencia). Virtual autoservicio =
   convocatoria permanente (ventana de fechas opcional, sin asistencia; métricas asignados/
   iniciaron/completaron/aprobaron). Híbrida = ambas condiciones deben cumplirse.
8. Versionado de contenido: la ejecución histórica apunta a la versión que la persona realmente
   cursó, aunque el curso se edite después (copy-on-publish; la versión publicada es inmutable).
9. Plantillas de actividad ("crear desde plantilla") — biblioteca por tenant y global de NEO.

## D3. Organización y catálogos por tenant
- ÁREA (unidad organizacional de personas) y PROCESO (sistema de gestión: SGI, PESV, SARLAFT,
  SST...) son catálogos DISTINTOS. La persona pertenece a un área; la actividad formativa
  pertenece a un proceso; un proceso tiene área/responsable a cargo.
- Catálogos parametrizables por tenant: áreas, procesos, cargos, tipos de cargo (administrativo,
  operativo, comercial...), servicios (almacenamiento, masivo, paqueteo), regionales, normas
  (BASC, Res. 2674/2013 BPM-HACCP, trinorma, RES-PESV, N/A), tipos de actividad, modalidades,
  "ejecutada por" (Propios, Temporales, ARL, EPS, Otros con campo abierto).
- Branding por tenant: logo, colores, información de empresa. Reglas de negocio por tenant vía
  settings (ej.: nota mínima 90% para Transprensa, editable por UI).

## D4. Usuarios y acceso
- Login por CÉDULA o correo, indistinto. La cédula es la llave estable; el correo (personal al
  inicio, corporativo después) es canal de notificación y recuperación; cambiarlo no rompe la
  cuenta ni el histórico. Lo cambia el admin o el propio usuario en su perfil.
- Alta con datos básicos: nombre, cédula, teléfono, correo (personal o corporativo), cargo, área.
- Contraseña inicial generada automática segura (patrón cédula + caracteres); cambio obligatorio
  en primer ingreso; el admin puede forzar cambio a petición del usuario.
- Carga masiva desde archivo (plantilla + validación + reporte de errores por fila).
- Roles: Superadmin (NEO), Admin (control total del tenant), Analista (gestiona la formación de
  su área; sus ediciones requieren aprobación del Admin con justificación, vía notificaciones),
  Usuario final (consulta y realiza lo asignado). Igual que SAC-NEO: autorización por PERMISOS,
  nunca por nombre de rol en el código.

## D5. Formulario de capacitación (campos confirmados por el cliente)
Información básica: proceso/área, responsable del proceso (jefe del área del proceso),
instructor (filtrado por usuarios del área), tipo de cargo, nombre*, descripción, modalidad
(Presencial | Virtual | Híbrida), ejecutada por (Propios | Temporales | ARL | EPS | Otros+texto),
norma aplicable. Alcance: servicios, regionales, cargos destinatarios. Programación: fecha
programada, intensidad (horas), total proyectados (derivado, ver D2.5), observaciones.
(En el modelo D2 estos campos se reparten entre Actividad y Convocatoria.)

## D6. Contenido, evaluación, asistencia y encuestas (confirmado 2026-08-25)
- CONTENIDO soportado: video con control de avance (subido o YouTube/Vimeo; % visto, puede
  exigirse completo antes de la evaluación), PDF/documentos de oficina en visor con registro de
  lectura, y LECCIÓN EN TARJETAS/BLOQUES (editor propio mobile-first, base del microlearning).
  SCORM: aceptado por el cliente pero SOLO como IMPORTADOR de paquetes de terceros y en fase
  posterior (Fase 2/3) — nunca como formato de autoría propio (antipatrón documentado; costo
  alto de runtime). La investigación de microlearning refuerza: el PDF nunca se publica como
  "lección"; entra como fuente para generar tarjetas o como adjunto de consulta.
- EVALUACIÓN: banco de preguntas por actividad; el examen toma N al azar y baraja opciones;
  intentos LIMITADOS configurables por tenant/actividad (con espera opcional entre intentos);
  agotados los intentos, bloqueo + notificación al analista/jefe de área para refuerzo; queda
  visible en el reporte de cumplimiento como no conforme.
- ASISTENCIA presencial (tres mecanismos complementarios, por convocatoria): lista digital que
  marca el instructor (presente/ausente/justificado), QR/código de sesión que escanea el
  asistente (hora exacta), y firma en pantalla del asistente para el acta generada por el
  sistema. El acta física escaneada NO es mecanismo primario (puede adjuntarse como documento).
- ENCUESTAS: satisfacción al terminar (plantillas por tenant) Y evaluación de eficacia diferida
  a N días respondida por el jefe. Configurables por actividad (una, ambas o ninguna).

## D7. Alcance F1, plan, SCORM y nombres (confirmado 2026-08-25, segunda ronda)
- FASE 1 con experiencia de usuario final COMPLETA mobile-first: lecciones en tarjetas tipo
  stories, PWA offline básico, repetición espaciada 2-7-14-30 con refuerzo de lo fallado, racha
  personal privada, e IA para generar borradores de tarjetas/preguntas desde un PDF (el admin
  revisa y aprueba; nunca se publica sin revisión).
- GAMIFICACIÓN: F1 racha privada (unidad = lección completada, con protector) + puntos por logro
  real. F2: retos colectivos por área con metas de equipo. NUNCA ranking público de personas.
- NOMBRES UI: "Capacitación extraordinaria" (fuera del plan) y "Píldora" (microlearning).
  Códigos internos EXTRA y MICROLEARNING; rótulo editable por tenant.
- PLAN DE CAPACITACIÓN = ENTIDAD PROPIA (training_plans + plan_items), jamás un tipo de curso.
  El plan REFERENCIA convocatorias planificadas, no posee la actividad. Métricas del plan
  calculadas solo de ejecuciones nacidas del plan (assignment.source = PLAN); lo extraordinario,
  las inducciones y los ingresos tardíos NUNCA alteran las métricas del plan. (Ratificado por el
  usuario en Bloque 2 del brief.)
- SCORM: schema-ready desde el día 1 (content_packages kind SCORM_12, tipo de contenido SCORM);
  runtime en Fase 2 SOLO si un tenant compra contenido empaquetado. El camino principal es el
  contenido nativo.
- NOMENCLATURA: BD/código en inglés estándar de industria (activities, activity_versions,
  offerings, enrollments, attempts). En la UI NUNCA aparece "course": aparece "Actividad
  formativa" / menú "Contenido formativo", rótulo parametrizable por tenant.
- ASIGNACIÓN ≠ INSCRIPCIÓN ratificado por el usuario (Bloque 3): asignación = la obligación
  (existe sin participación; estado clave "obligado sin inscribir"); inscripción/ejecución = lo
  que ocurrió en la convocatoria (inscrito → asistió → terminó → aprobó); intentos = lo que
  ocurrió en cada evaluación. Se enlazan (completed_enrollment_id), no se fusionan.

## Pendiente de decisión (se preguntará)
- Certificados: contenido, verificación pública, vencimiento, plantilla por tenant (esperar
  informe normativo para proponer con fundamento).
- Alcance exacto de Fase 1 vs fases posteriores.
- Nombre en la UI de las capacitaciones "extra/novedad" y del microlearning.
- Gamificación (racha privada, retos por área) — proponer tras revisar investigación con el usuario.
- Canal WhatsApp para notificaciones/entrega (Fase 2) — el cliente pidió correo en Fase 1.
