# Green Light (API)

API REST de Green Light en NestJS + TypeORM + Postgres. Guarda productos y movimientos **por usuario** y le pasa los datos al motor (`@greenlight/engine`) para proyectar el fin de mes, simular compras y validar extractos. Escucha en el puerto 3001 (cambia con `PORT`). Instalación completa en el [README de la raíz](../../README.md).

**Módulos** (`src/`): `auth` y `users` (registro, login, guard), `products` (tarjetas, préstamos, cuentas), `movements` (gastos, categorías, abonos a capital), `incomes` (ingresos y gastos fijos), `settings`, `projection` (proyección y simulaciones) y `statements` (validación del extracto).

## Autenticación

Multiusuario con JWT. Todas las rutas piden `Authorization: Bearer <token>` salvo `GET /`, `POST /auth/register` y `POST /auth/login`.

| Ruta | Qué hace |
| --- | --- |
| `POST /auth/register` | `{ email, name, password, inviteCode }`. Contraseña de 10 a 128 caracteres. 403 con un código de invitación incorrecto, 409 si el email ya existe. |
| `POST /auth/login` | `{ email, password }` → `{ accessToken, expiresAt, user }`. Un 401 genérico, igual con un email inexistente que con una contraseña mala. |
| `GET /auth/me` | Quién eres según el token. |

Login y registro tienen límite de intentos (5 por minuto por IP). Lo de otra persona responde **404**, no 403, para no revelar que existe.

## Variables de entorno (`apps/api/.env`, copia de `.env.example`)

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=greenlight
DB_PASSWORD=greenlight
DB_NAME=greenlight
JWT_SECRET=          # obligatoria, mínimo 32 caracteres aleatorios
JWT_EXPIRES_IN=30d
INVITE_CODE=         # obligatorio: el código que pide el registro
```

Los valores de la base son los de desarrollo local. **La API no arranca** sin `JWT_SECRET` (de 32 caracteres o más) ni `INVITE_CODE`. Genera un secreto con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Opcionales: `DB_SSL` (por defecto SSL si el host no es `localhost`), `DATABASE_URL_DIRECT` (la conexión directa de Neon, solo para migraciones), `TRUST_PROXY=1` (detrás de Render, para que el límite de intentos use la IP real) y `AUTH_RATE_LIMIT`.

## Comandos (desde la raíz del repo, con Postgres arriba y el motor compilado)

```bash
npm run start:dev -w @greenlight/api          # API con recarga
npm run test -w @greenlight/api               # pruebas unitarias
npm run test:e2e -w @greenlight/api           # la app completa contra Postgres local (docker compose up -d)
npm run lint:check -w @greenlight/api         # ESLint sin modificar archivos
npm run hash-password -w @greenlight/api      # hash argon2 de una contraseña
```

Usa siempre `npm test`, no `npx jest` suelto: `@nestjs/config` y `@nestjs/jwt` son módulos ES y Jest necesita `--experimental-vm-modules`, que `npm test` ya pone (`scripts/jest.cjs`).

Las pruebas e2e y de migración **crean y borran bases `gl_e2e_*` en tu Postgres local** y se niegan a correr contra cualquier otro servidor. No leen `DB_*` de tu `.env` (que puede apuntar a Neon).

## Migraciones

```bash
npm run migration:run -w @greenlight/api      # aplicar las pendientes
npm run migration:revert -w @greenlight/api   # deshacer la última
npm run migration:generate -w @greenlight/api -- "src/database/migrations/NombreDelCambio"
```

### La migración `AddUsers` (de un solo usuario a varios)

Asigna todo lo que ya existe a una dueña, que crea con tres variables **solo para esta migración** (no hacen falta para arrancar la API):

```env
OWNER_EMAIL=tu@email.com
OWNER_NAME=Tu Nombre
OWNER_PASSWORD_HASH='$argon2id$v=19$...'
```

El hash sale de `npm run hash-password -w @greenlight/api` (pide la contraseña sin mostrarla e imprime la línea lista). Va entre comillas simples porque lleva `$`. Si hay datos y falta cualquiera de las tres, la migración **falla sin cambiar nada**. En una base vacía no crea a nadie. `migration:revert` solo funciona mientras haya un único usuario.

Contra Neon, migra por la conexión **directa** (host sin `-pooler`; el pooler en modo transacción puede romper migraciones):

```env
DATABASE_URL_DIRECT='postgresql://usuario:clave@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require'
```

El CLI usa esa URL si existe; la API sigue usando las `DB_*`. Haz antes un respaldo (rama de Neon `backup-antes-auth` y, opcional, `pg_dump`).

En `requests/` hay peticiones `.http` de ejemplo por módulo (ahora llevan `Authorization`).
