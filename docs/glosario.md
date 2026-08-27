# Glosario del dominio — NEO PULSE

**Este es el diccionario oficial del producto.** Si dos personas usan la misma palabra con
distinto significado, el sistema se construye mal. Antes de discutir una funcionalidad, se
acuerda el termino aqui.

Formato de cada concepto: **que es**, **que NO es** (la confusion tipica), **como se llama** en
pantalla y en la base de datos, y un **ejemplo real de Transprensa**.

> Convencion general (Decision #26 y #31): la base de datos y el codigo usan el vocabulario
> estandar de la industria en ingles (`activities`, `offerings`, `enrollments`); la interfaz esta
> 100% en espanol. Nunca aparece "course" en pantalla.

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

Si estas cuatro fueran una sola cosa, repetir la misma capacitacion el ano siguiente obligaria a
duplicarla, y no se podria responder "quien estaba obligado pero no lo hizo".

---

## 2. Conceptos del catalogo

### Actividad formativa
**Que es:** el producto formativo en si, independiente de cuando se dicte. Es lo que vive en el
catalogo y se reutiliza durante anos. Contiene el contenido, la evaluacion y las reglas.

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
ingresar, si se repite cada ano, si emite certificado, si cuenta para el plan anual.

**Que NO es:** no es una etiqueta decorativa. Cada tipo cambia reglas reales.

**Como se llama:** "Tipo de actividad" (en Configuracion); en la base `activity_types`. Es un
catalogo **por empresa**: otro cliente puede inventar los suyos sin que se toque codigo.

Los seis tipos de Transprensa:

| Tipo | Que significa | Como se asigna | Cuenta para el plan? |
|---|---|---|---|
| **Induccion general** | Lo que TODO el que ingresa debe hacer, sin importar el cargo | Automatica al ingresar, y **antes** de iniciar labores | No |
| **Induccion especifica** | Lo que se debe hacer segun el cargo | Automatica por cargo | No |
| **Reinduccion** | Repaso periodico de lo anterior | Automatica cada N meses (Transprensa: 12) | No |
| **Capacitacion del plan** | Lo que se planeo para el ano | Desde el plan anual | **Si** |
| **Capacitacion extraordinaria** | Lo que surge durante el ano y no estaba planeado | Manual: a una persona, cargo, area o regional | **No** |
| **Pildora** (microlearning) | Pieza corta de 3 a 7 minutos para reforzar | Manual o por regla; alimenta el repaso espaciado | No |

**Ejemplo de por que importa la ultima columna:** si en agosto se detecta un problema y se dicta
una capacitacion extraordinaria, esa ejecucion **no debe mejorar ni empeorar** el indicador de
cumplimiento del Plan 2026. Son mediciones separadas.

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

### Leccion
**Que es:** una pila de 5 a 15 **tarjetas** que se pasan como historias de Instagram. Es la unidad
de contenido del producto y dura menos de 5 minutos.

**Que NO es:** no es un PDF ni un video largo subido. Por diseno, el sistema no permite publicar
un PDF como leccion: el PDF se adjunta como material de consulta o sirve de fuente para generar
tarjetas.

**Como se llama:** "Leccion"; en la base `lessons` y `lesson_cards`.

**Tipos de tarjeta disponibles:** texto con imagen, video corto (maximo 3 minutos), quiz de
refuerzo, tarjeta de dos caras, encuesta rapida, y completar la palabra faltante.

**Ejemplo:** la leccion "Bienvenida a Transprensa" tiene 8 tarjetas: saludo, mision, una tarjeta
de dos caras con "que significa PESV", un video de 60 segundos del gerente, y un quiz de refuerzo.

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

### Convocatoria
**Que es:** una ejecucion concreta de una actividad: fecha, hora, lugar, instructor, regional,
intensidad horaria y cuantas personas se esperan.

**Que NO es:** no es la actividad. La misma actividad "Seguridad Vial" puede tener la
convocatoria de marzo en Cali y la de agosto en Bogota, sin duplicar el contenido.

**Como se llama:** "Convocatoria"; en la base `offerings`.

**Tres formas:**
- **Evento** (presencial): tiene fecha, instructor y lista de asistencia.
- **Permanente** (virtual autoservicio): sin fecha; cada quien la hace cuando puede.
- **Hibrida**: exige cumplir la parte presencial **y** la virtual.

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
area que la persona tenia ese dia**. Si manana la ascienden, el registro historico no cambia:
aprobo siendo auxiliar de bodega, y asi debe constar.

---

## 4. El plan de capacitacion

### Plan de capacitacion
**Que es:** el documento empresarial donde se planea la formacion de un ano: objetivos, metas,
alcance y el calendario de lo que se va a dictar. Tiene su propio ciclo de aprobacion.

**Que NO es:** **no es un tipo de actividad**. Es una entidad aparte con vida propia.

**Como se llama:** "Plan de capacitacion"; en la base `training_plans`.

**Regla fundamental — el plan NO posee las actividades, las referencia.** Cada renglon del plan
apunta a una convocatoria programada. Asi, reprogramar una capacitacion de marzo a mayo, o
partirla en dos sedes, no obliga a reescribir el plan.

**Ejemplo:** el Plan 2026 tiene 24 renglones. El renglon 7 es "Seguridad Vial, marzo, Cali, 50
proyectados". La actividad "Seguridad Vial" sigue existiendo por su cuenta en el catalogo y
tambien se usa fuera del plan.

### Proyectados, ejecutados, cobertura y cumplimiento
Los cuatro numeros del plan. Se confunden constantemente:

| Termino | Que mide | Formula |
|---|---|---|
| **Proyectados** | Cuantas personas se esperaba que hicieran esa convocatoria | Se **deriva** de la regla de asignacion y se **congela** al publicar |
| **Ejecutados / asistentes** | Cuantas la hicieron de verdad | Conteo real |
| **Cobertura** | Que tanto del publico objetivo se alcanzo | asistentes / proyectados x 100 |
| **Cumplimiento del plan** | Que tanto de lo planeado se dicto | convocatorias ejecutadas / programadas x 100 |

**Proyectados no se digita a mano** (salvo ajuste justificado y auditado). Si fuera un numero
libre, el indicador de cumplimiento seria una opinion, y eso es justo lo que audita el SG-SST.

**De donde sale el numero, en orden:** de los **requisitos** que exigen esa actividad (su
audiencia es la respuesta exacta); si no hay requisitos, de los **cargos a los que la actividad
esta dirigida**; si tampoco, queda en cero y la pantalla pide ajustarlo con justificacion.

**Si la convocatoria es de una regional, el alcance se acota a esa regional.** Una jornada en
Neiva no le promete nada a Barranquilla, y por eso "inscribir a todos los obligados" tampoco
arrastra a la empresa entera: numerador y denominador tienen que hablar de la misma gente.

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
hace la induccion general", "el carne de manipulacion de alimentos vence al ano".

**Como se llama:** "Requisito" o "Regla de asignacion"; en la base `assignment_rules`.

**Como funciona:** un proceso automatico las evalua y **genera las asignaciones** cuando toca. No
depende de que alguien se acuerde.

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

| Concepto | Que es | Quien lo pide |
|---|---|---|
| **Certificado** | Documento individual de que una persona aprobo algo. Lleva numero de serie, codigo de verificacion publico y QR | La persona, y el auditor |
| **Acta de sesion** | Lista de asistencia de una convocatoria presencial, con las firmas de los asistentes | El auditor de SG-SST |
| **Constancia** | Termino que el cliente usa a veces para el certificado. Es lo mismo | — |
| **Historial de formacion** | Todo lo que una persona ha hecho, con sus fechas y notas | Auditoria, y la propia persona |

El certificado **es un registro, no un archivo**: el PDF se genera una vez y queda congelado. Si
manana se cambia la plantilla o el nombre del firmante, los documentos ya entregados no cambian.
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

**Como entra cada empresa:** por su propio subdominio (`transprensa.neopulse.app`), que ademas
permite mostrar su marca desde la pantalla de ingreso.

**Como se protege:** cada empresa solo ve lo suyo, garantizado en dos capas independientes (la
aplicacion y la propia base de datos). Hay una prueba automatica que falla si ese aislamiento se
rompe.

---

## 11. Terminos que NO usamos (y por que)

| Termino | Por que se evita | Que se usa |
|---|---|---|
| "Curso" | Sugiere que la pildora de 4 minutos es otra cosa | Actividad formativa |
| "Alumno" / "Estudiante" | Es una empresa, no un colegio | Colaborador, participante |
| "Matricula" | Suena academico | Asignacion (obligacion) o inscripcion (participacion) |
| "Course", "enrollment", "dashboard" en pantalla | La interfaz es 100% espanol | Actividad, inscripcion, panel |

---

*Este documento se corrige cuando cambia el modelo; no se reescribe por sprint.*
*Fuentes: `CLAUDE.md` (modelo y decisiones), `docs/research/03-modelado-dominio-lms.md`
(vocabulario de la industria), `docs/research/04-normativa-colombiana.md` (exigencias legales).*
