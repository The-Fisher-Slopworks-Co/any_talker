export type IntervalScheduler = { stop(): void };

export type IntervalSchedulerDeps = {
  intervalMs: number;
  tick: () => Promise<void>;
  logPrefix: string;
};

export function startIntervalScheduler(
  deps: IntervalSchedulerDeps,
): IntervalScheduler {
  let stopped = false;
  let inFlight: Promise<void> | null = null;

  const safeTick = async () => {
    if (stopped) return;
    try {
      await deps.tick();
    } catch (err) {
      console.error(`${deps.logPrefix} tick failed:`, err);
    }
  };

  const tick = () => {
    if (inFlight || stopped) return;
    inFlight = safeTick().finally(() => {
      inFlight = null;
    });
  };

  tick();
  const handle = setInterval(tick, deps.intervalMs);

  return {
    stop() {
      stopped = true;
      clearInterval(handle);
    },
  };
}
