# Arquitectura tecnica — NEO PULSE

Referencia VIVA del sistema: como esta construido HOY. Se corrige cuando cambia el diseno; no es
un historico (para eso estan `docs/sprints/`).

Para el significado de los conceptos de negocio, ver `docs/glosario.md`.

---

## 1. Mapa general

```
NAVEGADOR
  |
  |  transprensa.neopulse.app  (el subdominio identifica la empresa ANTES del login)
  v
apps/web  — Next.js 14 (App Router)
  |  Cliente HTTP tipado (lib/api.ts, lib/admin-api.ts, lib/catalog-api.ts)
  |  Token de acceso SOLO en memoria; renovacion con cookie httpOnly
  v
apps/api  — NestJS  (prefijo /v1)
  |  Guards: JWT -> Permisos
  |  Interceptor: fija la empresa del contexto
  v
PostgreSQL (con seguridad a nivel de fila)      Redis (previsto)      Almacenamiento (disco / R2)
```

**packages/shared** es la fuente unica de los contratos (esquemas Zod). La API valida con ellos y
la interfaz los usa para saber que enviar. Un cambio de contrato rompe la compilacion en ambos
lados, que es exactamente lo que se busca.

---

## 2. Aislamiento entre empresas (lo mas importante del sistema)

Una fuga de datos entre empresas seria catastrofica e irreparable. Por eso hay **dos capas
independientes**, no una:

### Capa 1 — La aplicacion
`PrismaService.scoped` devuelve un cliente ya atado a la empresa de la sesion:

```ts
// Correcto: filtrado por empresa, siempre
this.prisma.scoped.activity.findMany()

// Imposible de escribir sin darse cuenta: no hay forma de consultar "todo"
```

El interceptor guarda la empresa del usuario autenticado en el contexto de la peticion, y
`scoped` la lee de ahi. **Un desarrollador no puede olvidar el filtro porque no existe la version
sin filtro.**

### Capa 2 — La base de datos
Politicas de seguridad a nivel de fila en toda tabla con `tenant_id`. Antes de cada consulta se
fija la empresa en la transaccion; PostgreSQL descarta cualquier fila ajena.

La aplicacion se conecta con un usuario de base de datos **sin privilegios especiales**, sujeto a
esas politicas. Las migraciones usan otro usuario.

### La prueba que lo respalda
`pnpm db:verify-rls` comprueba tres cosas y **corre en integracion continua**:
1. Con el contexto de la empresa A no se ven filas de la B.
2. Sin contexto no se ve **ninguna** fila.
3. Intentar escribir una fila de la empresa B desde la A es rechazado por la base.

Si esa prueba falla, no se integra el cambio.

---

## 3. Autenticacion y permisos

### Flujo de ingreso
1. El subdominio determina la empresa (en desarrollo, un parametro en la URL).
2. La pantalla de ingreso carga la marca de esa empresa (endpoint publico, solo nombre y colores).
3. El usuario entra con **cedula o correo** y su contrasena.
4. Se emite un token de acceso (15 minutos) y una cookie de renovacion (7 dias, httpOnly).
5. Si es su primer ingreso: cambio de contrasena obligatorio y aceptacion de Habeas Data y del
   acuerdo de firma electronica.

**Por que el tenant va primero:** con ingreso por cedula, dos empresas pueden tener la misma. Sin
saber la empresa, el ingreso seria ambiguo.

**Proteccion contra fuerza bruta:** bloqueo por cuenta tras varios intentos fallidos (no solo por
IP, porque 18 personas detras del mismo NAT corporativo comparten IP). Todo intento queda auditado.

### Permisos, nunca nombres de rol
Los guards evaluan **codigos de permiso** (`catalog:publish`, `users:manage`). En el codigo no
existe `if (rol === 'ADMIN')`. Consecuencia practica: el administrador puede ajustar que hace
cada rol desde la interfaz, sin desarrollo.

Los permisos efectivos = permisos del rol + concesiones individuales − revocaciones individuales.

---

## 4. Las tres reglas de inmutabilidad

Todo el valor probatorio del sistema descansa en estas tres. Si alguna se rompe, el producto deja
de servir para auditoria.

### 4.1 Contenido publicado
Publicar una version **congela** todo:
- Las lecciones se **copian** a copias marcadas como publicadas, que rechazan toda edicion.
- Se congelan el temario (para las constancias) y la nota minima exigida.
- La version publicada rechaza agregar, quitar o reordenar contenidos.

"Editar" lo publicado crea la version siguiente en borrador, con copias editables. La anterior no
se toca.

**Verificado:** tras editar la leccion de la version 2, la de la version 1 conserva sus tarjetas
originales.

### 4.2 Preguntas y examenes
Editar una pregunta crea una version nueva. Cada intento guarda **que preguntas cayeron, en que
orden y con que opciones**, apuntando a la version que se sirvio.

Esto permite anular una pregunta defectuosa y recalificar solo a quienes les toco. Sin ese
detalle, una impugnacion no se puede defender.

### 4.3 Registros e historia
- Las membresias de audiencia guardan cuando se entro y cuando se salio; **nunca se borran**.
- Las obligaciones retiradas se marcan como retiradas, no se eliminan.
- Cada renovacion de una certificacion es un registro nuevo.
- Cada inscripcion guarda una foto del momento: titulo, version, nota minima y **el cargo y area
  que la persona tenia ese dia**.

---

## 4.5 El motor de obligaciones

Es el unico componente que **crea trabajo por su cuenta**, asi que su diseno se rige por tres
propiedades, en este orden:

**1. Idempotente.** Un indice unico de (requisito, persona, ronda) y `skipDuplicates` en la
insercion. El motor corre en dos disparadores a la vez —el alta de una persona y el ciclo horario—
y repetirlo no puede duplicar nada. Las obligaciones manuales y las del plan no llevan requisito,
asi que no entran en esa restriccion: esas se controlan en el servicio comprobando lo que ya esta
vivo.

**2. En caliente donde importa, en frio donde alcanza.** Al dar de alta a alguien o cambiarle el
cargo, sus obligaciones se recalculan en el acto: la matriz de competencia no puede mentir hasta
el proximo ciclo. Lo que solo cambia con el paso del tiempo —la reinduccion que cumple su ano, lo
que se paso de fecha— lo cubre un ciclo por hora. Si el enganche en caliente falla, no tumba el
alta: lo registra y el ciclo lo recupera.

**3. Una sola definicion de la regla.** El filtro que busca miembros y el predicado que decide en
memoria se derivan del mismo listado de facetas (`audience-rule.ts`). Dos implementaciones podrian
discrepar, y ahi la lista que ve el analista y las obligaciones que nacen dejarian de coincidir.

### Fechas: dia civil, no instante
Un vencimiento es un **dia**: "vence el 31 de enero" significa que a las 11 de la noche del 31
todavia se cumple. Todo vencimiento se ancla al cierre del dia en Colombia (que no tiene horario
de verano, asi que el desfase es siempre -05:00 y la aritmetica es exacta, sin libreria de zonas).

**La trampa, ya pagada una vez:** una columna de solo fecha (`hired_at`) llega como medianoche
UTC. Si se le aplica el desfase de Bogota, el 1 de diciembre se lee como 30 de noviembre y **todos**
los vencimientos anclados al ingreso se corren un dia. Hay dos funciones distintas a proposito
(`toBogotaDate` para instantes, `fromDateOnly` para fechas de calendario) y una prueba que falla
si se confunden.

---

## 5. Donde vive cada cosa

```
apps/api/src/
  auth/          Ingreso, renovacion, activacion de cuenta
  common/        Guards, decoradores, filtro de errores, auditoria, permisos, Sentry
  prisma/        Acceso a datos con aislamiento por empresa
  tenants/       Datos publicos de la empresa y sus preferencias
  catalogs/      Los 8 catalogos maestros (un solo motor para los ocho)
  roles/         Roles y sus permisos
  users/         Personas, contrasenas generadas, carga masiva
  approvals/     Solicitudes del analista y su aplicacion al aprobar
  notifications/ Bandeja de salida, bandeja interna y envio de correo
  storage/       Archivos con adaptador y validacion por firma binaria
  activities/    Catalogo formativo y MOTOR DE VERSIONADO
  lessons/       Lecciones y tarjetas
  assessments/   Banco de preguntas y constructor de examenes
  offerings/     Convocatorias y sus proyectados congelados
  assignments/   Audiencias, requisitos y MOTOR DE OBLIGACIONES
  plans/         Plan anual y sus metricas aisladas
  learning/      EL LADO DEL APRENDIZ: reproductor, intentos y cierre del ciclo
  engagement/    Repeticion espaciada, racha, puntos y cadencia de avisos
  workers/       Tareas programadas: obligaciones y avisos de pildora

apps/web/
  public/sw.js   Service worker propio: cache sin senal y cola de reenvio
  public/icons/  Iconos de la PWA (se generan con scripts/generate-icons.mjs)
  src/app/(admin)/    Panel de administracion (escritorio)
  src/app/(learner)/  Superficie del aprendiz (movil, barra inferior)
  src/app/(player)/   Reproductor y examenes (pantalla completa, sin chrome)
  src/components/ui/  Biblioteca del sistema de diseno "Pulso"
  src/components/layout/  Estructura: barra lateral, barra superior, sesion
  src/lib/            Clientes HTTP tipados

packages/shared/src/schemas/   Contratos Zod: fuente unica de la verdad
```

### Archivos que conviene conocer

| Archivo | Por que importa |
|---|---|
| `prisma/prisma.service.ts` | El aislamiento por empresa. Todo pasa por aqui |
| `activities/versioning.service.ts` | El motor de inmutabilidad. La pieza mas delicada |
| `assessments/question-payload.ts` | **El unico lugar** que sabe donde vive la respuesta correcta |
| `approvals/approvals.service.ts` | La compuerta del flujo del analista |
| `learning/completion.service.ts` | Cierra el ciclo ejecucion -> obligacion -> cobertura del plan |
| `engagement/nudge.ts` | El limite entre recordar y hostigar. Funcion pura, probada aparte |
| `apps/web/public/sw.js` | Que se guarda en el telefono y que se reintenta sin senal |
| `prisma/sql/rls.sql` | Las politicas de la base de datos |
| `.claude/skills/pulse-ui/SKILL.md` | El contrato de diseno de toda la interfaz |

---

## 6. Seguridad aplicada

| Riesgo | Como se ataja |
|---|---|
| Ver datos de otra empresa | Dos capas independientes + prueba automatica en integracion continua |
| Robo del token | El token de acceso vive solo en memoria, dura 15 minutos; la renovacion va en cookie httpOnly con rotacion en cada uso |
| Fuerza bruta | Bloqueo por cuenta, no solo por IP. Auditado |
| Ver las respuestas del examen | Un solo modulo las conoce; la vista del aprendiz las elimina, y una prueba falla si se filtran |
| Subir un ejecutable disfrazado | Validacion por **firma binaria**, no por extension ni por lo que declare el navegador |
| Saltarse la secuencia por API | Las validaciones viven en el servidor, no en la interfaz |
| Enumerar certificados | El codigo publico de verificacion es aleatorio, nunca el consecutivo |
| Filtrar datos personales a terceros | Sentry configurado sin datos personales |
| Leer la formacion de otro en un telefono compartido | Al cerrar sesion se borran el cache sin senal y la cola pendiente del dispositivo |
| Perder el avance de alguien por un token vencido | La cola de reenvio usa el token vigente que le pasa la pagina, no el que se guardo horas antes; un rechazo por sesion caducada CONSERVA el envio en vez de descartarlo |
| Que alguien lea los archivos de otra empresa | Los archivos se sirven por URL FIRMADA: pedirla exige sesion y comprueba el tenant; usarla no, porque una etiqueta `<img>` o `<video>` no puede autenticarse. La firma ata clave + caducidad + secreto del servidor, y se compara en tiempo constante |
| Dar por visto un video que nadie vio | Con archivo propio se cuentan los SEGUNDOS DISTINTOS reproducidos —adelantar deja huecos y no suma— y el avance se bloquea hasta el minimo exigido. Con video de otra plataforma no se puede medir y se registra como declaracion, dicho en pantalla |

---

## 7. Calidad: que corre y cuando

| Nivel | Que cubre | Cuando |
|---|---|---|
| **Unitarias** | Logica pura y delicada: generacion de contrasenas, traduccion de preguntas (incluida la que falla si se filtra una respuesta), validacion de archivos | En cada cambio |
| **Aislamiento** | Que una empresa no vea ni escriba datos de otra | Compuerta dura de integracion continua |
| **De extremo a extremo** | El flujo real en navegador, un archivo por sprint, acumulativo | Antes de cerrar cada sprint |
| **Humo por HTTP** | Flujos completos contra la API real (versionado, aprobaciones) | Al construir cada motor |

Integracion continua: un trabajo de calidad estatica (lint, tipos, compilacion, unitarias) y otro
de integracion (base de datos real, politicas de seguridad, datos semilla, aislamiento y pruebas
de navegador, con reporte adjunto si falla).

---

## 8. Entorno de desarrollo

```
pnpm docker:up      Base de datos y Redis (puertos propios; ver docs/02-aislamiento-proyectos.md)
pnpm db:migrate     Migraciones
pnpm db:rls         Politicas de seguridad de la base
pnpm db:seed        Datos semilla de Transprensa
pnpm db:verify-rls  Prueba de aislamiento
pnpm dev            API y web
pnpm lint / typecheck / test / build
pnpm test:e2e       Pruebas de navegador
```

**Se ejecuta con Node nativo de Windows, no desde WSL.** Medido: los mismos comandos tardan de 10
a 30 veces mas a traves del puente de WSL hacia el disco de Windows (la compilacion de la API
paso de mas de 5 minutos a 22 segundos). Detalle en `docs/RUNBOOK.md`.

---

## 9. Produccion

Decidido y analizado en `docs/03-infraestructura-produccion.md`. En resumen:

- **VPS propio** con todo en contenedores. No comparte nada con el entorno de SAC-NEO.
- **Cloudflare R2 para archivos**, por su trafico de salida sin costo: es la decision que evita
  que el video dispare la factura.
- **AWS descartado** para esta etapa: se paga el ecosistema sin usarlo y su trafico de salida
  castiga justo lo que mas consume el producto.
- Copias de seguridad diarias con copia fuera del servidor, y **restauracion probada** antes de
  salir a produccion.

**Lo que falta antes de desplegar:** el adaptador de R2 (hoy lanza un error explicito a proposito,
para que sea imposible desplegar sin completarlo), la definicion de contenedores de produccion,
los guiones de despliegue y respaldo, el dominio con subdominios comodin, y el monitoreo de
disponibilidad.

---

## 10. Deuda tecnica conocida

Honesta y priorizada:

| Deuda | Impacto | Cuando resolverla |
|---|---|---|
| Adaptador de almacenamiento en la nube | Bloquea el despliegue (a proposito) | Sprint de produccion |
| El despachador de correo recorre todas las empresas cada 30 segundos | Irrelevante con una empresa; con decenas conviene una cola real | Cuando haya varias empresas |
| La integracion continua nunca se ha ejecutado de verdad (no hay repositorio remoto) | El flujo esta escrito pero no probado | Al publicar el repositorio |
| Redis sin usar: sin cache de permisos ni colas | Rendimiento bajo carga; hoy el envio de correo y el motor de obligaciones usan tareas programadas en proceso | Cuando el volumen lo pida |
| El ciclo de obligaciones recorre requisito por requisito y persona por persona | Correcto y legible, pero con miles de personas y decenas de requisitos conviene resolverlo por lotes en la base | Cuando una pasada tarde mas de unos segundos |
| Un requisito solo puede exigir una **actividad** (no rutas ni certificaciones) | El modelo ya las soporta; el motor no. Devuelve un error explicito en vez de fingir | Sprints 4-5 |
| El cache sin senal guarda lo que la persona **ya visito**; no descarga por adelantado las lecciones que tiene asignadas | Quien nunca abrio la pildora con senal no puede cursarla sin senal | Cuando se sepa el peso real del contenido de Transprensa: es una precarga al entrar a los pendientes |
| Los videos y documentos no se cachean para uso sin senal | Un video de 3 minutos multiplica lo que se guarda en el telefono. La leccion de tarjetas —el formato principal— si funciona sin senal | Segun el peso del contenido real |
| Sin notificaciones push: el aviso de pildora sale por correo y bandeja in-app | El recordatorio llega, pero no al bloqueo de pantalla | Exige claves VAPID y permiso del usuario; se decide con el cliente |
| **Un video de YouTube/Vimeo no se puede verificar**: queda como declaracion de la persona | Media: para formacion que deba sostenerse ante un auditor conviene SUBIR el video, no enlazarlo | Se puede cerrar integrando la API del reproductor de YouTube (da estado y posicion). Mientras tanto, la pantalla lo dice y la recomendacion es subir el archivo |
| Publicar una version NUEVA no mueve a quien ya estaba inscrito, y la convocatoria sigue apuntando a la version vieja | Media: el administrador publica v2 y el aprendiz sigue viendo v1, sin explicacion en pantalla | Es correcto por diseno (politica de migracion, regla de oro 4), pero falta que la convocatoria pueda apuntar a la version nueva y que la UI lo explique |
| La franja horaria del aviso se deduce en cada pasada de los ultimos 60 dias de eventos (tope 5.000) | Suficiente para el piloto | Con miles de personas, materializar la hora en una columna |
| Especificacion de API generada desde los contratos | Util al integrar terceros | Baja |
| Plantillas de notificacion editables desde la interfaz | Hoy los textos viven en el codigo | Baja |
| SCORM sin motor | Solo importa si el cliente tiene contenido comprado en ese formato | Segun respuesta del cliente |

---

*Este documento se corrige cuando cambia la arquitectura. La historia de como se llego aqui esta
en `docs/sprints/`.*
