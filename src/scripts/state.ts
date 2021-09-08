import type { CountryData, WeeklyRecord, MetricType } from '../types/index';

export interface State {
  currentWeekIndex: number;
  weeks: string[];
  isPlaying: boolean;
  playbackSpeed: number;
  selectedCountry: string | null;
  hoveredCountry: string | null;
  selectedMetric: MetricType;
  countries: CountryData[];
  weeklyData: Map<string, Map<string, WeeklyRecord>>;
  maxCases: number;
  maxDeaths: number;
  maxVaccinated: number;
  maxHospitalizations: number;
}

type Listener = (state: State) => void;

const listeners: Set<Listener> = new Set();

export const state: State = {
  currentWeekIndex: 0,
  weeks: [],
  isPlaying: false,
  playbackSpeed: 1,
  selectedCountry: null,
  hoveredCountry: null,
  selectedMetric: 'cases',
  countries: [],
  weeklyData: new Map(),
  maxCases: 1,
  maxDeaths: 1,
  maxVaccinated: 1,
  maxHospitalizations: 1,
};

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  for (const fn of listeners) {
    try {
      fn(state);
    } catch (e) {
      console.error('State listener error:', e);
    }
  }
}

export function setWeekIndex(index: number): void {
  state.currentWeekIndex = Math.max(0, Math.min(index, state.weeks.length - 1));
  notify();
}

export function togglePlay(): void {
  state.isPlaying = !state.isPlaying;
  notify();
}

export function setPlaybackSpeed(speed: number): void {
  state.playbackSpeed = speed;
  notify();
}

export function selectCountry(countryId: string | null): void {
  state.selectedCountry = countryId;
  notify();
}

export function hoverCountry(countryId: string | null): void {
  state.hoveredCountry = countryId;
  notify();
}

export function setSelectedMetric(metric: MetricType): void {
  state.selectedMetric = metric;
  notify();
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

  state.maxCases = maxCases;
  state.maxDeaths = maxDeaths;
  state.maxVaccinated = maxVaccinated;
  state.maxHospitalizations = maxHospitalizations;

  notify();
}
