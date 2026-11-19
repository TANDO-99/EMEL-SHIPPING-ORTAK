import React, { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, Filter, History, Search } from 'lucide-react';
import { apiFetch, downloadAuthorizedFile } from '../lib/api';
import type { CarrierInfo, HistoryEntry } from '../types';

function formatDateTimeDot(ts?: string): string {
  if (!ts || !ts.trim()) return '—';
  const m = ts.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}:\d{2}:\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]} ${m[4]}`;
  return ts.replace('T', ' ').slice(0, 19);
}

const EVENT_TYPE_LABELS: Record<HistoryEntry['eventType'], string> = {
  QUERY: 'Konteyner Sorgusu',
  STATUS_UPDATE: 'Konum / Durum Güncelleme',
  EXCEL_SYNC: 'Excel Senkronizasyon',
  AUTH: 'Oturum / Güvenlik',
};

export const HistoryReportsView: React.FC = () => {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [carriers, setCarriers] = useState<CarrierInfo[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [eventType, setEventType] = useState('ALL');
  const [carrier, setCarrier] = useState('ALL');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildParams = () => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (eventType !== 'ALL') p.set('eventType', eventType);
    if (carrier !== 'ALL') p.set('carrier', carrier);
    if (q.trim()) p.set('q', q.trim());
    return p;
  };

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = buildParams();
      const [hRes, cRes] = await Promise.all([
        apiFetch<{ entries: HistoryEntry[] }>(`/api/reports/history?${params.toString()}`),
        carriers.length === 0
          ? apiFetch<{ carriers: CarrierInfo[] }>('/api/carriers')
          : Promise.resolve({ carriers }),
      ]);
      setEntries(hRes.entries || []);
      if (carriers.length === 0) setCarriers(cRes.carriers || []);
    } catch (err) {
      console.error('[HistoryReportsView] Geçmiş kayıtları yüklenemedi:', err);
      setError(
        err instanceof Error ? err.message : 'Geçmiş kayıtları alınırken bir sorun oluştu.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void loadHistory();
  };

  const handleExport = async (format: 'xlsx' | 'csv') => {
    setExporting(true);
    setError(null);
    try {
      const params = buildParams();
      params.set('format', format);
      await downloadAuthorizedFile(
        `/api/reports/export?${params.toString()}`,
        `emel-shipping-gecmis-raporu.${format}`
      );
    } catch (err) {
      console.error('[HistoryReportsView] Rapor indirme hatası:', err);
      setError(err instanceof Error ? err.message : 'Rapor dosyası indirilemedi.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_6px_28px_-14px_rgba(11,34,64,0.08)] sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-[#111827] dark:shadow-none">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-[#0F172A] sm:text-2xl dark:text-slate-100">
            Geçmişe Dönük Raporlama Modülü
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
            Tüm konteyner sorguları, Mersin varış/gemi güncellemeleri ve Excel senkronizasyonları
            şifreli arşivde tarih damgasıyla saklanır.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={exporting}
            onClick={() => void handleExport('xlsx')}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0B2240] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#143560] disabled:opacity-60 whitespace-nowrap dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Excel (.xlsx) İndir</span>
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={() => void handleExport('csv')}
            className="inline-flex items-center gap-2 rounded-xl border border-[#0B2240] bg-white px-4 py-2.5 text-sm font-bold text-[#0B2240] transition hover:bg-[#0B2240]/5 disabled:opacity-60 whitespace-nowrap dark:border-sky-500 dark:bg-[#0D1322] dark:text-sky-300 dark:hover:bg-sky-500/10"
          >
            <Download className="h-4 w-4" />
            <span>CSV İndir</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <form
        onSubmit={handleFilterSubmit}
        className="grid grid-cols-1 gap-3.5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_6px_28px_-14px_rgba(11,34,64,0.08)] sm:grid-cols-2 lg:grid-cols-6 dark:border-slate-800 dark:bg-[#111827] dark:shadow-none"
      >
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Başlangıç Tarihi
          </label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="font-mono-tabular mt-1 w-full rounded-xl border border-slate-200 bg-[#FAFBFD] px-3 py-2 text-xs font-semibold text-[#0F172A] outline-none focus:border-[#0B2240] focus:bg-white dark:border-slate-700 dark:bg-[#0D1322] dark:text-slate-100"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Bitiş Tarihi
          </label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="font-mono-tabular mt-1 w-full rounded-xl border border-slate-200 bg-[#FAFBFD] px-3 py-2 text-xs font-semibold text-[#0F172A] outline-none focus:border-[#0B2240] focus:bg-white dark:border-slate-700 dark:bg-[#0D1322] dark:text-slate-100"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            İşlem Türü
          </label>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-[#FAFBFD] px-3 py-2 text-xs font-semibold text-[#0F172A] outline-none focus:border-[#0B2240] focus:bg-white dark:border-slate-700 dark:bg-[#0D1322] dark:text-slate-100"
          >
            <option value="ALL">Tüm İşlemler</option>
            <option value="QUERY">Konteyner Sorgusu</option>
            <option value="STATUS_UPDATE">Konum / Durum Güncelleme</option>
            <option value="EXCEL_SYNC">Excel Senkronizasyon</option>
            <option value="AUTH">Oturum / Güvenlik</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Armatör
          </label>
          <select
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-[#FAFBFD] px-3 py-2 text-xs font-semibold text-[#0F172A] outline-none focus:border-[#0B2240] focus:bg-white dark:border-slate-700 dark:bg-[#0D1322] dark:text-slate-100"
          >
            <option value="ALL">Tüm Armatörler</option>
            {carriers.map((c) => (
              <option key={c.code} value={c.code}>
                {c.shortName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Anahtar Kelime
          </label>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Konteyner, Konşimento, gemi..."
              className="w-full rounded-xl border border-slate-200 bg-[#FAFBFD] py-2 pr-3 pl-8.5 text-xs font-semibold text-[#0F172A] outline-none focus:border-[#0B2240] focus:bg-white dark:border-slate-700 dark:bg-[#0D1322] dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B2240] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#143560] dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
          >
            <Filter className="h-3.5 w-3.5" />
            <span>Raporu Filtrele</span>
          </button>
        </div>
      </form>

      {/* Audit Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_6px_28px_-14px_rgba(11,34,64,0.08)] dark:border-slate-800 dark:bg-[#111827] dark:shadow-none">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2 font-display text-sm font-bold text-[#0F172A] dark:text-slate-100">
            <History className="h-4 w-4 text-[#0B2240] dark:text-sky-400" />
            <span>Geçmiş Operasyon Kayıtları</span>
          </div>
          <span className="font-mono-tabular text-xs font-semibold text-slate-500 dark:text-slate-400">
            {entries.length} kayıt
          </span>
        </div>

        {loading ? (
          <div className="space-y-2 p-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
            Seçilen filtrelere uygun geçmiş kayıt bulunamadı.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-[#FAFBFD] font-bold text-slate-600 dark:border-slate-800 dark:bg-[#0D1322] dark:text-slate-300">
                  <th className="px-4 py-3.5">Tarih / Saat</th>
                  <th className="px-4 py-3.5">İşlem Türü</th>
                  <th className="px-4 py-3.5">Kullanıcı</th>
                  <th className="px-4 py-3.5">Konteyner</th>
                  <th className="px-4 py-3.5">KONŞİMENTO NUMARASI</th>
                  <th className="px-4 py-3.5">Armatör / Gemi</th>
                  <th className="px-4 py-3.5">Durum</th>
                  <th className="px-4 py-3.5">Açıklama</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {entries.map((entry, idx) => {
                  const billCodes = Array.from(
                    new Set(
                      [entry.hoexCode, entry.htexCode]
                        .map((v) => (v || '').trim().toUpperCase())
                        .filter(Boolean)
                    )
                  );
                  return (
                    <tr key={entry.id ?? idx} className="hover:bg-[#FAFBFD] dark:hover:bg-[#172033]">
                      <td className="font-mono-tabular px-4 py-3 font-medium text-slate-600 whitespace-nowrap dark:text-slate-300">
                        {formatDateTimeDot(entry.timestamp)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#0F172A] whitespace-nowrap dark:text-slate-100">
                        {EVENT_TYPE_LABELS[entry.eventType] || entry.eventType}
                      </td>
                      <td className="font-mono-tabular px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">
                        {entry.username}
                      </td>
                      <td className="font-mono-tabular px-4 py-3 font-bold text-[#0B2240] dark:text-sky-300">
                        {entry.containerNumber || '—'}
                      </td>
                      <td className="font-mono-tabular px-4 py-3 font-medium text-slate-600 dark:text-slate-300">
                        {billCodes.length > 0 ? billCodes.join(', ') : '—'}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">
                        {entry.carrierName || '—'}
                        {entry.vesselName ? ` · ${entry.vesselName}` : ''}
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#0F172A] dark:text-slate-200">
                        {entry.status || '—'}
                      </td>
                      <td
                        className="max-w-xs truncate px-4 py-3 text-slate-500 dark:text-slate-400"
                        title={entry.note}
                      >
                        {entry.note}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
