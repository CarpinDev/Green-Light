# Green Light (motor)

`@greenlight/engine`: cálculo financiero en TypeScript puro, sin Nest ni interfaz. Lo usa la API; la app móvil no lo importa. Instalación completa en el [README de la raíz](../../README.md).

El dinero va en centavos enteros y las tasas y divisiones con `decimal.js`, nunca con `float`. Cubre tasas E.A./M.V., calendario de cortes, amortización y abonos a capital, tarjetas y extractos, préstamos, proyección con semáforo, simulador de compras, validación del mínimo contra el banco y alertas.

```bash
npm run build -w @greenlight/engine   # compila a dist/ (la API importa dist/)
npm test -w @greenlight/engine        # Vitest
```
