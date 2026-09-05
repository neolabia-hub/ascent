# NEO PULSE — Despliegue del piloto

Como sale esto a Internet, a costo cero, sin comprometer el diseño y **sin que mudarse a un VPS de
pago sea otro proyecto**. La decisión de fondo y los precios de la etapa de pago están en
`docs/03-infraestructura-produccion.md`; esto es el procedimiento.

---

## 1. La forma: un `docker compose` en una máquina cualquiera

Todo el sistema —proxy con TLS, web, API, Postgres y Redis— vive en un solo
`docker/docker-compose.prod.yml`. No hay funciones, ni colas gestionadas, ni almacenamiento
propietario de nadie.

**Eso es lo que hace que el proveedor no importe.** El mismo archivo y el mismo `.env.prod` corren
igual en una VM gratuita de Google, en una de Azure, en Oracle o en el VPS de pago del mes que
viene. Mudarse es copiar dos cosas y apuntar el DNS: **operación, no desarrollo.**

### Por qué no vale un plan gratuito de Render, Koyeb o Fly

Porque **duermen el contenedor cuando nadie entra**, y aquí el motor de obligaciones y los avisos
corren *dentro* del proceso de la API (`@nestjs/schedule`). Un servicio dormido no ejecuta un cron:
las obligaciones no nacerían, los vencimientos no se detectarían, y nadie se enteraría hasta que el
cliente pregunte por qué no le llega nada. Hace falta una máquina que no se duerma.

### Qué máquina, si no se quiere Oracle

| Opción | Qué da | Lo que hay que saber |
|---|---|---|
| **GCP `e2-micro` Always Free** | 1 vCPU compartida, 1 GB RAM, 30 GB disco, siempre encendida (`us-central1`, `us-west1`, `us-east1`) | La recomendada si no se usa Oracle. **1 GB obliga a dos cosas**: activar swap y **no compilar en la máquina** (ver §3). Su egress gratis es 1 GB/mes: irrelevante **si los medios van a R2**, porque entonces el vídeo no sale por aquí |
| **Azure B1s / AWS `t3.micro`** | 1 GB RAM, gratis **12 meses** (no siempre) | Mismo procedimiento. Se acaba el año y hay que mudarse: por eso importa que mudarse sea barato |
| **VPS de pago (Hetzner CX22, ~4 EUR/mes)** | 2 vCPU, 4 GB RAM | Si el horizonte real son días, esto cuesta menos que la tarde que se pierde peleando con 1 GB de RAM |

Oracle Ampere (hasta 4 OCPU / 24 GB siempre gratis) sigue siendo la más generosa; el problema
conocido es que a menudo no hay capacidad ARM y hay que reintentar.

---

## 2. Antes de empezar (una vez)

- **Una máquina** con Ubuntu 22.04 o 24.04 y Docker, con los puertos **80 y 443** abiertos.
- **Un nombre DNS** apuntando a su IP. Gratis: [DuckDNS](https://www.duckdns.org). De pago (~USD 12
  al año): un dominio propio, que además habilita `transprensa.neopulse.app`.
- **Cloudflare R2** (opcional pero recomendado): un bucket y un token con permiso de lectura y
  escritura sobre él.

> **El dominio no es solo estética.** Con un host de tercer nivel —`algo.duckdns.org`— no hay
> subdominio por empresa: se entra con `?tenant=transprensa` y **`NEXT_PUBLIC_ROOT_HOST` se deja
> vacío**. Con dominio propio se pone el dominio raíz y cada empresa entra por el suyo. Ponerlo mal
> es peor que dejarlo vacío: el sistema buscaría una empresa que no existe.

---

## 3. Construir las imágenes FUERA de la máquina

En una VM de 1 GB, compilar Next.js se queda sin memoria a mitad. Y aunque quepa, no conviene: la
máquina de producción no tiene por qué llevar el código fuente ni las herramientas de construcción.

Desde el equipo de desarrollo (o desde la integración continua):

```bash
# La URL pública se HORNEA en el web al construir: cambiarla exige reconstruir, no reiniciar.
docker build -f apps/api/Dockerfile -t ghcr.io/<usuario>/neo-pulse-api:1.0.0 .
docker build -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://<tu-dominio> \
  --build-arg NEXT_PUBLIC_ROOT_HOST= \
  -t ghcr.io/<usuario>/neo-pulse-web:1.0.0 .

echo "$GHCR_TOKEN" | docker login ghcr.io -u <usuario> --password-stdin
docker push ghcr.io/<usuario>/neo-pulse-api:1.0.0
docker push ghcr.io/<usuario>/neo-pulse-web:1.0.0
```

En `.env.prod` se ponen esas dos etiquetas en `IMAGE_API` e `IMAGE_WEB`, y la máquina solo hace
`pull`. GHCR es gratis para repositorios públicos y privados de una cuenta personal.

> Si la máquina tiene RAM de sobra (4 GB o más), se puede construir allí mismo: se dejan `IMAGE_API`
> e `IMAGE_WEB` vacíos y se añade `--build` al `up`.

---

## 4. Levantar (primera vez)

```bash
sudo mkdir -p /opt/neo-pulse && sudo chown $USER /opt/neo-pulse
cd /opt/neo-pulse
git clone <repo> .            # o subirlo con rsync

cp .env.prod.example .env.prod
nano .env.prod                # dominio, contraseñas, R2, secretos

# Llaves RS256 de la sesión. Se generan AQUÍ y no viajan en la imagen: una llave privada dentro de
# una imagen se filtra en cuanto alguien la comparte o la sube a un registro.
mkdir -p apps/api/keys
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out apps/api/keys/private.pem
openssl rsa -pubout -in apps/api/keys/private.pem -out apps/api/keys/public.pem
chmod 600 apps/api/keys/private.pem

# Secretos largos y aleatorios para el .env.prod:
openssl rand -hex 32    # REFRESH_TOKEN_PEPPER
openssl rand -hex 32    # MEDIA_URL_SECRET

# La PRIMERA vez, con RUN_SEED=true en el .env.prod (catálogos y cuenta inicial).
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod pull
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod up -d
docker compose -f docker/docker-compose.prod.yml logs -f migrate api
```

**Después de la primera vez, `RUN_SEED=false`.** Dejarlo en `true` no rompe nada —la semilla es
idempotente— pero alarga cada despliegue sin motivo.

Comprobación: `https://<dominio>/login?tenant=transprensa` y `https://<dominio>/v1/health`.

### Si la máquina tiene 1 GB, antes del `up`

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Sin swap, Postgres y Node compiten por la memoria y el que pierde muere en silencio: la aplicación
responde "no se pudo conectar" y en los registros no hay ningún error, solo un contenedor que se
reinició.

---

## 5. Actualizar

```bash
cd /opt/neo-pulse && git pull
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod pull
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod up -d
```

El servicio `migrate` corre solo, termina, y solo entonces arranca la API. Las migraciones **no**
van en el arranque de la aplicación a propósito: el día que haya dos réplicas, las dos migrarían a
la vez sobre la misma base.

---

## 6. Copias de seguridad

```bash
crontab -e
# Diario a las 3:00
0 3 * * * /opt/neo-pulse/scripts/backup.sh >> /var/log/neo-pulse-backup.log 2>&1
```

`backup.sh` vuelca Postgres, se niega a dejar un archivo vacío, borra lo de más de 14 días y —si hay
R2— sube la copia **fuera de la máquina**. Una copia en el mismo disco que la base no protege del
único escenario que importa de verdad: perder la máquina.

**Y antes de dar la salida por buena, se restaura:**

```bash
./scripts/restaurar-prueba.sh /opt/neo-pulse/backups/neopulse-<fecha>.dump
```

Restaura en una base de usar y tirar —producción no se toca— y cuenta personas, formaciones,
obligaciones, inscripciones y constancias. Si los números no cuadran con producción, no hay copia.

> Si **no** se usa R2, los archivos viven en el volumen `storage` y el respaldo de la base no los
> incluye: hay que copiar también ese volumen. Es una razón más para usar R2.

---

## 7. Cuando se pase al VPS de pago

Lo que cambia:

1. Se levanta la máquina nueva, se instala Docker, se clona el repositorio y se copia el `.env.prod`.
2. Se restaura el último volcado (`pg_restore`), con el mismo procedimiento del punto 6.
3. Se apunta el DNS a la IP nueva. Caddy pide el certificado solo.
4. Se apaga la vieja cuando la nueva lleve un día bien.

Lo que **no** cambia: ni una línea de código, ni el compose, ni el procedimiento. Esa es toda la
gracia de haberlo montado así.

---

## 7 bis. Enseñarlo HOY sin máquina: túnel de Cloudflare

Cuando la cuenta del proveedor todavía no existe —GCP en Colombia pide un prepago de COP 100.000
para activar la facturación, y sin eso no se crea ni un recurso gratuito—, el mismo stack se publica
desde cualquier equipo con Docker, sin cuentas ni tarjetas:

```bash
# 1) El origen se sirve por HTTP plano: la TLS pública la pone Cloudflare.
#    En .env.prod:  DOMINIO=:80   y   NEXT_PUBLIC_API_URL=   (vacío = mismo origen)
docker compose -p neo-pulse-demo -f docker/docker-compose.prod.yml --env-file .env.prod up -d

# 2) El túnel. Imprime la URL pública en su propio registro.
cloudflared tunnel --url http://localhost:80 --no-autoupdate

# 3) Con la URL ya conocida, se apuntan las dos variables que la necesitan y se reinicia la API:
#    FRONTEND_URL y PUBLIC_VERIFY_BASE_URL (esta viaja en el QR de las constancias).
docker compose -p neo-pulse-demo -f docker/docker-compose.prod.yml --env-file .env.prod up -d --no-deps api
```

**Por qué no hace falta reconstruir el web al no saber la URL de antemano:** `NEXT_PUBLIC_API_URL`
vacío hace que el cliente pida `/v1/...` relativo al dominio desde el que se sirvió la página. La
misma imagen vale para el túnel de hoy y para el dominio de mañana.

**Lo que hay que saber:** la URL es aleatoria y cambia en cada arranque del túnel, y **el equipo
tiene que quedarse encendido y sin suspender**. Sirve para presentar y para que el cliente lo pruebe
unos días; no para que la empresa lo use a diario.

**Si el navegador dice que no encuentra el dominio**, no es el túnel: hay proveedores de Internet
que no resuelven `*.trycloudflare.com`. Se arregla poniendo el DNS en 1.1.1.1 o 8.8.8.8, o se
comprueba desde un teléfono con datos móviles. Para verificar por consola saltándose el DNS local:

```bash
curl --resolve <host>:443:<ip-de-cloudflare> https://<host>/v1/health
```

---

## 8. Lo que sigue sin estar, y conviene saberlo

| Qué | Consecuencia |
|---|---|
| **LibreOffice no va en la imagen de la API** | Subir un PPT/PPTX se rechaza con un mensaje que pide el PDF. Son ~500 MB de imagen y otro tanto de RAM al convertir: no cabe en 1 GB. Se añade cuando haya máquina |
| **Réplica única de la API** | El cron vive dentro del proceso; con dos réplicas cada ronda de obligaciones se ejecutaría dos veces. Escalar exige antes sacar el disparador a un worker: es mover el disparo, no rehacer la lógica |
| **El contador del límite por IP vive en memoria** | Con varias réplicas cada una llevaría el suyo. Redis ya está en el compose para cuando toque |
| **`TRUSTED_PROXY_HOPS`** | Con este compose, Caddy es un salto: **1**. De menos, toda la empresa comparte el límite por IP; de más, cualquiera se inventa su IP en la cabecera |
| **Sin dominio propio no hay subdominio por empresa** | Con un cliente da igual; con dos, hace falta el dominio (o entrar siempre con `?tenant=`) |
