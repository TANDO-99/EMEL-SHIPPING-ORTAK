import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Moon, ShieldCheck, Sun } from 'lucide-react';
import { apiFetch, setStoredToken } from '../lib/api';
import type { AuthUser } from '../types';

interface LoginViewProps {
  onSuccess: (user: AuthUser) => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onSuccess,
  theme = 'light',
  onToggleTheme,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<{ user: AuthUser; token?: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      if (data.token) {
        setStoredToken(data.token);
      }
      onSuccess(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Giriş yapılamadı.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative z-10 flex min-h-screen flex-col justify-center px-4 py-12 sm:px-6">
      <div className="mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_20px_60px_-20px_rgba(11,34,64,0.16)] dark:border-slate-800 dark:bg-[#111827] dark:shadow-none">
        {/* Clean Military Navy Header */}
        <div className="flex items-center justify-between gap-3 bg-[#0B2240] px-7 py-6 text-white dark:bg-[#0D1322] dark:border-b dark:border-slate-800">
          <div className="flex items-center gap-4">
            <img
              src="./assets/aistudio/Logo_44613c4c.png"
              alt="EMEL SHIPPING Logo"
              className="h-12 w-auto shrink-0 object-contain mix-blend-screen"
            />
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight text-white">
                EMEL SHIPPING
              </h1>
              <p className="mt-0.5 text-xs font-medium text-slate-300">
                Mersin Varış, Konteyner &amp; Gemi Takip Platformu
              </p>
            </div>
          </div>

          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'Aydınlık Tema' : 'Siyah Tema'}
              aria-label="Tema Değiştir"
              className="inline-flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-7 py-8">
          <div>
            <h2 className="font-display text-lg font-bold text-[#0F172A] dark:text-slate-100">
              Yetkili Personel Girişi
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
              Operasyon paneline erişmek için şirket hesabınızla giriş yapın.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300"
            >
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="login-username"
              className="block text-xs font-bold tracking-wide text-slate-600 uppercase dark:text-slate-300"
            >
              Kullanıcı Adı
            </label>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Kullanıcı adınızı girin"
              className="w-full rounded-xl border border-slate-200 bg-[#FAFBFD] px-4 py-3 text-sm font-semibold text-[#0F172A] outline-none transition focus:border-[#0B2240] focus:bg-white focus:ring-2 focus:ring-[#0B2240]/10 dark:border-slate-700 dark:bg-[#0D1322] dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-500"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="login-password"
              className="block text-xs font-bold tracking-wide text-slate-600 uppercase dark:text-slate-300"
            >
              Şifre
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Şifrenizi girin"
                className="w-full rounded-xl border border-slate-200 bg-[#FAFBFD] py-3 pr-11 pl-4 text-sm font-semibold text-[#0F172A] outline-none transition focus:border-[#0B2240] focus:bg-white focus:ring-2 focus:ring-[#0B2240]/10 dark:border-slate-700 dark:bg-[#0D1322] dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition hover:text-[#0B2240] dark:hover:text-sky-300"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B2240] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#143560] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
          >
            <Lock className="h-4 w-4" />
            <span>{loading ? 'Doğrulanıyor...' : 'Panele Giriş Yap'}</span>
          </button>

          <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-[#0B2240] dark:text-sky-400" />
              AES-256-GCM Şifreli Veritabanı
            </span>
            <span>SSL / TLS Korumalı</span>
          </div>
        </form>
      </div>
    </div>
  );
};
