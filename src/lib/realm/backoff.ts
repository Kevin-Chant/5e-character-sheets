// The retry schedule every layer that reconnects a socket shares.

// Peers are woken by the same events — a sidecar restart, a train leaving a
// tunnel — so an unjittered ladder has the whole table retrying in lockstep.
export const RECONNECT_JITTER = 0.25;

// Past the end of a ladder the last rung repeats.
export function backoffDelayMs(
  attempt: number,
  ladder: readonly number[],
  jitter = 0,
): number {
  const rung = Math.min(Math.max(attempt, 0), ladder.length - 1);
  const base = ladder[rung];
  return jitter ? Math.round(base * (1 + Math.random() * jitter)) : base;
}
