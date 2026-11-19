import React, { useEffect, useState } from 'react';
import { KeyRound, Lock, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { CarrierInfo, SecurityStatus, TeamUser } from '../types';

function formatDateTimeDot(ts?: string): string {
  if (!ts || !ts.trim()) return '—';
  const m = ts.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}:\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]} ${m[4]}`;
  return ts.replace('T', ' ').slice(0, 16);
}

export const SecurityTeamView: React.FC = () => {
  const [security, setSecurity] = useState<SecurityStatus | null>(null);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [carriers, setCarriers] = useState<CarrierInfo[]>([]);
  const [multiCarrier, setMultiCarrier] = useState<
    Array<{ code: string; name: string; hasApiKey: boolean }>
  >([]);

  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [apiCarrierCode, setApiCarrierCode] = useState('JSONCARGO');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');

  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadAll = async () => {
    try {
      const [secRes, usrRes, carRes] = await Promise.all([
        apiFetch<SecurityStatus>('/api/security/status'),
        apiFetch<{ users: TeamUser[] }>('/api/users'),
        apiFetch<{
          carriers: CarrierInfo[];
          multiCarrier?: Array<{ code: string; name: string; hasApiKey: boolean }>;
        }>('/api/carriers'),
      ]);
      setSecurity(secRes);
      setUsers(usrRes.users);
      setCarriers(carRes.carriers);
      setMultiCarrier(carRes.multiCarrier || []);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Güvenlik bilgileri yüklenemedi.',
      });
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          username: newUsername,
          displayName: newDisplayName,
          password: newPassword,
          role: 'operator',
        }),
      });
      setNewUsername('');
      setNewDisplayName('');
      setNewPassword('');
      setFeedback({ type: 'ok', text: 'Yeni ekip kullanıcısı şifrelenerek oluşturuldu.' });
      await loadAll();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Kullanıcı oluşturulamadı.',
      });
    }
  };

  const handleDeleteUser = async (id: number) => {
    setFeedback(null);
    try {
      await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
      setFeedback({ type: 'ok', text: 'Kullanıcı erişimi kaldırıldı.' });
      await loadAll();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Kullanıcı silinemedi.',
      });
    }
  };

  const handleSaveCarrierKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await apiFetch('/api/carriers/config', {
        method: 'POST',
        body: JSON.stringify({
          carrierCode: apiCarrierCode,
          apiKey,
          apiSecret,
        }),
      });
      setApiKey('');
      setApiSecret('');
      setFeedback({
        type: 'ok',
        text: `${apiCarrierCode} API anahtarları AES-256-GCM ile şifrelenerek kaydedildi.`,
      });
      await loadAll();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'API anahtarı kaydedilemedi.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_6px_28px_-14px_rgba(11,34,64,0.08)] dark:border-slate-800 dark:bg-[#111827] dark:shadow-none">
        <h1 className="font-display text-xl font-bold tracking-tight text-[#0F172A] sm:text-2xl dark:text-slate-100">
          Güvenlik, Veritabanı Şifreleme, SSL &amp; Ekip Yönetimi
        </h1>
        <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
          6-7 kişilik operasyon ekibiniz için kullanıcı yönetimi, AES-256-GCM şifreleme durumu ve
          SSL/TLS güvenlik doğrulaması.
        </p>
        {feedback && (
          <div
            className={`mt-4 rounded-xl border px-4 py-3 text-sm font-semibold ${
              feedback.type === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300'
            }`}
          >
            {feedback.text}
          </div>
        )}
      </div>

      {/* Encryption & SSL Status Grid */}
      {security && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_6px_28px_-14px_rgba(11,34,64,0.08)] dark:border-slate-800 dark:bg-[#111827] dark:shadow-none">
            <div className="flex items-center gap-2 font-display text-sm font-bold text-[#0B2240] dark:text-sky-300">
              <ShieldCheck className="h-4 w-4" />
              <span>Veritabanı Şifreleme</span>
            </div>
            <dl className="mt-4 space-y-2.5 text-xs">
              <div>
                <dt className="font-medium text-slate-500 dark:text-slate-400">Şifreleme Standardı</dt>
                <dd className="font-mono-tabular font-bold text-[#0F172A] dark:text-slate-100">
                  {security.encryption.algorithm}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500 dark:text-slate-400">
                  Anahtar Türetme &amp; Parola
                </dt>
                <dd className="font-mono-tabular font-medium text-slate-600 dark:text-slate-300">
                  {security.encryption.passwordHashing}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500 dark:text-slate-400">Durum</dt>
                <dd className="font-bold text-emerald-700 dark:text-emerald-400">
                  {security.encryption.status}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_6px_28px_-14px_rgba(11,34,64,0.08)] dark:border-slate-800 dark:bg-[#111827] dark:shadow-none">
            <div className="flex items-center gap-2 font-display text-sm font-bold text-[#0B2240] dark:text-sky-300">
              <Lock className="h-4 w-4" />
              <span>SSL / TLS &amp; Taşıma Güvenliği</span>
            </div>
            <dl className="mt-4 space-y-2.5 text-xs">
              <div>
                <dt className="font-medium text-slate-500 dark:text-slate-400">Aktif Protokol</dt>
                <dd className="font-bold text-[#0F172A] dark:text-slate-100">
                  {security.ssl.protocol}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500 dark:text-slate-400">HSTS Zorunluluğu</dt>
                <dd className="font-bold text-emerald-700 dark:text-emerald-400">
                  {security.ssl.hstsEnabled ? 'Etkin (max-age 1 yıl)' : 'Pasif'}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500 dark:text-slate-400">Oturum Çerezi</dt>
                <dd className="font-mono-tabular font-medium text-slate-600 dark:text-slate-300">
                  HttpOnly · HMAC-SHA256
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_6px_28px_-14px_rgba(11,34,64,0.08)] dark:border-slate-800 dark:bg-[#111827] dark:shadow-none">
            <div className="flex items-center gap-2 font-display text-sm font-bold text-[#0B2240] dark:text-sky-300">
              <KeyRound className="h-4 w-4" />
              <span>Şifreli Veri Hacmi</span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="font-medium text-slate-500 dark:text-slate-400">Konteynerler</dt>
                <dd className="font-mono-tabular text-lg font-bold text-[#0F172A] dark:text-slate-100">
                  {security.stats.containerCount}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500 dark:text-slate-400">Excel Satırı</dt>
                <dd className="font-mono-tabular text-lg font-bold text-[#0F172A] dark:text-slate-100">
                  {security.stats.excelRowCount}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500 dark:text-slate-400">Denetim Kaydı</dt>
                <dd className="font-mono-tabular text-lg font-bold text-[#0F172A] dark:text-slate-100">
                  {security.stats.historyCount}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500 dark:text-slate-400">Veritabanı Boyutu</dt>
                <dd className="font-mono-tabular text-lg font-bold text-[#0F172A] dark:text-slate-100">
                  {(security.stats.dbSizeBytes / 1024).toFixed(1)} KB
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {/* Team Members Management (6-7 Operators) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_6px_28px_-14px_rgba(11,34,64,0.08)] lg:col-span-7 dark:border-slate-800 dark:bg-[#111827] dark:shadow-none">
          <div className="mb-4 flex items-center gap-2 font-display text-sm font-bold text-[#0F172A] dark:text-slate-100">
            <Users className="h-4 w-4 text-[#0B2240] dark:text-sky-400" />
            <span>Yetkili Ekip Hesapları ({users.length})</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-[#FAFBFD] font-bold text-slate-600 dark:border-slate-800 dark:bg-[#0D1322] dark:text-slate-300">
                  <th className="px-3 py-3">Kullanıcı Adı</th>
                  <th className="px-3 py-3">Ad Soyad</th>
                  <th className="px-3 py-3">Yetki</th>
                  <th className="px-3 py-3">Son Giriş</th>
                  <th className="px-3 py-3 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="font-mono-tabular px-3 py-3 font-bold text-[#0B2240] dark:text-sky-300">
                      {u.username}
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-700 dark:text-slate-200">
                      {u.displayName}
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-600 dark:text-slate-300">
                      {u.role === 'admin' ? 'Ana Yönetici' : 'Operatör'}
                    </td>
                    <td className="font-mono-tabular px-3 py-3 text-slate-500 dark:text-slate-400">
                      {u.lastLoginAt ? formatDateTimeDot(u.lastLoginAt) : '—'}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {u.username !== 'EMELSHIPPING' ? (
                        <button
                          type="button"
                          onClick={() => void handleDeleteUser(u.id)}
                          aria-label={`${u.username} kullanıcısını sil`}
                          className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : (
                        <span className="text-[11px] font-medium text-slate-400">Korumalı</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <form
          onSubmit={handleCreateUser}
          className="space-y-3.5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_6px_28px_-14px_rgba(11,34,64,0.08)] lg:col-span-5 dark:border-slate-800 dark:bg-[#111827] dark:shadow-none"
        >
          <div className="flex items-center gap-2 font-display text-sm font-bold text-[#0F172A] dark:text-slate-100">
            <UserPlus className="h-4 w-4 text-[#0B2240] dark:text-sky-400" />
            <span>Ekip Üyesi Ekle</span>
          </div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Şirketinizdeki 6-7 personel için ayrı operatör hesapları tanımlayabilirsiniz.
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Kullanıcı Adı
            </label>
            <input
              type="text"
              required
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value.toUpperCase())}
              placeholder="Örn. OPERASYON1"
              className="font-mono-tabular mt-1 w-full rounded-xl border border-slate-200 bg-[#FAFBFD] px-3 py-2 text-sm font-semibold text-[#0F172A] uppercase outline-none focus:border-[#0B2240] focus:bg-white dark:border-slate-700 dark:bg-[#0D1322] dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Ad Soyad / Departman
            </label>
            <input
              type="text"
              required
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              placeholder="Örn. İthalat Operasyon"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-[#FAFBFD] px-3 py-2 text-sm font-semibold text-[#0F172A] outline-none focus:border-[#0B2240] focus:bg-white dark:border-slate-700 dark:bg-[#0D1322] dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Şifre (En az 6 karakter)
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-[#FAFBFD] px-3 py-2 text-sm font-semibold text-[#0F172A] outline-none focus:border-[#0B2240] focus:bg-white dark:border-slate-700 dark:bg-[#0D1322] dark:text-slate-100"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-xl bg-[#0B2240] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#143560] dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
          >
            Ekip Üyesini Kaydet
          </button>
        </form>
      </div>

      {/* Optional Carrier API Credentials */}
      <form
        onSubmit={handleSaveCarrierKey}
        className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_6px_28px_-14px_rgba(11,34,64,0.08)] dark:border-slate-800 dark:bg-[#111827] dark:shadow-none"
      >
        <h2 className="font-display text-sm font-bold text-[#0F172A] dark:text-slate-100">
          Canlı Konteyner &amp; Armatör API Anahtarı Tanımlama (İsteğe Bağlı)
        </h2>
        <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          Gemi AIS verileri ücretsiz olarak otomatik çekilir. Tüm hatlar için konteyner bazlı canlı API
          (JSONCargo / ShipsGo) veya Maersk / Hapag-Lloyd anahtarlarınızı şifreli olarak ekleyebilirsiniz.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <select
            value={apiCarrierCode}
            onChange={(e) => setApiCarrierCode(e.target.value)}
            className="rounded-xl border border-slate-200 bg-[#FAFBFD] px-3 py-2 text-sm font-semibold text-[#0F172A] outline-none focus:border-[#0B2240] focus:bg-white dark:border-slate-700 dark:bg-[#0D1322] dark:text-slate-100"
          >
            {multiCarrier.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name} {m.hasApiKey ? '(Kayıtlı)' : ''}
              </option>
            ))}
            {carriers.map((c) => (
              <option key={c.code} value={c.code}>
                {c.shortName} {c.hasApiKey ? '(Kayıtlı)' : ''}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Consumer / Client Key"
            className="font-mono-tabular rounded-xl border border-slate-200 bg-[#FAFBFD] px-3 py-2 text-sm font-semibold text-[#0F172A] outline-none focus:border-[#0B2240] focus:bg-white dark:border-slate-700 dark:bg-[#0D1322] dark:text-slate-100"
          />
          <input
            type="password"
            value={apiSecret}
            onChange={(e) => setApiSecret(e.target.value)}
            placeholder="Client Secret (Opsiyonel)"
            className="font-mono-tabular rounded-xl border border-slate-200 bg-[#FAFBFD] px-3 py-2 text-sm font-semibold text-[#0F172A] outline-none focus:border-[#0B2240] focus:bg-white dark:border-slate-700 dark:bg-[#0D1322] dark:text-slate-100"
          />
          <button
            type="submit"
            className="rounded-xl bg-[#0B2240] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#143560] dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
          >
            Şifreli Kaydet
          </button>
        </div>
      </form>
    </div>
  );
};
