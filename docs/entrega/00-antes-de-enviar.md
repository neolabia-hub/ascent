# Antes de pulsar enviar

Doce comprobaciones. **Las seis primeras bloquean la entrega**: si se manda el correo sin ellas
hechas, el cliente encuentra el fallo antes que nosotros, y una entrega solo se hace una vez.

El orden importa: está puesto de lo que más tarda a lo que menos.

---

## BLOQUEANTES

### 1. Limpiar los datos de prueba que hay en producción

En *Configuración → Contacto de soporte* de TRANSPRENSA está escrito **«administrador de todo el
mundo»** y **«lunes a viernes no llame»**. Eso lo ve cualquier trabajador que pulse «No puedo
entrar», y es lo primero que vería el cliente el día que enseñe la plataforma a su gente.

Se corrige desde la propia interfaz, con la cuenta de administración.

> Y hay una decisión detrás: **ese contacto es el de TRANSPRENSA, no el nuestro.** Quien no puede
> entrar necesita llamar a alguien de su empresa que le confirme la cédula, no a un proveedor de
> software. Hay que pedirle al cliente el nombre, el teléfono y el horario reales.

### 2. ~~Decidir quién atiende el soporte~~ — DECIDIDO el 2026-09-09

Ya está escrito en los cuatro documentos y en el correo:

| | |
|---|---|
| WhatsApp | **+57 315 289 3163** |
| Correo | **miguelabad066@gmail.com** |
| Atención directa | Lunes a viernes, 8:00 a 17:00 |
| Fuera de ese horario | Asistente automático 24/7 |

`soporte@ascentio.app` **deja de anunciarse**: existe pero no lo atiende nadie, y prometer atención
por un buzón que nadie abre es peor que no prometer nada. Ya no aparece en ningún documento de
entrega.

### 2 bis. EL ASISTENTE 24/7 TIENE QUE EXISTIR ANTES DE FIRMAR

**Esto es lo más delicado de toda la entrega.** El acta —apartado 11— y la ficha técnica dicen que
fuera del horario hay un *asistente automático disponible 24/7*. Hoy **eso no está construido**: es
lo que se quiere añadir después al módulo de documentación.

Un acta firmada es una promesa exigible. Hay tres salidas y hay que elegir una **antes** de mandar
nada:

1. **Construirlo antes de firmar.** Un asistente sobre la documentación que ya existe es un trabajo
   pequeño comparado con lo que hay hecho, y es de verdad lo que promete la frase.
2. **Cambiar la línea por lo que hoy es cierto:** *«Fuera del horario de atención, los mensajes
   quedan registrados y se atienden el siguiente día hábil»*. No suena tan bien y no admite discusión.
3. **Escribirlo como un compromiso con fecha:** *«a partir del (fecha)»*. Sigue siendo exigible, pero
   al menos es exacto.

Lo que no vale es dejarlo como está y confiar en que nadie llame un sábado. El día que alguien
llame un sábado, la frase estará firmada.

### 3. Rotar lo que se escribió en una conversación

Dos cosas quedaron escritas en texto plano en una conversación y **hay que rotarlas antes de dar por
cerrada la entrega**:

- Las **cuatro claves de R2** (el almacenamiento de los vídeos).
- La **contraseña de la cuenta de plataforma** (`soporte@ascentio.app`).

El cómo, en `C:\Users\Prueba\Documents\ASCENT - CREDENCIALES Y ACCESOS.md`, apartados 2 y 3.

### 4. Dejar la cuenta del cliente como es debido

Hoy la cuenta de administración de TRANSPRENSA es la genérica de la semilla (documento
`999999999`). Antes de entregar:

- **Crear la cuenta a nombre de la persona real** que va a administrar, con su cédula. Un acta de
  entrega que dice «la cuenta es 999999999» no se puede enseñar en una auditoría interna.
- **Crear una segunda cuenta de administrador.** Una sola es un punto único de fallo: unas
  vacaciones o un acceso perdido dejan a la empresa sin quien configure nada. Y es la única
  situación que no se resuelve desde dentro.
- **Desactivar o renombrar la genérica**, para que no quede una cuenta con contraseña conocida.

### 5. Rellenar los huecos amarillos

Los cuatro documentos llevan huecos marcados en amarillo — `[así]`. Están resaltados justamente para
que un documento sin rellenar cante a la vista.

Al 2026-09-09 quedan estos, y solo estos:

| Documento | Qué falta |
|---|---|
| `acta-de-entrega.html` | Razones sociales, NIT, representantes, fecha, y **cuatro valores del apartado 11**: garantía, tiempo de primera respuesta, disponibilidad y aviso de mantenimiento |
| `anexo-tecnico.html` | Tiempo estimado de recuperación, y la fecha de la vigilancia proactiva |
| `ficha-de-acceso.html` | Nombre y cargo de quien la recibe, su cédula y la contraseña temporal — **se rellenan el mismo día**, no antes |
| `correo-entrega.html` | Nombre y cargo de la firma, y el día y hora de la sesión de arranque |
| `bienvenida.html` | Nada. Está completo |

Después: `.\scripts\convertir.ps1` y **abrir los `.docx` y los `.pdf` a mirarlos**. Que se generen no
significa que estén bien.

> **OJO CON LOS `.docx` YA CORREGIDOS A MANO.** `convertir.ps1` los regenera desde el HTML y se lleva
> por delante cualquier corrección hecha en Word. Si hay ediciones que solo están en el `.docx`, o se
> suben antes al HTML, o hay que correr `.\scripts\convertir.ps1 -SoloPdf`. **El HTML es el original;
> el `.docx` es una salida.** En el momento en que se corrige solo el `.docx`, los dos se separan y
> nadie se entera hasta que el cliente compara.

### 6. Cuadrar el acta con el contrato

El apartado 11 del acta promete siete cosas: garantía, canal, horario, tiempo de primera respuesta,
disponibilidad, ventanas de mantenimiento y salida de los datos.

**Tienen que coincidir con el contrato de licencia y servicios.** Si el contrato dice otra cosa, se
corrige el acta antes de firmar. No se firman dos documentos que prometen cosas distintas: en una
discusión, el cliente enseñará el que más le convenga, y tendrá razón.

---

## IMPORTANTES, PERO NO BLOQUEAN

### 7. Decidir el nombre, de una vez

Hay tres nombres circulando y no coinciden:

| Dónde | Qué dice |
|---|---|
| La plataforma y el dominio | **Ascent**, de **AION** |
| La portada del contrato de licencia | **TRANSPRENSA ACADEMY** |
| El *project charter* | Plataforma **NEO Pulse**, proveedor **NEO** |

Los documentos de esta carpeta están escritos con **Ascent, de AION**, que es lo que el cliente ve
en la pantalla. Si se prefiere otro, hay que cambiarlo en los cuatro documentos **y** en el
contrato, no en uno solo.

### 8. Vigilancia

Hoy no hay ninguna: el primer aviso de que algo se cayó lo daría el cliente. Sentry es gratis hasta
5.000 sucesos y un vigilante de disponibilidad sobre `/v1/health` es una tarde de trabajo — y sirve
para Ascent **y** para SAC-NEO desde la misma cuenta.

Si no da tiempo antes de la entrega, **está declarado en el anexo técnico §7** para que sea una
decisión y no una sorpresa. Pero conviene ponerlo.

### 9. Comprobar que la plataforma está bien, hoy

Antes de anunciar que está lista, mirarla:

```bash
# ¿Responde?
curl https://ascentio.app/v1/health

# ¿Está todo arriba?
ssh -i C:\Users\Prueba\.ssh\ascent linuxuser@45.63.107.34
cd /opt/ascent && docker compose -f docker/docker-compose.prod.yml --env-file .env.prod ps

# ¿Hay copia reciente?
cat /opt/ascent/backups/backup.log | tail -5
```

Y entrar por `https://transprensa.ascentio.app/login` con la cuenta nueva del cliente, a ver lo que
va a ver él.

### 10. Probar el correo antes de enviarlo

**Enviárselo primero a uno mismo**, y mirarlo en dos sitios:

- En el **teléfono**. Es donde lo va a abrir el cliente, y donde se descubre que una tabla no cabe.
- Con las **imágenes bloqueadas**. No debería cambiar nada: el correo no lleva ninguna imagen a
  propósito, y esta es la comprobación de que sigue siendo verdad.

Y comprobar que **no ha caído en no deseados**.

### 11. Adjuntar lo que dice que adjunta

El correo promete cuatro cosas. Que estén:

- `bienvenida.pdf`
- `acta-de-entrega.pdf` (y el `.docx`, para que pueda editarlo)
- `anexo-tecnico.pdf`
- Las guías de operación

**La ficha de acceso NO se adjunta a este correo.** Va por el canal aparte, y por eso está en otra
carpeta.

### 12. Guardar copia de lo que se entregó

Cuando el acta vuelva firmada, guardarla junto a esta carpeta. Dentro de un año, la pregunta «¿qué
se entregó exactamente y qué se prometió?» se contesta con ese PDF y con nada más.

---

## Lo que NO hay que hacer

- **No mandar las contraseñas en el mismo correo que el resto.** Un correo se reenvía entero, y el
  reenvío no pregunta.
- **No prometer un porcentaje de disponibilidad que no se esté midiendo.** Mientras no haya
  vigilancia, un 99,9 % es una cifra inventada.
- **No enseñar la plataforma con datos de prueba dentro.** Un catálogo con «Induccion E2E 04084758»
  hunde una demostración por sí solo.
