# Sprint 4 — Experiencia del aprendiz

**Fecha:** 2026-08-27 · **Estado:** terminado y verificado

## 1. Objetivo

Los tres sprints anteriores construyeron el sistema **visto desde administracion**: el contenido,
la obligacion y el programa. Ninguno resolvia la parte que decide si esto sirve o no, que es si
un auxiliar de bodega con guantes puestos y un celular de gama baja termina la formacion.

**Criterio de aceptacion (el que define el sprint):** que un auxiliar de bodega complete una
pildora desde el celular **sin señal estable**; que sus preguntas falladas **reaparezcan a los
dos dias**; y que su racha avance.

**Fuera de alcance a proposito:**
- Asistencia presencial, firma en pantalla y actas (Sprint 5).
- Certificados y su verificacion publica (Sprint 5).
- Encuestas de satisfaccion y eficacia (Sprint 5). El reproductor ya sabe abrir un contenido de
  tipo `SURVEY`, pero no hay instrumento que mostrar todavia.
- Retos colectivos por area (Fase 2, Decision #23).

## 2. El problema que resuelve

Un LMS corporativo se muere siempre en el mismo sitio: la gente de operacion no entra. No entra
porque la pantalla esta pensada para un escritorio, porque hay que buscar entre menus que le
estan prohibidos, o porque en la bodega no hay señal y al volver a intentarlo perdio lo que
llevaba.

Las tres respuestas del sprint son deliberadas:

```
UNA SUPERFICIE APARTE      El rol Usuario tiene UN permiso. Mandarlo al panel de
                           administracion es mandarlo a una pantalla donde todo esta
                           prohibido. Tiene su propia aplicacion, sin barra lateral.

EL AVANCE NO RETROCEDE     El telefono reenvia lo mismo varias veces al recuperar señal.
                           El servidor se queda con el mayor porcentaje y acumula el
                           tiempo: reenviar nunca puede empeorar el estado de nadie.

NADIE ES COMPARADO         La racha es privada y los puntos se ganan por logro real. No
                           hay ranking publico: la comparacion expulsa a los de abajo,
                           que en una empresa son quienes mas necesitan formarse.
```

## 3. Que se construyo

### Lo mio: pendientes, historial y progreso
`GET /me/pending` no devuelve una lista de obligaciones: devuelve **como hacer cada una**. Si hay
una ejecucion abierta, su id; si hay una convocatoria permanente, su id para autoinscribirse; y
si no hay ninguna via, lo dice. La regla dura de la tarjeta de pendiente es que **nunca hay un
boton que no lleva a ninguna parte**: cuando la formacion todavia no esta abierta, la pantalla lo
explica en vez de ofrecer un boton que dara error.

`GET /me/history` es la hoja de vida formativa de la persona: lo que hizo, cuando y con que nota.
Es lo que enseña cuando le preguntan si hizo la induccion.

### El reproductor de tarjetas
Pantalla completa, fondo oscuro, una tarjeta a la vez, progreso por segmentos arriba y un solo
boton grande abajo. Se avanza por boton o deslizando. Estan los seis bloques de la Fase 1:
texto e imagen, video corto, quiz, tarjeta volteable, encuesta rapida y completar frase.

El **quiz de una leccion es refuerzo, no nota**: se responde, se dice si estuvo bien y se sigue.
Por eso su respuesta correcta si viaja al cliente, al contrario que la de un examen. El quiz y el
completar frase son las dos unicas tarjetas que exigen responder antes de dejar avanzar.

**La telemetria con señal intermitente es el nucleo del sprint.** El tiempo se cuenta en el
cliente con un temporizador propio que se detiene cuando la pantalla no esta visible (si el
telefono se bloquea, ese rato no cuenta como tiempo de estudio). Al pasar de tarjeta se envia el
avance; si el envio falla, **los segundos no se pierden**: se guardan y viajan con el siguiente
intento. El endpoint es acumulativo e idempotente, asi que reintentar es seguro por diseño.

### Examenes desde el telefono
Una pregunta por pantalla, opciones como tarjetas de 56 px, cuenta atras cuando la evaluacion
tiene tiempo limite. Dos decisiones que importan:

- La cuenta atras corre contra la **hora de inicio que dio el servidor**, no contra el momento en
  que se abrio la pantalla: recargar la pagina no regala minutos.
- Cada respuesta se guarda al avanzar, pero la **entrega vuelve a mandarlas todas**. Si el
  telefono perdio señal a mitad del examen, los guardados intermedios fallaron y solo la entrega
  final salva el intento.

Un intento sin terminar **se retoma**, no se abre otro: abrir uno nuevo gastaria uno de los
intentos limitados. Cuando se agotan, la pantalla lo dice con todas las letras — que su analista
y su jefe ya fueron avisados para habilitarle un refuerzo — en vez de dejar que choque contra un
error (Decision #29).

La pantalla de resultado **no decide que mostrar**: lo decide la politica de revision de la
evaluacion, que el servidor aplica antes de responder. Con un banco de preguntas reutilizado,
enseñar las correctas a todo el mundo equivale a publicar el examen.

### Repaso espaciado y racha
La sesion de repaso del dia trae lo vencido, acotado: el compromiso con el colaborador es de tres
a cinco minutos, y una cola de cuarenta preguntas rompe ese compromiso y hace que nadie la abra.
Se responde toda la sesion y se entrega de una vez, porque entregar pregunta por pregunta
obligaria a tener señal en cada toque.

Cuando hoy no hay nada, la pantalla **dice cuando vuelve**. Dejarla en blanco haria pensar que la
funcion no sirve.

La racha avanza **solo al completar una leccion**, no al entrar: premia haber aprendido algo. Los
protectores (dos) cubren un dia perdido, que es lo que le pasa a un conductor en carretera.

### PWA instalable con offline
Manifiesto con `start_url` en la superficie del aprendiz, iconos generados por codigo
(`node scripts/generate-icons.mjs` — se regeneran en cualquier tamaño y su cambio es un diff
legible) y un **service worker propio, sin librerias**: lo que se cachea son datos de formacion de
una persona identificada, y esa decision no se delega a la configuracion por defecto de un
paquete.

Dos cosas que el worker **no** hace, y es deliberado:

- **No inventa respuestas.** Un envio encolado devuelve 503, no un 202 falso. La pantalla ya sabe
  decir "guardaremos tu avance al recuperar señal", que es la verdad; fingir un exito con la
  forma que la interfaz espera seria mentirle al usuario y romperle el codigo.
- **No encola la entrega de un examen ni el repaso.** Esas devuelven una nota y mueven el estado
  del intento; entregarlas a espaldas de la persona, horas despues y sin que vea el resultado, es
  peor que pedirle que lo intente con señal.

La cola de avance vive en IndexedDB con el token vigente que le pasa la pagina: reenviar horas
despues con una cabecera vencida perderia el avance de alguien por una razon puramente tecnica.
Al cerrar sesion se borran el cache de datos y la cola: en un telefono compartido, la formacion de
la persona anterior no puede quedar legible.

### Cadencia de pildoras y tope de notificaciones
La regla de a quien y cuando se le recuerda una pildora vive aparte del worker, en una funcion
pura y probada: es el limite entre **recordar y hostigar**, y tiene que poder revisarse sin leer
una linea de Prisma.

- No se avisa de algo que no se tiene pendiente.
- No se avisa a quien ya estudio hoy: el aviso es para quien no volvio.
- El envio va en la **franja horaria en la que esa persona suele estudiar** (la hora en la que mas
  veces ha aprendido algo, deducida de su historial; sin historial, las 8 de la mañana). Por eso
  el worker corre cada hora y no una vez al dia: un conductor que aprende a las 7 de la noche y un
  auxiliar que aprende a las 6 de la mañana no caben en el mismo disparo.
- La primera semana desde el ingreso admite ritmo diario; despues manda la cadencia del tenant
  (3 por semana por defecto, uno cada dos dias).
- **El tope semanal del tenant gana siempre**, incluso sobre el onboarding. Un tope que admite
  excepciones no es un tope.

### El cierre del ciclo
`CompletionService` es la pieza que cierra ejecucion -> obligacion -> cobertura del plan: cuando
se completa lo requerido, la ejecucion pasa a COMPLETADA o APROBADA y **cierra la obligacion que
satisface**. Si la persona lo hizo por su cuenta, sin venir de una asignacion, igual se busca una
obligacion viva de esa misma actividad: haberlo hecho por iniciativa propia tambien cumple.

Esto salda la deuda que el Sprint 3 dejo escrita ("la cobertura del plan se queda en cero hasta
que exista el lado del aprendiz").

## 4. Decisiones tomadas

| Decision | Por que |
|---|---|
| Superficie del aprendiz en su propio grupo de rutas `(learner)`, con barra inferior de cuatro destinos | El 80% lo vera solo en celular. Comparte sesion y empresa con el panel, no comparte chrome, densidad ni vocabulario |
| El reproductor va en un tercer grupo `(player)`, sin barra ni cabecera | Mientras alguien cursa, en pantalla solo debe haber contenido y una salida |
| El modo oscuro se activa **solo** en la superficie del aprendiz | El panel se presenta a gerencia en claro; que cambie de color porque el portatil de turno tiene el sistema en oscuro no lo espera nadie. El telefono del colaborador si: se usa de noche y en bodega |
| A donde entra cada quien se decide **por permisos**, no por nombre de rol | Los roles son configurables por empresa; los permisos no. Quien solo tiene `enrollments:read_own` entra a su formacion, no al panel |
| El envio encolado devuelve 503 y no un exito fingido | Ver arriba: mentir sobre el guardado es peor que el fallo |
| La cadencia de avisos es una funcion pura, separada del worker | Es una regla de negocio con consecuencias reales y tiene que poder probarse sin base de datos ni reloj de sistema |
| Iconos de la PWA generados por codigo | Se regeneran en cualquier tamaño y su revision es un diff, no "cambio un PNG" |

Ninguna de estas altera el modelo de datos ni los contratos ya publicados: el esquema del
Sprint 0 ya traia `review_queue`, `user_streaks` y `points_ledger`. **No hubo migraciones.**

## 5. Como se verifico

Resultados reales, ejecutados el 2026-08-27:

| Prueba | Resultado |
|---|---|
| `pnpm --filter @neo-pulse/api exec tsc --noEmit` | En verde |
| `pnpm --filter @neo-pulse/web exec tsc --noEmit` | En verde |
| `eslint` en api y en web (`--max-warnings 0`) | En verde |
| `pnpm --filter @neo-pulse/web build` | En verde; 7 rutas nuevas del aprendiz |
| `pnpm --filter @neo-pulse/api test` | **85 pruebas, 10 suites, todas en verde** (15 nuevas: cadencia de pildoras) |
| `pnpm test:e2e` (Playwright, navegador real contra la base de desarrollo) | **11 pruebas, todas en verde**, incluidas las dos nuevas del Sprint 4 |

El e2e del DoD hace el recorrido completo en un viewport de telefono (390x844): se arma la
pildora desde administracion (leccion de dos tarjetas, actividad de tipo Pildora, version 1
publicada, convocatoria permanente publicada, obligacion asignada al area), se entra a
`/hoy`, se empieza sin que nadie inscriba a nadie, se cursan las dos tarjetas —comprobando que el
quiz **no deja avanzar** sin responder—, se verifica que la formacion queda terminada, que la
racha no es cero y que la pildora aparece en el historial.

**Lo que el e2e no puede comprobar, y donde si esta comprobado:** que lo fallado vuelva a los dos
dias no se puede verificar en un navegador sin esperar dos dias. Vive en
`src/engagement/spaced-repetition.spec.ts`, que prueba los escalones 2-7-14-30 con el reloj
fijado. En el navegador se comprueba lo que si es observable: que la pantalla de repaso dice la
verdad cuando hoy no hay nada.

## 6. Que quedo pendiente

Con criticidad honesta:

| Pendiente | Criticidad | Nota |
|---|---|---|
| El cache offline guarda lo que la persona **ya visito**; no descarga por adelantado las lecciones asignadas | Media | Quien nunca abrio la pildora con señal no puede cursarla sin señal. Resolverlo es una precarga al entrar a `/hoy`; se deja fuera hasta ver el peso real del contenido de Transprensa |
| Los videos y documentos no se cachean | Media | Un video de 3 minutos en cache multiplica el tamaño guardado en el telefono. Hoy la leccion de tarjetas —el formato principal— si funciona sin señal |
| Sin notificaciones push | Baja | El aviso de pildora sale por correo y bandeja in-app. Push exige claves VAPID y permiso del usuario; se decide con el cliente |
| La franja horaria del aviso se deduce de los ultimos 60 dias con un tope de 5.000 eventos | Baja | Suficiente para el piloto; con miles de personas conviene una columna materializada |
| El repaso no distingue de que actividad viene cada pregunta | Baja | La sesion es corta y mezclada a proposito, pero el reporte de conocimiento por tema (Sprint 6) si lo va a necesitar |
| La entrega de examen sin señal no se encola | Deliberado | Ver seccion 3. No es deuda: es una decision |

---

*Historia del 2026-08-27. Para saber como funciona el sistema HOY, ver `docs/glosario.md` y
`docs/arquitectura.md`.*
