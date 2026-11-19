export interface AuthUser {
  id: number;
  username: string;
  role: 'admin' | 'operator';
  displayName: string;
}

export interface TeamUser extends AuthUser {
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface CarrierInfo {
  code: string;
  name: string;
  shortName: string;
  trackingUrl: string;
  prefixes: string[];
  regionFocus: string;
  hasApiKey: boolean;
}

export interface TrackingMilestone {
  date: string;
  event: string;
  location: string;
  vessel?: string;
  completed: boolean;
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

export interface Iso6346Validation {
  isContainerFormat: boolean;
  isValidCheckDigit: boolean;
  normalized: string;
  ownerPrefix: string;
  expectedCheckDigit?: number;
  actualCheckDigit?: number;
}

export interface ExcelListRow {
  id?: number;
  sourceFile: 'Container List' | 'Container List - Japan';
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
  sourceFile: 'Container List' | 'Container List - Japan';
  fileName: string;
  serverAddress: string;
  rowCount: number;
  hoexCount: number;
  htexCount: number;
  syncedBy: string;
  syncMethod: 'unc-pull' | 'sync-agent' | 'manual-upload';
  syncedAt: string;
}

export interface ExcelStats {
  totalRows: number;
  containerListRows: number;
  japanListRows: number;
  hoexRowCount: number;
  htexRowCount: number;
  recentSyncRuns: ExcelSyncRunMeta[];
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

export interface SecurityStatus {
  encryption: {
    algorithm: string;
    keyDerivation: string;
    passwordHashing: string;
    status: string;
  };
  ssl: {
    httpsActive: boolean;
    nativeTlsConfigured: boolean;
    hstsEnabled: boolean;
    protocol: string;
  };
  sync: {
    smbTarget: string;
    syncTokenPreview: string;
    syncTokenFull: string;
  };
  stats: {
    containerCount: number;
    excelRowCount: number;
    historyCount: number;
    userCount: number;
    dbSizeBytes: number;
  };
}
