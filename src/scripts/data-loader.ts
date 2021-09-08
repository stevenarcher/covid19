import type { CountryData, WeeklyRecord } from '../types/index';

export interface LoadedData {
  countries: CountryData[];
  weeklyData: Map<string, Map<string, WeeklyRecord>>;
  weeks: string[];
}

export async function loadCountries(): Promise<CountryData[]> {
  const resp = await fetch('/data/countries.json');
  if (!resp.ok) throw new Error('Failed to load countries.json');
  return resp.json();
}

export async function loadWeeklyData(): Promise<{
  data: Map<string, Map<string, WeeklyRecord>>;
  weeks: string[];
}> {
  const resp = await fetch('/data/weekly-data.json');
  if (!resp.ok) throw new Error('Failed to load weekly-data.json');
  const raw: WeeklyRecord[] = await resp.json();

  const weekSet = new Set<string>();
  const data = new Map<string, Map<string, WeeklyRecord>>();

  for (const record of raw) {
    weekSet.add(record.week);
    if (!data.has(record.week)) {
      data.set(record.week, new Map());
    }
    data.get(record.week)!.set(record.countryId, record);
  }

  const weeks = Array.from(weekSet).sort();
  return { data, weeks };
}

export async function loadGeoJson(): Promise<GeoJSON.FeatureCollection> {
  const resp = await fetch('/data/countries-boundaries.json');
  if (!resp.ok) throw new Error('Failed to load countries-boundaries.json');
  return resp.json();
}
