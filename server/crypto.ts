import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

interface KeystoreData {
  dbKeyHex: string;
  sessionSecretHex: string;
  syncTokenHex: string;
  createdAt: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const KEYSTORE_PATH = path.join(DATA_DIR, '.keystore.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

function loadOrCreateKeystore(): KeystoreData {
  ensureDataDir();
  if (fs.existsSync(KEYSTORE_PATH)) {
    try {
      const raw = fs.readFileSync(KEYSTORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<KeystoreData>;
      if (parsed.dbKeyHex && parsed.sessionSecretHex && parsed.syncTokenHex) {
        return parsed as KeystoreData;
      }
    } catch {
      // Regenerate keystore if corrupted
    }
  }

  const created: KeystoreData = {
    dbKeyHex: crypto.randomBytes(32).toString('hex'),
    sessionSecretHex: crypto.randomBytes(32).toString('hex'),
    syncTokenHex: crypto.randomBytes(24).toString('hex'),
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(KEYSTORE_PATH, JSON.stringify(created, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
  return created;
}

const keystore = loadOrCreateKeystore();

function getMasterDbKey(): Buffer {
  const envKey = process.env.DB_ENCRYPTION_KEY?.trim();
  if (envKey) {
    return crypto.scryptSync(envKey, 'emelshipping-aes256-salt-v1', 32);
  }
  return Buffer.from(keystore.dbKeyHex, 'hex');
}

function getSessionSecret(): Buffer {
  const envSecret = process.env.SESSION_SECRET?.trim();
  if (envSecret) {
    return crypto.scryptSync(envSecret, 'emelshipping-session-salt-v1', 32);
  }
  return Buffer.from(keystore.sessionSecretHex, 'hex');
}

export function getSyncApiToken(): string {
  return process.env.SYNC_API_TOKEN?.trim() || keystore.syncTokenHex;
}

export function encryptField(plaintext: string): string {
  const key = getMasterDbKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptField(payload: string): string {
  if (!payload.startsWith('v1:')) {
    throw new Error('Desteklenmeyen şifreli veri formatı');
  }
  const parts = payload.split(':');
  if (parts.length !== 4) {
    throw new Error('Bozuk şifreli veri bloğu');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const key = getMasterDbKey();
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

export function encryptJson<T>(value: T): string {
  return encryptField(JSON.stringify(value));
}

export function decryptJson<T>(payload: string): T {
  return JSON.parse(decryptField(payload)) as T;
}

export function blindIndex(value: string): string {
  const normalized = value.trim().toUpperCase();
  return crypto
    .createHmac('sha256', getMasterDbKey())
    .update(`idx:${normalized}`)
    .digest('hex');
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, salt, originalHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) {
    return false;
  }
  return crypto.timingSafeEqual(derived, original);
}

export interface SessionPayload {
  userId: number;
  username: string;
  role: 'admin' | 'operator';
  displayName: string;
  exp: number;
}

export function signSessionToken(payload: Omit<SessionPayload, 'exp'>, ttlHours = 12): string {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Date.now() + ttlHours * 60 * 60 * 1000,
  };
  const body = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(body)
    .digest('base64url');
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;
  const body = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);

  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(body)
    .digest('base64url');

  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.exp || Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
