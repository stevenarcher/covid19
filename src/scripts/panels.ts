import { state, subscribe, getCurrentWeekData, getValueForCountry, getCountryPopulation, selectCountry } from './state';
import { formatNumber, formatDate, formatDelta, formatPerCapita } from './utils';
import type { DataMode } from '../types/index';

export function initPanels(): void {
  subscribe(updateStatsPanel, ['currentWeekIndex', 'selectedMetric', 'dataMode', 'valueMode']);
  subscribe(updateDetailPanel, ['currentWeekIndex', 'selectedCountry', 'selectedMetric', 'dataMode', 'valueMode']);

  const closeBtn = document.getElementById('detail-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => selectCountry(null));
  }

  const mobileToggle = document.getElementById('mobile-stats-toggle');
  if (mobileToggle) {
    mobileToggle.addEventListener('click', () => {
      const drawer = document.getElementById('mobile-stats-drawer');
      if (drawer) {
        drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none';
      }
    });
  }
}

function updateStatsPanel(): void {
  const weekData = getCurrentWeekData();
  const mode = state.dataMode;
  const isWeekly = mode === 'weekly';
  const isPerCapita = state.valueMode === 'perCapita';
  const fmt = isPerCapita ? formatPerCapita : isWeekly ? formatDelta : formatNumber;

  let totalCases = 0;
  let totalDeaths = 0;
  let totalHospitalized = 0;
  let totalVaccinated = 0;
  let totalPopulation = 0;
  let countryCount = 0;

  for (const record of weekData.values()) {
    totalCases += getValueForCountry(record.countryId, 'cases', mode, false);
    totalDeaths += getValueForCountry(record.countryId, 'deaths', mode, false);
    totalHospitalized += getValueForCountry(record.countryId, 'hospitalizations', mode, false);
    totalVaccinated += getValueForCountry(record.countryId, 'fullyVaccinated', mode, false);
    totalPopulation += getCountryPopulation(record.countryId);
    countryCount++;
  }

  if (isPerCapita && totalPopulation > 0) {
    const f = 100_000 / totalPopulation;
    totalCases *= f;
    totalDeaths *= f;
    totalHospitalized *= f;
    totalVaccinated *= f;
  }

  setTextContent('stat-cases', fmt(totalCases));
  setTextContent('stat-deaths', fmt(totalDeaths));
  setTextContent('stat-hospitalized', fmt(totalHospitalized));
  setTextContent('stat-vaccinated', fmt(totalVaccinated));
  setTextContent('stat-countries', String(countryCount));
  setTextContent('current-date', state.weeks[state.currentWeekIndex] ? formatDate(state.weeks[state.currentWeekIndex]) : '');

  setTextContent('mobile-stat-cases', fmt(totalCases));
  setTextContent('mobile-stat-deaths', fmt(totalDeaths));
  setTextContent('mobile-stat-hospitalized', fmt(totalHospitalized));
  setTextContent('mobile-stat-vaccinated', fmt(totalVaccinated));

  updateStatLabels(mode, isPerCapita);
}

function updateDetailPanel(): void {
  const panel = document.getElementById('detail-panel');
  if (!panel) return;

  if (!state.selectedCountry) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';

  const country = state.countries.find((c) => c.id === state.selectedCountry);
  const id = state.selectedCountry;
  const isWeekly = state.dataMode === 'weekly';
  const isPerCapita = state.valueMode === 'perCapita';
  const fmt = isPerCapita ? formatPerCapita : isWeekly ? formatDelta : formatNumber;

  setTextContent('detail-country-name', country?.name || id);
  setTextContent('detail-cases', fmt(getValueForCountry(id, 'cases')));
  setTextContent('detail-deaths', fmt(getValueForCountry(id, 'deaths')));
  setTextContent('detail-hospitalized', fmt(getValueForCountry(id, 'hospitalizations')));
  setTextContent('detail-vaccinated', fmt(getValueForCountry(id, 'fullyVaccinated')));
  setTextContent('detail-week', state.weeks[state.currentWeekIndex] ? formatDate(state.weeks[state.currentWeekIndex]) : '');

  updateDetailLabels(state.dataMode, isPerCapita);
}

function updateStatLabels(mode: DataMode, isPerCapita: boolean): void {
  const weekly = mode === 'weekly';
  const pc = isPerCapita ? ' /100k' : '';
  setTextContent('stat-cases-label', (weekly ? 'New Cases' : 'Total Cases') + pc);
  setTextContent('stat-deaths-label', (weekly ? 'New Deaths' : 'Total Deaths') + pc);
  setTextContent('stat-hospitalized-label', (weekly ? 'Change in Hospitalized' : 'Hospitalized') + pc);
  setTextContent('stat-vaccinated-label', (weekly ? 'New Fully Vaccinated' : 'Fully Vaccinated') + pc);

  setTextContent('mobile-stat-cases-label', (weekly ? 'New Cases' : 'Total Cases') + pc);
  setTextContent('mobile-stat-deaths-label', (weekly ? 'New Deaths' : 'Total Deaths') + pc);
  setTextContent('mobile-stat-hospitalized-label', (weekly ? 'Change in Hospitalized' : 'Hospitalized') + pc);
  setTextContent('mobile-stat-vaccinated-label', (weekly ? 'New Fully Vaccinated' : 'Fully Vaccinated') + pc);
}

function updateDetailLabels(mode: DataMode, isPerCapita: boolean): void {
  const weekly = mode === 'weekly';
  const pc = isPerCapita ? ' /100k' : '';
  setTextContent('detail-cases-label', (weekly ? 'New Cases' : 'Cases (Cumulative)') + pc);
  setTextContent('detail-deaths-label', (weekly ? 'New Deaths' : 'Deaths (Cumulative)') + pc);
  setTextContent('detail-hospitalized-label', (weekly ? 'Change in Hospitalized' : 'Hospitalized') + pc);
  setTextContent('detail-vaccinated-label', (weekly ? 'New Fully Vaccinated' : 'Fully Vaccinated') + pc);
}

function setTextContent(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
