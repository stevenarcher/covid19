export interface CountryData {
  id: string;
  name: string;
  centroid: [number, number];
  population: number;
}

export interface WeeklyRecord {
  countryId: string;
  week: string;
  cases: number;
  deaths: number;
  hospitalizations: number;
  vaccinated: number;
  fullyVaccinated: number;
}

export interface AppState {
  currentWeekIndex: number;
  weeks: string[];
  isPlaying: boolean;
  playbackSpeed: number;
  selectedCountry: string | null;
  hoveredCountry: string | null;
  countries: CountryData[];
  weeklyData: Map<string, Map<string, WeeklyRecord>>;
  dataRange: {
    minCases: number;
    maxCases: number;
    minDeaths: number;
    maxDeaths: number;
    minVaccinated: number;
    maxVaccinated: number;
  };
}

export interface GlobeState {
  currentWeek: string;
  selectedCountry: string | null;
  hoveredCountry: string | null;
}

export const COLORS = {
  cases: '#ef4444',
  deaths: '#6b7280',
  hospitalizations: '#3b82f6',
  vaccinated: '#22c55e',
  water: '#0a1628',
  land: '#1a3a5c',
  border: '#2a5a8c',
  hexDefault: '#1a2a3a',
  hexNoData: '#0d1b2a',
} as const;

export const SCALES = {
  globe: 1,
  hexAltitude: 0.001,
} as const;

export type MetricType = 'cases' | 'deaths' | 'hospitalizations';
