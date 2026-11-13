# Green Light (API)

API REST de Green Light en NestJS + TypeORM + Postgres. Guarda productos y movimientos, y le pasa los datos al motor (`@greenlight/engine`) para proyectar el fin de mes, simular compras y validar extractos. Escucha en el puerto 3001 (cambia con `PORT`). Instalación completa en el [README de la raíz](../../README.md).

**Módulos** (`src/`): `products` (tarjetas, préstamos, cuentas), `movements` (gastos, categorías, abonos a capital), `incomes` (ingresos y gastos fijos), `settings`, `projection` (proyección y simulaciones) y `statements` (validación del extracto).

**Variables** (`apps/api/.env`, copia de `.env.example`; valores de desarrollo local):

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=greenlight
DB_PASSWORD=greenlight
DB_NAME=greenlight
```

Comandos, desde la raíz del repo (con Postgres arriba y el motor compilado):

```bash
npm run start:dev -w @greenlight/api        # API con recarga
npm run migration:run -w @greenlight/api    # aplicar migraciones (también migration:generate y migration:revert)
npm run test -w @greenlight/api             # pruebas unitarias
npm run test:e2e -w @greenlight/api         # extremo a extremo, necesita Postgres
npm run lint:check -w @greenlight/api       # ESLint sin modificar archivos
```

En `requests/` hay peticiones `.http` de ejemplo por módulo.
