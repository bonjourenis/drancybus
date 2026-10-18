import { describe, expect, it } from 'vitest';
import { groupDepartures } from '../departure-groups';
import { limitDepartures } from '../departures-service';

const dep = (minutes, { destination = 'Robinson', cancelled = false, line = 'IDFM:C01743' } = {}) => ({
  id: `${line}-${destination}-${minutes}`,
  lineRef: line,
  destination,
  minutesUntil: minutes,
  cancelled,
});
const minutes = (list) => list.map((d) => (d.cancelled ? `x${d.minutesUntil}` : d.minutesUntil));

describe('limitDepartures', () => {
  it('keeps max running departures and the cancellations between them', () => {
    const list = [dep(1, { cancelled: true }), dep(2), dep(3, { cancelled: true }), dep(4), dep(5, { cancelled: true }), dep(6)];
    expect(minutes(limitDepartures(list, 2))).toEqual(['x1', 2, 'x3', 4]);
  });

  it('behaves like a plain slice without cancellations', () => {
    expect(minutes(limitDepartures([dep(1), dep(2), dep(3)], 2))).toEqual([1, 2]);
    expect(limitDepartures([], 5)).toEqual([]);
  });
});

describe('groupDepartures', () => {
  it('shows two waits per destination', () => {
    const groups = groupDepartures([dep(2), dep(5, { destination: 'Saint-Rémy' }), dep(9), dep(14)]);
    expect(groups.map((g) => [g.first.destination, minutes(g.departures)])).toEqual([
      ['Robinson', [2, 9]],
      ['Saint-Rémy', [5]],
    ]);
  });

  it('shows a cancellation in place without hiding the next running train', () => {
    const [row] = groupDepartures([dep(4, { cancelled: true }), dep(12), dep(19)]);
    expect(minutes(row.departures)).toEqual(['x4', 12, 19]);
  });

  it('caps a row at three boxes when several trains in a row are cancelled', () => {
    const [row] = groupDepartures([dep(1, { cancelled: true }), dep(4, { cancelled: true }), dep(8, { cancelled: true }), dep(12)]);
    expect(minutes(row.departures)).toEqual(['x1', 'x4', 'x8']);
  });
});
