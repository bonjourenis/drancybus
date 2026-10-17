import { getContrastTextColor } from '@/lib/color-utils';

export default function DepartureRow({ departure, lineColors }) {
  const getStatusColor = () => {
    if (departure.vehicleAtStop || departure.minutesUntil <= 1) {
      return 'text-green-600 dark:text-green-400 font-bold';
    }
    if (departure.minutesUntil <= 5) {
      return 'text-orange-600 dark:text-orange-400';
    }
    return 'text-zinc-900 dark:text-zinc-100';
  };

  const lineColor = lineColors?.[departure.lineRef] || '#3B82F6';
  const textColor = getContrastTextColor(lineColor);

  return (
    <div className="px-4 py-3 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors">
      <div className="flex items-center gap-3">
        <span
          className="inline-flex items-center justify-center min-w-[2.5rem] h-7 px-2 text-sm font-bold rounded"
          style={{ backgroundColor: lineColor, color: textColor }}
        >
          {departure.lineName}
        </span>
        <div className="flex flex-col">
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            {departure.destination}
          </p>
          {departure.isRealtime && (
            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
              Temps réel
            </span>
          )}
        </div>
      </div>

      <div className={`text-right font-mono text-lg ${getStatusColor()}`}>
        {departure.displayTime}
      </div>
    </div>
  );
}
