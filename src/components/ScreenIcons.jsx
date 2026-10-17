import { SCREEN } from '@/lib/screen-theme';

export const MODE_LABELS = { rer: 'RER', metro: 'Métro', tram: 'Tramway', bus: 'Bus' };

const MARK_SIZES = { sm: 'w-4 h-4 text-[10px]', md: 'w-5 h-5 text-xs' };
const CONE_SIZES = { sm: 'w-4 h-5', md: 'w-5 h-6' };

function BusGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor" fillRule="evenodd" aria-hidden="true">
      <path d="M4.5 1h7A1.5 1.5 0 0 1 13 2.5V12a1 1 0 0 1-1 1v1.5h-2V13H6v1.5H4V13a1 1 0 0 1-1-1V2.5A1.5 1.5 0 0 1 4.5 1zM4.5 3v4.5h7V3zM4.3 10.3a.9.9 0 1 0 1.8 0a.9.9 0 1 0-1.8 0zM9.9 10.3a.9.9 0 1 0 1.8 0a.9.9 0 1 0-1.8 0z" />
    </svg>
  );
}

/** Round transport mode pictogram, drawn in the current text colour. */
export function ModeIcon({ type, className = '' }) {
  let glyph = <span className="text-sm">{(MODE_LABELS[type] ?? type ?? '?').charAt(0).toUpperCase()}</span>;
  if (type === 'bus') glyph = <BusGlyph />;
  if (type === 'rer') glyph = <span className="text-[9px] tracking-tight">RER</span>;

  return (
    <span
      role="img"
      aria-label={MODE_LABELS[type] ?? type}
      className={`flex shrink-0 items-center justify-center w-8 h-8 rounded-full border-2 border-current font-bold leading-none ${className}`}
    >
      {glyph}
    </span>
  );
}

/**
 * Corner mark of the RATP traffic screens: orange "!" when disrupted, red
 * cross when interrupted, grey cone for works.
 */
export function StatusMark({ kind, size = 'md', className = '' }) {
  if (!kind) return null;

  if (kind === 'works') {
    return (
      <svg viewBox="0 0 20 24" className={`${CONE_SIZES[size]} ${className}`} aria-hidden="true">
        <path d="M7.5 2h5l4.5 17h-14z" fill={SCREEN.works} stroke="white" strokeWidth="2" strokeLinejoin="round" />
        <rect x="1" y="18" width="18" height="5" rx="1.5" fill={SCREEN.works} stroke="white" strokeWidth="2" />
        <path d="M6.3 8h7.4M5 13h10" stroke="white" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`flex items-center justify-center rounded border-2 border-white font-bold leading-none text-white ${MARK_SIZES[size]} ${className}`}
      style={{ backgroundColor: kind === 'blocked' ? SCREEN.alert : SCREEN.warning }}
    >
      {kind === 'blocked' ? (
        <svg viewBox="0 0 10 10" className="w-2/3 h-2/3">
          <path d="M2 2l6 6M8 2l-6 6" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      ) : (
        '!'
      )}
    </span>
  );
}
