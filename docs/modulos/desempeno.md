# Evaluación de desempeño

> **Estado: completo de punta a punta.** Servidor, pantallas de administración y la de la persona
> evaluada. El cliente lo pidió en el Bloque 4
> del brief (2026-08-25), se aplazó —«puede esperar, lo dijo él»— y el 2026-09-01 pasó a requisito
> de producción. Ese mismo día se construyó: permisos, siete tablas con RLS, las dos reglas con
> pruebas, y la API completa —competencias, formularios, ciclos, evaluar, firmar y consolidado—,
> verificada de punta a punta contra la base real.
>
> **Lo que falta:** las cuatro preguntas al cliente de la sección 6 —que no bloquean el código, todo
> es parametrizable, pero sí sembrar su contenido real—. Lo de **varios formularios por campaña**
> quedó cerrado el 2026-09-02 (sección 6 septies).

Lo que dijo el cliente, literal (`docs/00-brief-crudo.md`, Bloque 4):

- Se realiza **cada año o cierto tiempo**.
- Evalúa **al usuario en su cargo o como persona** («no sé», dijo).
- **Muy parametrizable**: tipos de pregunta y más. Creable desde la interfaz.
- **Por tenant**, como todo.
- **NO debe afectar ni mezclarse con capacitaciones o inducciones.**
- La hace **quien tenga los permisos**.

---

## 1. Qué es esto, y qué NO es

Una evaluación de desempeño responde *«¿cómo lo está haciendo esta persona en su cargo?»*. Se parece
a tres cosas que ya existen en el producto y **no es ninguna**:

| Se parece a | Y sin embargo |
|---|---|
| El **examen** de una formación | El examen se aprueba o se reprueba, lo responde uno mismo y mide si aprendió algo concreto. El desempeño no se aprueba: se **califica por otra persona**, y no hay respuesta correcta |
| La **encuesta** de satisfacción | La encuesta es anónima en la práctica y sobre una jornada. El desempeño lleva **nombre y apellido**, se guarda años y **se firma** |
| La **evaluación de eficacia** (Sprint 5) | Aquella pregunta si una formación concreta sirvió. Esta no habla de formación: habla de la persona |

**La confusión que hay que evitar desde el primer día:** que una nota baja de desempeño entre en los
indicadores de cumplimiento del plan. Son universos distintos y el cliente lo dijo explícitamente.
El aislamiento no es una preferencia de diseño, es un requisito.

---

## 2. Cómo lo hacen los demás (y qué tomar)

Lo que traen los módulos serios —SAP SuccessFactors, Workday, Cornerstone, Lattice, Culture Amp— y
lo que de verdad hace falta aquí:

| Pieza | Qué es | ¿Entra? |
|---|---|---|
| **Ciclo** | La campaña: «Desempeño 2026», con sus fechas de apertura y cierre | **Sí.** Sin ciclo no hay «cada año» |
| **Modelo de competencias** | El catálogo de lo que se evalúa (comunicación, seguridad, cumplimiento) con su escala | **Sí**, y por tenant: es lo que lo hace parametrizable |
| **Formulario por cargo** | Qué competencias aplican a un conductor y cuáles a un analista | **Sí.** Es la diferencia entre una plantilla y una evaluación real |
| **Autoevaluación + jefe** (90°/180°) | La persona se califica, el jefe la califica, se comparan | **Sí.** Es el estándar mínimo y el que sostiene la conversación |
| **360°** (pares, reportes, clientes) | Muchos evaluadores | **No en la primera versión.** Multiplica la complejidad —anonimato, pesos, mínimo de respuestas— y el cliente no lo pidió |
| **Calibración** | Los jefes se reúnen a ajustar notas entre áreas | **No.** Es lo que se añade cuando hay cientos de evaluadores y sesgo comparable |
| **9-box** (desempeño × potencial) | La matriz de talento | **No.** Es una lectura, no un dato; se puede añadir después sobre lo mismo |
| **Objetivos / OKR** | Metas individuales medibles | **No en la primera versión**, pero **el modelo debe dejar sitio**: es lo primero que se pide después |
| **Firma** | La persona reconoce que la conversación ocurrió | **Sí.** Es lo que convierte esto en evidencia (misma lógica que D2364 art. 5, ya usada en formación) |

---

## 3. La decisión que estaba abierta: ¿motor propio o compartido?

El brief lo dejó por decidir. **Motor propio, reusando el patrón de las encuestas, no el de los
exámenes.** Tres razones, en orden de peso:

1. **Un examen lo responde el dueño de la nota; una evaluación de desempeño, no.** Todo el motor de
   exámenes está construido sobre `enrollments` y `attempts` —intentos, bloqueo, nota mínima,
   recalificación—, y nada de eso significa algo aquí. Encajarlo obligaría a inventar una
   inscripción falsa para cada persona evaluada, y esa inscripción entraría en las métricas de
   formación: exactamente lo que el cliente prohibió.
2. **La confidencialidad es distinta.** Lo que un jefe escribe sobre alguien no lo puede leer quien
   administra el catálogo formativo. Los permisos de formación no sirven; hacen falta propios.
3. **Los tipos de pregunta sí se comparten**, y ahí está la reutilización que vale: escala de
   caras/estrellas/números, opción única, texto libre. Eso ya existe en encuestas y se extrae a una
   pieza común en vez de copiarse.

> **La regla que evita el desastre:** una evaluación de desempeño **nunca** escribe en
> `enrollments`, `assignments` ni `certification_grants`. Si algún día alimenta el plan del año
> siguiente —que es la idea del cliente— lo hará **generando una necesidad de formación**, no
> tocando el cumplimiento.

---

## 4. El modelo (ocho tablas, ya migradas)

```
performance_competencies      El catalogo del tenant: nombre, descripcion, escala
  |                           (+ suggested_activity_id: que formacion la fortalece)
performance_forms             La plantilla
performance_form_items        Que competencias lleva y con que peso
performance_form_job_titles   A que cargos aplica (vacio = es el general)
  |
performance_cycles            Desempeno 2026: fechas y reglas de la campaña
performance_cycle_forms       QUE FORMULARIOS lleva la campaña, cada uno CONGELADO al abrir
  |
performance_reviews           UNA evaluacion: ciclo + formulario + persona + evaluador + rol
  |                           (SELF | MANAGER), estado, nota, y la firma (signed_at / signed_ip)
performance_answers           Respuesta por competencia: valor + comentario
```

**El formulario congelado vive en `performance_cycle_forms` y no en el ciclo** (Decisión #139).
En la misma campaña conviven varios: si el conductor responde el suyo y el analista el suyo, una
sola copia por ciclo obligaría a adivinar cuál le tocaba a cada quien al leer una evaluación de hace
tres años. Por eso `performance_reviews` guarda **con qué formulario** se evaluó a esa persona.

**La firma va como dos columnas de `performance_reviews`, no como tabla aparte.** Una evaluación se
firma una vez, por una sola persona: una tabla con una fila por evaluación es una junta más en cada
consulta a cambio de nada. El día que haya varias firmas —la del jefe del jefe, por ejemplo— sí es
una tabla.

**Los objetivos individuales no están**, ni como tabla vacía. Una tabla sin uso es una promesa que
alguien lee como funcionalidad; cuando entren, entran con su diseño.

**Decisiones dentro del modelo:**

- **La plantilla se congela al abrir el ciclo**, igual que las versiones de formación. Cambiar una
  competencia a mitad de campaña haría incomparables las evaluaciones del mismo año.
- **Una fila por evaluador**, no una por persona con dos columnas. Con dos columnas, añadir pares o
  el jefe del jefe obliga a migrar la tabla; con una fila por evaluador, es un valor más en el enum.
- **La escala vive en la competencia**, no en la respuesta: es lo que permite tener «1 a 5» y
  «cumple / no cumple» en el mismo formulario sin campos nulos por todas partes.
- **El jefe sale de `areas.responsible_user_id`**, que ya existe desde el Sprint 5 (se añadió para la
  eficacia). No hace falta una jerarquía nueva.

---

## 5. Permisos nuevos

| Permiso | Quién | Para qué |
|---|---|---|
| `performance:manage` | Gestión Humana | Crear ciclos, competencias y formularios |
| `performance:read_own` | Todos | Ver lo suyo y firmarlo |
| `performance:read_all` | Gestión Humana / dirección | Ver el consolidado |

---

## 5 bis. Los avisos que manda el módulo (2026-09-02)

| Cuándo | A quién | Qué dice |
|---|---|---|
| **Al abrir el ciclo** | Cada evaluador, **una vez** —no una por evaluación— | «Tienes N evaluaciones por responder» |
| **Faltando 3 días para el cierre** | Solo a quien **aún no ha respondido** | «X cierra en 3 días: te faltan N» |
| **Al entregar el jefe** | La persona evaluada, si el ciclo permite que la vea | «Tu evaluación ya está lista» |

**El recordatorio va una sola vez por ciclo y por persona.** Quien ya entregó todo no recibe nada
—un recordatorio de algo que ya hiciste es la forma más rápida de que dejen de leerse los avisos— y
antes de enviar se comprueba si esa persona ya tiene el aviso de *ese* ciclo, así que no llega un
día tras otro. Un ciclo ya vencido no recuerda nada: decirle a alguien que corra por algo que ya
cerró solo confirma que el sistema no se entera.

La regla de **cuándo** avisar vive en `performance-reminder.ts`, con sus pruebas, para poder
cambiarla —¿tres días o una semana?— mirando una línea. El disparo, en
`workers/performance-reminder.worker.ts`: una vez al día a las 8, no cada hora como el aviso de
píldoras (aquello se envía en la franja en que cada quien estudia; esto es trabajo de oficina).

**Lo que NO hay, y es deliberado:** aviso al firmar (nadie espera esa confirmación) y aviso al
cerrar el ciclo (el consolidado ya está, y quien lo gestiona sabe que lo cerró él).

**Los días de aviso los pone el tenant**, no el código: `performanceReminderDays` en los ajustes
(Configuración → Preferencias), por defecto 3 y **0 lo apaga**. No es una constante técnica — en una
campaña de seis semanas, tres días de aviso llegan tarde; en una de dos, avisar con diez es avisar
el primer día. Es la misma clase de decisión que `efficacyDaysDefault`, y la toma quien conoce a su
gente.

---

## 5 ter. El consolidado en Excel (2026-09-02)

La pantalla se queda en **100 filas** porque nadie lee 900 en una ventana. El archivo va **entero**,
y es lo que se guarda como evidencia del año: `GET /desempeno/ciclos/:id/consolidado/xlsx`, con
`performance:read_all`.

**Dos hojas, y no una.** «Por formulario» y «persona por persona» responden preguntas distintas: la
primera es la única que sirve para comparar conductores con analistas —promedios de poblaciones
distintas— y la segunda es la evidencia nominal. Mezcladas, ninguna se puede filtrar sin romper la
otra.

**La nota va como NÚMERO** en fracción con formato de porcentaje, no como texto «80 %»: así se puede
promediar la columna, ordenarla y graficarla. Y **sin nota la celda queda vacía, no en cero** — un
cero es una calificación pésima; no haber respondido es otra cosa.

Las filas salen del **mismo método que pinta la pantalla** (`cycleSummary`), no de una consulta
paralela: un informe que no cuadra con lo que se acaba de mirar destruye la confianza en los dos a
la vez. El formato común de cabecera y tabla —fecha, empresa, títulos congelados, autofiltro— se
sacó a `common/xlsx.ts` al aparecer este segundo libro; lo comparte con el export de Seguimiento.

**Son tres y no cuatro: no existe `performance:evaluate`, y es deliberado.** Calificar no se autoriza por permiso sino por
**identidad**: solo el evaluador asignado a esa evaluación puede abrirla. Un permiso global de
«evaluar» dejaría a cualquiera con el rol calificando a cualquiera.

**`reports:read_all` NO alcanza aquí.** Quien ve los indicadores de formación no tiene por qué leer
lo que un jefe escribió sobre una persona.

---

## 6. Qué hace falta para llevarlo a producción

Por orden, y con lo que hay que preguntarle al cliente antes de empezar:

1. **Preguntas para Transprensa** (bloquean el diseño, no el código):
   - ¿Qué competencias evalúan hoy, y con qué escala? Si ya tienen un formato en papel o Excel, ese
     formato **es** la especificación.
   - ¿Evalúa solo el jefe, o también la persona a sí misma? (Recomendación: las dos; es lo que
     sostiene la conversación.)
   - ¿El resultado se le muestra a la persona? ¿Lo firma?
   - ¿Cada cuánto: anual, semestral?
2. **Construcción** (estimado, con las respuestas en mano): catálogo de competencias y formularios
   (2-3 días) · apertura de ciclo y generación de las evaluaciones (2 días) · pantalla del evaluador
   y de la persona (3 días) · consolidado y firma (2 días).
3. **Lo que NO entra en la primera versión**, dicho ahora para que no se descubra tarde: 360°,
   calibración, 9-box y objetivos individuales.

---

## 6 bis. Cómo quedó construido

| Pieza | Dónde |
|---|---|
| Las tres reglas puras (la nota, quién evalúa a quién y **el reparto por cargo**), con 16 pruebas | `apps/api/src/performance/performance-scoring.ts` |
| El servicio: catálogo, ciclos, evaluar, firmar, consolidado | `apps/api/src/performance/performance.service.ts` |
| Los contratos | `packages/shared/src/schemas/performance.ts` |
| La pantalla: tres pestañas | `apps/web/src/app/(admin)/desempeno/page.tsx` |
| El formulario del evaluador | `apps/web/src/components/modules/desempeno/evaluar-desempeno.tsx` |
| Lo que ve la persona evaluada | `apps/web/src/components/modules/desempeno/mi-desempeno.tsx` |

**La pantalla, y por qué está así:**

- **Sección propia en la barra lateral**, no dentro de Formaciones. El cliente pidió que no se
  mezcle, y la navegación es donde primero se mezclan las cosas.
- **«Evaluar» es la primera pestaña** aunque sea la última en construirse: es la que abre más gente
  y la única con algo que hacer hoy. «Ciclos» y «Qué se evalúa» solo aparecen con
  `performance:manage`.
- **No hay autoguardado al calificar.** Es un texto que se piensa y se corrige mientras se escribe;
  guardar cada tecla dejaría en el servidor versiones a medias de un juicio sobre alguien. Se
  entrega entera, con una confirmación que dice que no se puede deshacer.
- **Al abrir un ciclo se dice a quién no se le pudo asignar jefe**, agrupado por motivo, con el
  camino para arreglarlo (Configuración → Áreas). Abrir en silencio dejando gente fuera es como se
  descubre en diciembre que media empresa no fue evaluada.
- **El peso de una competencia se muestra al calificar.** Si una vale el triple, quien califica
  tiene derecho a saberlo antes de marcar.

**Tres decisiones que se tomaron al construir y conviene no revertir sin pensarlo:**

- **La escala de una competencia no se cambia si ya tiene respuestas.** Un 4 sobre 5 y un 4 sobre 10
  son notas distintas: cambiarla reescribiría en silencio lo que significan las respuestas
  guardadas, y los números seguirían ahí sin querer decir lo mismo.
- **Un formulario que ya usó un ciclo no se reescribe**: se duplica. El ciclo guarda su copia
  congelada, así que lo abierto no se rompe, pero editar el original haría que el ciclo del año
  pasado y el del que viene se llamen igual y no lo sean.
- **Lo que no se respondió no cuenta como cero.** Un cero es una calificación pésima; no contestar
  es no contestar. Y un formulario de solo texto no tiene nota: decir «0» sería acusar a alguien de
  algo que nadie evaluó.

**Verificado contra la base real** el 2026-09-01: crear competencias (y el 409 del código
repetido), formulario con pesos, ciclo, apertura —723 evaluaciones generadas—, entrega con nota
ponderada correcta, el 409 al entregar dos veces, firma, consolidado y cierre.

> **El hallazgo de esa prueba, y lo que destapó:** las 723 personas salieron *sin evaluador* con
> motivo `SIN_RESPONSABLE`. La causa no era la base de desarrollo: **no había forma de asignar el
> responsable de un área desde ninguna pantalla**. El campo existía en el modelo desde el Sprint 5
> y nadie podía rellenarlo, así que la evaluación de eficacia y el aviso de «alguien reprobó»
> llevaban meses apuntando a un vacío sin dar error — porque no falla nada cuando simplemente no hay
> a quién avisar.
>
> Corregido el 2026-09-02 (Decisión #135): **un solo campo** —había dos con el mismo significado— y
> expuesto en Configuración → Áreas. Verificado después: al asignar responsable, el ciclo genera las
> evaluaciones de jefe, y quien dirige el área sale como `ES_SU_PROPIO_JEFE` en vez de autoasignarse.
>
> Sigue siendo **lo primero que hay que configurar en producción**: sin responsable de área solo hay
> autoevaluación.

---

## 6 ter. Lo que ve la persona evaluada

Va en **su perfil**, debajo de sus constancias, y no en una entrada propia de la navegación: se mira
una o dos veces al año, siempre justo después de la conversación con el jefe. Una entrada permanente
para eso sería un recordatorio doce meses de algo que ocurre dos veces. Si no hay evaluaciones, la
sección no se pinta: una tarjeta vacía en el perfil solo dice «aquí falta algo».

**La autoevaluación y la del jefe se ven juntas.** Es lo único que hace útil una autoevaluación: por
separado son dos opiniones sueltas; juntas, la diferencia entre las dos **es** la conversación —
donde la persona se puso 5 y su jefe 3 hay algo que hablar, y donde coinciden no hace falta gastar
la reunión.

**Se muestra «4 de 5», no «80%»:** es como se respondió y es como se recuerda. El porcentaje solo
aparece arriba, como resumen.

**Y la firma se explica con palabras:** «firmar no es estar de acuerdo, es dejar constancia de que
leíste tu evaluación y de que la conversación ocurrió». Sin esa frase, alguien que cree que firmar
es aceptar una nota injusta no firma — y la empresa se queda sin la evidencia que necesita.

---

## 6 quater. La guía para el cliente

`docs/guia-desempeno.html`, escrita para quien lo usa y no para quien lo construye: el paso a paso
completo, qué significa cada opción del ciclo, **qué es firmar y cómo**, el cálculo de la nota con un
ejemplo numérico, lo que el sistema no deja hacer y por qué, y qué se hace con el resultado. Los
ejemplos usan usuarios genéricos a propósito.

Se mantiene a mano: si cambia lo que significa una opción, se corrige en el mismo cambio. Una guía
desactualizada hace más daño que no tenerla, porque se cita.

---

## 6 quinquies. Dónde entra cada quien (Decisiones #138 y #140)

Un jefe de área **normalmente no tiene acceso a administración**: entra por la superficie del
aprendiz como todo el mundo. Mientras «Evaluar» vivió solo en el panel, la mitad de los evaluadores
recibía el aviso de que tenía veinte evaluaciones y no tenía por dónde abrirlas.

> **Revisado el 2026-09-02 (Decisión #140): UN SOLO SITIO.** Lo de arriba resolvió el hueco de los
> jefes y dejó otro: había **tres puertas** para un mismo asunto —administración para configurar,
> «Evaluaciones» para calificar, «Perfil» para leer lo tuyo— y cuál te tocaba dependía de quién
> eras. Ahora:

| Quién | Dónde | Qué hace |
|---|---|---|
| **Todo el mundo** | Menú → **Desempeño** | Lo tuyo arriba (leer y firmar) y, si calificas a alguien, tu lista debajo |
| Gestión Humana | Administración → **Desempeño** | Solo lo que **es** administración: las campañas y el catálogo de lo que se pregunta |

**Se quitó la pestaña «Evaluar» de administración.** Eran las mismas evaluaciones en dos sitios: dos
puertas a la misma tarea no son una comodidad, son una duda cada vez que alguien vuelve. Y decía algo
falso del producto — **calificar a tu equipo no es administrar la plataforma**, lo hace también quien
no administra nada. Quien entre a la pantalla de administración sin el permiso ve un estado vacío que
le dice dónde están sus evaluaciones.

**Lo tuyo salió del perfil.** El razonamiento original era bueno (se mira dos veces al año, no merece
una entrada permanente) y el resultado no: nadie busca su evaluación de desempeño entre sus
constancias. Ahora está en la misma pantalla, arriba, **con el color secundario de la empresa** para
que se distinga de un vistazo de la lista de trabajo, que va en el principal.

**El ítem del menú sigue sin ser fijo**, y esa parte de la Decisión #138 se mantiene: aparece cuando
hay **algo** —algo que responder, o algo tuyo que leer— y desaparece cuando no queda nada. Lo único
que cambió es que antes solo miraba lo que hay que calificar, y por eso a la mayoría no le salía
nunca.

---

## 6 sexies. Un formulario en uso: se duplica, y se dice cómo

La regla no cambió —lo que ya usó un ciclo no se reescribe, porque cambiaría la pregunta debajo de
respuestas ya dadas— pero **el botón «Editar» ya no está deshabilitado**. Deshabilitarlo dejaba sin
salida: quien quería cambiar el formulario del año pasado veía un botón apagado y ningún camino.

Ahora se abre, se explica por qué no se puede cambiar, y se ofrece **Duplicar y editar**: se crea uno
nuevo con «(copia)» en el nombre, el original no se toca y los ciclos viejos siguen diciendo lo que
decían.

---

## 6 septies. Cómo lo usan las empresas, y el reparto por cargo (Decisión #139)

**Un ciclo por año para toda la empresa** es lo normal: una campaña anual, abierta unas semanas,
con **formularios distintos según el cargo** dentro de la misma campaña. Semestral solo donde hay
mucha rotación. Un ciclo por área es la excepción, y solo cuando los calendarios de verdad difieren.

**Cerrado el 2026-09-02 (Decisión #139): un ciclo acepta VARIOS formularios** y reparte a cada
persona al que le corresponde por su cargo. El de conductores y el de analistas son la misma
campaña, con un consolidado que se lee entero y también formulario a formulario.

**Las tres reglas del reparto**, que son las que hacen que no haya que elegir nada a mano:

1. **El cargo manda.** El formulario que declara cargos se lleva a las personas de esos cargos.
2. **El que no declara ninguno es el general**, y recoge a quien no encaje en otro. Es exactamente
   lo que ya significaba «sin cargos = a toda la empresa», así que una campaña de un solo
   formulario se comporta igual que antes.
3. **Lo ambiguo no se abre.** Dos formularios que se reparten el mismo cargo, o dos generales,
   dejarían a quien le toca cuál en manos del orden de la consulta: se rechaza al crear el ciclo y
   otra vez al abrirlo, diciendo cuál es el choque. Y **abrir una campaña que no genera ninguna
   evaluación tampoco se permite**: abrir es irreversible, y una campaña vacía ya no se corrige.

**Al abrir se mira a toda la empresa**, no solo a los cargos declarados: quien no queda cubierto por
ningún formulario se cuenta y se dice. Filtrar de entrada sería más corto y dejaría fuera en
silencio a los conductores porque nadie hizo su formulario — que es justo lo que se descubre en
diciembre. Si la campaña era a propósito solo para unos cargos, el aviso sobra y no estorba.

---
## 6 octies. ¿Por CARGO o por ÁREA? (2026-09-02)

La pregunta salió al construir el reparto y merece respuesta escrita, porque parece de detalle y no
lo es: decide qué se le pregunta a cada persona.

**El formulario va por CARGO, y el área ya tiene su papel.** Los dos ejes existen y hacen cosas
distintas:

| Eje | Qué decide | Por qué ese |
|---|---|---|
| **Cargo** | **QUÉ** se pregunta | Se evalúa cómo hace alguien SU TRABAJO. A un conductor se le mide conducción segura, cumplimiento de ruta y cuidado del vehículo; a un analista, calidad del análisis y plazos. Eso es el cargo, no el departamento |
| **Área** | **QUIÉN** califica, y **cómo se corta el resultado** | El jefe sale de `areas.responsible_user_id`, y el consolidado se lee por área. Ahí el área es insustituible |

**Por qué no al revés.** Dentro de un área conviven cargos muy distintos —en Bodega hay auxiliares,
un supervisor y un coordinador— y preguntarles lo mismo obliga a escribir competencias tan genéricas
(«compromiso», «actitud») que dejan de medir nada. El área, en cambio, es homogénea en otra cosa: en
quién manda. Por eso cada eje se usa para lo que sí distingue.

**Es lo que hacen las plataformas del sector.** SuccessFactors, Cornerstone y Workday atan el modelo
de competencias al **puesto o familia de puestos**, y usan la estructura organizativa para la
jerarquía de evaluación y para los cortes del reporte. El patrón habitual son **dos capas**:

1. **Competencias organizacionales** — las mismas para todos: seguridad, trabajo en equipo, los
   valores de la empresa.
2. **Competencias del cargo** — las específicas de ese puesto.

**Las dos capas están construidas** desde el 2026-09-02 (Decisión #141, sección 6 nonies): un
formulario hereda las comunes de otro y añade las suyas. Se hizo justo por lo que decía el párrafo
anterior — que con cuarenta cargos repetirlas dolía — al confirmarse que el catálogo de cargos
cargado hoy es parcial y el real es mucho mayor.

**Si algún día hiciera falta el área**, la forma correcta no es sustituir el cargo sino añadirlo como
segundo criterio con precedencia clara: cargo primero, área después, general al final. No se
construye ahora: **TRANSPRENSA tiene cinco cargos**, el reparto por cargo los cubre, y una regla con
dos ejes es el doble de difícil de explicar a quien la configura una vez al año.

---

## 6 nonies. Las dos capas: comunes de la empresa + del cargo (Decisión #141)

**El problema, que aparece con muchos cargos.** Cada persona responde **un** formulario. Las
competencias comunes a toda la empresa —seguridad, trabajo en equipo, los valores— había que
repetirlas dentro de cada formulario de cargo. Con cinco cargos da igual; con cuarenta, cambiar
«trabajo en equipo» obliga a editar cuarenta formularios, y **el que se olvide se evalúa distinto
sin que nadie lo note**.

**La solución: un formulario puede HEREDAR de otro.** Uno se marca como base —las organizacionales—
y los de cargo dicen «hereda de ese» y añaden las suyas.

```
Formulario «Comunes de la empresa»   Seguridad (x3), Trabajo en equipo
        ▲                    ▲
        │ hereda             │ hereda
«Conductores» + Conducción   «Analistas» + Calidad, Plazos
   (cargo: Conductor)           (cargo: Analista SST)
```

**Lo que NO cambia, y es la razón de elegir esta forma sobre las otras:** cada persona sigue
respondiendo **un** formulario, con **una** evaluación y **una** nota. Al abrir el ciclo, la copia
congelada junta las dos listas —primero las comunes, después las del cargo— y a partir de ahí el
módulo entero trabaja con una sola lista: el cálculo, el congelado, la pantalla del evaluador y el
consolidado no saben que hubo dos capas. Por eso nada más tuvo que cambiar.

**Por qué esto y no marcar competencias como «organizacionales».** Una marca en la competencia sería
menos clicks, pero el contenido de un formulario dejaría de ser explícito: marcas una competencia y
cambias en silencio el significado de cuarenta formularios. Y sobre todo, **una marca solo admite un
juego de comunes**; con formularios base puedes tener «Comunes operativos» y «Comunes
administrativos», que es lo que pide una empresa con dos realidades distintas.

**Las tres reglas, y por qué:**

| Regla | Por qué |
|---|---|
| **Un solo nivel de herencia** | Una cadena de plantillas heredando de plantillas es imposible de leer en pantalla y de explicar a quien la configura una vez al año. Solo se ofrecen como base los que no heredan de nadie, y un formulario del que ya cuelgan otros no puede colgar de ninguno |
| **No se repite una competencia que ya viene de la base** | Se preguntaría dos veces lo mismo en la misma evaluación, y contaría doble en la nota. La pantalla ni las ofrece; el servidor además lo rechaza (`COMPETENCY_IN_BASE`) |
| **Editar la base cambia el PRÓXIMO ciclo, no los pasados** | Es justo el objetivo —cambiar en un sitio— y es seguro porque la copia se congela al abrir: lo que preguntó la campaña del año pasado sigue diciendo lo que decía |

**Y lo que hace esto usable con cuarenta cargos:** **Duplicar** está siempre disponible (armar el
formulario 12 desde cero cuando se parece al 11 es media hora tirada) y el selector de formularios
del ciclo tiene **buscador** a partir de ocho.

---

## 7. Dónde vive esto en el producto

Sección **propia** en la barra lateral (`Desempeño`), no dentro de Formaciones ni de Seguimiento. El
cliente pidió que no se mezcle, y la navegación es donde primero se mezclan las cosas: un módulo
metido bajo «Formaciones» acaba compartiendo filtros, indicadores y, tarde o temprano, tablas.

---

## 8. El análisis del ciclo (2026-09-09): de «cuántas van» a «qué formación pido»

Lo que el consolidado contestaba hasta hoy era **seguimiento de la campaña**: cuántas evaluaciones se
generaron, cuántas se entregaron y con qué promedio. El cliente lo dijo en dos frases seguidas:
*«ya se ejecutó, pero dónde se ve seguimiento, datos, métricas»* y, al ver las cifras,
*«no dice un resultado por competencia ni nada de ese tipo de análisis... por cargo, área, los
diferentes análisis que se puedan sacar, que la información le sirva para tomar decisiones... para el
plan»*.

Las dos frases dicen cosas distintas y las dos eran ciertas:

1. **Los resultados existían y no se encontraban.** Vivían detrás de un botón fantasma llamado
   «Ver como va», entre dos botones llenos. Se llama **«Ver resultados»**, va resaltado, y las cifras
   básicas —entregadas de total, promedio, firmadas— salen ahora **en la fila de la campaña**, sin
   abrir nada. Para quien mira, un dato que hay que ir a buscar es un dato que no está.
2. **Y lo que había dentro no servía para decidir.** Una lista de 900 notas no es un diagnóstico:
   nadie saca un patrón de ahí.

### Los tres cortes, y qué pregunta contesta cada uno

| Corte | Pregunta | Decisión que habilita |
|---|---|---|
| `porCompetencia` | ¿En **qué** estamos flojos? | Qué formación hace falta |
| `porArea` | ¿**Dónde**? | A qué área llevarla primero |
| `porCargo` | ¿A **quién**? | Con qué formulario y a qué cargo |

Y **dentro de cada competencia**, su propio corte por área y por cargo: la media de la empresa
esconde justo lo que se necesita saber. *«Seguridad vial: 71 %»* no dice nada; *«71 %, y en Logística
52 %»* dice a quién formar primero.

### Las reglas del cálculo, que no son neutrales

- Cada respuesta se lleva a **su porcentaje de escala** antes de promediar (`notaDeRespuesta`, la
  misma función que usa `calcularNota`): un 4 de 5 vale 80 y un «cumple» vale 100. Promediar los
  números crudos haría que una competencia de sí/no hundiera a las de 1 a 5. **Las dos cuentas
  comparten función a propósito**: si divergieran, la nota de una persona y el promedio de su
  competencia dirían cosas distintas sobre los mismos números.
- **Solo cuentan las entregadas.** Una a medio llenar todavía no es una opinión.
- **Lo que dijo el jefe y lo que dijo la persona van separados**, y su diferencia se enseña en
  puntos. Es el dato que más se usa en la reunión: si el jefe puntúa por debajo hay una conversación
  pendiente; si por encima, alguien que se subestima. Mezclarlos borra las dos.
- Las competencias de **solo texto no tienen nota**: `promedio: null`, no cero.
- Todo se ordena **de lo más flojo a lo más fuerte**, porque la lista se lee para decidir en qué
  reforzar. Lo que no tiene nota va al final: no compite en un orden que no tiene.

### Y aquí se cierra el círculo con el plan

`PerformanceCompetency.suggestedActivityId` —«qué formación fortalece esta competencia»— existía en
el catálogo desde el primer día **y no lo leía nadie**. Ahora sale al desplegar una competencia, con
su nota baja delante y enlace a la ficha. Es la frase que convierte un diagnóstico en un renglón del
plan del año siguiente, que era la razón de haber añadido esa columna.

### Lo que NO se hizo, y por qué

- **La matriz completa competencia × área** (una tabla de 12 × 10). Se enseñan las **tres peores** de
  cada corte: la matriz entera se lee celda a celda y esto se abre para decidir, no para estudiar.
  El Excel lleva el detalle si alguien lo necesita.
- **Comparar contra el ciclo anterior.** Es el análisis que sigue —«¿mejoramos en seguridad vial tras
  la formación?»— y necesita dos ciclos cerrados. Cuando exista el segundo.
