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
- El TENANT colorea, la PLATAFORMA estructura: los colores del tenant (--brand-primary,
  --brand-accent) se aplican SOLO a: boton primario, enlaces activos, anillo de progreso,
  resaltados. El chrome (sidebar, fondos, textos, bordes) es SIEMPRE de la plataforma.
- Accesibilidad AA: contraste 4.5:1 en texto, targets tactiles >= 44px, focus visible SIEMPRE
  (anillo 2px offset 2px), navegable por teclado.
- Skeletons, nunca spinners de pagina completa. Estados vacios SIEMPRE disenados (titulo + una
  frase + accion), con ilustracion geometrica CSS propia (circulos/lineas), jamas stock.

## 1. Fundamentos

### Tipografia
- Display/titulos: **Manrope** (next/font, self-hosted; pesos 500/600/800). Titulos en 600-800,
  tracking -0.01em.
- Texto/UI: **Inter** (next/font; 400/500/600). Numeros tabulares (font-variant-numeric) en
  tablas y metricas.
- Escala: 12 (meta), 13 (tabla densa), 14 (base UI admin), 16 (base learner), 18, 22, 28, 36.

### Color — capa PLATAFORMA (fija, no la toca el tenant)
```
--ink-900: #101418   (texto principal, sidebar admin)
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
- AppShell: sidebar OSCURA (--ink-900) 248px colapsable a 64px, con logo del tenant arriba y
  navegacion por secciones (Inicio, Contenido formativo, Convocatorias, Plan, Personas,
  Aprobaciones, Reportes, Configuracion). Item activo: barra de 3px --brand-accent + texto
  blanco. Topbar clara 56px: breadcrumb, buscador global (Ctrl+K, fase posterior), campana de
  notificaciones, menu de usuario.
- Contenido: max-width 1280px, titulo de pagina (Manrope 28) + subtitulo gris + acciones a la
  derecha. Tablas densas con: busqueda, filtros como pills, orden por columna, paginacion
  "1-20 de 134". Filas con hover --paper. Estados con StatusPill (texto + punto de color).
- Crear/editar catalogo: DRAWER lateral derecho 480px (no modal centrado, no pagina nueva),
  con formulario vertical, acciones fijas abajo (Cancelar fantasma / Guardar primario).
- Formularios: label arriba (13/500), input 40px, ayuda 12 gris debajo, error --danger con
  icono; validacion en blur + on-submit. Grupos de 2 columnas maximo.

### Learner (movil primero, PWA; el 80% lo vera SOLO en celular)
- Sin sidebar: barra inferior de 4 items (Inicio, Mi formacion, Repaso, Perfil), 56px + safe
  area. Header simple con saludo y pastilla de racha.
- Todo es TARJETA (radio 24): "Pendientes" arriba (con due date y barra de progreso fina),
  luego "Tu repaso de hoy" (pildora de 3-5 min, un tap), luego historial.
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
- Barra superior del aprendiz: saludo a la izquierda; buscador, avisos y menu de cuenta a la
  derecha. La racha vive en el menu de cuenta. El REPRODUCTOR lleva barra y carril propios desde
  el 2026-08-28 —ver arriba—: no los del resto de la aplicacion, sino unos reducidos a lo que hace
  falta para saber donde se esta. La regla vieja ("ningun elemento de navegacion mientras se
  cursa") costaba mas de lo que ahorraba en una formacion de siete partes.
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

## 3. Componentes con receta propia

- **StatusPill**: punto 6px + etiqueta MAYUSCULAS 11/600 tracking .04em. CUMPLIDO=ok,
  PENDIENTE=warn, VENCIDO=danger, BORRADOR=ink-300, PUBLICADA=info, BLOQUEADO=danger.
- **AnilloProgreso**: SVG stroke 8, fondo --line, avance --brand-primary, % en Manrope 600
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
  estandar. Toda cifra clave va en StatTile: valor Manrope 28/800 + delta con flecha lucide.

## 5. Voz y texto
- Tono: directo, profesional, calido en learner ("Te falta 1 actividad esta semana"), neutro
  en admin. Sin signos de exclamacion dobles, sin jerga tecnica visible.
- Fechas: "25 ago 2026" (es-CO). Horas 12h con a. m./p. m. Numeros con separador de miles.
- Botones: verbo + objeto ("Crear actividad", "Guardar cambios"). Nunca "OK"/"Si" solos en
  confirmaciones destructivas: repetir el objeto ("Eliminar regional").
