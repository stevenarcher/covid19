import { parse } from 'csv-parse/sync'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const COUNTRIES_PATH = join(process.cwd(), 'public', 'data', 'countries.json')

// App ids (OWID location names) -> OWID location, when they differ
const ID_TO_OWID: Record<string, string> = {
  USA: 'United States',
  UK: 'United Kingdom',
  UAE: 'United Arab Emirates',
  'Czech Republic': 'Czechia',
  'Ivory Coast': "Cote d'Ivoire",
  'DR Congo': 'Democratic Republic of Congo',
  Burma: 'Myanmar',
  'West Bank and Gaza': 'Palestine',
  Micronesia: 'Micronesia (country)',
}

interface WBRecord {
  countryiso3code: string
  date: string
  value: number | null
}

// Simple centroid (arithmetic mean of vertices) of a normalized country polygon.
function geometryCentroid(geom: { type: string; coordinates: any }): [number, number] {
  const polys =
    geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : []
  let lat = 0
  let lng = 0
  let n = 0
  for (const poly of polys) {
    for (const ring of poly) {
      for (const [x, y] of ring) {
        lat += y
        lng += x
        n++
      }
    }
  }
  return n > 0 ? [lat / n, lng / n] : [0, 0]
}

async function fetchWorldBankPopulation(referenceYear = 2023): Promise<Map<string, number>> {
  console.log(`Downloading World Bank population (SP.POP.TOTL, ${referenceYear})...`)
  const iso3ToPop = new Map<string, number>()
  let page = 1
  while (true) {
    const url = `https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=1000&date=${referenceYear}&source=2&page=${page}`
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for World Bank`)
    const json = await resp.json()
    const meta = json[0]
    const rows: WBRecord[] = json[1] || []
    for (const r of rows) {
      if (!r.countryiso3code || r.countryiso3code.includes('_')) continue
      if (r.value !== null && r.value > 0) iso3ToPop.set(r.countryiso3code, r.value)
    }
    if (page >= (meta?.pages || 1) || rows.length === 0) break
    page++
  }
  console.log(`World Bank population for ${iso3ToPop.size} countries`)
  return iso3ToPop
}

async function fetchOwidPopulations(): Promise<{ byLocation: Map<string, number>; iso3OfLocation: Map<string, string> }> {
  console.log('Downloading OWID data for population fallback / ISO3 lookup...')
  const resp = await fetch(
    'https://raw.githubusercontent.com/owid/covid-19-data/master/public/data/owid-covid-data.csv'
  )
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const rows = parse(await resp.text(), {
    columns: true,
    skip_empty_lines: true,
  })

  const byLocation = new Map<string, number>()
  const iso3OfLocation = new Map<string, string>()
  for (const row of rows) {
    const location = String(row.location || '').trim()
    if (!location) continue
    const pop = Number.parseInt(row.population || '', 10)
    if (Number.isFinite(pop) && pop > 0) {
      const known = byLocation.get(location)
      if (known === undefined || pop > known) byLocation.set(location, pop)
    }
    const iso = String(row.iso_code || '').trim()
    if (iso && !iso.startsWith('OWID_') && !iso3OfLocation.has(location)) iso3OfLocation.set(location, iso)
  }
  return { byLocation, iso3OfLocation }
}

async function main(): Promise<void> {
  const wbPop = await fetchWorldBankPopulation(2023)
  const { byLocation: owidPop, iso3OfLocation } = await fetchOwidPopulations()

  const countries = JSON.parse(readFileSync(COUNTRIES_PATH, 'utf8')) as { id: string; name?: string; centroid?: [number, number]; population?: number }[]
  const seen = new Set<string>()
  const deduped = countries.filter((c) => {
    if (seen.has(c.id)) return false
    seen.add(c.id)
    return true
  })

  let wb = 0
  let owid = 0
  let kept = 0
  const missing: string[] = []

  for (const country of deduped) {
    const owidName = ID_TO_OWID[country.id] || country.id
    const iso3 = iso3OfLocation.get(owidName)
    let pop: number | undefined = iso3 ? wbPop.get(iso3) : undefined
    if (pop === undefined) {
      pop = owidPop.get(owidName)
      if (pop !== undefined) owid++
    } else {
      wb++
    }

    if (pop !== undefined) {
      country.population = pop
    } else {
      kept++
      missing.push(country.id)
    }
  }

  // Territories that exist on the globe but aren't in countries.json yet.
  // Give them a population + a centroid so they get data and show on the map.
  const boundaries = JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'countries-boundaries.json'), 'utf8'))
  const added: string[] = []
  for (const feature of boundaries.features) {
    const id = feature.properties?.ISO_A2 || feature.properties?.id
    if (!id || seen.has(id)) continue
    const owidName = ID_TO_OWID[id] || id
    const iso3 = iso3OfLocation.get(owidName)
    let pop: number | undefined = iso3 ? wbPop.get(iso3) : undefined
    if (pop === undefined) {
      pop = owidPop.get(owidName)
      if (pop !== undefined) owid++
    } else {
      wb++
    }
    if (pop === undefined) {
      kept++
      missing.push(id)
    }
    const centroid = geometryCentroid(feature.geometry)
    deduped.push({ id, name: owidName, centroid, ...(pop !== undefined ? { population: pop } : {}) })
    seen.add(id)
    added.push(id)
  }
  if (added.length > 0) console.log(`Added from boundaries: ${added.join(', ')}`)

  writeFileSync(COUNTRIES_PATH, JSON.stringify(deduped, null, 2))
  console.log(`Updated ${deduped.length} countries: ${wb} World Bank (2023), ${owid} OWID fallback, ${kept} kept existing`)
  if (missing.length > 0) console.log(`No population update for: ${missing.join(', ')}`)
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})