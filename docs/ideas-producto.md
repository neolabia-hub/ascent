# NEO PULSE — Ideas de producto por decidir

Ideas que **no** estan comprometidas. Cada una con lo mismo: que problema resuelve, si el modelo
ya la soporta, cuanto cuesta de verdad y una recomendacion honesta —incluido "no lo haria".

No es una lista de deseos: si una idea no se va a hacer, se dice por que. Lo descartado explica
el diseno tanto como lo hecho.

Lo que **si** esta comprometido vive en `docs/sprints/README.md` (sprints 5 y 6) y la deuda real
en `docs/arquitectura.md` seccion 10.

---

## 1. Simulador de escenarios con decisiones ramificadas

**La idea.** En vez de una pregunta de seleccion multiple, la persona entra en una situacion
realista: un cliente molesto, un conductor que pide saltarse un procedimiento, un subalterno que
reporta un incidente. Elige que hace, y **la historia se bifurca**: cada decision lleva a una
escena distinta. Al final no hay una nota de "sabe la respuesta", hay un recorrido que muestra
como decide.

**Valor: alto, y diferenciador.** Es lo unico de esta lista que mide algo que un examen no puede
medir. En atencion al cliente y en liderazgo la diferencia entre saber la politica y aplicarla es
justo lo que se quiere evaluar. Tambien encaja en SST y PESV: "vas retrasado y el jefe te pide que
salgas sin revisar el vehiculo" no se evalua bien con cuatro opciones.

**Donde va: es un TIPO DE CONTENIDO PROPIO, no una tarjeta ni una pregunta.** Y conviene tenerlo
claro antes de construir nada:

- No es una **tarjeta** de leccion. Una leccion es una PILA lineal: se avanza y se termina. Un
  escenario es un grafo con caminos distintos, y meterlo en la pila rompe el modelo (el indice de
  tarjeta deja de significar nada, y con el la telemetria y el "retomar donde se quedo").
- No es una **pregunta** de evaluacion. El intento materializa "que preguntas cayeron, en que
  orden y con que opciones" (`attempt_questions`), y eso es lo que permite anular una pregunta
  defectuosa y recalificar. Un escenario no cae: se recorre.
- Si **produce resultado** y por tanto puede contar como evaluable: el recorrido se guarda entero
  (escena, decision, momento) y la nota sale de las decisiones tomadas, no de aciertos sueltos.

**Lo que cuesta.** Un editor de grafo (escenas, opciones, a donde lleva cada una, deteccion de
callejones sin salida), un reproductor propio, un esquema de puntuacion por camino y el registro
del recorrido como evidencia. Es un sprint entero, no un anadido.

**Recomendacion: SI, pero como sprint propio y despues del 5 y el 6.** No sustituye a la
evaluacion: ante un auditor de BPM o SARLAFT lo que se presenta sigue siendo el examen con su nota
y su banco. El escenario se suma, no reemplaza.

---

## 2. Habilidades desbloqueadas por la formacion

**La idea.** Que las capacitaciones "desbloqueen" habilidades y se pueda ver que habilidades tiene
cada persona.

**Ojo: buena parte ya existe, con otro nombre.** Hoy el sistema ya responde "¿esta preparada esta
persona para su cargo?" con la cadena que ya esta construida:

```
cargo -> requisito (assignment_rules) -> obligacion -> ejecucion completada -> certificacion vigente
```

La **matriz cargo x actividad** ya existe y es exactamente el instrumento que exige el PESV Paso 10
(competencia documentada por rol). Y las certificaciones con vigencia responden "¿estaba
certificado el 12 de mayo?", que es la pregunta legal.

**Lo que NO existe es un catalogo de HABILIDADES desacoplado del cargo.** Y esa es la decision de
fondo: una habilidad no es una actividad ni una certificacion. Anadirla significa una capa nueva
del dominio (habilidad, nivel, como se adquiere, como caduca) que atraviesa todo el modelo.

**Recomendacion: NO por ahora.** La capa de habilidades solo se paga cuando el objetivo deja de ser
cumplimiento y pasa a ser movilidad interna —que es la idea 3—. Mientras la pregunta sea "¿cumple
lo que su cargo exige?", la matriz actual la contesta y una capa mas solo anade sitios donde el
dato se puede contradecir.

---

## 3. Rutas para ascender, y postular a vacantes con los certificados

**La idea.** Agrupar varias capacitaciones y certificaciones en un plan ("Liderazgo"), y que
completarlo habilite a postularse a puestos libres.

**Parte ya esta MODELADA y sin construir.** `learning_paths`, `path_items` (con prerrequisitos y
"minimo N de esta seccion") y `path_enrollments` estan en el esquema desde el Sprint 0 y no tienen
ni modulo ni pantalla. La "ruta para ascender" ES una ruta de aprendizaje: no hay que inventar el
modelo, hay que construirlo. Incluye ya lo dificil —reconocer formaciones que la persona ya hizo y
siguen vigentes, en vez de obligarla a repetirlas—.

**Lo de postular a vacantes es OTRO producto.** Vacantes, postulaciones, criterios de elegibilidad
y decision de contratacion no son formacion: son seleccion. Comercialmente puede ser un modulo
aparte muy vendible —"solo puede postularse quien tiene el certificado vigente" es un argumento
real—, pero metido dentro del LMS ensucia el dominio y arrastra normativa laboral propia.

**Recomendacion:** rutas de aprendizaje **SI**, cuando el cliente tenga contenido suficiente para
que una ruta signifique algo (no antes: una ruta de dos cursos es una lista). Seleccion interna,
como **producto aparte** que consume la API de certificaciones de este. Se anota como oportunidad
comercial, no como alcance de la Fase 1.

---

## 4. Avisos "justo a tiempo" (segun lo que fallaste)

**La idea.** Que el sistema sugiera una pildora de dos minutos relacionada con algo que la persona
hizo mal, en vez de mandar contenido generico.

**A medias hecho.** La cadencia de pildoras YA es adaptativa: solo avisa a quien esta inactivo, en
su franja horaria historica y con tope semanal (`engagement/nudge.ts`, funcion pura y probada). Lo
que no existe es la parte de "relacionada con lo que fallaste".

**Lo que falta es un dato, no un motor.** `review_queue` ya guarda las preguntas falladas de cada
persona. Falta poder decir DE QUE TEMA es cada pregunta y que pildora lo cubre — y eso es
exactamente la deuda ya declarada: *"el repaso no distingue de que actividad viene cada pregunta"*.
El reporte de conocimiento por tema del Sprint 6 necesita ese mismo etiquetado.

**Recomendacion: SI, junto con el Sprint 6.** Es la idea con mejor relacion valor/esfuerzo de esta
lista, precisamente porque el trabajo pesado (motor de repeticion, cadencia, tope) ya esta hecho y
lo que falta se necesita igual para los reportes.

---

## 5. Repaso espaciado automatico

**Ya esta construido** (Sprint 4). Motor determinista 2-7-14-30: la pregunta fallada baja de nivel
y vuelve antes; la dominada sale de la cola (`test out`). La sesion del dia se arma sola y se acota
a 3-5 minutos a proposito, porque una cola de cuarenta preguntas rompe el compromiso y nadie la
abre. Cuando hoy no hay nada, la pantalla dice cuando vuelve.

Lo unico pendiente es lo de la idea 4: que el repaso sepa de que tema viene cada pregunta.

---

## 6. Notas privadas del aprendiz sobre lo que esta viendo

**La idea.** Que cada persona pueda escribir notas sobre la parte que esta cursando y recuperarlas
despues, como en Coursera o Udemy. Salio al disenar las pestanas del reproductor.

**Lo que cuesta.** Tabla nueva (`content_notes`), endpoints, y —lo caro— cola de reenvio sin senal:
una nota escrita en carretera que se pierde al recuperar cobertura es peor que no tener notas.

**Recomendacion: NO por ahora, y no por esfuerzo sino por encaje.** Las notas rinden en cursos
largos que alguien elige y estudia durante semanas. Aqui la unidad es una pieza de 3 a 7 minutos
que la empresa asigna, se cursa una vez y se certifica; el sitio donde esa persona guarda lo que le
sirve es el **material de apoyo**, que ya esta en el reproductor y es el documento oficial. La
franja de pestanas quedo construida de forma que una tercera entre sin rediseno el dia que el
piloto muestre que hacen falta.

**Ojo con confundirla con los COMENTARIOS.** Lo que se pidio como "comentarios" resulto ser otra
cosa que YA esta en el alcance: la **encuesta de satisfaccion** del Sprint 5, que califica la
capacitacion y al capacitador. Eso si va bajo el contenido, como una pestana mas (Decision #50).
Un hilo de comentarios publico entre inscritos es un producto distinto —moderacion, permisos,
avisos al instructor y retencion, porque en un LMS de cumplimiento un comentario tambien es un
registro— y no esta pedido.

---

## 7. Estetica "de IA": auroras, gradientes y objetos que respiran

**La idea.** Que la interfaz se vea menos generica con recursos del gusto visual actual: fondos tipo
aurora, gradientes amplios, formas que laten o flotan.

**Recomendacion: NO, y esta escrito desde el Sprint 1** (`.claude/skills/pulse-ui`, regla dura:
"NUNCA dashboard generico de IA: nada de gradientes morados por defecto, nada de glassmorphism
gratuito"). Tres razones, en orden de peso:

1. **Este producto emite evidencia legal.** La misma pantalla que muestra el video sostiene un
   registro que se presenta ante un auditor de SST, PESV o BASC. Una estetica de landing de startup
   le resta exactamente lo que necesita: que parezca un registro serio.
2. **Envejece a la vista.** La aurora de 2026 es el degradado morado de 2021. Un tenant que firma a
   tres anos lo va a mirar viejo antes de que termine el contrato.
3. **El publico y el aparato.** Conductores y auxiliares de bodega, en telefonos de gama media y
   con datos contados. Un fondo animado a pantalla completa se paga en bateria y en scroll con
   tirones justo donde no sobra ninguno.

**Lo que SI resuelve el problema de fondo**, que es real —los botones y el progreso se ven planos—:
usar la firma que la marca ya tiene definida y que no se esta usando. El "pulso": el anillo que
LATE una vez al completar una parte, las tarjetas que ENTRAN, la racha que respira. Y darle oficio
al elemento en vez de decoracion alrededor: un boton primario con profundidad de verdad (realce
interior, elevacion al pasar, hundido al pulsar) y, en el caso del video bloqueado, un boton que
**es** su propio medidor —el relleno avanza con lo que llevas visto y se abre con un latido al
llegar al minimo—, que ademas elimina la barra suelta y el texto que hoy lo acompanan.

Distinguir: no es "sobrio contra vistoso", es **oficio contra decoracion**.

---

## 8. Catalogo abierto: formacion que la persona elige, sin que nadie se la exija

**La idea (planteada el 2026-08-30).** Que la empresa publique formaciones a las que **cualquiera
pueda entrar por iniciativa propia** —para reforzar un tema o crecer hacia otra area—, en vez de
que todo lo que existe sea algo que alguien le exigio.

**Por que sale ahora:** hablando de *autoservicio*. Hoy autoservicio significa "te inscribes tu
mismo **en algo que ya te exigen**": los pendientes del colaborador se arman desde sus
OBLIGACIONES, asi que una formacion sin obligacion es invisible para el. La idea es el paso
siguiente y es distinto: **elegir**, no solo pulsar el boton de algo ya decidido.

**Que hay que construir, y no es poco.** El modelo aguanta la parte facil y no la que importa:

- La **inscripcion sin obligacion ya funciona**: `enrollments.assignment_id` es opcional a
  proposito, y al completar, el cierre busca una obligacion viva y si no hay, simplemente no
  cierra ninguna. Nada se rompe.
- Falta la **pantalla que no existe**: un catalogo navegable para el aprendiz. Hoy no hay ninguna
  vista de "lo que hay disponible", solo "lo que me toca".
- Falta decidir **que se publica ahi**: no todo el catalogo interno es apto (hay formaciones de un
  cargo concreto, o con contenido que no se quiere abrir). Hace falta una marca por formacion
  —"visible en el catalogo abierto"— y probablemente un alcance por area o cargo.
- Y falta lo que de verdad cuesta: **que significa para los indicadores**. Una formacion elegida
  por gusto NO puede mover la cobertura del plan ni la matriz de competencia (regla de oro 2). Se
  mide aparte, como las extraordinarias.

**Lo que hay que evitar:** convertirlo en "postularse". Postular a una vacante es seleccion, no
formacion, y ya esta analizado en la **idea 3**, que ademas trae la mitad del camino hecho: las
**rutas de aprendizaje** (`learning_paths`) estan modeladas desde el Sprint 0 y sin construir. Un
"plan carrera" es una ruta que la persona elige, asi que estas dos ideas son la misma obra en dos
tiempos: primero que se pueda elegir UNA formacion, despues que se pueda elegir una RUTA.

**Recomendacion:** no antes del Sprint 6, y **no antes de que el piloto tenga contenido que
sobre**. Un catalogo abierto con seis formaciones obligatorias dentro no es un catalogo: es la
misma lista con otro nombre. Cuando haya contenido que de para elegir, el orden barato es:
marca de "abierta" en la formacion -> catalogo del aprendiz -> ruta elegible (idea 3).

---

## Resumen

| Idea | Veredicto | Cuando |
|---|---|---|
| Escenarios ramificados | Si, tipo de contenido propio (ni tarjeta ni pregunta) | Sprint propio, despues del 5 y 6 |
| Catalogo de habilidades | No por ahora: la matriz cargo x actividad ya responde la pregunta util | Solo si se hace movilidad interna |
| Rutas de aprendizaje | Si, y ya esta modelada sin construir | Cuando haya contenido que lo justifique |
| Seleccion interna / vacantes | Fuera del LMS. Oportunidad comercial aparte | Producto propio |
| Avisos segun lo fallado | Si, mejor relacion valor/esfuerzo | Con el Sprint 6 |
| Repaso espaciado | Hecho | Sprint 4 |
| Catalogo abierto (elegir formacion, no solo la exigida) | Si, pero despues: hoy el aprendiz solo ve lo que se le exige | Sprint 6+, y solo con contenido que sobre |
| Notas privadas del aprendiz | No por ahora: encajan en cursos largos, no en piezas de 3-7 min asignadas | Si el piloto las pide |
| Comentarios entre inscritos | No estan pedidos: lo que se pidio como "comentarios" ES la encuesta de satisfaccion, que ya esta en el Sprint 5 | — |
| Estetica de auroras y gradientes | No: prohibido desde el Sprint 1 y contraproducente en un registro que va a auditoria. La salida es la firma "pulso", no la decoracion | — |

*Documento vivo: una idea se borra de aqui cuando se construye (y pasa a la bitacora del sprint) o
cuando se descarta en firme (y pasa a las decisiones del CLAUDE.md, con su porque).*
