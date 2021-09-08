import { initState, setSelectedMetric } from './state';
import { loadCountries, loadWeeklyData } from './data-loader';
import { initGlobe } from './globe';
import { initTimeline } from './timeline';
import { initPanels } from './panels';

declare global {
  interface Window {
    __setMetric: (metric: string) => void;
  }
}

async function main(): Promise<void> {
  const loadingScreen = document.getElementById('loading-screen');
  const loadingStatus = document.getElementById('loading-status');
  const loadingBar = document.getElementById('loading-bar');
  const globeContainer = document.getElementById('globe-container');

  function setProgress(pct: number, msg: string): void {
    if (loadingBar) loadingBar.style.width = `${pct}%`;
    if (loadingStatus) loadingStatus.textContent = msg;
  }

  try {
    setProgress(10, 'Loading country data...');
    const countries = await loadCountries();

    setProgress(40, 'Loading weekly records...');
    const { data: weeklyData, weeks } = await loadWeeklyData();

    setProgress(70, 'Initializing state...');
    initState(countries, weeklyData, weeks);

    setProgress(80, 'Initializing 3D globe...');
    if (globeContainer) {
      await initGlobe(globeContainer);
    }

    setProgress(90, 'Setting up UI...');
    initTimeline();
    initPanels();

    window.__setMetric = (metric: string) => {
      if (metric === 'cases' || metric === 'deaths' || metric === 'hospitalizations') {
        setSelectedMetric(metric);
      }
    };

    setProgress(100, 'Ready!');
    setTimeout(() => {
      if (loadingScreen) loadingScreen.style.display = 'none';
    }, 500);
  } catch (err) {
    console.error('Failed to initialize:', err);
    setProgress(0, `Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
