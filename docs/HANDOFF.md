# NEO PULSE — HANDOFF (diario de sesiones)

Lo que se hizo cada dia, que quedo abierto y por que. **Se ANEXA por arriba**: la sesion mas
reciente primero, para que abrir el archivo responda de una la pregunta que uno se hace al
sentarse — "¿en que iba esto?".

Que va en cada documento, para no duplicar:

| Documento | Responde |
|---|---|
| **Este** | En que iba, que quedo a medias y con que continuar |
| `docs/PENDIENTES.md` | **Que falta HOY, todo junto.** Se corrige: lo hecho se borra de ahi |
| `docs/RUNBOOK.md` | Como se opera y que se aprendio rompiendo algo. Solo se anade |
| `docs/arquitectura.md` | Como funciona el sistema HOY. Se corrige |
| `docs/glosario.md` | Que significa cada palabra del negocio |
| `docs/sprints/` | Historia por sprint. Envejece a proposito |
| `CLAUDE.md` | El modelo completo y las decisiones irreversibles |

Regla: si algo de aqui deja de ser cierto, no se corrige — se escribe la sesion siguiente. Esto es
un diario, no una referencia.

**Para retomar sin leerse el diario entero: `docs/PENDIENTES.md`.** Nacio el 2026-09-06 porque lo
abierto estaba repartido en siete documentos y saber que faltaba obligaba a leerlos todos.

---

## 2026-09-08 (tarde) — Los seis pendientes que eran nuestros, y dos fallos que las pruebas destaparon

Sesión larga: todo lo de `PENDIENTES` que no dependía de una decisión del cliente. Seis puntos
cerrados —2.4, 2.5, 3.1, 3.2, 3.3 y 4.1—, dos fallos de fondo que aparecieron **midiendo** y no
razonando, y cuatro recorridos nuevos que los sostienen.

### 1. LAS DOS PUERTAS DEL PAPEL, DICIENDO LO MISMO (2.5)

El criterio «si la dicta la empresa, no hay tercero que certifique» vivía **dentro** de la lista de
asistencia, y la segunda puerta —*Papeles de un tercero*, en la ficha— no se enteró. Ahora vive en
`certificate-policy.ts` y las dos lo **importan**. La diferencia no es de estilo: un criterio copiado
se separa el día que alguien corrige uno de los dos, que es exactamente lo que había pasado.

Lo demás que pidió el cliente, hecho:

- **La fila dice de dónde sale** —«Lo pide su tipo» o «Lo pide su ficha»—, que contesta *«¿y esta por
  qué aparece aquí?»* sin abrir cuatro pantallas, y además dice dónde se cambia.
- **Se abre la formación y la convocatoria** desde la fila, en pestaña nueva: es una gaveta con
  borradores a medio escribir y navegar la cerraría.
- Con `PROPIOS` la pantalla no pide el número **pero lo explica**, con un «Registrarlo de todos
  modos» al lado. Sigue siendo un defecto, no una compuerta. Y si ya hay papel guardado se enseña
  siempre: esconder un dato que alguien registró es peor que no haberlo pedido.

`dos-puertas-del-papel.mjs` corre la matriz entera: jornada propia o de un tercero × papel heredado
del tipo o puesto en la ficha × con papel guardado o sin él.

### 2. VENCIMIENTOS, REHECHO ENTERO (3.1, 3.2 y 3.3)

Los tres puntos eran el mismo: **el informe partía por de qué tabla salía el dato**, y eso es una
división del esquema y no del trabajo. Costaba dos cosas y las dos se veían en la pantalla —una serie
siempre en cero, y la gente de la ventana de 60 días contada **dos veces**—.

El eje ahora es lo que hay que hacer: **REPROGRAMAR** (ya la tuvo y deja de estar acreditado) frente a
**PERSEGUIR** (nunca la ha cumplido y tiene plazo). Cada persona y formación sale **una vez**: cuando
coinciden varias fechas manda la obligación abierta —es la que tiene plazo de verdad— y, si no la
hay, la caducidad más próxima. Y cada fila dice **según qué** vence, porque quien lee «vence en
marzo» pregunta siempre «¿según qué?».

**Y ahora alguien se entera.** Aviso los lunes a la **bandeja** —no correo, decisión del cliente— a
quien tiene `reports:read_scope`. Uno por persona y no uno por vencimiento —cuarenta avisos el mismo
lunes enseñan a archivarlos sin leerlos—, con las dos cifras separadas y nunca la suma, y si no hay
nada **no se manda**. El plazo lo decide el tenant en Preferencias (45 días por defecto, 0 lo apaga) y
se puede disparar a mano: probar un aviso semanal esperando al lunes es como no poder probarlo.

### 3. DOS REGLAS VIVAS, UNA SOLA OBLIGACIÓN (4.1) — Y NO ERA EL CASO RARO QUE DECÍA LA NOTA

La lista decía *«solo posible en tipos de alcance MANUAL; no se ha visto en la práctica»*. **Se vio el
mismo día**, escribiendo el recorrido de las dos puertas: una persona de prueba tenía dos
obligaciones PENDING de la misma formación.

La causa es de manual: **publicar una inducción crea sola su regla de «toda la empresa»**, así que
cualquier inducción publicada y además exigida a un cargo ya tenía dos reglas vivas. Lo que se veía no
era un error visible sino un **denominador inflado**: la misma persona contada dos veces, y el
cumplimiento bajando sin que nadie dejara de hacer nada.

El motor mira ahora si esa persona **ya debe esa misma formación** antes de abrirle la ronda 1 — que
es lo que la asignación manual hacía desde siempre (*«no pisa lo que ya está vivo»*); el motor era la
mitad que faltaba. No toca la que existe, y si esa regla se retira, la otra la vuelve a crear.

### 4. EL FALLO DE DEBAJO: LA CONSTANCIA QUE NACÍA SIN VENCIMIENTO

Apareció al probar que Vencimientos leyera de verdad `certificates.valid_until`: **la constancia se
emitía sin fecha de caducidad** cuando la formación tenía más de una regla viva. La vigencia salía de
un `findFirst` sobre las reglas, así que dependía **del orden de las filas**; si tocaba la regla sin
recurrencia —la automática de las inducciones— el papel nacía sin caducidad y la persona
**desaparecía del informe** hasta que alguien se acordara.

Ahora se miran todas y manda **la vigencia más corta**: la obligación más exigente decide, y
equivocarse hacia avisar antes es un error que se corrige mirando.

Es la tercera vez en dos días que la conclusión correcta sale de **medir** y no de razonar sobre el
código. Ninguno de estos dos fallos se veía leyendo.

### 5. LOS MECANISMOS 2 Y 3 DE LA ASISTENCIA (2.4)

Estaban diseñados desde el Sprint 0 —con su sitio en el modelo— y sin construir.

- **QR de sesión.** Rota cada **90 segundos**: un código fijo se fotografía y se manda al grupo, y
  quien está en su casa marca asistencia a una jornada a la que no fue. 90 es el punto entre las dos
  formas de que esto no se use —más corto y la gente del fondo no alcanza; más largo y la foto vale
  toda la sesión—. Y **se puede dictar en voz alta**: seis caracteres sin parecidos, porque siempre
  hay alguien con la cámara rota y ese es justo el que se queda sin constar.
- **Firma en pantalla.** A dedo, en el móvil. Puerta propia (`attendance:sign`, solo PNG, 300 KB) por
  lo mismo que la evidencia no usa la del contenido: **el permiso es otro**. Es un dato biométrico, no
  se enseña en ninguna lista — donde aparece es dentro del acta.
- **Acta en PDF**, con la lista, las firmas y una **huella** de lo que el acta afirma —no de los bytes,
  que cambian con la fecha de generación—. Se genera **a petición** y volver a generarla no pisa la
  anterior: un acta es un documento con fecha.

Los tres mecanismos cierran por el **mismo sitio**, así que el informe y la obligación no se enteran
de por qué puerta entró la marca. El recorrido lo comprueba explícitamente.

**El QR salió a pantalla completa, y lo pidió el cliente mirando la pantalla.** Tenía razón: se
proyecta en un salón, y dentro de la tarjeta compite con el menú, la ficha y la tabla — a cinco metros
no se lee un código de dos centímetros.

**Y lo corrigió otra vez cuando lo hice mal.** La primera versión abría una ventana del navegador
(`window.open`); lo que pidió es una capa **de la propia aplicación**. Tiene razón y la diferencia es
real: una ventana nueva la bloquea el navegador, sale sin sesión hasta que se refresca, y quien está
dictando se queda con dos ventanas que ordenar. Ahora es una capa a pantalla completa encima de la
convocatoria, que sale con **Escape** y no cierra la sesión al salir — dejar de proyectar y apagar el
código son dos cosas distintas, y mezclarlas dejaría fuera a quien esté escaneando en ese momento.

El acta **no** necesita nada de esto: es un PDF y se abre en su pestaña con el visor del navegador,
que es donde se imprime y se guarda.

### 6. Y LA EVIDENCIA QUE SE SUBÍA Y NO SE PODÍA VOLVER A ABRIR

Descubierto construyendo el acta: solo se servían los archivos registrados como `ContentPackage`, así
que **el certificado escaneado, el acta y la firma quedaban en el disco sin forma de verlos**. Una
evidencia que no se puede volver a ver no es evidencia. La regla no se relajó —se sirve un archivo si
**alguna fila del dominio apunta a él**, nunca una clave suelta— solo se completó con las cinco
columnas que faltaban.

### 6 bis. Y UN ADJUNTO QUE NO SE PODÍA GUARDAR — lo cazó el cliente en caliente

Adjuntaba el certificado de alguien que **ya tenía su formación cumplida** y el botón se quedaba en
«Guardar 0 correccion(es)», apagado: el archivo subido se perdía al cerrar la lista. La comparación
que decide si hay algo que guardar miraba el número y la fecha **y no el adjunto**.

Y la otra mitad, del mismo tirón: el adjunto **no se podía abrir**. Se enseñaba un visto con el
nombre y nada más, así que no había forma de comprobar que se subió la hoja correcta ni de
enseñársela a nadie. El servidor ya sabía servirlo desde esta misma sesión —era la mitad que faltaba
del arreglo de §6—; lo que faltaba era el enlace.

Tres cosas, entonces: **el escaneo cuenta como cambio**, **el nombre del archivo es un enlace** (con
su URL firmada) y, cuando hay papel sin número, el botón **dice qué falta** en vez de apagarse sin
explicación — el número lo exige el servidor, pero un botón muerto no lo explica.

**Y esto sí lleva prueba de pantalla**, no recorrido: el servidor aceptaba el archivo perfectamente
—de hecho lo aceptaba— y el fallo estaba en la interfaz. `e2e/asistencia-adjunto.spec.ts` monta la
jornada cumplida por API y prueba los tres clics: 13 segundos.

### 7. LAS TILDES DE LO QUE DICE EL SERVIDOR

El barrido del 07 corrigió el texto de las **pantallas** y dejó fuera los mensajes de la API — y esos
también se leen: salen en el aviso rojo cuando algo se rechaza, que es justo el momento en que
alguien lee con atención. **43 mensajes** corregidos en tres pasadas.

Y una corrección mía por el camino, que vale la pena escribir: el diccionario mapeó `publico` →
«público» donde era el **verbo** («se publicó otra versión»). Es el riesgo de un diccionario ciego, y
por eso la segunda vuelta llevó formas verbales concretas y la tercera fue a mano. Un barrido
automático sobre lenguaje necesita que alguien lea la lista de cambios.

### 8. LA SUITE EN ROJO QUE NO ERA UNA REGRESIÓN — otra vez

La primera corrida completa dio **19 de 21**, con dos pruebas caídas que tocaban justo lo que había
cambiado el motor. Antes de tocar nada se midió, que es la lección del 07:

| Qué se corrió | Resultado |
|---|---|
| Suite completa, base con la basura de la sesión | 19 / 21 |
| **Las dos pruebas caídas, solas** | **5 / 5** |
| **Suite completa, base ya recogida** | **21 / 21** |

La causa era otra vez la base sucia —los recorridos de esta sesión dejaron gente y reglas—, no el
código. Con una sola muestra habría dado por hecho lo contrario y habría «arreglado» algo que
funcionaba.

### Verificación

502 unitarias · 21/21 e2e · cuatro recorridos nuevos en verde (`dos-puertas-del-papel`,
`dos-reglas-una-obligacion`, `vencimientos`, `qr-y-firma`) · tsc y lint limpios · build en verde.

**Y miradas en el navegador**, que es la mitad que las pruebas no cubren: el panel de la
convocatoria, la capa proyectada —QR sobre blanco, el código en letra enorme, la cuenta atrás, y
Escape para volver— y la pantalla del asistente con su lienzo de firma. De paso salió a la vista el
mensaje de un código caducado, que es el que más se va a leer: *«Ese código ya caducó. El de la
pantalla cambia cada minuto y medio: mira el nuevo»*.

Falta una sola cosa por mirar de verdad: **la firma desde un teléfono**. El lienzo se probó con
ratón, y lo que decide si funciona es el dedo sobre una pantalla pequeña.

### Lo que queda abierto

- **6.5 repaso de estilo** con la referencia del cliente. No se tocó: el propio pendiente dice que es
  trabajo de diseño y hay que hacerlo **mirando pantalla por pantalla**, y esta sesión no tuvo ojos.
- **6.1, no hay remoto en git.** Sigue siendo lo más urgente de la lista y sigue sin ser técnico.
- Y lo que es del cliente: **2.6** (si `INDUCCION_ESPECIFICA` debe llevar papel de un tercero), **4.2**,
  **5.1**, **5.2** y **5.3**.

---

## 2026-09-08 (cierre) — El bloque de evidencia, cerrado: subir el papel, la segunda puerta y la via C

Los tres puntos abiertos de `PENDIENTES` §2 salvo el 2.4. Dos migraciones, dos decisiones nuevas
(#160 y #161) y cuatro recorridos que las prueban.

### 2.1 — SUBIR EL ARCHIVO

Las columnas existian desde el Sprint 6 y la API las aceptaba: no habia por donde mandarlas.

**Puerta propia** `POST /media/evidencia` con `attendance:take`, y no la de contenido —que pide
`lessons:manage` y crea un `ContentPackage`—. Dos razones: pedirle permisos de autoria a quien solo
adjunta el PDF que le dio la ARL acaba en que no adjunta nada; y un acta pertenece a ESA jornada, no
es una pieza reutilizable del catalogo. Acepta PDF e imagenes **comprobadas por sus bytes**: el acta
se fotografia con el telefono mas de lo que parece, y renombrar un `.exe` a `.pdf` es el ataque de
manual.

En pantalla, dos sitios distintos porque son dos cosas distintas: **el acta** al lado de la fecha
(una por jornada — es la hoja con las cuarenta firmas, trocearla por persona seria inventar un
documento) y **el certificado** bajo su numero, en la misma celda. Los dos OPCIONALES: la lista
marcada ya es evidencia, y exigir el escaneo dejaria jornadas sin cerrar esperando al escaner —
mientras tanto el plan las cuenta como no ejecutadas.

**El recorrido encontro dos fallos antes que el cliente:** el acta se guardaba pero solo constaba en
la auditoria (quien acababa de guardar no podia confirmarlo), y **el roster no devolvia
`extCertFileKey`**, asi que al reabrir la lista el adjunto no aparecia y quien lo mirara volveria a
subirlo. Es el mismo fallo que los estados de asistencia sin sembrar, del dia anterior.

### 2.2 — LA SEGUNDA PUERTA

Registrar el papel desde la ficha de la persona. **Y la premisa del cliente al pedirlo era falsa, lo
cual importa:** creia que hacia falta porque *"si se cierra la convocatoria ya no se puede"*. Se
comprobo — el servidor solo rechaza marcar asistencia en BORRADOR y CANCELADA
(`offerings.service.ts:149`); una jornada EJECUTADA sigue dejando corregir certificados.

Lo que SI lo justifica es el camino: **la peticion llega con un nombre, no con una jornada**. Mismo
argumento que puso la constancia interna en esa pantalla (#128). Y su consecuencia: si registrarlo
cuesta no se registra, y sin el papel la obligacion se queda con el vencimiento que CALCULA la
recurrencia en vez del que dice el certificado — una fecha equivocada que nadie detecta hasta que
caduca una habilitacion legal.

**Puerta propia** `PATCH /enrollments/:id/papel-de-tercero` y no la de asistencia: desde la ficha no
se esta tomando ninguna lista, y reusarla obligaria a mandar `estado: PRESENT` sobre una asistencia
ya marcada solo para que el certificado llegara de rebote. Un dia alguien lo mandaria con otro estado
y **remarcaria una asistencia sin querer**.

La lista filtra en MEMORIA y no en la consulta: `tracksExternalCertificate` sale de la cascada tipo →
ficha, asi que un `where` por columna se dejaria fuera todas las que lo heredan del tipo, que son la
mayoria. El recorrido lo prueba con una que lo hereda sin decirlo en su ficha.

### 2.3 — LA VIA C, Y LA PREGUNTA DEL CLIENTE QUE FIJO EL DISEÑO

Quien llega ya certificado de otro empleo. Ver **Decisiones #160 y #161**, que recogen el porque.

Lo importante para retomar: **el cliente pregunto lo correcto y cambio el diseño**. Iba a hacerlo con
un motivo libre por persona; el pregunto *"¿y si la empresa cree que debe hacerlo igual porque son
procesos propios?"* y eso obligo a las dos capas — la formacion declara si su papel es transferible
(por defecto NO) y aceptar cada papel es un acto auditado. Con el diseño anterior se habria podido
dar por cumplida una induccion con el papel de otra empresa.

Y volvio a preguntar lo correcto con la cascada: **"¿no es mejor que este en cada formacion?"**. Si —
y a `tracksExternalCertificate` le habia pasado exactamente eso dos dias antes. Se hizo el mismo dia
en vez de esperar a que apareciera el caso.

### UNA TRAMPA DE LOS RECORRIDOS QUE COSTO MEDIA HORA

`convalidar-papel-ajeno.mjs` fallaba en dos aserciones, de forma consistente, y **pasaba al añadir
una linea de depuracion**. Parecia una carrera y no lo era.

Las reglas de las formaciones de prueba **siguen activas hasta que se limpian**, asi que a cada
persona nueva del mismo cargo le nacen tambien las obligaciones de todo lo que quedo de corridas
anteriores. Un `includes('Trabajo en alturas')` cazaba la formacion de OTRA corrida: se convalidaba
una obligacion y se leia otra. El sintoma es desconcertante —la funcionalidad va bien y la asercion
dice que no— y la causa no se parece en nada.

**La regla, ahora escrita en el recorrido:** toda busqueda por nombre va acotada al sufijo de su
corrida.

### Verificacion

461 unitarias · 21/21 e2e · seis recorridos de asistencia en verde
(`asistencia`, `asistencia-combinaciones`, `asistencia-correcciones`, `asistencia-evidencia`,
`papel-desde-la-persona`, `convalidar-papel-ajeno`) · tsc y lint limpios.

### PENDIENTE Y ABIERTO: una induccion especifica ofreciendo "papel de un tercero"

Lo vio el cliente al final de la sesion, y **no se resolvio**. Lo medido:

- La formacion *"Estandar Induccion especifica E2E884778"* aparece en **Papeles de un tercero** de
  una persona, diciendo *"la dicto PROPIOS"*, que es contradictorio: si la dicta la empresa no hay
  ningun tercero que expida nada.
- **La cascada hizo lo suyo bien.** La ficha tiene `tracksExternalCertificate = null` (hereda) y el
  TIPO `INDUCCION_ESPECIFICA` tiene **`tracksExternalCertificate: true`** en su configuracion. La
  pantalla enseña lo que el tipo declara. Lo que falla es lo de abajo.
- **No lo puso ningun recorrido**: el unico que toca la configuracion de un tipo es
  `convalidar-papel-ajeno.mjs` y apunta a RECERTIFICACION. Vino de la interfaz o del dato de partida.

**Y al documentarlo aparecio la mitad que SI es nuestra.** La regla «si la dicta la empresa, no hay
tercero que certifique» existe desde el 2026-09-06, pero vive **solo en la lista de asistencia**. La
segunda puerta —*Papeles de un tercero* en la ficha— filtra unicamente por la cascada tipo → ficha y
**no mira quien dicto la jornada**, aunque lo tiene delante y lo enseña (`quienLaDicto`,
`papel-de-tercero.service.ts:91`). Por eso la fila se contradice a si misma. Las dos mitades son
coherentes por separado.

**Lo que queda abierto, separado en tres:**

1. **La incoherencia entre las dos puertas — nuestra, y hay que arreglarla.** El mismo criterio debe
   decidir igual se entre por donde se entre. Ojo al arreglarlo: en la lista es un DEFECTO de
   pantalla y no una compuerta, a proposito (hay tenants —un centro de entrenamiento acreditado— donde
   «propios» y «certificado oficial» conviven). Copiar el criterio, no endurecerlo.
2. **¿Debe `INDUCCION_ESPECIFICA` llevar papel de un tercero? — del cliente, no nuestra.** Casi seguro
   que no, la dicta la empresa. Pero es configuracion del tenant y apagarla por nuestra cuenta seria
   decidir en su nombre (#159). Se apaga en Configuracion → Tipos de formacion.
3. **La pantalla no deja comprobar nada.** Enseña el nombre de la formacion sin decir POR QUE la
   ofrece y sin poder abrirla. El cliente lo pidio expresamente: *"desde esa interfaz debe poder
   abrir esa formacion o convocatoria"*.

Anotado en `PENDIENTES` 2.5 (lo nuestro) y 2.6 (lo del cliente), y explicado en
`docs/modulos/formaciones/08-evidencia.md` §8.

---

## 2026-09-08 — Los rotulos que no decian lo que pasa, y un cruce que la pantalla prometia y no cumplia

Sesion corta de lenguaje y orden, con el cliente leyendo la pantalla campo por campo. Casi todo
salio de preguntas suyas, y dos de ellas destaparon cosas que no eran de redaccion.

### 1. LA FICHA, EN EL ORDEN EN QUE SE PIENSA

Segundo ajuste en dos dias y el cliente tuvo razon las dos veces. Queda:

**Nombre + Tipo** · Proceso | Responsable · Modalidad por defecto · La acredita un tercero ·
**Norma** · **Descripcion**

Dos motivos distintos para lo que bajo:

- **La norma** clasifica —para poder decir cuanta formacion tributa a cada norma— pero no decide
  nada: ni a quien se le exige, ni que lleva la formacion. Lo que se consulta a diario va antes.
- **La descripcion** va la ultima por ser el unico campo GRANDE. Un area de texto de tres renglones
  en medio parte la retahila de campos cortos y obliga a saltarla con la vista.

**La regla que deja, para la proxima pantalla:** los campos grandes al final, y el orden de los
cortos lo decide con que frecuencia se miran.

### 2. LA MODALIDAD NO ERA REDUNDANTE — PERO EN LA CONVOCATORIA SI

El cliente pregunto por que sale en la ficha y en la convocatoria. Se midio antes de contestar:

- La de la FICHA no es solo un defecto. Ademas decide la modalidad de la jornada PERMANENTE que el
  sistema crea solo al publicar una formacion de autoservicio (`versioning.service.ts`), y es la que
  ve el aprendiz en el reproductor (`player.service.ts`). Se llama ahora **"Modalidad por defecto"**.
- En la CONVOCATORIA si estaba repetida: en "Datos de la jornada" y otra vez en la tarjeta de al
  lado. Se quito de los datos y vive en la tarjeta, que es donde significa algo.

### 3. "COMO SE ACREDITA" NO DECIA LO QUE PASA

Tres rotulos parecidos —modalidad, como se acredita, certificado de un tercero— puestos en fila se
leen como el mismo dato tres veces. El cliente lo dijo tal cual: *"¿que tiene que ver «como se hace»
con la modalidad y con «como se acredita»?"*.

Ahora la tarjeta se llama **"Como se cierra esta jornada"** y se lee como una cadena:

| | |
|---|---|
| **Como se dicta** | logistica: donde va la gente |
| **Como se registra** | la evidencia: que queda escrito de que la hizo |
| **Papel de un tercero** | un documento aparte, con su numero y su vencimiento |

Y el campo del formulario paso de "Como se acredita" a **"Como se registra"**, con las opciones
renombradas: *"Con lista de asistencia"* y *"Al completar el contenido"*.

**Se probo con dos opciones y se volvio a tres.** La version de dos —la heredada resuelta y marcada,
como "la acredita un tercero"— parecia mas limpia hasta que el cliente pregunto: *"¿donde queda la
opcion de registro automatico por contenido?"*. Con dos, la heredada y la automatica se pisaban en el
mismo boton. Con tres, la heredada dice **a que resuelve** ("Lo que sugiere su modalidad: con lista
de asistencia"), que es justo lo que le faltaba a la vieja "lo que diga su modalidad": no decia QUE
decia.

Y se dice "al completar el contenido" y no "automatico" a secas porque "automatico" no dice QUE lo
dispara. Lo que hace falta saber es que se cierra sola cuando la persona termina el temario y, si su
tipo los pide, la evaluacion y la encuesta.

### 4. Y LA PREGUNTA QUE DESTAPO UN HUECO DE VERDAD

*"Si hacen una virtual que acredita un tercero, donde la asistencia es automatica, ¿que pasa?"*.

Se comprobo en el codigo: **`registraCertificadoExterno` y `admiteAsistencia` son independientes**.
El primero sale de la formacion; el segundo, de como se dicto esa jornada. Asi que una formacion con
papel de tercero cuya jornada se cierra al completar el contenido —un curso en linea de la ARL que
emite certificado— **no tiene hoy donde registrar el papel**. No hay lista.

Y la tarjeta decia siempre *"la lista pedira su numero y su vencimiento"*. Mentia en ese cruce.

**Lo que se hizo y lo que NO.** No se invento una pantalla: es raro, y esa es la segunda puerta que
ya estaba en `PENDIENTES` (2.2 y 2.3). Lo que si se arreglo es la promesa — ahora dice *"esta jornada
no lo pide: se cierra al completar el contenido"*. Prometer una lista que no va a aparecer es peor
que no decir nada: quien lo lee cierra la jornada esperando que le pregunten, y no le preguntan.

### 5. LO DEMAS

- **Pendiente 6.3, cerrado.** `autoPlan` entra en las dependencias del `useEffect`. **Cero avisos de
  lint en el proyecto.**
- **Pendiente 6.4, cerrado para lo que se VE.** 1.103 tildes corregidas en 185 archivos, con un
  barrido que solo toca cadenas y prosa —nunca identificadores, porque `const tamano` y
  `const campana` existen de verdad—. Un segundo rastreo, solo de texto visible, encontro tres que
  el primero se salto por tener `{}` en la linea (`Ano {plan.year}` entre ellas) y despues dio cero.
- **Pendiente 6.5:** el radio unico (`rounded-lg`) estaba a medio aplicar y el cliente lo noto
  preguntando si estaba mejor antes o ahora. No era ni una cosa ni la otra. Terminado en `Combo`,
  `MultiSelect` y `PersonPicker`, **con su regla escrita**: la caja de un control va a `lg`; lo que
  vive dentro de ella, a `md`.
- **Un texto inventado, fuera.** En el plan anual: *"los planes de SST, PESV o BASC no son planes
  aparte: son la vista por proceso de este"*. El cliente lo marco como falso. Era una afirmacion
  sobre como trabaja SU empresa colada en el rotulo de una pantalla.

### Verificacion

401 unitarias · 21/21 e2e · tsc y lint limpios · build en verde.

---

## 2026-09-07 — La matriz completa de la marca de asistencia, y la base de desarrollo respirando otra vez

Dos cosas, y las dos salieron de una pregunta del cliente: *"al cambiar de asistio a no por error,
cuando ya se cumplio... ¿que pasa? ¿sigue con los pendientes?"*.

### 1. LA RESPUESTA, Y AHORA MEDIDA EN LAS QUINCE CASILLAS

`scripts/recorridos/asistencia-combinaciones.mjs` — **cinco estados iniciales por tres marcas**, cada
combinacion sobre su propia persona, y lo esperado escrito ANTES de correr nada (si se escribiera
mirando el resultado confirmaria lo que hace el sistema en vez de comprobar lo que debe hacer).

Los cinco estados: sin marcar · no asistio · falta justificada · cumplida por la lista · **cumplida
en la plataforma**, esta ultima montada haciendo el curso de verdad como aprendiz, que es el unico
camino para llegar a "cumplida SIN acta".

Las tres reglas de las que sale toda la tabla:

1. Una formacion CUMPLIDA no se reabre desde la lista, se mande lo que se mande.
2. Una NO cumplida se cierra si —y solo si— se marca PRESENT.
3. El acta se re-marca SIEMPRE, cumplida o no: corregir a quien se apunto mal no puede exigir
   tocar la base a mano.

**Y de la 1 y la 3 juntas sale la casilla por la que preguntaba: cumplida + "no asistio" deja el
acta diciendo que no vino y el expediente diciendo que cumplio, con la constancia emitida.** No es
un fallo del motor: es que deshacer un cumplimiento es ANULAR y no existe. Por eso la pantalla
enseña el estado de los cumplidos como TEXTO. **No vuelve a pendientes.**

Ademas, en el mismo recorrido: el papel de un tercero en sus cuatro variantes (completo, solo
numero, mandado con AUSENTE, y con fecha imposible), la justificacion sin motivo, un certificado en
una formacion que no lo lleva, y la lista entera con los tres estados en un solo envio. Todo en
verde a la primera — que aqui es la noticia buena: el comportamiento ya era el correcto, lo que
faltaba era tenerlo escrito.

### 2. PENDIENTE 6.2 HECHO: la basura de las pruebas sale del motor

`apps/api/scripts/limpiar-datos-de-prueba.ts` — ensayo por defecto, `-- --si` para hacerlo.

**Por que hacia falta otro ademas del que ya habia.** `limpiar-reglas-de-prueba.ts` busca por el
nombre de la AUDIENCIA y, con razon, respeta las reglas de formaciones PUBLICADAS: `findOrCreate`
reutiliza audiencias y una induccion real puede colgar de una con nombre de prueba. El efecto era
que la basura publicada se quedaba. El nuevo distingue por el nombre de la FORMACION —`E2E123456`,
que nadie usa de verdad— y por los nombres que la suite se pone a si misma (`Persona S3 …`,
`Importada Uno …`, `Analista Alcance …`), con `888888888` y `999999999` intocables: desactivar la
primera dejaria a las veintiuna pruebas sin poder iniciar sesion.

Desactiva, no borra, por la misma razon que el otro y que pesa mas aqui: en una base de desarrollo
que el cliente usa para mirar pantallas, un borrado en cascada mal calculado se descubre cuando
falta algo que nadie sabe que falta.

**Lo que se saco:** 1.043 reglas y personas de prueba. De 221 reglas activas a 72, y de 910 personas
activas a 4 —las reales—.

**La prueba de que el diagnostico era el bueno, y una correccion mia por el camino.** Al limpiar,
`sprint-1` paso de 4 de 5 a 5 de 5 y la suite de 18 de 21 a 20 de 21. Con un fallo suelto que saltaba
de una prueba a otra segun la corrida, escribi que era intermitencia de Playwright. **Con una sola
muestra, y estaba mal dicho.** El cliente pregunto lo unico que lo resolvia —*"¿esto salio antes o
despues de tus cambios?"*— y se midio de verdad:

| Que se corrio | Resultado |
|---|---|
| La suite con los cambios, antes de limpiar | 18 de 21 |
| Idem, tras la primera limpieza | 20 de 21 |
| **El codigo SIN los cambios** (`git stash`), base ya limpia | **21 de 21** |
| **Los cambios otra vez**, misma base limpia | **21 de 21** |

Las dos ultimas juntas son las que cierran la pregunta: **la causa era la basura acumulada, no el
codigo de la sesion**. La tercera fila sola parecia decir lo contrario y por un momento lo di por
bueno; hicieron falta las dos. La leccion no es sobre este fallo: **una sola corrida no distingue
una regresion de una condicion del entorno**, y el precio de averiguarlo son diez minutos.

### La suite recoge sola

`e2e/global-teardown.ts` corre ahora LOS DOS scripts. Cada uno ve una mitad —el viejo, las reglas de
las audiencias generadas; el nuevo, las formaciones y las personas de prueba— y si uno falla no se
salta el otro: la mitad que quede sin limpiar es la que hara fallar la proxima suite.

Comprobado: una corrida de `sprint-4` deja la base como la encontro (15 personas retiradas al salir).

### Y el fallo que parecia quedar, tampoco era otro

Tras enganchar el teardown se corrio la suite y dio 20/21, asi que se anoto como intermitencia
aparte. **Tampoco lo era**: esa corrida arranco con la base sucia, porque el teardown se acababa de
escribir y solo limpia al TERMINAR. Desde que cada corrida empieza de una base ya recogida:

| Corrida | Resultado | Duracion |
|---|---|---|
| 1 | 21 / 21 | 4,0 min |
| 2 | 21 / 21 | 3,6 min |
| 3 | 21 / 21 | 3,4 min |

Tres seguidas en verde y bajando de 6,7 minutos a 3,4: la base ligera no solo deja de romper la
suite, la hace la mitad de rapida. Es la tercera vez en el dia que la conclusion correcta salio de
repetir la medicion en vez de razonar sobre una sola muestra.


