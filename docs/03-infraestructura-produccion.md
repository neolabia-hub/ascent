# NEO PULSE — Infraestructura de produccion (decision y analisis)

Contexto: produccion NO comparte nada con el entorno de SAC-NEO (que es piloto/demo). NEO PULSE
va a un VPS propio, con criterio de costo-beneficio: rapido y fluido, pero economico.

> **Etapa actual (2026-09-01): entrega del piloto a costo cero.** Antes del VPS de pago hay una
> entrega formal que tiene que estar en linea ya. El procedimiento —una sola maquina con
> `docker compose`, portable a cualquier proveedor— esta en `docs/04-despliegue-piloto.md`. Lo de
> abajo sigue siendo la decision para la etapa de pago, y mudarse alli no cambia codigo: cambia de
> maquina.

## Lo que cambia el calculo: el VIDEO

NEO PULSE sirve video, PDF e imagenes a cientos de usuarios. En este tipo de producto el costo
dominante NO es el computo: es el EGRESS (trafico de salida). Un solo video de 50 MB visto por
200 personas son 10 GB de salida; multiplicado por catalogo y meses, se vuelve el rubro mayor.

Por eso la decision de almacenamiento pesa mas que la de servidor.

## Decision 1 — Almacenamiento de medios: Cloudflare R2

**R2 cobra CERO por egress.** S3 de AWS cobra alrededor de USD 0,09 por GB de salida. Con el
mismo trafico, R2 cuesta practicamente lo mismo que almacenar y AWS cobra ademas cada descarga.

No es una preferencia: es la diferencia entre un costo plano y uno que crece con el uso.
R2 es compatible con la API de S3, asi que el adaptador (`storage.service.ts`) ya sirve para
ambos y cambiar de proveedor no toca el codigo de negocio.

Costo aproximado: USD 0,015 por GB almacenado al mes, egress USD 0. Verificar tarifas vigentes.

## Decision 2 — Computo: VPS dedicado, no nube gestionada

Un LMS de este tamaño (miles de usuarios, un tenant grande) corre comodo en 4-8 vCPU y 16 GB.
El stack completo va en Docker Compose sobre un solo VPS: API NestJS, web Next.js, PostgreSQL,
Redis y el worker.

Comparacion honesta (verificar precios vigentes antes de contratar):

| Opcion | Aprox. mensual | A favor | En contra |
|---|---|---|---|
| **Hetzner** (Ashburn, EE.UU.) | ~EUR 30 por 8 vCPU / 16 GB / 240 GB | La mejor relacion precio-potencia del mercado; 20 TB de trafico incluidos | Latencia a Colombia ~80-110 ms (aceptable, no optima) |
| **Vultr o DigitalOcean** (Miami) | ~USD 48-60 por 4-8 vCPU / 16 GB | Latencia a Colombia ~40-60 ms, la mejor; panel simple; snapshots | 2-3 veces mas caro por recurso que Hetzner |
| **AWS EC2 / Lightsail** | ~USD 80-150 equivalente | Ecosistema completo si algun dia se necesita | Sobreprecio claro para este tamaño; el egress de S3 castiga el video; complejidad que hoy no aporta |
| **Contabo** | ~USD 15-25 | El mas barato | Rendimiento inconsistente; no recomendable con un cliente en produccion |

**Recomendacion:** si la prioridad es que se sienta instantaneo para Transprensa (Colombia),
**Vultr o DigitalOcean en Miami**. Si la prioridad es exprimir el presupuesto, **Hetzner en
Ashburn** entrega 2-3 veces mas maquina por el mismo dinero y la diferencia de latencia
(unas decimas de segundo) es imperceptible en una plataforma de formacion, que no es un juego
en tiempo real.

**AWS no se recomienda** para esta etapa: se paga el ecosistema sin usarlo, y su egress pelea
justo con lo que mas consume el producto.

## Decision 3 — Cloudflare delante (plan gratuito)

DNS, TLS, proteccion basica y cache de estaticos sin costo. Ademas resuelve el requisito de
subdominio por tenant (Decision #32) con un registro comodin.

## Decision 4 — Base de datos en el mismo VPS al inicio

PostgreSQL en Docker junto a la aplicacion: menos latencia (misma maquina), sin costo extra.
Con dos condiciones NO negociables:
- `pg_dump` diario automatico, retencion de 14 dias, y copia fuera del servidor hacia R2.
- Restauracion PROBADA antes de la salida a produccion (un backup que nunca se restauro no es
  un backup).

Se migra a base gestionada solo cuando el volumen lo exija, no antes.

## Presupuesto estimado

| Concepto | Aprox. mensual |
|---|---|
| VPS (Hetzner o Vultr/DO) | USD 30-60 |
| Cloudflare R2 (medios) | USD 1-10 segun catalogo |
| Cloudflare (DNS, TLS, cache) | USD 0 |
| Correo transaccional (Resend) | USD 0-20 segun volumen |
| **Total** | **USD 30-90** |

Un equivalente en AWS con el mismo trafico de video quedaria facilmente por encima de USD 200.

## Que falta cablear (pendiente del sprint de produccion)

1. ~~`R2StorageAdapter`~~ **HECHO** (2026-09-01). Ademas de subir y borrar, la decision que
   importa: con R2 los bytes **no pasan por la API**, el controlador de medios redirige a una URL
   prefirmada. Servirlos desde el servidor haria viajar cada video dos veces y convertiria el ancho
   de banda de la maquina en el techo de cuanta gente puede ver una formacion a la vez.
2. ~~`docker-compose.prod.yml`~~ **HECHO** (2026-09-01): proxy Caddy con TLS, web, API, Postgres y
   Redis, mas un servicio one-shot de migraciones. Ver `docs/04-despliegue-piloto.md`.
3. ~~Script de despliegue y de backup~~ **HECHO**: `scripts/release.sh`, `scripts/backup.sh` y
   `scripts/restaurar-prueba.sh` (este ultimo restaura de verdad en una base de usar y tirar: un
   volcado que nunca se restauro no es una copia de seguridad).
4. Dominio y DNS comodin para los subdominios por tenant.
5. Sentry y monitoreo de disponibilidad (ver CLAUDE.md 10.5).

**Advertencia:** los precios citados son de referencia y cambian. Verificarlos al contratar.

---

# Qué comprar, revisado el 2026-09-09

Lo de arriba sigue siendo la decisión; esto es el **precio y el tamaño concretos** con los que se
firma, y la lista de lo que hay que tener listo antes de contratar nada.

## 1. El tamaño sale de un solo hecho: el vídeo NO pasa por el servidor

Es la consecuencia práctica de la Decisión 1, y conviene tenerla clara antes de mirar precios: con
R2, el controlador de medios **redirige a una URL prefirmada** y los bytes viajan de Cloudflare al
navegador. El servidor no los toca. Doscientas personas viendo el mismo vídeo de 50 MB no son 10 GB
de salida del VPS: son 10 GB de salida de R2, que no se cobran.

Así que la máquina no se dimensiona por el vídeo. Se dimensiona por lo que sí hace:

| Lo que carga la máquina | Cuánto pesa |
|---|---|
| API NestJS + web Next.js, ~600-1.100 personas del piloto | Poco, y sobre todo a ratos |
| PostgreSQL con toda la evidencia | El grueso de la RAM; le sienta bien tener de sobra para caché |
| **El motor de obligaciones al publicar una campaña** | El pico real: una reinducción son ~1.060 obligaciones creadas de una vez |
| Generar el acta de una jornada en PDF | Segundos, esporádico |
| **Convertir un PPTX a diapositivas (LibreOffice)** | ~500 MB-1 GB de RAM por conversión, y hoy **no está en la imagen** |

**Conclusión: 4 vCPU y 8 GB es el mínimo cómodo; el número que importa es la RAM.** Con 16 GB entra
LibreOffice sin pensarlo y Postgres respira. Disco: 80-160 GB NVMe sobra, porque los medios no viven
aquí.

## 2. Las opciones, con precio de septiembre de 2026

> **CORRECCIÓN del 2026-09-09, y la lección va primero:** la primera versión de esta tabla puso a
> Hetzner Ashburn en ~USD 33-40. **Es falso desde el 15 de junio de 2026:** Hetzner subió las tarifas
> de EE.UU. **hasta 3,1 veces** en las líneas CPX, y el CPX41 que costaba ~USD 36 en enero ronda hoy
> los **USD 140**. Lo cazó el cliente al ir a comprarlo, no nosotros. **Un precio en un documento
> caduca**: el aviso del final —"verificar al contratar"— no es una formalidad, es la única parte de
> esta sección en la que se puede confiar seis meses después.
>
> Con eso, **Hetzner en EE.UU. queda descartado**: su única ventaja era dar el doble de máquina por
> menos dinero, y ya no lo hace.

| Opción | Qué da | Aprox. al mes | Latencia a Colombia |
|---|---|---|---|
| **Vultr High Performance, Miami** | 4 vCPU / 8 GB / 180 GB NVMe, CPU de 4 GHz+ | **USD ~48** | **~40-60 ms** — la mejor |
| Vultr High Frequency, Miami | 3 vCPU / 8 GB / 256 GB NVMe, CPU de 3 GHz+ | USD ~48 | ~40-60 ms |
| DigitalOcean Premium AMD, Nueva York | 4 vCPU / 8 GB | ~USD 54 | ~70-90 ms |
| ~~Hetzner CPX41, Ashburn~~ | 8 vCPU / 16 GB | ~~USD 36~~ → **~USD 140** | ~80-110 ms |
| Hetzner CX32, Alemania | 4 vCPU / 8 GB | ~USD 8-18 | ~150-200 ms — se nota |
| Contabo | El doble de máquina por el mismo dinero | ~USD 15-25 | Rendimiento **inconsistente**: no con un cliente en producción |

### La recomendación, y por qué

**Vultr High Performance en Miami, 4 vCPU / 8 GB / 180 GB (USD ~48).**

El pedido fue *«que esté bien, sin quejas de rendimiento»*, y en un panel de administración lo que se
siente como lento casi nunca es la CPU: es la **ida y vuelta**. Cada pantalla encadena varias
llamadas, así que 50 ms contra 110 ms se multiplican por cada una. Miami es el mejor sitio para
Colombia.

**Y entre las dos líneas rápidas de Vultr, la High Performance.** La diferencia es la generación del
procesador —*High Frequency* es Intel de 3 GHz+, *High Performance* es AMD EPYC o Xeon de 4 GHz+— y
en Miami se ofrecen: HF con 3 vCPU y 256 GB de disco, HP con 4 vCPU y 180 GB, al mismo precio.
**Se cambian 76 GB de disco por un núcleo y 1 GHz, y es un buen negocio**, porque el disco que sobra
no lo usa nadie: los medios viven en R2 y la base del piloto entero son unos pocos GB.

Que el anfitrión sea **AMD o Intel es indiferente** para Node y PostgreSQL; donde se nota algo, AMD
EPYC rinde un poco mejor por dólar.

### Qué es el *bandwidth* del plan, y por qué aquí casi da igual

Es el **tráfico de SALIDA** incluido al mes: los bytes que el servidor manda a los navegadores (la
entrada no se cuenta). Pasarse se cobra por GB.

Aquí es casi irrelevante, y es la consecuencia de la Decisión 1: **el vídeo no sale de esta máquina**,
sale de R2 con una URL firmada y R2 no cobra salida. Del VPS solo salen pantallas y datos —unos pocos
GB al mes con mil personas—, así que los varios TB que trae cualquier plan sobran. Es exactamente el
motivo por el que se montó con R2 desde el principio: si los medios salieran de aquí, el plan de
tráfico sería el techo de cuánta gente puede ver una formación a la vez.
## 3. Presupuesto mensual completo

| Concepto | Aprox. |
|---|---|
| VPS (Vultr **High Performance** Miami, 4 vCPU / 8 GB) | USD ~48 |
| Cloudflare R2 — 100 GB de vídeo almacenado, salida gratis | USD ~1,5 |
| Cloudflare DNS/TLS/caché | USD 0 |
| Dominio propio | USD ~1 (12 al año) |
| Correo transaccional (Resend, plan gratuito hasta 3.000/mes) | USD 0 |
| Sentry (plan gratuito) | USD 0 |
| **Total** | **~USD 50 al mes** |

**No hay alternativa más barata que merezca la pena** desde que Hetzner subió sus tarifas de EE.UU.:
lo que ahorra Alemania (~USD 30 al mes) se paga en ~100 ms de latencia en cada llamada, y lo que
ahorra Contabo se paga en no saber qué rendimiento vas a tener el martes.

## 4. Antes de contratar: lo que hay que tener listo

El procedimiento entero está en `docs/04-despliegue-piloto.md` y no cambia. Lo que falta es esto:

| | Qué | Estado | Por qué bloquea |
|---|---|---|---|
| 1 | **Un remoto de git** (`PENDIENTES` 6.1) | **FALTA** | El despliegue clona el repositorio en la máquina y las imágenes se publican en un registro. Sin remoto hay que subir por `rsync`, y además el trabajo de tres semanas vive en un solo disco |
| 2 | **Dominio propio** + DNS comodín en Cloudflare | FALTA | Sin él no hay subdominio por empresa. Con un cliente se puede vivir con `?tenant=transprensa`, pero el correo y el QR de las constancias quedan con una URL que no es de nadie |
| 3 | **Bucket R2 + token** de lectura/escritura | FALTA | Es lo que hace que el vídeo no pase por el servidor. Sin esto, el ancho de banda de la máquina se vuelve el techo de cuánta gente puede ver una formación a la vez |
| 4 | **Secretos**: llaves RS256, `REFRESH_TOKEN_PEPPER`, `MEDIA_URL_SECRET`, contraseñas de Postgres | FALTA | Se generan **en la máquina** (`docs/04` §4). Una llave privada dentro de una imagen se filtra el día que alguien la comparte |
| 5 | **Sentry** (DSN) y un vigilante de disponibilidad | FALTA | Sin esto, el primer aviso de que algo se cayó lo da el cliente |
| 6 | **LibreOffice en la imagen de la API** | Decisión | Hoy subir un PPTX se rechaza pidiendo el PDF. Son ~500 MB de imagen y ~1 GB de RAM al convertir: con 8 GB entra, con 1 GB no. **Decidir si el piloto lo necesita** |
| 7 | **Copia de seguridad probada** | Los scripts están | `backup.sh` al cron y **restaurar de verdad** con `restaurar-prueba.sh` antes de dar la salida por buena |
| 8 | **Lo que carga el cliente**: plantilla de constancia, logo, firmas, catálogos | FALTA | Decidido el 2026-09-08: es suyo y se configura con el piloto arriba |

**El orden importa:** 1 y 3 primero (remoto y R2), porque los demás pasos los dan por hechos.

## 5. Cuando llegue el segundo cliente

Nada de lo de arriba cambia. Lo que hay que mirar entonces está en `docs/04` §8: el cron vive dentro
del proceso de la API, así que **escalar a dos réplicas exige antes sacar el disparador a un worker**
—mover el disparo, no rehacer la lógica—, y el contador del límite por IP tiene que pasar a Redis,
que ya está levantado esperando.
