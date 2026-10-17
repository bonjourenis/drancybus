import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStopMonitoringCache, getStopMonitoring } from '../stop-monitoring-cache';

const FRESH = 1000;
const STALE_MAX = 10_000;

function makeClock(start = 100_000) {
  let current = start;
  return { now: () => current, advance: (ms) => { current += ms; } };
}

describe('getStopMonitoring', () => {
  beforeEach(() => clearStopMonitoringCache());

  it('fetches once and serves from memory while fresh', async () => {
    const clock = makeClock();
    const fetcher = vi.fn().mockResolvedValue({ visits: 1 });
    const options = { fetcher, now: clock.now, freshMs: FRESH, staleMaxMs: STALE_MAX };

    const first = await getStopMonitoring('stop-a', options);
    clock.advance(FRESH - 1);
    const second = await getStopMonitoring('stop-a', options);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ data: { visits: 1 }, stale: false });
    expect(second.data).toBe(first.data);
  });

  it('refetches once the fresh window has passed', async () => {
    const clock = makeClock();
    const fetcher = vi.fn().mockResolvedValueOnce({ v: 1 }).mockResolvedValueOnce({ v: 2 });
    const options = { fetcher, now: clock.now, freshMs: FRESH, staleMaxMs: STALE_MAX };

    await getStopMonitoring('stop-a', options);
    clock.advance(FRESH + 1);
    const result = await getStopMonitoring('stop-a', options);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ data: { v: 2 }, stale: false });
  });

  it('shares one in-flight request between concurrent callers', async () => {
    const clock = makeClock();
    let resolve;
    const fetcher = vi.fn(() => new Promise((r) => { resolve = r; }));
    const options = { fetcher, now: clock.now, freshMs: FRESH, staleMaxMs: STALE_MAX };

    const p1 = getStopMonitoring('stop-a', options);
    const p2 = getStopMonitoring('stop-a', options);
    resolve({ ok: true });
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(r1.data).toBe(r2.data);
  });

  it('keeps stops independent', async () => {
    const clock = makeClock();
    const fetcher = vi.fn(async (id) => ({ id }));
    const options = { fetcher, now: clock.now, freshMs: FRESH, staleMaxMs: STALE_MAX };

    const a = await getStopMonitoring('stop-a', options);
    const b = await getStopMonitoring('stop-b', options);
    expect(a.data).toEqual({ id: 'stop-a' });
    expect(b.data).toEqual({ id: 'stop-b' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('serves the last good response, flagged stale, when the upstream fails', async () => {
    const clock = makeClock();
    const fetcher = vi.fn().mockResolvedValueOnce({ v: 1 }).mockRejectedValue(new Error('boom'));
    const options = { fetcher, now: clock.now, freshMs: FRESH, staleMaxMs: STALE_MAX };

    const good = await getStopMonitoring('stop-a', options);
    clock.advance(FRESH + 1);
    const stale = await getStopMonitoring('stop-a', options);

    expect(stale).toMatchObject({ data: { v: 1 }, stale: true, fetchedAt: good.fetchedAt });
    expect(stale.error).toBeInstanceOf(Error);
  });

  it('backs off after a failure instead of hammering the upstream', async () => {
    const clock = makeClock();
    const fetcher = vi.fn().mockResolvedValueOnce({ v: 1 }).mockRejectedValue(new Error('boom'));
    const options = { fetcher, now: clock.now, freshMs: FRESH, staleMaxMs: STALE_MAX };

    await getStopMonitoring('stop-a', options);
    clock.advance(FRESH + 1);
    await getStopMonitoring('stop-a', options); // fails, serves stale
    clock.advance(FRESH / 2);
    const result = await getStopMonitoring('stop-a', options);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ data: { v: 1 }, stale: true });

    clock.advance(FRESH);
    await getStopMonitoring('stop-a', options);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('throws when there is no usable data', async () => {
    const clock = makeClock();
    const fetcher = vi.fn().mockRejectedValue(new Error('boom'));
    const options = { fetcher, now: clock.now, freshMs: FRESH, staleMaxMs: STALE_MAX };

    await expect(getStopMonitoring('stop-a', options)).rejects.toThrow('boom');
    // and the failure is not cached as data
    await expect(getStopMonitoring('stop-a', options)).rejects.toThrow('boom');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('throws once stale data is too old', async () => {
    const clock = makeClock();
    const fetcher = vi.fn().mockResolvedValueOnce({ v: 1 }).mockRejectedValue(new Error('boom'));
    const options = { fetcher, now: clock.now, freshMs: FRESH, staleMaxMs: STALE_MAX };

    await getStopMonitoring('stop-a', options);
    clock.advance(STALE_MAX + 1);
    await expect(getStopMonitoring('stop-a', options)).rejects.toThrow('boom');
  });
});
