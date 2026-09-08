import type { CountryData, WeeklyRecord, MetricType, DataMode, StatKey } from '../types/index';

export interface State {
  currentWeekIndex: number;
  weeks: string[];
  isPlaying: boolean;
  playbackSpeed: number;
  selectedCountry: string | null;
  hoveredCountry: string | null;
  selectedMetric: MetricType;
  dataMode: DataMode;
  countries: CountryData[];
  weeklyData: Map<string, Map<string, WeeklyRecord>>;
  maxCases: number;
  maxDeaths: number;
  maxVaccinated: number;
  maxHospitalizations: number;
  maxWeeklyCases: number;
  maxWeeklyDeaths: number;
  maxWeeklyHospitalizations: number;
}

type Listener = (state: State) => void;

interface ListenerEntry {
  fn: Listener;
  keys?: string[];
}

const listeners: Set<ListenerEntry> = new Set();

export const state: State = {
  currentWeekIndex: 0,
  weeks: [],
  isPlaying: false,
  playbackSpeed: 1,
  selectedCountry: null,
  hoveredCountry: null,
  selectedMetric: 'cases',
  dataMode: 'total',
  countries: [],
  weeklyData: new Map(),
  maxCases: 1,
  maxDeaths: 1,
  maxVaccinated: 1,
  maxHospitalizations: 1,
  maxWeeklyCases: 1,
  maxWeeklyDeaths: 1,
  maxWeeklyHospitalizations: 1,
};

export function subscribe(fn: Listener, keys?: string[]): () => void {
  const entry: ListenerEntry = { fn, keys };
  listeners.add(entry);
  return () => listeners.delete(entry);
}

function notify(changedKey?: string): void {
  for (const entry of listeners) {
    if (entry.keys && changedKey && !entry.keys.includes(changedKey)) {
      continue;
    }
    try {
      entry.fn(state);
    } catch (e) {
      console.error('State listener error:', e);
    }
  }
}

export function setWeekIndex(index: number): void {
  state.currentWeekIndex = Math.max(0, Math.min(index, state.weeks.length - 1));
  notify('currentWeekIndex');
}

export function togglePlay(): void {
  state.isPlaying = !state.isPlaying;
  notify('isPlaying');
}

export function setPlaybackSpeed(speed: number): void {
  state.playbackSpeed = speed;
  notify('playbackSpeed');
}

export function selectCountry(countryId: string | null): void {
  state.selectedCountry = countryId;
  notify('selectedCountry');
}

export function hoverCountry(countryId: string | null): void {
  state.hoveredCountry = countryId;
  notify('hoveredCountry');
}

export function setSelectedMetric(metric: MetricType): void {
  state.selectedMetric = metric;
  notify('selectedMetric');
}

export function setDataMode(mode: DataMode): void {
  state.dataMode = mode;
  notify('dataMode');
}

export function getCurrentWeek(): string {
  return state.weeks[state.currentWeekIndex] || '';
}

export function getCurrentWeekData(): Map<string, WeeklyRecord> {
  const week = getCurrentWeek();
  return state.weeklyData.get(week) || new Map();
}

export function getCountryWeekData(countryId: string): WeeklyRecord | undefined {
  const week = getCurrentWeek();
  const weekData = state.weeklyData.get(week);
  return weekData?.get(countryId);
}

export function getPreviousWeekData(countryId: string): WeeklyRecord | undefined {
  const index = state.currentWeekIndex;
  if (index <= 0) return undefined;
  const week = state.weeks[index - 1];
  const weekData = state.weeklyData.get(week);
  return weekData?.get(countryId);
}

export function getValueForCountry(
  countryId: string,
  key: StatKey,
  mode: DataMode = state.dataMode
): number {
  const current = getCountryWeekData(countryId);
  if (!current) return 0;
  const currentValue = current[key] || 0;
  if (mode === 'total') return currentValue;
  const previous = getPreviousWeekData(countryId);
  if (!previous) return currentValue;
  return currentValue - (previous[key] || 0);
}

export function getMetricValueForCountry(countryId: string, metric: MetricType): number {
  return Math.max(0, getValueForCountry(countryId, metric));
}

export function initState(
  countries: CountryData[],
  weeklyData: Map<string, Map<string, WeeklyRecord>>,
  weeks: string[]
): void {
  state.countries = countries;
  state.weeklyData = weeklyData;
  state.weeks = weeks;
  state.currentWeekIndex = 0;
  state.isPlaying = false;

  let maxCases = 1;
  let maxDeaths = 1;
  let maxVaccinated = 1;
  let maxHospitalizations = 1;
  let maxWeeklyCases = 1;
  let maxWeeklyDeaths = 1;
  let maxWeeklyHospitalizations = 1;

  for (const weekMap of weeklyData.values()) {
    for (const record of weekMap.values()) {
      if (record.cases > maxCases) maxCases = record.cases;
      if (record.deaths > maxDeaths) maxDeaths = record.deaths;
      if (record.fullyVaccinated > maxVaccinated) {
        maxVaccinated = record.fullyVaccinated;
      }
      if (record.hospitalizations > maxHospitalizations) {
        maxHospitalizations = record.hospitalizations;
      }
    }
  }

  for (let i = 0; i < weeks.length; i++) {
    const weekMap = weeklyData.get(weeks[i]);
    if (!weekMap) continue;
    const prevMap = i > 0 ? weeklyData.get(weeks[i - 1]) : undefined;
    for (const [countryId, record] of weekMap) {
      const prev = prevMap?.get(countryId);
      const wCases = prev ? Math.max(0, record.cases - prev.cases) : (record.cases || 0);
      const wDeaths = prev ? Math.max(0, record.deaths - prev.deaths) : (record.deaths || 0);
      const wHosp = prev
        ? Math.max(0, record.hospitalizations - prev.hospitalizations)
        : (record.hospitalizations || 0);
      if (wCases > maxWeeklyCases) maxWeeklyCases = wCases;
      if (wDeaths > maxWeeklyDeaths) maxWeeklyDeaths = wDeaths;
      if (wHosp > maxWeeklyHospitalizations) maxWeeklyHospitalizations = wHosp;
    }
  }

  state.maxCases = maxCases;
  state.maxDeaths = maxDeaths;
  state.maxVaccinated = maxVaccinated;
  state.maxHospitalizations = maxHospitalizations;
  state.maxWeeklyCases = maxWeeklyCases;
  state.maxWeeklyDeaths = maxWeeklyDeaths;
  state.maxWeeklyHospitalizations = maxWeeklyHospitalizations;

  notify();
}
