import React, { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Search,
  Server,
  Ship,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { ExcelListRow, ExcelStats } from '../types';

interface ExcelListSearchViewProps {
  onSelectContainer: (containerNumber: string) => void;
  onGoToSyncSetup: () => void;
}

function formatDateDDMMYYYY(val?: string): string {
  if (!val || !val.trim()) return '—';
  const s = val.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  const dmy = s.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (dmy) return `${dmy[1]}.${dmy[2]}.${dmy[3]}`;
  return s;
}

function getBillOfLadingNumbers(row: ExcelListRow): string[] {
  const combined = Array.from(
    new Set(
      [...(row.hoexCodes || []), ...(row.htexCodes || [])]
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean)
    )
  );
  if (combined.length > 0) return combined;
  if (row.blNumber && row.blNumber.trim()) {
    return [row.blNumber.trim().toUpperCase()];
  }
  return [];
}

export const ExcelListSearchView: React.FC<ExcelListSearchViewProps> = ({
  onSelectContainer,
  onGoToSyncSetup,
}) => {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<ExcelListRow[]>([]);
  const [stats, setStats] = useState<ExcelStats | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);

  const loadStats = async () => {
    try {
      const statsRes = await apiFetch<ExcelStats>('/api/excel/stats');
      setStats(statsRes);
    } catch (err) {
      console.error('[ExcelListSearchView] İstatistikler alınamadı:', err);
    }
  };

  useEffect(() => {
    void loadStats();
  }, []);

  const runSearch = async (qVal = query) => {
    setHasSearched(true);
    setLoading(true);
    setError(null);
    setExpandedRowId(null);
    try {
      const params = new URLSearchParams();
      if (qVal.trim()) params.set('q', qVal.trim());
      params.set('codeType', 'ALL');
      params.set('source', 'ALL');

      const [searchRes, statsRes] = await Promise.all([
        apiFetch<{ rows: ExcelListRow[] }>(`/api/excel/search?${params.toString()}`),
        apiFetch<ExcelStats>('/api/excel/stats'),
      ]);
      setRows(searchRes.rows || []);
      setStats(statsRes);
    } catch (err) {
      console.error('[ExcelListSearchView] Arama hatası:', err);
      setError(err instanceof Error ? err.message : 'Liste verileri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      setError('Lütfen aramak istediğiniz konşimento numarası, konteyner no veya anahtar kelimeyi yazın.');
      return;
    }
    void runSearch(query);
  };

  const handleClearSearch = () => {
    setQuery('');
    setRows([]);
    setHasSearched(false);
    setError(null);
    setExpandedRowId(null);
  };

  return (
    <div className="space-y-6">
      {/* Header & Summary Strip */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_6px_28px_-14px_rgba(11,34,64,0.08)] sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-[#111827]">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-[#0F172A] sm:text-2xl dark:text-white">
            Liste
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-400">
            Container List ve Container List - Japan dosyalarından aktarılan kayıtlar.
          </p>
        </div>
        <button
          type="button"
          onClick={onGoToSyncSetup}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-[#0B2240] bg-white px-4 py-2.5 text-sm font-semibold text-[#0B2240] transition hover:bg-[#0B2240]/5 whitespace-nowrap dark:border-sky-400/50 dark:bg-[#0D1322] dark:text-sky-300 dark:hover:bg-sky-500/10"
        >
          <Server className="h-4 w-4" />
          <span>Liste Yükle</span>
        </button>
      </div>

      {/* KPI Metrics Row */}
      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-[#111827]">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Toplam Excel Satırı
            </div>
            <div className="font-mono-tabular mt-1.5 text-2xl font-bold text-[#0B2240] dark:text-sky-300">
              {stats.totalRows}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-[#111827]">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Konşimento Numaralı Kayıt
            </div>
            <div className="font-mono-tabular mt-1.5 text-2xl font-bold text-[#0B2240] dark:text-sky-300">
              {stats.hoexRowCount + stats.htexRowCount}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-[#111827]">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Dosya Dağılımı
            </div>
            <div className="font-mono-tabular mt-1.5 text-sm font-bold text-[#0F172A] dark:text-slate-100">
              Ana: {stats.containerListRows} / Japan: {stats.japanListRows}
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Liste Araması Search Bar */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_6px_28px_-14px_rgba(11,34,64,0.08)] dark:border-slate-800 dark:bg-[#111827]">
        <form onSubmit={handleSearchSubmit} className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Liste Araması: Müşteri adı, Booking no, konşimento numarası, konteyner no, bölge veya araç yazın..."
              className="w-full rounded-xl border border-slate-200 bg-[#FAFBFD] py-3 pr-4 pl-11 text-sm font-medium text-[#0F172A] outline-none transition focus:border-[#0B2240] focus:bg-white focus:ring-2 focus:ring-[#0B2240]/10 dark:border-slate-700 dark:bg-[#0D1322] dark:text-slate-100 dark:focus:border-sky-400"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0B2240] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#143560] disabled:opacity-60 whitespace-nowrap lg:flex-initial dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
            >
              <Search className="h-4 w-4" />
              <span>{loading ? 'Aranıyor...' : 'Listede Ara'}</span>
            </button>
            {hasSearched && (
              <button
                type="button"
                onClick={handleClearSearch}
                title="Aramayı Temizle"
                className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-[#0B2240] hover:text-[#0B2240] dark:border-slate-700 dark:bg-[#0D1322] dark:text-slate-200 dark:hover:border-sky-400"
              >
                <X className="h-4 w-4" />
                <span>Temizle</span>
              </button>
            )}
          </div>
        </form>

        {error && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-200">
            {error}
          </div>
        )}
      </div>

      {/* Dynamic Excel Results Table — Rendered ONLY when user runs a search */}
      {hasSearched && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_6px_28px_-14px_rgba(11,34,64,0.08)] dark:border-slate-800 dark:bg-[#111827]">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
            <div className="flex items-center gap-2 font-display text-sm font-bold text-[#0F172A] dark:text-white">
              <FileSpreadsheet className="h-4 w-4 text-[#0B2240] dark:text-sky-300" />
              <span>Excel Liste Sonuçları</span>
            </div>
            <span className="font-mono-tabular text-xs font-semibold text-slate-600 dark:text-slate-400">
              {rows.length} kayıt bulundu
            </span>
          </div>

          {loading ? (
            <div className="space-y-2 p-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <FileSpreadsheet className="mx-auto h-9 w-9 text-slate-300 dark:text-slate-600" />
              <h3 className="mt-3 font-display text-base font-bold text-[#0F172A] dark:text-white">
                {stats?.totalRows === 0
                  ? 'Henüz Excel Listesi Aktarılmadı'
                  : 'Aramanızla Eşleşen Kayıt Bulunamadı'}
              </h3>
              <p className="mx-auto mt-1 max-w-md text-sm font-medium text-slate-500 dark:text-slate-400">
                {stats?.totalRows === 0
                  ? 'Container List ve Container List - Japan dosyalarını yükleyin.'
                  : 'Farklı bir müşteri, booking numarası, konşimento numarası veya konteyner numarası ile tekrar deneyebilirsiniz.'}
              </p>
              {stats?.totalRows === 0 && (
                <button
                  type="button"
                  onClick={onGoToSyncSetup}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#0B2240] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#143560] dark:bg-sky-500 dark:text-slate-950"
                >
                  <Server className="h-4 w-4" />
                  <span>Liste Yükle</span>
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1160px] border-collapse text-left text-sm font-medium">
                <thead>
                  <tr className="border-b border-slate-100 bg-[#FAFBFD] text-xs font-bold text-slate-600 dark:border-slate-800 dark:bg-[#0D1322] dark:text-slate-300">
                    <th className="w-10 px-3 py-3.5" />
                    <th className="px-4 py-3.5 text-[#0F172A] dark:text-white">MÜŞTERİ</th>
                    <th className="px-4 py-3.5">BÖLGE</th>
                    <th className="px-4 py-3.5">GETİRİCİ ŞİRKET</th>
                    <th className="px-4 py-3.5 text-[#0B2240] dark:text-sky-300">
                      KONŞİMENTO NUMARASI
                    </th>
                    <th className="px-4 py-3.5 text-[#0B2240] dark:text-sky-300">
                      BOOKİNG NUMARASI
                    </th>
                    <th className="px-4 py-3.5">Konteyner No</th>
                    <th className="px-4 py-3.5">Yola Çıkış Tarihi</th>
                    <th className="px-4 py-3.5 text-[#0B2240] dark:text-sky-300">Mersin Varış</th>
                    <th className="px-4 py-3.5 text-right text-[#0F172A] dark:text-white">ARAÇ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map((row, idx) => {
                    const rowKey = row.id ?? idx;
                    const isExpanded = expandedRowId === rowKey;
                    const bolList = getBillOfLadingNumbers(row);
                    const departureDate = formatDateDDMMYYYY(row.etd);
                    const mersinDate = formatDateDDMMYYYY(row.mersinEta || row.eta);

                    return (
                      <React.Fragment key={rowKey}>
                        <tr className="transition hover:bg-[#FAFBFD] dark:hover:bg-slate-800/50">
                          <td className="px-3 py-3.5">
                            <button
                              type="button"
                              onClick={() => setExpandedRowId(isExpanded ? null : rowKey)}
                              aria-label="Satır ayrıntısını aç"
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-[#0B2240] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-sky-300"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-3.5 font-bold text-[#0F172A] dark:text-white">
                            {row.customer || '—'}
                          </td>
                          <td className="px-4 py-3.5 font-semibold text-slate-700 dark:text-slate-300">
                            {row.region || row.pol || '—'}
                          </td>
                          <td className="px-4 py-3.5 font-semibold text-slate-700 dark:text-slate-300">
                            {row.importer || '—'}
                          </td>
                          <td className="font-mono-tabular px-4 py-3.5 font-bold text-[#0B2240] dark:text-sky-300">
                            {bolList.length > 0 ? bolList.join(', ') : '—'}
                          </td>
                          <td className="font-mono-tabular px-4 py-3.5 font-bold text-[#0B2240] dark:text-sky-300">
                            {row.bookingNumber || '—'}
                          </td>
                          <td className="font-mono-tabular px-4 py-3.5">
                            {row.containerNumber ? (
                              <button
                                type="button"
                                onClick={() => onSelectContainer(row.containerNumber)}
                                className="inline-flex items-center gap-1.5 font-bold text-[#0B2240] underline decoration-[#0B2240]/30 underline-offset-2 hover:decoration-[#0B2240] dark:text-sky-300 dark:decoration-sky-300/40"
                              >
                                <Ship className="h-3.5 w-3.5" />
                                <span>{row.containerNumber}</span>
                              </button>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-600">—</span>
                            )}
                          </td>
                          <td className="font-mono-tabular px-4 py-3.5 font-semibold text-slate-700 whitespace-nowrap dark:text-slate-300">
                            {departureDate}
                          </td>
                          <td className="font-mono-tabular px-4 py-3.5 font-bold text-[#0B2240] whitespace-nowrap dark:text-sky-300">
                            {mersinDate}
                          </td>
                          <td className="px-4 py-3.5 text-right font-semibold text-[#0F172A] dark:text-slate-100">
                            {row.vehicle || '—'}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-[#FAFBFD] dark:bg-[#0D1322]">
                            <td colSpan={10} className="px-6 py-4">
                              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                                <span>
                                  Dosya: <strong>{row.sourceFile}</strong> ({row.sheetName}) · Satır:{' '}
                                  <span className="font-mono-tabular">{row.rowNumber}</span>
                                </span>
                                <span>
                                  Gemi: <strong>{row.vessel || '—'}</strong> · Armatör:{' '}
                                  <strong>{row.carrier || '—'}</strong>
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-slate-200 pt-3 sm:grid-cols-3 lg:grid-cols-4 dark:border-slate-800">
                                {Object.entries(row.rawColumns || {}).map(([colName, val]) => (
                                  <div key={colName} className="text-xs">
                                    <div className="font-semibold text-slate-500 dark:text-slate-400">
                                      {colName}
                                    </div>
                                    <div className="font-mono-tabular font-semibold text-[#0F172A] break-all dark:text-slate-200">
                                      {val || '—'}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
