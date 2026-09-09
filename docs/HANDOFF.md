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

## 2026-09-09 — Las evaluaciones enteras, el verde del tenant, la cicatriz de las tildes y el Sprint 6

Sesión corta, toda con el cliente leyendo la pantalla.

### 1. EL FONDO Y LAS TARJETAS ESTABAN A 1,5 PUNTOS

Lo dijo mirando: *«no hace contraste con las tarjetas»*. Y era medible: fondo `#f7f8fa` contra
tarjeta blanca — **1,5% de luminancia**. A esa distancia el ojo no separa dos superficies, así que la
tarjeta dejaba de leerse como tarjeta y la pantalla entera parecía una hoja con líneas encima.

El fondo baja a `#eceff4` (~7 puntos). **Se mueve el fondo y no la tarjeta**, a propósito: la tarjeta
es donde se lee y se escribe, y el blanco puro es lo que le da al texto el máximo contraste. El borde
baja un paso con él, o se habría perdido contra el fondo nuevo. En oscuro no se toca nada: allí la
separación ya era de nueve puntos, que es justo lo que faltaba en claro.

### 2. LAS EVALUACIONES: TRES PALABRAS QUE NO EXPLICABAN NADA

Las tres preguntas del cliente fueron, literalmente, *«qué es tema»*, *«qué es biblioteca»* y *«de
dónde se administra el banco»*. Las tres tenían la misma forma: el producto usaba una palabra suya
sin decir qué significaba **en el sitio donde aparece**.

- **Tema.** Es una etiqueta de la pregunta y sirve para **una sola cosa**: que un bloque al azar
  pueda decir «saca 10 de este montón». No cambia la pregunta, no sale en el examen y no altera lo ya
  respondido. Ahora lo dice el propio campo, y el del bloque al azar también.
- **Banco.** «Reutilizar una / De las ya escritas» pasa a **«Traer una ya escrita / Del banco: todas
  las preguntas de la empresa»**. La palabra ya no hay que adivinarla.
- **Biblioteca.** Era lo peor: no es un sitio al que se vaya. Pasa a **«Traer una lección ya creada»**.

**Y lo que faltaba de verdad no era vocabulario, eran dos puertas:**

1. **Un tema no se podía renombrar.** Se creaba al vuelo tecleándolo y se podía borrar —si estaba
   vacío—, así que uno mal escrito el primer día se quedaba mal escrito para siempre. Ahora hay un
   gestor con la lista, **cuántas preguntas tiene cada uno**, renombrar y borrar. Vive **dentro del
   editor** y no en una pestaña propia, por lo mismo que la Decisión #84 quitó el banco: nadie entra
   a «administrar temas», entra a armar un examen y se topa con que el tema está mal.
2. **Una pregunta no se podía sacar del banco.** El endpoint existía desde el Sprint 2 y ninguna
   pantalla lo usaba: la lista solo crecía. Ahora se retira desde el buscador — y **retirar no es
   borrar**: lo que alguien respondió apunta a la versión que respondió, y borrarla dejaría ese
   intento sin enunciado, que es lo que un auditor pide ver.

**Y una comprobación que evitó trabajo:** el cliente dijo que crear una evaluación pedía «nombre y
descripción». Se miró: pide **solo el título** —«las preguntas se escriben dentro, viendo cómo van a
quedar»—. Lo de nombre y descripción es de **crear una lección**. No se tocó nada.

### 3. Y DOS RESPUESTAS QUE NO ERAN CÓDIGO

**«¿El acta se genera igual si la lista la tomó el instructor?»** Sí, y ya estaba: el acta no lee el
QR, lee la tabla donde escriben los tres mecanismos. Se le puso su recorrido (`acta-de-lista.mjs`)
para no volver a contestarlo de memoria.

**«¿Para qué pedir asistencia si la evaluación y la encuesta se hacen en la plataforma?»** Tiene
razón en el caso normal, y por eso está anotado como `PENDIENTES` 2.7: hoy la jornada elige una de
las dos vías y no puede llevar lista *además*. Lo que falta es decidir si se ofrece una tercera —
asistencia como **evidencia**, sin que cierre nada—, que es una decisión suya y no nuestra.

### 4. EL FONDO, SEGUNDA VEZ: LO QUE SE MIDE Y LO QUE SE VE

El primer arreglo llevó el fondo de `#f7f8fa` a `#eceff4` y luego a `#e8ecf2`. Sobre el papel estaba
resuelto —de 1,5 puntos de separación a 7—. El cliente volvió a mirar la pantalla y dijo: *«el
contraste no lo veo»*.

Tenía razón otra vez, y la lección es que **la medida no era la buena**. Siete puntos de luminancia
bastan cuando las dos superficies se tocan; aquí no se tocan: entre el fondo y la tarjeta hay un
borde claro, sombras suaves y mucho aire, y cada uno de esos tres se come parte de la diferencia.

Queda en **`#dfe5ee`** (~11 puntos), con el borde bajando con él (`--line` a `#cfd7e2`,
`--line-strong` a `#b6c0ce`) para que no se pierda contra el fondo nuevo. Sigue siendo un gris de
oficina y no un color: lo que tiene que destacar es lo que está escrito, no la hoja.

**Regla para la próxima:** el contraste de superficies se comprueba mirando, no calculando. El número
sirve para descartar lo evidente —1,5 no puede funcionar—, no para dar algo por bueno.

### 5. EL SELECTOR DE LA FICHA: TERCERA FORMA, Y LA BUENA

Las cinco pestañas de una formación (Ficha · Contenido · Quiénes · Convocatorias · Versiones) han
tenido tres formas en dos días, y las dos primeras las tumbó el cliente mirando:

1. **Subrayadas.** *«El botón se parece a esos selectores»* — con los botones de acción al lado, un
   trazo de 2 px no distingue *dónde estoy* de *qué puedo hacer*.
2. **Pastilla rellena.** *«No me gusta cuadrado cuando está en el medio»*. Un bloque de color en
   mitad de la fila parte el recorrido en dos en vez de señalar un punto dentro de él.
3. **Una barra de progreso con paradas**, que es lo que pidió: *«tipo pipeline o tracking por
   etapas»*.

Una **línea** cruza la fila entera, va de color hasta donde estás y gris después; encima, cinco
**paradas** numeradas, con visto las ya pasadas y un anillo suave la actual. El avance se ve sin
contar nada, y la etapa activa es un punto, no un bloque — que era exactamente la queja.

El único movimiento es el de la línea al cambiar de etapa (medio segundo) y un pulso corto en la
parada nueva. **En un registro que va a auditoría el movimiento tiene que significar algo**, y aquí
significa «te has movido de sitio». Vive en `view-tabs.tsx` como `forma="etapas"`; el resto del
sistema sigue con `pastillas`, porque una lista de vistas que no llevan orden no es un recorrido.

### 6. LAS TILDES: 165 CADENAS, Y LA TRAMPA DE SINCRONIZARLAS

*«Revisa palabras mal escritas en todo el sistema»*. Las tres pasadas anteriores fueron a por el
texto entre etiquetas JSX, pero medio sistema escribe sus rótulos **como cadenas** —`label: 'Quienes'`,
los avisos de error, los textos de ayuda— y ahí no llegaba ninguna. 165 corregidas.

La línea que no se cruza: **hay cadenas que son palabras y cadenas que son nombres.** `key: 'quienes'`
viaja en `?tab=` y ponerle una tilde rompe los enlaces guardados; `'formacion'` es la clave de un
campo de la constancia. Solo se corrige una cadena si tiene un espacio dentro —ninguna clave interna
lo tiene— o si va detrás de `label:`, `title:`, `nombre:` o `placeholder:`.

**Y lo que costó de verdad fue la otra mitad:** cada rótulo corregido deja ciegas a las pruebas que lo
buscan por su texto. `scripts/sincronizar-selectores.mjs` lee el `git diff` de la web y sustituye
en las pruebas **esas mismas cadenas**, no un diccionario. Cuatro intentos, cuatro trampas, todas
pisadas antes de esquivarlas: emparejar por posición propuso `Escape -> Enter`; sustituir a pelo
renombró la función `montarFormacion`; respetar las comillas todavía renombró `${reglaArea}` dentro de
una plantilla; y exigirlo todo seguía cambiando `Areas completas`, un rótulo que no se había tocado,
porque `Area` es un trozo de `Areas`. Está contado entero en el RUNBOOK.

**Lo que NO se tocó, y es una respuesta para el cliente:** «Gestion Humana», «Capacitacion del plan»,
«Director de Gestion Humana» son **datos**, no código — nombres de catálogo guardados en la base. Se
escriben bien desde Configuración, y en producción los carga el cliente. Corregirlos en la semilla no
arreglaría ninguna base que ya exista.

### 7. LAS PREGUNTAS DE UN TEMA, QUE ERAN UN NÚMERO Y NADA MÁS

El gestor de temas de esta misma mañana decía «71 preguntas» y no había forma de ver **cuáles** — que
fue lo primero que preguntó el cliente al abrirlo. Y sin verlas tampoco había forma de vaciar un tema
para poder borrarlo: la única salida era abrir cada evaluación a buscarlas.

Ahora cada tema se despliega y enseña las suyas, con dos salidas que **no son lo mismo** y por eso
van separadas: **«Quitar del tema»** deja la pregunta en el banco y solo le borra la etiqueta —es lo
que hace falta para poder borrar el tema—; **retirar** la saca del banco entero. Se piden solo al
desplegar: cargar las de treinta temas para pintar treinta nombres sería traerse el banco para nada.

Y dice dónde se edita el texto, porque es la pregunta siguiente: **no se edita aquí**. Se trae a una
evaluación con «Traer una ya escrita» y se corrige allí, lo que crea una versión nueva sin tocar lo
que alguien ya respondió (Decisión #6).

### 8. Y LA SUITE ESTABA ROJA POR LA BASE, NO POR EL CÓDIGO

Al correr la suite entera falló `alcance-analista` esperando el diálogo de la contraseña al crear una
persona. El síntoma estaba escrito en el RUNBOOK desde el 2026-08-31 y dado por cerrado: la base de
desarrollo acumula reglas de asignación de cada corrida, el motor las evalúa **todas** al dar de alta
a alguien, y el alta se pasa de los diez segundos.

**Medido antes de tocar nada: 131 reglas activas y 453.091 obligaciones.** Y el limpiador
—`dev:limpiar-reglas`— contestaba *«Desactivadas 0»*.

La causa estaba dentro del propio limpiador. La guarda que se le puso el 2026-09-03 —no tocar la
regla de una formación publicada, después de dejar sin regla una inducción real del cliente— se
justificó con *«eso deja alguna regla de prueba viva, y son unas cuantas de más»*. **Eran 104 de
131**: hoy casi todas las pruebas publican su formación, así que la excepción dejó de ser una esquina
y pasó a ser el caso normal.

Se afinó por el **nombre**: lo que deja la suite acaba en un espacio y seis o más dígitos
(`Induccion E2E 04084758`); lo que escribe una persona, no — y la inducción que se perdió aquel día
se llamaba como la llamó su autor. **131 → 29 reglas activas.**

**La lección no es sobre reglas de asignación:** una excepción que se defiende con *«son unas pocas»*
caduca el día que dejan de ser pocas, y nadie vuelve a mirarla, porque el script sigue corriendo y
sigue diciendo que fue bien. Lo que la delató fue la **segunda línea del mensaje** —«Respetadas
104»—; sin ella habría pasado por un limpiador que no encuentra nada que hacer.

### 9. Y CINCO PRUEBAS LLEVABAN ROJAS DESDE ANTES, POR MI CULPA

Con la base ya limpia siguió fallando `convocatoria-version`, esperando el botón «Nueva lección». La
pantalla decía **«Nueva leccion»**, sin tilde. Y no era de hoy: en el commit anterior, sin tocar
nada, la prueba pedía una cosa y la pantalla decía otra.

Es la cicatriz de la pasada de tildes que se aplicó a los dos lados y luego **se revirtió solo en la
web** —el script había estropeado comentarios y se deshizo con `git checkout -- apps/web/src`—. Las
pruebas se quedaron citando una pantalla que ya no existía. Cinco specs afectadas
(`convocatoria-version`, `quienes-desde-la-ficha`, `sprint-2`, `sprint-3`, `sprint-4`), y su rojo se
parecía al de siempre: un tiempo de espera agotado, que es lo que sale también cuando la base va
lenta. Por eso las dos corridas anteriores no lo separaron.

**Se corrigió en la pantalla —las pruebas ya decían lo correcto—** y de paso quedó la herramienta que
lo encuentra sin correr nada: `scripts/selectores-huerfanos.mjs` compara los textos con acento que
piden las pruebas contra lo que la web escribe de verdad. Encontró los 14 de una vez.

**La lección, y me la apunto:** revertir a medias deja el sistema peor que no haber tocado nada,
porque el rojo que produce **no señala al sitio del error**. Si hay que deshacer una pasada que tocó
dos lados, o se deshacen los dos o se comprueba el otro antes de seguir.

### 10. Y LA SUITE ENCONTRÓ UN FALLO DEL SELECTOR NUEVO, QUE NO ERA DE LA PRUEBA

Con la base limpia y las tildes cuadradas, cinco specs seguían fallando al pulsar la pestaña
«Contenido», y por DOS motivos encadenados. El primero: al meter el número dentro de la parada, el
**nombre accesible** del botón pasó de «Contenido» a «2 Contenido». El segundo, que solo apareció al
arreglar el primero: al pasar la ficha a `ViewTabs`, esos botones dejaron de tener `role="button"` y
pasaron a `role="tab"` —que es lo correcto, hay un tablist con sus paneles—, y las pruebas seguían
pidiéndolos como botones. Once selectores actualizados a `getByRole('tab')`.

No es un problema de la prueba. El número y el visto son pistas **visuales** de posición: lo que
dicen —«vas por la segunda», «esta ya la pasaste»— ya lo dice `aria-selected` y ya lo dice el orden
de los propios botones. Quien navegue con lector de pantalla oiría el número antes que el sitio al
que va. La parada lleva ahora `aria-hidden`, y la pestaña vuelve a llamarse por su nombre.

**Vale la pena decirlo porque es el argumento de siempre al revés:** una prueba que se rompe al
cambiar la interfaz suele ser una prueba frágil. Esta no: pedía el botón por su nombre, que es como
hay que pedirlo, y se rompió porque el nombre había empeorado de verdad.

### 11. EL SEGUNDO COLOR DE LA EMPRESA, QUE LLEVABA MESES SIN USARSE EN LA ADMINISTRACIÓN

*«Tienes que usar el color secundario del tenant, no solo el primario... algunos botones podrían ser
de ese color... sin tener muchos colores.»*

Existía desde el principio: cada empresa configura **dos** colores en Preferencias → Marca,
`primaryColor` y `accentColor`. Y el segundo se usaba **solo en el lado del aprendiz**, siempre
diciendo lo mismo: **algo avanza** — la barra de una lección, el porcentaje de cobertura del plan, el
botón de continuar. En la administración no aparecía nunca.

Se añadió la variante **`acento`** al botón, y lo importante es la regla, no el color:

> El acento pinta **la acción que lleva el trabajo a su siguiente estado**. Una por pantalla.

Hoy son dos, y las dos se eligieron por esa regla:

| Pantalla | Botón de acento | Por qué no otro |
|---|---|---|
| Ficha de la formación | **Publicar cambios** | Crear una versión, descartarla o eliminar son movimientos laterales o marcha atrás |
| Lista de asistencia | **Dar por cumplida a N** | Es lo que convierte una lista marcada en formación cumplida; «Cancelar» al lado es fantasma |

**Y el límite, que es la mitad del trabajo:** si con el acento se pinta un «Guardar» cualquiera, el
color deja de significar *avance* y pasa a significar *botón* — que es lo que ya dice ser un botón.
La última frase del cliente, *«sin tener muchos colores»*, es exactamente ese criterio, y por eso
quedó escrito en el propio componente y no en un documento aparte.

Un detalle que no se ve pero se notaría: cuando el botón de acento lleva halo, el halo se pinta del
**mismo** color que el relleno. Un botón naranja con resplandor azul se lee como un error de
pintura.

### 12. Y LA PARADA, CON LA FORMA Y EL ICONO QUE PIDIÓ LA REFERENCIA

Sobre una imagen de referencia, tres correcciones al recorrido de la sesión anterior:

1. **Cuadrado redondeado, no círculo.** Un `rounded-[12px]` de 36 px tiene la forma de un icono de
   aplicación —se reconoce como algo que se pulsa—; el círculo perfecto se lee como el punto de un
   mapa.
2. **Dentro va el icono de la pestaña, no un número.** *«Que la selección actual tenga icono y
   nombre.»* Cada pestaña ya traía el suyo desde que existe la pieza —un documento la ficha, unas
   capas el contenido, unas personas a quiénes—, y el número solo repetía el orden, que la línea ya
   cuenta. Lo ya recorrido conserva el visto: ahí no importa qué había, importa que no hay que
   volver.
3. **Dentro de una tarjeta**, que ya estaba y el cliente confirmó: el recorrido es navegación y
   necesita su propia superficie para no confundirse con el contenido que ordena.

### 14. EL FONDO, TERCER INTENTO — Y REVERTIDO POR EL CLIENTE

*«Termina con más contraste en todo, aún no se nota.»* El diagnóstico fue bueno y el resultado no le
gustó, así que lo primero es lo segundo: **el fondo se queda en `#dfe5ee`**, tal como estaba, y el
árbol quedó byte a byte como al empezar.

Lo que sí quedó aprendido, porque volverá a hacer falta el día que se retome: **`--paper` hace DOS
trabajos con un solo valor.** Es el suelo de la pantalla *y* el relleno suave de dentro de las
tarjetas —pastillas, filas al pasar el ratón, cajas de aviso: unos sesenta sitios—. Por eso los tres
intentos se quedaban cortos y no por falta de puntería: bajarlo lo suficiente para que el suelo se
separase habría ensuciado de gris los sesenta rellenos. La salida, si se retoma, es **partirlo en
dos** (`--ground` para el suelo, `--paper` para el relleno), que es lo que se probó: se vio en el
login que la tarjeta se separaba sola, con 16 puntos de luminancia en vez de 11.

**Y la lección de verdad no es de color:** se revirtió entero en cinco minutos porque los cambios
eran un token y un reemplazo mecánico de clase. Un cambio de aspecto que se pueda deshacer así vale
mucho más que uno «bien hecho» repartido por cuarenta archivos.

### 15. EVALUACIONES: EL FORMULARIO QUE SÍ PEDÍA COSAS, Y LOS TEMAS ENTEROS

**Lo primero es un error nuestro de ayer.** Se dijo que crear una evaluación «pide solo el título» y
que no había nada que tocar. Es cierto en *Evaluaciones → Nueva evaluación*. Pero el cliente crea
desde **dentro de la formación**, y ahí pedía cuatro cosas —Título, Descripción, Banco de preguntas y
Cuántas al azar—, **las dos últimas obligatorias**. Se comprobó la pantalla equivocada y se cerró
como «no hay nada que hacer»: cuando alguien dice que una pantalla pide algo, la pantalla que hay que
abrir es la suya, no la que responde a la misma frase.

**Y lo que había detrás era peor que un formulario largo:** el tema era obligatorio para crear, así
que en una empresa **sin temas el botón Agregar no se dejaba pulsar**. Desde una formación no se
podía crear una evaluación. Nadie lo había visto porque la semilla trae temas.

Cómo queda: **solo el título**. Se crea vacía y se abre su editor —lo mismo que hace una lección—,
que es donde están las tres salidas de verdad: escribir una pregunta, traer una ya escrita del banco
o poner el bloque al azar. La descripción sale de evaluación y encuesta (`PENDIENTES` 7.2): la lee
quien cursa **junto al contenido**, y en un examen lo que se abre es el examen. Y el enlace de volver
decía siempre «Evaluaciones» aunque llevara a la formación; ahora dice a dónde vuelve.

**Los temas del banco, lo que pidió mirando:**

- **Icono arriba a la derecha**, no un enlace de texto. Y de paso deja de depender del bloque al
  azar: allí solo existía si ese bloque era el paso activo, pero el tema también se le pone a una
  pregunta suelta, así que la puerta tenía que estar siempre. Lo que vale para toda la pantalla vive
  en la cabecera.
- **Un solo campo que busca y crea.** Antes era «Tema nuevo» + botón Crear, y la lista entera debajo.
  Con treinta temas lo que uno hace casi siempre es **buscar** uno; crear es la excepción. Ahora
  filtra según se escribe y solo ofrece «Crear ...» si lo escrito no coincide con ninguno —comparado
  sin mayúsculas, que es lo que evita acabar con dos temas iguales y ninguno completo—.
- **«Dónde se editan las preguntas de ese tema no la veo.»** Estaban: se desplegaban pulsando el
  NOMBRE del tema. Un nombre no parece un botón. Ahora cada fila tiene el suyo —**«12 preguntas»**
  con su flecha—, que además dice lo que hace falta saber para que un bloque al azar quepa.
- **Los párrafos largos, detrás del icono de ayuda**, que es la regla que el cliente puso el 06-09 y
  que este panel no cumplía. Y los iconos: `SquarePen` para editar, `Undo2` para deshacer, y
  **`Archive` para retirar del banco** — no una papelera: retirar no borra nada, y lo que alguien
  respondió sigue apuntando a su versión.

**Lo que NO se hizo, y es decisión, no olvido:** el panel sigue siendo un **cajón lateral** y no una
ventana. La regla del producto es suya (Decisión #131): *si tiene campos, cajón; si es para leer,
ventana*. Y aquí el cajón hace algo más — deja ver detrás la evaluación que se está armando, que es
justo lo que uno mira mientras decide si el tema está bien puesto.

### 16. EL VERDE, EL AVISO DEL PLAN Y EL SALUDO QUE SE DECIA DOS VECES

Tres cosas que vio en la pantalla, y las tres eran ciertas.

**El botón verde.** La Decisión #166 —*«la acción que lleva el trabajo a su siguiente estado va en el
color de acento del tenant»*— duró un día. El acento que TRANSPRENSA tiene configurado es **verde
`#367d17`** (el principal es `#1e0958`), así que *Publicar cambios* y *Dar por cumplida a N* salían
verdes entre botones neutros y no se leían como «el paso siguiente», sino como un semáforo. Vuelven
al color principal, y **#166 queda retirada**: la variante sigue existiendo en `button.tsx`, pero no
la usa nadie.

Donde el verde sí dice algo es en los **sí/no de la ficha**, que era su propuesta: el «Sí» va relleno
en verde (`tone: 'ok'`). Y de paso dejó de decir **«Si»**, que es otra palabra: ahora es **«Sí»**.

**El aviso del plan ocupaba una tarjeta entera todos los días.** Eran dos párrafos —el estado y su
explicación— encima de una ficha que se abre para otra cosa. Queda en **una línea**, con la
explicación detrás del icono de ayuda.

Y lo que **no** se hizo, que es la parte que importa: esconderlo entero detrás de un icono
desplegable. Cuando la formación **no** está en el plan, eso no es un dato — es la advertencia de que
no cuenta para ningún indicador. *Un aviso que hay que abrir para enterarse no es un aviso.* Así que
ese caso se queda a la vista, en ámbar; el caso normal —sí está en el plan— es gris y discreto. El
color es lo que separa los dos, no el tamaño.

**Y el saludo salía dos veces en la misma pantalla.** La barra de arriba dice «Buenos días, Miguel»
en TODAS las pantallas; el título de Inicio decía exactamente lo mismo dos centímetros más abajo.
Inicio deja de saludar y su título dice ahora **en qué va la empresa hoy**: «3 acreditaciones
vencidas», «5 obligaciones se quedaron atrás», «2 decisiones esperan tu aprobación» o «Todo al día».
Se nombra **una** sola cosa —la primera que importa—, porque un titular con tres cifras no es un
titular; y `null` mientras las cifras no han llegado, para no afirmar «todo al día» un segundo antes
de que aparezcan tres vencidas.

**Lo que se le dijo que NO, y por qué.** Propuso que la barra saludara con «buenos días, crack /
maestro / máquina», con el efecto de escritura del login, «para que se sienta viva». Dos motivos para
no hacerlo, y ninguno es de gusto:

1. **La regla del registro formal es suya**, de una sesión anterior, y este es un sistema cuyos
   registros acaban delante de un auditor. Una barra que tutea a un director de Gestión Humana no se
   puede quitar de una captura de pantalla.
2. **El efecto de escritura en el login se ve una vez**; en la barra se repetiría en cada carga de
   pantalla, decenas de veces al día. Lo que la primera vez es simpático, a la quinta es una
   animación que retrasa la lectura.

Lo vivo no sale del tono, sale de **decir algo cierto y distinto cada día**, que es justo lo que hace
ahora el título de Inicio. Se le ofreció el paso siguiente por ese camino —que el título reconozca un
logro real: «Nadie tiene nada vencido: 41 días seguidos»— y está sin decidir.

### 17. LA CICATRIZ DE LAS TILDES, ENTERA: OCHO PRUEBAS Y UN HUECO EN LAS DOS HERRAMIENTAS

Al correr la suite con lo de evaluaciones salieron **8 rojas de 23**, y **ninguna era de lo de hoy**:
todas eran de la pasada de tildes de ayer. El 2026-09-09 por la mañana se dieron por cerradas cinco;
faltaban ocho, y las dos herramientas que se escribieron para esto no las vieron porque **las dos
leen cadenas entre comillas** y estas se escondían en otros tres sitios:

| Dónde se escondía | Ejemplo |
|---|---|
| Una **expresión regular** | `/Buenos dias\|Buenas tardes/` — la pantalla dice «Buenos días» |
| Un **atributo CSS** | `[aria-label="Planes de capacitacion"]` — la pantalla escribe «capacitación» |
| Una **plantilla** | `` `Marcar opcion ${n} como correcta` `` — la pantalla pone la tilde |

Y dos de las ocho no eran de las pruebas sino **de la pantalla**, que es lo que hace que valga la pena
haber mirado una por una: `format.ts` escribía **«Vence en 3 dias»**, **«Vencio ayer»** y **«el mismo
dia»** —texto que lee el usuario, no un comentario—, y la ficha decía «vence 1 dias antes del
ingreso». Ahí lo correcto era corregir la pantalla, no la prueba.

`scripts/selectores-huerfanos.mjs` gana la comprobación que le faltaba, que es **la del sentido
contrario**: *la prueba pide sin tilde lo que la pantalla escribe con ella*. Mira también dentro de
las expresiones regulares y **propone la corrección exacta** —saca del código el trozo equivalente—
en vez de solo señalar. La lección, otra vez la misma que con el limpiador de reglas: una herramienta
que solo mira en una dirección da por bueno todo lo que pasa por la otra, y sigue diciendo que fue
bien.

### 18. LA SEGUNDA VUELTA DEL CLIENTE: SIN ÁMBAR, SIN ETAPAS, Y LA HERENCIA A LA VISTA

**El ámbar del aviso del plan, fuera.** *«No quiero nada ámbar.»* Tenía razón y el motivo es el que
importa: el color de estado se gasta si se usa para algo que pasa todos los días. Los dos casos —está
en el plan, no está— se distinguen ahora por **las palabras**, sobre el mismo gris. El aviso sigue
saliendo solo para los tipos que participan en el plan; el resto de las formaciones no oyen hablar
del plan en ningún sitio.

**El selector de la formación, cuarta forma — y la lección no era el dibujo.** Subrayadas, pastilla,
etapas: las tres tumbadas, y siempre por lo mismo, *«el botón se parece a esos selectores»*. Estaba
mirando el sitio equivocado en las tres: el problema no era la forma, era que **compartía fila con
Publicar y Eliminar**. Ahora las pastillas —la forma del resto del producto— viven en **su propia
banda**, encima del contenido, dentro de un carril gris que las hace legibles como UN control y no
como cinco botones. `Etapas` se borró entero: una variante que no usa nadie invita a volver a
usarla, y un recorrido AFIRMA un orden que estas cinco vistas no tienen —se entra a Convocatorias sin
pasar por Contenido cada vez que se programa algo ya publicado—.

**Una evaluación nueva entra escribiendo.** Se abría en «Cómo se califica» —la nota, los intentos, el
tiempo—, que es lo último que se decide y era lo primero que se veía: recién creada, la pantalla pedía
configurar un examen que todavía no existe. Ahora nace con la primera pregunta en blanco. No se
guarda sola: entra sin marcar la pantalla como sucia y `guardar()` se niega mientras esté a medias.

**Y la pregunta más de fondo del día: nota mínima e intentos se piden en dos sitios.** No son
redundantes —son una **cascada de tres pisos**: empresa → formación → examen, y el vacío significa
«lo que diga el piso de arriba»—, pero eso **no se veía por ninguna parte**: una caja vacía no dice
con qué nota se aprueba. Decidió dejar los dos sitios y que la herencia se vea:

- El campo de la evaluación lleva en el hueco **el número que se aplicaría** («80 (de la empresa)») y
  dice para qué sirve rellenarlo: **solo para exigir MÁS**, como un piso legal —«alturas siempre 90 %»—.
- Se enseña el de la **empresa** y no el de la formación a propósito: una evaluación puede estar
  dentro de varias formaciones con notas distintas, así que un solo número de formación aquí sería
  mentira la mitad de las veces. El de la empresa es el único que siempre es cierto.
- «Reglas de la versión» dice ahora lo que es: *con esto se aprueba todo examen de esta formación,
  salvo que alguno exija más por su cuenta*.

**Y el saludo, escribiéndose — pero una vez.** Aceptó lo del efecto de escritura «sutil, solo al
iniciar sesión o cuando cambia el saludo», que es exactamente la regla que lo hace soportable: la
barra sale en todas las pantallas, así que animarla en cada carga serían decenas de animaciones al
día. Se escribe al entrar y cuando el saludo cambia de verdad —al cruzar el mediodía y las siete—, lo
recuerda `sessionStorage`, y no se anima si el sistema pide menos movimiento. Lo del tuteo
—«crack», «máquina»— sigue fuera, por lo dicho en §16.

### 19. EL SPRINT 6, REVISADO ANTES DE PRODUCCIÓN: TRES HUECOS Y NINGUNO ERA «EL DASHBOARD»

*«Revisa Sprint 6, métricas, KPIs, aún no hay dashboard. Es importante antes de producción.»*

Lo primero fue el inventario, y contradice a medias la frase: **sí hay tablero** —Inicio con los
cuatro avisos y el % de cumplimiento, Analítica con **siete cortes** (área, cargo, regional,
servicio, proceso, tipo, norma), Vencimientos con su eje, la medición del plan, la matriz cargo ×
inducción—. Decirle que no hay habría sido darle la razón por comodidad. Lo que faltaba eran **tres
preguntas que ningún informe contestaba**, y las tres se hicieron.

**1. El expediente de una persona — y era la Definición de Terminado del propio sprint:** *«el
auditor simulado obtiene, para una persona cualquiera, su historial completo con soportes en menos
de un minuto»*. Los datos estaban en tres pantallas: obligaciones en Asignaciones, constancias en un
cajón, papeles de terceros en otro. Contestar «demuéstrame lo de Juan Pérez» obligaba a abrir tres,
filtrar cada una y unirlas a mano, **delante del auditor y con el reloj corriendo**. Un botón
«Expediente» en cada fila de Usuarios: lo que le falta arriba, lo cumplido debajo, y los dos tipos de
soporte al final. Y es de **lectura**: no reemplaza a los dos cajones de al lado —esos son para
emitir, revocar y registrar—, porque lo que la Decisión #140 prohíbe son dos puertas a la misma
TAREA, no una vista de consulta junto a las de trabajo.

**2. La evolución en el tiempo.** Todo lo demás es una foto de hoy: contestaba «¿cómo vamos?» y no
«¿vamos mejor que en enero?», que es la del comité mensual. Se mide **lo que vencía cada mes** y
cuánto se cumplió — **no el histórico del indicador**, que nadie guardó y reconstruirlo sería
inventarlo.

**Y aquí la guía de gráficos evitó un error que no se ve a ojo.** Iban a ser tres tramos: a tiempo
verde, tarde ámbar, sin cumplir rojo. El validador de paletas lo tumbó con un número: **ámbar y rojo
están a ΔE 5,5 para un deuteranope** —y a 8,5 con visión normal—, así que en una barra apilada serían
el mismo color para una de cada doce personas. Quedan dos tramos (ΔE 26) y el «a tiempo o tarde» vive
en el detalle, con palabras. **La lección es la de siempre en este proyecto:** la parte de color es
computable, así que se computa; mirarla y decir «se distinguen» es exactamente cómo se cuela.

**3. En qué falla la gente.** Los informes decían cuántos aprobaron; ninguno **qué fallaron**, que es
lo único que se convierte directamente en un renglón del plan. Por tema y, aparte, las preguntas más
falladas — con suelo de cinco respuestas, porque sin él la peor del informe sería siempre una que
contestó una sola persona. Su lectura es doble y por eso lleva el número de respuestas al lado: una
pregunta que casi todos fallan **o no se enseñó, o está mal redactada**.

**Lo que se decidió y no se hizo:** los vídeos se quedan en **R2 y no en un canal de YouTube**. El
ahorro sería de un dólar al mes —60 GB cuestan eso— y lo que se perdería es lo que hace valioso al
producto: servir el vídeo con una **URL firmada atada a la sesión**, que es la prueba de que *esta*
persona vio *este* contenido. En un canal «no listado» el enlace lo tiene cualquiera a quien se lo
pasen, la evidencia vive en una cuenta de Google, y media logística bloquea YouTube en su red. El
precio de esa decisión es poner los subtítulos nosotros: transcripción automática, ~USD 36 una vez
por todo el catálogo, **después del despliegue**.

### 20. EN QUÉ QUEDA Y CON QUÉ SEGUIR

**Suite: 23/23 e2e y 502/502 unitarias.** Lo de evaluaciones y lo del Sprint 6 está cerrado
(`PENDIENTES` §7 y §9). Lo que queda **no es código, es del cliente**:

1. **La máquina.** Decidido: Vultr High Performance Miami, 2 vCPU / 4 GB (USD 24) + copias
   automáticas (USD 4,80), sin DDoS —Cloudflare ya lo cubre—. Qué marcar en cada casilla del
   formulario y el `cloud-init`: `docs/04-despliegue-piloto.md` §2 bis.
2. **El remoto de git** (`PENDIENTES` 6.1). Sigue siendo lo más urgente: hoy tres sesiones de
   trabajo viven en un disco, y el despliegue **clona** el repositorio.
3. **El bucket R2 y su token.** Sin eso el vídeo saldría por la máquina y su ancho de banda sería el
   techo de cuánta gente puede ver una formación a la vez.

Después del despliegue, por este orden: la **transcripción automática** (`PENDIENTES` 9.4), el
**repaso** (5.1) y la **fila por persona en Seguimiento** (5.2).

Y sigue vivo lo de siempre: **el fondo** se queda en `#dfe5ee` (§14), y el **título de Inicio con un
logro** (`PENDIENTES` 8.3) está ofrecido y sin decidir.

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

### 6 ter. LO QUE VINO DESPUÉS, MIRANDO LA PANTALLA CON EL CLIENTE

**La lista de asistencia se veía desordenada, y tenía razón.** Tres causas, las tres de maquetación:
la tabla no tenía anchos de columna, así que **el navegador los repartía según el contenido de cada
fila** —la que lleva número de certificado y clip empuja hacia un lado, la que lleva la píldora del
motivo hacia el otro— y las columnas se movían de fila en fila; la píldora del motivo iba **al lado**
del selector y ensanchaba su columna al doble de su cabecera; y las dos columnas del certificado
quedaban **en blanco** en las filas de quien no asistió, dejando media tabla vacía. Ahora: anchos
fijos, celdas alineadas arriba, el motivo **debajo** de su selector, y un guion que dice por qué esa
persona no lleva certificado. Y «Ponérselo a todos», que en `ghost` y deshabilitado parecía un
rótulo, es un botón como los otros dos de lote.

**Ya se ve quién va marcándose mientras se proyecta.** La pantalla de la convocatoria carga la lista
una vez, así que quien proyecta el código no veía entrar a nadie sin recargar — justo cuando hace
falta saber si ya están todos. La capa proyectada pregunta cada cinco segundos y dice **«Van 12 de
40»**, o «Ya se marcaron los 40» cuando no falta nadie; y al salir de la proyección, la lista de
inscritos se vuelve a pedir sola.

**Y ahora la lista dice CÓMO se marcó cada quien** —«Marcada en la lista», «Escaneó el código»,
«Firmó en pantalla»—. El dato estaba guardado desde el Sprint 5 y ninguna pantalla lo enseñaba. Para
el cumplimiento da igual por qué puerta entró la marca, y eso es deliberado; para quien revisa la
evidencia no da igual, y hasta hoy había que abrir el acta para verlo.

**Dos huecos de prueba, cerrados.** `acta-de-lista.mjs` cubre el acta de una jornada marcada **solo
por el instructor**, con ausentes y con faltas justificadas dentro —que es la que va a generar el
noventa por ciento de las actas— y comprueba lo que el cliente preguntó: que el acta no depende del
QR, porque lee la tabla donde escriben los tres mecanismos. Y `e2e/asistencia-a-mano.spec.ts` toma la
lista **por la pantalla**, con los tres iconos, incluida la justificación que exige motivo.

**Inicio habla el idioma nuevo.** «Ya vencido» y «Lo que viene» ya estaban ahí; lo que faltaba era
que dijeran las dos cifras por separado —por reconvocar y por perseguir— y que sus enlaces llevaran
**a la pestaña de Vencimientos** y no a Seguimiento con doscientas formaciones delante.

**Preferencias explica qué hace cada campo.** Eran siete números con una pista corta: «Intentos
máximos: 3» no decía qué pasa al agotarlos. Cada uno responde ahora la única pregunta que importa
—qué pasa si lo cambio— y la pantalla quedó con sus tildes.

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


