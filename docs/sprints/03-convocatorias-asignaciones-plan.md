# Sprint 3 — Convocatorias, asignaciones y plan anual

**Fecha:** 2026-08-27 · **Estado:** terminado y verificado

## 1. Objetivo

El Sprint 2 construyo **el contenido**. Este construye **la entrega**: a quien se le exige cada
formacion, cuando, donde se dicta y como se mide el programa del ano.

**Criterio de aceptacion (el que define el sprint):** que entre una persona nueva y **sin que
nadie la asigne** le nazca su induccion general con vencimiento **antes de su fecha de ingreso**,
mas las especificas de su cargo; y que el plan 2026 muestre cumplimiento y cobertura que **no se
mueven** cuando se le asigna cualquier otra cosa a cualquier otra persona.

**Fuera de alcance a proposito:** que el colaborador realice la formacion desde el celular
(Sprint 4) y la asistencia presencial con firma y acta (Sprint 5). Aqui se construye la
obligacion y la programacion, no la vivencia del aprendiz.

## 2. El problema que resuelve

Hoy, en la practica del sector, esto se lleva en un Excel: alguien recuerda que los conductores
deben hacer seguridad vial, otro anota quien falto, y en la auditoria se reconstruye a mano
quien estaba obligado a que. Las cuatro preguntas que hunden una auditoria son siempre las
mismas: **que se le exigia a esta persona, desde cuando, si estaba vigente en una fecha, y de
donde salio el numero del indicador**.

La respuesta del sprint es que la obligacion sea un objeto del sistema, no un recuerdo:

```
AUDIENCIA            ->  REQUISITO             ->  OBLIGACION (por ronda)
"a quienes aplica"       "que se les exige"        "lo de Fulano, con su fecha"
  se recalcula sola        una regla viva            nace y vence sola

VERSION PUBLICADA    ->  CONVOCATORIA          ->  INSCRIPCION
"que se aprende"         "cuando y donde"          "que paso con Fulano"

PLAN ANUAL           ->  RENGLONES que REFERENCIAN convocatorias
"lo que se planeo"       cumplimiento y cobertura, congelados
```

## 3. Que se construyo

### Audiencias que se recalculan solas
Un grupo definido por una regla (cargo, tipo de cargo, area, regional, vinculacion, actor vial),
no por una lista de nombres. La pantalla dice **a cuantas personas alcanza antes de guardar**, y
avisa en amarillo cuando una regla sin filtros alcanza a **toda la empresa**.

La membresia se materializa con historia: quien sale queda con su fecha de salida, nunca se borra
la fila. Asi se responde "por que esta persona tenia esto asignado en junio".

### Requisitos y el motor que los convierte en obligaciones
Un requisito une una audiencia con una formacion y dice **cuando vence**: al ingresar a la
empresa (con dias negativos, para que la induccion sea PREVIA al primer dia de labores, D1072
art. 2.2.4.6.11), al entrar a la audiencia, o de forma recurrente (cada N meses o una fecha fija
anual, como la capacitacion SARLAFT).

El motor hace cuatro cosas y nada mas: crea la ronda 1 de quien aun no la tiene, abre la ronda
siguiente cuando la anterior quedo cumplida, marca lo que se paso de fecha como **vencido**, y
**retira** lo pendiente de quien salio de la audiencia. Corre en el alta de una persona (para que
sus obligaciones existan en el acto) y cada hora en segundo plano (para lo que solo cambia con el
paso del tiempo).

### Matriz cargo por actividad
La forma corta de declarar las inducciones especificas: una cuadricula de cargos por actividades
donde marcar una casilla crea, por debajo, la audiencia de ese cargo y su requisito de ingreso.
La matriz solo administra las audiencias de **un unico cargo**, y las reconoce por su forma, no
por su nombre: renombrar una audiencia no desconecta la matriz, y una audiencia mas amplia
("conductores de Antioquia") nunca se edita por accidente desde una casilla.

### Convocatorias con proyectados congelados
Una convocatoria cuelga siempre de una version **publicada** —convocar un borrador seria prometer
un contenido que aun puede cambiar— y toma numero por ano (`CONV-2026-000001`).

Al publicarla, el sistema **deriva** los proyectados de los requisitos que exigen esa actividad
(o, en su defecto, de los cargos a los que va dirigida) y los **congela**. Ajustarlos a mano se
puede, pero exige justificacion, que queda auditada y visible en la convocatoria.

Publicar y cancelar comprometen a la organizacion: quien no tiene el permiso los **propone** con
justificacion y el administrador decide, igual que al publicar contenido.

### Plan anual y sus indicadores
El plan es una entidad propia con objetivo, metas y aprobacion. Sus renglones **referencian**
convocatorias: reprogramar una jornada no obliga a reescribir el plan.

Aprobarlo hace dos cosas irreversibles: congela los proyectados de cada renglon y crea las
obligaciones del plan. Desde ahi, cumplimiento y cobertura se calculan **exclusivamente** sobre
esas obligaciones. El mismo plan se puede leer por sistema de gestion, porque el plan SST, el
PESV y el BASC son vistas del mismo plan.

## 4. Decisiones tomadas

| Decision | Por que |
|---|---|
| **Una sola definicion de la regla de audiencia, con dos derivaciones** | El filtro que busca miembros en la base y el predicado que decide en memoria salen del mismo listado de facetas. Si fueran codigo separado, la lista de la pantalla y las obligaciones que nacen podrian discrepar, y en cumplimiento eso es un hallazgo |
| **La recurrencia se ancla en cuando la persona la completo**, no en el vencimiento | Anclarla al vencimiento castiga a quien se adelanta y premia a quien se atrasa |
| **La ronda siguiente aparece con antelacion** (60 dias por defecto) | Si naciera el dia del vencimiento, la reinduccion anual apareceria ya vencida |
| **Al salir de la audiencia se retira lo PENDIENTE, no lo que ya estaba en curso** | Ya hay trabajo hecho; borrarlo seria destruir evidencia y desmotivar |
| **Los proyectados se acotan a la regional de la convocatoria** | Una jornada en Neiva no le promete nada a Barranquilla. Numerador y denominador tienen que hablar de la misma gente |
| **Un aviso por persona, no uno por obligacion** | Una carga masiva de 300 personas no puede convertirse en cientos de correos por cabeza |
| **Idempotencia por indice unico** (requisito, persona, ronda) | El cron y el alta de una persona pueden correr a la vez; el motor tiene que poder repetirse sin duplicar nada |
| **El plan aprobado no se edita** | Sus renglones ya obligan a personas reales; editarlo en silencio reescribiria el pasado |
| **El numero de convocatoria se reserva dentro de la transaccion del alta** | Si el alta falla, el consecutivo no se consume: es un identificador legal, no puede tener huecos ni repetidos |

## 5. Como se verifico

- **Prueba de humo por HTTP (19 comprobaciones, en verde)** sobre el flujo completo: publicar
  contenido, crear audiencia y requisito, encender la matriz, dar de alta una persona, publicar
  la convocatoria, inscribir, armar y aprobar el plan, y cambiar a la persona de cargo. Incluye
  la comprobacion clave: **las metricas del plan son identicas antes y despues de asignar
  formacion por fuera del plan**.
- **42 pruebas unitarias** (11 nuevas): la regla de audiencia y sus dos derivaciones, el calculo
  de vencimientos por disparador y zona horaria, la recurrencia y su ventana, y los indicadores
  del plan (incluido que un plan vacio no inventa un 100% y que lo cancelado no arrastra sus
  proyectados).
- **9 pruebas de extremo a extremo en navegador** (las 7 anteriores mas 2 nuevas), en verde: la
  obligacion que nace sola con la fecha correcta, y la convocatoria que al publicarse congela sus
  proyectados y alimenta el plan.
- Aislamiento multi-tenant (`db:verify-rls`), lint, typecheck y build: en verde.

### El fallo que encontraron las pruebas

La prueba en navegador comprobo la **fecha exacta** del vencimiento, no solo que fuera anterior al
ingreso. Gracias a eso se detecto que la fecha de ingreso —una columna de **solo fecha**— se
estaba reinterpretando como si fuera un instante en hora de Colombia, lo que corria **todos** los
vencimientos anclados al ingreso un dia hacia atras. Con una persona que ingresa el 1 de
diciembre, el sistema exigia la induccion para el 29 de noviembre en vez del 30.

Es el tipo de error que en produccion nadie reporta y que, en una auditoria, aparece como una
matriz de cumplimiento entera desfasada. Esta corregido, con una prueba unitaria que falla si
alguien vuelve a leer una fecha de calendario como si tuviera hora.

## 6. Que quedo pendiente

| Pendiente | Criticidad | Cuando |
|---|---|---|
| La cobertura solo se movera cuando exista ejecucion real (el aprendiz aun no puede completar nada) | Esperada | Sprint 4: al completar, la ejecucion cierra su obligacion y la cobertura sube sola |
| Cerrar la obligacion (`completed_at`) al completar la ejecucion | Alta | Sprint 4. La columna y el motor ya existen; falta el enganche |
| Rutas de aprendizaje y certificaciones como objetivo de un requisito | Media | Sprints 4-5. Hoy el requisito solo apunta a actividades, y lo dice con un error explicito |
| Los crons corren en proceso, sin cola | Media | Cuando el volumen lo pida; el motor ya es idempotente, moverlo a BullMQ no cambia su logica |
| La matriz no administra requisitos definidos sobre audiencias mas amplias | Baja, consciente | Se informa en pantalla cuantos hay para que nadie crea que un cargo no tiene nada exigido |
