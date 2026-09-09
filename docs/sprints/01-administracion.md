# Sprint 1 — Administracion del tenant

**Fecha:** 2026-08-25 · **Commit:** `0c32af5` · **Estado:** terminado y verificado

## 1. Objetivo

Que un administrador pueda **configurar su empresa y cargar a su gente** sin que nadie toque
codigo: catalogos, personas, roles, reglas del negocio e identidad visual.

**Fuera de alcance a proposito:** el contenido formativo (Sprint 2). Aqui se construye el terreno
sobre el que despues se apoyan actividades, audiencias y reportes.

## 2. Que se construyo

### Catalogos parametrizables (los 8 maestros)
Areas, procesos, tipos de cargo, cargos, servicios, regionales, normas y tipos de actividad
formativa. CRUD completo con dos protecciones que evitan destruir historia:
- Un registro **en uso** no se puede eliminar; se desactiva.
- Un registro **del sistema** (los tipos de actividad semilla) no se elimina nunca.

Los ocho comparten un solo motor: lo que cambia entre ellos es configuracion, no codigo
duplicado. Lo mismo del lado de la interfaz.

### Personas
- Alta con los datos que exige la norma: documento, cargo, area, regional, **fecha de ingreso**
  (que despues disparara la induccion previa al inicio) y **forma de vinculacion** (directo,
  contratista, temporal, en mision — porque la induccion en SST cubre a todos).
- **Contrasena inicial generada**: patron cedula + caracteres, con un alfabeto sin letras
  ambiguas (i, l, o, 0, 1) porque en piso estas claves se dictan por telefono. Se muestra **una
  sola vez**; en la base solo queda el hash.
- Restablecer contrasena desde administracion, que ademas cierra las sesiones abiertas.
- Permisos individuales por persona y ambitos del analista.

### Carga masiva
Archivo CSV o XLSX con plantilla descargable. La regla que la hace util: **las filas validas
entran aunque otras fallen**, y el reporte dice fila por fila que paso y por que. Todo queda
registrado para auditoria, y las contrasenas generadas se pueden copiar de una vez.

### Aprobaciones del analista
El analista gestiona la formacion de su area, pero **sus cambios sobre contenido publicado
requieren aprobacion** con justificacion obligatoria. El administrador ve la solicitud, decide, y
ambos reciben notificacion.

### Notificaciones
Bandeja dentro de la plataforma y correo, sobre un patron de bandeja de salida transaccional (la
notificacion se escribe junto al cambio que la origina, y un despachador la envia despues con
reintentos). Sin clave de correo configurada, en desarrollo simula el envio.

### Sistema de diseño "Pulso"
Documentado en `.claude/skills/pulse-ui/SKILL.md`. Lo esencial:
- **El cliente pone el color, la plataforma pone la estructura.** Los colores del tenant se
  aplican a botones, enlaces activos y progreso; los fondos, textos y bordes son siempre de la
  plataforma, para que ningun cliente pueda dejar su propia interfaz ilegible.
- Tipografia Manrope + Inter, biblioteca de componentes propia, panel con barra lateral oscura.
- **Prohibicion dura de emojis** en todo el producto.

## 3. Decisiones tomadas

| Decision | Por que |
|---|---|
| **Las contrasenas generadas se muestran una sola vez** | Guardarlas recuperables seria guardar contrasenas en claro. Se entregan al administrador en el momento y se exige cambio en el primer ingreso |
| **La carga masiva no es todo-o-nada** | Un archivo de 200 personas con dos errores de digitacion no puede obligar a repetir las 200. El valor esta en el reporte por fila |
| **El codigo de un catalogo no se puede cambiar** | Los registros historicos y las reglas lo referencian. Se puede cambiar el nombre visible, nunca el codigo |
| **Los rotulos de la interfaz quedan fijos en español** | Se dejo previsto renombrarlos por cliente, pero sin pantalla: ningun cliente lo ha pedido y construirlo ahora era trabajo sin destino |

## 4. Como se verifico

- **5 pruebas de extremo a extremo en navegador real (Playwright)**, todas en verde: sesion y
  marca del tenant; crear una regional y desactivarla; crear una persona y recibir su credencial
  una sola vez; **carga masiva con una fila mala** (2 creadas, 1 con error explicado); y que la
  nota minima del tenant se guarda y persiste.
- **Prueba del flujo completo por HTTP:** crear analista, iniciar sesion con su contrasena
  generada, solicitar una aprobacion, verla como administrador, decidirla, y comprobar que ambos
  recibieron su notificacion.
- **4 pruebas unitarias** del generador de contrasenas (cumple la politica incluso con documentos
  cortos, no repite, y no usa caracteres ambiguos).
- Lint, typecheck y build en verde.

## 5. Pendiente

- **Cerrado despues (2026-08-25):** al terminar el sprint, aprobar una solicitud cambiaba su
  estado pero **no aplicaba el cambio** — el flujo estaba a medias. Se corrigio conectando el
  motor de publicacion al de aprobaciones y se verifico de punta a punta. Ver
  `02-catalogo-formativo.md`, seccion de cierre.
- Cache de permisos en Redis (rendimiento).
- Plantillas de notificacion editables desde la interfaz (hoy los textos viven en el codigo).
