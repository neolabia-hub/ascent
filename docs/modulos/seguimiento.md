# Seguimiento de la ejecución

Quién hizo cada formación, quién no, y **por qué no**.

Decisiones #117, #122, #123, #124, #125, #126, #127, #131 y #132.

---

## 1. El hueco que cierra

Había porcentajes —cumplimiento y cobertura del plan— y **ninguna forma de abrirlos**. Quien
administra veía «62%» y no podía contestar lo único que sigue: **¿el 38% quiénes son?**

Sin eso el indicador no sirve para actuar: no se sabe a quién llamar, ni siquiera **si hay a quién
llamar**.

---

## 2. La distinción que lo justifica todo

Dos empresas con la misma formación marcan **62%**:

| | Empresa A | Empresa B |
|---|---|---|
| Terminada | 62 | 62 |
| **Atrasada** | **38** | 0 |
| **Esperando convocatoria** | 0 | **38** |

El indicador es idéntico y lo que hay que hacer es **opuesto**:

- **A** → 38 personas pudieron entrar y no entraron. **Hay a quién llamar.**
- **B** → 38 personas **nunca pudieron**: nadie programó la jornada. Llamarlas sería injusto y
  además inútil; lo que falta es convocar.

Un número solo no distingue esos dos casos. **La barra apilada sí**, sin leer nada. Es la diferencia
entre un indicador que se mira y uno que se usa.

---

## 3. Los seis estados

`apps/api/src/reports/execution-state.ts`

El **orden en que se preguntan** es la decisión:

```
1. ¿Ya la aprobó?          → TERMINADA
2. ¿La reprobó?            → REPROBADA
3. ¿Puede empezarla?  NO   → ESPERANDO
4. ¿Se pasó la fecha?      → ATRASADA
5. ¿La empezó?             → EN CURSO   /   si no → SIN EMPEZAR
```

| Paso | Por qué ahí |
|---|---|
| **1. El resultado manda sobre el plazo** | Una formación aprobada el mes pasado no está «atrasada» porque su fecha haya pasado: está hecha |
| **2. Reprobada es su propio estado** | Hay que reprogramarla. Mezclarla con «sin empezar» la esconde justo cuando hay que hacer algo |
| **3. Esperando gana al vencimiento** | Reclamar un retraso a quien nunca pudo empezar es la misma acusación absurda que se corrigió en la pantalla del aprendiz (Decisión #101) |

### Por qué no sirve el estado del aprendiz

`pending-state.ts` responde *«¿qué hago yo hoy?»* y por eso solo conoce lo pendiente. Este responde
*«¿cómo va la ejecución?»* y necesita ver también lo **terminado** y lo **reprobado**, que para el
aprendiz ya no existe. Unificarlos obligaría a que uno de los dos hablara de estados que no le
sirven.

---

## 4. Una decisión incómoda: qué cuenta en el denominador

**Las que esperan convocatoria SÍ cuentan.**

Sacarlas daría un porcentaje más bonito y falso: si de cien personas cincuenta no han sido
convocadas, el avance real de esa formación es **50%**, no 100% sobre las cincuenta que sí.

El número tiene que doler cuando la ejecución va mal; si no, no sirve para decidir nada.

**Quien ya no trabaja en la empresa NO cuenta.** Su obligación murió con su salida, y dejarlo infla
el denominador con gente que no se va a formar.

---

## 5. Dos niveles, y el segundo es el que importa

```
/reportes  ─────────────────────────────────────────────
  Avance de toda la empresa + barra apilada
  ↓ chips: pulsar "Atrasadas" deja solo las que tienen alguna
  Lista de formaciones, ORDENADAS POR LO QUE HAY QUE MIRAR
  ↓ abrir una (el filtro viaja)
  ─────────────────────────────────────────────────────
  Persona · área · cargo · estado · vence · intentos ·
  nota · encuesta · constancia
  ↓ los chips filtran la tabla
```

**El orden de la lista no es alfabético**: primero lo atrasado, después lo que espera convocatoria,
después lo de menor avance. Con doscientas formaciones, una lista alfabética obliga a recorrerla
entera para encontrar el problema — y entonces no se recorre.

**El plan tiene su pestaña «Cómo va».** Las otras cuatro responden *«¿qué hay en el plan?»*; esta
responde *«¿se está cumpliendo?»*, que es la que hace el auditor. Cada renglón lleva su barra y
enlaza al detalle de su formación.

En el plan se muestran los **proyectados junto a los reales**: si se pactaron 40 personas y hay 25
asignadas, el renglón puede marcar 100% y no cubrir lo prometido. Ese hueco solo se ve poniendo los
dos números juntos.

---

## 6. Detalles de la tabla que son decisiones

- A quien está **esperando** no se le muestra fecha límite. Es la misma acusación absurda del punto
  3: reclamar un plazo a quien nunca pudo empezar.
- Una nota vacía se pinta **«—» y no «0%»**: no haber tenido examen no es haberlo fallado entero.
- **Terminada sin constancia** lleva un icono apagado con su explicación, no un hueco. Esa formación
  puede simplemente no acreditar, y un hueco se lee como que falta algo.
- **Nada en rojo salvo lo reprobado**, que es el único resultado adverso de verdad. Atrasado va en
  ámbar —se hace y ya— y esperando en **neutro**, porque no es un fallo de nadie (Decisión #102).

---

## 7. Rendimiento: dos caminos y por qué

| Camino | Consultas | Para qué |
|---|---|---|
| `ejecucionDeActividad` | 5 (fijas) | El **detalle** de una formación, persona por persona |
| `estadosPorActividad` | **3 (fijas)** | Muchas a la vez: la vista general y el plan |

**El problema que resolvió el segundo:** la vista del plan llamaba a la primera **dentro de un
bucle**. Un plan de 30 renglones = **150 consultas** para pintar una pestaña, y creciendo con el
plan. Justo al revés de lo que debe pasar.

Ahora los datos se traen **una sola vez** con un `IN` y se agrupan en memoria: **3 consultas**, sea
para una formación o para trescientas.

> **Lo que NO se duplica es la regla de estados.** Los dos caminos llaman a
> `resolverEstadoEjecucion`. Si el criterio viviera también en SQL, el día que cambie habría que
> acordarse de dos sitios — y el que se olvide haría que la misma persona salga «atrasada» en una
> pantalla y «esperando» en otra. **Optimizar la consulta está bien; reimplementar el criterio, no.**

---

## 7 bis. El archivo que se lleva el auditor (Decisión #124)

La pantalla contesta «¿cómo vamos?» **mirando**. La auditoría pide otra cosa: un archivo con fecha,
con el universo completo, y donde quien audita pueda ordenar, filtrar y **recontar por su cuenta**.
Un pantallazo no sirve —no se puede recontar— y leerle la pantalla, tampoco.

**Dos exportaciones, las mismas dos preguntas de la pantalla:**

| Desde | Qué trae | Para qué |
|---|---|---|
| La vista general | Una fila **por formación**, con su desglose de los seis estados y el avance | «¿Cómo va todo?» |
| El detalle de una formación | Una fila **por persona**: cédula, área, cargo, estado, vencimiento, versión, intentos, mejor nota, encuesta y constancia | La evidencia nominal de la carpeta |

**XLSX y no CSV.** El mismo motivo que la plantilla de personas: un CSV abierto en un Excel en
español parte por comas lo que debería partir por punto y coma, convierte «0987» en 987 y «12-03»
en una fecha. El archivo llega a manos que no van a depurarlo.

**Decisiones que parecen formato y no lo son:**

- **La cédula va como TEXTO.** Es el dato con el que se cruza contra nómina, y una cédula con ceros
  delante los pierde en cuanto Excel la lee como número.
- **El avance va como número** (0,62 con formato de porcentaje), no como el texto «62%»: así la
  columna se puede promediar, ordenar y graficar.
- **El filtro se declara DENTRO del archivo.** Doce filas sin decir que solo son las atrasadas se
  leen como el universo entero, y entonces el informe miente sin que nadie haya mentido. Va en el
  contenido y no solo en el nombre: el nombre se cambia al guardarlo.
- **El filtro por texto NO viaja.** Buscar es una forma de encontrar algo en pantalla, no un
  criterio de informe: un archivo con las tres formaciones que contienen «altura» no es informe de
  nada.
- **Quien espera convocatoria sigue sin fecha límite**, igual que en pantalla. Si el archivo la
  trae, el reclamo injusto se hace igual por correo.

**Va bajo `reports:export`, no bajo `reports:read_scope`.** Mirar la pantalla y llevarse el archivo
no son el mismo acto: lo segundo saca de la plataforma una lista nominal —cédulas, áreas, notas—
que ya vive fuera. El permiso existía desde el Sprint 1 y hasta ahora no lo usaba ningún endpoint.
El alcance por proceso del analista sigue aplicando, porque las filas las arma el mismo servicio.

**Lo que se exporta es lo que se ve.** Las filas salen de los mismos métodos que pintan la pantalla
y aquí solo se da formato. Una consulta paralela «para el informe» acaba divergiendo, y cuando el
archivo y la pantalla dicen cosas distintas del mismo día, dejan de servir los dos.

**El PDF no se hizo, y no por falta de tiempo.** Un PDF de 600 filas no se ordena ni se filtra: es
el peor formato para lo que el auditor hace con esto. Tiene sentido el día que se pida una hoja
resumen **para firmar** —una página, totales por proceso—, que es un informe distinto y no la misma
tabla en otro envoltorio.

---

## 7 ter. Analítica: la misma ejecución, cortada por donde haga falta (Decisión #125)

El seguimiento contesta *«¿cómo va CADA formación?»*. Eso sirve para ir detrás de una. No sirve para
lo que se pregunta en un comité: **«¿qué área va peor?»**, **«¿la regional Caribe está al día?»**,
**«¿cómo vamos con BASC?»**. Ninguna de esas se saca de una lista de doscientas formaciones, y por
eso hasta ahora se contestaban a ojo.

**Un motor con dimensiones, no cuatro pantallas.** «Por área», «por regional», «por norma» y «por
cargo» no son cuatro informes: son el mismo dato agrupado por otra columna. Construirlos por
separado garantiza que dentro de tres meses uno diga 62% y otro 58% sobre lo mismo, porque alguien
arregló el criterio en un sitio y no en los otros. Aquí el hecho es siempre el mismo —una obligación
de una persona, con su estado ya resuelto por `resolverEstadoEjecucion`— y lo único que cambia es
por dónde se agrupa.

Siete cortes: **área, cargo, regional, servicio, proceso, tipo de formación y norma.**

**Se ven los siete juntos, sin selector.** Un desplegable obligaría a recordar el número del corte
anterior para compararlo con el siguiente, y nadie lo recuerda: se elige uno, se mira, y los demás
no se abren. Puestos uno al lado del otro, «Logística va mal» y «la regional Caribe va mal» se leen
de un golpe de vista — y muchas veces son **la misma gente vista de dos formas**, que es justo lo
que hay que descubrir.

**Tres decisiones que parecen detalles:**

- **Lo que no tiene valor se agrupa, no se descarta.** Quien no tiene regional también tiene
  obligaciones; si sus filas desaparecieran, el total dejaría de cuadrar con el del seguimiento y
  alguien perdería una tarde buscando el descuadre. Además, «23 personas sin regional» **es un
  hallazgo**: casi siempre significa que faltan datos por cargar.
- **Por norma, los grupos suman más que el total, y se dice.** Una formación puede responder a
  varias normas a la vez —alturas cuenta para SST y para BASC—, así que esa obligación aparece en
  las dos. No es un error de conteo: la pregunta «¿cómo vamos con BASC?» incluye todo lo que BASC
  exige, comparta o no. La pantalla lo advierte; callarlo haría que alguien intentara cuadrar los
  números y no pudiera, y acabara desconfiando de los dos.
- **Se puede acotar al PLAN.** Con `?plan=<id>` solo entra lo que nació del plan (regla de oro 2):
  quien ingresó en agosto no hace la jornada de marzo y no puede contar como incumplimiento de ese
  plan.

---

## 7 quater. Vencimientos: lo que se cae si nadie hace nada (Decisión #126)

Todo lo demás mira hacia atrás. Esto mira **hacia adelante**, que es de donde sale el plan del año
siguiente: hoy esa lista se arma a mano en una hoja de cálculo y por eso siempre llega tarde —nadie
recuerda en octubre que en marzo caducan cuarenta certificados de alturas—. Es además la segunda
pregunta del auditor: la primera es «¿quién lo hizo?» y la segunda «¿sigue vigente?».

**Dos cosas distintas vencen, y no se suman:**

| | Qué es | Qué se hace |
|---|---|---|
| **Certificación** | El papel caduca en una fecha (`certification_grants.valid_until`) | **Reprogramar.** La persona lo hizo bien y aun así deja de estar acreditada |
| **Obligación** | Una formación que se debe y no se ha hecho, con su fecha límite | **Perseguir.** Hay a quién llamar |

Sumarlas daría una cifra grande y sin significado, y las dos acciones son opuestas. Por eso son dos
series de la misma barra y nunca un solo número.

**Detalles que son decisiones:**

- **Lo ya vencido va aparte y primero.** No es «lo que viene»: es lo que ya se cayó, y es la única
  cifra de la pantalla sobre la que hay que actuar hoy y no programar para marzo.
- **Los tramos se acumulan:** lo que vence en 20 días también está dentro de los 90. Contarlos como
  excluyentes obligaría a sumar mentalmente para saber «cuánto tengo que resolver este trimestre»,
  que es la pregunta real.
- **Los meses vacíos se dibujan igual.** El hueco es información: es donde se puede reprogramar lo
  que se amontona en el mes de al lado.
- **Cada mes filtra la lista de abajo**, porque la pregunta siguiente a «en marzo hay cuarenta» es
  siempre «¿quiénes?».
- **Solo las obligaciones abiertas.** Una ya cumplida no vence: se volverá a exigir cuando toque la
  ronda siguiente, y esa obligación todavía no existe. Incluir las cerradas llenaría el calendario
  de trabajo ya hecho, que es la forma más rápida de que nadie vuelva a mirarlo.

**El color de las dos series no es decorativo.** Son categorías, no estados, así que no reutilizan
el ámbar de «atrasado» ni el rojo de «reprobado» —prestarlos los vaciaría de significado—. Los dos
tonos (`--serie-1`, `--serie-2`) pasan los seis chequeos de color: banda de luminosidad, croma,
separación para daltonismo, contraste sobre el fondo, en **claro y en oscuro**.

---

## 8. Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Los seis estados y el resumen | `apps/api/src/reports/execution-state.ts` |
| Las consultas | `apps/api/src/reports/reports.service.ts` |
| Pantalla general y detalle | `apps/web/src/app/(admin)/reportes/page.tsx` |
| La barra apilada y los chips | `apps/web/src/components/modules/admin/barra-ejecucion.tsx` |
| Pestaña «Cómo va» del plan | `apps/web/src/app/(admin)/plan/[id]/page.tsx` |
| El Excel del auditor | `apps/api/src/reports/execution-xlsx.ts` |
| El agrupador por dimensiones | `apps/api/src/reports/analytics.ts` |
| El calendario de vencimientos | `apps/api/src/reports/expirations.ts` |
| Las tres pestañas | `apps/web/src/components/modules/admin/analitica.tsx` y `vencimientos.tsx` |

---

## 9. La pantalla: tres pestañas, y por qué no son tres pantallas

`/reportes` tiene tres pestañas porque son **tres preguntas, tres momentos y tres públicos**:

| Pestaña | Contesta | Quién entra a eso |
|---|---|---|
| **Ejecución** | ¿cómo va esta formación y quién la ha hecho? | quien persigue a alguien |
| **Analítica** | ¿dónde está el problema? | quien decide dónde mirar |
| **Vencimientos** | ¿qué se me viene encima? | quien programa el año |

No son filtros de una misma vista: quien entra a decidir no quiere pasar antes por una lista de
doscientas formaciones. Y no son tres entradas del menú porque las tres se abren en la misma sesión
de trabajo, una detrás de otra.

**El rótulo del menú dice «Seguimiento» y no «Reportes».** Lo que hay aquí es el estado de la
ejecución; llamarlo «Reportes» hacía que quien buscaba un informe entrara y se fuera creyendo que no
existía.

### Detalles de aspecto que son decisiones

- **La pestaña activa va pintada con el color de la empresa**, no como una pastilla blanca sobre
  carril gris: sobre fondo blanco eso se distinguía solo por una sombra de un píxel y dejaba de
  decir dónde estabas (Decisión #132). Mismo criterio en las cinco vistas del plan y en los chips de
  horizonte de Vencimientos.
- **El número grande de cada tarjeta es SIEMPRE el avance**, también con un filtro puesto. Antes
  cambiaba de significado —con «Atrasadas» pasaba a ser cuántas atrasadas— y eso obliga a releer la
  tarjeta cada vez: el mismo sitio, el mismo tamaño, dos magnitudes distintas. El conteo del estado
  filtrado va al lado, más pequeño y con su color.
- **El botón de exportar va arriba y a la vista**, no dentro de un menú: es la acción por la que se
  abre esta pantalla el día de la auditoría.
- **Nada en rojo salvo lo reprobado.** Atrasado va en ámbar —se hace y ya— y esperando convocatoria
  en neutro, porque no es un fallo de nadie. Un rojo que no es un problema entrena a ignorar el rojo.

---

## 10. Lo que cambió en el plan (Decisiones #127 y #131)

### Los tres números, juntos y con su pregunta delante

La pestaña «Cómo va» del plan abre con los tres indicadores que antes estaban repartidos por la
pantalla con nombres intercambiables —«cumplimiento», «cobertura», «avance»—:

| Pregunta | Indicador | Fórmula |
|---|---|---|
| ¿Hicimos lo que dijimos? | Programa | jornadas ejecutadas / programadas |
| ¿Llegó la gente que dijimos? | Cobertura | capacitados / proyectados |
| ¿Quién la tiene hecha hoy? | Personas al día | obligaciones cumplidas / total |

**Y debajo, la conclusión escrita.** Un plan al 100% de programa y al 60% de cobertura no es «va bien
con un matiz»: es que las jornadas se hicieron y la gente no fue, y eso pide convocar mejor, no
programar más. El porcentaje lo lee cualquiera; la contradicción entre dos porcentajes, no.

**Los cortes por dimensión también viven dentro del plan**, acotados a él (regla de oro 2): saber qué
área va peor DENTRO del plan ya no obliga a salir a una pantalla donde además cuentan las píldoras y
las extraordinarias.

### La palabra «puntos» se retiró

La barra lateral decía «Faltan 90 puntos» y en este producto **los puntos son otra cosa**: los que
gana el aprendiz al completar formaciones. Dos significados para la misma palabra en la misma
pantalla, y el que se lee primero es el equivocado. Ahora dice **«Meta del 90%»**: el anillo ya
muestra dónde va y lo único que falta al lado es hasta dónde hay que llegar. Corregido en los tres
sitios donde aparecía.

### Objetivo y alcance salieron de la vista diaria

Ocupaban una tarjeta fija en una pantalla que se abre todos los días, y **el alcance no se mostraba
en ninguna parte** aunque se pudiera escribir. Son texto que se redacta una vez al año y se lee una
vez al trimestre, casi siempre para una auditoría. Ahora hay un botón que abre una **ventana
centrada** —no el cajón lateral, que es para editar— con el objetivo, el alcance y la meta; y desde
ahí se llega al mismo editor de siempre, sin duplicar el formulario.

---

## 11. Lo que falta

| Pendiente | Criticidad | Nota |
|---|---|---|
| **Exportar la analítica y los vencimientos a Excel** | Media | La ejecución ya se exporta; estas dos todavía no. Es el mismo patrón de `execution-xlsx.ts` |
| **La matriz de competencia** (cargo × formación) | Media | La cuadrícula de SST: qué exige cada cargo y quién lo tiene al día. El modelo ya la soporta desde el Sprint 3 |
| Acotar la analítica a un plan **desde la pantalla** | Baja | El servidor ya acepta `?plan=`; falta el selector |
| Hoja resumen **para firmar** en PDF | Baja | Una página con totales por proceso. No es la tabla en otro envoltorio: es otro informe |
| Indicadores agregados: cobertura por proceso, matriz de competencia, vencimientos | Media | Es el grueso del Sprint 6 |
| Cortar por área, proceso o regional | Media | Hoy solo se filtra por estado y por texto |
| Materializar el avance si un plan pasa de ~300 renglones | Baja | Con 30 no se nota. Sería optimizar algo que nadie ha medido |
