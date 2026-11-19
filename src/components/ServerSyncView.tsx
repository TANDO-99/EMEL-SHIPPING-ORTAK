import React, { useEffect, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { ExcelStats } from '../types';

function formatDateTimeDot(ts?: string): string {
  if (!ts || !ts.trim()) return '—';
  const m = ts.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}:\d{2}:\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]} ${m[4]}`;
  return ts.replace('T', ' ').slice(0, 19);
}

export const ServerSyncView: React.FC = () => {
  const [stats, setStats] = useState<ExcelStats | null>(null);
  const [uploadingTarget, setUploadingTarget] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'info' | 'err'; text: string } | null>(
    null
  );

  const loadStats = async () => {
    try {
      const data = await apiFetch<ExcelStats>('/api/excel/stats');
      setStats(data);
    } catch (err) {
      console.error('[ServerSyncView] Senkronizasyon geçmişi alınamadı:', err);
      setStatusMsg((prev) =>
        prev ?? {
          type: 'info',
          text:
            err instanceof Error
              ? err.message
              : 'Senkronizasyon geçmişi şu anda alınamadı. Ayrıntılar konsolda.',
        }
      );
    }
  };

  useEffect(() => {
    void loadStats();
  }, []);

  const handleFileUpload = async (
    sourceFile: 'Container List' | 'Container List - Japan',
    file: File | undefined
  ) => {
    if (!file) return;
    setUploadingTarget(sourceFile);
    setStatusMsg(null);
    try {
      const formData = new FormData();
      formData.append('sourceFile', sourceFile);
      formData.append('file', file);

      const data = await apiFetch<{
        ok?: boolean;
        rowCount?: number;
        hoexCount?: number;
        htexCount?: number;
      }>('/api/excel/upload', {
        method: 'POST',
        body: formData,
      });

      setStatusMsg({
        type: 'ok',
        text: `${sourceFile} başarıyla işlendi: ${data.rowCount ?? 0} satır (${data.hoexCount ?? 0} HOEX, ${data.htexCount ?? 0} HTEX) AES-256-GCM ile şifrelenerek kaydedildi.`,
      });
      await loadStats();
    } catch (err) {
      console.error('[ServerSyncView] Dosya yükleme hatası:', err);
      setStatusMsg({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : 'Excel dosyası yüklenirken beklenmeyen bir hata oluştu.',
      });
    } finally {
      setUploadingTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_6px_28px_-14px_rgba(11,34,64,0.08)] dark:border-slate-800 dark:bg-[#111827] dark:shadow-none">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-[#0F172A] sm:text-2xl dark:text-slate-100">
              Liste Yükleme
            </h1>
            <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
              Container List ve Container List - Japan Excel dosyalarını buradan yükleyerek güncelleyebilirsiniz.
            </p>
          </div>
        </div>

        {statusMsg && (
          <div
            className={`mt-4 rounded-xl border px-4 py-3 text-sm font-semibold ${
              statusMsg.type === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                : statusMsg.type === 'info'
                ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300'
                : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300'
            }`}
          >
            {statusMsg.text}
          </div>
        )}
      </div>

      {/* Direct Upload Cards for the 2 Excel Workbooks */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {(['Container List', 'Container List - Japan'] as const).map((sourceTitle) => {
          const isBusy = uploadingTarget === sourceTitle;
          const count =
            sourceTitle === 'Container List'
              ? stats?.containerListRows ?? 0
              : stats?.japanListRows ?? 0;

          return (
            <div
              key={sourceTitle}
              className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_6px_28px_-14px_rgba(11,34,64,0.08)] dark:border-slate-800 dark:bg-[#111827] dark:shadow-none"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <FileSpreadsheet className="h-5 w-5 text-[#0B2240] dark:text-sky-400" />
                    <h2 className="font-display text-base font-bold text-[#0F172A] dark:text-slate-100">
                      {sourceTitle}
                    </h2>
                  </div>
                  <span className="font-mono-tabular text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {count} satır aktif
                  </span>
                </div>
                <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Bilgisayarınızdan <span className="font-mono-tabular">.xlsx / .xls / .csv</span>{' '}
                  dosyasını seçerek listeyi güncelleyebilirsiniz.
                </p>
              </div>

              <label className="mt-5 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#0B2240]/35 bg-[#FAFBFD] px-4 py-4 text-sm font-bold text-[#0B2240] transition hover:border-[#0B2240] hover:bg-[#0B2240]/5 dark:border-sky-500/40 dark:bg-[#0D1322] dark:text-sky-300 dark:hover:border-sky-400 dark:hover:bg-sky-500/10">
                <Upload className="h-4 w-4" />
                <span>
                  {isBusy
                    ? 'Ayrıştırılıyor ve Şifreleniyor...'
                    : `${sourceTitle}.xlsx Dosyasını Yükle`}
                </span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.xlsm,.csv"
                  disabled={isBusy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    void handleFileUpload(sourceTitle, f);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
};
