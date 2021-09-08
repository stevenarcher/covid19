import * as fs from 'fs'
import * as path from 'path'

// Demo GeoJSON name → OWID name mapping
const NAME_TO_OWID: Record<string, string> = {
  'Bosnia and Herz.': 'Bosnia and Herzegovina',
  'Central African Rep.': 'Central African Republic',
  "Côte d'Ivoire": "Cote d'Ivoire",
  'Dem. Rep. Congo': 'Democratic Republic of Congo',
  'Dominican Rep.': 'Dominican Republic',
  'Falkland Is.': 'Falkland Islands',
  'Eq. Guinea': 'Equatorial Guinea',
  Macedonia: 'North Macedonia',
  'W. Sahara': 'Western Sahara',
  'S. Sudan': 'South Sudan',
  'Solomon Is.': 'Solomon Islands',
  Swaziland: 'Eswatini',
  'Timor-Leste': 'East Timor',
  'United States of America': 'United States',
  'N. Cyprus': 'Northern Cyprus',
}

// Features to exclude (no OWID data or disputed)
const SKIP_FEATURES = new Set(['Antarctica', 'Fr. S. Antarctic Lands', 'Somaliland'])

/**
 * Normalize GeoJSON coordinate nesting to proper depth.
 * The demo GeoJSON stores coordinates at depth N-1 (e.g. Polygon at depth 2 instead of 3).
 * globe.gl's bundled h3 auto-wraps these, but we fix them to be spec-compliant.
 */
function normalizeCoords(type: string, coordinates: any[]): any[] {
  if (type === 'Polygon') {
    // Expected: [[[lng, lat], ...]]  (depth 3)
    // Got:      [[lng, lat], ...]    (depth 2)
    if (coordinates.length > 0 && typeof coordinates[0][0] === 'number') {
      return [coordinates]
    }
  } else if (type === 'MultiPolygon') {
    // Expected: [[[[lng, lat], ...]]]  (depth 4)
    // Got:      [[[lng, lat], ...]]    (depth 3)
    if (coordinates.length > 0 && typeof coordinates[0][0][0] === 'number') {
      return coordinates.map((ring: any[]) => [ring])
    }
  }
  return coordinates
}

async function main(): Promise<void> {
  const outputDir = path.join(process.cwd(), 'public', 'data')

  console.log('Downloading globe.gl demo GeoJSON...')
  const resp = await fetch(
    'https://raw.githubusercontent.com/vasturiano/globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson'
  )
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const geojson = await resp.json()

  // Filter and map properties
  geojson.features = geojson.features.filter((f: any) => {
    const name = f.properties?.NAME || ''
    return !SKIP_FEATURES.has(name)
  })

  for (const f of geojson.features) {
    const props = f.properties
    const demoName = props.NAME || ''
    const owidName = NAME_TO_OWID[demoName] || demoName

    props.ADMIN = owidName
    props.ISO_A2 = owidName
    props.name = demoName

    // Normalize coordinate nesting
    f.geometry.coordinates = normalizeCoords(f.geometry.type, f.geometry.coordinates)
  }

  console.log(`Generated ${geojson.features.length} country features`)

  fs.writeFileSync(
    path.join(outputDir, 'countries-boundaries.json'),
    JSON.stringify(geojson)
  )

  console.log(`Saved to ${path.join(outputDir, 'countries-boundaries.json')}`)
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})
