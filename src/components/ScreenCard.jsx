import { SCREEN, SCREEN_FONT } from '@/lib/screen-theme';

/** Card styled as an RATP screen: navy title bar over white rows on grey-blue. */
export default function ScreenCard({ title, aside = null, bodyClassName = '', children }) {
  return (
    <div
      className="overflow-hidden rounded-xl shadow-md"
      style={{ backgroundColor: SCREEN.background, fontFamily: SCREEN_FONT }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ backgroundColor: SCREEN.navy }}>
        <h3 className="font-bold text-lg text-white leading-tight">{title}</h3>
        {aside}
      </div>
      <div className={`flex flex-col gap-1 py-1.5 ${bodyClassName}`}>{children}</div>
    </div>
  );
}

/** A white screen row holding a single line of text. */
export function ScreenMessage({ children, className = 'text-center font-bold' }) {
  return (
    <p className={`bg-white px-4 py-4 ${className}`} style={{ color: SCREEN.navy }}>
      {children}
    </p>
  );
}
