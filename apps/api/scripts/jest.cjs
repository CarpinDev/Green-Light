/**
 * Ejecuta Jest con --experimental-vm-modules.
 *
 * Por qué: @nestjs/config y @nestjs/jwt se publican solo como módulos ES, y Jest corre el código como CommonJS.
 * Con ese flag Jest sabe cargarlos (Node 24 ya trae require(esm); el flag es lo que le falta a Jest). Se hace con
 * un script y no con NODE_OPTIONS en package.json porque "VAR=valor comando" no existe en cmd de Windows.
 *
 *   node scripts/jest.cjs [argumentos de jest]
 */
const { spawnSync } = require('node:child_process');

const jestBin = require.resolve('jest/bin/jest');
const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', jestBin, ...process.argv.slice(2)], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
