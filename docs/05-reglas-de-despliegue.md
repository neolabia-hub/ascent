# Ascent — Reglas de despliegue: qué hacer, qué no hacer nunca

Este documento existe por una frase del cliente el día que salió a producción:

> *«Que los despliegues sean seguros. Reglas de qué hacer y qué no, para evitar errores y —lo más
> importante— pérdida de acceso de los usuarios y pérdida de datos. Que no se borre la base de datos
> por ningún motivo.»*

Las tres cosas que pueden arruinar el piloto son, por orden de gravedad:

1. **Borrar la base** — se pierde la evidencia, y la evidencia es el producto.
2. **Dejar a la gente sin acceso** — 600 personas sin poder entrar, o un administrador sin permisos.
3. **Romper el servicio** — molesto, pero se arregla en minutos si lo de arriba está intacto.

Casi todas las reglas de abajo protegen 1 y 2. Las de 3 son higiene.

---

## 1. Los seis comandos que NUNCA se ejecutan en producción

Ninguno de estos tiene un uso legítimo en la máquina del cliente. Si alguna vez parece que hace
falta uno, **es que el diagnóstico está mal**.

| Comando | Qué destruye | Qué hacer en su lugar |
|---|---|---|
| `docker compose down -v` | **La `-v` borra los volúmenes: la base entera.** Es un comando de desarrollo | `docker compose down` a secas para y conserva; casi siempre basta `up -d` |
| `docker volume rm` / `docker volume prune` | Lo mismo, sin avisar | Nada. Si sobra un volumen, se mira dos veces y se decide otro día |
| `prisma migrate reset` | **Borra y recrea la base.** Es lo que hace `migrate dev` cuando detecta un desfase | En producción solo `prisma migrate deploy`, que nunca borra |
| `prisma db push --force-reset` | Igual, y además sin migraciones | Escribir una migración |
| `docker system prune -a --volumes` | Limpia imágenes… y volúmenes | `docker image prune` a secas si falta disco |
| `DROP DATABASE` / `TRUNCATE` a mano | Lo que diga | Si hay que corregir datos: copia primero, `UPDATE` acotado con `WHERE`, y verificar el conteo antes y después |

**La regla de oro:** cualquier orden que lleve `-v`, `--volumes`, `reset`, `prune`, `force` o `drop`
se para y se piensa. Ninguna de esas palabras arregla una caída.

---

## 2. Lo que deja a la gente sin acceso (y no lo parece)

Esto es más traicionero que borrar la base, porque **no rompe nada visiblemente**: la aplicación
sigue en pie y la gente simplemente no puede entrar o no ve lo suyo.

### `RUN_SEED` se queda en `false`. Siempre.

La semilla **reemplaza el juego completo de permisos de cada rol** y repasa catálogos y tipos de
formación. Ya borró una vez la parametrización de un cliente (RUNBOOK, 2026-09-08). Es idempotente
para *crear*, no para *conservar lo que el administrador cambió a mano*.

- Se pone en `true` **una sola vez**, en el primer arranque de una instalación nueva.
- Inmediatamente después se vuelve a `false`.
- ¿Hace falta un permiso nuevo? `dev:sincronizar-permisos`, que **solo añade** y no quita.

### Las llaves y los secretos no se regeneran «por si acaso»

| Si cambias… | Lo que pasa |
|---|---|
| `apps/api/keys/private.pem` | **Todas las sesiones abiertas mueren.** Todo el mundo fuera; vuelven entrando otra vez |
| `REFRESH_TOKEN_PEPPER` | Igual, y además invalida los *refresh tokens* guardados |
| `MEDIA_URL_SECRET` | Los enlaces firmados de vídeos y documentos dejan de abrir |
| `POSTGRES_PASSWORD` en el `.env.prod` | **La API deja de conectar.** Postgres ya se inicializó con la contraseña vieja: el archivo no la cambia, solo cambia lo que la API intenta usar |
| Las credenciales de R2 | Los medios dejan de servirse hasta que se actualicen las cuatro variables |

Todas son recuperables **si se sabe qué se tocó**. Por eso: un cambio a la vez, y anotado.

### El certificado y el dominio

- **Cloudflare en `SSL/TLS → Full (strict)`**. Nunca «Flexible»: en Flexible, Cloudflare habla con el
  servidor por HTTP plano y las contraseñas de tus usuarios viajan sin cifrar en ese tramo.
- **`NEXT_PUBLIC_API_URL` va VACÍA** mientras haya subdominio por empresa. Se hornea en la imagen al
  construir; ponerle el dominio raíz funciona en el raíz y **rompe en todos los subdominios**, que es
  justo donde entran los clientes. (Pasó el día del despliegue: *«No pudimos conectar con el
  servidor»* en `transprensa.ascentio.app`.)
- **El dominio no se cambia después de emitir constancias.** El QR impreso apunta a él: cambiarlo
  deja sin verificar todos los certificados ya entregados.

---

## 3. El despliegue seguro, paso a paso

Cinco pasos, siempre en este orden. El primero no se salta nunca.

```bash
# 1. COPIA ANTES DE TOCAR NADA, y comprobar que no salió vacía.
cd /opt/ascent
export $(grep -E "^R2_" .env.prod | xargs)
BACKUP_DIR=/opt/ascent/backups AWS_DEFAULT_REGION=auto bash scripts/backup.sh

# 2. Traer el código.
git pull

# 3. Reconstruir las imágenes. LAS MIGRACIONES VIAJAN DENTRO DE LA IMAGEN:
#    un `git pull` sin reconstruir despliega el código viejo y no avisa.
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod build

# 4. Levantar. El servicio `migrate` corre solo, termina, y solo entonces arranca la API.
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod up -d

# 5. COMPROBAR que responde de verdad, no que el contenedor esté "up".
curl -fsS https://ascentio.app/v1/health
curl -fsS -o /dev/null -w '%{http_code}\n' https://transprensa.ascentio.app/login
```

**Si algo falla en el 4 o el 5**, la marcha atrás es **por código, nunca por base de datos**:

```bash
git checkout <commit-anterior>
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod up -d
```

Una migración ya aplicada **no se deshace**: se escribe otra que corrija. Deshacer migraciones a mano
es la vía más corta a perder datos.

---

## 4. Migraciones: las tres reglas

1. **Una migración aplicada no se edita.** Si ya corrió en cualquier base, cambiar su SQL rompe el
   historial. Se escribe una nueva.
2. **Toda migración se prueba desde CERO**, contra una base recién creada:
   ```bash
   docker run -d --name prueba-migra -e POSTGRES_PASSWORD=x -e POSTGRES_DB=x -p 55432:5432 postgres:16-alpine
   docker exec prueba-migra psql -U postgres -d x -c "CREATE ROLE neopulse_app LOGIN PASSWORD 'x';"
   DATABASE_URL=... DIRECT_DATABASE_URL=... pnpm --filter @neo-pulse/api exec prisma migrate deploy
   docker rm -f prueba-migra
   ```
   **Esto no se hizo nunca hasta el 2026-09-09 y costó el primer despliegue**: dos migraciones tenían
   marcas de tiempo cruzadas —una usaba una columna que la otra creaba *después*— y en desarrollo
   nunca falló porque allí la columna ya existía. Una cadena de migraciones **solo está probada
   cuando se corre desde cero**.
3. **Nada de `DROP COLUMN` sin dos despliegues.** Primero se deja de usar la columna y se despliega;
   en el siguiente se borra. Si hay que volver atrás en el medio, los datos siguen ahí.

---

## 5. Las copias: qué hay montado y cómo se usa

| | |
|---|---|
| **Cuándo** | Todos los días a las 03:00 (hora del servidor, UTC), por `cron` de `linuxuser` |
| **Qué** | `pg_dump -Fc` de la base entera |
| **Dónde** | `/opt/ascent/backups` **y** copia fuera de la máquina en `s3://ascent-media/backups/` |
| **Cuánto se guarda** | 14 días en el servidor; en R2 no se borran solas |
| **Registro** | `/opt/ascent/backups/backup.log` |

El script **se niega a dejar un archivo vacío**: si el volcado sale de 0 bytes, lo borra y falla. Un
respaldo vacío que parece existir es peor que no tenerlo.

### Comprobar que la copia sirve (una vez al mes, y antes de cualquier cambio grande)

```bash
bash scripts/restaurar-prueba.sh /opt/ascent/backups/<archivo>.dump
```

Restaura en una base **de usar y tirar** —producción no se toca— y cuenta personas, formaciones,
obligaciones, inscripciones y constancias. Si los números no cuadran con producción, no hay copia.

### Restaurar de verdad (solo si se perdió la base)

```bash
# 1. Parar la API para que nadie escriba mientras tanto. NO se usa `down -v`.
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod stop api web

# 2. Restaurar sobre una base NUEVA, nunca encima de la existente.
docker exec neo-pulse-postgres-1 psql -U neopulse -d postgres -c "CREATE DATABASE neopulse_nueva;"
docker exec -i neo-pulse-postgres-1 pg_restore -U neopulse -d neopulse_nueva --no-owner < copia.dump

# 3. Comprobar los conteos ANTES de apuntar la aplicación ahí.
# 4. Cambiar el nombre de la base en DATABASE_URL / DIRECT_DATABASE_URL y levantar.
```

**Restaurar encima de la base viva es la forma clásica de quedarse sin las dos.**

---

## 6. Lo que hay que vigilar, y qué significa

| Señal | Dónde | Qué hacer |
|---|---|---|
| CPU sostenida > 70 %, o RAM tocando el *swap* | Gráficas del panel de Vultr | Subir de plan: es un reinicio de dos minutos |
| Errores 5xx nuevos tras un despliegue | Sentry (pendiente de configurar) | **Revertir primero, diagnosticar después.** `main` siempre desplegable |
| El servicio no responde | Vigilante externo (pendiente) | `docker compose ps` y `logs api` |
| `backup.log` sin líneas nuevas | `/opt/ascent/backups/backup.log` | El cron dejó de correr. Es urgente: sin copia, todo lo demás da igual |

---

## 7. Lo que todavía NO está, y conviene saberlo

- **Sentry y el vigilante de disponibilidad**: sin ellos, el primer aviso de que algo se cayó lo da
  el cliente.
- **Réplica única de la API**: el cron de obligaciones vive dentro del proceso. Con dos réplicas cada
  ronda se ejecutaría dos veces. Escalar exige antes sacar el disparador a un worker.
- **Las credenciales de R2 se pegaron en una conversación** el día del despliegue. Conviene rotarlas
  cuando haya calma: crear un token nuevo en R2, actualizar las cuatro variables y borrar el viejo.
- **LibreOffice no está** (no cabe en 4 GB): un `.pptx` se rechaza pidiendo el PDF.
