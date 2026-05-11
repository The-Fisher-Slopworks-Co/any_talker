let cached: { areas: string[]; byArea: Map<string, string[]> } | null = null;

function load(): { areas: string[]; byArea: Map<string, string[]> } {
  if (cached) return cached;
  const supported = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf?.("timeZone") ?? [];
  const byArea = new Map<string, string[]>();
  for (const tz of supported) {
    const slash = tz.indexOf("/");
    if (slash < 0) continue;
    const area = tz.slice(0, slash);
    const location = tz.slice(slash + 1);
    const list = byArea.get(area);
    if (list) list.push(location);
    else byArea.set(area, [location]);
  }
  for (const list of byArea.values()) list.sort();
  cached = { areas: [...byArea.keys()].sort(), byArea };
  return cached;
}

export function getTimezoneAreas(): string[] {
  return load().areas;
}

export function getTimezoneLocations(area: string): string[] {
  return load().byArea.get(area) ?? [];
}

export function splitTimezone(tz: string): { area: string; location: string } {
  const slash = tz.indexOf("/");
  if (slash < 0) return { area: tz, location: "" };
  return { area: tz.slice(0, slash), location: tz.slice(slash + 1) };
}
