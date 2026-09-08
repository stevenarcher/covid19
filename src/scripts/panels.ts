import { state, subscribe, getCurrentWeekData, getValueForCountry, selectCountry } from './state';
import { formatNumber, formatDate, formatDelta } from './utils';
import type { DataMode } from '../types/index';

export function initPanels(): void {
  subscribe(updateStatsPanel, ['currentWeekIndex', 'selectedMetric', 'dataMode']);
  subscribe(updateDetailPanel, ['currentWeekIndex', 'selectedCountry', 'selectedMetric', 'dataMode']);

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
  let totalCases = 0;
  let totalDeaths = 0;
  let totalHospitalized = 0;
  let totalVaccinated = 0;
  let countryCount = 0;

  for (const record of weekData.values()) {
    totalCases += getValueForCountry(record.countryId, 'cases');
    totalDeaths += getValueForCountry(record.countryId, 'deaths');
    totalHospitalized += getValueForCountry(record.countryId, 'hospitalizations');
    totalVaccinated += getValueForCountry(record.countryId, 'fullyVaccinated');
    countryCount++;
  }

  setTextContent('stat-cases', isWeekly ? formatDelta(totalCases) : formatNumber(totalCases));
  setTextContent('stat-deaths', isWeekly ? formatDelta(totalDeaths) : formatNumber(totalDeaths));
  setTextContent('stat-hospitalized', isWeekly ? formatDelta(totalHospitalized) : formatNumber(totalHospitalized));
  setTextContent('stat-vaccinated', isWeekly ? formatDelta(totalVaccinated) : formatNumber(totalVaccinated));
  setTextContent('stat-countries', String(countryCount));
  setTextContent('current-date', state.weeks[state.currentWeekIndex] ? formatDate(state.weeks[state.currentWeekIndex]) : '');

  setTextContent('mobile-stat-cases', isWeekly ? formatDelta(totalCases) : formatNumber(totalCases));
  setTextContent('mobile-stat-deaths', isWeekly ? formatDelta(totalDeaths) : formatNumber(totalDeaths));
  setTextContent('mobile-stat-hospitalized', isWeekly ? formatDelta(totalHospitalized) : formatNumber(totalHospitalized));
  setTextContent('mobile-stat-vaccinated', isWeekly ? formatDelta(totalVaccinated) : formatNumber(totalVaccinated));

  updateStatLabels(mode);
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

  setTextContent('detail-country-name', country?.name || id);
  setTextContent('detail-cases', isWeekly ? formatDelta(getValueForCountry(id, 'cases')) : formatNumber(getValueForCountry(id, 'cases')));
  setTextContent('detail-deaths', isWeekly ? formatDelta(getValueForCountry(id, 'deaths')) : formatNumber(getValueForCountry(id, 'deaths')));
  setTextContent('detail-hospitalized', isWeekly ? formatDelta(getValueForCountry(id, 'hospitalizations')) : formatNumber(getValueForCountry(id, 'hospitalizations')));
  setTextContent('detail-vaccinated', isWeekly ? formatDelta(getValueForCountry(id, 'fullyVaccinated')) : formatNumber(getValueForCountry(id, 'fullyVaccinated')));
  setTextContent('detail-week', state.weeks[state.currentWeekIndex] ? formatDate(state.weeks[state.currentWeekIndex]) : '');

  updateDetailLabels(state.dataMode);
}

function updateStatLabels(mode: DataMode): void {
  const weekly = mode === 'weekly';
  setTextContent('stat-cases-label', weekly ? 'New Cases' : 'Total Cases');
  setTextContent('stat-deaths-label', weekly ? 'New Deaths' : 'Total Deaths');
  setTextContent('stat-hospitalized-label', weekly ? 'Change in Hospitalized' : 'Hospitalized');
  setTextContent('stat-vaccinated-label', weekly ? 'New Fully Vaccinated' : 'Fully Vaccinated');

  setTextContent('mobile-stat-cases-label', weekly ? 'New Cases' : 'Total Cases');
  setTextContent('mobile-stat-deaths-label', weekly ? 'New Deaths' : 'Total Deaths');
  setTextContent('mobile-stat-hospitalized-label', weekly ? 'Change in Hospitalized' : 'Hospitalized');
  setTextContent('mobile-stat-vaccinated-label', weekly ? 'New Fully Vaccinated' : 'Fully Vaccinated');
}

function updateDetailLabels(mode: DataMode): void {
  const weekly = mode === 'weekly';
  setTextContent('detail-cases-label', weekly ? 'New Cases' : 'Cases (Cumulative)');
  setTextContent('detail-deaths-label', weekly ? 'New Deaths' : 'Deaths (Cumulative)');
  setTextContent('detail-hospitalized-label', weekly ? 'Change in Hospitalized' : 'Hospitalized');
  setTextContent('detail-vaccinated-label', weekly ? 'New Fully Vaccinated' : 'Fully Vaccinated');
}

function setTextContent(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
