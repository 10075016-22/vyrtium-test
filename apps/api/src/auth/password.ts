import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// scrypt from node:crypto: memory-hard, no native dependency. N=2^14, r=8, p=1 (OWASP baseline).
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

function derive(password: string, salt: Buffer, cost: number, blockSize: number, parallelization: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N: cost, r: blockSize, p: parallelization }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/** Returns `scrypt$N$r$p$salt$hash` (base64 parts) so parameters can evolve per hash. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, COST, BLOCK_SIZE, PARALLELIZATION);
  return ['scrypt', COST, BLOCK_SIZE, PARALLELIZATION, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, cost, blockSize, parallelization, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !cost || !blockSize || !parallelization || !salt || !hash) return false;

  const expected = Buffer.from(hash, 'base64');
  const actual = await derive(
    password,
    Buffer.from(salt, 'base64'),
    Number(cost),
    Number(blockSize),
    Number(parallelization),
  );
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
