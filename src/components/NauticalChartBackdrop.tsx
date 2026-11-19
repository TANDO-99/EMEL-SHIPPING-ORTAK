import React from 'react';

export const NauticalChartBackdrop: React.FC = () => {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-gradient-to-b from-[#0B2240] via-[#0E2749] to-[#08182E] text-sky-200 transition-colors duration-200 dark:bg-[#090D16] dark:text-sky-300"
    >
      <svg
        className="h-full w-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="nautical-grid" width="120" height="120" patternUnits="userSpaceOnUse">
            <path
              d="M 120 0 L 0 0 0 120"
              stroke="currentColor"
              strokeOpacity="0.045"
              strokeWidth="0.7"
            />
            <path
              d="M 60 0 L 60 120 M 0 60 L 120 60"
              stroke="currentColor"
              strokeOpacity="0.025"
              strokeWidth="0.5"
              strokeDasharray="2 6"
            />
          </pattern>
        </defs>

        <rect width="1440" height="900" fill="url(#nautical-grid)" />

        {/* Subtle Admiralty Sea Contours */}
        <path
          d="M-40 650 C 160 590, 290 715, 490 655 C 690 595, 820 480, 1040 530 C 1220 570, 1340 470, 1500 500"
          stroke="currentColor"
          strokeOpacity="0.055"
          strokeWidth="1.1"
        />
        <path
          d="M-40 695 C 180 635, 310 760, 510 700 C 710 640, 840 525, 1060 575 C 1240 615, 1360 515, 1500 545"
          stroke="currentColor"
          strokeOpacity="0.035"
          strokeWidth="0.85"
          strokeDasharray="6 5"
        />

        {/* Maritime Route Arcs */}
        <path
          d="M 80 180 Q 480 45 940 215 T 1460 145"
          stroke="currentColor"
          strokeOpacity="0.05"
          strokeWidth="0.95"
          strokeDasharray="4 6"
        />
        <path
          d="M 180 830 Q 620 430 1280 265"
          stroke="currentColor"
          strokeOpacity="0.045"
          strokeWidth="0.95"
          strokeDasharray="3 5"
        />

        {/* Delicate Compass Rose — Top Right */}
        <g transform="translate(1260, 185)" stroke="currentColor" strokeOpacity="0.06">
          <circle cx="0" cy="0" r="108" strokeWidth="0.85" />
          <circle cx="0" cy="0" r="95" strokeWidth="0.55" strokeDasharray="2 4" />
          <circle cx="0" cy="0" r="42" strokeWidth="0.65" />
          <circle cx="0" cy="0" r="5" strokeWidth="0.85" />
          <line x1="0" y1="-122" x2="0" y2="122" strokeWidth="0.75" />
          <line x1="-122" y1="0" x2="122" y2="0" strokeWidth="0.75" />
          <line x1="-82" y1="-82" x2="82" y2="82" strokeWidth="0.55" />
          <line x1="82" y1="-82" x2="-82" y2="82" strokeWidth="0.55" />
          <polygon points="0,-108 8,-22 0,-12 -8,-22" fill="currentColor" fillOpacity="0.05" />
        </g>

        {/* Bearing Arc — Bottom Left */}
        <g transform="translate(210, 770)" stroke="currentColor" strokeOpacity="0.05">
          <circle cx="0" cy="0" r="140" strokeWidth="0.75" strokeDasharray="3 5" />
          <circle cx="0" cy="0" r="80" strokeWidth="0.55" />
          <line x1="-150" y1="0" x2="150" y2="0" strokeWidth="0.55" />
          <line x1="0" y1="-150" x2="0" y2="150" strokeWidth="0.55" />
        </g>
      </svg>
    </div>
  );
};
