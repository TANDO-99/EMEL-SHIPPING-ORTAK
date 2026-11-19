import React, { useEffect, useRef, useState } from 'react';
import {
  Compass,
  FileSpreadsheet,
  LogOut,
  Menu,
  Moon,
  Server,
  Settings,
  Ship,
  Sun,
  X,
} from 'lucide-react';
import { ContainerTrackingView } from './components/ContainerTrackingView';
import { ExcelListSearchView } from './components/ExcelListSearchView';
import { LoginView } from './components/LoginView';
import { MarineTrafficMapView } from './components/MarineTrafficMapView';
import { NauticalChartBackdrop } from './components/NauticalChartBackdrop';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ServerSyncView } from './components/ServerSyncView';
import { apiFetch, setStoredToken } from './lib/api';
import type { AuthUser } from './types';

type ActiveSection = 'tracking' | 'excel' | 'sync' | 'map';
type ThemeMode = 'light' | 'dark';

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem('emel_theme');
  return saved === 'dark' ? 'dark' : 'light';
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [activeSection, setActiveSection] = useState<ActiveSection>('tracking');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [jumpContainerNo, setJumpContainerNo] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    window.localStorage.setItem('emel_theme', theme);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#090D16' : '#0B2240');
    }
  }, [theme]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    if (settingsOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [settingsOpen]);

  useEffect(() => {
    let mounted = true;
    apiFetch<{ authenticated: boolean; user?: AuthUser }>('/api/auth/me')
      .then((res) => {
        if (mounted && res.authenticated && res.user) {
          setUser(res.user);
        }
      })
      .catch(() => {
        if (mounted) setUser(null);
      })
      .finally(() => {
        if (mounted) setCheckingAuth(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // clear locally anyway
    }
    setStoredToken(null);
    setUser(null);
    setActiveSection('tracking');
    setMobileMenuOpen(false);
    setSettingsOpen(false);
  };

  const handleNavigate = (section: ActiveSection) => {
    setActiveSection(section);
    setMobileMenuOpen(false);
  };

  const handleSelectContainerFromExcel = (containerNumber: string) => {
    setJumpContainerNo(containerNumber);
    setActiveSection('tracking');
  };

  if (checkingAuth) {
    return (
      <div className="relative min-h-screen bg-[#0B2240] dark:bg-[#090D16]">
        <NauticalChartBackdrop />
        <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
          <div className="flex items-center gap-3.5 rounded-2xl border border-white/20 bg-[#0B2240]/90 px-6 py-4 text-sm font-semibold text-white shadow-xl backdrop-blur-md">
            <img
              src="./assets/aistudio/Logo_44613c4c.png"
              alt="EMEL SHIPPING"
              className="h-8 w-8 rounded-lg bg-white p-1 object-contain"
            />
            <span>Oturum doğrulanıyor...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative min-h-screen bg-[#0B2240] dark:bg-[#090D16]">
        <NauticalChartBackdrop />
        <LoginView
          onSuccess={(loggedInUser) => setUser(loggedInUser)}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        />
      </div>
    );
  }

  const navItems: Array<{
    id: ActiveSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'tracking', label: 'Konteyner Takip', icon: Ship },
    { id: 'excel', label: 'Liste', icon: FileSpreadsheet },
    { id: 'sync', label: 'Liste Yükleme', icon: Server },
    { id: 'map', label: 'Canlı Harita', icon: Compass },
  ];

  const visibleNav = navItems;
  const userSummaryLine = `${user.username} · ${
    user.role === 'admin' ? 'Yönetici' : user.displayName
  }`;

  return (
    <div className="relative min-h-screen bg-[#FAFBFD] text-[#0F172A] transition-colors duration-200 dark:bg-[#090D16] dark:text-slate-100">
      <NauticalChartBackdrop />

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0B2240] text-white shadow-xs dark:border-slate-800 dark:bg-[#0D1322]">
          <div className="mx-auto flex h-14 max-w-[1360px] items-center justify-between gap-4 px-4 sm:px-6 lg:h-16 lg:px-8">
            <button
              type="button"
              onClick={() => handleNavigate('tracking')}
              className="flex items-center gap-3 text-left shrink-0"
            >
              <img
                src="./assets/aistudio/Logo_44613c4c.png"
                alt="EMEL SHIPPING Logo"
                className="h-9 w-auto shrink-0 object-contain mix-blend-screen lg:h-10"
              />
              <div className="leading-tight">
                <div className="font-display text-sm font-bold tracking-tight text-white lg:text-base whitespace-nowrap">
                  EMEL SHIPPING
                </div>
                <div className="hidden text-[11px] font-medium text-slate-300/90 sm:block whitespace-nowrap">
                  Mersin Varış &amp; Takip Merkezi
                </div>
              </div>
            </button>

            <nav aria-label="Ana Menü" className="hidden items-center gap-1 lg:flex">
              {visibleNav.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavigate(item.id)}
                    className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition whitespace-nowrap ${
                      active
                        ? 'bg-white text-[#0B2240] shadow-xs dark:bg-sky-500 dark:text-slate-950'
                        : 'text-slate-200 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="hidden items-center gap-2 shrink-0 lg:flex">
              <span className="font-mono-tabular mr-1 text-xs font-semibold text-slate-200 whitespace-nowrap">
                {userSummaryLine}
              </span>

              <PWAInstallButton />

              <button
                type="button"
                onClick={() => setTheme('light')}
                title="Aydınlık Tema"
                aria-label="Aydınlık Tema"
                className={`inline-flex h-8.5 w-8.5 items-center justify-center rounded-xl border transition ${
                  theme === 'light'
                    ? 'border-white bg-white text-[#0B2240]'
                    : 'border-white/20 bg-white/10 text-white hover:bg-white/25'
                }`}
              >
                <Sun className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => setTheme('dark')}
                title="Siyah Tema"
                aria-label="Siyah Tema"
                className={`inline-flex h-8.5 w-8.5 items-center justify-center rounded-xl border transition ${
                  theme === 'dark'
                    ? 'border-sky-400 bg-sky-500 text-slate-950'
                    : 'border-white/20 bg-white/10 text-white hover:bg-white/25'
                }`}
              >
                <Moon className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => void handleLogout()}
                className="inline-flex h-8.5 items-center gap-1.5 rounded-xl border border-white/20 px-3 text-xs font-semibold text-white transition hover:bg-white/10 whitespace-nowrap"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Çıkış</span>
              </button>
            </div>

            <div className="flex items-center gap-2 lg:hidden">
              <PWAInstallButton />
              <button
                type="button"
                onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
                aria-label="Tema Değiştir"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 text-white"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
             <button
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                aria-label={mobileMenuOpen ? 'Menüyü kapat' : 'Menüyü aç'}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 text-white"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
