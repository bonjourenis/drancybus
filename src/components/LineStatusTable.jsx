'use client';

import { useState } from 'react';
import { useDisruptions } from '@/hooks/useDisruptions';
import { SCREEN, SCREEN_FONT } from '@/lib/screen-theme';
import LineBadge from './LineBadge';
import RefreshIndicator from './RefreshIndicator';
import ScreenClock from './ScreenClock';
import { MODE_LABELS, ModeIcon, StatusMark } from './ScreenIcons';

const MODE_ORDER = ['rer', 'metro', 'tram', 'bus'];
const STATUS_RANK = { blocked: 3, disrupted: 2, info: 1, normal: 0 };
const TIME_PATTERN = /(\b\d{1,2}[h:]\d{2}\b)/;
const PANEL_ID = 'traffic-panel';

function hasNews(line) {
  return line.active.length > 0 || line.upcoming.length > 0;
}

function lineMark(line) {
  if (line.status === 'blocked' || line.status === 'disrupted') return line.status;
  return [...line.active, ...line.upcoming].some((item) => item.cause === 'works') ? 'works' : null;
}

function itemMark(item) {
  if (item.state === 'active' && item.severity === 'blocking') return 'blocked';
  if (item.state === 'active' && item.severity === 'disrupted') return 'disrupted';
  return item.cause === 'works' ? 'works' : null;
}

function modeRank(type) {
  const rank = MODE_ORDER.indexOf(type);
  return rank === -1 ? MODE_ORDER.length : rank;
}

/** [[type, lines]] in RATP screen order: RER, metro, tram, bus. */
function groupByMode(lines) {
  const groups = new Map();
  for (const line of lines) {
    groups.set(line.type, [...(groups.get(line.type) ?? []), line]);
  }
  return [...groups.entries()].sort(([a], [b]) => modeRank(a) - modeRank(b));
}

function mostSevere(lines) {
  return lines.reduce((best, line) => (!best || STATUS_RANK[line.status] > STATUS_RANK[best.status] ? line : best), null);
}

/** Times such as "22h45" or "04:30" get the dark highlight of the screens. */
function HighlightedText({ text }) {
  return text.split(TIME_PATTERN).map((part, index) =>
    index % 2 === 1 ? (
      <span
        key={index}
        className="inline-block rounded px-1 text-white leading-tight"
        style={{ backgroundColor: SCREEN.muted }}
      >
        {part}
      </span>
    ) : (
      part
    )
  );
}

function LineTile({ line, selected, onSelect }) {
  const mark = lineMark(line);
  const borderColor = { blocked: SCREEN.alert, disrupted: SCREEN.warning }[mark] ?? SCREEN.ok;
  const Tile = hasNews(line) ? 'button' : 'div';

  return (
    <li>
      <Tile
        {...(Tile === 'button' && {
          type: 'button',
          onClick: () => onSelect(line.lineId),
          'aria-controls': PANEL_ID,
          'aria-pressed': selected,
        })}
        className={`relative flex items-center justify-center w-16 h-16 rounded-lg bg-white ${
          mark === 'blocked' || mark === 'disrupted' ? 'border-4' : 'border-2'
        } ${selected ? 'outline-2 outline-offset-2 outline-white' : ''}`}
        style={{ borderColor }}
        title={`${line.name} : ${line.statusLabel}`}
      >
        <LineBadge name={line.shortName} color={line.color} type={line.type} />
        <span className="sr-only">
          {line.name} : {line.statusLabel}
        </span>
        <StatusMark kind={mark} className="absolute -bottom-2 -right-2" />
      </Tile>
    </li>
  );
}

function DisruptionMessage({ item }) {
  const where = item.scope === 'stops' && item.stops.length > 0 ? item.stops.join(', ') : null;
  const when =
    item.state === 'active'
      ? item.end && `jusqu'au ${item.end}`
      : item.begin && `à partir du ${item.begin}`;
  const message = (item.message || item.title).split('\n').join(' • ');

  return (
    <article>
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: SCREEN.muted }}>
        <StatusMark kind={itemMark(item)} size="sm" />
        <span>
          <HighlightedText text={[item.state === 'active' ? 'En cours' : 'À venir', when].filter(Boolean).join(' · ')} />
        </span>
      </p>
      <h3 className="mt-2 font-bold" style={{ color: SCREEN.text }}>
        {item.title}
      </h3>
      {where && (
        <p className="text-xs" style={{ color: SCREEN.muted }}>
          {where}
        </p>
      )}
      <p className="mt-3 text-base md:text-lg leading-snug" style={{ color: SCREEN.text }}>
        <HighlightedText text={message} />
      </p>
    </article>
  );
}

function TrafficPanel({ lines, selection, onSelect, onPage }) {
  const selected = lines.find((line) => line.lineId === selection.lineId) ?? mostSevere(lines);

  if (!selected) {
    return (
      <div className="flex-1 bg-white p-5">
        <p className="font-bold text-base" style={{ color: SCREEN.text }}>
          Trafic normal sur l&apos;ensemble des lignes
        </p>
      </div>
    );
  }

  const items = [...selected.active, ...selected.upcoming];
  const page = selection.lineId === selected.lineId ? Math.min(selection.index, items.length - 1) : 0;

  return (
    <>
      <div role="tablist" aria-label="Lignes perturbées" className="flex items-end gap-1 overflow-x-auto px-3 pt-3">
        {lines.map((line) => {
          const active = line.lineId === selected.lineId;
          return (
            <button
              key={line.lineId}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={PANEL_ID}
              onClick={() => onSelect(line.lineId)}
              className={`flex shrink-0 items-center gap-2 rounded-t-lg px-3 ${active ? 'pt-3 pb-3' : 'pt-2 pb-2'}`}
              style={{ backgroundColor: active ? 'white' : SCREEN.divider, color: SCREEN.muted }}
            >
              <ModeIcon type={line.type} className="w-7 h-7" />
              <span className="relative inline-flex">
                <LineBadge name={line.shortName} color={line.color} type={line.type} size="sm" />
                <StatusMark kind={lineMark(line)} size="sm" className="absolute -bottom-1.5 -right-2" />
              </span>
              <span className="sr-only">{line.statusLabel}</span>
            </button>
          );
        })}
      </div>

      <div id={PANEL_ID} role="tabpanel" className="flex flex-1 flex-col bg-white p-5">
        <DisruptionMessage item={items[page]} />

        {items.length > 1 && (
          <div className="mt-auto flex justify-center gap-2 pt-5">
            {items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onPage(selected.lineId, index)}
                aria-label={`Message ${index + 1} sur ${items.length}`}
                aria-current={index === page}
                className="w-3.5 h-3.5 rounded-full"
                style={{ backgroundColor: index === page ? SCREEN.works : SCREEN.divider }}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default function LineStatusTable({ refreshInterval }) {
  const { lines, loading, error, stale, lastUpdated, refresh } = useDisruptions(refreshInterval);
  const [selection, setSelection] = useState({ lineId: null, index: 0 });

  const groups = groupByMode(lines);
  const linesWithNews = groups.flatMap(([, modeLines]) => modeLines).filter(hasNews);
  const selectedId = (linesWithNews.find((line) => line.lineId === selection.lineId) ?? mostSevere(linesWithNews))?.lineId;

  const selectLine = (lineId) => setSelection({ lineId, index: 0 });
  const showPage = (lineId, index) => setSelection({ lineId, index });

  return (
    <section aria-labelledby="line-status-title" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="line-status-title" className="text-xl font-semibold text-zinc-900 dark:text-white">
          État des lignes
        </h2>
        <RefreshIndicator lastUpdated={lastUpdated} onRefresh={refresh} loading={loading} stale={stale} />
      </div>

      {error && lines.length === 0 ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Info trafic indisponible : {error}
        </p>
      ) : loading && lines.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Chargement de l&apos;info trafic...</p>
      ) : (
        <div
          className="overflow-hidden rounded-xl shadow-md md:flex text-sm"
          style={{ backgroundColor: SCREEN.trafficBackground, fontFamily: SCREEN_FONT }}
        >
          <div className="flex flex-1 items-start gap-4 p-5">
            <div className="flex-1 space-y-4">
              {groups.map(([type, modeLines]) => (
                <div key={type} className="flex items-center gap-4">
                  <ModeIcon type={type} className="text-white" />
                  <ul aria-label={MODE_LABELS[type] ?? type} className="flex flex-wrap gap-3">
                    {modeLines.map((line) => (
                      <LineTile
                        key={line.lineId}
                        line={line}
                        selected={line.lineId === selectedId}
                        onSelect={selectLine}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <ScreenClock />
          </div>

          <div className="flex flex-col md:w-[45%] md:flex-none">
            <TrafficPanel lines={linesWithNews} selection={selection} onSelect={selectLine} onPage={showPage} />
          </div>
        </div>
      )}
      {error && lines.length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">Info trafic non actualisée : {error}</p>
      )}
    </section>
  );
}
