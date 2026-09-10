import { state, subscribe, getCurrentWeekData, getValueForCountry, getCountryPopulation, selectCountry } from './state';
import { formatNumber, formatDate, formatDelta, formatPerCapita } from './utils';
import type { DataMode } from '../types/index';

let panelFadeDuration = 0;
let pendingStats: { el: HTMLElement; text: string }[] = [];
let fadeTimeout: number | null = null;

export function startPanelFade(duration: number): void {
  panelFadeDuration = duration;
}

function applyStatText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  if (panelFadeDuration > 0 && state.isPlaying) {
    pendingStats.push({ el, text });
    return;
  }
  el.textContent = text;
}

function flushPanelFade(): void {
  if (pendingStats.length === 0) return;
  if (fadeTimeout !== null) {
    window.clearTimeout(fadeTimeout);
    fadeTimeout = null;
    document
      .querySelectorAll('.stat-value.stat-fading')
      .forEach((el) => el.classList.remove('stat-fading'));
  }
  const items = pendingStats;
  pendingStats = [];
  const duration = panelFadeDuration;
  for (const item of items) {
    item.el.style.transitionDuration = `${duration}ms`;
    item.el.classList.add('stat-fading');
  }
  fadeTimeout = window.setTimeout(() => {
    fadeTimeout = null;
    for (const item of items) {
      item.el.textContent = item.text;
      item.el.classList.remove('stat-fading');
    }
  }, duration);
}

function snapOnPause(): void {
  if (state.isPlaying) return;
  if (fadeTimeout !== null) {
    window.clearTimeout(fadeTimeout);
    fadeTimeout = null;
  }
  document
    .querySelectorAll('.stat-value.stat-fading')
    .forEach((el) => el.classList.remove('stat-fading'));
  pendingStats = [];
  panelFadeDuration = 0;
  updateStatsPanel();
  updateDetailPanel();
}

export function initPanels(): void {
  subscribe(updateStatsPanel, ['currentWeekIndex', 'selectedMetric', 'dataMode', 'valueMode']);
  subscribe(updateDetailPanel, ['currentWeekIndex', 'selectedCountry', 'selectedMetric', 'dataMode', 'valueMode']);
  subscribe(snapOnPause, ['isPlaying']);

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

  applyStatText('stat-cases', fmt(totalCases));
  applyStatText('stat-deaths', fmt(totalDeaths));
  applyStatText('stat-hospitalized', fmt(totalHospitalized));
  applyStatText('stat-vaccinated', fmt(totalVaccinated));
  setTextContent('stat-countries', String(countryCount));
  setTextContent('current-date', state.weeks[state.currentWeekIndex] ? formatDate(state.weeks[state.currentWeekIndex]) : '');

  applyStatText('mobile-stat-cases', fmt(totalCases));
  applyStatText('mobile-stat-deaths', fmt(totalDeaths));
  applyStatText('mobile-stat-hospitalized', fmt(totalHospitalized));
  applyStatText('mobile-stat-vaccinated', fmt(totalVaccinated));

  updateStatLabels(mode, isPerCapita);
  flushPanelFade();
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
  applyStatText('detail-cases', fmt(getValueForCountry(id, 'cases')));
  applyStatText('detail-deaths', fmt(getValueForCountry(id, 'deaths')));
  applyStatText('detail-hospitalized', fmt(getValueForCountry(id, 'hospitalizations')));
  applyStatText('detail-vaccinated', fmt(getValueForCountry(id, 'fullyVaccinated')));
  setTextContent('detail-week', state.weeks[state.currentWeekIndex] ? formatDate(state.weeks[state.currentWeekIndex]) : '');

  updateDetailLabels(state.dataMode, isPerCapita);
  flushPanelFade();
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
