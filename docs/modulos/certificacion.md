# Certificación

El proceso completo, de punta a punta: **qué formaciones acreditan, cómo se diseña el papel, cómo
nace al terminar, y qué pasa cuando alguien lo verifica.**

No es solo "la constancia": empieza en la configuración de los tipos de formación de la empresa y
termina en una persona de otra compañía escaneando un QR en la portería de una planta.

Decisiones #110, #111, #112 y #113.

---

## 1. La idea en una frase

**La constancia nace sola al terminar la formación, congela por valor todo lo que imprime, y
cualquiera puede comprobarla sin tener cuenta.**

Las tres mitades importan y cada una responde a un fallo concreto:

| | Por qué |
|---|---|
| **Nace sola** | Un botón "generar constancia" depende de que alguien se acuerde por cada persona. Una constancia que no existe el día que la piden vale igual que no haber capacitado |
| **Congela por valor** | La gente cambia de cargo, las formaciones se renombran, quien respondía se jubila. Si el papel se armara leyendo las tablas de hoy, reimprimirlo dentro de dos años daría un documento distinto — y eso invalida la evidencia |
| **Se verifica sin cuenta** | Quien comprueba es de FUERA: el cliente que exige el curso de alturas, la ARL, otra empresa. Pedirle registro convierte la verificación en un trámite que nadie hace |

---

## 2. Quién decide qué formaciones acreditan

Una cascada de tres niveles, la misma que gobierna la nota mínima y los intentos (Decisión #27):

```
  TIPO DE FORMACIÓN          ACTIVIDAD                 VERSIÓN PUBLICADA
  activity_types.config  →   activities.               →  activity_versions.
  .issuesCertificate         issues_certificate           issues_certificate
  (por empresa)              (null = hereda)              (congelado, ya resuelto)
```

**Por qué el tipo y no cada formación:** la pregunta es por *clase* de formación. Una píldora de
tres minutos no acredita nada —emitir papel por eso devalúa el papel y llena el expediente de
ruido—; una inducción sí, siempre, porque es exactamente lo que pide el auditor. Eso no cambia
entre las doscientas formaciones de una empresa: cambia entre sus seis tipos. **Lo que hay que
marcar doscientas veces se olvida, y el olvido se descubre el día de la auditoría.**

Los valores por defecto que trae cada empresa:

| Tipo | ¿Acredita? |
|---|---|
| Inducción general / específica | Sí |
| Reinducción | Sí |
| Capacitación del plan | Sí |
| Capacitación extraordinaria | Sí |
| **Píldora** | **No** |

Se cambian en **Configuración → Tipos de formación**, por empresa. Y cada formación puede
desviarse de su tipo en los dos sentidos desde su propia ficha: una charla de diez minutos marcada
como extraordinaria no merece papel, y una píldora que *es* el refuerzo anual de alturas sí.

> **Al publicar se congela.** Cambiar el tipo mañana afecta a lo que se publique de ahí en
> adelante. Las versiones ya publicadas conservan lo que regía cuando se publicaron — por eso una
> constancia emitida siempre se puede explicar.

---

## 3. La vigencia sale de la recurrencia

Si una formación hay que repetirla cada 12 meses, su constancia vale 12 meses. **El día que toca
repetirla es exactamente el día en que deja de acreditar.**

No hay un campo "vigencia" aparte, y es deliberado: pedirlo por separado sería pedir el mismo dato
dos veces y garantizar que algún día no coincidan — y entonces habría un papel diciendo "vigente"
sobre algo que el sistema ya reclama vencido.

**Lo que no se repite, no vence.** Una inducción que se hace una vez al entrar acredita para
siempre que se hizo. Eso es lo correcto: el hecho no caduca.

La cuenta arranca desde que se **completó**, no desde que se imprimió el papel: hoy son la misma
fecha, pero dejarán de serlo el día que se pueda emitir a mano una constancia atrasada, y contar
desde la impresión regalaría meses de vigencia que nadie cursó.

---

## 4. El diseño lo hace el cliente

**Configuración → Constancias.** El cliente sube su arte (lo que ya tiene hecho en Canva o
Illustrator) y arrastra encima los datos.

### Por qué no HTML

El esquema original guardaba `html_template`. Se descartó por tres razones:

1. **Un coordinador de SST no escribe HTML.** «Nosotros lo diseñamos» significa que tienen un arte,
   no que vayan a maquetar. Con la plantilla en HTML, quien acabaría diseñando la constancia
   seríamos nosotros cada vez que pidieran mover un logo.
2. **Renderizar HTML a PDF exige Chromium headless**: ~300 MB y varios segundos por documento en un
   servidor de 1 vCPU.
3. **HTML ajeno ejecutado por nuestro servidor es superficie de ataque.** Un
   `<img src="http://169.254.169.254/...">` en la plantilla es una petición hecha *desde dentro*,
   con acceso a la red interna.

Se dibuja con `pdf-lib`: sin navegador, en milisegundos, sin nada que interpretar.

### Coordenadas en porcentaje

Todo se guarda en **porcentaje de la hoja**, con origen **arriba-izquierda** (como la pantalla). El
arte puede venir a 1000 px o a 4000: la posición no cambia. El PDF cuenta desde abajo, y esa
conversión se hace en un solo sitio —al dibujar— para que la pantalla de colocación, la vista
previa y el JSON guardado hablen un solo idioma.

`size` es el alto de la letra en porcentaje del alto de la hoja, no en puntos: el mismo número se
vería enorme en A5 y diminuto en A3.

### Los datos que se pueden colocar

Nombre · Documento · Cargo · Área · Formación · Tipo de formación · Horas · Fecha en que la cursó ·
Vigente hasta · Número de serie · Código de verificación · Calificación · Código QR.

La lista es **cerrada**. Con campos libres alguien pondría `{{jefe}}` y el día que ese dato no
exista la constancia saldría con el texto crudo impreso — o peor, en blanco y sin que nadie lo note
hasta que la vea un auditor. Todos estos salen del snapshot congelado, así que todos tienen valor
siempre.

Un campo sin valor **no se dibuja**: nunca sale "null" ni un guion. Un guion en una constancia
oficial se lee como que falta algo.

### Las firmas

Hasta cuatro, cada una con nombre, cargo y rúbrica en PNG. Se arrastran sobre el arte igual que los
campos. **La línea y el nombre se dibujan siempre**, haya imagen o no: sin ellos una constancia no
se lee como documento firmado, y si la rúbrica falta lo que importa —quién responde— sigue escrito.

El cargo pesa tanto como el nombre. «Ana Gómez» no dice nada; «Ana Gómez, Coordinadora de SST»
acredita.

### Una sola activa

Al activar una plantilla, las demás se apagan. La emisión coge la activa; con dos, cuál gana
dependería del orden de actualización, y dos personas que terminan la misma formación el mismo día
podrían recibir diseños distintos.

**No se puede activar sin arte**: saldrían constancias en hoja blanca con cuatro líneas de texto
sueltas. Es mejor no emitir —queda registrado— que emitir un papel que nadie querría enseñar.

**Sin plantilla activa no se emite nada.** La formación se termina igual y queda registrada; solo
no sale el papel.

---

## 5. El flujo completo, paso a paso

Un caso real, de principio a fin.

### Preparación (una vez)

1. **Configuración → Tipos de formación.** «Capacitación del plan» tiene *Entrega constancia*
   marcado. Se deja.
2. **Configuración → Constancias → Nueva.** Se sube el arte (`constancia-transprensa.png`,
   horizontal). Se arrastran el nombre al centro, las horas debajo, el QR a la esquina.
3. Se añaden dos firmas: *Coordinador de SST* y *Jefe de Gestión Humana*, con sus rúbricas en PNG.
4. **Vista previa** → se comprueba con un nombre largo de ejemplo que nada se pisa.
5. **Usar esta plantilla.**

### El día a día

6. Se crea la formación **«Trabajo seguro en alturas»**, tipo *Capacitación del plan*, con
   `certificateHours = 8`. Al **publicar**, la versión congela `issuesCertificate = true` y
   `certificateHours = 8`.
7. Hay una regla que la exige **cada 12 meses** a los conductores.
8. **María Rodríguez** la cursa y aprueba con 95.
9. El cierre (`CompletionService`) marca la ejecución como `PASSED`, cierra la obligación, suma
   puntos **y emite la constancia**:
   - Serial `CERT-2026-000123` (consecutivo por empresa y año, con bloqueo de fila).
   - Código de verificación `K7M2P-9XQ4T-BC3JH-N8RVY` — 20 caracteres aleatorios.
   - Snapshot con su nombre, su cédula, su cargo *de ese momento*, la formación, las 8 horas, la
     nota y la empresa.
   - `validUntil` = 12 meses desde que la completó.
10. María la descarga desde **Perfil → Tus constancias**.

### Cuando alguien la comprueba

11. María llega a la planta de un cliente. En la portería escanean el QR del papel.
12. Se abre `/verificar/K7M2P-9XQ4T-BC3JH-N8RVY`. **Sin cuenta, sin instalar nada.**
13. Sale: **Constancia auténtica** · María Fernanda Rodríguez · 110\*\*\*5432 · Trabajo seguro en
    alturas · 8 horas · la cursó el 15 de marzo de 2026 · emitida por TRANSPRENSA.

---

## 6. Los tres estados al verificar

Esto es lo que ve quien tiene el papel en la mano, y la distinción importa porque **con eso se
decide si alguien entra o no a una planta**.

| Estado | Qué significa | Qué debe hacer quien lo lee |
|---|---|---|
| 🟢 **VIGENTE** | La formación se hizo y sigue acreditando | Nada. El papel vale |
| 🟡 **VENCIDA** | La formación **se hizo de verdad**, pero pasó su vigencia | No es un papel falso. Hay que repetir la formación |
| 🔴 **ANULADA** | La empresa que la emitió la retiró, y dice por qué | No vale. El motivo sale escrito |

**Vencida no es falsa, y es la distinción que más importa.** Quien mira esto está decidiendo si deja
entrar a un conductor. «Vencida» significa que se capacitó y toca renovar; «anulada» significa que
la empresa la retiró —por ejemplo, se emitió por error a la persona equivocada—.

### ¿Vencida respecto a qué?

Respecto a **la recurrencia de esa formación en esa empresa**. Si Transprensa exige alturas cada 12
meses, la constancia de María vence el 15 de marzo de 2027 — doce meses desde que la cursó, no
desde que se imprimió.

Si esa formación **no se repite**, la constancia no vence nunca y el estado es siempre VIGENTE o
ANULADA.

### Qué se publica y qué no

La respuesta pública dice **menos** de lo que sabemos, porque la ve cualquiera con el código:

- **Sale**: nombre, cédula **enmascarada** (`110***5432`), formación, horas, fecha, empresa, serial.
- **No sale**: cédula completa, cargo, área, calificación.

La cédula se enmascara en vez de omitirse porque sin ella no se puede confirmar que la constancia es
de la persona que uno tiene delante — que es justo lo que se está verificando. Quien tiene el papel
ya la ve entera; quien no, no tiene por qué.

### Por qué el código y no el serial

El serial es `CERT-2026-000123`: correlativo. Bastaría contar hacia arriba para leerse las
constancias de toda la plantilla, y ahí hay nombres y cédulas.

El código de verificación son **20 caracteres aleatorios en grupos de cinco**, de un alfabeto sin
vocales ni caracteres ambiguos —nadie confunde un 0 con una O al copiarlo de un papel impreso—. No
se puede enumerar. Y el endpoint está limitado a 20 consultas por minuto.

### Revocar, nunca borrar

Una constancia emitida por error se **anula**; no se hace desaparecer. Borrarla dejaría un hueco en
la serie —CERT-2026-000122 y 000124 sin nada en medio— que es exactamente lo que un auditor
pregunta. Anulada, la verificación pública dice qué pasó, que es la respuesta útil para quien tiene
el papel.

Exige **motivo obligatorio**: una revocación sin explicación es indefendible seis meses después.
Queda auditada con quién la anuló y cuándo.

---

## 7. Detalles de implementación que conviene no perder

### Una constancia por ejecución, garantizado por la base de datos

```sql
CREATE UNIQUE INDEX certificates_enrollment_unique
  ON certificates(tenant_id, enrollment_id)
  WHERE enrollment_id IS NOT NULL;
```

El completado se evalúa **más de una vez** —el reproductor reintenta, dos pestañas terminan a la
vez, un envío sin señal llega tarde—. Sin esta restricción bastaba una carrera para que la misma
persona acabara con dos constancias, dos seriales, y ninguna forma de saber cuál es la buena.

No basta con comprobar antes de insertar: entre la comprobación y la inserción cabe otra petición.
Se inserta y se traga el choque (`P2002`), devolviendo la que ya existía.

Es **parcial** porque hay constancias sin ejecución: las que nacen de una certificación otorgada por
trayectoria.

### La emisión nunca tumba el cierre

Va fuera de la transacción del cierre y con `catch`. Si la emisión falla, **la formación queda
terminada igual**. El registro formativo es el dato legal; el papel se puede volver a emitir. Al
revés sería perder lo importante por no poder imprimir lo secundario.

### El PDF no se guarda, se vuelve a dibujar

`certificates.pdf_storage_key` existe y sigue vacío a propósito. Dibujar toma milisegundos y el
resultado es idéntico siempre, porque todo sale del snapshot. Seiscientas personas por veinte
formaciones serían doce mil PDF guardados, y el día que se corrija un fallo de dibujo la mitad
seguiría con el fallo.

Si algún día hace falta congelar el binario —una firma digital con estampado de tiempo— la columna
ya está.

### El QR apunta a la pantalla, no al código

Un QR con solo `K7M2P-9XQ4T-...` obliga a quien lo escanea a saber dónde meterlo, y no lo sabe: es
alguien de otra empresa. Con la URL completa, escanear y ver el resultado es un gesto.

### Un fichero que falta no impide la constancia

Si el arte de fondo o una rúbrica no se pueden leer —borrados, perdidos en una restauración—, la
constancia **sale igual** sin ellos. El papel sin fondo sigue acreditando la formación; una descarga
que falla con error 500 no acredita nada.

---

## 8. Dónde está cada cosa

| Qué | Dónde |
|---|---|
| La cascada tipo → actividad → versión | `apps/api/src/certificates/certificate-policy.ts` |
| Emisión, verificación, revocación | `apps/api/src/certificates/certificates.service.ts` |
| Qué se congela en el papel | `apps/api/src/certificates/certificate-snapshot.ts` |
| El dibujo del PDF | `apps/api/src/certificates/certificate-pdf.ts` |
| Plantillas (CRUD, activación) | `apps/api/src/certificates/certificate-templates.service.ts` |
| Diseñar la constancia | `apps/web/src/app/(admin)/configuracion/constancias/page.tsx` |
| Qué tipos acreditan | `apps/web/src/app/(admin)/configuracion/tipos-de-formacion/page.tsx` |
| Verificación pública | `apps/web/src/app/verificar/[codigo]/page.tsx` |
| Dónde se dispara la emisión | `apps/api/src/learning/completion.service.ts` |

---

## 9. Lo que falta

| Pendiente | Criticidad | Nota |
|---|---|---|
| Las formaciones **presenciales** no emiten constancia | Alta | Una jornada de 8 horas acredita, pero ahí no hay reproductor que marque completado sino asistencia. Depende de la parte de asistencia del Sprint 5 |
| No hay emisión manual para lo completado **antes** de activar la plantilla | Media | El permiso `certificates:issue` existe y no lo usa ningún endpoint de alta manual todavía |
| La vigencia por **fecha fija anual** («cada 31 de enero») no se traduce a vigencia | Baja | Solo se traduce `everyMonths`. Con fecha fija el vencimiento es un día del calendario, no un plazo desde que se cursó; mezclarlas daría una vigencia inventada |
| El campo `horas` se escribe a mano por formación | Baja | No se deduce de la duración del contenido a propósito: una jornada presencial de 8 horas puede tener 20 minutos de contenido virtual |
