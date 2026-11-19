// High-Quality Vector Illustrations for Native Device Types

export const Illustrations = {
  phone: `<svg viewBox="0 0 100 160" width="60" height="96" fill="none" xmlns="http://www.w3.org/2000/svg" class="device-art">
    <rect x="6" y="6" width="88" height="148" rx="16" fill="var(--bg-device-body)" stroke="var(--border-device)" stroke-width="2.5"/>
    <rect x="12" y="14" width="76" height="132" rx="10" fill="var(--bg-device-screen)"/>
    <!-- Punch-hole Camera -->
    <circle cx="50" cy="20" r="2.5" fill="var(--device-camera)"/>
    <!-- Screen Accent / Wallpaper -->
    <path d="M12 90 Q 30 75, 50 85 T 88 70 L 88 146 L 12 146 Z" fill="var(--device-wallpaper)" opacity="0.3"/>
    <!-- Home Bar -->
    <rect x="36" y="140" width="28" height="2" rx="1" fill="var(--device-homebar)"/>
  </svg>`,

  largePhone: `<svg viewBox="0 0 108 170" width="62" height="98" fill="none" xmlns="http://www.w3.org/2000/svg" class="device-art">
    <rect x="5" y="5" width="98" height="160" rx="18" fill="var(--bg-device-body)" stroke="var(--border-device)" stroke-width="2.5"/>
    <rect x="10" y="11" width="88" height="148" rx="12" fill="var(--bg-device-screen)"/>
    <circle cx="54" cy="18" r="2.5" fill="var(--device-camera)"/>
    <path d="M10 95 Q 40 80, 60 90 T 98 80 L 98 159 L 10 159 Z" fill="var(--device-wallpaper)" opacity="0.4"/>
    <rect x="39" y="152" width="30" height="2" rx="1" fill="var(--device-homebar)"/>
  </svg>`,

  tablet: `<svg viewBox="0 0 160 115" width="96" height="69" fill="none" xmlns="http://www.w3.org/2000/svg" class="device-art">
    <rect x="5" y="5" width="150" height="105" rx="12" fill="var(--bg-device-body)" stroke="var(--border-device)" stroke-width="2.5"/>
    <rect x="12" y="12" width="136" height="91" rx="7" fill="var(--bg-device-screen)"/>
    <circle cx="80" cy="8" r="1.5" fill="var(--device-camera)"/>
    <path d="M12 60 Q 50 45, 90 55 T 148 50 L 148 103 L 12 103 Z" fill="var(--device-wallpaper)" opacity="0.3"/>
    <rect x="65" y="98" width="30" height="2" rx="1" fill="var(--device-homebar)"/>
  </svg>`,

  foldable: `<svg viewBox="0 0 140 140" width="80" height="80" fill="none" xmlns="http://www.w3.org/2000/svg" class="device-art">
    <rect x="5" y="5" width="130" height="130" rx="14" fill="var(--bg-device-body)" stroke="var(--border-device)" stroke-width="2.5"/>
    <rect x="10" y="10" width="120" height="120" rx="8" fill="var(--bg-device-screen)"/>
    <!-- Fold Hinge Indicator -->
    <line x1="70" y1="10" x2="70" y2="130" stroke="var(--border-subtle)" stroke-width="1.5" stroke-dasharray="3 3"/>
    <circle cx="70" cy="16" r="2" fill="var(--device-camera)"/>
    <path d="M10 80 Q 40 70, 70 80 T 130 75 L 130 130 L 10 130 Z" fill="var(--device-wallpaper)" opacity="0.3"/>
  </svg>`,

  iosSimulator: `<svg viewBox="0 0 100 160" width="60" height="96" fill="none" xmlns="http://www.w3.org/2000/svg" class="device-art">
    <rect x="6" y="6" width="88" height="148" rx="20" fill="var(--bg-device-body)" stroke="var(--border-device)" stroke-width="2.5"/>
    <rect x="11" y="12" width="78" height="136" rx="14" fill="var(--bg-device-screen)"/>
    <!-- Dynamic Island Pill -->
    <rect x="37" y="15" width="26" height="7" rx="3.5" fill="var(--device-camera)"/>
    <!-- Home Indicator -->
    <rect x="35" y="142" width="30" height="2.5" rx="1.25" fill="var(--device-homebar)"/>
  </svg>`,

  welcomeHero: `<svg viewBox="0 0 280 180" width="220" height="140" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- Back Tablet -->
    <g transform="translate(70, 20)">
      <rect width="160" height="110" rx="12" fill="var(--bg-card)" stroke="var(--border-strong)" stroke-width="2"/>
      <rect x="8" y="8" width="144" height="94" rx="6" fill="var(--bg-surface)" opacity="0.7"/>
    </g>
    <!-- Foreground Phone -->
    <g transform="translate(30, 45)">
      <rect width="70" height="120" rx="14" fill="var(--bg-card)" stroke="var(--color-primary)" stroke-width="2"/>
      <rect x="6" y="8" width="58" height="104" rx="8" fill="var(--bg-surface)"/>
      <rect x="25" y="10" width="20" height="4" rx="2" fill="var(--text-subtle)"/>
      <rect x="23" y="106" width="24" height="2" rx="1" fill="var(--text-subtle)"/>
    </g>
  </svg>`
};
