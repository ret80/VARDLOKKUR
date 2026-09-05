/* icons.tsx – пиксельные SVG-иконки */

const px = { imageRendering: "pixelated" as const };

export const SwordIco = ({ dim }: { dim?: boolean }) => (
  <svg width="15" height="15" viewBox="0 0 12 12" style={{ ...px, opacity: dim ? 0.3 : 1 }}>
    <rect x="8" y="1" width="2" height="2" fill="#c8d3dc" />
    <rect x="7" y="2" width="2" height="2" fill="#c8d3dc" />
    <rect x="6" y="3" width="2" height="2" fill="#c8d3dc" />
    <rect x="5" y="4" width="2" height="2" fill="#a9b6c2" />
    <rect x="3" y="5" width="3" height="2" fill="#8a744a" />
    <rect x="2" y="8" width="2" height="2" fill="#5a4632" />
    <rect x="1" y="10" width="2" height="1" fill="#c9a24b" />
  </svg>
);

export const AxeIco = ({ dim }: { dim?: boolean }) => (
  <svg width="15" height="15" viewBox="0 0 12 12" style={{ ...px, opacity: dim ? 0.3 : 1 }}>
    <rect x="5" y="1" width="4" height="4" fill="#9fe0ee" />
    <rect x="4" y="2" width="2" height="3" fill="#7fc4d4" />
    <rect x="5" y="5" width="2" height="6" fill="#5a4632" />
    <rect x="6" y="2" width="1" height="1" fill="#d8f4fa" />
  </svg>
);

export const BowIco = ({ dim }: { dim?: boolean }) => (
  <svg width="15" height="15" viewBox="0 0 12 12" style={{ ...px, opacity: dim ? 0.3 : 1 }}>
    <rect x="2" y="1" width="1" height="3" fill="#8a744a" />
    <rect x="1" y="4" width="1" height="4" fill="#8a744a" />
    <rect x="2" y="8" width="1" height="3" fill="#8a744a" />
    <rect x="2" y="1" width="1" height="10" fill="#c9a24b" opacity="0.5" />
    <rect x="3" y="5" width="7" height="1" fill="#c8d3dc" />
    <rect x="10" y="5" width="2" height="1" fill="#e8c979" />
  </svg>
);

export const HammerIco = ({ dim }: { dim?: boolean }) => (
  <svg width="15" height="15" viewBox="0 0 12 12" style={{ ...px, opacity: dim ? 0.3 : 1 }}>
    <rect x="2" y="1" width="8" height="4" fill="#63d8c8" />
    <rect x="2" y="1" width="8" height="1" fill="#a8ece2" />
    <rect x="5" y="5" width="2" height="6" fill="#5a4632" />
  </svg>
);

export const HeartIco = () => (
  <svg width="13" height="13" viewBox="0 0 12 12" style={px}>
    <rect x="2" y="2" width="3" height="2" fill="#c03050" />
    <rect x="7" y="2" width="3" height="2" fill="#c03050" />
    <rect x="1" y="4" width="10" height="3" fill="#c03050" />
    <rect x="3" y="7" width="6" height="2" fill="#a02840" />
    <rect x="4" y="9" width="4" height="1" fill="#a02840" />
    <rect x="5" y="10" width="2" height="1" fill="#a02840" />
  </svg>
);

export const ArrowIco = () => (
  <svg width="13" height="13" viewBox="0 0 12 12" style={px}>
    <rect x="9" y="1" width="2" height="2" fill="#e8c979" />
    <rect x="5" y="3" width="5" height="1" fill="#c8d3dc" />
    <rect x="1" y="7" width="6" height="1" fill="#8a744a" />
    <rect x="1" y="6" width="2" height="1" fill="#6e7f8d" />
    <rect x="1" y="8" width="2" height="1" fill="#6e7f8d" />
  </svg>
);

export const RuneIco = () => (
  <svg width="13" height="13" viewBox="0 0 12 12" style={px}>
    <rect x="4" y="1" width="4" height="10" fill="#3d5a66" />
    <rect x="5" y="2" width="2" height="8" fill="#63d8c8" />
    <rect x="3" y="4" width="1" height="4" fill="#63d8c8" />
    <rect x="8" y="4" width="1" height="4" fill="#63d8c8" />
  </svg>
);

export const BagIco = () => (
  <svg width="15" height="15" viewBox="0 0 12 12" style={px}>
    <rect x="4" y="1" width="4" height="1" fill="#8a744a" />
    <rect x="2" y="4" width="8" height="6" fill="#5a4632" />
    <rect x="2" y="4" width="8" height="2" fill="#7a6248" />
    <rect x="5" y="6" width="2" height="2" fill="#c9a24b" />
  </svg>
);

export const BookIco = () => (
  <svg width="15" height="15" viewBox="0 0 12 12" style={px}>
    <rect x="5" y="1" width="2" height="2" fill="#e8c979" />
    <rect x="4" y="3" width="4" height="1" fill="#e8c979" />
    <rect x="5" y="4" width="2" height="4" fill="#c9a24b" />
    <rect x="5" y="8" width="2" height="1" fill="#8a744a" />
  </svg>
);

export const KnotFrame = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="50" cy="50" r="46" opacity="0.5" />
    <circle cx="50" cy="50" r="38" opacity="0.25" strokeDasharray="6 5" />
    <path d="M50 8 L58 22 L50 18 L42 22 Z" fill="currentColor" stroke="none" opacity="0.8" />
    <path d="M50 92 L58 78 L50 82 L42 78 Z" fill="currentColor" stroke="none" opacity="0.8" />
    <path d="M8 50 L22 42 L18 50 L22 58 Z" fill="currentColor" stroke="none" opacity="0.8" />
    <path d="M92 50 L78 42 L82 50 L78 58 Z" fill="currentColor" stroke="none" opacity="0.8" />
  </svg>
);