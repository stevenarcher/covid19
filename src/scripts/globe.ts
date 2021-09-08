import {
  state,
  subscribe,
  selectCountry,
  getCurrentWeekData,
  getCountryWeekData,
} from './state';
import { loadGeoJson } from './data-loader';
import { logScale, clamp } from './utils';
import type { MetricType } from '../types/index';

declare const Globe: any;

let globe: any = null;
let boundaryData: any[] = [];

const METRIC_COLORS: Record<MetricType, { base: string; max: string }> = {
  cases: { base: '#1a1a2e', max: '#ef4444' },
  deaths: { base: '#1a1a2e', max: '#9ca3af' },
  hospitalizations: { base: '#1a1a2e', max: '#3b82f6' },
};

export async function initGlobe(container: HTMLElement): Promise<void> {
  globe = new Globe(container)
    .backgroundImageUrl('')
    .backgroundColor(getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim())
    .showAtmosphere(false)

    // Hex polygon layer
    .hexPolygonGeoJsonGeometry('geometry')
    .hexPolygonResolution(3)
    .hexPolygonMargin(0.3)
    .hexPolygonUseDots(true)
    .hexPolygonAltitude(0.005)
    .hexPolygonCurvatureResolution(3)
    .hexPolygonLabel(({ properties: d }: any) => {
      const name = d.ADMIN || d.name || 'Unknown';
      const id = d.ISO_A2 || d.id || '';
      const weekData = getCountryWeekData(id);
      const cases = weekData?.cases || 0;
      const deaths = weekData?.deaths || 0;
      const hosp = weekData?.hospitalizations || 0;
      const vacc = weekData?.fullyVaccinated || 0;
      return `
        <div style="font-family: system-ui, sans-serif; line-height: 1.4;">
          <strong>${name}</strong><br/>
          Cases: ${cases.toLocaleString()}<br/>
          Deaths: ${deaths.toLocaleString()}<br/>
          Hospitalized: ${hosp.toLocaleString()}<br/>
          Vaccinated: ${vacc.toLocaleString()}
        </div>
      `;
    })
    .onHexPolygonClick((polygon: any) => {
      const id = polygon?.properties?.ISO_A2 || polygon?.properties?.id;
      if (id) selectCountry(id);
    });

  globe.onGlobeReady(() => {
    loadGeoJson().then((geo) => {
      boundaryData = geo.features;
      globe.hexPolygonsData(boundaryData);
      updateGlobe();
    });
  });

  subscribe(() => updateGlobe());
}

function updateGlobe(): void {
  if (!globe || boundaryData.length === 0) return;

  const weekData = getCurrentWeekData();
  const metric = state.selectedMetric;
  const maxValue = getMaxForMetric(metric);

  const enriched = boundaryData.map((feature: any) => {
    const id = feature.properties?.ISO_A2 || feature.properties?.id;
    const record = weekData.get(id);
    return {
      ...feature,
      _value: getValueForMetric(record, metric),
    };
  });

  globe.hexPolygonsData(enriched);
  globe.hexPolygonColor((feature: any) => {
    const id = feature.properties?.ISO_A2 || feature.properties?.id;
    const value = feature._value || 0;
    return getMetricColor(value, maxValue, metric);
  });
}

function getMaxForMetric(metric: MetricType): number {
  switch (metric) {
    case 'cases': return state.maxCases;
    case 'deaths': return state.maxDeaths;
    case 'hospitalizations': return state.maxHospitalizations;
  }
}

function getValueForMetric(record: any, metric: MetricType): number {
  if (!record) return 0;
  switch (metric) {
    case 'cases': return record.cases || 0;
    case 'deaths': return record.deaths || 0;
    case 'hospitalizations': return record.hospitalizations || 0;
  }
}

function getMetricColor(value: number, maxValue: number, metric: MetricType): string {
  if (value <= 0) return METRIC_COLORS[metric].base;
  const t = clamp(logScale(value, maxValue), 0, 1);
  const base = hexToRgb(METRIC_COLORS[metric].base);
  const max = hexToRgb(METRIC_COLORS[metric].max);
  const r = Math.round(base.r + (max.r - base.r) * t);
  const g = Math.round(base.g + (max.g - base.g) * t);
  const b = Math.round(base.b + (max.b - base.b) * t);
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

export function getGlobe(): any {
  return globe;
}
