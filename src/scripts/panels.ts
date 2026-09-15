import { state, subscribe, getCurrentWeekData, getValueForCountry, getCountryPopulation, getCountryWeekData, selectCountry, getCurrentVariant, getCirculatingVariants, getCountryVaccines } from './state';
import { formatNumber, formatDate, formatDelta, formatPerCapita } from './utils';
import type { DataMode } from '../types/index';

export function initPanels(): void {
  subscribe(updateStatsPanel, [
    'currentWeekIndex',
    'selectedMetric',
    'dataMode',
    'valueMode',
    'variants',
  ]);
  subscribe(updateDetailPanel, [
    'currentWeekIndex',
    'selectedCountry',
    'selectedMetric',
    'dataMode',
    'valueMode',
    'variants',
  ]);
  subscribe(updateDateDisplay, ['currentWeekIndex', 'variants']);
  subscribe(updateVaccinePanel, ['vaccines']);

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
  let totalIcu = 0;
  let totalVaccinated = 0;
  let totalPopulation = 0;
  let countryCount = 0;

  for (const record of weekData.values()) {
    totalCases += getValueForCountry(record.countryId, 'cases', mode, false);
    totalDeaths += getValueForCountry(record.countryId, 'deaths', mode, false);
    totalHospitalized += getValueForCountry(record.countryId, 'hospitalizations', mode, false);
    totalIcu += getValueForCountry(record.countryId, 'icu', mode, false);
    totalVaccinated += getValueForCountry(record.countryId, 'fullyVaccinated', mode, false);
    totalPopulation += getCountryPopulation(record.countryId);
    countryCount++;
  }

  if (isPerCapita && totalPopulation > 0) {
    const f = 100_000 / totalPopulation;
    totalCases *= f;
    totalDeaths *= f;
    totalHospitalized *= f;
    totalIcu *= f;
    totalVaccinated *= f;
  }

  setTextContent('stat-cases', fmt(totalCases));
  setTextContent('stat-deaths', fmt(totalDeaths));
  setTextContent('stat-hospitalized', fmt(totalHospitalized));
  setTextContent('stat-icu', fmt(totalIcu));
  setTextContent('stat-vaccinated', fmt(totalVaccinated));
  setTextContent('stat-countries', String(countryCount));

  setTextContent('mobile-stat-cases', fmt(totalCases));
  setTextContent('mobile-stat-deaths', fmt(totalDeaths));
  setTextContent('mobile-stat-hospitalized', fmt(totalHospitalized));
  setTextContent('mobile-stat-icu', fmt(totalIcu));
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
  setTextContent('detail-icu', fmt(getValueForCountry(id, 'icu')));
  setTextContent('detail-vaccinated', fmt(getValueForCountry(id, 'fullyVaccinated')));
  setTextContent('detail-week', state.weeks[state.currentWeekIndex] ? formatDate(state.weeks[state.currentWeekIndex]) : '');

  const population = getCountryPopulation(id);
  setTextContent('detail-population', population > 0 ? population.toLocaleString() : '—');

  const record = getCountryWeekData(id);
  const vacPct = record?.fullyVaccinatedPercent || 0;
  setTextContent('detail-vaccination-pct', vacPct > 0 ? `${vacPct.toFixed(1)}%` : '—');

  updateDetailLabels(state.dataMode, isPerCapita);
  updateVariantLine();
  updateCountryVaccines(id);
}

function updateDateDisplay(): void {
  const variant = getCurrentVariant();
  const circulating = getCirculatingVariants();

  const el = document.getElementById('timeline-variant');
  if (!el) return;

  if (!variant) {
    el.textContent = '';
    return;
  }

  const circ = circulating.length > 0
    ? ` · also detected: ${circulating.map((v) => v.name).slice(0, 4).join(', ')}`
    : '';

  el.innerHTML = `Variant: <strong>${variant.name}</strong> (${variant.lineage}) &middot; first detected <strong>${variant.firstDetectedCountry}</strong>, ${formatDate(variant.firstDetectedDate)}${circ}`;
  el.setAttribute('data-category', variant.category);
}

function updateVariantLine(): void {
  const variant = getCurrentVariant();
  const el = document.getElementById('detail-variant');
  if (el) {
    if (variant) {
      el.textContent = `${variant.name} (${variant.lineage}) · first detected ${variant.firstDetectedCountry}, ${formatDate(variant.firstDetectedDate)}`;
      el.classList.add('has-data');
    } else {
      el.textContent = '—';
    }
  }
}

function updateCountryVaccines(countryId: string): void {
  const list = getCountryVaccines(countryId);
  const el = document.getElementById('detail-vaccines');
  if (!el) return;
  if (list.length === 0) {
    el.textContent = 'None introduced by this date';
    return;
  }
  el.innerHTML = list
    .map(
      (v) =>
        `<div class="vaccine-intro"><span class="vaccine-name">${v.vaccine}</span> <span class="vaccine-date">${formatDate(v.firstDate!)}</span></div>`
    )
    .join('');
}

function updateVaccinePanel(): void {
  const el = document.getElementById('vaccine-intro-list');
  if (el) {
    if (state.vaccines.global.length === 0) {
      el.textContent = '—';
      return;
    }
    el.innerHTML = state.vaccines.global
      .slice(0, 12)
      .map((v) => `<div><span class="vaccine-name">${v.vaccine}</span> <span class="vaccine-date">${formatDate(v.firstDate!)}</span></div>`)
      .join('');
  }
}

function updateStatLabels(mode: DataMode, isPerCapita: boolean): void {
  const weekly = mode === 'weekly';
  const pc = isPerCapita ? ' /100k' : '';
  setTextContent('stat-cases-label', (weekly ? 'New Cases' : 'Total Cases') + pc);
  setTextContent('stat-deaths-label', (weekly ? 'New Deaths' : 'Total Deaths') + pc);
  setTextContent('stat-hospitalized-label', (weekly ? 'New Hospitalisations' : 'Hospital Admissions') + pc);
  setTextContent('stat-icu-label', (weekly ? 'New ICU Admissions' : 'ICU Admissions') + pc);
  setTextContent('stat-vaccinated-label', (weekly ? 'New Fully Vaccinated' : 'Fully Vaccinated') + pc);

  setTextContent('mobile-stat-cases-label', (weekly ? 'New Cases' : 'Total Cases') + pc);
  setTextContent('mobile-stat-deaths-label', (weekly ? 'New Deaths' : 'Total Deaths') + pc);
  setTextContent('mobile-stat-hospitalized-label', (weekly ? 'New Hospitalisations' : 'Hospital Admissions') + pc);
  setTextContent('mobile-stat-icu-label', (weekly ? 'New ICU Admissions' : 'ICU Admissions') + pc);
  setTextContent('mobile-stat-vaccinated-label', (weekly ? 'New Fully Vaccinated' : 'Fully Vaccinated') + pc);
}

function updateDetailLabels(mode: DataMode, isPerCapita: boolean): void {
  const weekly = mode === 'weekly';
  const pc = isPerCapita ? ' /100k' : '';
  setTextContent('detail-cases-label', (weekly ? 'New Cases' : 'Cases (Cumulative)') + pc);
  setTextContent('detail-deaths-label', (weekly ? 'New Deaths' : 'Deaths (Cumulative)') + pc);
  setTextContent('detail-hospitalized-label', (weekly ? 'New Hospitalisations' : 'Hospital Admissions (Cumulative)') + pc);
  setTextContent('detail-icu-label', (weekly ? 'New ICU Admissions' : 'ICU Admissions (Cumulative)') + pc);
  setTextContent('detail-vaccinated-label', (weekly ? 'New Fully Vaccinated' : 'Fully Vaccinated') + pc);
}

function setTextContent(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}