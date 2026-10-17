import { getContrastTextColor } from '@/lib/color-utils';

const SIZES = {
  md: { box: 'h-9 text-lg', square: 'w-9', wide: 'min-w-12 px-1.5' },
  sm: { box: 'h-7 text-sm', square: 'w-7', wide: 'min-w-9 px-1' },
};

// RATP pictogram shapes: rectangle for buses, round for metro, rounded square for RER.
function shapeClasses(type, size) {
  if (type === 'metro') return `${size.square} rounded-full`;
  if (type === 'rer') return `${size.square} rounded-md`;
  return size.wide;
}

export default function LineBadge({ name, color = '#3B82F6', type, size = 'md' }) {
  const sizing = SIZES[size];

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center font-bold ${sizing.box} ${shapeClasses(type, sizing)}`}
      style={{ backgroundColor: color, color: getContrastTextColor(color) }}
    >
      {name}
    </span>
  );
}
