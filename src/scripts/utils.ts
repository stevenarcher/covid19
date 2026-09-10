export function formatNumber(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

export function formatDelta(n: number): string {
  if (n > 0) return `+${Math.round(n).toLocaleString()}`;
  if (n < 0) return Math.round(n).toLocaleString();
  return '0';
}

export function formatPerCapita(n: number): string {
  if (n >= 100) return Math.round(n).toLocaleString();
  if (n >= 10) return n.toFixed(1);
  if (n >= 0.1) return n.toFixed(2);
  return n.toFixed(3);
}

export function formatDate(weekStr: string): string {
  const d = new Date(weekStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateFromMs(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function logScale(value: number, maxValue: number): number {
  if (value <= 0 || maxValue <= 0) return 0;
  return Math.log10(value + 1) / Math.log10(maxValue + 1);
}

export function getColorForValue(
  value: number,
  maxValue: number,
  baseColor: string,
  maxColor: string
): string {
  if (value <= 0 || maxValue <= 0) return 'rgba(13, 27, 42, 0.6)';

  const t = clamp(logScale(value, maxValue), 0, 1);

  const base = hexToRgb(baseColor);
  const max = hexToRgb(maxColor);

  const r = Math.round(lerp(base.r, max.r, t));
  const g = Math.round(lerp(base.g, max.g, t));
  const b = Math.round(lerp(base.b, max.b, t));

  return `rgb(${r}, ${g}, ${b})`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

export function getCountryColor(
  cases: number,
  deaths: number,
  vaccinated: number,
  maxCases: number,
  maxDeaths: number,
  maxVaccinated: number
): string {
  const casesNorm = logScale(cases, maxCases);
  const deathsNorm = logScale(deaths, maxDeaths);
  const vaccNorm = logScale(vaccinated, maxVaccinated);

  if (casesNorm < 0.01 && deathsNorm < 0.01 && vaccNorm < 0.01) {
    return 'rgba(13, 27, 42, 0.6)';
  }

  const r = Math.round(lerp(13, 239, clamp(casesNorm, 0, 1)));
  const g = Math.round(lerp(27, 68 + vaccNorm * 100, clamp(vaccNorm, 0, 1) * 0.5 + casesNorm * 0.2));
  const b = Math.round(lerp(42, 68, clamp(deathsNorm, 0, 1)));

  return `rgb(${clamp(r, 0, 255)}, ${clamp(g, 0, 255)}, ${clamp(b, 0, 255)})`;
}

export function getCountryColorSimple(
  cases: number,
  maxCases: number
): string {
  if (cases <= 0) return 'rgba(13, 27, 42, 0.6)';
  const t = clamp(logScale(cases, maxCases), 0, 1);
  const r = Math.round(lerp(20, 239, t));
  const g = Math.round(lerp(40, 68, t));
  const b = Math.round(lerp(60, 68, t));
  return `rgb(${r}, ${g}, ${b})`;
}
