# Pendientes

Todo lo que está abierto, en un solo sitio. **Se corrige**: cuando algo se hace, se borra de aquí y
se cuenta en el HANDOFF de esa sesión — al revés que el diario, que solo se anexa.

Existe porque los pendientes estaban repartidos entre siete documentos —el HANDOFF de cada sesión,
`00-el-motor.md` §9, `08-evidencia.md` §10, `seguimiento.md` §11, `05-cumplimiento.md`— y para saber
qué falta había que leerlos todos. Cada punto dice **dónde está el detalle**, para no repetirlo.

Al 2026-09-06.

---

## 1. Bloquea al cliente / se nota en la pantalla

| | Qué falta | Detalle |
|---|---|---|
| 1.1 | **La UI de la lista de asistencia**: una columna de más sin nombre, los selectores sin mejorar, poder corregir a los ya marcados, orden y filtros | `RUNBOOK` 2026-09-06 (cierre), puntos 1-4 |
| 1.2 | **Las descripciones largas, en toda la aplicación** → icono de información que las despliegue. Es un cambio del sistema de diseño, no de una pantalla | `RUNBOOK` 2026-09-06 (cierre), punto 5 |
| 1.3 | **«Datos de la jornada» se quedó estrecho** al quitar la tarjeta del plan: debe ocupar el ancho completo cuando no hay plan, y va siempre encima de «Faltan por convocar» | `RUNBOOK` 2026-09-06 (cierre), punto 6 |
| 1.4 | **«La acredita un tercero» con dos opciones en vez de tres**, sin perder la herencia (no mandar el campo mientras nadie lo toque) | `RUNBOOK` 2026-09-06 (cierre), punto 7 |

## 2. La evidencia, que quedó a medio camino

| | Qué falta | Detalle |
|---|---|---|
| 2.1 | **Subir el archivo**: el PDF del certificado externo y el acta escaneada. Las columnas existen (`ext_cert_file_key`, `offerings.attendance_sheet_key`) y la API las acepta; falta la pantalla | `08-evidencia.md` §10.1 |
| 2.2 | **La segunda puerta**: añadir el papel desde la ficha de la persona cuando llega días después de la jornada. Hoy hay que volver a la convocatoria | `08-evidencia.md` §10.2 |
| 2.3 | **Quien llega con un certificado de otro empleo** (vía C sola, sin jornada) no tiene por dónde registrarse | `08-evidencia.md` §10.3 |
| 2.4 | **Los mecanismos 2 y 3 de la asistencia**: QR de sesión y firma en pantalla con acta PDF. Los dos diseñados, con su sitio en el modelo (`offerings.session_code`, `SessionAct`) y su valor en el enum. Con ellos llega `attendance:sign`, que CLAUDE.md nombra y `permissions.ts` todavía no tiene | `08-evidencia.md` §10.4, CLAUDE.md §3.7 |

## 3. El informe de Vencimientos, que hoy enseña media verdad

| | Qué falta | Detalle |
|---|---|---|
| 3.1 | **Lee `certification_grants`, que no escribe nadie**, así que su serie de «Certificación» sale siempre en cero. Ya tiene con qué llenarse: `certificates.valid_until` y `assignments.valid_until_override` | `seguimiento.md` §7 quater |
| 3.2 | **Y su EJE está mal, no solo su fuente.** Separa por *de dónde sale el dato* en vez de por *«¿ya la tuvo o nunca?»* — perseguir frente a reprogramar. Con el eje de hoy, quien está en su ventana de 60 días saldría en las **dos** series | `seguimiento.md` §7 quater |
| 3.3 | **Nadie recibe nada**: el informe existe y hay que acordarse de entrar a mirarlo, que es el problema que venía a resolver. Será **notificación interna** al jefe o a los encargados de SST — no correo, decisión del cliente | `HANDOFF` 2026-09-05 |

## 4. El motor, con cosas anotadas y medidas

| | Qué falta | Detalle |
|---|---|---|
| 4.1 | **Una formación exigida por DOS reglas vivas le nace dos veces a la misma persona.** Solo posible en tipos de alcance `MANUAL`; con `BY_JOB_TITLE` es imposible. Lo CUMPLIDO ya no se repite, pero dos obligaciones vivas siguen naciendo. No se ha visto en la práctica | `00-el-motor.md` §9.3 |
| 4.2 | **La primera ronda de una campaña no cae en la fecha de la campaña.** Decisión del cliente, pendiente de tomar | `00-el-motor.md` §9.1, `03-reinduccion.md` |
| 4.3 | **La campaña alcanza a quien acaba de ingresar** y todavía no terminó su inducción | `00-el-motor.md` §9.2 |
| 4.4 | **La constancia propia y el papel del tercero llevan fechas de vigencia distintas.** Es coherente —son dos documentos que dicen dos cosas— pero si un cliente lee la constancia como si acreditara la habilitación, para él será un error. Anotado como algo que mirar, no como fallo | `08-evidencia.md` §10.6 |

## 5. Producto, esperando al cliente

| | Qué falta | Detalle |
|---|---|---|
| 5.1 | **Repaso / «volver a verlo»**: dejar que alguien repita una formación para reforzar, sin tocar los indicadores. El motor de repetición espaciada ya existe (`spaced-repetition.ts`, Decisión #22). El cliente tiene preguntas antes de decidir | `HANDOFF` 2026-09-05 |
| 5.2 | **Una fila por persona en Seguimiento, no por ronda.** Decidido: por persona, pero **después** del informe por periodo del Sprint 6 — cambiar el grano antes obligaría a rehacerlo | `HANDOFF` 2026-09-04 |
| 5.3 | **La matriz de vigencias del trabajador** —exámenes médicos, licencias, EPP— como módulo aparte y cotizado aparte, cuando haya un cliente que lo pida | `HANDOFF` 2026-09-05 |

## 6. Operación

| | Qué falta | Por qué importa |
|---|---|---|
| 6.1 | **No hay remoto en git.** `git remote -v` está vacío: los commits protegen contra editar mal un archivo, **no contra que muera el disco**. Es lo más urgente de la lista y no es técnico | — |
| 6.2 | **Limpiar los datos de prueba** que dejaron los recorridos y los `demo-asistencia`. Se borran por prefijo (`E2E…`, `DEMO…`) | `RUNBOOK` 2026-09-03 |
| 6.3 | **Un aviso de lint de siempre** en `new-offering-drawer.tsx` (dependencia `autoPlan` de un `useEffect`). No es nuevo y no rompe nada | — |

---

## Lo que NO está pendiente, para no volver a abrirlo

Cosas que se decidieron y conviene no reabrir sin motivo nuevo:

- **Los siete tipos** tienen recorrido en verde, y `estandar.mjs` cubre sola los que cree el cliente.
- **Cómo se cierra una jornada** se pregunta, no se deduce (#158). La regla derivada se rompió dos
  veces; no hace falta una tercera.
- **La constancia interna la decide el tipo** (#159): el papel de un tercero no la suprime.
- **`executedBy` vive en la convocatoria**, no en la formación: cambia por jornada. Se hereda de la
  anterior, sin bloquear.
- **La asistencia vive en `attendance_records`**, la tabla que ya existía desde el Sprint 0.
- **Recertificación** es la competencia del puesto **que caduca**; quién emite el papel es otro eje.
