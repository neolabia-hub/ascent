# Brief crudo del cliente — NEO PULSE

> Transcripción literal de lo que dictó el usuario. NO se edita ni se corrige.
> Es la fuente primaria; el documento maestro (CLAUDE.md) se deriva de aquí.
> Cada bloque nuevo que dicte el usuario se ANEXA al final con su fecha.

---

## Bloque 1 — 2026-08-25 (sesión inicial)

Necesito crear un proyecto nuevo de Transprensa, es un e-learning para capacitar a todo el personal.
Implementar la plataforma SaaS NEO Pulse para centralizar y digitalizar la gestión de inducciones,
reinducciones, capacitación corporativa, auditoría y seguimiento del cumplimiento de los colaboradores
de Transprensa.

El proyecto contempla la configuración de la plataforma, carga inicial de usuarios, personalización con
la identidad corporativa, implementación de cursos piloto, pruebas funcionales y capacitación de
administradores antes de la salida a producción.

### Alcance — Incluye
- Configuración inicial.
- Personalización gráfica.
- Gestión de usuarios.
- Evaluaciones.
- Certificados.
- Reportes.
- Auditoría.
- Capacitación.
- Soporte de implementación.

Esto debe ser muy completo y el mejor software innovador tipo e-learning. Voy a escribir todo lo necesario.

### 1. Multi-tenant
Debe ser multi-tenant. Se va a crear en base a Transprensa pero debe servir para más clientes, entonces
las configuraciones no se pueden hacer en base a un solo cliente sino que sea parametrizable todo por
tenant: información de la empresa, colores, branding, logo, parametrización de su negocio, todo.

Por ejemplo, ellos me piden que las evaluaciones de cada capacitación o inducción se deben ganar por
encima del 90% y quieren que sea fijo, pero esto debe ser por UI y por tenant porque otros clientes
podrían tener otras opciones diferentes. Es un ejemplo, pero todo debe ser por cliente.

### 2. Caminos de formación
Hay varios caminos:

**Inducciones generales:** inducciones que todo personal nuevo debe hacer obligatoriamente sin importar
el cargo. Todo muy parametrizable.

**Inducciones específicas:** las que se dan dependiendo del cargo. Cada cargo debe parametrizar qué
inducción debe hacer cada usuario dependiendo del cargo.

**Capacitaciones y plan de capacitación:** importante entender que el plan de capacitación es un plan
que se hace donde se planea y crean todas las capacitaciones que se van a realizar en un año. Es
importante separarlo de las capacitaciones que salen durante el año como extras o novedad o
microlearning. Sus métricas deben ser independientes. Por ejemplo, para cada capacitación hay
proyectados y los que asistieron; entonces si estamos en agosto y entró alguien nuevo, no puede hacer
las que estaban en meses anteriores porque ya pasó.

Las capacitaciones aparte —extras, novedad o microlearning, no sé cómo llamarlas aún, pero también las
del plan por si acaso— deben permitir asignar individualmente por usuario, o por cargo, o por área. Por
ejemplo, si sale una nueva se la puedan asignar a alguien en específico porque detectaron que lo
necesita, o a un área o cargos en específico.

Debe haber como un banco de capacitación por clasificación. No sé cómo lo manejan las mejores
plataformas de este tipo; debe ser muy innovadora y creativa.

### 3. Usuarios
Los usuarios nuevos se deben crear con correo personal porque aún no tienen correo corporativo, y hay
casos donde hay cargos operativos —no todos, pero por ejemplo auxiliar de bodega— que no tienen correo
corporativo. Estos usuarios nuevos, lo ideal sería que cuando tengan el correo lo tenga que cambiar el
admin, o el mismo usuario en su perfil, o desde admin.

Al crear usuario debe pedir datos básicos: nombre, cédula, teléfono, correo —también puede ser el
corporativo de una vez, puede que haya casos donde sí lo tenga al crearlo, entonces puede ser también—,
cargo y área.

Contraseña: debe permitir generar contraseña segura aleatoria automática (cédula + caracteres). Desde
admin, una opción de si el usuario le pide cambio. Pero en el primer ingreso sí debe pedir cambio.

Se debe poder cargar masivamente los usuarios desde un archivo, de forma rápida.

### 4. Roles
- **Superadmin**
- **Admin:** control total del tenant cliente.
- **Analista:** ve toda su gestión del área asignada. Son personas encargadas de gestionar las
  capacitaciones de su área. Control medio. Cada edición de capacitaciones o algo debe pedir aprobación
  del admin con justificación, por notificaciones.
- **Usuario final:** todos los demás. Consultar y realizar lo que tenga asignado como capacitación,
  inducciones, reinducciones, microlearning.

### 5. Información básica al crear una capacitación
(sea del plan, o extra, o novedad; no sé si microlearning, porque no sé si lleva lo mismo — creo que sí)

**Información Básica**

*Proceso / Área* — Seleccione proceso:
- SGI — Sistema de Gestión Integral
- LOGISTICA — Logística
- SST — Seguridad y Salud en el Trabajo
- PESV — Plan Estratégico de Seguridad Vial
- SEGURIDAD — Seguridad
- GESTION HUMANA — Gestión Humana
- SAC — Servicio al Cliente
- COMERCIAL — Comercial
- CONTABILIDAD — Contabilidad
- CONTROL INTERNO — Control Interno
- SARLAFT — Sistema de Administración del Riesgo de Lavado de Activos y de la Financiación del Terrorismo
- COMPRAS — Compras
- EXCELENCIA DEL SERVICIO — Excelencia de Procesos

*Responsable del Proceso:* Seleccione responsable (responsable de ese proceso o área, normalmente el
jefe de área).

*Instructor o capacitador:* persona quien da la capacitación. Se debe filtrar por los usuarios de esa área.

*Tipo de Cargo:* seleccionar tipos de cargo (módulo o parametrización de tipo de cargo, como
administrativos, operativos, comercial).

*Nombre de la Capacitación* (obligatorio)

*Descripción*

*Modalidad:* Presencial, Virtual, Híbrida

*Ejecutada Por:* Propios, Temporales, ARL, EPS, Otros (debe indicar cuál — campo abierto que se oculta;
"propios" no es necesario).

*Norma Aplicable:* N/A - No aplica. (Módulo o parametrizar normas como BASC, Resolución 2674 del 2013 —
BPM y HACCP, trinorma, RES-PESV — Resolución del PESV, y "no aplica").

**Alcance y Dirigido A**

*Servicios:* seleccionar servicios (almacenamiento, masivo o paqueteo — módulo de servicios).

*Regionales:* seleccionar regionales (debe haber un módulo de regionales).

*Dirigido A (Cargos):* seleccionar cargos destinatarios (módulo o parametrización de cargos).

**Programación**

*Fecha Programada*

*Intensidad (horas)*

*Total Proyectados*

*Observaciones*

### 6. Microlearning
Debe consultarse cómo se realiza esto, qué sería y cómo se ve. Debe ser muy innovador.

### 7. Módulos de parametrización
Debe haber módulo de áreas donde se pueda modificar, crear, eliminar dependiendo los permisos. También
de procesos —no sé si llamarlo lo mismo que áreas—; por ejemplo PESV es proceso, y un cargo no es un
área como tal.

---

## Bloque 2 — 2026-08-25 (aclaraciones del usuario)

El plan de capacitación creo que debe ser una entidad aparte, o ¿crees que sería tipo de curso?
Debe ser lo mejor. Esto es importante porque el Plan es un objeto empresarial de Transprensa.

No sé si implementar el SCORM de una vez sea lo mejor o dejarlo preparado.

En interfaz, "Contenido formativo" es mejor que "courses", o si es mejor en todas partes, no sé.

El Plan no debería "poseer" el curso. Debería referenciar actividades/ofertas planificadas.
Las otras (las que no son del plan) no pueden afectar las métricas del plan.

## Bloque 3 — 2026-08-25 (confirmación del usuario)

Asignación e Inscripción no son lo mismo, ¿cierto? Por ejemplo: asignación = ¿quién tiene la
obligación? e inscripción = ¿qué ocurrió con Usuario 1 en esa convocatoria?
Ejemplo: Usuario 1 → inscrito → asistió → terminó → aprobó. Y ¿qué ocurrió en cada evaluación?
Esto es así.

## Bloque 4 — 2026-08-25 (nueva capacidad: evaluacion de desempeno)

Hay una seccion importante de EVALUACION DE DESEMPENO donde se realiza cada ano o cierto tiempo,
donde se evalua al usuario en su cargo o como persona (no se). Son evaluaciones que se debe
permitir crear desde UI, muy parametrizables: tipos de preguntas y mas. Consultar como se debe
hacer y lo mejor, y que sea por tenant tambien.

No se como se verian las metricas de la evaluacion, pero NO deben afectar ni mezclarse con
capacitaciones o inducciones. Debe ser muy personalizado. Que lo pueda hacer quien tenga los
permisos.

(Prioridad: terminar el Sprint 1 primero; luego definir donde encaja esta capacidad.)
