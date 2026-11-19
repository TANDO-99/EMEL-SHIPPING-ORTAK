import React, { useState } from 'react';
import {
  Anchor,
  Compass,
  ExternalLink,
  Layers,
  MapPin,
  Maximize2,
  Minimize2,
  RefreshCw,
  Ship,
} from 'lucide-react';

interface PresetLocation {
  id: string;
  name: string;
  centerX: number;
  centerY: number;
  zoom: number;
  description: string;
}

const PRESETS: PresetLocation[] = [
  {
    id: 'mersin-med',
    name: 'Doğu Akdeniz (Varsayılan)',
    centerX: 34.2,
    centerY: 35.4,
    zoom: 8,
    description: 'Mersin yaklaşma rotası ve Doğu Akdeniz canlı AIS',
  },
  {
    id: 'mersin-port',
    name: 'Mersin Limanı & Demir',
    centerX: 34.65,
    centerY: 36.78,
    zoom: 11,
    description: 'Mersin Uluslararası Limanı (MIP) ve demirleme sahası',
  },
  {
    id: 'iskenderun',
    name: 'İskenderun Körfezi',
    centerX: 35.85,
    centerY: 36.65,
    zoom: 10,
    description: 'İskenderun ve Dörtyol limanları',
  },
  {
    id: 'suez',
    name: 'Süveyş Kanalı Girişi',
    centerX: 32.55,
    centerY: 31.25,
    zoom: 9,
    description: 'Port Said ve Akdeniz transit rotası',
  },
];

type MapSource = 'marinetraffic' | 'vesselfinder' | 'openseamap';

export const MarineTrafficMapView: React.FC = () => {
  const [selectedPreset, setSelectedPreset] = useState<PresetLocation>(PRESETS[0]);
  const [mapSource, setMapSource] = useState<MapSource>('marinetraffic');
  const [refreshKey, setRefreshKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const marineTrafficUrl = `https://www.marinetraffic.com/en/ais/home/centerx:${selectedPreset.centerX}/centery:${selectedPreset.centerY}/zoom:${selectedPreset.zoom}`;
  const marineTrafficEmbedUrl = `https://www.marinetraffic.com/en/ais/embed/zoom:${selectedPreset.zoom}/centery:${selectedPreset.centerY}/centerx:${selectedPreset.centerX}`;
  
  // VesselFinder interactive map URL
  const vesselFinderEmbedUrl = `https://www.vesselfinder.com/aismap?zoom=${selectedPreset.zoom}&lat=${selectedPreset.centerY}&lon=${selectedPreset.centerX}&width=100%&height=100%&names=true&mmsi=0&track=0&fleet=false&fleet_name=false&fleet_timeshift=false&fleet_track=false&clicktoact=false&store_pos=true`;

  // OpenSeaMap URL
  const openSeaMapUrl = `https://map.openseamap.org/?zoom=${selectedPreset.zoom}&lat=${selectedPreset.centerY}&lon=${selectedPreset.centerX}&layers=BFTFFFTFFTF`;

  const currentIframeSrc =
    mapSource === 'marinetraffic'
      ? marineTrafficUrl
      : mapSource === 'vesselfinder'
      ? vesselFinderEmbedUrl
      : openSeaMapUrl;

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
  };

  return (
    <div
      className={`space-y-4 transition-all ${
        isFullscreen ? 'fixed inset-0 z-50 overflow-hidden bg-slate-950 p-4' : ''
      }`}
    >
      {/* Top Controls Header */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_4px_20px_-10px_rgba(11,34,64,0.06)] dark:border-slate-800 dark:bg-[#111827]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0B2240] text-white dark:bg-sky-500 dark:text-slate-950">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base font-bold text-[#0F172A] sm:text-lg dark:text-slate-100">
                  Mersin &amp; Doğu Akdeniz Canlı AIS Haritası
                </h2>
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Canlı AIS
                </span>
              </div>
              <p className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
                MarineTraffic · Merkez: {selectedPreset.centerX}°E, {selectedPreset.centerY}°N · Zoom:{' '}
                {selectedPreset.zoom} ({selectedPreset.description})
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Map Source Engine Switcher */}
            <div className="inline-flex rounded-xl border border-slate-200 bg-[#FAFBFD] p-1 dark:border-slate-700 dark:bg-[#0D1322]">
              <button
                type="button"
                onClick={() => setMapSource('marinetraffic')}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  mapSource === 'marinetraffic'
                    ? 'bg-[#0B2240] text-white shadow-xs dark:bg-sky-500 dark:text-slate-950'
                    : 'text-slate-600 hover:text-[#0F172A] dark:text-slate-300'
                }`}
              >
                MarineTraffic
              </button>
              <button
                type="button"
                onClick={() => setMapSource('vesselfinder')}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  mapSource === 'vesselfinder'
                    ? 'bg-[#0B2240] text-white shadow-xs dark:bg-sky-500 dark:text-slate-950'
                    : 'text-slate-600 hover:text-[#0F172A] dark:text-slate-300'
                }`}
              >
                VesselFinder AIS
              </button>
              <button
                type="button"
                onClick={() => setMapSource('openseamap')}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  mapSource === 'openseamap'
                    ? 'bg-[#0B2240] text-white shadow-xs dark:bg-sky-500 dark:text-slate-950'
                    : 'text-slate-600 hover:text-[#0F172A] dark:text-slate-300'
                }`}
              >
                OpenSeaMap
              </button>
            </div>

            <button
              type="button"
              onClick={handleRefresh}
              title="Haritayı Yenile"
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-[#0D1322] dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Yenile</span>
            </button>

            <button
              type="button"
              onClick={() => setIsFullscreen((prev) => !prev)}
              title={isFullscreen ? 'Tam Ekrandan Çık' : 'Tam Ekran'}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-[#0D1322] dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Küçült</span>
                </>
              ) : (
                <>
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Tam Ekran</span>
                </>
              )}
            </button>

            <a
              href={marineTrafficUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B2240] px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-[#143560] dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
            >
              <span>MarineTraffic'te Aç</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        {/* Location Preset Chips */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
          <span className="text-[11px] font-bold text-slate-400 uppercase">Hızlı Bölge:</span>
          {PRESETS.map((preset) => {
            const isSelected = selectedPreset.id === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setSelectedPreset(preset)}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  isSelected
                    ? 'bg-[#0B2240] text-white dark:bg-sky-500 dark:text-slate-950'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                <MapPin className="h-3 w-3" />
                <span>{preset.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Map Container */}
      <div
        className={`relative overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-900 shadow-[0_10px_30px_-10px_rgba(11,34,64,0.1)] dark:border-slate-800 ${
          isFullscreen ? 'h-[calc(100vh-140px)]' : 'h-[640px] sm:h-[720px]'
        }`}
      >
        <iframe
          key={`${currentIframeSrc}-${refreshKey}`}
          src={currentIframeSrc}
          title="Mersin & Doğu Akdeniz MarineTraffic Canlı AIS Haritası"
          className="h-full w-full border-0"
          loading="lazy"
          allow="geolocation; fullscreen"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-top-navigation-by-user-activation"
        />

        {/* Floating Helper Pill in Bottom Left */}
        <div className="pointer-events-auto absolute bottom-4 left-4 z-20 hidden items-center gap-2 rounded-xl border border-white/20 bg-[#0B2240]/90 px-3.5 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-md sm:flex">
          <Ship className="h-3.5 w-3.5 text-amber-300" />
          <span>Mersin Limanı &amp; Doğu Akdeniz Gemi Hareketleri</span>
          <span className="text-white/40">|</span>
          <a
            href={marineTrafficUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sky-300 hover:underline"
          >
            <span>Haritayı Doğrudan Aç</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
};
