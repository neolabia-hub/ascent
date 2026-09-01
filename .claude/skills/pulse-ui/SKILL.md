---
name: pulse-ui
description: Sistema de diseno "Pulso" de NEO PULSE. Cargar ANTES de construir o modificar cualquier pantalla (admin o learner). Define identidad de plataforma, tokens, tipografia, componentes, motion y las reglas duras (sin emojis, espanol, mobile-first learner).
---

# Pulso — Lenguaje visual de NEO PULSE

Identidad: una plataforma de formacion con RITMO. El "pulso" es la metafora central: el progreso
late (anillos de progreso), la racha respira, el cumplimiento avanza. Sobria y profesional para
el admin; calida, tactil y casi de app de consumo para el colaborador. NUNCA "dashboard generico
de IA": nada de gradientes morados por defecto, nada de glassmorphism gratuito, nada de emojis.

## 0. Reglas duras (no negociables)

- PROHIBIDO todo emoji o pictograma decorativo en UI, codigo, textos. Estados con TEXTO
  ("CUMPLIDO", "PENDIENTE", "VENCIDO") + color + icono lucide funcional.
- TODO en espanol. Nunca "course", "enrollment", "dashboard" visibles (usar Actividad formativa,
  Inscripcion, Inicio/Panel).
- El TENANT colorea, la PLATAFORMA estructura. Los dos colores del tenant son ACENTO —nunca
  superficie de fondo—, y NO estan al mismo nivel: hay uno principal y uno secundario.

  **--brand-primary MANDA** (Transprensa: el azul del logotipo). Es lo que dice "esto esta
  elegido, activo o es la accion": boton primario, item de navegacion activo, filtro activo,
  anillo de progreso, resaltado de seleccion. Si en una pantalla solo cabe un color de marca, es
  este.

  **--brand-accent ACOMPANA** (Transprensa: el verde del logotipo). Refuerzos puntuales y de otra
  naturaleza, que no compiten con lo activo: racha y puntos, el cursor que escribe en el ingreso,
  el halo de la tarjeta de repaso, "+50 pts". Regla practica: **los dos no aparecen a la vez
  significando lo mismo** en la misma pieza. Si el secundario empieza a marcar seleccion, ya hay
  dos colores diciendo "activo" y ninguno se lee.

  El chrome (fondos, textos, bordes, superficies de barras) es SIEMPRE de la plataforma.
  **UNICA EXCEPCION: la pantalla de INGRESO** (2026-09-01, Decision #94). Ahi el color de marca
  ocupa media pantalla y esta bien, por dos motivos que no se repiten en ningun otro sitio: no
  hay ni un dato con el que competir, y es donde la empresa se presenta —muchas veces la unica
  pantalla que alguien ve del producto antes de entrar—. Dentro, con contenido por delante, ese
  mismo color a esa escala pelea con lo que hay que leer. Si aparece la tentacion de repetirlo en
  otra pantalla, la pregunta es: ¿hay datos? Si los hay, es acento.
- Accesibilidad AA: contraste 4.5:1 en texto, targets tactiles >= 44px, focus visible SIEMPRE
  (anillo 2px offset 2px), navegable por teclado.
- Skeletons, nunca spinners de pagina completa. Estados vacios SIEMPRE disenados (titulo + una
  frase + accion), con ilustracion geometrica CSS propia (circulos/lineas), jamas stock.

## 1. Fundamentos

### Tipografia (cambiada el 2026-09-01)
- Display/titulos: **Outfit** (next/font; 500/600/700). Geometrica, de formas amplias y con
  contraste claro entre mayuscula y minuscula: en un titular grande se ve intencionada.
- Texto/UI: **Plus Jakarta Sans** (next/font; 400/500/600/700). Humanista, algo mas calida y con
  la altura de x mayor que Inter — que es lo que la hace mas legible en el telefono de bodega con
  mala luz, el caso que manda aqui. Numeros tabulares (font-variant-numeric) en tablas y metricas.
- Escala: 12 (meta), 13 (tabla densa), 14 (base UI admin), 16 (base learner), 18, 22, 28, 36.

  **POR QUE SE CAMBIARON.** Eran Manrope + Inter. Inter es la fuente mas correcta que existe para
  interfaz y tambien la mas usada del sector: no falla nunca y no dice nada. Eso era el problema —
  se reconoce como "la de todos los SaaS" y trabajaba en contra de un producto que no quiere verse
  generico. Las variables CSS conservan los nombres viejos (`--font-manrope`, `--font-inter`)
  para no tocar el config de Tailwind: los nombres mienten, las fuentes no.

### Color — capa PLATAFORMA (fija, no la toca el tenant)
```
--ink-900: #101418   (texto principal)
--ink-700: #2a3138
--ink-500: #5b6572   (texto secundario)
--ink-300: #aab3bd   (deshabilitado)
--paper:   #f7f8fa   (fondo app)         --surface: #ffffff (tarjetas)
--line:    #e5e8ec   (bordes)            --line-strong: #cdd3da
Semanticos: --ok: #1a7f4e | --warn: #b45309 | --danger: #b3261e | --info: #0b5cad
  (cada uno con fondo suave: #e7f4ed / #fdf1e2 / #fbeceb / #e8f1fa)
Dark (learner PWA, auto por prefers-color-scheme): fondo #0e1114, superficie #171b20,
  texto #e8ebee, lineas #262c33. Los semanticos suben un paso de luminosidad.
```

### Color — capa TENANT (variables inyectadas por branding)
```
--brand-primary  (Transprensa: #1f3a5f)  --brand-accent (Transprensa: #e8734a)
Derivadas en runtime: --brand-primary-soft (10% sobre superficie), --brand-primary-strong
  (hover, -8% luminosidad). Si el color del tenant no da contraste AA sobre blanco, el texto
  del boton se calcula (blanco o ink-900) — nunca confiar en que el tenant elija bien.
```

### Geometria y elevacion
- Radios: 10px (inputs/botones), 16px (tarjetas), 24px (tarjetas learner), full (pills/racha).
- Sombra de dos capas, siempre sutil: `0 1px 2px rgb(16 20 24 / .06), 0 4px 12px rgb(16 20 24 / .05)`.
  Hover de tarjeta interactiva: la segunda capa sube a 16px/.08. Nada de sombras dramaticas.
- Espaciado en escala de 4. Densidad admin: filas de tabla 40px. Learner: aire generoso (24px).

### Motion (el "pulso")
- Duraciones: 150ms (hover/focus), 220ms (aparicion, drawer), 320ms (celebracion). Easing:
  cubic-bezier(.2,.8,.2,1). Respetar prefers-reduced-motion SIEMPRE.
- Firma 1 — ANILLO DE PULSO: el progreso circular late UNA vez (scale 1 -> 1.06 -> 1) al
  completarse un item. Es LA microinteraccion de la marca.
- Firma 2 — TARJETAS QUE ENTRAN: listas con stagger de 30ms y translateY(8px) -> 0 al cargar.
- Firma 3 — RACHA: la pastilla de racha hace un latido suave al incrementar. Nunca confeti.

## 2. Las dos superficies

### Admin (escritorio primero, responsive hasta tablet)
- **EL LOGO DE LA EMPRESA VA ARRIBA DE LAS DOS BARRAS** (`components/layout/tenant-mark.tsx`,
  Decision #98). Pintaban la INICIAL del nombre en un cuadro de color, que es lo que se pone
  MIENTRAS no hay logo, no lo que se deja cuando ya lo subieron: quien entra a la plataforma de su
  empresa espera ver el logo de su empresa, y una "T" azul se lee como que la pagina no cargo del
  todo. La inicial se queda como respaldo, porque un hueco vacio se lee como algo roto.
  `object-contain` sobre pastilla blanca, nunca `cover`: un logotipo puede ser cuadrado, redondo o
  una palabra alargada, y con `cover` el primero que se subio salio cortado.
  Debajo del nombre de la empresa, "NEO PULSE" pequeno. Ese es el orden DENTRO de la aplicacion:
  quien entra trabaja en su empresa, no en NEO PULSE. Pero tiene que estar, porque si no nadie sabe
  como se llama la herramienta que usa todos los dias, que es lo que escribe en el asunto cuando
  pide ayuda. En el INGRESO el orden es el mismo y por el mismo motivo.
  Una sola pieza para las dos barras: ya se habian escrito dos veces las mismas nueve lineas.
- AppShell: la barra lateral es una **TARJETA BLANCA QUE FLOTA** (radio 24, borde --line, sombra
  de tarjeta) separada del borde por 12px, 264px, colapsable. Cambio del 2026-09-01 (Decision
  #92): era oscura (--ink-900) y partia la pantalla en dos mitades de luminosidad opuesta, asi
  que la vista saltaba cada vez que cruzaba el filo. Una tarjeta sobre papel hace lo contrario —el
  fondo pasa por detras— y ademas es el mismo lenguaje que las tarjetas del contenido: el producto
  habla un idioma, no dos.
  Item activo: relleno --brand-primary-soft con el icono en --brand-primary. Dentro de una tarjeta
  blanca, una superficie blanca no marcaria nada.
  Abajo, EL PULSO DEL PLAN: anillo de cumplimiento del ano en curso + "faltan N puntos" para la
  meta. Es el numero del que responde quien administra ante el auditor; un contador de "cosas
  creadas" se siente productivo y no le responde a nadie.
  Topbar SIN FONDO Y SIN LINEA INFERIOR desde el 2026-09-01 (Decision #98): breadcrumb,
  buscador, conmutador, campana y menu de cuenta. Era una franja blanca con filo, y ese filo no
  separaba nada — con la barra lateral ya despegada del borde, dejaba la pantalla con una esquina
  cuadrada contra un lado redondeado. Lo que separa la barra del contenido es el aire.
  Y por eso LOS TRES CONTROLES de la derecha llevan borde, superficie y sombra propios SIEMPRE
  puestos, nunca solo al pasar el raton: sobre un fondo que no es suyo, un icono suelto no se lee
  como algo que se pulsa, y en un telefono no hay "pasar por encima" que lo revele. Es la misma
  familia que en el aprendiz, y a proposito: son dos superficies, no dos productos.
  El ESQUELETO de carga dibuja ESTA pantalla, no la anterior. Se quedo pintando la barra oscura y
  la franja con filo, y cada carga ensenaba medio segundo del diseno viejo antes de saltar al
  nuevo: un esqueleto que no coincide con lo que llega es peor que no tener esqueleto.
- Contenido: max-width 1280px, titulo de pagina (display 28) + subtitulo gris + acciones a la
  derecha. Tablas densas con: busqueda, filtros como pills, orden por columna, paginacion
  "1-20 de 134". Filas con hover --paper. Estados con StatusPill (texto + punto de color).
- Crear/editar una FICHA de catalogo (nombre, area, vigencia): DRAWER lateral derecho 480px (no
  modal centrado, no pagina nueva), con formulario vertical, acciones fijas abajo (Cancelar
  fantasma / Guardar primario). Vale mientras sean campos: se rellenan mirando la tabla de atras,
  y el cajon la deja a la vista.
  **CONSTRUIR algo NO va en cajon: va a PANTALLA COMPLETA** (el editor de evaluaciones, Decision
  #84). En 480px no cabe una pregunta con sus opciones, asi que el cajon obliga a hacer scroll
  para ver lo que se acaba de escribir, y no hay sitio para la vista previa —que es lo unico que
  dice si la evaluacion quedo bien—. La linea es: rellenar campos, cajon; armar una pieza,
  pantalla.
- Formularios: label arriba (13/500), input 40px, ayuda 12 gris debajo, error --danger con
  icono; validacion en blur + on-submit. Grupos de 2 columnas maximo.

### Learner (movil primero, PWA; el 80% lo vera SOLO en celular)
- EN MOVIL, barra inferior de 4 items (Inicio, Mi formacion, Repaso, Perfil): desde el
  2026-09-01 es una **TARJETA QUE FLOTA** sobre el contenido, separada tambien por abajo
  (`bottom-3` + safe area) — pegada al filo, el gesto de "volver atras" de iOS y Android se come
  los toques del primer y del ultimo icono. Activo con relleno --brand-primary-soft.
- EN ESCRITORIO si hay barra lateral, con la misma forma de tarjeta flotante que el admin, y con
  EL PROGRESO PROPIO abajo: racha, puntos y congelaciones JUNTOS. Sueltos no se entienden —un
  numero con una llama al lado no dice que es una racha ni que se pierde manana—. Sigue siendo
  PRIVADA (Decision #23) y no habra tabla de clasificacion: en formacion obligatoria, competir por
  puntos empuja a pasar rapido, no a aprender.
- Todo es TARJETA (radio 24). La pantalla de inicio (`/hoy`) dejo de ser una lista de pendientes
  el 2026-09-01 y es una BIBLIOTECA con heroe y carruseles — ver 2.5, que manda sobre esto.
- Player de tarjetas: SUPERFICIE DE LECTURA clara y calida (`.reading-surface`), NO fondo negro.
  Se cambio el 2026-08-27: el negro a pantalla completa es el patron "stories" de una red social,
  y una tarjeta de formacion hay que entenderla, no consumirla; ademas cansa a los tres minutos.
  Columna de 720px, titulares 28-34, cuerpo 19/1.72 (`.reading-body`), cada tarjeta entra con
  `.reading-enter`. Progreso de la PIEZA = linea de 3px bajo la barra superior, no una barra
  dentro del contenido. Boton primario grande (52px). Swipe para avanzar en movil.
- REPRODUCTOR EN ESCRITORIO, tres columnas (cambio del 2026-08-28, Decision #49):
  `[carril 64px] [escenario] [indice 340px]`. El carril de la app se presenta PLEGADO a iconos y
  se despliega a mano (nunca al pasar el raton: abrirlo solo empuja el contenido mientras alguien
  lee). La barra superior de 64px lleva el nombre de la FORMACION —no el de la parte—, el avance
  total y la salida. El indice va a la DERECHA: al plegarlo el escenario crece hacia ese lado y su
  borde izquierdo no se mueve; a la izquierda, mostrarlo desplazaria el video de sitio.
  Solo se desplaza el ESCENARIO: la raiz es `h-screen overflow-hidden`, nunca `min-h-screen`.
- Renglon del indice: cuadro de 36px con el icono del TIPO, titulo, y debajo que es y CUANTO es en
  la unidad de su tipo ("Leccion · 8 tarjetas · 5 min", "Presentacion · 11 diapositivas",
  "Evaluacion · nota minima 90%"). Nunca inventar minutos que no se conocen. Completado = verde
  `--ok`; el ACTUAL = `--brand-primary` + barra de acento a la izquierda; bloqueado = candado al
  40%. Nunca el mismo tono para "hecho" y "aqui estas".
- MANDO DEL REPRODUCTOR DE DIAPOSITIVAS: una sola pieza redondeada centrada bajo la lamina
  —atras, pista continua, posicion, adelante—, no un boton de ancho completo. La pista se
  PREVISUALIZA al pasar por encima (la lamina asoma sobre el cursor con su numero): sin eso, una
  pista continua obliga a ir de una en una. En la ultima lamina la flecha de avanzar SE CONVIERTE
  en el boton de cierre dentro del mismo mando, con el latido de apertura; nunca un segundo boton
  al lado.
- UN INDICADOR DE AVANCE POR PREGUNTA, y solo uno. El anillo del indice dice cuanto se lleva de la
  FORMACION y late al completar una parte; dentro del escenario, cada tipo ensena su avance en su
  propia unidad (pista en presentacion, riel de tramos en leccion, relleno del boton en video).
  Tres barras midiendo lo mismo informan menos, no mas.
- BOTON: la profundidad es de oficio, no decorativa —realce interior arriba, elevacion al pasar,
  hundido real al pulsar (`--shadow-btn`, `--shadow-btn-hover`, `--shadow-btn-active`)—.
  `Button.meterPct` convierte el boton en su propio medidor cuando la accion todavia no esta
  disponible: se rellena con el avance y se abre con un latido al llegar.
- La barra superior del reproductor va `flush`: sin borde ni fondo propios. Solo lleva borde donde
  el contenido pasa POR DEBAJO de ella.
- Paneles laterales: `.scroll-hidden` (se desplazan, no ensenan barra).
- Las pestanas del escenario son PASTILLAS con icono, alineadas a la izquierda con el contenido,
  sin linea divisoria: entre el escenario y ellas va un degradado que se apaga. El material multimedia
  lleva alto acotado (68vh) para que un video vertical no ocupe tres pantallas.
- Debajo del escenario, pestanas FIJAS con contenido de la pieza actual: Resumen (de que va, que
  se exige para darla por vista, de que proceso y norma sale) y Material de apoyo (los documentos
  de la formacion). Fijas para que se aprenda donde esta cada cosa; su contenido cambia con la
  pieza para que no sean los datos de la formacion repetidos siete veces.
- En MOVIL no hay carril ni indice: la barra superior se queda (titulo y salida) y el contenido
  ocupa el ancho. La inmersion sigue siendo la regla donde la pantalla no da para mas.
- Examenes: una pregunta por pantalla, opciones como tarjetas de 60px con letra A/B/C al
  principio, estado correcto/incorrecto con color de fondo, no solo icono. El examen SI se
  presenta a pantalla completa, sin indice ni material a la vista (Decision #50): mide, y tener el
  contenido al lado lo convertiria en un examen a libro abierto. La encuesta de satisfaccion, que
  no mide a nadie, si ira bajo el contenido como una pestana mas.
- Barra superior del aprendiz, rehecha el 2026-09-01 (Decision #92). **TRES ZONAS**: saludo |
  buscador (centro) | acciones. Antes eran dos —saludo pegado a la izquierda y todo lo demas
  amontonado a la derecha— y en un monitor ancho quedaba un vacio enorme en medio con el bloque de
  la persona flotando lejos de las dos esquinas.
  **SIN FONDO, y por eso NO ES FIJA.** Se quito el velo difuminado; sin fondo y pegada, el saludo
  se leia encima de las tarjetas al bajar. Las salidas eran devolverle el velo o que no se pegue:
  se eligio lo segundo. La navegacion no se pierde —vive en la barra lateral, que si esta fija— y
  el buscador sigue a un Ctrl K.
  Los TRES controles de la derecha son la misma familia: borde, superficie y sombra propios
  siempre puestos, y se levantan al pasar. Un icono suelto sobre una portada no se lee como boton,
  y en un telefono no hay "pasar por encima" que lo revele.
  El CONMUTADOR DE ESPACIO dice donde estas Y a donde puedes ir: plegado son dos iconos, y al
  pasar o enfocar se abre a lo ancho con los dos nombres, el actual marcado y sin enlace. Un solo
  rotulo intentando decir las dos cosas era lo que confundia. El nombre accesible del enlace dice
  la ACCION ("Ir a mi formacion"), no donde estas.
  El REPRODUCTOR lleva barra y carril propios desde el 2026-08-28 —ver arriba—: no los del resto
  de la aplicacion, sino unos reducidos a lo que hace falta para saber donde se esta.
- Examenes: una pregunta por pantalla, opciones como tarjetas seleccionables 56px, feedback
  inmediato solo si la politica lo permite.

#### Como esta implementado (Sprint 4) — respetarlo al agregar pantallas
- Tres grupos de rutas: `(admin)` panel, `(learner)` barra inferior + cabecera, `(player)` con
  su chrome propio (`components/modules/learner/player-chrome.tsx`). Los tres comparten sesion;
  el player monta la suya, no la del grupo `(learner)`.
- El modo oscuro se activa SOLO bajo `.learner-surface` (clase en la raiz de cada pantalla del
  aprendiz), nunca en `:root`: el admin se presenta en claro y no debe cambiar de color porque el
  portatil de turno tenga el sistema en oscuro. Toda pantalla nueva del aprendiz lleva esa clase.
- Contenedor movil: `max-w-md` centrado, `px-5`, y `pb-24` en el main para que la barra inferior
  no tape el ultimo elemento. La barra respeta `env(safe-area-inset-bottom)`.
- Progreso de una pila (tarjetas, preguntas): segmentos de 1px de alto en fila, patron stories.
  Los completados en `--brand-primary` (o `--brand-accent` sobre fondo oscuro); el resto en
  `--line`.
- Selector de dos vistas (p. ej. Pendiente / Historial): pastillas dentro de un carril
  `rounded-full bg-paper p-1`, la activa con `bg-surface` y sombra de tarjeta. Alto 44px.
- Aviso de "sin conexion": franja fija arriba, `--warn`, `role="status"`. Siempre dice que se
  puede seguir y que el avance no se pierde. Nunca un modal que bloquee.

## 2.5 "Hoy": una BIBLIOTECA, no una lista (2026-09-01, Decision #89)

La pantalla a la que el colaborador entra cada dia era una lista de pendientes: correcta y triste.
Nadie abre por gusto una lista de obligaciones; todo el mundo abre una biblioteca. El contenido es
el mismo — lo que cambia es si da ganas de entrar.

- **HEROE** a sangre horizontal, esquinas muy redondeadas (28px), con la portada de la formacion y
  dos degradados: uno vertical que asienta el texto y otro lateral que deja sitio al bloque sin
  aplanar la foto. Se elige la formacion EMPEZADA sobre la mas urgente: abandonar algo a medias es
  el patron que mas mata la constancia.
- **CHIPS DE FILTRO POR ESTADO, no por tipo.** "Induccion" o "Alturas" es como lo clasifica quien
  administra; la pregunta de quien entra a las 6 de la manana es otra: *"¿que hago hoy?"*. Por eso
  arriba se filtra por lo que decide —Todo / En curso / Vence pronto / Sin empezar, cada uno con su
  numero— y el TIPO se usa mas abajo, para agrupar las filas, que es donde clasificar si ayuda a
  encontrar. El chip activo lleva --brand-primary.
- **FILAS (carruseles) `.rail`**: "Continua donde ibas", "Vence pronto", y luego una por tipo. Se
  arrastran con el dedo y con flechas que aparecen al pasar solo en escritorio.
- **TARJETA ANCHA (250-280px), no caratula estrecha.** Se probo con poster 2:3 de 150px y no
  servia: ahi no cabe mas que el titulo, y aqui la decision no se toma por la imagen —una foto de
  bodega no distingue una formacion de otra— sino por lo que dice al lado: tipo, duracion,
  vencimiento y **los puntos que gana**. Los puntos VIAJAN DESDE EL SERVIDOR: prometer 50 y dar 30
  seria peor que no prometer nada.
- **LA TARJETA DE REPASO tiene forma propia.** No es una formacion y no puede parecerlo: no tiene
  portada, no se "termina" y dura tres minutos. Banda ancha con halo --brand-accent y las preguntas
  dibujadas como fichas apiladas — convierte un numero en algo que se ve.
- **EL FONDO SIGUE EL TEMA.** La primera version pintaba esta pantalla oscura siempre con paleta
  propia: se veia bien y estaba mal —el aprendiz ya tiene claro y oscuro, y una pantalla que se los
  salta deja el producto con dos criterios—. Lo cinematografico lo pone la PORTADA con su
  degradado, que es una foto y funciona igual sobre blanco que sobre negro.

### Portadas de formacion (Decision #88)

DOS CAPAS, y el orden importa:

1. **Siempre hay una portada GENERADA** (`components/modules/activity-cover.tsx`): patron
   determinista a partir del id de la actividad, con el color de su tipo. La misma formacion se ve
   igual en el catalogo del aprendiz, en el del administrador y entre sesiones — la gente acaba
   reconociendola por su color antes que por su nombre.
2. **Si alguien subio una foto, esa manda**, y se pinta ENCIMA de la generada.

Nunca al reves. Si la foto fuera obligatoria, el primer dia media biblioteca estaria en gris —el
analista de SST no es fotografo— y habria un requisito estetico delante de publicar una
capacitacion obligatoria. `coverKey` vive en la ACTIVIDAD, no en su version: una foto no es
evidencia, asi que cambiarla no puede costar publicar de nuevo.

## 2.6 La pantalla de INGRESO (2026-09-01, Decision #94)

Es la unica del producto donde el color de marca ocupa superficie grande — ver la excepcion en las
reglas duras. Partida en dos, a sangre:

- **Lado de la marca**: color --brand-primary a sangre, dos manchas `.aurora-a` / `.aurora-b` que
  respiran muy despacio (22-26s: tiene que notarse que respira, no que se mueve), el logo del
  tenant y **EL PULSO** —anillos concentricos que laten—, que
  es la Firma 1 de esta marca. Ahi hubo tres filas de icono y frase y se retiraron: es el recurso
  de todas las paginas de producto y no decia nada que el parrafo no dijera ya. Tambien hubo una
  reticula de cuadros al 6% y se quito por lo mismo: no se veia como textura sino como cuadricula,
  y sobre un color plano lo unico que hacia era llamar la atencion sobre si misma.
- **Frase que se escribe sola + descripcion fija debajo.** NO son saludos: "bienvenido" rotando no
  informa y a la tercera vez cansa. Son frases de lo que la plataforma hace por quien entra, que es
  la pregunta real de alguien que recibe un usuario y no sabe para que. La descripcion quieta es
  obligatoria: una frase que cambia sola sin nada fijo al lado se lee como un eslogan.
  Se apaga con `prefers-reduced-motion`, el bloque es `aria-hidden` y debajo va el texto completo
  en `sr-only` — un parrafo que se reescribe solo es de lo peor para quien navega escuchando.
- **Lado del formulario**: tarjeta elevada sobre papel, NO blanco plano de borde a borde —al lado
  de un panel con profundidad, esa mitad se lee como el hueco que queda—. En movil sin tarjeta: ahi
  el formulario ya ocupa la pantalla.
- **Campos con icono dentro** y **borde aurora** al enfocar (`.aurora-focus`). El anillo NO gira:
  rotar el pseudo-elemento rota tambien su mascara y el anillo sale disparado cruzando la pantalla.
- **Ver la contrasena**: teclear a ciegas una generada de catorce caracteres, en un telefono y con
  prisa, es la primera causa de intento fallido — y cinco fallidos bloquean la cuenta.
- **El logo llega YA FIRMADO** del endpoint publico: esta pantalla no tiene sesion para pedir la
  firma. Se pinta con `object-contain` sobre pastilla blanca, nunca `cover`: un logotipo puede ser
  cuadrado, redondo o una palabra alargada, y con `cover` el primero que se subio salio cortado.
- Lo que NO se copia de las referencias de login al uso: foto de banco de imagenes, "Sign Up"
  (aqui nadie se registra solo) y "entrar con Google" (no existe ese proveedor). Poner botones que
  no llevan a ninguna parte para parecerse a un pantallazo de Dribbble es peor que no adornar.

## 2.65 La consola de PLATAFORMA (2026-09-01, Decision #100)

`/plataforma` y `/plataforma/login` son del PROVEEDOR, no de ningun cliente, y tienen que notarse
distintas. Es lo contrario del ingreso de los clientes —color de marca a media pantalla, logo, el
pulso latiendo— y a proposito: aquel es donde una empresa se presenta ante su gente; esta la abren
dos personas que ya saben donde estan. Adornarla igual solo conseguiria que las dos pantallas se
confundieran, y confundirlas es lo unico que no puede pasar: aqui se entra con credenciales que
administran a todos los clientes a la vez.

- **SOBRIA.** Tinta de plataforma y nada mas. **No hay colores de tenant porque no hay tenant**:
  las variables de marca ni siquiera estan inyectadas en esta ruta, asi que usar --brand-primary
  aqui daria el color por defecto del sistema y no el de nadie. Marca de agua propia: escudo sobre
  --ink-900 y el rotulo PLATAFORMA bajo el nombre del producto.
- **La advertencia va ARRIBA de los campos**, no debajo en letra pequena: es lo que cambia lo que
  la persona escribe. Un texto mal puesto aqui no ensucia una pantalla — ensucia la de TODOS los
  clientes sin contacto propio a la vez.
- **Sin "No puedo entrar".** En los clientes ese enlace lleva a quien administra su empresa; aqui
  no hay nadie por encima. La vuelta es un script del servidor, y anunciarlo en la pantalla seria
  contar por donde se rehace la cuenta que manda sobre todo.

## 2.7 El ESCENARIO del examen (Decision #85)

`components/assessments/exam-stage.tsx` lo usan DOS pantallas: el reproductor real y la vista
previa del administrador mientras arma la evaluacion. **Nunca duplicar esta pieza**: si fueran dos
implementaciones, la vista previa mentiria en cuanto una cambiara — y una vista previa que miente
es peor que no tenerla, porque se publica confiando en ella.

- No recibe puntos de ruptura sino la prop `wide`: tiene que poder pintarse dentro de un marco de
  telefono de 390px DENTRO de un monitor de 1600, donde un `lg:` creeria que hay sitio para el
  panel lateral.
- La correcta se ve VERDE DE ACIERTO en el editor y el color de acento marca "lo que eligio quien
  responde". Son dos cosas distintas y si compartieran color, al revisar un examen ajeno no habria
  forma de distinguirlas.
- COMO SE VE el examen (acento, transicion, ritmo, auto-avance) se configura por evaluacion y vive
  en la EVALUACION, no en su version: el color no es evidencia.

## 2.8 Utilidades de movimiento (globals.css)

Todas mueren solas con `prefers-reduced-motion` por la regla global del final del archivo.

| Clase | Para que |
|---|---|
| `.rail` | Fila que se desplaza en horizontal, sin barra a la vista. Lo que orienta en un carrusel es la tarjeta cortada contra el borde, no una barra |
| `.poster` | La tarjeta se levanta al pasar. 200ms: por debajo se siente nerviosa, por encima lenta |
| `.stage-in` | Entrada escalonada de una fila; el retraso lo pone cada tarjeta con `animationDelay` |
| `.aurora-a` / `.aurora-b` | Manchas de color que respiran (22-26s). Solo en el ingreso |
| `.aurora-focus` | Borde de marca en un campo enfocado. Se insinua al pasar, se enciende al enfocar |
| `.ex-next` / `.ex-prev` / `.ex-fade` | Transicion entre preguntas del examen, direccional |
| `.ex-option` | Las opciones entran escalonadas 45ms |
| `.reading-enter` | Entrada de tarjeta en la superficie de lectura |

## 3. Componentes con receta propia

- **Button `glow`** (2026-09-01, Decision #98): la sombra no es gris, es del COLOR del boton y muy
  difusa, asi que parece encendido en vez de recortado. Sale de una referencia que trajo el
  cliente, y es lo unico de aquella pantalla que se sostiene —la ilustracion 3D comprada, "Sign
  Up" y "entrar con Google" no aplican a un producto donde nadie se registra solo—.
  **UNO POR VISTA.** Va en la llamada principal de una tarjeta o de una pantalla ("Ingresar",
  "Empezar ahora", el repaso). Si brillan todos, no destaca ninguno, que es justo lo contrario de
  para lo que sirve.
  El color se hereda de `--brand-primary`; con `--glow-color` se cambia por pieza —el repaso lo
  pone en el secundario, porque el repaso es de ese color en todo el producto—.
  Sobre una FOTO el boton se queda BLANCO y solo el halo lleva color: encima de una portada
  cualquiera, el blanco es lo unico que se lee igual siempre, y el halo es lo que lo despega del
  fondo sin robarle contraste al texto.

- **StatusPill**: punto 6px + etiqueta MAYUSCULAS 11/600 tracking .04em. CUMPLIDO=ok,
  PENDIENTE=warn, VENCIDO=danger, BORRADOR=ink-300, PUBLICADA=info, BLOQUEADO=danger.
- **AnilloProgreso**: SVG stroke 8, fondo --line, avance --brand-primary, % en display 600
  al centro. Variante mini 20px para filas de tabla.
- **PastillaRacha**: pill con icono flame (lucide) + numero; SOLO visible para el propio
  usuario (decision #23: la racha es privada).
- **EvidenciaDoc**: actas y certificados usan estetica DOCUMENTAL diferenciada: fondo blanco
  puro, borde --line-strong, tipografia con serifa opcional en el titulo del certificado,
  numero de serie y QR visibles. Que se sienta "documento oficial", no tarjeta de app.
- **EmptyState**: circulo de 96px con icono lucide 32 sobre --brand-primary-soft, titulo 16/600,
  texto 14 gris, boton de accion si aplica.
- **Toast**: esquina inferior derecha (admin) / superior (movil), 3.5s, con icono semantico.
- Base tecnica: shadcn/ui + Radix + Tailwind con tokens de arriba como CSS variables en
  globals.css. Iconos lucide-react stroke 1.75, tamano 16 (admin) / 20 (learner).

## 4. Dataviz (reportes)
- Recharts. Un color de serie principal = --brand-primary; comparaciones con --ink-500 y
  --brand-accent. Semaforos SOLO con los semanticos. Sin degradados, sin 3D, sin donut de mas
  de 5 segmentos. Ejes 12px --ink-500, grid horizontal --line punteado. Tooltip = tarjeta
  estandar. Toda cifra clave va en StatTile: valor en display 28/800 + delta con flecha lucide.

## 5. Voz y texto
- Tono: directo, profesional, calido en learner ("Te falta 1 actividad esta semana"), neutro
  en admin. Sin signos de exclamacion dobles, sin jerga tecnica visible.
- Fechas: "25 ago 2026" (es-CO). Horas 12h con a. m./p. m. Numeros con separador de miles.
- Botones: verbo + objeto ("Crear actividad", "Guardar cambios"). Nunca "OK"/"Si" solos en
  confirmaciones destructivas: repetir el objeto ("Eliminar regional").
