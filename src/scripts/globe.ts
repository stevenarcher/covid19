import * as THREE from 'three';
import ThreeGlobe from 'three-globe';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { loadGeoJson } from './data-loader';
import { logScale, clamp, formatDelta, formatPerCapita } from './utils';
import { state, subscribe, selectCountry, getMetricValueForCountry, getValueForCountry } from './state';
import type { MetricType, DataMode, ValueMode } from '../types/index';

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let labelRenderer: CSS2DRenderer;
let controls: OrbitControls;
let globe: ThreeGlobe;
let raycaster: THREE.Raycaster;
let pointer: THREE.Vector2;
let boundaryData: any[] = [];
let lastWeekIndex = -1;
let lastMetric: MetricType = 'cases';
let lastDataMode: DataMode = 'total';
let lastValueMode: ValueMode = 'count';
let currentMaxValue = 1;
let currentMetric: MetricType = 'cases';
let pointerMovePending = false;
let pendingPointerEvent: PointerEvent | null = null;
let sceneDirty = true;
let enrichedPool: any[] = [];

const METRIC_COLORS: Record<MetricType, { base: string; max: string }> = {
  cases: { base: '#1a1a2e', max: '#ef4444' },
  deaths: { base: '#1a1a2e', max: '#9ca3af' },
  hospitalizations: { base: '#1a1a2e', max: '#3b82f6' },
};

function hexPolygonColorAccessor(feature: any): string {
  const value = feature._value || 0;
  return getMetricColor(value, currentMaxValue, currentMetric);
}

const tooltip = document.getElementById('tooltip');

export async function initGlobe(container: HTMLElement): Promise<void> {
  // Expose THREE globally so three-globe uses the same Three.js instance
  (window as any).THREE = THREE;

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(
    getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim()
  );

  // Camera
  camera = new THREE.PerspectiveCamera(
    50,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );
  camera.position.z = 400;

  // WebGL Renderer
  renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  // CSS2D Label Renderer
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(container.clientWidth, container.clientHeight);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  container.appendChild(labelRenderer.domElement);

  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.rotateSpeed = 0.5;
  controls.minDistance = 150;
  controls.maxDistance = 500;
  controls.addEventListener('change', () => { sceneDirty = true; });

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 1);
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
  directionalLight.position.set(5, 3, 5);
  scene.add(directionalLight);

  // Globe
  globe = new ThreeGlobe()
    .globeMaterial(new THREE.MeshPhongMaterial({
      color: 0x0a1628,
      transparent: true,
      opacity: 0.9,
    }))
    .hexPolygonGeoJsonGeometry('geometry')
    .hexPolygonResolution(3)
    .hexPolygonMargin(0.3)
    .hexPolygonUseDots(true)
    .hexPolygonAltitude(0.005)
    .hexPolygonCurvatureResolution(3)
    .hexPolygonColor(hexPolygonColorAccessor);

  scene.add(globe);

  // Raycaster for click events
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  // Click handler
  renderer.domElement.addEventListener('pointerdown', onPointerDown);

  // Load data
  const geo = await loadGeoJson();
  boundaryData = geo.features;
  enrichedPool = boundaryData.map((feature: any) => ({ ...feature, _value: 0 }));
  globe.hexPolygonsData(enrichedPool);
  updateGlobe();

  // Subscribe to state changes
  subscribe(() => updateGlobe(), ['currentWeekIndex', 'selectedMetric', 'dataMode', 'valueMode']);

  // Animation loop
  animate();

  // Resize handler
  window.addEventListener('resize', onResize);
}

function animate(): void {
  requestAnimationFrame(animate);
  processPendingPointerMove();
  controls.update();
  if (sceneDirty) {
    sceneDirty = false;
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }
}

function onResize(): void {
  const container = renderer.domElement.parentElement;
  if (!container) return;
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
  labelRenderer.setSize(container.clientWidth, container.clientHeight);
  sceneDirty = true;
}

function onPointerDown(event: PointerEvent): void {
  const container = renderer.domElement;
  const rect = container.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(globe.children, true);

  if (intersects.length > 0) {
    const intersected = intersects[0].object;
    // Find the hex polygon data from the intersected mesh
    const userData = intersected.userData;
    if (userData && userData.__data) {
      const feature = userData.__data;
      const id = feature?.properties?.ISO_A2 || feature?.properties?.id;
      if (id) selectCountry(id);
    }
  }
}

function onPointerMove(event: PointerEvent): void {
  pendingPointerEvent = event;
  pointerMovePending = true;
}

function processPendingPointerMove(): void {
  if (!pointerMovePending || !pendingPointerEvent || !tooltip) {
    pointerMovePending = false;
    return;
  }

  const event = pendingPointerEvent;
  pointerMovePending = false;

  const container = renderer.domElement;
  const rect = container.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(globe.children, true);

  if (intersects.length > 0) {
    const intersected = intersects[0].object;
    const userData = intersected.userData;
    if (userData && userData.__data) {
      const feature = userData.__data;
      const name = feature.properties?.ADMIN || feature.properties?.name || 'Unknown';
      const id = feature.properties?.ISO_A2 || feature.properties?.id || '';
      const isWeekly = state.dataMode === 'weekly';
      const isPerCapita = state.valueMode === 'perCapita';
      const cases = getValueForCountry(id, 'cases');
      const deaths = getValueForCountry(id, 'deaths');
      const hosp = getValueForCountry(id, 'hospitalizations');
      const vacc = getValueForCountry(id, 'fullyVaccinated');

      const casesLabel = (isWeekly ? 'New ' : '') + (isPerCapita ? 'Cases /100k' : 'Cases');
      const deathsLabel = (isWeekly ? 'New ' : '') + (isPerCapita ? 'Deaths /100k' : 'Deaths');
      const hospLabel = (isWeekly ? 'Change in ' : '') + (isPerCapita ? 'Hospitalized /100k' : 'Hospitalized');
      const vaccLabel = (isWeekly ? 'Newly ' : '') + (isPerCapita ? 'Vaccinated /100k' : 'Vaccinated');
      const fmt = isPerCapita ? formatPerCapita : isWeekly ? formatDelta : (n: number) => n.toLocaleString();

      tooltip.innerHTML = `
        <div style="font-family: system-ui, sans-serif; line-height: 1.4;">
          <strong>${name}</strong><br/>
          ${casesLabel}: ${fmt(cases)}<br/>
          ${deathsLabel}: ${fmt(deaths)}<br/>
          ${hospLabel}: ${fmt(hosp)}<br/>
          ${vaccLabel}: ${fmt(vacc)}
        </div>
      `;
      tooltip.style.display = 'block';
      tooltip.style.left = `${event.clientX + 12}px`;
      tooltip.style.top = `${event.clientY + 12}px`;
      container.style.cursor = 'pointer';
      return;
    }
  }

  tooltip.style.display = 'none';
  container.style.cursor = 'grab';
}

// Add mouse move listener for tooltips
document.addEventListener('pointermove', onPointerMove);

function updateGlobe(): void {
  if (!globe || boundaryData.length === 0) return;

  const metric = state.selectedMetric;
  const weekIndex = state.currentWeekIndex;
  const dataMode = state.dataMode;
  const valueMode = state.valueMode;

  if (weekIndex === lastWeekIndex && metric === lastMetric && dataMode === lastDataMode && valueMode === lastValueMode) return;
  lastWeekIndex = weekIndex;
  lastMetric = metric;
  lastDataMode = dataMode;
  lastValueMode = valueMode;

  currentMaxValue = getMaxForMetric(metric, dataMode);
  currentMetric = metric;

  for (let i = 0; i < enrichedPool.length; i++) {
    const feature = boundaryData[i];
    const id = feature.properties?.ISO_A2 || feature.properties?.id;
    enrichedPool[i]._value = id ? getMetricValueForCountry(id, metric) : 0;
  }

  globe.hexPolygonsData(enrichedPool);
  sceneDirty = true;
}

function getMaxForMetric(metric: MetricType, mode: DataMode): number {
  if (state.valueMode === 'perCapita') {
    if (mode === 'weekly') {
      switch (metric) {
        case 'cases': return state.maxWeeklyCasesPerCapita;
        case 'deaths': return state.maxWeeklyDeathsPerCapita;
        case 'hospitalizations': return state.maxWeeklyHospitalizationsPerCapita;
      }
    }
    switch (metric) {
      case 'cases': return state.maxCasesPerCapita;
      case 'deaths': return state.maxDeathsPerCapita;
      case 'hospitalizations': return state.maxHospitalizationsPerCapita;
    }
  }
  if (mode === 'weekly') {
    switch (metric) {
      case 'cases': return state.maxWeeklyCases;
      case 'deaths': return state.maxWeeklyDeaths;
      case 'hospitalizations': return state.maxWeeklyHospitalizations;
    }
  }
  switch (metric) {
    case 'cases': return state.maxCases;
    case 'deaths': return state.maxDeaths;
    case 'hospitalizations': return state.maxHospitalizations;
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

export function getGlobe(): ThreeGlobe {
  return globe;
}
