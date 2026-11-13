/**
 * Imprime el hash argon2id de una contraseña, para OWNER_PASSWORD_HASH (la migración AddUsers).
 *
 *   npm run hash-password -w @greenlight/api
 *
 * La contraseña se pide por consola sin mostrarla. También acepta una línea por stdin (para scripts):
 *   echo "mi-clave" | npm run hash-password -w @greenlight/api
 */
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import * as argon2 from 'argon2';

const MIN_LENGTH = 10;

function askHidden(question: string): Promise<string> {
  let muted = false;
  // Un "output" que se traga lo que se escribe mientras `muted` está activo: el eco de las teclas no sale
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) process.stdout.write(chunk, encoding);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY === true });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      if (muted) process.stdout.write('\n');
      resolve(answer);
    });
    muted = process.stdin.isTTY === true;
  });
}

async function main(): Promise<void> {
  const password = await askHidden('Contraseña: ');
  if (password.length < MIN_LENGTH) {
    console.error(`La contraseña debe tener al menos ${MIN_LENGTH} caracteres.`);
    process.exit(1);
  }
  if (process.stdin.isTTY) {
    const again = await askHidden('Repítela: ');
    if (again !== password) {
      console.error('No coinciden.');
      process.exit(1);
    }
  }

  const hash = await argon2.hash(password);
  console.log('\nCopia esta línea en apps/api/.env (con comillas simples: el hash tiene "$" y así ninguna herramienta lo toma por una variable):\n');
  console.log(`OWNER_PASSWORD_HASH='${hash}'`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
