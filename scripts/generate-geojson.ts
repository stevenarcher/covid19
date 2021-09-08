import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface CountryData {
  id: string;
  name: string;
  centroid: [number, number];
  population: number;
}

function generateHexPatch(
  lat: number,
  lng: number,
  radiusDeg: number
): number[][] {
  const points: number[][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    points.push([
      lng + radiusDeg * Math.cos(angle),
      lat + radiusDeg * Math.sin(angle),
    ]);
  }
  points.push(points[0].slice());
  return points;
}

function generateCountryPolygon(
  country: CountryData,
  radiusDeg: number
): { type: string; coordinates: number[][][] } {
  const [lat, lng] = country.centroid;
  const coordinates = [generateHexPatch(lat, lng, radiusDeg)];
  return { type: 'Polygon', coordinates };
}

function main(): void {
  const countriesPath = join(__dirname, '..', 'public', 'data', 'countries.json');
  const outputPath = join(__dirname, '..', 'public', 'data', 'countries-geo.json');

  const countries: CountryData[] = JSON.parse(readFileSync(countriesPath, 'utf8'));

  const features = countries
    .filter((c) => c.centroid[0] !== 0 || c.centroid[1] !== 0)
    .map((country) => ({
      type: 'Feature' as const,
      properties: {
        name: country.name,
        id: country.id,
        ADMIN: country.name,
        ISO_A2: country.id,
        POP_EST: country.population,
      },
      geometry: generateCountryPolygon(country, 3),
    }));

  const geojson = {
    type: 'FeatureCollection',
    features,
  };

  writeFileSync(outputPath, JSON.stringify(geojson));
  console.log(`Generated ${features.length} country polygons → ${outputPath}`);
}

main();
