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
