import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import session from 'express-session';

const FILE_VERSION = 1;
const ALGORITHM = 'aes-256-gcm';

function encryptionKey(secret) {
  return createHash('sha256').update(secret, 'utf8').digest();
}

function encrypt(value, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return JSON.stringify({
    version: FILE_VERSION,
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  });
}

function decrypt(value, key) {
  const envelope = JSON.parse(value);
  if (envelope.version !== FILE_VERSION) {
    throw new Error('Unsupported dashboard session-store version');
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(envelope.iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64url')),
    decipher.final(),
  ]);

  return JSON.parse(plaintext.toString('utf8'));
}

function expiresAt(value) {
  const expires = value?.cookie?.expires;
  const parsed = expires ? new Date(expires).getTime() : Number.POSITIVE_INFINITY;
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

export class EncryptedFileSessionStore extends session.Store {
  #file;
  #key;
  #sessions = new Map();
  #queue = Promise.resolve();
  #ready;

  constructor({ file, secret }) {
    super();
    this.#file = file;
    this.#key = encryptionKey(secret);
    this.#ready = this.#load();

    const cleanupTimer = setInterval(
      () => {
        this.#removeExpired().catch(() => {});
      },
      15 * 60 * 1_000,
    );
    cleanupTimer.unref();
  }

  async ready() {
    await this.#ready;
  }

  get(sessionId, callback) {
    this.#ready
      .then(() => {
        const value = this.#sessions.get(sessionId);
        if (value && expiresAt(value) <= Date.now()) {
          this.#sessions.delete(sessionId);
          this.#persist().catch(() => {});
          callback(null, null);
          return;
        }
        callback(null, value ?? null);
      })
      .catch(callback);
  }

  set(sessionId, value, callback = () => {}) {
    this.#ready
      .then(() => {
        this.#sessions.set(sessionId, value);
        return this.#persist();
      })
      .then(() => callback())
      .catch(callback);
  }

  destroy(sessionId, callback = () => {}) {
    this.#ready
      .then(() => {
        this.#sessions.delete(sessionId);
        return this.#persist();
      })
      .then(() => callback())
      .catch(callback);
  }

  touch(sessionId, value, callback = () => {}) {
    this.set(sessionId, value, callback);
  }

  async #load() {
    await mkdir(path.dirname(this.#file), { recursive: true });

    try {
      const stored = decrypt(await readFile(this.#file, 'utf8'), this.#key);
      if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
        throw new Error('Invalid dashboard session store');
      }
      this.#sessions = new Map(Object.entries(stored));
      const now = Date.now();
      for (const [sessionId, value] of this.#sessions) {
        if (expiresAt(value) <= now) this.#sessions.delete(sessionId);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async #removeExpired() {
    await this.#ready;
    let changed = false;

    for (const [sessionId, value] of this.#sessions) {
      if (expiresAt(value) <= Date.now()) {
        this.#sessions.delete(sessionId);
        changed = true;
      }
    }

    if (changed) {
      await this.#persist();
    }
  }

  #persist() {
    const snapshot = Object.fromEntries(this.#sessions);
    this.#queue = this.#queue
      .catch(() => {})
      .then(async () => {
        const temporary = `${this.#file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
        try {
          await writeFile(temporary, encrypt(snapshot, this.#key), {
            encoding: 'utf8',
            mode: 0o600,
          });
          await rename(temporary, this.#file);
        } catch (error) {
          await unlink(temporary).catch(() => {});
          throw error;
        }
      });
    return this.#queue;
  }
}
