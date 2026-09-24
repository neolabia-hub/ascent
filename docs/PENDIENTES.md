# Pendientes

Todo lo que está abierto, en un solo sitio. **Se corrige**: cuando algo se hace, se borra de aquí y
se cuenta en el HANDOFF de esa sesión — al revés que el diario, que solo se anexa.

Existe porque los pendientes estaban repartidos entre siete documentos —el HANDOFF de cada sesión,
`00-el-motor.md` §9, `08-evidencia.md` §10, `seguimiento.md` §11, `05-cumplimiento.md`— y para saber
qué falta había que leerlos todos. Cada punto dice **dónde está el detalle**, para no repetirlo.

Al **2026-09-21**, con Programas (§11) y Sub-áreas (§12) cerrados y desplegados. Lo que de verdad
queda abierto está en **§10 (Producción)**, y no es código: vigilancia/Sentry —lo de más valor—,
rotar las credenciales de R2, el correo de soporte y la promesa de asistencia 24/7 del acta.

---

## 1. Bloquea al cliente / se nota en la pantalla

**Cerrado el 2026-09-06.** Los cuatro puntos se hicieron y se miraron en el navegador. El detalle de
como quedo cada uno esta en el `HANDOFF` de ese dia.

## 2. La evidencia, que quedó a medio camino

| | Qué falta | Detalle |
|---|---|---|
| 2.1 | ~~Subir el archivo~~ **HECHO el 2026-09-08.** Puerta propia `POST /media/evidencia` con `attendance:take` —no la de contenido, que pide `lessons:manage` y crearia un paquete del catalogo—, que solo acepta PDF e imagenes **comprobadas por sus bytes**. En pantalla: el acta al lado de la fecha (una por jornada) y el certificado bajo su numero (uno por persona). Los dos OPCIONALES: la lista marcada ya es evidencia y esperar al escaner dejaria jornadas sin cerrar. Recorrido: `asistencia-evidencia.mjs` | `HANDOFF` 2026-09-08 |
| 2.2 | ~~La segunda puerta~~ **HECHO el 2026-09-08.** Desde Usuarios, boton propio en cada fila (distinto del de constancias: son dos papeles distintos). Lista solo lo CERRADO que lleva papel —resolviendo la cascada tipo→ficha, que un filtro por columna se dejaria fuera— y al guardar propaga la vigencia a la obligacion. Puerta propia `PATCH /enrollments/:id/papel-de-tercero`, no la de asistencia: desde ahi no se esta tomando ninguna lista. Recorrido: `papel-desde-la-persona.mjs` | `HANDOFF` 2026-09-08 |
| 2.3 | ~~Quien llega con un certificado de otro empleo~~ **HECHO el 2026-09-08.** La via C, con DOS capas: la formacion declara si su papel es transferible (`admiteConvalidacion`, por defecto **NO** — una induccion no la exime nada) y aceptar cada papel concreto es un acto con nombre, fecha y motivo de 15 caracteres. Queda **CUMPLIDA, no eximida**. Migracion `20260908120000`: el papel vive en la OBLIGACION porque una inscripcion no puede existir sin jornada. Recorrido: `convalidar-papel-ajeno.mjs` | `HANDOFF` 2026-09-08 |
| 2.4 | ~~Los mecanismos 2 y 3 de la asistencia~~ **HECHO el 2026-09-08 (tarde).** QR de sesión que **rota cada 90 segundos** —un código fijo se fotografía y se manda al grupo— y que además se puede **dictar en voz alta**; firma en pantalla como PNG por puerta propia (`attendance:sign`, 300 KB, dato biométrico); y **acta en PDF** con la lista, las firmas y una huella de lo que el acta AFIRMA, no de los bytes. Los tres mecanismos cierran por el MISMO sitio, así que el informe y la obligación no se enteran de por qué puerta entró la marca. De paso: la evidencia subida **ya se puede volver a abrir** (antes solo se servía lo registrado como contenido). Recorrido: `qr-y-firma.mjs` | `08-evidencia.md` §5, CLAUDE.md §3.7 |
| 2.5 | ~~Las dos puertas del papel no aplican el mismo criterio~~ **HECHO el 2026-09-08 (tarde).** El criterio «si la dicta la empresa, no hay tercero que certifique» se saco a `certificate-policy.ts` y **las dos puertas lo importan**: copiado se separa, importado no. La fila dice ahora de donde sale (`origen`: del TIPO o de la FICHA) y **abre la formacion y la convocatoria** en pestaña nueva. Con `PROPIOS` la pantalla no pide el numero pero lo explica y deja registrarlo igual —defecto, no compuerta— y si ya hay papel guardado se enseña siempre. Recorrido: `dos-puertas-del-papel.mjs`, con la matriz de cuatro combinaciones · ~~detalle~~ | `HANDOFF` 2026-09-08 (tarde) |
| 2.6 | ~~¿Debe `INDUCCION_ESPECIFICA` llevar papel de un tercero?~~ **CERRADO el 2026-09-08: lo apagó el cliente** desde Configuración → Tipos de formación, que es donde tenía que decidirse. La inducción la dicta la propia empresa, así que ya no aparece pidiendo un certificado externo | `HANDOFF` 2026-09-08 (tarde) |
| 2.7 | ~~**¿Una jornada puede cerrar por CONTENIDO y aun así llevar lista?**~~ **HECHO el 2026-09-21.** Se desdobló en **dos preguntas**, que es lo que estaba mal de origen: un solo booleano respondía a la vez QUÉ ACREDITA y SI SE TOMA LISTA, así que elegir una descartaba la otra. Ahora la convocatoria pregunta «**qué se exige**» (la lista · el contenido · **las dos cosas**) y, aparte, «**¿se toma lista?**» —que solo se ofrece cuando acredita el contenido, porque si la lista acredita se toma por definición—. Con `CONTENT` + lista, el QR, la firma y el acta funcionan y **van al expediente sin cerrar nada**: la evidencia documental deja de ser una compuerta. Y aparece **«asistió Y aprobó»**, que es lo que un auditor pide en una presencial con examen y no se podía pedir; quien asiste pero reprueba **sigue debiéndola** (decisión tomada al abrirlo). Migración `20260921160000` sin pérdida: `true`→`ATTENDANCE`, `false`→`CONTENT`, `null`→`null`, así que **ninguna jornada ya dictada cambia de significado**. Cubierto por 459 unitarias (la matriz pasa de 27 a 108 combinaciones) y el recorrido `exigencia-y-lista.mjs`, 45 comprobaciones de punta a punta — que **destapó un fallo real**: con el temario terminado y sin asistir, el reproductor decía «Formación terminada» en verde a quien no había cumplido | `HANDOFF` 2026-09-21 |
| ~~2.7 (lo que decía antes)~~ | **Decisión del cliente: ¿una jornada puede cerrar por CONTENIDO y aun así llevar lista?** Lo preguntó el 2026-09-08 con un caso real: *un curso externo presencial donde la evaluación y la encuesta se hacen en la plataforma y además se quiere registrar la asistencia (firma, QR o a mano)*. Hoy es **excluyente** y a propósito (#158): la jornada declara cómo se cierra, y si cierra por contenido la lista no aparece. Las dos salidas de hoy: **(a)** cerrar por lista —la asistencia cumple la formación y el examen queda disponible pero no obliga— o **(b)** cerrar por contenido —el examen obliga, pero no hay lista ni QR—. Lo que falta es una tercera: **registrar asistencia como EVIDENCIA sin que cierre nada**. El modelo lo aguanta (`attendance_records` es independiente de la inscripción); lo que hay que decidir es si se ofrece, porque hoy la lista significa «esto queda cumplido» y esa tercera vía la convierte en dos cosas distintas según la jornada. **Vuelto a plantear el 2026-09-21**, con la intención dicha más claro que la primera vez: *«si la formación tiene evaluación se cierra por contenido, pero se quiere el QR, la firma o el acta **como constancia de que estuvo presente**»* — es decir, la asistencia como SOPORTE del expediente, no como forma de acreditar. Lo verificado ese día: hoy está bloqueado en el servidor, no solo escondido (`marcarAsistencia` → `OFFERING_NOT_ATTENDABLE`), y la salida parcial que ya existe es la modalidad **HÍBRIDA** (cierra por lista y además tiene contenido, pero entonces el examen no obliga). Forma propuesta si se aprueba: un tercer valor en «Cómo se acredita» —*«Al completar el contenido, y además se toma lista como evidencia»*— con la lista visible sin cerrar nada | `08-evidencia.md` §3 |

## 3. El informe de Vencimientos ~~que hoy enseña media verdad~~ — **REHECHO el 2026-09-08 (tarde)**

Los tres puntos se cerraron juntos porque eran el mismo: el informe partia por **de que tabla salia
el dato** en vez de por **que trabajo genera la fila**.

| | Que se hizo | Detalle |
|---|---|---|
| 3.1 | ~~Lee `certification_grants`, que no escribe nadie~~ **HECHO.** Ahora lee las tres fuentes que SI se escriben: `assignments.valid_until_override` (lo que dice el papel de un tercero, #157), `certificates.valid_until` (la constancia propia, #111) y `assignments.due_at` de las abiertas. Cada fila dice ademas **segun que** vence, que es lo que pregunta quien la lee | `expirations.ts` |
| 3.2 | ~~Y su EJE esta mal~~ **HECHO.** El eje es **REPROGRAMAR** (ya la tuvo y deja de estar acreditado: hay que volver a convocarla) frente a **PERSEGUIR** (nunca la ha cumplido y tiene plazo: hay a quien llamar). Y se **consolida por persona + formacion**: quien esta en su ventana de 60 dias salia en las dos series, contando dos veces el mismo trabajo | `expirations.ts`, `consolidar()` |
| 3.3 | ~~Nadie recibe nada~~ **HECHO.** Aviso semanal los lunes a la **bandeja** —no correo, decision del cliente— a quien tiene `reports:read_scope`. Un aviso por persona y no uno por vencimiento; dice las dos cifras por separado y nunca la suma; y si no hay nada, no se manda. El plazo lo decide el tenant (`expirationDigestDays`, 45 por defecto, 0 lo apaga). Se puede disparar a mano: `POST /reportes/vencimientos/avisar` | `expiration-digest.ts` · Preferencias |

Recorrido que lo prueba entero, incluida la bandeja: `vencimientos.mjs`.

## 4. El motor, con cosas anotadas y medidas

| | Qué falta | Detalle |
|---|---|---|
| 4.1 | ~~Una formación exigida por DOS reglas vivas le nace dos veces~~ **HECHO el 2026-09-08 (tarde).** Y **sí se había visto en la práctica**, en contra de lo que decía esta línea: publicar una inducción crea sola su regla de «toda la empresa», así que cualquier inducción publicada Y exigida además a un cargo ya tenía dos reglas vivas. El motor ahora mira si esa persona **ya debe esa misma formación** antes de abrirle la ronda 1 —igual que la asignación manual, que ya lo hacía—, y si la regla que la creó se retira, la otra la vuelve a crear. Recorrido: `dos-reglas-una-obligacion.mjs` | `00-el-motor.md` §9.3 |
| 4.2 | ~~La primera ronda de una campaña no cae en la fecha de la campaña~~ **YA ESTABA CERRADO desde el 2026-09-04** y esta lista se quedó atrás, igual que el 4.3. La regla que se tomó: si falta **más que la ventana (60 días)**, la primera ronda vence **en la fecha de la campaña**; si falta menos, a los 30 días de gracia — estrenar una reinducción el 15 de marzo con vencimiento el 31 daría dos semanas para 1.060 personas. Medido: publicada el 2026-09-04, la primera vence el 31 de marzo de 2027 | `03-reinduccion.md` §5, `due-date.ts` |
| 4.3 | ~~La campaña alcanza a quien acaba de ingresar~~ **YA ESTABA CERRADO desde el 2026-09-04** y esta lista se quedó atrás: la gracia por ingreso reciente existe (`exemptRecentHiresMonths`), la aplica el motor y se configura en Tipos de formación. La semilla la deja en 6 meses para REINDUCCION | `03-reinduccion.md` §9.2 |
| 4.4 | **La constancia propia y el papel del tercero llevan fechas de vigencia distintas.** Sigue abierto como algo que mirar, no como fallo. Desde el 2026-09-08 el informe de Vencimientos ya no se calla cuál manda: consolida las dos en una fila, se queda con **la que caduca antes** y dice de cuál de los dos documentos salió | `08-evidencia.md` §10.6 |

## 5. Producto — **decidido el 2026-09-08: todo esto va DESPUÉS del despliegue**

No es aplazar por aplazar: ninguno de los tres cambia lo que hoy se puede demostrar en una auditoría,
y dos de ellos se hacen mejor con el piloto andando —uno necesita datos de uso reales y el otro
depende de un trabajo del Sprint 6—.

| | Qué falta | Detalle |
|---|---|---|
| 5.1 | ~~Repaso: avisar segun lo que cada quien fallo~~ **HECHO el 2026-09-14.** El motor de repeticion espaciada ya existia; lo que faltaba era el AVISO. Nuevo worker diario (`ReviewDigestWorker`) que nombra el TEMA con mas preguntas vencidas —"Tienes 4 preguntas de Seguridad vial esperando repaso"—, no solo el numero. **Parametrizable por tenant desde Preferencias**: `reviewDigestMinDue` (minimo de preguntas vencidas para avisar; 0 = apagado, mismo convenio que `expirationDigestDays`). Probado de punta a punta contra la base de desarrollo: `enviados:2`. **Y los propios ESCALONES (1, 2, 7, 14, 30 dias) dejaron de ser una constante**: ahora son `reviewIntervalsDays` en Preferencias, editable como lista de dias crecientes (2 a 8 escalones), validado en el cliente y en el servidor (Zod `refine`). `spaced-repetition.ts` ya no lee una constante del modulo: recibe los intervalos del tenant como parametro. 20/20 pruebas nuevas entre las dos piezas | `engagement/review-digest.ts`, `engagement/spaced-repetition.ts`, Preferencias |
| 5.2 | ~~Una fila por persona en Seguimiento, no por ronda~~ **HECHO el 2026-09-14.** `consolidarPorPersona` en `execution-state.ts`: entre varias rondas de la misma persona, gana la ABIERTA mas urgente; si todas estan cerradas, gana la mas RECIENTE. Misma regla que ya usa Vencimientos (`gana()`), a proposito. La fila lleva un `3×` si hubo mas de una ronda, sin volver a mostrar la historia entera. 26/26 pruebas | `execution-state.ts`, `reports.service.ts` |
| 5.3 | **La matriz de vigencias del trabajador** —exámenes médicos, licencias de conducción, EPP— como módulo aparte y **cotizado aparte**. Después del despliegue, y solo cuando haya un cliente que lo pida | `HANDOFF` 2026-09-05 |

## 5 bis. Lo que decidió el cliente el 2026-09-08 (tarde)

| Qué | Decisión |
|---|---|
| **SCORM** (comprar cursos empaquetados a un proveedor) | **Importante, pero después.** La base ya lo soporta; el reproductor son 3-6 semanas y solo hace falta el día que se compre contenido de fuera |
| **Contenido y firmantes de la constancia** | **Lo carga el cliente en producción.** Es su plantilla, su logo y sus firmas: se configura en Configuración → Constancias cuando el piloto esté arriba |
| **Umbral SARLAFT** | Pendiente de su área legal. No es código: si aplica, se resuelve con una regla de audiencia |
| ~~Temas, banco y biblioteca no se pueden renombrar~~ | **HECHO el 2026-09-09.** Un tema se crea, se **renombra** y se borra desde el propio editor de la evaluación («Crear, renombrar o borrar temas»), con su número de preguntas a la vista; una pregunta se puede **retirar del banco** desde el buscador; y «biblioteca» pasó a llamarse «Traer una lección ya creada», que es lo que es |

## 5 ter. Carga masiva de personas — abierto el 2026-09-21

| | Qué falta | Detalle |
|---|---|---|
| 5.4 | ~~**Simular la carga antes de aplicarla.**~~ **HECHO el 2026-09-21.** Subir el archivo ya no aplica nada: primero enseña **lo que pasaría** —cuántas se crearían, cuántas cambiarían y, en cada una, **qué campos**— y se aplica en un segundo clic con esa lista delante. `POST /users/import/simular` recorre **el mismo método** que la carga real con un `simular: true` que solo rodea las escrituras: una vista previa que siguiera otro camino prometería un resultado y entregaría otro. Probado por donde importa —`sin-correo.mjs` paso 9 mide la base **antes y después** de simular y comprueba que no se movió ni una fila, y que aplicar después sí hace exactamente lo que la vista previa prometió | `HANDOFF` 2026-09-21 |
| ~~5.4 (lo que decía antes)~~ | **Simular la carga antes de aplicarla.** Hoy la recarga del archivo ACTUALIZA a quien ya está, y eso es lo que una empresa necesita —el archivo mensual con las altas y los traslados— pero abre una colisión real que el cliente cazó: *si alguien corrige un correo a mano el martes y el jueves se sube un archivo viejo con el correo anterior, el archivo lo vuelve a poner*. No hay forma de que el sistema adivine cuál manda: los dos los escribió una persona de la empresa. Hoy se mitiga con costumbres (trabajar sobre el archivo más reciente, quitar del archivo las columnas que se llevan a mano, y revisar el informe, que dice **qué campos** cambió en cada persona) y está escrito en `guias/guia-usuarios.html`. Lo que lo resolvería es un **paso de simulación**: subir el archivo, ver la lista de lo que cambiaría —«a 12 personas les cambia el área, a esta le reemplaza el correo»— y confirmar o cancelar. Es lo que hacen los sistemas serios con una carga que escribe sobre datos vivos | `HANDOFF` 2026-09-21 |

## 6. Operación

| | Qué falta | Por qué importa |
|---|---|---|
| 6.1 | ~~No hay remoto en git~~ **HECHO el 2026-09-09.** El repositorio vive en `github.com/neolabia-hub/ascent` (privado), y la máquina de producción lo clona con una **llave de despliegue de solo lectura** distinta de la del PC: si un día hay que revocar una, la otra sigue viva | `HANDOFF` 2026-09-09 (noche) §2 |
| 6.2 | ~~Limpiar los datos de prueba~~ **HECHO el 2026-09-07.** `e2e/global-teardown.ts` corre los dos scripts al terminar la suite, asi que ya no hay que acordarse. A mano: `pnpm --filter @neo-pulse/api dev:limpiar-pruebas` (ensayo) y `-- --si`. Queda como IDEA, no como pendiente: un borrado de verdad por prefijo para vaciar la base de vez en cuando — otro trabajo y con otro riesgo, porque en cascada se lleva evidencia por delante | `HANDOFF` 2026-09-07 |
| 6.3 | ~~Un aviso de lint de siempre~~ **HECHO el 2026-09-07.** `autoPlan` entra en las dependencias del `useEffect`. Se omitia porque quien abre el cajon le pasa siempre el mismo valor, pero eso es una promesa de quien LLAMA y nada la sostiene: el dia que alguien lo calcule, el cajon se queda con el plan de la apertura anterior y no pide el motivo. **Lint del proyecto: cero avisos** | — |
| 6.4 | ~~Las tildes comidas~~ **HECHO el 2026-09-07 para lo que se VE**, que es lo que pidio el cliente (*"los comentarios no importan"*). 1.103 correcciones en 185 archivos con un barrido que solo toca cadenas, prosa y comentarios — **nunca identificadores**: `const tamano` y `const campana` existen de verdad y renombrarlos es otro trabajo. Un rastreo posterior solo del texto visible da **0 hallazgos**. Quedan sin tilde algunos comentarios sueltos, a proposito | `HANDOFF` 2026-09-07 |
| 6.5 | **Repaso de estilo con la referencia del cliente.** Hecho lo que se puede aplicar de una vez y sin riesgo: **un solo radio (`rounded-lg`) para Input, Textarea, Button y Select**, el mismo de las tarjetas — antes los controles iban mas duros que la caja que los contiene. Falta el resto de la referencia (sombras, pastillas, espaciados), que es trabajo de diseño y conviene hacerlo mirando pantalla por pantalla | — |
| 6.6 | ~~Un fallo intermitente que queda en la e2e~~ **NO EXISTE: era lo mismo (2026-09-07).** Aquella corrida en rojo empezo con la base sucia —el teardown se acababa de escribir y solo limpia al TERMINAR—. Desde que cada corrida arranca de una base ya recogida: **21/21, 21/21 y 21/21 seguidas**, y ademas mas rapidas (4,0 → 3,6 → 3,4 min frente a los 6,7 de antes). La leccion, otra vez la misma: con una muestra no se distingue una intermitencia de una condicion del entorno | `HANDOFF` 2026-09-07 |
| 6.7 | ~~Las guias de usuario se quedaron atras del producto~~ **HECHO el 2026-09-08 (tarde).** `guias/asistencia.html` cubre el QR, la firma, el acta, el contador en vivo y las dos puertas del papel; `guia-usuarios.html`, los dos botones de la fila y la convalidación; `guias/recertificacion.html`, la certificación previa; y `guia-numeros-neo-pulse.html` describía todavía el eje viejo de Vencimientos. Cada afirmación sale del código, con los textos de la pantalla copiados de la fuente. **Lo que decía antes:** `guia-usuarios.html` no menciona *Papeles de un tercero* ni la convalidacion —y las dos se hacen justo en esa pantalla—, `guias/recertificacion.html` no menciona la certificacion previa, y `guias/asistencia.html` no cubre el acta ni el archivo del certificado. **Como escribirlas, que el cliente lo pidio expreso:** cada afirmacion sale **del codigo**, con la pantalla delante — textos de botones, campos obligatorios y mensajes de rechazo copiados de la fuente, no recordados; una guia que describe un boton que no existe es peor que no tenerla. **Cuando:** despues del **2.4**, o la de asistencia hay que reescribirla cuando lleguen el QR y la firma | `HANDOFF` 2026-09-08 (cierre) |

---

## 7. Evaluaciones — la sesión del 2026-09-09 (tarde)

Lo que estaba abierto por la mañana se cerró por la tarde, con el cliente mirando la pantalla. El
detalle está en el `HANDOFF` de ese día (§10).

| | Qué falta | Por qué está abierto |
|---|---|---|
| 7.1 | ~~El gestor de temas se abre desde un enlace de texto~~ **HECHO.** Pasa a **icono en la cabecera, arriba a la derecha** (`Tags`), que es donde lo pidió. Y de paso deja de depender del bloque al azar: allí solo existía si ese bloque era el paso activo, pero un tema también se le pone a una pregunta suelta, así que la puerta tenía que estar siempre | Petición literal del 2026-09-09 |
| 7.2 | ~~Decidir la descripción al agregar contenido~~ **HECHO: fuera en evaluación y encuesta.** La descripción la lee quien cursa **junto al contenido** en el reproductor; en un examen lo que se abre es el examen y nadie la ve. En lección, vídeo, documento y enlace se queda | El cliente lo dejó a nuestro criterio (*«si crees que es necesario déjalo, si no quítalo»*) |
| 7.3 | **Editar el texto de una pregunta desde el gestor de temas.** Sigue sin poderse, **a propósito**: se trae a una evaluación con «Traer una ya escrita» y se corrige allí. Lo que sí se arregló es que no se veía cómo llegar a las preguntas de un tema —*«dónde se editan las preguntas de ese tema no la veo»*—: ahora cada tema tiene su botón **«N preguntas»** en vez de desplegarse pulsando el nombre, que no parecía pulsable | Editar allí crearía una versión nueva (#6) desde un sitio donde no se ve el examen que la usa. **Decisión de producto: no se hace** |
| 7.4 | ~~«Tema nuevo» era un campo de crear y la lista no se podía filtrar~~ **HECHO.** Un solo campo que **busca y crea**: filtra según se escribe y, solo si lo escrito no coincide con ningún tema, ofrece «Crear ...». El nombre no se pide dos veces | Petición del 2026-09-09 |
| 7.5 | ~~Crear una evaluación desde una formación pedía tema y cuántas al azar~~ **HECHO: solo el título.** Los dos campos eran obligatorios y se pedían **antes de que existiera una sola pregunta**; sin temas en la empresa, el botón Agregar no se dejaba pulsar y **no había forma de crear una evaluación desde ahí**. Ahora nace vacía y se abre su editor, como una lección | El cliente preguntó si no era mejor «solo nombre y ya». Lo era |


## 8. La interfaz

| | Qué falta | Detalle |
|---|---|---|
| 8.1 | ~~El acento del tenant solo llega a dos pantallas~~ **RETIRADO el 2026-09-09: lo tumbó el cliente.** El acento de TRANSPRENSA es verde (`#367d17`) y los dos botones que lo llevaban —Publicar cambios, Dar por cumplida a N— se leían como un semáforo y no como el paso siguiente. Vuelven al color principal; la variante sigue en `button.tsx` sin usarse. El verde de esta empresa se queda para los **sí/no de la ficha**, donde el color sí significa algo | Decisión #166, retirada |
| 8.2 | ~~El recorrido por etapas solo lo usa la ficha de la formación~~ **RETIRADO el 2026-09-09: lo tumbó el cliente** (*«el selector de formación no me gustó nada»*). Las cinco vistas vuelven a **pastillas**, la forma del resto del producto, y el selector se muda a **su propia fila** — que es lo que de verdad arreglaba la queja de las tres formas anteriores: compartía fila con Publicar y Eliminar. `Etapas` se **borró** de `view-tabs.tsx`: una variante que no usa nadie invita a volver a usarla, y un recorrido afirma un orden que estas cinco vistas no tienen | Decisión #165, retirada |
| 8.3 | ~~El título de Inicio podría reconocer un logro~~ **HECHO el 2026-09-14.** Nueva racha de EMPRESA (`TenantComplianceStreak`, un worker diario a las 6am) que cuenta dias seguidos con cero vencidos — sin protectores, a diferencia de la racha personal: para la evidencia de cumplimiento no hay nada que perdonar. Con 2 dias o mas, el titular de Inicio dice «Nadie tiene nada vencido: N dias seguidos»; con menos, sigue diciendo «Todo al dia». Usa el MISMO calculo de Vencimientos (nunca un numero aparte). 9/9 pruebas | `reports/compliance-streak.ts`, Inicio |

## 9. Sprint 6 — lo que se revisó el 2026-09-09

El cliente pidió repasarlo antes de producción (*«métricas, KPIs, aún no hay dashboard»*). El
inventario honesto: **sí había** —Inicio con sus cuatro avisos y el % de cumplimiento, Analítica con
siete cortes, Vencimientos, medición del plan, matriz cargo × inducción— pero faltaban tres cosas, y
las tres están **HECHAS**. El detalle en `HANDOFF` 2026-09-09 y en `docs/modulos/seguimiento.md`.

| | Qué | Estado |
|---|---|---|
| 9.1 | ~~**El perfil de una persona.** Es la Definición de Terminado del propio sprint: «el auditor obtiene, para una persona cualquiera, su historial completo con soportes en menos de un minuto». Los datos estaban en tres pantallas y había que unirlos a mano~~ | **HECHO, y rehecho el 2026-09-09 (noche): es una PÁGINA** (`/usuarios/[id]`), no una ventana — *«página completa, es tipo perfil con todo lo importante»*. Banda de la marca, las cuatro cifras, lo que le falta, su trayectoria, sus constancias y sus papeles. Es de LECTURA: no reemplaza a los cajones de la fila, que son para hacer |
| 9.2 | ~~**La evolución en el tiempo.** Todo era una foto de hoy: no se podía contestar «¿vamos mejor que en enero?»~~ | **HECHO.** «Cómo fue el año» encima de los cortes de Analítica. Mide lo que VENCÍA cada mes y cuánto se cumplió — no el histórico del indicador, que nadie guardó |
| 9.3 | ~~**Conocimiento por tema.** Los informes decían cuántos aprobaron, ninguno qué fallaron~~ | **HECHO.** «En qué falla la gente», con las preguntas más falladas aparte: la que casi todos fallan o no se enseñó, o está mal redactada |
| 9.4 | **Transcripción automática de los vídeos** (subtítulos con Whisper). Decidido el 2026-09-09: los vídeos se quedan en R2 —no en YouTube— porque la evidencia tiene que servirse con URL firmada atada a la sesión, y eso obliga a poner los subtítulos nosotros | **ESPERA.** Va después del despliegue. ~USD 36 una vez por todo el catálogo, con revisión humana antes de publicar. Necesita una clave de API |
| 9.5 | **Lo demás del Sprint 6**: visor del registro de auditoría, retención y anonimización, IA de borradores desde PDF, exportes de auditor por lote | Ninguno bloquea el piloto |
## 10. Producción — abierto desde el despliegue del 2026-09-09

Ascent está viva en `https://transprensa.ascentio.app`. Lo que queda no es código de producto: es lo
que rodea a un sistema que ya tiene un cliente dentro. El detalle, en `HANDOFF` 2026-09-09 (noche),
`docs/05-reglas-de-despliegue.md` y `ASCENT - CREDENCIALES Y ACCESOS.md`.

> **Campaña de primer ingreso con la cédula: ABIERTA el 2026-09-24** (998 personas, 3 ADMIN fuera).
> Falta **cerrarla** al vencer el plazo que se anuncie: `--cierre` (ensayo) y `--cierre --si`.
> Comando exacto en `05-reglas-de-despliegue.md` §2. Mientras no se cierre, quien conozca la cédula
> de otra persona puede entrar por ella. El script no esta en la imagen desplegada todavia: si se
> cierra antes del proximo despliegue, hay que volver a copiarlo al contenedor (ver `HANDOFF`).
>
> Y está **pendiente de desplegar**: el perfil con «Tus datos» y los filtros de Configuración
> (commits `3cc0796`..`5eb7ca8`, ya en GitHub).

| | Qué falta | Por qué importa |
|---|---|---|
| 10.1 | **Rotar las credenciales de R2** (las cuatro variables `R2_*` de `/opt/ascent/.env.prod`) y **la contraseña de la cuenta de plataforma** | Las dos se escribieron en una conversación. Una credencial que salió de su sitio ya no vuelve a estar secreta: se cambia, no se borra el rastro. Cómo, en el archivo de credenciales §2 y §3 |
| 10.2 | **Decidir el correo de soporte de verdad.** `soporte@ascentio.app` existe y recibe, pero **no lo atiende nadie** | Es lo que el cliente ve cuando algo le falla. Un contacto que no responde es peor que no dar ninguno: promete atención que no existe. Hasta decidirlo, no debería prometer plazo |
| 10.3 | ~~Limpiar los datos de prueba en producción~~ **HECHO — el cliente lo configuró.** El contacto de soporte de TRANSPRENSA ya está corregido en *Configuración* | — |
| 10.4 | **Vigilancia: no hay ninguna.** Hoy el primer aviso de una caída lo daría el cliente | Sentry (gratis hasta 5.000 sucesos) más un vigilante de disponibilidad sobre `/v1/health`. Es una tarde, y la misma cuenta sirve para Ascent **y** para SAC-NEO. Decidir si se centraliza o cada producto lleva el suyo |
| 10.5 | **LibreOffice no está instalado**: un `.pptx` se rechaza pidiendo el PDF | Es una decisión, no un olvido: no cabe en 4 GB. Si molesta, `libreoffice-impress` y la máquina de 8 GB (USD 24 más) |
| 10.6 | ~~**Entregar formalmente al cliente**~~ **El paquete está hecho** (`docs/entrega/`): bienvenida, acta, ficha técnica, los dos correos y la ficha de acceso. Falta **enviarlo** | Antes de enviar hay que cerrar seis cosas, listadas en `docs/entrega/00-antes-de-enviar.md`. Tres son de esta misma tabla (10.1, 10.2, 10.3) |
| 10.7 | **La política CORS del bucket `ascent-media`** sigue sin poner: el token del servidor no puede, tiene permisos de objeto y no de bucket (`AccessDenied` en `PutBucketCors`) | El vídeo **ya se reproduce** sin ella —se arregló quitando el `crossOrigin` que forzaba el modo CORS—, así que no corre prisa. Pero el día que los vídeos lleven subtítulos, una pista `<track>` de otro origen **sí** la exige. Dos minutos desde el panel: R2 → `ascent-media` → Settings → CORS Policy, con lo que imprime `bash scripts/r2-cors.sh` |
| 10.8 | ~~El QR de la constancia no abre solo~~ **HECHO el 2026-09-11.** El margen del QR estaba en 1 modulo; la norma ISO/IEC 18004 pide 4. Sin esa "zona tranquila" el lector detecta el texto pero no lo trata como enlace fiable — exactamente el sintoma. Subido a produccion, pendiente de que el cliente confirme escaneando una constancia nueva | `certificate-render.service.ts` |
| 10.9 | **El asistente automático 24/7 no existe todavía** y ya está prometido | El acta de entrega y la ficha técnica dicen que fuera del horario hay atención automática. Construirlo, cambiar la frase por lo que hoy es cierto, o ponerle fecha — **antes de firmar**. `docs/entrega/00-antes-de-enviar.md` §2 bis |

## 11. Programas (agrupar formaciones, certificar por el conjunto) — ~~abierto el 2026-09-14~~ **CERRADO Y DESPLEGADO el 2026-09-21**

> **Todo lo de esta sección está en producción desde el 2026-09-21** (42 migraciones). Donde una fila
> diga «NO desplegado» es historia de cuando se escribió, no el estado de hoy. Lo único que sigue en
> manos del cliente es **11.5**: el campo `modulos` de la constancia existe y está apagado; colocarlo
> en la plantilla real es una decisión de quien diseña el arte.
>
> Se cerró con: la guía de usuario `docs/guias/programas.html`, la documentación técnica en
> `docs/modulos/programas.md`, y un recorrido de punta a punta (`scripts/recorridos/programa.mjs`,
> 15 pasos con asignaciones reales, los tres tipos de asistencia, certificados y llegada a
> Seguimiento) que **destapó un fallo de producto real**: `certificateHours` no lo escribía nadie y
> las constancias salían sin horas.

El cliente pidió que varias formaciones ("Gestión Humana", "Comercial"...) se vean y se certifiquen
como **un solo programa** ("Programa de Inducción General"), no como formaciones sueltas, con reglas
de aprobación parametrizables por tenant (ej. "7 de 9 módulos", con alguno obligatorio sí o sí). El
detalle completo en `HANDOFF` 2026-09-14.

| | Qué | Estado |
|---|---|---|
| 11.1 | **Fase 1 — el motor de la regla y el enganche al cierre.** Se reusó el esquema `LearningPath`/`PathItem`/`PathEnrollment`, que ya existía en Prisma sin construir. `program-completion.ts` (`evaluarPrograma()`) combina módulos obligatorios (`PathItem.isRequired`) con cupos opcionales por sección (`sectionName` + `minRequiredInSection`) — cubre el caso exacto del cliente. Wireado en `completion.service.ts`, en LOS DOS puntos de cierre (por contenido y por cualquier tipo de asistencia: QR, firma, instructor), para que **NO se emita constancia individual** si la formación es módulo de un programa publicado, y para recalcular el progreso del programa cada vez que se cierra una de sus formaciones. 8/8 pruebas de la regla + verificación manual (con transacción RLS correcta) de los tres escenarios de asistencia | **HECHO, verificado en dev, NO desplegado** |
| 11.2 | **Fase 2 — emitir la constancia DEL PROGRAMA cuando se completa.** `Certificate.pathEnrollmentId` (migración `20260914200000_certificados_programa`, aplicada en dev) + `CertificatesService.emitirPorPrograma()` (snapshot con nombre del programa, "Programa" como tipo, horas = suma de las de los módulos aprobados, idempotente por el índice único parcial). Enganchado en `ProgramsService.recalcularProgreso`: dispara sola cuando `recienCompletado: true`, sin tumbar el recálculo si falla. Verificado con una prueba de punta a punta contra la base de dev (`scripts/verificar-constancia-programa.ts`, autocontenida y que limpia lo que crea): a medias no emite, al completar el segundo módulo emite una sola vez, y un segundo recálculo no duplica | **HECHO, verificado en dev con petición real (no aislada), NO desplegado** |
| 11.3 | **Matricular gente a un programa.** No hay un requisito de tipo PATH nuevo en el motor: "Asignar a una audiencia" en la ficha del programa exige CADA módulo con `AssignmentsService.setActivityRequirement`, una vez por módulo, misma audiencia — reusa el motor entero, incluida la regla PLAN sin tocarla. `ProgramsService.asignarAudiencia` | **HECHO, verificado en dev con e2e (`e2e/programas.spec.ts`) y a mano** |
| 11.4 | **Interfaz — admin y aprendiz.** Admin: `/programas` (listado con filtro por estado, tarjetas sin código visible) y `/programas/[id]` (módulos con reordenar arriba/abajo, formulario EN LÍNEA para agregar/editar módulo, panel de "Asignar a una audiencia" SIN `sticky` y con la explicación colapsada en un icono de información, descripción editable inline, publicar/"Volver a borrador"). Aprendiz: tab "Programas" en Mi aprendizaje, fila "Programas" en Hoy (con su propio filtro, mismo criterio de prioridad que el resto — empezado antes que sin empezar) y `/programa/[id]` con los módulos como contenido. `LearningPath.description` (migración `20260915090000_programa_descripcion`) | **HECHO, verificado en dev con e2e y a mano** |
| 11.5 | ~~**La constancia del programa AHORA PUEDE listar sus módulos.**~~ **CERRADO el 2026-09-20.** El campo `modulos` nace con `visible: false` en el diseñador: se activa y se coloca en *Configuración → Constancias*, sobre la plantilla del tenant. No queda trabajo de código — es una decisión de quien diseña el arte, y ya se puede tomar. Campo nuevo `modulos` en el diseñador de plantillas (`certificate-layout.ts`, `certificate-pdf.ts`): multilínea, apagado por defecto, solo imprime algo en una constancia DE PROGRAMA (usa `formacion.syllabus`, que ya se guardaba y no se usaba en ningún lado). Verificado en el editor; NO colocado en la plantilla real del cliente todavía —eso lo decide quien diseñe el arte— | **Campo construido y verificado, sin colocar en la plantilla en uso** |
| 11.6 | **Reinducción como programa: la ronda se abre sin pisar la anterior.** `PathEnrollment.cycleNumber` (migración `20260915120000_programa_ciclo`, única ahora por `pathId+userId+cycleNumber` — "una fila por ronda, inmutable", mismo patrón que `CertificationGrant`). La ronda del programa sale de la más adelantada de las `Assignment.cycleNumber` de sus módulos (`cicloDePrograma()` en `program-completion.ts`); cada módulo se da por aprobado según su `Assignment` MÁS RECIENTE, no su historial de `Enrollment`. Al abrirse una ronda nueva se crea una fila aparte (nueva constancia), sin tocar la de la ronda anterior. Verificado de punta a punta contra la base de dev (script borrado tras usarlo) + 5 pruebas nuevas de `cicloDePrograma`. Detalle en `HANDOFF` 2026-09-15 (continuación 2) | **HECHO, verificado en dev, NO desplegado** |
| 11.7 | ~~**Aviso de "asignación automática" para programas de Inducción General.**~~ **HECHO el 2026-09-15.** El panel de "Asignar" detecta los módulos cuyo TIPO ya se exige solo a toda la empresa al publicarse y lo dice. **No se deduce del nombre del programa ni del código del tipo** —los dos son datos del tenant, renombrables— sino de `activityType.config.defaultAssignmentMode === 'ON_HIRE'`, que es lo que lee `aplicarExigenciaAutomatica` de verdad; más `requiresBeforeHire`, que se dice aparte porque cambia A QUIÉN alcanza (con él la regla nace `soloNuevos` y **no toca a la plantilla actual**, que es justo lo que alguien daría por hecho al leer "se asigna sola a toda la empresa"). El aviso dice además cuántos tienen ya su regla activa, y que asignar igualmente no pisa esa regla —queda una segunda, y la obligación nace una sola vez (4.1)— pero con la misma audiencia no añade nada. Cubierto en `e2e/programas.spec.ts` | **HECHO, verificado en dev, NO desplegado** |
| 11.8 | **Endurecido y explicado (2026-09-15/16).** Se cerró la regla de aprobación —**nada puede quedar sin hacer**: un módulo con obligación viva impide completar aunque el cupo dé—; el **cupo se configura desde el programa**, no desde cada módulo; un programa **vacío ya no acredita la nada**; una ronda **completa no se reabre**; un programa publicado **solo lo ve quien está obligado** (antes salía en Mi aprendizaje a toda la plantilla); el **informe de programas** en Seguimiento con su cuello de botella, que dejó de contar como activas las obligaciones retiradas. En la ficha: un **solo bloque** «Qué falta para que funcione» en vez de avisos sueltos, la cobertura leída **por módulo** —a quién alcanza cada uno, en vez de un «(solo 2 de 5)» que no señalaba— y desde la ficha de una formación se ve **de qué programa es módulo**, en una línea. Detalle en `docs/modulos/programas.md` y `HANDOFF` 2026-09-15/16 | **HECHO, verificado en dev (582 unitarias, 128 de la matriz, e2e), NO desplegado** |
| 11.9 | **La ficha del programa, legible (2026-09-16).** El cliente leyó la pantalla del 11.8 y señaló tres cosas: (a) el aviso de *«Ninguna audiencia alcanza los N módulos»* **era correcto y aun así no se entendía** — describía la situación sin decir la regla que la convierte en problema (un programa se completa aprobándolos TODOS, `evaluarPrograma`), así que ahora la dice y nombra la salida: *si cada módulo va a propósito para un cargo distinto, no son un programa, son formaciones sueltas*; (b) el pie *«Se le exige a X · Y»* **repetía sumado** lo que ya dice cada módulo en su renglón — se quitó, junto con la segunda caja de «fechas distintas» que decía lo mismo que el bloque de estado tres centímetros más arriba; (c) el renglón de cada módulo volcaba la lista entera de audiencias y cinco botones, así que **cada módulo se abre**: el renglón deja lo que se compara entre módulos —orden, nombre, obligatorio/grupo, a quién alcanza resumido (dos nombres, y a partir de tres se cuenta) y lo que está mal— más reordenar; la ficha desplegada, DENTRO de la lista y no en una ventana, trae las audiencias con nombre completo, estado, campaña y exigencia automática. Las acciones se probaron en un menú `⋯` y **se volvió a dejarlas visibles** (↑ ↓ ✏️ 🗑) el 2026-09-20: con un admin ordenando diez módulos, un menú son dos clics por cada movimiento. Y **cada clic tiene un solo destino**: el chevron despliega, el **nombre** abre la formación —sin subrayado, que en una fila desplegable se lee como «esto despliega»—, el renglón en sí no hace nada. Además, un módulo de tipo automático **sin publicar** ahora dice que su regla de toda la empresa todavía no existe —nace al publicar la formación—, que era lo que hacía leer «se exige sola a toda la empresa» junto a un cargo concreto como un fallo. De paso, asignar un programa **recarga la lista**: antes se asignaba y la pantalla seguía diciendo «no se le exige a nadie» hasta recargar a mano. Cubierto en `e2e/programas.spec.ts` | **HECHO, verificado en dev (tsc, eslint, e2e, y a ojo en `mirar.ps1`), NO desplegado** |

| 11.10 | **El aviso de la audiencia que no alcanza al resto del programa (2026-09-16).** Si un módulo tiene una audiencia que no llega a los demás módulos, se marca en ámbar en su ficha y se dice la consecuencia entera: esa gente no completará el programa **y tampoco recibirá la constancia individual de esa formación**. Nace de la pregunta del cliente *"¿qué pasa si se agrega una píldora que fue hecha para individual y tenía otra audiencia?"*. **No se bloquea agregar el módulo** —así es como se arma un programa, con formaciones que ya existen— y **no se arregló por debajo**: ver la decisión de abajo | **HECHO, verificado en dev, NO desplegado** |

### La supresión de la constancia: por FORMACIÓN, no por persona (se probó lo contrario y se deshizo)

Se construyó la versión **por persona** —emitir la individual a quien se le exigen *algunos* módulos
del programa pero no *todos*, es decir, a quien el programa no le aplica— y se **deshizo el mismo
día**, con su matriz y todo. Queda escrito porque la idea vuelve sola:

- **Metía un modo de fallo nuevo.** Las reglas de un programa se crean módulo a módulo, así que
  durante ese rato cualquiera cae en «algunos» y se lleva su individual; si después completa el
  programa, acaba con **dos constancias del mismo esfuerzo**. Cambiar una pérdida de evidencia por
  una duplicación, en el camino que emite los papeles y que se consulta en cada cierre de formación,
  no es una mejora.
- **El caso de partida requiere una mala configuración**, y el cliente la descartó: *"ese caso de que
  una formación individual y por programa esté, no creo que pase"*. Su inducción general es **un**
  programa para toda la empresa; las inducciones específicas se quedan como formaciones sueltas con
  su constancia individual, que es justamente por lo que no serían un programa.
- **La protección vive donde no cuesta nada**: el aviso en ámbar de 11.10.

Si algún día el caso aparece de verdad en un tenant, el arreglo correcto **no es ese parche** sino
que `AssignmentRule` sepa **de dónde** viene la obligación. Con ese dato, «los módulos que el PROGRAMA
me exige» se pregunta sin adivinar, y entonces sí se puede suprimir por persona sin duplicar nada.

| | Qué | Estado |
|---|---|---|
| 11.11 | **Una regla de asignación sabe de dónde salió (2026-09-16).** Columna `AssignmentRule.sourcePathId` (migración `20260916140000_regla_sabe_su_origen`): NULL = la declaró alguien sobre la FORMACIÓN (pestaña Quiénes, matriz por cargo, o el motor al publicar un tipo que se exige solo); con valor = la creó «Asignar programa» de ese programa. Se escribe **solo al crear** —si la regla ya existía a mano y un programa la reutiliza, no la creó el programa— y viaja como **parámetro interno del servicio**, no en el esquema público: si estuviera en el cuerpo de la petición, cualquiera podría declarar que su regla la puso un programa. `ON DELETE SET NULL`: borrar el programa no deja a nadie sin la formación que ya se le exigía. **Hoy no se lee en ningún sitio y no cambia ningún comportamiento.** Se añade ahora porque es el único dato de este asunto que **no se puede reconstruir mirando atrás**: sin él, una regla creada por un programa y una creada a mano son la misma fila para siempre, y cada día que pasa es un día de reglas a ciegas | **HECHO, migrado en dev, NO desplegado** |

Lo que ese campo desbloquea el día que haga falta, sin arqueología: **compleción por persona**
(tronco común + rama por cargo), **suprimir la constancia individual por persona** sin duplicar
papeles, y que el **informe** sepa a quién le aplica de verdad un programa.

### La regla de compleción de un programa: se queda en «todos los módulos», y por qué

Decisión tomada el 2026-09-16, delegada expresamente por el cliente (*"lo que ejecutes debe ser lo
que debe hacer el sistema LMS de un programa"*). **No se cambia**, y no por inercia:

La alternativa —«cada persona completa con los módulos que a ella se le exigen»— **no se puede
distinguir del abuso con el modelo de datos de hoy**. `AssignmentRule` no guarda de dónde viene una
obligación: una regla creada por «Asignar programa» y una creada a mano sobre la formación suelta son
idénticas. Así que «los módulos que a mí se me exigen» incluiría a quien solo debe UNA píldora por
otro motivo — y esa persona **completaría el «Programa de Inducción General» haciendo una píldora**, y
recibiría esa constancia. Eso es **evidencia falsa**, que es justo lo único que el proyecto sí
bloquea (ver RUNBOOK, *«Bloquear no es avisar»*).

| 11.12 | **Publicar avisa a quién deja sin papel, y la cobertura se cuenta POR PERSONA (2026-09-16).** Publicar apaga la constancia individual de todos los módulos, y lo hacía en silencio; ahora dice antes a cuánta gente deja sin ningún papel —`impactoDePublicar`—, sin bloquear. Y el aviso de la ficha, que comparaba **audiencias** («ninguna alcanza los N módulos»), pasa a contar **personas**: comparar audiencias daba **falsas alarmas** sobre programas sanos, porque dos audiencias distintas pueden alcanzar a la misma gente —una píldora marcada a todos los cargos llega a la plantilla entera, ya que `jobTitleId` y `areaId` son obligatorios—. La cuenta única es *gente con ALGUNO de los módulos exigido pero no TODOS*, y de ella salen las tres lecturas (aviso, línea verde y ventana de publicar), así que no pueden discrepar. Cubierto en la matriz (I39, I40, I41) | **HECHO, verificado en dev (131 de la matriz), NO desplegado** |

**Lo de «tronco común + rama por cargo» NO está pendiente.** Se planteó como funcionalidad (un
programa de inducción con los módulos generales para todos y la específica de cada cargo solo para
ese cargo) y el cliente lo descartó al describir cómo lo usa: *"solo hay un programa de inducción
general para todos, y las inducciones específicas no se usarían como programa porque la constancia
sería individual"*. Es decir: **un programa = una audiencia para todos sus módulos**, que es
exactamente lo que el sistema hace hoy.

Y al pensarlo a fondo, el propio cliente lo descartó con el argumento que lo cierra: si las
específicas van como módulos, **con 100 cargos son 100 módulos** en la lista, y separarlo en dos
programas no arregla nada. Eso no es un problema de pantalla: **un programa es una lista FIJA de
formaciones**, y meterle dentro una dimensión que varía por persona lo hace explotar. Los LMS que sí
lo resuelven usan un **módulo dinámico** —una sola fila que se resuelve distinta para cada persona—,
que es una pieza de modelo nueva y bastante más que «audiencia por módulo».

**Y la necesidad real que había detrás no es estructura, es vista:** *«ver todo lo de inducción de
una persona, sin importar si es general o específica»*. Eso es un informe —el perfil ya reúne lo que
le falta, su trayectoria y sus constancias; solo falta agruparlo— y no toca el motor, ni las
constancias, ni un número de auditoría. Si se pide, se hace por ahí, no cambiando el modelo.

**Reglas ya decididas y aplicadas, para no volver a discutirlas:**
- Si una formación es módulo de un programa publicado, su cierre —sea por contenido o por CUALQUIER
  mecanismo de asistencia— nunca emite constancia individual; solo la emite la del programa completo
  (Fase 2). Si el programa se despublica, la individual vuelve a emitirse normalmente.
- Un programa **no tiene tipo** (`ActivityType`): certifica siempre al completarse, sin casilla que
  lo decida. El tipo vive en cada módulo, no en el programa.
- El color de un programa en la interfaz es **fijo** (`#4338ca`, `COLOR_PROGRAMA` en el frontend),
  no el de la marca del tenant: es la señal de "esto es un programa" en cualquier empresa.

## 12. Sub-áreas y jefaturas — **HECHO Y DESPLEGADO el 2026-09-21**

Se abre y se cierra el mismo día porque el cliente lo necesitaba antes de subir a su gente. Queda
aquí para que conste qué se tocó y qué NO, que es la parte que se olvida.

| | Qué | Estado |
|---|---|---|
| 12.1 | **El árbol de áreas, usable.** `Area.parentId` existía desde el primer día sin pantalla que lo dejara declarar. Ahora se pone en *Configuración → Áreas* («Área padre»), con tres guardas del servidor: `AREA_PARENT_SELF`, `AREA_PARENT_CYCLE` y **`AREA_DEPTH` (dos niveles, no tres)** | **HECHO, desplegado** |
| 12.2 | **La faceta de audiencia alcanza el área Y SUS HIJAS** (`audience-rule.ts`, en sus dos derivaciones). Sin esto, mover a alguien a una sub-área le habría sacado de toda regla del área grande y el motor le habría retirado las obligaciones vivas **en silencio** | **HECHO, desplegado** |
| 12.3 | **«Área» sigue siendo la grande; «Sub-área» es una dimensión NUEVA** en informes (`analytics.ts`). Se añade un corte; no se le cambia el significado a ninguno | **HECHO, desplegado** |
| 12.4 | **Columna `sub_area` en el archivo de personas**, que crea la sub-área colgando del área de la columna anterior. Si ya existía, **no se le toca el padre**: un archivo de personas no reorganiza el organigrama | **HECHO, desplegado** |
| 12.5 | **Las tres lecturas del ciclo**: contra la campaña anterior (el ciclo cerrado inmediatamente anterior, no por fecha), la brecha autoevaluación/jefe (solo con las dos entregadas) y «Por sub-área» (solo donde las hay) | **HECHO, desplegado** |

**Verificado que NO se rompe nada que dependa del área:** el alcance del analista ya recorría el
árbol (`withDescendants`, sin tocar), quién evalúa el desempeño, la encuesta de eficacia y las
pantallas leen `areaId` sin enterarse. **En qué se evalúa NO cambia**: el formulario va por CARGO.

Cubierto por `scripts/recorridos/desempeno.mjs` (10 pasos, con dos jefaturas de sub-área recibiendo
exactamente a los suyos y limpieza propia al terminar), `performance-scoring.spec.ts` y
`analytics.spec.ts`. Detalle en `docs/arquitectura.md` §4.55 y `docs/modulos/desempeno.md` §9.

**Lo único que queda abierto de aquí**, y es opcional, no un fallo:

- **El consolidado de desempeño a pantalla completa.** Con área + sub-área + competencias + brecha,
  la vista actual empieza a quedarse estrecha. Se aplaza a propósito hasta ver una campaña real con
  datos del cliente: rediseñar una pantalla contra datos imaginados es como se llega a la tercera
  versión. Cuando se haga, va como **capa de la aplicación**, no como ventana nueva del navegador.

## 13. Aprobaciones y límites del analista — abierto y **cerrado el 2026-09-22**, sin desplegar

Sale de una frase del cliente: *"el rol analista solo debe ver pocas cosas, en formación solo poder
crear tipo plan, ellos no pueden crear otros tipos de formaciones; programa no pueden, solo
seguimiento, inicio, convocatorias... la idea es que todo esto sea por permisos en rol e individual
por usuarios"*. Nada se cablea: **todo se configura**, en rol y en persona, y la persona manda.

| | Qué | Estado |
|---|---|---|
| 13.1 | **Estado de revisión de la formación**: `SIN_ENVIAR → EN_REVISION → APROBADA \| DEVUELTA` (migración `20260922150000`). Enviar avisa a quien tenga `catalog:publish`; devolver **exige motivo** y avisa a quien la mandó. Una versión EN_REVISION no se edita, y editar una APROBADA la devuelve a SIN_ENVIAR — si no, se aprueba una cosa y se publica otra | **HECHO, verificado en dev (`revision-de-formacion.mjs`, 24), NO desplegado** |
| 13.2 | **Alcance por TIPO de formación**, tercera dimensión junto a procesos y áreas (migración `20260922170000`). Se configura desde la matriz de Permisos y por persona, con lo individual ganando. **Sin filas = sin acotar**, que es lo único que permite desplegar sin dejar a la empresa sin poder crear nada | **HECHO, verificado en dev (`alcance-por-tipo.mjs`, 16), NO desplegado** |
| 13.3 | **Programas con permisos propios** (`programs:read` / `manage` / `publish`). Usaba los del catálogo, así que quien podía crear una formación **veía y tocaba los programas**, y no había forma de quitárselo sin quitarle el catálogo | **HECHO, verificado en dev (`programas-con-permiso-propio.mjs`, 16), NO desplegado** |
| 13.4 | **El menú deja de ofrecer pantallas prohibidas.** Cada entrada de `sidebar.tsx` lleva su permiso y un grupo sin entradas no pinta ni su rótulo. Antes el analista veía Programas, Usuarios, Desempeño, Aprobaciones y Configuración, pulsaba, y se encontraba un 403 | **HECHO, cubierto por `e2e/alcance-analista.spec.ts`, NO desplegado** |

**Al desplegar hay que correr `dev:sincronizar-permisos -- --si` en el servidor**, o la pantalla de
Programas le da 403 **al administrador incluido** sin ningún error que lo delate. `db:seed` NO.

**Lo que queda abierto de aquí** —ninguno es un fallo—:

- **El selector de tipos por PERSONA, en la ficha de Usuarios.** El motor, la API y la matriz de
  Permisos por rol están; la ficha de la persona todavía solo ofrece procesos y áreas, así que hoy
  el ajuste individual de tipos se hace por API y no por pantalla.
- **Nada más de 13.1**: la ficha de la formación ya trae los botones —«Enviar a revisión» a quien
  escribe, «Devolver» (con motivo) y «Aprobar» a quien publica— y el distintivo del estado.

## Lo que NO está pendiente, para no volver a abrirlo

Cosas que se decidieron y conviene no reabrir sin motivo nuevo:

- **Los siete tipos** tienen recorrido en verde, y `estandar.mjs` cubre sola los que cree el cliente.
- **Cómo se cierra una jornada** se pregunta, no se deduce (#158). La regla derivada se rompió dos
  veces; no hace falta una tercera.
- **La constancia interna la decide el tipo** (#159): el papel de un tercero no la suprime.
- **`executedBy` vive en la convocatoria**, no en la formación: cambia por jornada. Se hereda de la
  anterior, sin bloquear.
- **La asistencia vive en `attendance_records`**, la tabla que ya existía desde el Sprint 0.
- **Recertificación** es la competencia del puesto **que caduca**; quién emite el papel es otro eje.
