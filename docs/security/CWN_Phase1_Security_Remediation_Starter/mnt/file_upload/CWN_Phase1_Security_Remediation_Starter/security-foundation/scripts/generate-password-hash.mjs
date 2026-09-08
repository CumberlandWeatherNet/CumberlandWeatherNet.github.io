import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import readline from 'node:readline/promises';
import process from 'node:process';

const scrypt = promisify(scryptCallback);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const password = await rl.question('Enter a new CWN administrator password: ', { hideEchoBack: true });
rl.close();

if (password.length < 16) {
  console.error('\nPassword must be at least 16 characters.');
  process.exit(1);
}

const N = 16384;
const r = 8;
const p = 1;
const salt = randomBytes(16);
const derivedKey = await scrypt(password, salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });
console.log(`\nCWN_ADMIN_PASSWORD_HASH=scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${derivedKey.toString('hex')}`);
console.log('Store this value only in the private environment configuration.');
