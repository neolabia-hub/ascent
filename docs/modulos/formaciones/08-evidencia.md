# Las tres vías de evidencia

*Cómo consta que una persona cumplió. Documento común a todos los tipos, como `00-el-motor.md`.*

Verificado de punta a punta por `scripts/recorridos/asistencia.mjs` (12 pasos, seguimiento
incluido). Decisión #157, del 2026-09-05.

---

## 1. El agujero que cierra

Hasta el 2026-09-05 una formación solo se podía dar por cumplida de **una** forma: la persona
entrando a la plataforma y completando el contenido. `CompletionService.evaluate` —lo único que
cerraba una obligación— solo lo llamaban el reproductor y los intentos de examen, los dos del lado
del aprendiz. No existía ningún camino de administrador.

En una empresa bajo SG-SST la mayor parte del plan anual se dicta **en salón**: charlas de seguridad
vial, manejo defensivo, brigadas, lo que trae la ARL. De eso no queda contenido que completar —
queda una **lista de asistencia firmada**, que es la evidencia que pide el auditor.

Así que todo lo dictado presencialmente contaba como incumplido. Y encima de esa capa está
construido todo lo demás: los siete tipos, el plan con sus proyectados y sus tajadas, la cobertura,
las constancias, el Seguimiento. **El indicador de cumplimiento, que es la razón de ser del
producto, enseñaba cero de todo lo que de verdad se hizo.**

## 2. Las tres vías

| | Cuándo | Qué queda registrado |
|---|---|---|
| **A. En plataforma** | contenido + examen, la persona entra sola | progreso, nota, constancia propia |
| **B. Lista de asistencia** | jornada con fecha, la dicte quien la dicte | quién asistió, quién no, y quién lo marcó |
| **C. Papel de un tercero** | el certificado lo emite un organismo acreditado | entidad, número, expedición, **vencimiento**, escaneo |

Las tres cierran **la misma obligación** y valen lo mismo para el indicador. Y se combinan:

- Inducción general virtual → **A**
- Capacitación del plan que dicta la ARL y no certifica nada → **B sola**
- Recertificación de montacargas con la ARL → **B + C**
- Quien llega con un certificado vigente de otro empleo → **C sola** (todavía no implementado: ver §8)

**No van atadas al tipo de formación.** Es la respuesta a «¿cómo consta que cumplió?», y cada
empresa la contesta distinto según la formación. Atarlo al tipo habría dejado fuera la mitad de los
casos reales.

## 3. La asistencia va con el `kind`, no con la modalidad

Es la pregunta que parece obvia y no lo es.

| | Se cierra por | Por qué |
|---|---|---|
| `EVENT` | **asistencia** | tiene fecha, cupo y alguien que convoca. Hay una lista de quién estuvo, y no queda contenido completado en la plataforma |
| `PERMANENT` | **la plataforma** | la persona entra sola cuando puede; la evidencia es justamente lo que el sistema registró |

Atarlo a `PRESENCIAL` habría dejado fuera el **webinar de la ARL**, que es cada vez más común: una
jornada virtual en vivo también tiene lista de asistentes y tampoco deja rastro en el reproductor.
Una convocatoria permanente rechaza la lista con **409 `OFFERING_NOT_ATTENDABLE`**.

## 4. Cerrar por asistencia no pasa por `evaluate`, y eso hay que registrarlo

`evaluate` recalcula desde los hechos guardados en la plataforma: contenidos vistos y exámenes
aprobados. Para una jornada de salón esos hechos no existen ni van a existir —el temario lo dio un
instructor y el examen, si lo hubo, lo puso en papel— así que llamarla siempre respondería «faltan
contenidos». **No es un atajo alrededor de la regla: es que la evidencia es otra.**

Lo comprueba el recorrido con el caso más duro: la formación es de tipo Recertificación, que
**exige evaluación**, y nadie responde el examen en la plataforma. La obligación queda igualmente
CUMPLIDA.

Y por eso cerrar así **salta la evaluación que el tipo exige**, que es exactamente lo que un auditor
cuestionaría. Queda `enrollments.attendance_by` —quién respondió por ello— además de la fila de
auditoría `OFFERING_ATTENDANCE_MARKED`. Sin eso sería una puerta trasera para dar por cumplido lo
que no se hizo.

## 5. Quien no vino la sigue debiendo

`attended: false` **es un dato, no un hueco**: «convocado y NO vino» es lo que hay que poder
demostrar, y es distinto de «todavía no lo hemos revisado».

No se cierra nada y **no se retira la obligación**: la sigue debiendo, que es el punto entero de
tomar asistencia. Medido en los pasos 8 y 9 del recorrido: de dos convocados, uno queda CUMPLIDO y
el otro sigue PENDIENTE.

En la pantalla **todos empiezan marcados como presentes**. Lo normal es que quien fue convocado
asista, y en una lista de cuarenta eso obliga a desmarcar tres en vez de marcar treinta y siete.

## 6. Con papel de un tercero no se emite constancia propia

Dos papeles con dos números para un mismo hecho es peor, en una auditoría, que no tener ninguno. El
documento que vale es el del organismo acreditado.

Al revés —una charla presencial que **no** certifica nada, la de seguridad vial de la ARL— la
constancia propia **sí** se emite: es la única evidencia que le queda a la persona. Las dos mitades
están medidas: paso 10 (con papel, ninguna constancia) y paso 5 (sin papel, cierra igual).

## 7. El papel manda

Es la única parte con consecuencias sobre el motor, y contradice a propósito una regla anterior.

La regla general (Decisión #111) es que **la vigencia sale de la recurrencia**: si hay que repetirla
cada 12 meses, la constancia vale 12 meses, y pedir la vigencia aparte sería pedir el mismo dato dos
veces y garantizar que algún día no coincidan.

La excepción es el certificado de un tercero, y no es una preferencia: **la fecha no la pone la
empresa**. Si la ARL certifica en alturas por tres años y el tipo dice doce meses, reclamarla al año
es inventar un incumplimiento sobre alguien que tiene su habilitación vigente y el papel para
probarlo.

```
proximoVencimiento(recurrencia, ronda, respaldo)     due-date.ts
  1. si hay validUntilOverride  -> ESA fecha         el papel
  2. si es campaña              -> desde su dueAt    el periodo
  3. si es aniversario          -> desde completedAt la persona
```

La fecha se copia del certificado a **`assignments.valid_until_override`** y no se queda solo en la
inscripción: es el motor quien la necesita, y la obligación es la fila que el auditor ya rastrea.

Y **no es un ancla a la que sumarle meses** — es el vencimiento mismo. Tratarlo como ancla daría
«tres años después de que caduque», justo al revés de lo que dice el documento.

**Medido de punta a punta** (paso 11), y sin tocar el reloj: se registra un certificado que vence
dentro de **30 días** sobre una formación con recurrencia de **12 meses**. Es el mismo truco de
comprimir que usa `reinduccion-ciclos.mjs` — la ventana está fijada en 60 días, así que un papel a
30 la tiene abierta hoy. Resultado: nace la ronda 2 venciendo **el día que dice el papel**, no
dentro de doce meses. Con la recurrencia mandando, no habría nacido ninguna.

## 8. Lo que decide la empresa, y lo que falta

**`activity_types.config.tracksExternalCertificate`** es el único ajuste, y vive donde viven todas
las decisiones por clase de formación: Configuración → Tipos de formación. Nace encendido **solo en
Recertificación**; los otros seis, apagados. Pedir un número de certificado en una charla de quince
minutos llena el expediente de campos vacíos y enseña a saltárselos.

La compuerta la aplica el **servidor** (409 `TYPE_DOES_NOT_TRACK_EXTERNAL_CERT`), no solo la
pantalla: un control que solo vive en el navegador no es un control.

### Lo que falta

1. **El archivo escaneado no se sube todavía.** Las columnas están (`ext_cert_file_key`,
   `offerings.attendance_sheet_key`) y la API los acepta, pero no hay pantalla que suba el PDF ni el
   acta firmada. Es lo siguiente natural y lo que completa la evidencia.
2. **La segunda puerta**, para cuando el papel llega después de la jornada — que es lo normal: la
   ARL manda los certificados a los quince días. Hoy hay que volver a la jornada; falta poder
   hacerlo desde la ficha de la persona.
3. **Quien llega con un certificado de otro empleo** (vía C sola, sin jornada) no tiene por dónde
   registrarse.
4. **El informe de Vencimientos sigue leyendo `certification_grants`**, una tabla que nadie escribe,
   así que su serie de «Certificación» sale en cero. Ahora que existe `valid_until_override` y que
   `certificates.valid_until` ya se escribía, tiene con qué llenarse. Ver `seguimiento.md` §7 quater.
