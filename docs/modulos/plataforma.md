# Capa de plataforma (superadmin)

Quien **opera** el producto, por encima de todos los clientes.

Decisión #100.

---

## 1. Qué es y por qué existe

Hasta el Sprint 5 el producto solo conocía **una clase de persona**: alguien que pertenece a una
empresa. Eso cubre todo lo que pasa *dentro* de un cliente y se queda corto para lo que está *por
encima* de todos: hoy los datos de contacto del proveedor, mañana listar, dar de alta y suspender
clientes.

---

## 2. Tres tablas sin `tenant_id` y sin RLS

| Tabla | Qué guarda |
|---|---|
| `platform_users` | Las cuentas del proveedor (argon2, bloqueo por cuenta) |
| `platform_sessions` | Sus sesiones. Misma mecánica que `user_sessions` |
| `platform_settings` | **Una sola fila** (`id = 1`, con CHECK en la base de datos) |

No llevan aislamiento **a propósito**: no pertenecen a ninguna empresa, así que no hay nada de un
cliente que proteger de otro. Lo que las protege es el token.

El CHECK del singleton no es celo: de ese dato solo puede haber uno, y con dos filas habría dos
verdades sobre el contacto del proveedor decidiéndose por orden de inserción.

---

## 3. Por qué una cuenta aparte y no una bandera en un usuario

Se consideró marcar la cuenta que ya existe dentro de TRANSPRENSA. Era más rápido y deja al
proveedor **viviendo dentro de un cliente**: el día que ese tenant se desactive —o que ese cliente se
vaya— el acceso a la administración de todos los demás se iría con él.

Y un administrador de cliente con permiso sobre roles no puede tener ni la posibilidad teórica de
concederse esto.

---

## 4. Las dos clases de token no se cruzan

Se firman con **las mismas claves** —no hay un segundo par que rotar— y lo que las separa es el
**contenido**:

| | Lleva | En la otra capa |
|---|---|---|
| Token de tenant | `tenantId`, sin `scope` | `PlatformGuard` exige `scope: 'platform'` → rechazado |
| Token de plataforma | `scope: 'platform'`, sin `tenantId` | `JwtStrategy` exige `tenantId` → rechazado |

**La segunda fila es la que de verdad importa**: sin ella, una cuenta de proveedor podría hablar con
los endpoints de un cliente **sin que RLS supiera a qué empresa acotar** — que es exactamente el
agujero que la política de aislamiento existe para tapar.

Cubierto en `platform.guard.spec.ts`, incluida la prueba de que un token de tenant bien firmado no
entra.

Las rutas van marcadas `@Public()`: eso **no las abre**, las saca de la cadena de guards de tenants
para que las vigile la suya.

**Cookie y `path` propios** (`np_platform_refresh`, `path=/v1/platform`). Si compartieran nombre con
la de los tenants, entrar como proveedor cerraría la sesión de cliente en el mismo navegador y al
revés — y dar soporte es tener las dos abiertas a la vez.

---

## 5. El alta es un script, no una pantalla

```
pnpm --filter @neo-pulse/api cuenta:plataforma <correo> "<Nombre Apellido>"
```

Crear una cuenta que administra a todos los clientes exige acceso al servidor y a la base de datos —
que es el **mismo nivel de privilegio que la cuenta concede**. La contraseña se genera dentro y se
imprime una vez; no se acepta por parámetro porque acabaría en el historial del terminal.

El script también **reactiva y repone**, así que es el camino de vuelta si la única cuenta se
bloquea. Al reponerla cierra las sesiones abiertas: si sobrevivieran, quien estuviera dentro seguiría
dentro siete días más pese al cambio.

`/plataforma/login` **no tiene «No puedo entrar»**: aquí no hay nadie por encima a quien acudir, y
anunciar el script sería contar por dónde se rehace la cuenta que manda sobre todo.

---

## 6. Qué hace hoy

Una sola cosa: **los datos de contacto del proveedor**, que salen en «No puedo entrar» de cualquier
cliente que no haya puesto el suyo (ver `arquitectura.md` §3.06).

Es poco a propósito. Lo que ya está puesto es lo que **no se puede improvisar después**: la cuenta
fuera de los tenants, su ingreso y su token. Añadir pantallas encima es barato; migrar sesiones vivas
a otra clase de cuenta, no.

---

## 7. Diseño de la pantalla

Deliberadamente **sobria**, y es lo contrario del ingreso de los clientes. Aquel es la cara de la
empresa —color de marca a media pantalla, logo, el pulso latiendo— porque es donde se presenta ante
su gente. Esta la abren dos personas que ya saben dónde están.

Adornarla igual solo conseguiría que las dos pantallas se confundieran, y **confundirlas es lo único
que no puede pasar**: aquí se entra con credenciales que administran a todos los clientes a la vez.

No lleva colores de tenant porque **no hay tenant**: las variables de marca ni siquiera están
inyectadas en esa ruta.

---

## 8. Dónde está cada cosa

| Qué | Dónde |
|---|---|
| El guard que separa las dos capas | `apps/api/src/platform/platform.guard.ts` |
| Ingreso, refresco y sesiones | `apps/api/src/platform/platform-auth.service.ts` |
| Ajustes del proveedor | `apps/api/src/platform/platform.controller.ts` |
| Alta de cuentas | `apps/api/scripts/crear-cuenta-plataforma.ts` |
| Ingreso y consola | `apps/web/src/app/plataforma/` |

---

## 9. Lo que viene encima

El **módulo de administración de clientes**: listar, dar de alta, suspender, ver consumo. Y una
pantalla de sesiones para verlas y cerrarlas.
