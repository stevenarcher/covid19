import { state, subscribe, getCurrentWeekData, getCountryWeekData, selectCountry } from './state';
import { formatNumber, formatDate } from './utils';

export function initPanels(): void {
  subscribe(updateStatsPanel);
  subscribe(updateDetailPanel);

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
  let totalCases = 0;
  let totalDeaths = 0;
  let totalHospitalized = 0;
  let totalVaccinated = 0;
  let countryCount = 0;

  for (const record of weekData.values()) {
    totalCases += record.cases || 0;
    totalDeaths += record.deaths || 0;
    totalHospitalized += record.hospitalizations || 0;
    totalVaccinated += record.fullyVaccinated || 0;
    countryCount++;
  }

  setTextContent('stat-cases', formatNumber(totalCases));
  setTextContent('stat-deaths', formatNumber(totalDeaths));
  setTextContent('stat-hospitalized', formatNumber(totalHospitalized));
  setTextContent('stat-vaccinated', formatNumber(totalVaccinated));
  setTextContent('stat-countries', String(countryCount));
  setTextContent('current-date', state.weeks[state.currentWeekIndex] ? formatDate(state.weeks[state.currentWeekIndex]) : '');

  setTextContent('mobile-stat-cases', formatNumber(totalCases));
  setTextContent('mobile-stat-deaths', formatNumber(totalDeaths));
  setTextContent('mobile-stat-hospitalized', formatNumber(totalHospitalized));
  setTextContent('mobile-stat-vaccinated', formatNumber(totalVaccinated));
}

function updateDetailPanel(): void {
  const panel = document.getElementById('detail-panel');
  if (!panel) return;

  if (!state.selectedCountry) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';

  const record = getCountryWeekData(state.selectedCountry);
  const country = state.countries.find((c) => c.id === state.selectedCountry);

  setTextContent('detail-country-name', country?.name || state.selectedCountry);
  setTextContent('detail-cases', formatNumber(record?.cases || 0));
  setTextContent('detail-deaths', formatNumber(record?.deaths || 0));
  setTextContent('detail-hospitalized', formatNumber(record?.hospitalizations || 0));
  setTextContent('detail-vaccinated', formatNumber(record?.fullyVaccinated || 0));
  setTextContent('detail-week', state.weeks[state.currentWeekIndex] ? formatDate(state.weeks[state.currentWeekIndex]) : '');
}

function setTextContent(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
