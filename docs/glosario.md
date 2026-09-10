# Glosario del dominio — NEO PULSE

**Este es el diccionario oficial del producto.** Si dos personas usan la misma palabra con
distinto significado, el sistema se construye mal. Antes de discutir una funcionalidad, se
acuerda el termino aqui.

Formato de cada concepto: **que es**, **que NO es** (la confusion tipica), **como se llama** en
pantalla y en la base de datos, y un **ejemplo real de Transprensa**.

> Convencion general (Decision #26 y #31): la base de datos y el codigo usan el vocabulario
> estandar de la industria en ingles (`activities`, `offerings`, `enrollments`); la interfaz esta
> 100% en español. Nunca aparece "course" en pantalla.

---

## 1. La pregunta que ordena todo el modelo

Hay cuatro preguntas distintas y cada una tiene su propia entidad. Confundirlas es el error que
arruina las plataformas de formacion:

| Pregunta | Concepto | Ejemplo |
|---|---|---|
| **Que se aprende?** | Actividad formativa | "Seguridad Vial" |
| **Cuando, donde y con quien se dicta?** | Convocatoria | "Seguridad Vial, 15 de marzo, Cali, instructor Juan" |
| **Quien tiene la obligacion de hacerlo?** | Asignacion | "Todos los conductores" |
| **Que hizo realmente cada persona?** | Ejecucion (inscripcion) | "Maria asistio, saco 95, aprobo" |

Si estas cuatro fueran una sola cosa, repetir la misma capacitacion el año siguiente obligaria a
duplicarla, y no se podria responder "quien estaba obligado pero no lo hizo".

### El recorrido completo, de punta a punta

Los terminos se entienden mejor en el orden en que ocurren. Todo esto se hace **desde la
formacion**; los modulos (Convocatorias, Asignaciones) son tableros de lectura que cruzan todas
las formaciones.

```
  1. CREAR         Tipo (primero: decide el resto) + nombre + proceso
        |          -> nace la version 1 en BORRADOR
        v
  2. CONTENIDO     Lecciones, videos, presentaciones, examen
        |
        v
  3. PUBLICAR      Congela el contenido. Irreversible. La v1 ya no cambia
        |          (para cambiar algo se crea la v2; NO para agregar jornadas)
        v
  4. QUIENES       A quien se le exige -> nacen las OBLIGACIONES
        |          y quien entre mañana y cumpla la regla, la tendra solo
        v
  5. PROGRAMAR     La JORNADA: cuando, donde, quien dicta, a quienes atiende
        |          Al publicarla se congelan sus PROYECTADOS
        v
  6. CONVOCAR      De los obligados, quienes van a ESTA jornada -> CONVOCADOS
        |          Lo que quede fuera: "faltan N por convocar"
        v
  7. EJECUTAR      Presencial: ASISTENTES (firma, QR, lista)   [Sprint 5]
        |          Virtual:    la persona cursa y responde
        v
  8. CERRAR        Quien cumple el criterio queda CAPACITADO
                   -> se cierra su obligacion
                   -> sube la COBERTURA del plan
                   -> si el requisito se repite, se abre la ronda siguiente
```

Los pasos 4 y 5 son **independientes** y pueden ir en cualquier orden: a quien se le exige no
depende de cuando se dicte. Lo unico obligatorio es que **3 va antes que 5** (no se convoca un
borrador) y que **6 va despues de 5** (no se cita a una jornada que no existe).

En una formacion **de autoservicio** —induccion, pildora— los pasos 6 y 7 se funden: la persona
entra sola desde sus pendientes y empieza. No hay a quien convocar ni lista que firmar.


---

## 2. Conceptos del catalogo

### Actividad formativa
**Que es:** el producto formativo en si, independiente de cuando se dicte. Es lo que vive en el
catalogo y se reutiliza durante años. Contiene el contenido, la evaluacion y las reglas.

**Que NO es:** no es una sesion ni un evento. No tiene fecha, ni asistentes, ni instructor: eso
pertenece a la convocatoria.

**Como se llama:** en pantalla "Actividad formativa" (menu "Contenido formativo"); en la base
`activities`.

**Ejemplo:** "Induccion General Corporativa" existe en el catalogo desde 2026 y se sigue usando
en 2028, aunque se haya dictado 40 veces.

> Por que no se llama "curso": porque en NEO PULSE una induccion, una capacitacion del plan, una
> reinduccion y una pildora de 4 minutos son **la misma cosa con distinto tipo**. Llamarlas
> "curso" haria pensar que la pildora es otra entidad, y obligaria a construir tres motores.

### Tipo de actividad
**Que es:** la clasificacion que decide **como se comporta** una actividad: si es obligatoria al
ingresar, si se repite cada año, si emite certificado, si cuenta para el plan anual.

**Que NO es:** no es una etiqueta decorativa. Cada tipo cambia reglas reales.

**Como se llama:** "Tipo de actividad" (en Configuracion); en la base `activity_types`. Es un
catalogo **por empresa**: otro cliente puede inventar los suyos sin que se toque codigo.

Los seis tipos de Transprensa:

| Tipo | Que significa | Como se asigna | Cuenta para el plan? |
|---|---|---|---|
| **Induccion general** | Lo que TODO el que ingresa debe hacer, sin importar el cargo | Automatica al ingresar, y **antes** de iniciar labores | No |
| **Induccion especifica** | Lo que se debe hacer segun el cargo | Automatica por cargo | No |
| **Reinduccion** | Repaso periodico de lo anterior | Automatica cada N meses (Transprensa: 12) | No |
| **Capacitacion del plan** | Lo que se planeo para el año | Desde el plan anual | **Si** |
| **Capacitacion extraordinaria** | Lo que surge durante el año y no estaba planeado | Manual: a una persona, cargo, area o regional | **No** |
| **Pildora** (microlearning) | Pieza corta de 3 a 7 minutos para reforzar | Manual o por regla; alimenta el repaso espaciado | No |

**Ejemplo de por que importa la ultima columna:** si en agosto se detecta un problema y se dicta
una capacitacion extraordinaria, esa ejecucion **no debe mejorar ni empeorar** el indicador de
cumplimiento del Plan 2026. Son mediciones separadas.

**Y "cuenta para el plan" NO es automatico: cuenta cuando esta PROGRAMADA en el plan.** Crear una
formacion de tipo "Capacitacion del plan" no la mete en ningun plan — el plan referencia
convocatorias, no se apropia de actividades (regla de oro 3), y sus indicadores solo miran
obligaciones nacidas de un renglon suyo (regla de oro 2). Mientras nadie le programe una jornada
en el plan del año, esa capacitacion no cuenta ni para el cumplimiento ni para la cobertura. La
ficha de la formacion lo dice y ofrece programarla ahi mismo; el mes lo decide el analista, que es
la unica parte que el sistema no puede adivinar.

#### Que pregunta cada tipo, y que numeros le aplican

Esta es la tabla que responde *"¿esto aplica a todas las formaciones o solo a algunas?"*. **El
tipo la gobierna** (`activity_types.config`), y por eso crear una pildora no pregunta por
instructor y la induccion general no deja marcar a nadie.

| | Induccion general | Induccion especifica | Reinduccion | Capacitacion del plan | Extraordinaria | Pildora |
|---|---|---|---|---|---|---|
| **Quien decide a quien se le exige** | nadie: **toda la empresa** | la **matriz de cargos** | toda la empresa | **el analista** | el analista | el analista |
| **Se puede editar a quien** | no | si, **con novedad justificada** | no | si | si | si |
| **Se repite** | no | no | **cada 12 meses** | no | no | no |
| **Vence contando desde** | el **ingreso** (antes de empezar a trabajar) | el ingreso al cargo | la ultima vez que se hizo | la fecha de la jornada | cuando se asigna | cuando se asigna |
| **Forma por defecto** | permanente | permanente | permanente | **jornada con fecha** | jornada con fecha | permanente |
| **Pide instructor, lugar, cupo** | no | no | no | **si** | **si** | no |
| **Autoservicio** | si | si | si | no | no | si |
| **Emite constancia** | si | si | si | si | si | **no** |
| **Cuenta para el plan anual** | no | no | no | **si** | no | no |

Y los seis numeros (ver *Los seis numeros* en la seccion 4), por tipo:

| Numero | Donde aplica |
|---|---|
| **Obligados** | **en todos.** Es la unidad de medida del cumplimiento; sin obligacion no hay vencimiento, ni "quien falta", ni denominador |
| **Proyectados** | en todos, pero **solo importa de verdad en las de jornada**: en una permanente los proyectados son sencillamente los obligados |
| **Convocados** | **en las de jornada.** En autoservicio "convocarse" lo hace la propia persona al entrar |
| **Pendientes de convocar** | **solo en las de jornada.** En autoservicio no aplica: no hay a quien citar |
| **Asistentes** | **solo en presencial o mixta.** En virtual no hay lista que firmar |
| **Capacitados** | **en todos.** Es lo unico que cierra la obligacion |

### Version de una actividad
**Que es:** el contenido congelado en un momento dado. Una actividad tiene varias versiones a lo
largo del tiempo.

**Que NO es:** no es un borrador de trabajo permanente. Una version publicada es **inmutable**.

**Como se llama:** "Version 1", "Version 2"; en la base `activity_versions`.

**Por que existe:** porque un auditor puede preguntar *"muestreme exactamente que contenido vio y
que examen presento esta persona en marzo"*. Si el contenido fuera editable, esa pregunta no
tendria respuesta, y subir la nota minima de 70 a 80 reprobaria retroactivamente a gente ya
aprobada.

**Como funciona:** se trabaja en un borrador; al **publicar**, el sistema congela todo (incluso
copia las lecciones a copias inmutables). "Editar" una version publicada en realidad crea la
version siguiente en borrador, sin tocar la anterior.

**Cuidado con lo que publicar NO hace:** publicar la version 2 no cambia lo que esta entregando
una convocatoria ya abierta. La convocatoria avisa que hay una version mas nueva y hay que
**actualizarla a proposito**, porque eso mueve a gente ya citada. Ver *Politica de migracion*.

#### Que se versiona y que NO (y por que no todo)

Solo el **contenido**. Todo lo demas se edita en vivo, y eso es la simplificacion, no un descuido:
si la ficha estuviera versionada, corregir una falta de ortografia en el nombre costaria una
version nueva y una decision sobre quien la esta cursando.

| Qué cambias | ¿Versión nueva? | Qué pasa con lo ya hecho |
|---|---|---|
| Lecciones, videos, examen | **Sí** | Lo publicado es inmutable; se decide qué pasa con quien va a mitad |
| **Ficha**: nombre, descripción, proceso, norma, modalidad | No | Se guarda y ya. Lo que la constancia imprime quedó **congelado al publicar** |
| **Responsable** | No, pero **se congela** en la versión al publicar | La constancia dice quién respondía ese día |
| **Quiénes**: a quién se le exige | No | Es dato vivo. Su historia está en las obligaciones y en la auditoría, no en versiones |
| **Convocatorias** | No | Cada jornada es un hecho con su fecha; agregar diez no crea ninguna versión |

**El caso que lo obliga, y que hay que entender:** alguien hace la capacitacion en **enero**. En
**marzo** cambia la norma aplicable en la ficha. ¿Que dice su constancia?

> **La norma de enero.** Al publicar, la version copia POR VALOR lo que la evidencia necesita —el
> nombre, el proceso, la norma, el temario y quien responde—. La ficha sigue viva y se corrige
> cuando haga falta, pero el registro de enero no se reescribe.

Es el patron que usan SuccessFactors, Cornerstone y Absorb: **version inmutable del contenido +
snapshot por valor en el registro**. Versionar la ficha entera seria pagar mucho por lo mismo.

**Lo que NO resuelve el versionado, y se confunde con el:** *"que todo cambio lo apruebe el
administrador"*. Eso es **aprobaciones**, un mecanismo distinto y que ya existe: una operacion
compuertada se ejecuta si quien la pide tiene el permiso, y si no, queda como solicitud. Versionar
responde *"¿que vio esta persona?"*; aprobar responde *"¿quien autorizo este cambio?"*. Son dos
preguntas distintas y hacen falta las dos.

### Politica de migracion
**Que es:** la respuesta a *"cuando salga la version nueva, ¿que pasa con los que ya estaban?"*.
Se elige al **publicar** la version, y se aplica despues, cuando alguien actualiza una
convocatoria a esa version.

**Las tres opciones:**
- **Terminan en la anterior** — nadie de los ya inscritos se mueve; la version nueva la ven solo
  quienes se inscriban despues.
- **Pasan los que no han empezado** (la de siempre) — quien va a mitad termina con el contenido
  que ya conocia; quien no ha abierto nada arranca con el nuevo.
- **Todos vuelven a empezar** — el contenido cambio lo suficiente como para que lo anterior no
  sirva.

**Lo que ninguna opcion hace, nunca:** tocar una formacion que la persona ya **cerro** (completada,
aprobada, reprobada, retirada o vencida). Eso es evidencia: dice lo que dijo y no cambia. Y a
quien se mueve no se le borra el avance viejo: deja de contar, pero sigue registrado.

**Por que se decide al publicar y no al actualizar:** quien publica la version sabe **cuanto
cambio el contenido**, que es lo unico que responde la pregunta. Quien actualiza una convocatoria
tres semanas despues, no.

### Leccion
**Que es:** una pila de 5 a 15 **tarjetas** que se pasan como historias de Instagram. Es la unidad
de contenido del producto y dura menos de 5 minutos.

**Que NO es:** no es un PDF ni un video largo subido. Por diseño, el sistema no permite publicar
un PDF como leccion: el PDF se adjunta como material de consulta o sirve de fuente para generar
tarjetas.

**Como se llama:** "Leccion"; en la base `lessons` y `lesson_cards`.

**Tipos de tarjeta disponibles:** texto con imagen, video corto (maximo 3 minutos), quiz de
refuerzo, tarjeta de dos caras, encuesta rapida, y completar la palabra faltante.

**Ejemplo:** la leccion "Bienvenida a Transprensa" tiene 8 tarjetas: saludo, mision, una tarjeta
de dos caras con "que significa PESV", un video de 60 segundos del gerente, y un quiz de refuerzo.

### Presentacion
**Que es:** una presentacion (PDF, PPT, PPTX u ODP) que al subirla se **convierte en una imagen
por diapositiva** y se reproduce dentro del producto, una diapositiva a la vez.

**Por que no se sirve el archivo tal cual:** porque un PDF metido en un visor no dice nada. La
persona hace scroll y la plataforma no sabe si lo leyo, cuanto tiempo estuvo ni hasta donde llego;
lo unico honesto que se puede registrar es que confirmo haberlo abierto. Convertida en
diapositivas se puede registrar **cual vio y cuanto tiempo**, y eso es lo que la vuelve evidencia.
De paso se ve igual en cualquier telefono, sin depender del Office de nadie.

**Que NO es:**
- No es un **documento**. Un documento se consulta y se declara leido; una presentacion se
  recorre y se mide. Son dos tipos de contenido distintos, a proposito.
- No es una **leccion**. Una leccion se escribe en tarjetas, con quiz de refuerzo y encuestas
  dentro. Una presentacion es material que llego hecho de fuera.

**Para que existe:** el caso real es la ARL que manda su presentacion el dia antes de la
capacitacion. Pedirle al administrador que la rehaga a tarjetas no va a pasar, y subirla y llamar
a eso un curso es justo lo que este producto no hace. Convertirla es el punto medio: entra tal
como llego y sale medible.

**Que se pierde al convertir, y se avisa al subir:** animaciones, videos incrustados e
hipervinculos. El original se guarda igual —es el documento que entrego el proveedor y una
auditoria puede pedirlo tal cual—, pero lo que se reproduce son siempre las diapositivas.

**Cuando se da por vista:** cuando se vieron **todas**. A diferencia de un video, aqui no hay
barra que arrastrar —cada diapositiva se pasa a mano—, asi que un umbral por debajo del 100% no
significaria nada. El tiempo minimo, si la formacion lo exige, se pide igual.

**Como se llama:** "Presentacion"; en la base es un `activity_contents.type = PRESENTATION` con un
`content_packages.kind = PRESENTATION` cuyo `manifest` lista las diapositivas.

### Evaluacion (examen)
**Que es:** el instrumento que mide si la persona aprendio. Toma preguntas del banco y las sirve
barajadas.

**Que NO es:** no es el quiz que aparece dentro de una leccion. Ese quiz es **refuerzo** (no da
nota); la evaluacion **si califica** y decide si aprueba.

**Como se llama:** "Evaluacion"; en la base `assessments` y `assessment_versions`.

### Banco de preguntas
**Que es:** el deposito de preguntas, organizado por categorias. Los examenes toman preguntas de
aqui, normalmente al azar.

**Por que se versiona:** corregir el enunciado de una pregunta **no** cambia lo que ya
respondieron otros: se crea una version nueva y los intentos historicos conservan la que se les
sirvio. (En Moodle, para corregir una pregunta con intentos hay que borrar los intentos; aqui eso
nunca es necesario.)

**Ejemplo:** categoria "Seguridad vial" con 40 preguntas; el examen toma 10 al azar. Dos
conductores nunca ven el mismo examen, asi que pasarse las respuestas no sirve.

### Intento
**Que es:** cada vez que una persona presenta una evaluacion. Guarda **que preguntas le cayeron,
en que orden, que respondio y que saco**.

**Por que se guarda con ese detalle:** para poder anular una pregunta defectuosa y recalificar
solo a quienes les toco, y para defender una impugnacion. Sin eso, "el sistema dice que sacaste
80" es un acto de fe.

---

## 3. Conceptos de ejecucion

### Convocatoria (la jornada)
**Que es:** una entrega concreta de una formacion: cuando, donde, quien la dicta, a quienes
atiende y cuantos caben.

**Que NO es:** no es la formacion. La misma "Seguridad Vial" tiene la jornada de marzo en Cali y
la de agosto en Bogota, sin duplicar el contenido. **Tampoco es la obligacion**: una dice *cuando
se dicta*, la otra *a quien se le exige*. Por eso una formacion tiene UNA lista de obligados y
VARIAS jornadas.

**Como se llama:** "Convocatoria" en el modulo, "Programacion" dentro de la formacion; en la base
`offerings`.

#### PUBLICAR NO ES PROGRAMAR (la confusion mas cara)

Son dos actos distintos y en este orden:

1. **Publicar la version** congela el CONTENIDO: lo que la gente va a ver ya no puede cambiar.
2. **Programar una convocatoria** dice CUANDO se dicta, y cuelga de esa version publicada.

**No hace falta crear una version 2 para agregar una convocatoria.** La v2 solo existe cuando
cambia el contenido. Lo normal es: publicas la v1 → creas la jornada sobre la v1 → y la gente ve
la v1 para siempre, mientras nadie edite el contenido.

Por eso la pantalla dice *"Primero publica una version"* cuando intentas programar sin haber
publicado: **no se puede convocar un borrador**, porque lo que veria la gente todavia puede
cambiar (Decision #6).

**¿Se puede publicar sin ninguna convocatoria?** Si, y es normal: la formacion queda lista en el
catalogo y se programa cuando toque. Lo que hay que saber es el efecto: **una obligacion sin
convocatoria se ve pero no se puede empezar**. En los pendientes del colaborador sale la tarjeta
con candado y el texto *"Todavia no esta abierta"*. Para que pueda hacerla tiene que existir una
jornada: **permanente** (se apunta sola) o **con fecha** (alguien la convoca).

#### La FORMA: como entra la gente

Es el campo que mas decide, y en pantalla se pregunta con las palabras de la pregunta real:
**"¿Como la hace la gente?"**.

| Forma | Como entra la gente | Pide fecha | Autoservicio | Ejemplo de Transprensa |
|---|---|---|---|---|
| **Se convoca a una sesion** (`EVENT`) | **la citan**: alguien la inscribe | Si, y lugar si no es virtual | **No** | Manejo defensivo, 12 de marzo, 8 a. m., Auditorio Norte |
| **Disponible** (`PERMANENT`) | **entra sola** cuando puede | No; ventana opcional | **Si** | Induccion general: cada quien la hace su primer dia |
| **Las dos** (`HYBRID`) | hay sesion y ademas contenido en linea | Si | Si | Taller presencial con una parte virtual previa |

**Y decide QUE se pregunta.** No es una etiqueta: al elegirla, el formulario cambia.

| | Con fecha | Disponible |
|---|---|---|
| Fecha y hora | **se piden** | no |
| Lugar | **obligatorio** si no es virtual | no |
| Quien la dicta (y ¿cual?, si es externa) | **se pide** | no |
| Instructor | **se pide** | no |
| Intensidad horaria | **se pide** | no |
| Cupo | **se pide** | no |
| Desde / hasta | no | **opcional** |

Por eso crear una pildora ya no pregunta por instructor —no lo tiene— y una capacitacion del plan
si. El **tipo propone la forma** (`defaultOfferingKind`): inducciones, reinduccion y pildora nacen
*disponibles*; capacitacion del plan y extraordinaria nacen *con fecha*. **Se puede cambiar**: si
alguien decide dictar una pildora en una sesion presencial, marca "se convoca a una sesion" y los
campos aparecen. Manda lo elegido, no lo que el tipo suponia.

##### Los dos casos completos, de punta a punta

**Caso A — "Induccion general" (disponible).**
Se publica el contenido y se crea **UNA** convocatoria permanente, sin fecha. Eso es todo, y sirve
años. Entra una persona nueva el 3 de febrero: la obligacion le nace sola, ve la formacion en sus
pendientes con el boton **"Empezar"**, la hace esa misma tarde desde el celular y queda capacitada.
Nadie la cito, nadie firmo nada. **Nunca se crea una segunda convocatoria**: la misma permanente
atiende a los 116 y a los que entren.

**Caso B — "Manejo defensivo" (con fecha).**
40 conductores obligados, 20 en Antioquia y 20 en Cundinamarca. Se crean **DOS** convocatorias
—12 de marzo en Antioquia, 19 en Cundinamarca—, cada una con su lugar, su instructor y su tajada.
Se publican: cada una congela **20 proyectados**. Se convoca a los 20 de cada sede. El dia de la
jornada firman 18 y, si hay examen, quedan capacitados los que lo aprueben. Aqui la persona **no
puede apuntarse sola**: el servidor lo impide con estas palabras —*"Esta convocatoria tiene fecha y
cupo: te inscribe quien la programa"*—, y es correcto: en una sala con 20 sillas no entra quien
quiera.

**La regla que resume las dos:** una convocatoria **siempre**; varias **solo cuando hay varias
jornadas reales**. La convocatoria no es "para cuando hay varias" — es donde cuelga la inscripcion,
y sin ella nadie puede empezar nada.

#### Autoservicio
**Que es:** que la persona **se inscribe ella misma** desde sus pendientes, sin que nadie la cite.
Ocurre solo en convocatorias permanentes o mixtas, publicadas y dentro de su ventana de fechas.

**Que NO es:** no es "el curso es opcional". La obligacion sigue existiendo y venciendo; lo unico
que cambia es **quien pulsa el boton de inscribir**.

**Por que existe:** la induccion general la hacen 116 personas en momentos distintos, cada una su
primer dia. Citarlas una por una seria trabajo puro: la formacion esta ahi y cada quien entra.

**Que pasa si se intenta en una jornada con fecha:** el servidor lo impide con estas palabras —
*"Esta convocatoria tiene fecha y cupo: te inscribe quien la programa"*—. Es correcto: en una sala
con 20 sillas no puede entrar quien quiera.

**Ejemplo de Transprensa:** "Induccion general" es permanente, sin ventana → siempre disponible.
"Manejo defensivo" es sesion programada del 12 de marzo → el analista convoca a los 20 de esa
regional.

#### Convocar, y "faltan N por convocar"

**Convocar es inscribir.** No hay una lista aparte: los convocados de una jornada SON sus
inscripciones (`enrollments`). Solo se puede convocar a quien tiene la obligacion abierta.

**Quien falta** (`GET /offerings/:id/pendientes-por-convocar`) se calcula asi:

```
  obligados abiertos de la formacion
  ∩ tajada de esta jornada
  − quienes ya estan inscritos en CUALQUIER jornada de esta formacion
```

Lo ultimo es lo que hace util el numero: a quien ya se cito el 12 de marzo en Antioquia **no le
falta nada** por no estar en la del 19 en Cundinamarca. Si se restaran solo los de ESTA jornada,
cada convocatoria reclamaria a la empresa entera.

**En pantalla** salen los cuatro numeros en el orden en que se leen —proyectados, convocados,
faltan por convocar, intensidad— y **la lista con nombre y apellido** de quien falta, con su boton.
El numero dice que hay un hueco; la lista dice a quien hay que citar, que es lo que permite actuar.

**"Convocar a los N que faltan"** cita a todos de una vez, y respeta la tajada: convocar a mas de
los proyectados seria inflar el numerador de la cobertura.

**En autoservicio no aplica**: no hay a quien citar, la persona entra sola.

#### Cupo
**Que es:** cuantas personas caben, como maximo. **Vacio = sin tope**, que es lo normal en una
formacion virtual propia.

**Que hace de verdad:** dos cosas. Impide inscribir a mas de N desde el panel (`El cupo es de 20
personas`), e impide que alguien se apunte solo cuando ya esta lleno.

**Cuando ponerlo:** cuando el limite es real —caben 20 en la sala, la ARL dicta para 30, hay 50
licencias compradas—. Ponerlo "por si acaso" en un curso virtual solo sirve para bloquear a
alguien sin motivo.

#### Lugar, y por que no es la regional
Se confunden porque las dos suenan a "donde".

| | Que es | Ejemplo | Para que sirve |
|---|---|---|---|
| **Regional** | la **sede** a la que pertenece la gente; es catalogo | "Antioquia" | acota la tajada y sale en los reportes por sede |
| **Lugar** | la **direccion fisica de esa jornada**; es texto libre | "Auditorio principal, sede Norte" | va impreso en el acta de asistencia |

Una regional tiene varias salas posibles, y una jornada puede darse fuera de la empresa (un hotel,
las instalaciones de la ARL). El lugar solo se pide —y es obligatorio— en jornada no virtual.

#### Tajada de la jornada (a quienes atiende)

**Que es:** que parte de los obligados atiende ESTA jornada, con los mismos criterios de Quienes
(cargo, area, regional, servicio). Vacia = atiende a **todos** los obligados. En la base,
`offerings.audience_id`.

**Para que sirve:** es lo que hace que los **proyectados** de dos jornadas de la misma formacion
no sean los mismos. Sin ella, "Gestion de servicios" con 40 obligados y dos jornadas proyecta 40 y
40 → el plan divide por 80 y la cobertura no puede pasar del 50% aunque se capacite a todo el
mundo.

**Ejemplo:** jornada del 12 de marzo, tajada "regional: Antioquia" → proyectados 20 de los 40.

Al elegir la **regional como sede**, la tajada se propone con esa regional: marcada y quitable.
Sugerencia visible, no decision por detras.

#### Intensidad horaria
Horas **teoricas** y **practicas**, siempre separadas (lo exige el PESV en su Paso 10) y sumando
para las 10 h/año de BPM. Hoy se guarda y se muestra; el indicador anual de horas por persona
todavia no existe (`norms.annual_hours_required` sigue sin leerse).

#### Ejecutada por, y "¿cual?"
Quien la dicta: la empresa con personal propio, la ARL, la EPS, la temporal u otro tercero. **Si es
externa se pregunta CUAL**, porque "la ARL Sura dicto 14 jornadas este año" es una metrica y "un
tercero" no lo es. Cuando la dicta la empresa, se elige el **instructor** de entre su gente, con el
mismo selector que el responsable del proceso.

> **Estado hoy (2026-08-30):** la pregunta "¿cual?" ya se hace en toda ejecucion externa —antes
> solo la abria "otros"—, pero **la lista de opciones sigue fija en el codigo** y la entidad es
> **texto libre**. Es decir: se puede registrar, todavia no se puede medir bien, porque "Sura",
> "ARL SURA" y "Arl sura" cuentan como tres. Falta el catalogo por tenant, con su bandera de "pide
> entidad", y que la entidad sea tambien catalogo.

**Cuelga de una version, y ahi se queda hasta que alguien la mueva:** si se publica una version
nueva de la formacion, la convocatoria sigue entregando la que tenia y lo **avisa en pantalla**.
Actualizarla es un acto aparte que muestra a cuantos inscritos afecta antes de hacerlo, porque
cambiarle el contenido a gente ya citada no puede ser un efecto colateral. Ver *Politica de
migracion*.

### Asignacion
**Que es:** la **obligacion** de una persona de realizar algo, con su fecha limite. Existe aunque
la persona no haya empezado.

**Que NO es:** no es la participacion. Es la respuesta a "quien **debe** hacerlo".

**Como se llama:** "Asignacion" / "Pendientes" (del lado del colaborador); en la base
`assignments`.

**Por que se separa de la inscripcion:** porque el estado que mas le importa a un jefe de
cumplimiento es justamente **"obligado pero no lo ha hecho"**. Si obligacion y participacion
fueran lo mismo, ese estado no existiria.

**De donde nace una asignacion:**
- de una **regla** (todos los conductores; todo el que ingrese),
- del **plan** anual,
- **manual** (el analista se la asigna a alguien porque detecto la necesidad),
- de un **requisito recurrente** que vencio.

**Sus estados, y por que importan:**

| Estado | Que significa |
|---|---|
| Pendiente | Obligada y aun a tiempo |
| En curso | Ya empezo a hacerla |
| Cumplida | La termino; queda enlazada a la ejecucion que la satisfizo |
| **Vencida** | Se paso la fecha. No desaparece: es el numero que mira el auditor |
| **Retirada** | La persona salio de la audiencia (cambio de cargo, retiro). Solo se retira lo **pendiente**; lo que ya estaba en curso o cumplido no se toca |
| **Eximida** | Alguien con permiso la libero **con motivo escrito**. Deja de contar, pero el motivo y el autor quedan |

Nunca se borra ninguna: un cumplimiento del que se puede borrar evidencia no es evidencia.

#### "Se le exige": desde ahora, o al ingresar

Es **desde cuando se cuenta el plazo**, y cambia por completo a quien afecta:

| Opcion | Cuenta desde | Ejemplo |
|---|---|---|
| **Desde ahora** | el momento en que se le empieza a exigir | Se marca SARLAFT para Comercial hoy: los 12 comerciales actuales tienen 30 dias **desde hoy**; quien entre en marzo, 30 dias desde su alta |
| **Al ingresar a la empresa** | la **fecha de ingreso** de cada persona | Induccion general: quien entra el 3 de febrero la debe tener **antes** de ese dia (D1072) |

**Los dias, y el negativo.** Es el plazo contado desde ese ancla, y **negativo significa antes**:

- `30` con *desde ahora* → vence en 30 dias.
- `0` con *al ingresar* → vence **el mismo dia** que entra.
- `-1` con *al ingresar* → vence **el dia antes** de empezar a trabajar. Es literal en la norma: la
  induccion es PREVIA al inicio de labores.

**La gracia, que evita el desastre.** Si la fecha calculada cae antes del momento en que la
obligacion nace —quien entro en 2019 y hoy se estrena el requisito— se sustituye por **"desde hoy,
30 dias"** (`DIAS_DE_GRACIA`). Sin eso, estrenar una induccion anclada al ingreso produciria 116
vencidas el primer dia, y seria falso: la empresa no estaba incumpliendo, es que el sistema no
existia. A quien entra mañana no le afecta.

**"Se repite cada N meses"** es la reinduccion: al cumplirla, la ronda siguiente se abre contando
**desde que la completo** (no desde que vencia) y aparece en sus pendientes 60 dias antes de
vencer, no el mismo dia. Vacio = una sola vez.

**Y en la induccion general no se pregunta ninguna de las tres.** Se aplica sola al publicar, con
lo que dice el tipo: al ingresar, dia 0, sin repeticion. Lo que queda en pantalla es *Retirar*.


#### El ORDEN de la puesta en marcha (importante, y facil de hacer al reves)

El corte de "solo a quien entre desde ahora" es **el momento en que se crea el requisito**, no la
fecha de ingreso de la persona. De ahi sale una receta con un orden que hay que respetar:

```
1. Subir PRIMERO a toda la plantilla actual.
2. Despues crear y publicar la induccion general.
   -> a los que ya estaban NO se les exige (ya la hicieron en papel)
3. A partir de ahi, cada alta nueva la recibe automaticamente.
4. La reinduccion se publica cuando sea: esa SI alcanza a todos, y es la que cubre
   a la plantilla actual.
```

**Al reves no funciona:** si se publica la induccion antes de subir a la gente, todos los que se
suban despues contaran como "nuevos" y les caera.

**El caso raro que hay que mirar:** alguien que ingreso la semana pasada, todavia no hizo la
induccion, y se sube en el lote de los antiguos. A esa persona **no** le va a caer, porque entro al
sistema antes que el requisito. Si ese caso existe, se le asigna a mano desde "personas concretas"
o se mueve el corte.

### Ronda (ciclo de una obligacion)
**Que es:** cada vuelta de una obligacion que se repite. La reinduccion de 2026 y la de 2027 son
la **misma regla** pero **dos rondas distintas**, cada una con su fecha y su resultado.

**Como se llama:** "Ronda"; en la base `assignments.cycle_number`.

**Por que existe:** sin rondas, renovar una certificacion seria sobrescribir la anterior, y la
pregunta legal *"estaba vigente en mayo de 2026?"* dejaria de tener respuesta.

**Cuando nace la siguiente:** cuando la anterior queda **cumplida**, y solo cuando falta poco
para el nuevo vencimiento (por defecto 60 dias). Se cuenta **desde que la persona la completo**,
no desde el vencimiento: quien se adelanta no pierde el tiempo que gano.

### Ejecucion (inscripcion)
**Que es:** lo que realmente paso con una persona en una convocatoria: inscrita, asistio,
progreso, presento el examen, aprobo o reprobo, con su nota.

**Como se llama:** en pantalla "Mi formacion" / "Participantes"; en la base `enrollments`.

**Guarda una foto del momento:** el titulo, la version, la nota minima exigida y **el cargo y
area que la persona tenia ese dia**. Si mañana la ascienden, el registro historico no cambia:
aprobo siendo auxiliar de bodega, y asi debe constar.

---

## 4. El plan de capacitacion

### Plan de capacitacion
**Que es:** el documento empresarial donde se planea la formacion de un año: objetivo, META,
alcance y el calendario de lo que se va a dictar. Tiene su propio ciclo de aprobacion.

**La META es un PORCENTAJE**, no un parrafo: cuanto del programa se compromete la empresa a
ejecutar ese año (lo habitual, 90%). Sin ella el plan enseña "62% de cumplimiento" y nadie sabe si
eso esta bien; con ella la pantalla puede decir "faltan 28 puntos" o "meta cumplida". Se mide
contra el CUMPLIMIENTO (ejecutadas / programadas), no contra la cobertura.

**Que NO es:** **no es un tipo de actividad**. Es una entidad aparte con vida propia.

**Como se llama:** "Plan de capacitacion"; en la base `training_plans`.

**HAY UNO POR ANO, y solo uno.** Lo identifica el **año**; el nombre es un rotulo y se puede
corregir. Antes la clave incluia el nombre, asi que "Plan 2026", "Plan anual 2026" y "Plan SST
2026" podian convivir con tres cumplimientos distintos, y a la pregunta del auditor —"enseneme el
plan de 2026"— habia tres respuestas sin forma de saber cual valia.

**El plan SST, el PESV y el BASC NO son planes distintos:** son la **vista por proceso** del mismo
plan anual, que se exporta por separado para cada auditor. La pestana "Por proceso" del plan es
exactamente eso.

**Regla fundamental — el plan NO posee las actividades, las referencia.** Cada renglon del plan
apunta a una convocatoria programada. Asi, reprogramar una capacitacion de marzo a mayo, o
partirla en dos sedes, no obliga a reescribir el plan.

**Ejemplo:** el Plan 2026 tiene 24 renglones. El renglon 7 es "Seguridad Vial, marzo, Cali, 50
proyectados". La actividad "Seguridad Vial" sigue existiendo por su cuenta en el catalogo y
tambien se usa fuera del plan.

### Los seis numeros, y cual es de quien

Son los que mas se confunden porque los seis hablan de personas. Se distinguen por **de quien
son**: unos son de la FORMACION, otros de cada JORNADA, otro de la PERSONA.

| Numero | De quien es | Que afirma | En la base |
|---|---|---|---|
| **Obligados** | de la **FORMACION** | "a estas personas se les exige, y vence tal dia" | `assignments` abiertas |
| **Proyectados** | de cada **JORNADA** | "esta jornada debe atender a estas" | `offerings.projected_count`, congelado |
| **Convocados** | de cada **JORNADA** | "a estas las inscribi en esta jornada" | `enrollments` de esa convocatoria |
| **Pendientes de convocar** | de la **JORNADA** | "obligados que esta jornada atiende y no estan citados en ninguna" | `GET /offerings/:id/pendientes-por-convocar` |
| **Asistentes** | de la **SESION** | "estas estuvieron el 12 de marzo" | `attendance_records` (Sprint 5) |
| **Capacitados** | de la **PERSONA** | "estas cumplieron" | `enrollments` en COMPLETED/PASSED |

#### El ejemplo que los ordena

**"Gestion de servicios", exigida a los cargos SGI y Comercial: 40 personas, 20 en Antioquia y 20
en Cundinamarca.**

1. En **Quienes** se marcan los dos cargos → nacen **40 obligados**. Cada uno con su vencimiento.
   Quien entre mañana con uno de esos cargos entra solo en la lista.
2. Se programan **dos jornadas**: 12 de marzo en Antioquia, 19 de marzo en Cundinamarca. Cada una
   **declara la tajada que atiende** (ver *Tajada de la jornada*), asi que al publicarlas se
   congelan **20 y 20 proyectados**, no 40 y 40.
3. Se **convoca**: en la jornada de Antioquia se inscribe a esos 20 → **20 convocados**. Igual en
   la otra. **Pendientes de convocar: 0.** Si solo se hubiera convocado a 15 en Antioquia, la
   formacion diria **"faltan 5 por convocar"**, que es la frase que evita que el reparto acabe en
   un Excel al lado.
4. El 12 de marzo firman 18 → **18 asistentes**. Dos faltaron.
5. De esos 18, uno reprueba el examen → **17 capacitados**. Ese uno sigue obligado.

**Cobertura de esa jornada = 17 / 20.** Y en el plan, las dos jornadas suman 40 proyectados —los
40 obligados— y no 80.

> **Que de este ejemplo funciona HOY (2026-08-30):** los pasos 1, 2 y 3 completos —la tajada ya se
> declara en el formulario de la convocatoria y los proyectados salen de ella—; el 4 nada, la
> asistencia es el Sprint 5; y el 5 solo en formaciones con contenido digital, porque hoy lo unico
> que cierra una obligacion es el reproductor o un examen aprobado. Lo que falta en el 3 es la
> PANTALLA que diga "faltan N por convocar": los datos ya estan.

#### Las tres confusiones que hay que tener claras

- **Obligado no es convocado.** Se le exige, pero todavia no esta citado a ninguna jornada. Ese
  hueco es justo lo que mide "pendientes de convocar".
- **Convocado no es asistente.** Lo cite; puede no aparecer.
- **Asistente no es capacitado.** Estuvo; puede no haber aprobado. Y al reves en lo virtual:
  quien completa el contenido **queda capacitado sin que exista ninguna lista de asistencia**,
  porque ahi la evidencia es la telemetria (que vio, cuanto tiempo, que respondio), que dice mas
  que una firma.

#### De donde sale cada uno, y que NO se teclea

**Los proyectados no se digitan** (salvo ajuste justificado y auditado). Si fueran un numero
libre, el indicador de cobertura seria una opinion, y es justo lo que audita el SG-SST.

Se derivan asi, en orden: los **ya obligados** a esa formacion, acotados a la tajada de la
jornada; si todavia no hay ninguna obligacion, las personas que **alcanzarian los requisitos**
activos; si tampoco, cero, y la pantalla pide ajustarlo con motivo.

> **Corregido el 2026-08-30:** este documento decia que, a falta de requisitos, los proyectados
> salian de "los cargos a los que la actividad esta dirigida". Ese paso se elimino (Decision #59):
> obligaba a marcar los cargos dos veces —en la ficha para el numero y en Quienes para la
> obligacion— y las dos listas se separaban en cuanto alguien cambiaba una.

#### Los dos indicadores del plan

| Indicador | Formula | Que responde |
|---|---|---|
| **Cumplimiento del programa** | jornadas ejecutadas / programadas | "¿dicte lo que dije que iba a dictar?" |
| **Cobertura** | capacitados / proyectados | "¿se formo la gente que debia formarse?" |

Son independientes a proposito, y hoy pueden discrepar de forma reveladora: una capacitacion
**presencial** se dicta, se marca ejecutada y sube el cumplimiento, pero **la cobertura se queda
en cero** porque todavia no existe el puente asistencia → capacitado (Sprint 5). Ver *Asistencia*.

### La regla de las metricas congeladas
**El caso que la origina:** el Plan 2026 programo "Seguridad Vial" para marzo con 50 proyectados
y la hicieron 43 (86% de cobertura). En agosto entra una persona nueva.

- Esa persona **no** debe aparecer como incumplida del plan de marzo: cuando ingreso, eso ya
  habia pasado.
- Si por regla de ingreso debe hacer "Seguridad Vial", se le asigna individualmente y la hace.
- **El Plan 2026 sigue diciendo 50 / 43 / 86%.** Para siempre.

Lo mismo aplica a capacitaciones extraordinarias y pildoras: **nada de fuera del plan toca las
cifras del plan.** Tecnicamente se logra midiendo solo las ejecuciones cuyo origen es el plan.

---

## 5. Reglas y obligaciones en el tiempo

### Audiencia
**Que es:** un grupo definido por una **regla**, no por una lista de nombres. Por ejemplo: "todos
los conductores de la regional Cali con vinculacion directa".

**Como se llama:** "Audiencia"; en la base `audiences` y `audience_members`.

**Es viva:** cuando entra alguien nuevo que cumple la regla, entra a la audiencia y recibe lo que
la audiencia tenga asignado. Si alguien cambia de cargo y sale, su obligacion pendiente se
retira, pero **lo que ya completo nunca se toca**.

**Guarda historia:** se registra cuando entro y cuando salio, para poder responder "por que esta
persona tenia esto asignado en junio".

### Requisito recurrente
**Que es:** una obligacion que se repite en el tiempo. "Reinduccion cada 12 meses", "todo ingreso
hace la induccion general", "el carne de manipulacion de alimentos vence al año".

**Como se llama:** "Requisito" o "Regla de asignacion"; en la base `assignment_rules`.

**Como funciona:** un proceso automatico las evalua y **genera las asignaciones** cuando toca. No
depende de que alguien se acuerde.


#### Reinduccion: obligacion de CALENDARIO, no aniversario por persona

Es el punto donde mas facil es equivocarse, y se equivoco una vez en este proyecto (2026-08-31).

**Que NO es:** no es "la induccion otra vez, 12 meses despues de que cada quien la hizo". Con ese
modelo, alguien que lleva años en la empresa y nunca hizo una induccion **no tendria de donde
contar** sus 12 meses, y se quedaria sin reinduccion para siempre. Absurdo, porque la reinduccion
es justamente lo que cubre a esa persona.

**Que es:** una obligacion **anual de toda la empresa**, que cae por calendario. "La reinduccion de
2026 se hace antes del 31 de marzo". No se ancla a nada de cada persona: el 31 de marzo llega igual
para el que entro ayer y para el que lleva quince años. Es tambien como lo pregunta el auditor:
*"¿hicieron la reinduccion de 2026?"*, no *"¿cuando la hizo cada uno?"*.

Por eso el tipo Reinduccion se siembra con `defaultAnnualDate` (Transprensa: `03-31`) y no con
`defaultRecurrenceMonths`.

**Y su contenido es propio.** La norma pide que cubra los CAMBIOS del año: novedades, incidentes,
politicas nuevas. Se crea, se le pone contenido y se publica como cualquier otra formacion.

#### Entonces, ¿para que sirve "se repite"?

Para decir **"esta formacion hay que volver a hacerla"**. Que el contenido haya cambiado o no es
otro eje distinto —eso lo llevan las versiones—, y por eso no se contradicen:

| | Se repite | Contenido |
|---|---|---|
| **Reinduccion** | cada año, fecha fija | cada año se publica una version NUEVA con los cambios del año |
| **Carne de manipulacion** | cada 12 meses desde que lo saco | el mismo, hasta que cambie la norma |
| **Induccion general** | no se repite | se versiona cuando cambia algo |

La obligacion vuelve; lo que la persona ve cuando vuelve es **la version vigente ese dia**. Las dos
cosas encajan sin pisarse.

#### ¿Y si llega la ronda siguiente y no hizo la anterior?

Lo pregunto el cliente (2026-09-04) y no tiene una sola respuesta buena, porque las empresas no lo
resuelven igual. Es una **politica del tipo de formacion** (`config.defaultOnExpiry`), con tres
valores:

| | Que hace | Cuando se usa |
|---|---|---|
| **Espera** | No nace la siguiente hasta que haga la anterior | Era lo unico que habia. Casi nadie lo quiere: ver abajo |
| **Acumula** | Nace la siguiente y la anterior sigue pendiente: debe las dos | Empresas que exigen ponerse al dia antes de seguir. A los tres años debe tres |
| **Cierra** | La anterior se cierra como **NO REALIZADA** y la siguiente nace para todos | Cumplimiento por CALENDARIO: cada campaña es su periodo, y el periodo cierra. Transprensa la usa en la reinduccion |

**Por que "espera" estaba mal como unica opcion:** quien nunca la hace **desaparece del denominador**
de todos los años siguientes. El peor incumplidor sale de la cuenta y la cobertura del año que viene
se ve mejor de lo que es. Un indicador que mejora cuando alguien incumple esta roto.

### No realizada
**Que es:** el estado de una obligacion cuyo **periodo cerro sin que la persona la hiciera**. La
reinduccion de 2026 de quien no la hizo antes del 31 de marzo.

**Como se llama:** en pantalla "NO REALIZADA"; en la base `EXPIRED_NOT_DONE`.

**Que NO es:** no es "retirada" (cambio de cargo y dejo de aplicarle) ni "eximida" (alguien la
excuso con motivo). Esas dos **no cuentan** como incumplimiento; esta **si**. Es toda la diferencia:
sin un estado propio, cerrar una campaña obligaba a elegir entre mentir —marcarla retirada— o
dejarla pendiente para siempre.

**Quien la pone:** el motor, y solo cuando la politica del tipo es "cierra". Nunca sobre algo
cumplido, eximido o retirado: eso ya tiene su explicacion escrita.

### Certificacion y vigencia
**Que es:** una acreditacion con **fecha de vencimiento**. No es el papel: es el estado de estar
acreditado.

**Como se llama:** "Certificacion"; en la base `certifications` y `certification_grants`.

**Cada renovacion es un registro nuevo**, no una actualizacion. Asi se puede responder la
pregunta legal que importa: *"esta persona estaba certificada el 12 de mayo, el dia del
accidente?"*.

**Estados:** vigente, por vencer, vencido. Se **calculan** de la fecha de vencimiento, no se
guardan como un campo que un proceso pueda dejar desactualizado.

---

## 6. Evidencia y documentos

### Asistencia, y por que no es lo mismo que estar capacitado
**Que es:** el registro de que una persona **estuvo** en una jornada. Tres mecanismos combinables:
lista del instructor (presente / ausente / justificado), codigo QR de sesion que la persona
escanea desde su celular, y **firma en pantalla**, que junto con el ingreso individual y el sello
de tiempo tiene validez legal (Ley 527/1999 y D2364/2012); el acuerdo de firma electronica se
acepta en el primer ingreso. En la base `attendance_records`, y el PDF resultante en
`session_acts`.

**Que NO es:** no es haber cumplido la formacion. Se puede asistir y reprobar el examen.

**Donde aplica:** **solo en presencial o mixta.** En una formacion virtual **no hay nada que
firmar y no hace falta**: la evidencia es la telemetria —que tarjetas vio, cuanto tiempo estuvo,
que respondio—, que dice mas que una firma porque describe lo que aprendio, no solo que estuvo.
Por eso en virtual, **completar ya implica haber "asistido"**.

**Estado hoy (2026-08-30):** las tablas existen y el grupo de permisos tambien, pero **no hay
codigo que las escriba ni las lea**: es el Sprint 5. La consecuencia concreta y medible es que una
capacitacion **presencial** se dicta, se marca ejecutada, sube el cumplimiento del programa, y la
cobertura se queda en cero — porque lo unico que hoy cierra una obligacion es el reproductor o un
examen aprobado. Lo que falta es el puente: **asistir a una jornada presencial completa la
ejecucion**, y si hay examen hay que aprobarlo.

| Concepto | Que es | Quien lo pide |
|---|---|---|
| **Certificado** | Documento individual de que una persona aprobo algo. Lleva numero de serie, codigo de verificacion publico y QR | La persona, y el auditor |
| **Acta de sesion** | Lista de asistencia de una convocatoria presencial, con las firmas de los asistentes | El auditor de SG-SST |
| **Constancia** | Termino que el cliente usa a veces para el certificado. Es lo mismo | — |
| **Historial de formacion** | Todo lo que una persona ha hecho, con sus fechas y notas | Auditoria, y la propia persona |

El certificado **es un registro, no un archivo**: el PDF se genera una vez y queda congelado. Si
mañana se cambia la plantilla o el nombre del firmante, los documentos ya entregados no cambian.
Se puede **revocar** (emitido por error, fraude), y la pagina publica de verificacion refleja el
estado actual aunque el PDF siga circulando.

---

## 7. Satisfaccion contra eficacia

Se confunden siempre, y miden cosas opuestas:

| | **Satisfaccion** | **Eficacia** |
|---|---|---|
| Pregunta | Te gusto la capacitacion? | Sirvio de algo? |
| Quien responde | El participante | **El jefe** del participante |
| Cuando | Al terminar | Semanas o meses despues |
| Para que | Mejorar al instructor y el contenido | Demostrar que la formacion produjo competencia real |
| Quien la exige | Buena practica | ISO 9001 y 45001 (clausula 7.2), BASC |

Una capacitacion puede tener 5 estrellas de satisfaccion y eficacia nula. El auditor pregunta por
la segunda.

---

## 8. Estructura organizacional

Cuatro ejes que se confunden entre si:

| Concepto | Que es | De quien es | Ejemplo |
|---|---|---|---|
| **Area** | Unidad organizacional a la que pertenece una **persona** | De las personas | Logistica, Comercial, Gestion Humana |
| **Proceso** | Sistema de gestion que **origina** la formacion | De las actividades | SGI, SST, PESV, SARLAFT |
| **Cargo** | El puesto de la persona. Define que inducciones especificas le tocan | De las personas | Conductor, Auxiliar de Bodega |
| **Tipo de cargo** | Agrupacion gruesa de cargos | De los cargos | Administrativo, Operativo, Comercial |
| **Regional** | Sede geografica | De personas y convocatorias | Antioquia, Valle del Cauca |
| **Servicio** | Linea de negocio | De las actividades | Almacenamiento, Masivo, Paqueteo |
| **Norma** | A que exigencia legal tributa la formacion | De las actividades | BASC, PESV, BPM |

**Por que area y proceso son distintos:** SARLAFT es un proceso, pero no tiene personas asignadas;
Comercial es un area con personas, pero no origina formacion por si misma. Mezclarlos en un solo
catalogo ensucia todos los reportes.

**Una actividad puede tributar a varias normas** a la vez: una capacitacion de manejo defensivo
cuenta para PESV y para SST.

---

## 9. Personas y roles

| Rol | Que puede hacer | Limite |
|---|---|---|
| **Superadmin** (NEO IO) | Operar la plataforma: dar de alta empresas, soporte | No es un rol de negocio del cliente |
| **Administrador** | Todo dentro de su empresa | — |
| **Analista** | Gestionar la formacion de **su area o proceso** | Sus cambios sobre contenido publicado **requieren aprobacion** del administrador, con justificacion |
| **Instructor** | Tomar asistencia y calificar en sus convocatorias | Es un permiso, no un rol aparte |
| **Usuario** | Hacer lo que le asignaron y ver sus certificados | — |

**Como se controla el acceso:** siempre por **permisos** (`catalog:publish`, `users:manage`...),
nunca por el nombre del rol dentro del codigo. Asi el administrador puede ajustar que hace cada
rol desde la interfaz, sin desarrollo.

**Identidad de la persona:** la llave estable es la **cedula**, no el correo. Un auxiliar de
bodega puede no tener correo corporativo, y cuando se lo den, cambiarlo no debe romper su cuenta
ni su historial.

---

## 10. Empresa (tenant)

**Que es:** cada empresa cliente de NEO PULSE. Transprensa es una; puede haber decenas.

**Que significa "todo es parametrizable por empresa":** los catalogos, la nota minima de
aprobacion, los intentos permitidos, los colores, el logo, los tipos de actividad. Ninguna regla
de un cliente vive en el codigo.

**Como entra cada empresa:** por su propio subdominio (`transprensa.ascentio.app`), que ademas
permite mostrar su marca desde la pantalla de ingreso.

**Como se protege:** cada empresa solo ve lo suyo, garantizado en dos capas independientes (la
aplicacion y la propia base de datos). Hay una prueba automatica que falla si ese aislamiento se
rompe.

---

## 11. Lo que sostiene el habito

### Pildora

**Que es:** una formacion corta —de tres a siete minutos— hecha de una leccion de tarjetas y unas
pocas preguntas. Es un **tipo de actividad formativa**, no una entidad aparte: pasa por el mismo
motor de obligacion, ejecucion y evidencia que una induccion.

**Para que sirve:** sostener en el tiempo lo que ya se enseno. Una induccion se hace una vez al
año; una pildora de "revisa que la carga este centrada" se puede repetir en marzo y en agosto sin
sacar a nadie de su turno.

**Que NO es:** un curso recortado. Una pildora se disena corta; no es lo que sobra de otra cosa.

### Repaso espaciado (la cola de repaso)

**Que es:** el mecanismo que hace volver una pregunta que la persona fallo, en intervalos que se
alargan: a los 2 dias, a los 7, a los 14 y a los 30. Si la responde bien sube de escalon; si la
vuelve a fallar, se acerca en el tiempo. Al dominarla, sale de la cola.

**Por que existe:** completar no es aprender. Un examen aprobado en enero no dice nada sobre lo
que se recuerda en junio, y lo que se olvida en seguridad industrial cuesta accidentes.

**Que ve la persona:** una sesion diaria de tres a cinco minutos, **acotada a proposito**. Una cola
de cuarenta preguntas rompe el compromiso de los tres minutos y hace que nadie la abra.

**Que NO es:** un examen. No da nota, no bloquea nada y no aparece en ningun indicador de
cumplimiento.

### Racha

**Que es:** los dias seguidos en los que la persona ha completado al menos una leccion. Tiene dos
**protectores** que cubren un dia perdido.

**Que la mueve:** completar una leccion. **Entrar a la aplicacion no cuenta.** La racha premia
haber aprendido algo, no haber abierto el telefono.

**Quien la ve:** solo su dueno. Es privada por decision explicita (Decision #23): no existe
ninguna pantalla donde una persona vea la racha de otra, ni ranking, ni tabla de posiciones. La
comparacion publica expulsa a los de abajo, que en una empresa son justo quienes mas necesitan
formarse.

**Por que hay protectores:** un conductor en carretera puede pasar un dia sin señal. Perder
sesenta dias de racha por eso hace que no vuelva.

### Puntos

**Que son:** un contador que sube por logro real —terminar una leccion, aprobar una evaluacion,
hacer el repaso del dia—. Nunca por entrar ni por pulsar.

**Que NO son:** una moneda. No se gastan, no se canjean y no compran nada.

### Aviso de pildora (la cadencia)

**Que es:** el recordatorio que llega a quien tiene microlearning pendiente y dejo de volver.

**Como se gobierna:** solo a quien no estudio hoy, en la franja horaria en la que esa persona
suele estudiar, con una separacion minima entre avisos y **un tope semanal por empresa que manda
siempre** —incluso durante la primera semana de un ingreso nuevo, que es la unica que admite
ritmo diario—. Un tope que admite excepciones no es un tope.

**Por que tanto cuidado:** el limite entre recordar y hostigar es el que decide si la aplicacion
se abre o se silencia.

---

## 12. Terminos que NO usamos (y por que)

| Termino | Por que se evita | Que se usa |
|---|---|---|
| "Curso" | Sugiere que la pildora de 4 minutos es otra cosa | Actividad formativa |
| "Alumno" / "Estudiante" | Es una empresa, no un colegio | Colaborador, participante |
| "Matricula" | Suena academico | Asignacion (obligacion) o inscripcion (participacion) |
| "Course", "enrollment", "dashboard" en pantalla | La interfaz es 100% español | Actividad, inscripcion, panel |

---

*Este documento se corrige cuando cambia el modelo; no se reescribe por sprint.*
*Fuentes: `CLAUDE.md` (modelo y decisiones), `docs/research/03-modelado-dominio-lms.md`
(vocabulario de la industria), `docs/research/04-normativa-colombiana.md` (exigencias legales).*
