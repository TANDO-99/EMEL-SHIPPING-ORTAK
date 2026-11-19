import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import type { ExcelListRow, ExcelSourceFile } from './db.ts';

const HOEX_REGEX = /\bHOEX[-_\/]?[A-Z0-9]{1,24}\b/gi;
const HTEX_REGEX = /\bHTEX[-_\/]?[A-Z0-9]{1,24}\b/gi;
const CONTAINER_REGEX = /\b[A-Z]{4}\d{7}\b/g;

function normalizeCellValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }
  return String(val).trim();
}

function matchHeader(headers: string[], candidates: string[]): string | null {
  for (const candidate of candidates) {
    const found = headers.find((h) => h.toLowerCase().includes(candidate.toLowerCase()));
    if (found) return found;
  }
  return null;
}

export function parseExcelWorkbook(
  buffer: Buffer,
  sourceFile: ExcelSourceFile
): {
  rows: Omit<ExcelListRow, 'id'>[];
  hoexCount: number;
  htexCount: number;
} {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: true,
    cellText: true,
  });

  const syncedAt = new Date().toISOString();
  const parsedRows: Omit<ExcelListRow, 'id'>[] = [];
  let hoexCount = 0;
  let htexCount = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
    });

    if (matrix.length === 0) continue;

    // Locate a real header row in the first 10 rows; if row 0 is already data (dates / HOEX-HTEX codes), treat sheet as headerless
    let headerIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < Math.min(10, matrix.length); i++) {
      const row = matrix[i] || [];
      const cells = row.map(normalizeCellValue);
      const text = cells.join(' ').toLowerCase();
      const hasDataLikeValues = cells.some(
        (c) => /^\d{4}-\d{2}-\d{2}$/.test(c) || /^(HOEX|HTEX)\d+/i.test(c)
      );
      let score = 0;
      if (text.includes('container') || text.includes('konteyner') || text.includes('cntr')) score += 4;
      if (text.includes('konşimento') || text.includes('bill of lading') || text.includes('b/l')) score += 4;
      if (text.includes('vessel') || text.includes('gemi')) score += 3;
      if (text.includes('eta') || text.includes('etd') || text.includes('ets') || text.includes('varış') || text.includes('çıkış')) score += 3;
      if (text.includes('port') || text.includes('liman') || text.includes('customer') || text.includes('müşteri')) score += 2;
      if (hasDataLikeValues && score < 5) score = 0;
      if (score > bestScore) {
        bestScore = score;
        headerIdx = i;
      }
    }

    const colCount = Math.max(
      1,
      ...matrix.slice(0, 15).map((r) => (Array.isArray(r) ? r.length : 0))
    );
    const rawHeaders =
      headerIdx >= 0
        ? Array.from({ length: colCount }, (_, idx) => {
            const clean = normalizeCellValue(matrix[headerIdx]?.[idx]);
            return clean || `Sütun ${idx + 1}`;
          })
        : Array.from({ length: colCount }, (_, idx) => `Sütun ${idx + 1}`);

    const containerCol = matchHeader(rawHeaders, ['container', 'konteyner', 'cntr', 'equip']);
    const hoexCol = matchHeader(rawHeaders, ['hoex']);
    const htexCol = matchHeader(rawHeaders, ['htex']);
    const blCol = matchHeader(rawHeaders, ['b/l', 'bl no', 'bill of lading', 'konşimento', 'mbl', 'hbl']);
    const vesselCol = matchHeader(rawHeaders, ['vessel', 'gemi', 'ship name', 'vsl']);
    const voyageCol = matchHeader(rawHeaders, ['voyage', 'sefer', 'voy']);
    const carrierCol = matchHeader(rawHeaders, ['carrier', 'armatör', 'line', 'hat', 'shipping line']);
    const polCol = matchHeader(rawHeaders, ['pol', 'loading', 'yükleme', 'origin', 'çıkış liman']);
    const podCol = matchHeader(rawHeaders, ['pod', 'discharge', 'tahliye', 'destination', 'varış liman']);
    const etdCol = matchHeader(rawHeaders, ['etd', 'atd', 'ets', 'yola çıkış', 'çıkış tarihi', 'shipment date', 'departure', 'kalkış', 'sailing']);
    const etaCol = matchHeader(rawHeaders, ['eta', 'ata', 'arrival', 'varış tarihi', 'varış']);
    const mersinEtaCol = matchHeader(rawHeaders, ['mersin eta', 'mersin varış', 'eta mersin', 'mersin ata', 'mersin', 'varış tarihi', 'varış', 'eta', 'ata']);
    const statusCol = matchHeader(rawHeaders, ['status', 'durum', 'state', 'remark', 'not']);
    const customerCol = matchHeader(rawHeaders, ['customer', 'müşteri', 'consignee', 'shipper', 'alıcı', 'firma']);

    const dataStartIdx = headerIdx >= 0 ? headerIdx + 1 : 0;
    for (let r = dataStartIdx; r < matrix.length; r++) {
      const rowArr = matrix[r] || [];
      const rawColumns: Record<string, string> = {};
      let nonEmptyCount = 0;

      for (let c = 0; c < rawHeaders.length; c++) {
        const val = normalizeCellValue(rowArr[c]);
        if (val) nonEmptyCount++;
        rawColumns[rawHeaders[c]] = val;
      }

      if (nonEmptyCount === 0) continue;

      const allText = Object.values(rawColumns).join(' ');
      const hoexSet = new Set<string>();
      const htexSet = new Set<string>();

      for (const m of allText.match(HOEX_REGEX) || []) {
        hoexSet.add(m.toUpperCase());
      }
      for (const m of allText.match(HTEX_REGEX) || []) {
        htexSet.add(m.toUpperCase());
      }

      if (hoexCol && rawColumns[hoexCol]) {
        const v = rawColumns[hoexCol].toUpperCase();
        if (v.startsWith('HTEX')) htexSet.add(v);
        else hoexSet.add(v);
      }
      if (htexCol && rawColumns[htexCol]) {
        const v = rawColumns[htexCol].toUpperCase();
        if (v.startsWith('HOEX')) hoexSet.add(v);
        else htexSet.add(v);
      }

      let containerNumber = containerCol ? rawColumns[containerCol].toUpperCase() : '';
      if (!containerNumber) {
        const cntrMatch = allText.toUpperCase().match(CONTAINER_REGEX);
        if (cntrMatch && cntrMatch[0]) {
          containerNumber = cntrMatch[0];
        }
      }

      const hoexCodes = Array.from(hoexSet).filter(Boolean);
      const htexCodes = Array.from(htexSet).filter(Boolean);

      if (hoexCodes.length > 0) hoexCount++;
      if (htexCodes.length > 0) htexCount++;

      const dateValues = Object.values(rawColumns)
        .map((v) => v.trim())
        .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v))
        .sort((a, b) => a.localeCompare(b));

      const etdVal = (etdCol ? rawColumns[etdCol] : '') || (dateValues.length >= 2 ? dateValues[0] : '');
      const mersinEtaVal =
        (mersinEtaCol ? rawColumns[mersinEtaCol] : '') ||
        (etaCol ? rawColumns[etaCol] : '') ||
        (dateValues.length >= 2 ? dateValues[dateValues.length - 1] : '');

      parsedRows.push({
        sourceFile,
        sheetName,
        rowNumber: r + 1,
        hoexCodes,
        htexCodes,
        containerNumber,
        blNumber: blCol ? rawColumns[blCol] : '',
        vessel: vesselCol ? rawColumns[vesselCol] : '',
        voyage: voyageCol ? rawColumns[voyageCol] : '',
        carrier: carrierCol ? rawColumns[carrierCol] : '',
        pol: polCol ? rawColumns[polCol] : '',
        pod: podCol ? rawColumns[podCol] : '',
        etd: etdVal,
        eta: (etaCol ? rawColumns[etaCol] : '') || mersinEtaVal,
        mersinEta: mersinEtaVal,
        status: statusCol ? rawColumns[statusCol] : '',
        customer: customerCol ? rawColumns[customerCol] : '',
        rawColumns,
        syncedAt,
      });
    }
  }

  return { rows: parsedRows, hoexCount, htexCount };
}

export function buildExcelReportBuffer(
  rows: Array<Record<string, string | number | undefined>>,
  sheetTitle = 'Rapor'
): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetTitle);
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export interface UncFileCandidate {
  sourceFile: ExcelSourceFile;
  resolvedPath: string;
}

export function findUncExcelFiles(baseUncPath: string): UncFileCandidate[] {
  const results: UncFileCandidate[] = [];
  if (!baseUncPath || !fs.existsSync(baseUncPath)) {
    return results;
  }

  const targets: Array<{ sourceFile: ExcelSourceFile; names: string[] }> = [
    {
      sourceFile: 'Container List',
      names: ['Container List.xlsx', 'Container List.xls', 'Container List.xlsm', 'Container List.csv'],
    },
    {
      sourceFile: 'Container List - Japan',
      names: [
        'Container List - Japan.xlsx',
        'Container List - Japan.xls',
        'Container List - Japan.xlsm',
        'Container List - Japan.csv',
      ],
    },
  ];

  for (const target of targets) {
    for (const fileName of target.names) {
      const fullPath = path.join(baseUncPath, fileName);
      if (fs.existsSync(fullPath)) {
        results.push({ sourceFile: target.sourceFile, resolvedPath: fullPath });
        break;
      }
    }
  }

  return results;
}

export function generateSyncAgentScript(
  format: 'ps1' | 'bat',
  appUrl: string,
  syncToken: string,
  uncHost = '192.168.0.50'
): string {
  const cleanUrl = appUrl.replace(/\/+$/, '');
  if (format === 'bat') {
    return `@echo off
REM EMEL SHIPPING - Otomatik Excel Senkronizasyon Kurulumu (\\\\${uncHost})
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0emel-sync-agent.ps1"
`;
  }

  return `# EMEL SHIPPING - Otomatik \\\\${uncHost} Excel Senkronizasyon Ajanı
# Bu betik \\\\${uncHost} üzerindeki "Container List" ve "Container List - Japan" Excel dosyalarını
# SSL (HTTPS) üzerinden güvenli biçimde Emel Shipping veritabanına aktarır.

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ServerShare = "\\\\${uncHost}\\PaylasimKlasoru" # Ağ paylaşım klasörü adını kendi sunucunuza göre güncelleyin
$ApiEndpoint = "${cleanUrl}/api/sync/excel"
$SyncToken   = "${syncToken}"

$Files = @(
    @{ SourceType = "Container List";         Pattern = "Container List.xls*" },
    @{ SourceType = "Container List - Japan"; Pattern = "Container List - Japan.xls*" }
)

foreach ($item in $Files) {
    $matched = Get-ChildItem -Path $ServerShare -Filter $item.Pattern -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $matched) {
        Write-Warning "Dosya bulunamadi: $($item.Pattern) ($ServerShare)"
        continue
    }

    $bytes = [System.IO.File]::ReadAllBytes($matched.FullName)
    $b64   = [System.Convert]::ToBase64String($bytes)

    $body = @{
        sourceFile    = $item.SourceType
        fileName      = $matched.Name
        serverAddress = "\\\\${uncHost}"
        fileBase64    = $b64
    } | ConvertTo-Json -Compress

    $headers = @{
        "Content-Type" = "application/json; charset=utf-8"
        "X-Sync-Token" = $SyncToken
    }

    $response = Invoke-RestMethod -Uri $ApiEndpoint -Method Post -Headers $headers -Body $body
    Write-Host "[BASARILI] $($item.SourceType) -> $($response.rowCount) satir senkronize edildi."
}
`;
}
