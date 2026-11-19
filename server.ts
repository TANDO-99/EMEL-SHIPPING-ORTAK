import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import {
  CARRIERS,
  detectCarrier,
  extractCleanVesselName,
  queryCarrierLive,
  queryVesselLive,
  validateIso6346,
  type TrackingMilestone,
  type VesselLiveResult,
} from './server/carriers.ts';
import {
  getSyncApiToken,
  signSessionToken,
  verifySessionToken,
  type SessionPayload,
} from './server/crypto.ts';
import {
  appendHistory,
  authenticateUser,
  createOperatorUser,
  deleteContainerByNumber,
  deleteUserById,
  findExcelMatchesByContainer,
  getCarrierConfig,
  getContainerByNumber,
  getDatabaseStats,
  getExcelStats,
  listConfiguredCarriers,
  listContainers,
  listUsers,
  queryHistory,
  replaceExcelRows,
  saveCarrierConfig,
  searchExcelRows,
  setContainerFavorite,
  upsertContainer,
  type ContainerRecord,
  type ExcelSourceFile,
} from './server/db.ts';
import {
  buildExcelReportBuffer,
  findUncExcelFiles,
  generateSyncAgentScript,
  parseExcelWorkbook,
} from './server/excel.ts';

interface AuthenticatedRequest extends Request {
  user?: SessionPayload;
}

const SESSION_COOKIE_NAME = 'emel_session';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

function getRequestIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function isHttpsRequest(req: Request): boolean {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function extractSession(req: Request): SessionPayload | null {
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  const authHeader = req.headers.authorization;
  const bearerToken =
    authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  return verifySessionToken(bearerToken || cookieToken);
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const session = extractSession(req);
  if (!session) {
    res.status(401).json({ error: 'Oturum doğrulanamadı. Lütfen yönetici panelinden giriş yapın.' });
    return;
  }
  req.user = session;
  next();
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Bu işlem için yalnızca yönetici (Admin) yetkisi gereklidir.' });
    return;
  }
  next();
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function startServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', 1);

  app.use(
    helmet({
      frameguard: false,
      contentSecurityPolicy: false,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '50mb' }));

  // Healthcheck
  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      ssl: isHttpsRequest(req),
      encryption: 'AES-256-GCM',
      timestamp: new Date().toISOString(),
    });
  });

  // Authentication Endpoints
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = (req.body || {}) as {
      username?: string;
      password?: string;
    };

    if (!username || !password) {
      res.status(400).json({ error: 'Kullanıcı adı ve şifre zorunludur.' });
      return;
    }

    const user = authenticateUser(username, password);
    if (!user) {
      appendHistory({
        timestamp: new Date().toISOString(),
        eventType: 'AUTH',
        username: username.trim().toUpperCase() || 'BILINMEYEN',
        status: 'Başarısız Giriş',
        note: 'Geçersiz kullanıcı adı veya şifre denemesi engellendi.',
        ipAddress: getRequestIp(req),
      });
      res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
      return;
    }

    const token = signSessionToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      displayName: user.displayName,
    });

    const httpsActive = isHttpsRequest(req);
    res.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: httpsActive,
      sameSite: httpsActive ? 'none' : 'lax',
      maxAge: 12 * 60 * 60 * 1000,
      path: '/',
    });

    appendHistory({
      timestamp: new Date().toISOString(),
      eventType: 'AUTH',
      username: user.username,
      status: 'Başarılı Giriş',
      note: `Oturum açıldı (${user.role === 'admin' ? 'Yönetici' : 'Operatör'})`,
      ipAddress: getRequestIp(req),
    });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.displayName,
      },
      token,
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    const httpsActive = isHttpsRequest(req);
    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: httpsActive,
      sameSite: httpsActive ? 'none' : 'lax',
      path: '/',
    });
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const session = extractSession(req);
    if (!session) {
      res.status(401).json({ authenticated: false });
      return;
    }
    res.json({
      authenticated: true,
      user: {
        id: session.userId,
        username: session.username,
        role: session.role,
        displayName: session.displayName,
      },
    });
  });

  // Team User Management (Admin Only - for 6-7 staff members)
  app.get('/api/users', requireAuth, requireAdmin, (_req, res) => {
    res.json({ users: listUsers() });
  });

  app.post('/api/users', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    try {
      const { username, password, displayName, role } = req.body as {
        username?: string;
        password?: string;
        displayName?: string;
        role?: 'admin' | 'operator';
      };
      const created = createOperatorUser(
        username || '',
        password || '',
        displayName || '',
        role === 'admin' ? 'admin' : 'operator'
      );
      appendHistory({
        timestamp: new Date().toISOString(),
        eventType: 'AUTH',
        username: req.user!.username,
        status: 'Kullanıcı Oluşturuldu',
        note: `Yeni ekip üyesi eklendi: ${created.username}`,
        ipAddress: getRequestIp(req),
      });
      res.status(201).json({ user: created });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kullanıcı oluşturulamadı.';
      res.status(400).json({ error: msg.includes('UNIQUE') ? 'Bu kullanıcı adı zaten kayıtlı.' : msg });
    }
  });

  app.delete('/api/users/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'Geçersiz kullanıcı numarası.' });
      return;
    }
    const deleted = deleteUserById(id);
    if (!deleted) {
      res.status(400).json({ error: 'Ana yönetici hesabı (EMELSHIPPING) silinemez veya kullanıcı bulunamadı.' });
      return;
    }
    res.json({ ok: true });
  });

  // Carrier Metadata
  app.get('/api/carriers', requireAuth, (_req, res) => {
    const configured = listConfiguredCarriers();
    const map = new Map(configured.map((c) => [c.carrierCode, c]));
    res.json({
      carriers: CARRIERS.map((c) => ({
        code: c.code,
        name: c.name,
        shortName: c.shortName,
        trackingUrl: c.trackingUrl,
        prefixes: c.prefixes,
        regionFocus: c.regionFocus,
        hasApiKey: map.get(c.code)?.hasApiKey || false,
      })),
      multiCarrier: [
        {
          code: 'JSONCARGO',
          name: 'JSONCargo (Tüm Armatörler)',
          hasApiKey: map.get('JSONCARGO')?.hasApiKey || false,
        },
        {
          code: 'SHIPSGO',
          name: 'ShipsGo (Tüm Armatörler)',
          hasApiKey: map.get('SHIPSGO')?.hasApiKey || false,
        },
      ],
    });
  });

  app.post('/api/carriers/config', requireAuth, requireAdmin, (req, res) => {
    const { carrierCode, apiKey, apiSecret } = req.body as {
      carrierCode?: string;
      apiKey?: string;
      apiSecret?: string;
    };
    const validMulti = carrierCode === 'JSONCARGO' || carrierCode === 'SHIPSGO';
    if (!carrierCode || (!validMulti && !CARRIERS.some((c) => c.code === carrierCode))) {
      res.status(400).json({ error: 'Geçersiz armatör veya servis kodu.' });
      return;
    }
    saveCarrierConfig(carrierCode, apiKey || '', apiSecret || '');
    res.json({ ok: true });
  });

  // Live Vessel AIS Lookup (VesselFinder)
  app.post('/api/vessels/live', requireAuth, async (req, res) => {
    const { vesselName } = (req.body || {}) as { vesselName?: string };
    const clean = (vesselName || '').trim();
    if (clean.length < 3) {
      res.status(400).json({ error: 'Lütfen en az 3 karakterlik bir gemi adı girin.' });
      return;
    }
    const result = await queryVesselLive(clean);
    if (!result) {
      res.status(404).json({ error: `${clean} gemisi için canlı AIS kaydı bulunamadı.` });
      return;
    }
    res.json({ vesselLive: result });
  });

  // Container & Vessel Tracking Query
  app.post('/api/track', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { trackingNumber, carrierCode } = (req.body || {}) as {
      trackingNumber?: string;
      carrierCode?: string;
    };

    const rawInput = (trackingNumber || '').trim().toUpperCase();
    if (!rawInput || rawInput.length < 3) {
      res.status(400).json({ error: 'Lütfen geçerli bir konteyner, konşimento (B/L), booking veya gemi adı girin.' });
      return;
    }
    // Normalize C0EU -> COEU and C0SU -> COSU typos on search input
    const raw = rawInput.replace(/^C0/i, 'CO');

    const existingRecord = getContainerByNumber(raw) || (rawInput !== raw ? getContainerByNumber(rawInput) : null);
    const excelMatches = findExcelMatchesByContainer(raw);
    const primaryExcel = excelMatches[0];

    const isoCheck = validateIso6346(raw);
    const carrierHint = existingRecord?.carrierName || primaryExcel?.carrier || '';
    const detectedCarrier = detectCarrier(raw, carrierCode, carrierHint);
    const carrierCfg = detectedCarrier ? getCarrierConfig(detectedCarrier.code) : null;
    const jsoncargoCfg = getCarrierConfig('JSONCARGO');
    const shipsgoCfg = getCarrierConfig('SHIPSGO');

    const liveResult = await queryCarrierLive(
      raw,
      detectedCarrier,
      {
        apiKey: carrierCfg?.apiKey,
        apiSecret: carrierCfg?.apiSecret,
      },
      {
        jsoncargoKey: jsoncargoCfg?.apiKey,
        shipsgoKey: shipsgoCfg?.apiKey,
      }
    );

    // Resolve vessel + voyage cleanly and fetch live VesselFinder AIS position/ETA
    const rawVesselCandidate =
      liveResult.vesselName ||
      existingRecord?.vesselName ||
      primaryExcel?.vessel ||
      (!isoCheck.isContainerFormat && !primaryExcel && /^[A-Z][A-Z0-9\s\-]{2,35}$/.test(raw) ? raw : '');

    const parsedVessel = extractCleanVesselName(rawVesselCandidate);
    const cleanVesselName = parsedVessel.vesselName || rawVesselCandidate.trim();
    const resolvedVoyage =
      liveResult.voyageNumber ||
      existingRecord?.voyageNumber ||
      primaryExcel?.voyage ||
      parsedVessel.voyageNumber ||
      '';

    let vesselLive: VesselLiveResult | null = null;
    if (cleanVesselName) {
      vesselLive = await queryVesselLive(cleanVesselName);
    }

    const now = new Date().toISOString();
    const todayIso = now.slice(0, 10);
    const mergedHoex = existingRecord?.hoexCode || primaryExcel?.hoexCodes[0] || '';
    const mergedHtex = existingRecord?.htexCode || primaryExcel?.htexCodes[0] || '';

    const aisMentionsMersin = Boolean(
      vesselLive?.destination &&
        (vesselLive.destination.toUpperCase().includes('MERSIN') ||
          vesselLive.destination.toUpperCase().includes('TRMER'))
    );

    let fallbackEta = '';
    const etdBase = primaryExcel?.etd || existingRecord?.etd;
    if (etdBase) {
      const d = new Date(etdBase);
      if (!Number.isNaN(d.getTime())) {
        d.setDate(d.getDate() + 18);
        fallbackEta = d.toISOString().slice(0, 10);
      }
    }
    if (!fallbackEta) {
      const d = new Date();
      d.setDate(d.getDate() + 14);
      fallbackEta = d.toISOString().slice(0, 10);
    }

    const resolvedMersinEta =
      primaryExcel?.mersinEta ||
      primaryExcel?.eta ||
      existingRecord?.mersinEta ||
      liveResult.eta ||
      (aisMentionsMersin ? vesselLive?.etaIso || '' : '') ||
      existingRecord?.eta ||
      (aisMentionsMersin ? vesselLive?.etaIso || '' : '') ||
      fallbackEta;

    const resolvedEta =
      liveResult.eta ||
      vesselLive?.etaIso ||
      resolvedMersinEta ||
      existingRecord?.eta ||
      primaryExcel?.eta ||
      '';

    const staleSafeStatus =
      existingRecord?.status && existingRecord.status !== 'Portal Doğrulaması Bekliyor'
        ? existingRecord.status
        : '';

    let resolvedStatus = '';
    if (liveResult.liveSource === 'carrier-api' && liveResult.status) {
      resolvedStatus = liveResult.status;
    } else if (resolvedMersinEta && resolvedMersinEta <= todayIso) {
      resolvedStatus = 'Mersin Limanına Vardı';
    } else if (vesselLive?.navigationStatusTr) {
      resolvedStatus = vesselLive.navigationStatusTr;
    } else if (staleSafeStatus) {
      resolvedStatus = staleSafeStatus;
    } else if (primaryExcel?.status && primaryExcel.status !== 'Portal Doğrulaması Bekliyor') {
      resolvedStatus = primaryExcel.status;
    } else if (resolvedMersinEta) {
      resolvedStatus = 'Deniz Seyrinde (Mersin Planlı)';
    } else {
      resolvedStatus = 'Canlı Takip / Veri Girişi Bekleniyor';
    }

    const aisLocation = vesselLive
      ? vesselLive.isArrived && vesselLive.destination
        ? `${vesselLive.destination} (${vesselLive.navigationStatusTr?.replace(' (Canlı AIS)', '') || 'Limanda'})`
        : vesselLive.destination
        ? `${vesselLive.lastPort ? `${vesselLive.lastPort} → ` : ''}Hedef: ${vesselLive.destination}`
        : vesselLive.lastPort || ''
      : '';

    const resolvedLocation =
      liveResult.currentLocation ||
      aisLocation ||
      existingRecord?.currentLocation ||
      primaryExcel?.region ||
      primaryExcel?.pol ||
      '';

    // Build merged timeline including live AIS updates if carrier portal was blocked
    let mergedMilestones: TrackingMilestone[] =
      liveResult.milestones.length > 0
        ? liveResult.milestones
        : existingRecord?.milestones || [];

    if (vesselLive && liveResult.liveSource !== 'carrier-api') {
      const aisMilestones: TrackingMilestone[] = [];
      if (vesselLive.destination) {
        aisMilestones.push({
          date: vesselLive.etaDisplay || vesselLive.etaIso || now.slice(0, 16).replace('T', ' '),
          event: vesselLive.isArrived
            ? `Gemi Limana Ulaştı (${vesselLive.destination})`
            : `Hedef Limana İlerliyor (${vesselLive.destination})`,
          location: vesselLive.destination,
          vessel: vesselLive.vesselName,
          completed: Boolean(vesselLive.isArrived),
        });
      }
      if (vesselLive.lastPort) {
        aisMilestones.push({
          date: vesselLive.atdDisplay || now.slice(0, 10),
          event: 'Son Uğrak Limanından Ayrıldı (Canlı AIS)',
          location: vesselLive.lastPort,
          vessel: vesselLive.vesselName,
          completed: true,
        });
      }
      const existingCustom = (existingRecord?.milestones || []).filter(
        (m) => !m.event.includes('Canlı AIS') && !m.event.startsWith('Hedef Limana İlerliyor') && !m.event.startsWith('Gemi Limana Ulaştı')
      );
      if (aisMilestones.length > 0) {
        mergedMilestones = [...aisMilestones, ...existingCustom];
      }
    }

    const resolvedNotice =
      liveResult.liveSource === 'carrier-api'
        ? liveResult.notice
        : vesselLive
        ? `${vesselLive.vesselName} (IMO ${vesselLive.imoNumber}) gemisi için VesselFinder üzerinden canlı AIS konumu ve ETA bilgisi çekildi.`
        : primaryExcel
        ? `${primaryExcel.sourceFile} listesi üzerinden Mersin varış, booking ve yük bilgileri eşleştirildi.`
        : liveResult.notice;

    const mergedRecord: ContainerRecord = {
      containerNumber: raw,
      carrierCode:
        liveResult.carrierCode !== 'UNKNOWN'
          ? liveResult.carrierCode
          : detectedCarrier?.code || existingRecord?.carrierCode || 'UNKNOWN',
      carrierName:
        liveResult.carrierCode !== 'UNKNOWN'
          ? liveResult.carrierName
          : detectedCarrier?.name || existingRecord?.carrierName || primaryExcel?.carrier || 'Tanımlanmamış Armatör',
      blNumber: existingRecord?.blNumber || primaryExcel?.blNumber || '',
      bookingNumber: existingRecord?.bookingNumber || primaryExcel?.bookingNumber || '',
      importer: existingRecord?.importer || primaryExcel?.importer || '',
      customer: existingRecord?.customer || primaryExcel?.customer || '',
      region: existingRecord?.region || primaryExcel?.region || primaryExcel?.pol || '',
      vehicle: existingRecord?.vehicle || primaryExcel?.vehicle || '',
      containerType: liveResult.containerType || existingRecord?.containerType || '',
      vesselName: cleanVesselName || vesselLive?.vesselName || '',
      voyageNumber: resolvedVoyage,
      imoNumber: existingRecord?.imoNumber || vesselLive?.imoNumber || '',
      pol: liveResult.pol || existingRecord?.pol || primaryExcel?.pol || primaryExcel?.region || '',
      pod: liveResult.pod || existingRecord?.pod || primaryExcel?.pod || 'Mersin',
      currentLocation: resolvedLocation,
      status: resolvedStatus,
      etd: liveResult.etd || existingRecord?.etd || primaryExcel?.etd || '',
      eta: resolvedEta,
      mersinEta: resolvedMersinEta,
      hoexCode: mergedHoex,
      htexCode: mergedHtex,
      portalUrl: liveResult.portalUrl,
      liveSource:
        liveResult.liveSource === 'carrier-api'
          ? 'carrier-api'
          : vesselLive
          ? 'ais-live'
          : primaryExcel
          ? 'excel-sync'
          : existingRecord?.liveSource || 'portal-handoff',
      milestones: mergedMilestones,
      notes: existingRecord?.notes || '',
      favorite: Boolean(existingRecord?.favorite),
      lastCheckedAt: now,
      updatedBy: req.user!.username,
    };

    // Always persist queried containers so records remain saved across sessions
    upsertContainer(mergedRecord);

    appendHistory({
      timestamp: now,
      eventType: 'QUERY',
      username: req.user!.username,
      containerNumber: raw,
      carrierCode: mergedRecord.carrierCode,
      carrierName: mergedRecord.carrierName,
      hoexCode: mergedHoex || undefined,
      htexCode: mergedHtex || undefined,
      vesselName: mergedRecord.vesselName || undefined,
      location: mergedRecord.currentLocation || undefined,
      status: mergedRecord.status,
      note: resolvedNotice,
      ipAddress: getRequestIp(req),
    });

    res.json({
      record: mergedRecord,
      isoCheck,
      liveSource: mergedRecord.liveSource,
      notice: resolvedNotice,
      excelMatches,
      vesselLive,
    });
  });

  app.get('/api/containers', requireAuth, (_req, res) => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const items = listContainers().map((c) => {
      if (c.status === 'Portal Doğrulaması Bekliyor') {
        const eta = c.mersinEta || c.eta;
        return {
          ...c,
          status:
            eta && eta <= todayIso
              ? 'Mersin Limanına Vardı'
              : eta
              ? 'Deniz Seyrinde (Mersin Planlı)'
              : 'Canlı Takip / Veri Girişi Bekleniyor',
        };
      }
      return c;
    });
    res.json({ containers: items });
  });

  app.post('/api/containers', requireAuth, (req: AuthenticatedRequest, res) => {
    const body = (req.body || {}) as Partial<ContainerRecord>;
    const containerNumber = (body.containerNumber || '').trim().toUpperCase();
    if (!containerNumber) {
      res.status(400).json({ error: 'Konteyner numarası zorunludur.' });
      return;
    }

    const detected = detectCarrier(containerNumber, body.carrierCode, body.carrierName);
    const existing = getContainerByNumber(containerNumber);
    const now = new Date().toISOString();

    const record: ContainerRecord = {
      containerNumber,
      carrierCode: detected?.code || body.carrierCode || existing?.carrierCode || 'UNKNOWN',
      carrierName: detected?.name || body.carrierName || existing?.carrierName || 'Diğer Armatör',
      blNumber: body.blNumber ?? existing?.blNumber ?? '',
      bookingNumber: body.bookingNumber ?? existing?.bookingNumber ?? '',
      importer: body.importer ?? existing?.importer ?? '',
      customer: body.customer ?? existing?.customer ?? '',
      region: body.region ?? existing?.region ?? '',
      vehicle: body.vehicle ?? existing?.vehicle ?? '',
      containerType: body.containerType ?? existing?.containerType ?? '',
      vesselName: body.vesselName ?? existing?.vesselName ?? '',
      voyageNumber: body.voyageNumber ?? existing?.voyageNumber ?? '',
      imoNumber: body.imoNumber ?? existing?.imoNumber ?? '',
      pol: body.pol ?? existing?.pol ?? '',
      pod: body.pod ?? existing?.pod ?? '',
      currentLocation: body.currentLocation ?? existing?.currentLocation ?? '',
      status:
        body.status && body.status !== 'Portal Doğrulaması Bekliyor'
          ? body.status
          : existing?.status && existing.status !== 'Portal Doğrulaması Bekliyor'
          ? existing.status
          : 'Deniz Seyrinde',
      etd: body.etd ?? existing?.etd ?? '',
      eta: body.eta ?? existing?.eta ?? '',
      mersinEta: body.mersinEta ?? existing?.mersinEta ?? body.eta ?? existing?.eta ?? '',
      hoexCode: (body.hoexCode ?? existing?.hoexCode ?? '').toUpperCase(),
      htexCode: (body.htexCode ?? existing?.htexCode ?? '').toUpperCase(),
      portalUrl: detected ? detected.buildDeepLink(containerNumber) : existing?.portalUrl,
      liveSource: 'manual',
      milestones: Array.isArray(body.milestones) ? body.milestones : existing?.milestones || [],
      notes: body.notes ?? existing?.notes ?? '',
      favorite: body.favorite !== undefined ? Boolean(body.favorite) : Boolean(existing?.favorite),
      lastCheckedAt: now,
      updatedBy: req.user!.username,
    };

    const saved = upsertContainer(record);

    appendHistory({
      timestamp: now,
      eventType: 'STATUS_UPDATE',
      username: req.user!.username,
      containerNumber: saved.containerNumber,
      carrierCode: saved.carrierCode,
      carrierName: saved.carrierName,
      hoexCode: saved.hoexCode || undefined,
      htexCode: saved.htexCode || undefined,
      vesselName: saved.vesselName || undefined,
      location: saved.currentLocation || undefined,
      status: saved.status,
      note: saved.notes || 'Operatör tarafından konteyner/gemi konumu güncellendi.',
      ipAddress: getRequestIp(req),
    });

    res.json({ record: saved });
  });

  app.patch('/api/containers/:containerNumber/favorite', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const num = decodeURIComponent(req.params.containerNumber).trim().toUpperCase();
      const favorite = Boolean((req.body as { favorite?: unknown })?.favorite);
      let updated = setContainerFavorite(num, favorite, req.user!.username);

      if (!updated) {
        const detected = detectCarrier(num);
        const now = new Date().toISOString();
        updated = upsertContainer({
          containerNumber: num,
          carrierCode: detected?.code || 'UNKNOWN',
          carrierName: detected?.name || 'Diğer Armatör',
          status: 'Favori Kaydı',
          portalUrl: detected ? detected.buildDeepLink(num) : undefined,
          liveSource: 'manual',
          milestones: [],
          favorite,
          lastCheckedAt: now,
          updatedBy: req.user!.username,
        });
      }

      appendHistory({
        timestamp: new Date().toISOString(),
        eventType: 'STATUS_UPDATE',
        username: req.user!.username,
        containerNumber: updated.containerNumber,
        carrierCode: updated.carrierCode,
        carrierName: updated.carrierName,
        status: favorite ? 'Favorilere Eklendi' : 'Favorilerden Çıkarıldı',
        note: favorite
          ? 'Konteyner favorilere eklenerek silinmeye karşı koruma altına alındı.'
          : 'Konteyner favorilerden çıkarıldı.',
        ipAddress: getRequestIp(req),
      });

      res.json({ record: updated });
    } catch (err) {
      console.error('[/api/containers/:containerNumber/favorite] Hata:', err);
      res.status(500).json({ error: 'Favori durumu güncellenemedi.' });
    }
  });

  app.delete('/api/containers/:containerNumber', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const num = decodeURIComponent(req.params.containerNumber).trim().toUpperCase();
      const ok = deleteContainerByNumber(num);
      if (!ok) {
        res.status(404).json({ error: 'Konteyner kaydı bulunamadı.' });
        return;
      }
      appendHistory({
        timestamp: new Date().toISOString(),
        eventType: 'STATUS_UPDATE',
        username: req.user!.username,
        containerNumber: num,
        status: 'Kayıt Silindi',
        note: 'Konteyner takip kaydı listeden kaldırıldı.',
        ipAddress: getRequestIp(req),
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Konteyner kaydı silinemedi.',
      });
    }
  });

  // Separate Excel List Search (Container List & Container List - Japan — HOEX / HTEX)
  app.get('/api/excel/search', requireAuth, (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const codeType =
        req.query.codeType === 'HOEX' || req.query.codeType === 'HTEX' ? req.query.codeType : 'ALL';
      const source =
        req.query.source === 'Container List' || req.query.source === 'Container List - Japan'
          ? req.query.source
          : 'ALL';

      const rows = searchExcelRows({ q, codeType, source, limit: 300 });
      res.json({ rows, totalMatched: rows.length });
    } catch (err) {
      console.error('[/api/excel/search] Hata:', err);
      res.status(500).json({ error: 'Excel liste araması sırasında sunucu hatası oluştu.' });
    }
  });

  app.get('/api/excel/stats', requireAuth, (_req, res) => {
    try {
      res.json(getExcelStats());
    } catch (err) {
      console.error('[/api/excel/stats] Hata:', err);
      res.status(500).json({ error: 'Senkronizasyon istatistikleri alınamadı.' });
    }
  });

  app.post(
    '/api/excel/upload',
    requireAuth,
    (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      upload.single('file')(req, res, (uploadErr: unknown) => {
        if (uploadErr) {
          console.error('[/api/excel/upload] Multer hatası:', uploadErr);
          if (uploadErr instanceof multer.MulterError && uploadErr.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({ error: 'Dosya boyutu 50 MB sınırını aşıyor.' });
            return;
          }
          res.status(400).json({
            error:
              uploadErr instanceof Error
                ? `Dosya yükleme hatası: ${uploadErr.message}`
                : 'Dosya yükleme isteği işlenemedi.',
          });
          return;
        }
        next();
      });
    },
    (req: AuthenticatedRequest, res: Response) => {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'Lütfen bir Excel (.xlsx / .xls / .csv) dosyası seçin.' });
        return;
      }

      const rawSource = typeof req.body?.sourceFile === 'string' ? req.body.sourceFile : '';
      let sourceFile: ExcelSourceFile = 'Container List';
      if (
        rawSource === 'Container List - Japan' ||
        file.originalname.toLowerCase().includes('japan')
      ) {
        sourceFile = 'Container List - Japan';
      }

      try {
        const { rows, hoexCount, htexCount } = parseExcelWorkbook(file.buffer, sourceFile);
        const now = new Date().toISOString();
        replaceExcelRows(sourceFile, rows, {
          sourceFile,
          fileName: file.originalname,
          serverAddress: '\\\\192.168.0.50',
          rowCount: rows.length,
          hoexCount,
          htexCount,
          syncedBy: req.user!.username,
          syncMethod: 'manual-upload',
          syncedAt: now,
        });

        appendHistory({
          timestamp: now,
          eventType: 'EXCEL_SYNC',
          username: req.user!.username,
          status: `${sourceFile} Yüklendi`,
          note: `${file.originalname}: ${rows.length} satır, ${hoexCount} HOEX, ${htexCount} HTEX kaydı şifrelenerek işlendi.`,
          ipAddress: getRequestIp(req),
        });

        res.json({
          ok: true,
          sourceFile,
          fileName: file.originalname,
          rowCount: rows.length,
          hoexCount,
          htexCount,
        });
      } catch (err) {
        console.error('[/api/excel/upload] Ayrıştırma hatası:', err);
        const message = err instanceof Error ? err.message : 'Excel dosyası ayrıştırılamadı.';
        res.status(400).json({ error: message });
      }
    }
  );

  // Automated LAN Sync Endpoint (for \\192.168.0.50 PowerShell / Agent)
  app.post('/api/sync/excel', (req: AuthenticatedRequest, res) => {
    const tokenHeader = req.headers['x-sync-token'];
    const tokenStr = typeof tokenHeader === 'string' ? tokenHeader.trim() : '';
    const session = extractSession(req);

    const validToken = tokenStr.length > 0 && timingSafeEqualStr(tokenStr, getSyncApiToken());
    if (!validToken && !session) {
      res.status(401).json({ error: 'Senkronizasyon jetonu veya oturum geçersiz.' });
      return;
    }

    const { sourceFile, fileName, serverAddress, fileBase64 } = (req.body || {}) as {
      sourceFile?: ExcelSourceFile;
      fileName?: string;
      serverAddress?: string;
      fileBase64?: string;
    };

    if (!fileBase64 || (sourceFile !== 'Container List' && sourceFile !== 'Container List - Japan')) {
      res.status(400).json({ error: 'Geçerli sourceFile ve fileBase64 verisi gereklidir.' });
      return;
    }

    try {
      const buffer = Buffer.from(fileBase64, 'base64');
      const { rows, hoexCount, htexCount } = parseExcelWorkbook(buffer, sourceFile);
      const now = new Date().toISOString();
      const actor = session?.username || 'SYNC-AGENT-192.168.0.50';

      replaceExcelRows(sourceFile, rows, {
        sourceFile,
        fileName: fileName || `${sourceFile}.xlsx`,
        serverAddress: serverAddress || '\\\\192.168.0.50',
        rowCount: rows.length,
        hoexCount,
        htexCount,
        syncedBy: actor,
        syncMethod: 'sync-agent',
        syncedAt: now,
      });

      appendHistory({
        timestamp: now,
        eventType: 'EXCEL_SYNC',
        username: actor,
        status: `${sourceFile} Otomatik Eşitlendi`,
        note: `\\\\192.168.0.50 üzerinden ${rows.length} satır (${hoexCount} HOEX / ${htexCount} HTEX) senkronize edildi.`,
        ipAddress: getRequestIp(req),
      });

      res.json({ ok: true, sourceFile, rowCount: rows.length, hoexCount, htexCount });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Excel senkronizasyon verisi okunamadı.',
      });
    }
  });

  // Direct Server UNC / SMB Pull Attempt
  app.post('/api/sync/unc-pull', requireAuth, (req: AuthenticatedRequest, res) => {
    const { sharePath } = (req.body || {}) as { sharePath?: string };
    const candidatePath =
      sharePath?.trim() || process.env.SMB_SHARE_PATH?.trim() || '\\\\192.168.0.50';

    const files = findUncExcelFiles(candidatePath);
    if (files.length === 0) {
      res.status(422).json({
        reachable: false,
        testedPath: candidatePath,
        error:
          'Bu sunucu şu an bulut ortamında çalıştığı için yerel ağdaki \\\\192.168.0.50 paylaşımlarına doğrudan SMB erişimi kurulamadı. Şirket içi bir bilgisayarda "Otomatik Senkronizasyon Ajanı" betiğini 1 kez çalıştırarak veya Excel dosyalarını buradan yükleyerek otomatik aktarımı başlatabilirsiniz.',
      });
      return;
    }

    const results = [];
    const now = new Date().toISOString();
    for (const f of files) {
      const buf = fs.readFileSync(f.resolvedPath);
      const parsed = parseExcelWorkbook(buf, f.sourceFile);
      replaceExcelRows(f.sourceFile, parsed.rows, {
        sourceFile: f.sourceFile,
        fileName: path.basename(f.resolvedPath),
        serverAddress: candidatePath,
        rowCount: parsed.rows.length,
        hoexCount: parsed.hoexCount,
        htexCount: parsed.htexCount,
        syncedBy: req.user!.username,
        syncMethod: 'unc-pull',
        syncedAt: now,
      });
      results.push({
        sourceFile: f.sourceFile,
        rowCount: parsed.rows.length,
        hoexCount: parsed.hoexCount,
        htexCount: parsed.htexCount,
      });
    }

    appendHistory({
      timestamp: now,
      eventType: 'EXCEL_SYNC',
      username: req.user!.username,
      status: 'UNC Doğrudan Çekim',
      note: `${candidatePath} konumundan ${results.length} Excel dosyası çekildi.`,
      ipAddress: getRequestIp(req),
    });

    res.json({ reachable: true, results });
  });

  // Download Ready-to-Install Sync Agent for \\192.168.0.50
  app.get('/api/sync/agent-script', requireAuth, (req, res) => {
    const format = req.query.format === 'bat' ? 'bat' : 'ps1';
    const hostHeader = req.headers.host || 'localhost:3000';
    const proto = isHttpsRequest(req) ? 'https' : 'http';
    const appUrl = process.env.APP_URL?.trim() || `${proto}://${hostHeader}`;
    const uncHost = process.env.SMB_SERVER_HOST?.trim() || '192.168.0.50';
    const content = generateSyncAgentScript(format, appUrl, getSyncApiToken(), uncHost);

    const filename = format === 'bat' ? 'emel-sync-agent.bat' : 'emel-sync-agent.ps1';
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(content);
  });

  // Historical Reporting Module
  app.get('/api/reports/history', requireAuth, (req, res) => {
    try {
      const from = typeof req.query.from === 'string' ? req.query.from : undefined;
      const to = typeof req.query.to === 'string' ? req.query.to : undefined;
      const carrier = typeof req.query.carrier === 'string' ? req.query.carrier : undefined;
      const eventType = typeof req.query.eventType === 'string' ? req.query.eventType : undefined;
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;

      const entries = queryHistory({ from, to, carrier, eventType, q, limit: 400 });
      res.json({ entries });
    } catch (err) {
      console.error('[/api/reports/history] Hata:', err);
      res.status(500).json({ error: 'Geçmiş rapor kayıtları okunamadı.' });
    }
  });

  app.get('/api/reports/export', requireAuth, (req, res) => {
    try {
      const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
      const from = typeof req.query.from === 'string' ? req.query.from : undefined;
      const to = typeof req.query.to === 'string' ? req.query.to : undefined;
      const carrier = typeof req.query.carrier === 'string' ? req.query.carrier : undefined;
      const eventType = typeof req.query.eventType === 'string' ? req.query.eventType : undefined;
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;

      const entries = queryHistory({ from, to, carrier, eventType, q, limit: 1000 });
      const rows = entries.map((e) => ({
        Tarih: e.timestamp.replace('T', ' ').slice(0, 19),
        IslemTipi: e.eventType,
        Kullanici: e.username,
        KonteynerNo: e.containerNumber || '-',
        Armator: e.carrierName || '-',
        HOEXKodu: e.hoexCode || '-',
        HTEXKodu: e.htexCode || '-',
        Gemi: e.vesselName || '-',
        Konum: e.location || '-',
        Durum: e.status || '-',
        Aciklama: e.note,
      }));

      if (format === 'csv') {
        const headers = Object.keys(rows[0] || { Tarih: '', IslemTipi: '', Kullanici: '', Aciklama: '' });
        const csvLines = [
          headers.join(';'),
          ...rows.map((r) =>
            headers
              .map((h) => `"${String((r as Record<string, string>)[h] || '').replace(/"/g, '""')}"`)
              .join(';')
          ),
        ];
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="emel-shipping-gecmis-raporu.csv"');
        res.send('\uFEFF' + csvLines.join('\n'));
        return;
      }

      const buf = buildExcelReportBuffer(rows, 'Gecmis Raporu');
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', 'attachment; filename="emel-shipping-gecmis-raporu.xlsx"');
      res.send(buf);
    } catch (err) {
      console.error('[/api/reports/export] Hata:', err);
      res.status(500).json({ error: 'Rapor dosyası oluşturulamadı.' });
    }
  });

  // Security, Database Encryption & SSL Diagnostics (Admin Only)
  app.get('/api/security/status', requireAuth, requireAdmin, (req, res) => {
    try {
      const certPath = process.env.SSL_CERT_PATH?.trim() || '';
      const keyPath = process.env.SSL_KEY_PATH?.trim() || '';
      const hasNativeCerts = Boolean(certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath));
      const httpsActive = isHttpsRequest(req);

      res.json({
        encryption: {
          algorithm: 'AES-256-GCM',
          keyDerivation: 'scrypt + HMAC-SHA256 Blind Index',
          passwordHashing: 'crypto.scryptSync (16-byte salt, timingSafeEqual)',
          status: 'Aktif',
        },
        ssl: {
          httpsActive,
          nativeTlsConfigured: hasNativeCerts,
          hstsEnabled: true,
          protocol: httpsActive ? 'TLS / HTTPS (Proxy veya Doğrudan)' : 'Yerel HTTP (Üretimde SSL Aktif)',
        },
        sync: {
          smbTarget: `\\\\${process.env.SMB_SERVER_HOST?.trim() || '192.168.0.50'}`,
          syncTokenPreview: `${getSyncApiToken().slice(0, 6)}••••••••${getSyncApiToken().slice(-4)}`,
          syncTokenFull: getSyncApiToken(),
        },
        stats: getDatabaseStats(),
      });
    } catch (err) {
      console.error('[/api/security/status] Hata:', err);
      res.status(500).json({ error: 'Güvenlik durumu alınamadı.' });
    }
  });

  // Explicit JSON 404 & JSON Error Handlers for all /api/* routes (prevents Vite HTML fallback on API errors)
  app.use('/api', (req, res) => {
    res.status(404).json({ error: `API rotası bulunamadı: ${req.method} ${req.originalUrl}` });
  });

  app.use('/api', (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    console.error(`[API Hata] ${req.method} ${req.originalUrl}:`, err);
    if (res.headersSent) return;

    if (err instanceof multer.MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      res.status(status).json({
        error:
          err.code === 'LIMIT_FILE_SIZE'
            ? 'Yüklenen dosya 50 MB boyut sınırını aşıyor.'
            : `Dosya yükleme hatası: ${err.message}`,
      });
      return;
    }

    const errObj = err as { status?: number; statusCode?: number; type?: string; message?: string };
    if (errObj?.type === 'entity.too.large' || errObj?.status === 413) {
      res.status(413).json({ error: 'İstek boyutu sunucu sınırını aşıyor (Maks. 50 MB).' });
      return;
    }
    if (errObj instanceof SyntaxError || errObj?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Geçersiz JSON istek gövdesi.' });
      return;
    }

    const status = errObj?.status || errObj?.statusCode || 500;
    res.status(status).json({
      error: errObj?.message || 'Sunucuda beklenmeyen bir API hatası oluştu.',
    });
  });

  // Vite Dev Middleware or Static Production Bundle
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  const certPath = process.env.SSL_CERT_PATH?.trim();
  const keyPath = process.env.SSL_KEY_PATH?.trim();
  const caPath = process.env.SSL_CA_PATH?.trim();

  if (certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    const tlsOptions: https.ServerOptions = {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
      ca: caPath && fs.existsSync(caPath) ? fs.readFileSync(caPath) : undefined,
      minVersion: 'TLSv1.2',
    };
    https.createServer(tlsOptions, app).listen(port, '0.0.0.0', () => {
      console.log(`EMEL SHIPPING HTTPS/SSL Sunucusu ${port} portunda çalışıyor.`);
    });
  } else {
    http.createServer(app).listen(port, '0.0.0.0', () => {
      console.log(`EMEL SHIPPING Sunucusu http://0.0.0.0:${port} adresinde çalışıyor.`);
    });
  }
}

startServer().catch((err) => {
  console.error('Sunucu başlatma hatası:', err);
  process.exit(1);
});
