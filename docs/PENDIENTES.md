# Pendientes

Todo lo que está abierto, en un solo sitio. **Se corrige**: cuando algo se hace, se borra de aquí y
se cuenta en el HANDOFF de esa sesión — al revés que el diario, que solo se anexa.

Existe porque los pendientes estaban repartidos entre siete documentos —el HANDOFF de cada sesión,
`00-el-motor.md` §9, `08-evidencia.md` §10, `seguimiento.md` §11, `05-cumplimiento.md`— y para saber
qué falta había que leerlos todos. Cada punto dice **dónde está el detalle**, para no repetirlo.

Al 2026-09-09 (noche), con Ascent ya en producción.

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
| 2.7 | **Decisión del cliente: ¿una jornada puede cerrar por CONTENIDO y aun así llevar lista?** Lo preguntó el 2026-09-08 con un caso real: *un curso externo presencial donde la evaluación y la encuesta se hacen en la plataforma y además se quiere registrar la asistencia (firma, QR o a mano)*. Hoy es **excluyente** y a propósito (#158): la jornada declara cómo se cierra, y si cierra por contenido la lista no aparece. Las dos salidas de hoy: **(a)** cerrar por lista —la asistencia cumple la formación y el examen queda disponible pero no obliga— o **(b)** cerrar por contenido —el examen obliga, pero no hay lista ni QR—. Lo que falta es una tercera: **registrar asistencia como EVIDENCIA sin que cierre nada**. El modelo lo aguanta (`attendance_records` es independiente de la inscripción); lo que hay que decidir es si se ofrece, porque hoy la lista significa «esto queda cumplido» y esa tercera vía la convierte en dos cosas distintas según la jornada | `08-evidencia.md` §3 |

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
| 5.1 | **Repaso / «volver a verlo»**: repetir una formación para reforzar, sin tocar los indicadores. El motor ya existe (`spaced-repetition.ts`, #22). **Después del despliegue**, y además su mejor versión —avisar según lo que cada quien falló— necesita etiquetar las preguntas por tema, que es trabajo del Sprint 6 | `HANDOFF` 2026-09-05 · `ideas-producto.md` §4 |
| 5.2 | **Una fila por persona en Seguimiento, no por ronda.** Hoy quien lleva tres reinducciones sale tres veces. **Después del despliegue** y después del informe por periodo del Sprint 6: cambiar el grano antes obliga a rehacerlo | `HANDOFF` 2026-09-04 |
| 5.3 | **La matriz de vigencias del trabajador** —exámenes médicos, licencias de conducción, EPP— como módulo aparte y **cotizado aparte**. Después del despliegue, y solo cuando haya un cliente que lo pida | `HANDOFF` 2026-09-05 |

## 5 bis. Lo que decidió el cliente el 2026-09-08 (tarde)

| Qué | Decisión |
|---|---|
| **SCORM** (comprar cursos empaquetados a un proveedor) | **Importante, pero después.** La base ya lo soporta; el reproductor son 3-6 semanas y solo hace falta el día que se compre contenido de fuera |
| **Contenido y firmantes de la constancia** | **Lo carga el cliente en producción.** Es su plantilla, su logo y sus firmas: se configura en Configuración → Constancias cuando el piloto esté arriba |
| **Umbral SARLAFT** | Pendiente de su área legal. No es código: si aplica, se resuelve con una regla de audiencia |
| ~~Temas, banco y biblioteca no se pueden renombrar~~ | **HECHO el 2026-09-09.** Un tema se crea, se **renombra** y se borra desde el propio editor de la evaluación («Crear, renombrar o borrar temas»), con su número de preguntas a la vista; una pregunta se puede **retirar del banco** desde el buscador; y «biblioteca» pasó a llamarse «Traer una lección ya creada», que es lo que es |

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
| 8.3 | **El título de Inicio podría reconocer un logro**, no solo lo que falta: «Nadie tiene nada vencido: 41 días seguidos». Hoy dice la primera cosa que importa —vencidas, atrasadas, por aprobar, o «Todo al día»—. Ofrecido al cliente el 2026-09-09, **sin decidir**; necesita una cifra que no se calcula: días seguidos sin nada vencido | `HANDOFF` 2026-09-09 §16 |

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

| | Qué falta | Por qué importa |
|---|---|---|
| 10.1 | **Rotar las credenciales de R2** (las cuatro variables `R2_*` de `/opt/ascent/.env.prod`) y **la contraseña de la cuenta de plataforma** | Las dos se escribieron en una conversación. Una credencial que salió de su sitio ya no vuelve a estar secreta: se cambia, no se borra el rastro. Cómo, en el archivo de credenciales §2 y §3 |
| 10.2 | **Decidir el correo de soporte de verdad.** `soporte@ascentio.app` existe y recibe, pero **no lo atiende nadie** | Es lo que el cliente ve cuando algo le falla. Un contacto que no responde es peor que no dar ninguno: promete atención que no existe. Hasta decidirlo, no debería prometer plazo |
| 10.3 | **Limpiar los datos de prueba en producción**: el contacto de soporte de TRANSPRENSA dice «administrador de todo el mundo» y «lunes a viernes no llame» | Lo va a leer su gente el día que algo no funcione. Se corrige en *Configuración*, sin desplegar nada |
| 10.4 | **Vigilancia: no hay ninguna.** Hoy el primer aviso de una caída lo daría el cliente | Sentry (gratis hasta 5.000 sucesos) más un vigilante de disponibilidad sobre `/v1/health`. Es una tarde, y la misma cuenta sirve para Ascent **y** para SAC-NEO. Decidir si se centraliza o cada producto lleva el suyo |
| 10.5 | **LibreOffice no está instalado**: un `.pptx` se rechaza pidiendo el PDF | Es una decisión, no un olvido: no cabe en 4 GB. Si molesta, `libreoffice-impress` y la máquina de 8 GB (USD 24 más) |
| 10.6 | ~~**Entregar formalmente al cliente**~~ **El paquete está hecho** (`docs/entrega/`): bienvenida, acta, ficha técnica, los dos correos y la ficha de acceso. Falta **enviarlo** | Antes de enviar hay que cerrar seis cosas, listadas en `docs/entrega/00-antes-de-enviar.md`. Tres son de esta misma tabla (10.1, 10.2, 10.3) |
| 10.7 | **La política CORS del bucket `ascent-media`** sigue sin poner: el token del servidor no puede, tiene permisos de objeto y no de bucket (`AccessDenied` en `PutBucketCors`) | El vídeo **ya se reproduce** sin ella —se arregló quitando el `crossOrigin` que forzaba el modo CORS—, así que no corre prisa. Pero el día que los vídeos lleven subtítulos, una pista `<track>` de otro origen **sí** la exige. Dos minutos desde el panel: R2 → `ascent-media` → Settings → CORS Policy, con lo que imprime `bash scripts/r2-cors.sh` |
| 10.8 | **El QR de la constancia no abre solo**: al escanearlo el teléfono solo ofrece *copiar el enlace* y hay que pegarlo a mano. Abierto así, verifica bien | Sin diagnosticar. Lo primero es mirar **qué cadena lleva el QR de verdad**: si no empieza por `https://`, el lector del teléfono la trata como texto y no como enlace, que es exactamente este síntoma |
| 10.9 | **El asistente automático 24/7 no existe todavía** y ya está prometido | El acta de entrega y la ficha técnica dicen que fuera del horario hay atención automática. Construirlo, cambiar la frase por lo que hoy es cierto, o ponerle fecha — **antes de firmar**. `docs/entrega/00-antes-de-enviar.md` §2 bis |

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
