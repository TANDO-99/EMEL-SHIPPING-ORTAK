import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  blindIndex,
  decryptJson,
  encryptJson,
  hashPassword,
  verifyPassword,
} from './crypto.ts';
import type { TrackingMilestone } from './carriers.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
}

const DB_PATH = path.join(DATA_DIR, 'emelshipping.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'operator')),
    display_name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS containers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    container_idx TEXT NOT NULL UNIQUE,
    encrypted_payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS excel_rows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_file TEXT NOT NULL CHECK(source_file IN ('Container List', 'Container List - Japan')),
    hoex_tokens TEXT NOT NULL,
    htex_tokens TEXT NOT NULL,
    container_tokens TEXT NOT NULL,
    encrypted_row TEXT NOT NULL,
    synced_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_excel_source ON excel_rows(source_file);

  CREATE TABLE IF NOT EXISTS excel_sync_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_file TEXT NOT NULL,
    encrypted_meta TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tracking_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    encrypted_entry TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_history_created ON tracking_history(created_at DESC);

  CREATE TABLE IF NOT EXISTS carrier_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    carrier_code TEXT NOT NULL UNIQUE,
    encrypted_config TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

function ensurePrimaryAdmin(): void {
  const adminUsername = 'EMELSHIPPING';
  const adminPass = '*A4484Emel82*';
  const existing = db
    .prepare('SELECT id, password_hash FROM users WHERE username = ?')
    .get(adminUsername) as { id: number; password_hash: string } | undefined;

  const now = new Date().toISOString();
  if (!existing) {
    db.prepare(
      `INSERT INTO users (username, password_hash, role, display_name, active, created_at)
       VALUES (?, ?, 'admin', 'Emel Shipping Yönetici', 1, ?)`
    ).run(adminUsername, hashPassword(adminPass), now);
  } else if (!verifyPassword(adminPass, existing.password_hash)) {
    db.prepare('UPDATE users SET password_hash = ?, role = ?, active = 1 WHERE id = ?').run(
      hashPassword(adminPass),
      'admin',
      existing.id
    );
  }
}

ensurePrimaryAdmin();

export interface UserRecord {
  id: number;
  username: string;
  role: 'admin' | 'operator';
  displayName: string;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export function authenticateUser(username: string, password: string): UserRecord | null {
  const normalized = username.trim();
  const row = db
    .prepare(
      `SELECT id, username, password_hash, role, display_name, active, created_at, last_login_at
       FROM users WHERE UPPER(username) = UPPER(?)`
    )
    .get(normalized) as
    | {
        id: number;
        username: string;
        password_hash: string;
        role: 'admin' | 'operator';
        display_name: string;
        active: number;
        created_at: string;
        last_login_at: string | null;
      }
    | undefined;

  if (!row || row.active !== 1) return null;
  if (!verifyPassword(password, row.password_hash)) return null;

  const now = new Date().toISOString();
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, row.id);

  return {
    id: row.id,
    username: row.username,
    role: row.role,
    displayName: row.display_name,
    active: true,
    createdAt: row.created_at,
    lastLoginAt: now,
  };
}

export function listUsers(): UserRecord[] {
  const rows = db
    .prepare(
      'SELECT id, username, role, display_name, active, created_at, last_login_at FROM users ORDER BY id ASC'
    )
    .all() as Array<{
    id: number;
    username: string;
    role: 'admin' | 'operator';
    display_name: string;
    active: number;
    created_at: string;
    last_login_at: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    role: r.role,
    displayName: r.display_name,
    active: r.active === 1,
    createdAt: r.created_at,
    lastLoginAt: r.last_login_at,
  }));
}

export function createOperatorUser(
  username: string,
  password: string,
  displayName: string,
  role: 'admin' | 'operator' = 'operator'
): UserRecord {
  const cleanUser = username.trim().toUpperCase();
  if (!cleanUser || cleanUser.length < 3) {
    throw new Error('Kullanıcı adı en az 3 karakter olmalıdır.');
  }
  if (!password || password.length < 6) {
    throw new Error('Şifre en az 6 karakter olmalıdır.');
  }
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO users (username, password_hash, role, display_name, active, created_at)
       VALUES (?, ?, ?, ?, 1, ?)`
    )
    .run(cleanUser, hashPassword(password), role, displayName.trim() || cleanUser, now);

  return {
    id: Number(result.lastInsertRowid),
    username: cleanUser,
    role,
    displayName: displayName.trim() || cleanUser,
    active: true,
    createdAt: now,
    lastLoginAt: null,
  };
}

export function deleteUserById(id: number): boolean {
  const row = db.prepare('SELECT username FROM users WHERE id = ?').get(id) as
    | { username: string }
    | undefined;
  if (!row || row.username === 'EMELSHIPPING') {
    return false;
  }
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return info.changes > 0;
}

export interface ContainerRecord {
  containerNumber: string;
  carrierCode: string;
  carrierName: string;
  blNumber?: string;
  bookingNumber?: string;
  importer?: string;
  customer?: string;
  region?: string;
  vehicle?: string;
  containerType?: string;
  vesselName?: string;
  voyageNumber?: string;
  imoNumber?: string;
  pol?: string;
  pod?: string;
  currentLocation?: string;
  status: string;
  etd?: string;
  eta?: string;
  mersinEta?: string;
  hoexCode?: string;
  htexCode?: string;
  portalUrl?: string;
  liveSource?: 'carrier-api' | 'ais-live' | 'excel-sync' | 'portal-handoff' | 'manual';
  milestones: TrackingMilestone[];
  notes?: string;
  favorite?: boolean;
  lastCheckedAt: string;
  updatedBy: string;
}

export function upsertContainer(record: ContainerRecord): ContainerRecord {
  const normalized = record.containerNumber.trim().toUpperCase();
  const idx = blindIndex(normalized);
  const existingRecord = getContainerByNumber(normalized);
  const finalRecord: ContainerRecord = {
    ...record,
    containerNumber: normalized,
    favorite: record.favorite !== undefined ? record.favorite : Boolean(existingRecord?.favorite),
  };
  const payload = encryptJson(finalRecord);
  const now = new Date().toISOString();

  const existing = db
    .prepare('SELECT id FROM containers WHERE container_idx = ?')
    .get(idx) as { id: number } | undefined;

  if (existing) {
    db.prepare('UPDATE containers SET encrypted_payload = ?, updated_at = ? WHERE id = ?').run(
      payload,
      now,
      existing.id
    );
  } else {
    db.prepare(
      'INSERT INTO containers (container_idx, encrypted_payload, updated_at) VALUES (?, ?, ?)'
    ).run(idx, payload, now);
  }

  return finalRecord;
}

export function setContainerFavorite(
  containerNumber: string,
  favorite: boolean,
  updatedBy: string
): ContainerRecord | null {
  const normalized = containerNumber.trim().toUpperCase();
  const existing = getContainerByNumber(normalized);
  if (!existing) return null;
  const updated: ContainerRecord = {
    ...existing,
    favorite,
    updatedBy,
  };
  return upsertContainer(updated);
}

export function getContainerByNumber(containerNumber: string): ContainerRecord | null {
  const idx = blindIndex(containerNumber.trim().toUpperCase());
  const row = db
    .prepare('SELECT encrypted_payload FROM containers WHERE container_idx = ?')
    .get(idx) as { encrypted_payload: string } | undefined;
  if (!row) return null;
  try {
    return decryptJson<ContainerRecord>(row.encrypted_payload);
  } catch {
    return null;
  }
}

export function listContainers(): ContainerRecord[] {
  const rows = db
    .prepare('SELECT encrypted_payload FROM containers ORDER BY updated_at DESC')
    .all() as Array<{ encrypted_payload: string }>;

  const result: ContainerRecord[] = [];
  for (const r of rows) {
    try {
      result.push(decryptJson<ContainerRecord>(r.encrypted_payload));
    } catch {
      // Skip unreadable row
    }
  }
  result.sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)));
  return result;
}

export function deleteContainerByNumber(containerNumber: string): boolean {
  const normalized = containerNumber.trim().toUpperCase();
  const existing = getContainerByNumber(normalized);
  if (existing?.favorite) {
    throw new Error('Favori olarak işaretlenen konteyner silinemez. Önce favorilerden çıkarın.');
  }
  const idx = blindIndex(normalized);
  const info = db.prepare('DELETE FROM containers WHERE container_idx = ?').run(idx);
  return info.changes > 0;
}

export type ExcelSourceFile = 'Container List' | 'Container List - Japan';

export interface ExcelListRow {
  id?: number;
  sourceFile: ExcelSourceFile;
  sheetName: string;
  rowNumber: number;
  hoexCodes: string[];
  htexCodes: string[];
  containerNumber: string;
  blNumber: string;
  bookingNumber?: string;
  importer?: string;
  region?: string;
  vehicle?: string;
  vessel: string;
  voyage: string;
  carrier: string;
  pol: string;
  pod: string;
  etd: string;
  eta: string;
  mersinEta?: string;
  status: string;
  customer: string;
  rawColumns: Record<string, string>;
  syncedAt: string;
}

export interface ExcelSyncRunMeta {
  sourceFile: ExcelSourceFile;
  fileName: string;
  serverAddress: string;
  rowCount: number;
  hoexCount: number;
  htexCount: number;
  syncedBy: string;
  syncMethod: 'unc-pull' | 'sync-agent' | 'manual-upload';
  syncedAt: string;
}

export function replaceExcelRows(
  sourceFile: ExcelSourceFile,
  rows: Omit<ExcelListRow, 'id'>[],
  meta: ExcelSyncRunMeta
): void {
  const insertStmt = db.prepare(
    `INSERT INTO excel_rows (source_file, hoex_tokens, htex_tokens, container_tokens, encrypted_row, synced_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM excel_rows WHERE source_file = ?').run(sourceFile);
    for (const row of rows) {
      const hoexTokens = row.hoexCodes.map((c) => c.toUpperCase()).join('|');
      const htexTokens = row.htexCodes.map((c) => c.toUpperCase()).join('|');
      const containerTokens = row.containerNumber.toUpperCase();
      insertStmt.run(
        sourceFile,
        hoexTokens,
        htexTokens,
        containerTokens,
        encryptJson(row),
        row.syncedAt
      );
    }

    db.prepare(
      'INSERT INTO excel_sync_runs (source_file, encrypted_meta, created_at) VALUES (?, ?, ?)'
    ).run(sourceFile, encryptJson(meta), meta.syncedAt);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function extractIsoDateFromCell(val: string): string | null {
  const s = val.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return null;
}

const KNOWN_CARRIER_WORDS = ['COSCO', 'ONE', 'EVERGREEN', 'MAERSK', 'MSC', 'CMA', 'HAPAG', 'YANG MING', 'ARKAS', 'TURKON'];

function isLikelyDateStr(val: string): boolean {
  return Boolean(extractIsoDateFromCell(val));
}

function enrichJapanPositionalRow(decoded: ExcelListRow): ExcelListRow {
  const keys = Object.keys(decoded.rawColumns || {});
  const vals = Object.values(decoded.rawColumns || {}).map((v) => String(v || '').trim());

  // Detect positional Japan sheet layout (either headerless Sütun N keys or row-1 sample keys like "5", "2022-10-07", "IBRAHIM AYDIN")
  const isPositionalJapan =
    decoded.sourceFile === 'Container List - Japan' &&
    vals.length >= 9 &&
    (keys[0] === 'Sütun 1' || /^\d+$/.test(keys[0] || '') || isLikelyDateStr(keys[1] || ''));

  const allCodes = Array.from(
    new Set(
      [...(decoded.hoexCodes || []), ...(decoded.htexCodes || [])]
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean)
    )
  );
  const hoexCodes = allCodes.filter((c) => c.startsWith('HOEX'));
  const htexCodes = allCodes.filter((c) => c.startsWith('HTEX'));
  const otherCodes = allCodes.filter((c) => !c.startsWith('HOEX') && !c.startsWith('HTEX'));

  let containerNumber = (decoded.containerNumber || '').trim().toUpperCase();
  if (!containerNumber) {
    for (const v of vals) {
      const m = v.toUpperCase().match(/\b[A-Z]{4}\d{7}\b/);
      if (m) {
        containerNumber = m[0];
        break;
      }
    }
  }

  if (isPositionalJapan) {
    const etdVal = extractIsoDateFromCell(vals[1] || '') || decoded.etd || '';
    const customerVal = decoded.customer || vals[2] || '';
    const importerVal = decoded.importer || vals[3] || '';
    const bookingVal = decoded.bookingNumber || vals[4] || '';
    const carrierVal = decoded.carrier || vals[5] || '';
    const rawCodeCol = (vals[6] || '').toUpperCase();
    const regionRaw = vals[7] || '';
    const regionVal =
      decoded.region ||
      (KNOWN_CARRIER_WORDS.some((c) => regionRaw.toUpperCase().includes(c)) ? '' : regionRaw) ||
      decoded.pol ||
      '';
    const mersinVal = extractIsoDateFromCell(vals[8] || '') || decoded.mersinEta || decoded.eta || '';
    const vehicleVal = decoded.vehicle || vals[10] || vals[9] || '';

    const finalHoex = [...hoexCodes];
    const finalHtex = [...htexCodes];
    if (rawCodeCol && rawCodeCol !== 'DG') {
      if (rawCodeCol.startsWith('HTEX') && !finalHtex.includes(rawCodeCol)) finalHtex.push(rawCodeCol);
      else if (rawCodeCol.startsWith('HOEX') && !finalHoex.includes(rawCodeCol)) finalHoex.push(rawCodeCol);
    }

    return {
      ...decoded,
      hoexCodes: finalHoex.length > 0 || finalHtex.length > 0 ? finalHoex : otherCodes,
      htexCodes: finalHtex,
      containerNumber,
      bookingNumber: bookingVal,
      blNumber: decoded.blNumber || finalHtex[0] || finalHoex[0] || bookingVal,
      customer: customerVal,
      importer: importerVal,
      carrier: carrierVal,
      region: regionVal,
      pol: decoded.pol || regionVal,
      pod: decoded.pod || 'Mersin',
      etd: etdVal,
      eta: mersinVal || decoded.eta || '',
      mersinEta: mersinVal || decoded.eta || '',
      vehicle: vehicleVal,
    };
  }

  const foundDates: string[] = [];
  for (const v of vals) {
    const iso = extractIsoDateFromCell(v);
    if (iso) foundDates.push(iso);
  }
  const uniqueSortedDates = Array.from(new Set(foundDates)).sort((a, b) => a.localeCompare(b));

  let etd = decoded.etd || '';
  let eta = decoded.eta || '';
  let mersinEta = decoded.mersinEta || '';
  if (uniqueSortedDates.length >= 2) {
    if (!etd) etd = uniqueSortedDates[0];
    if (!mersinEta) mersinEta = uniqueSortedDates[uniqueSortedDates.length - 1];
    if (!eta) eta = mersinEta;
  } else if (uniqueSortedDates.length === 1 && !mersinEta && !eta && !etd) {
    mersinEta = uniqueSortedDates[0];
    eta = uniqueSortedDates[0];
  }

  return {
    ...decoded,
    hoexCodes: hoexCodes.length > 0 || htexCodes.length > 0 ? hoexCodes : otherCodes,
    htexCodes,
    containerNumber,
    region: decoded.region || decoded.pol || decoded.sheetName || '',
    etd,
    eta,
    mersinEta: mersinEta || eta,
  };
}

function enrichExcelDataset(rows: ExcelListRow[]): ExcelListRow[] {
  const enriched = rows.map(enrichJapanPositionalRow);

  // Propagate booking-block metadata for Container List (e.g. UK, ARRIVED sheets)
  interface BlockState {
    bookingNumber: string;
    vessel: string;
    carrier: string;
    etd: string;
    mersinEta: string;
    currentContainer: string;
    lastContainerIdx: number;
  }

  const blocks = new Map<string, BlockState>();

  for (let i = 0; i < enriched.length; i++) {
    const row = enriched[i];
    if (row.sourceFile === 'Container List - Japan') continue;

    const sheetKey = `${row.sourceFile}::${row.sheetName}`;
    const keys = Object.keys(row.rawColumns || {});
    const vals = Object.values(row.rawColumns || {}).map((v) => String(v || '').trim());
    const col0 = (vals[0] || '').toUpperCase();

    let state = blocks.get(sheetKey) || {
      bookingNumber: '',
      vessel: '',
      carrier: '',
      etd: '',
      mersinEta: '',
      currentContainer: '',
      lastContainerIdx: -1,
    };

    // Detect Booking header row (e.g. "Booking No:": "COEU9021252700", "XIN NAN TONG / 641S": "TT:")
    const hasTtMarker = vals.some((v) => v.toUpperCase() === 'TT:' || v.toUpperCase().startsWith('TT:'));
    const looksLikeBooking = /^[A-Z]{2,5}\d{6,}$/.test(col0);
    if (looksLikeBooking || hasTtMarker) {
      let vesselFromKey = '';
      for (const k of keys) {
        if (k.includes('/') && !k.toLowerCase().includes('vessel')) {
          vesselFromKey = k.trim();
          break;
        }
      }
      const vesselFromCell = vals.find((v, idx) => idx > 0 && v.includes('/') && !v.includes(':')) || '';
      state = {
        bookingNumber: looksLikeBooking ? col0 : state.bookingNumber,
        vessel: vesselFromKey || vesselFromCell || state.vessel,
        carrier: '',
        etd: '',
        mersinEta: '',
        currentContainer: '',
        lastContainerIdx: -1,
      };
      blocks.set(sheetKey, state);
      row.bookingNumber = state.bookingNumber;
      row.vessel = row.vessel || state.vessel;
      row.region = row.region || row.sheetName;
      continue;
    }

    // Detect ETS / ETA / Carrier row (e.g. col0 === "ETS:")
    if (col0.startsWith('ETS')) {
      const dates = vals.map(extractIsoDateFromCell).filter((d): d is string => Boolean(d)).sort();
      if (dates.length >= 1) state.etd = dates[0];
      if (dates.length >= 2) state.mersinEta = dates[dates.length - 1];
      const carrierCell = vals.find((v, idx) => idx >= 4 && v && !extractIsoDateFromCell(v) && !/^\d+$/.test(v));
      if (carrierCell) state.carrier = carrierCell;
      blocks.set(sheetKey, state);
      row.bookingNumber = state.bookingNumber;
      row.vessel = row.vessel || state.vessel;
      row.carrier = row.carrier || state.carrier;
      row.etd = row.etd || state.etd;
      row.mersinEta = row.mersinEta || state.mersinEta;
      row.eta = row.eta || state.mersinEta;
      row.region = row.region || row.sheetName;
      continue;
    }

    // Container row (e.g. CSNU2997503)
    if (row.containerNumber) {
      state.currentContainer = row.containerNumber;
      state.lastContainerIdx = i;
      blocks.set(sheetKey, state);

      row.bookingNumber = row.bookingNumber || state.bookingNumber;
      row.vessel = row.vessel || state.vessel;
      row.carrier = row.carrier || state.carrier;
      row.etd = row.etd || state.etd;
      row.mersinEta = row.mersinEta || state.mersinEta;
      row.eta = row.eta || state.mersinEta;
      row.region = row.region || row.sheetName;
      row.pol = row.pol || row.sheetName;
      row.pod = row.pod || 'Mersin';
      continue;
    }

    // Vehicle / Customer row belonging to the active container
    const vehicleCandidate = vals[0] || '';
    const customerCandidate = vals[5] || vals[4] || '';
    if (vehicleCandidate && !isLikelyDateStr(vehicleCandidate)) {
      row.bookingNumber = row.bookingNumber || state.bookingNumber;
      row.vessel = row.vessel || state.vessel;
      row.carrier = row.carrier || state.carrier;
      row.etd = row.etd || state.etd;
      row.mersinEta = row.mersinEta || state.mersinEta;
      row.eta = row.eta || state.mersinEta;
      row.region = row.region || row.sheetName;
      row.pol = row.pol || row.sheetName;
      row.pod = row.pod || 'Mersin';
      row.containerNumber = row.containerNumber || state.currentContainer;
      row.vehicle = row.vehicle || vehicleCandidate;
      row.customer = row.customer || customerCandidate;

      // Also enrich the parent container row with the first vehicle / customer summary
      if (state.lastContainerIdx >= 0) {
        const parent = enriched[state.lastContainerIdx];
        if (parent) {
          parent.vehicle = parent.vehicle
            ? parent.vehicle.includes(vehicleCandidate)
              ? parent.vehicle
              : `${parent.vehicle}, ${vehicleCandidate}`
            : vehicleCandidate;
          if (!parent.customer && customerCandidate) {
            parent.customer = customerCandidate;
          } else if (parent.customer && customerCandidate && !parent.customer.includes(customerCandidate)) {
            parent.customer = `${parent.customer}, ${customerCandidate}`;
          }
        }
      }
    }
  }

  return enriched;
}

export function searchExcelRows(params: {
  q?: string;
  codeType?: 'ALL' | 'HOEX' | 'HTEX';
  source?: 'ALL' | ExcelSourceFile;
  limit?: number;
}): ExcelListRow[] {
  const { q = '', codeType = 'ALL', source = 'ALL', limit = 250 } = params;
  const queryUpper = q.trim().toUpperCase();

  let sql = 'SELECT id, encrypted_row, hoex_tokens, htex_tokens, container_tokens, source_file FROM excel_rows WHERE 1=1';
  const args: string[] = [];

  if (source !== 'ALL') {
    sql += ' AND source_file = ?';
    args.push(source);
  }
  if (codeType === 'HOEX') {
    sql += " AND hoex_tokens != ''";
  } else if (codeType === 'HTEX') {
    sql += " AND htex_tokens != ''";
  }

  sql += ' ORDER BY id ASC';
  const dbRows = db.prepare(sql).all(...args) as Array<{
    id: number;
    encrypted_row: string;
    hoex_tokens: string;
    htex_tokens: string;
    container_tokens: string;
    source_file: string;
  }>;

  const decodedRows: ExcelListRow[] = [];
  for (const r of dbRows) {
    try {
      const rawDecoded = decryptJson<ExcelListRow>(r.encrypted_row);
      rawDecoded.id = r.id;
      decodedRows.push(rawDecoded);
    } catch {
      // Skip malformed row
    }
  }

  const allEnriched = enrichExcelDataset(decodedRows);
  const matched: ExcelListRow[] = [];

  for (const decoded of allEnriched) {
    if (!queryUpper) {
      matched.push(decoded);
    } else {
      const haystack = [
        ...decoded.hoexCodes,
        ...decoded.htexCodes,
        decoded.containerNumber,
        decoded.bookingNumber || '',
        decoded.blNumber,
        decoded.importer || '',
        decoded.region || '',
        decoded.vehicle || '',
        decoded.vessel,
        decoded.voyage,
        decoded.carrier,
        decoded.pol,
        decoded.pod,
        decoded.etd,
        decoded.mersinEta || '',
        decoded.customer,
        decoded.status,
        ...Object.values(decoded.rawColumns || {}),
      ]
        .join(' ')
        .toUpperCase();

      if (haystack.includes(queryUpper)) {
        matched.push(decoded);
      }
    }

    if (matched.length >= limit) break;
  }

  return matched;
}

export function findExcelMatchesByContainer(containerNumber: string): ExcelListRow[] {
  const target = containerNumber.trim().toUpperCase();
  if (!target) return [];
  const altTarget = target.startsWith('C0')
    ? target.replace(/^C0/i, 'CO')
    : target.startsWith('CO')
    ? target.replace(/^CO/i, 'C0')
    : '';

  const candidates = searchExcelRows({ q: target, limit: 25 });
  const altCandidates = altTarget ? searchExcelRows({ q: altTarget, limit: 25 }) : [];
  const merged = [...candidates, ...altCandidates];
  const seenIds = new Set<number>();
  const uniqueRows: ExcelListRow[] = [];
  for (const r of merged) {
    if (r.id !== undefined && !seenIds.has(r.id)) {
      seenIds.add(r.id);
      uniqueRows.push(r);
    }
  }

  return uniqueRows.filter(
    (r) =>
      r.containerNumber.toUpperCase() === target ||
      (r.bookingNumber || '').toUpperCase() === target ||
      r.blNumber.toUpperCase() === target ||
      (altTarget !== '' &&
        (r.containerNumber.toUpperCase() === altTarget ||
          (r.bookingNumber || '').toUpperCase() === altTarget ||
          r.blNumber.toUpperCase() === altTarget)) ||
      r.hoexCodes.some(
        (c) => c.toUpperCase() === target || (altTarget !== '' && c.toUpperCase() === altTarget)
      ) ||
      r.htexCodes.some(
        (c) => c.toUpperCase() === target || (altTarget !== '' && c.toUpperCase() === altTarget)
      ) ||
      Object.values(r.rawColumns).some(
        (v) =>
          v.toUpperCase().includes(target) ||
          (altTarget !== '' && v.toUpperCase().includes(altTarget))
      )
  );
}

export function getExcelStats(): {
  totalRows: number;
  containerListRows: number;
  japanListRows: number;
  hoexRowCount: number;
  htexRowCount: number;
  recentSyncRuns: ExcelSyncRunMeta[];
} {
  const counts = db
    .prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN source_file = 'Container List' THEN 1 ELSE 0 END) as mainCount,
         SUM(CASE WHEN source_file = 'Container List - Japan' THEN 1 ELSE 0 END) as japanCount,
         SUM(CASE WHEN hoex_tokens != '' THEN 1 ELSE 0 END) as hoexCount,
         SUM(CASE WHEN htex_tokens != '' THEN 1 ELSE 0 END) as htexCount
       FROM excel_rows`
    )
    .get() as {
    total: number;
    mainCount: number | null;
    japanCount: number | null;
    hoexCount: number | null;
    htexCount: number | null;
  };

  const runs = db
    .prepare('SELECT encrypted_meta FROM excel_sync_runs ORDER BY id DESC LIMIT 10')
    .all() as Array<{ encrypted_meta: string }>;

  const recentSyncRuns: ExcelSyncRunMeta[] = [];
  for (const run of runs) {
    try {
      recentSyncRuns.push(decryptJson<ExcelSyncRunMeta>(run.encrypted_meta));
    } catch {
      // ignore
    }
  }

  return {
    totalRows: counts.total || 0,
    containerListRows: counts.mainCount || 0,
    japanListRows: counts.japanCount || 0,
    hoexRowCount: counts.hoexCount || 0,
    htexRowCount: counts.htexCount || 0,
    recentSyncRuns,
  };
}

export interface HistoryEntry {
  id?: number;
  timestamp: string;
  eventType: 'QUERY' | 'STATUS_UPDATE' | 'EXCEL_SYNC' | 'AUTH';
  username: string;
  containerNumber?: string;
  carrierCode?: string;
  carrierName?: string;
  hoexCode?: string;
  htexCode?: string;
  vesselName?: string;
  location?: string;
  status?: string;
  note: string;
  ipAddress?: string;
}

export function appendHistory(entry: Omit<HistoryEntry, 'id'>): void {
  db.prepare(
    'INSERT INTO tracking_history (event_type, encrypted_entry, created_at) VALUES (?, ?, ?)'
  ).run(entry.eventType, encryptJson(entry), entry.timestamp);
}

export function queryHistory(params: {
  from?: string;
  to?: string;
  carrier?: string;
  eventType?: string;
  q?: string;
  limit?: number;
}): HistoryEntry[] {
  const { from, to, carrier, eventType, q, limit = 300 } = params;
  let sql = 'SELECT id, event_type, encrypted_entry, created_at FROM tracking_history WHERE 1=1';
  const args: string[] = [];

  if (eventType && eventType !== 'ALL') {
    sql += ' AND event_type = ?';
    args.push(eventType);
  }
  if (from) {
    sql += ' AND created_at >= ?';
    args.push(from);
  }
  if (to) {
    sql += ' AND created_at <= ?';
    args.push(`${to}T23:59:59.999Z`);
  }

  sql += ' ORDER BY id DESC LIMIT 1000';
  const rows = db.prepare(sql).all(...args) as Array<{
    id: number;
    event_type: string;
    encrypted_entry: string;
    created_at: string;
  }>;

  const qUpper = q?.trim().toUpperCase() || '';
  const result: HistoryEntry[] = [];

  for (const r of rows) {
    try {
      const entry = decryptJson<HistoryEntry>(r.encrypted_entry);
      entry.id = r.id;

      if (carrier && carrier !== 'ALL' && entry.carrierCode !== carrier) {
        continue;
      }
      if (qUpper) {
        const hay = [
          entry.containerNumber,
          entry.carrierName,
          entry.hoexCode,
          entry.htexCode,
          entry.vesselName,
          entry.location,
          entry.status,
          entry.note,
          entry.username,
        ]
          .filter(Boolean)
          .join(' ')
          .toUpperCase();
        if (!hay.includes(qUpper)) continue;
      }

      result.push(entry);
      if (result.length >= limit) break;
    } catch {
      // skip
    }
  }

  return result;
}

export interface CarrierApiConfig {
  carrierCode: string;
  apiKey?: string;
  apiSecret?: string;
  updatedAt: string;
}

export function saveCarrierConfig(carrierCode: string, apiKey: string, apiSecret: string): void {
  const now = new Date().toISOString();
  const payload = encryptJson<CarrierApiConfig>({
    carrierCode,
    apiKey: apiKey.trim(),
    apiSecret: apiSecret.trim(),
    updatedAt: now,
  });

  const existing = db
    .prepare('SELECT id FROM carrier_configs WHERE carrier_code = ?')
    .get(carrierCode) as { id: number } | undefined;
  if (existing) {
    db.prepare('UPDATE carrier_configs SET encrypted_config = ?, updated_at = ? WHERE id = ?').run(
      payload,
      now,
      existing.id
    );
  } else {
    db.prepare(
      'INSERT INTO carrier_configs (carrier_code, encrypted_config, updated_at) VALUES (?, ?, ?)'
    ).run(carrierCode, payload, now);
  }
}

export function getCarrierConfig(carrierCode: string): CarrierApiConfig | null {
  const row = db
    .prepare('SELECT encrypted_config FROM carrier_configs WHERE carrier_code = ?')
    .get(carrierCode) as { encrypted_config: string } | undefined;
  if (!row) return null;
  try {
    return decryptJson<CarrierApiConfig>(row.encrypted_config);
  } catch {
    return null;
  }
}

export function listConfiguredCarriers(): Array<{ carrierCode: string; hasApiKey: boolean; updatedAt: string }> {
  const rows = db
    .prepare('SELECT carrier_code, encrypted_config, updated_at FROM carrier_configs')
    .all() as Array<{ carrier_code: string; encrypted_config: string; updated_at: string }>;

  return rows.map((r) => {
    try {
      const cfg = decryptJson<CarrierApiConfig>(r.encrypted_config);
      return {
        carrierCode: r.carrier_code,
        hasApiKey: Boolean(cfg.apiKey),
        updatedAt: r.updated_at,
      };
    } catch {
      return {
        carrierCode: r.carrier_code,
        hasApiKey: false,
        updatedAt: r.updated_at,
      };
    }
  });
}

export function getDatabaseStats(): {
  containerCount: number;
  excelRowCount: number;
  historyCount: number;
  userCount: number;
  dbSizeBytes: number;
} {
  const c1 = (db.prepare('SELECT COUNT(*) as n FROM containers').get() as { n: number }).n;
  const c2 = (db.prepare('SELECT COUNT(*) as n FROM excel_rows').get() as { n: number }).n;
  const c3 = (db.prepare('SELECT COUNT(*) as n FROM tracking_history').get() as { n: number }).n;
  const c4 = (db.prepare('SELECT COUNT(*) as n FROM users').get() as { n: number }).n;
  const stat = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH) : null;
  return {
    containerCount: c1,
    excelRowCount: c2,
    historyCount: c3,
    userCount: c4,
    dbSizeBytes: stat ? stat.size : 0,
  };
}
