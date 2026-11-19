import React, { useState } from 'react';
import { Download, ExternalLink, MonitorDown, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const ok = await install();
      if (!ok) return;
      return;
    }
    setShowGuide(true);
  };

  const inIframe = typeof window !== 'undefined' && window.self !== window.top;

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        title="Uygulamayı Masaüstüne İndir / Yükle"
        aria-label="Uygulamayı Masaüstüne İndir"
        className="inline-flex h-8.5 items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-2.5 text-xs font-semibold text-white transition hover:bg-white/20 whitespace-nowrap"
      >
        <Download className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden xl:inline">İndir</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-[#0F172A] shadow-2xl dark:border-slate-700 dark:bg-[#111827] dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0B2240] text-white dark:bg-sky-500/20 dark:text-sky-300">
                  <MonitorDown className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold">
                    EMEL SHIPPING Masaüstü Uygulaması
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Bilgisayarınıza veya telefonunuza tek tıkla kurun
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Kapat"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
                <p>
                  <strong>1.</strong> Safari alt/üst menüsündeki <strong>Paylaş</strong> simgesine dokunun.
                </p>
                <p>
                  <strong>2.</strong> Aşağı kaydırıp <strong>Ana Ekrana Ekle</strong> seçeneğine basın.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-2.5 rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
                {inIframe && (
                  <p className="font-semibold text-[#0B2240] dark:text-sky-300">
                    Uygulamayı Chrome veya Edge masaüstü kısayolu olarak yüklemek için önce yeni sekmede açın:
                  </p>
                )}
                <p>
                  <strong>1.</strong> Google Chrome veya Microsoft Edge adres çubuğunun sağındaki{' '}
                  <strong>Uygulamayı Yükle</strong> (monitör/ok) simgesine tıklayın.
                </p>
                <p>
                  <strong>2.</strong> Alternatif olarak sağ üstteki üç nokta menüsünden{' '}
                  <strong>Yayınla, kaydet ve paylaş → EMEL SHIPPING yükle</strong> yolunu seçin.
                </p>
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              {inIframe && (
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B2240] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#143560] dark:bg-sky-600 dark:hover:bg-sky-500"
                >
                  <span>Yeni Sekmede Aç</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
