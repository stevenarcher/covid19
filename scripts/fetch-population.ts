import { parse } from 'csv-parse/sync'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const COUNTRIES_PATH = join(process.cwd(), 'public', 'data', 'countries.json')

// aliases used by the app's static country list -> canonical OWID location names
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

async function main(): Promise<void> {
  console.log('Downloading OWID COVID-19 dataset for population data...')

  const response = await fetch(
    'https://raw.githubusercontent.com/owid/covid-19-data/master/public/data/owid-covid-data.csv'
  )
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const rows = parse(await response.text(), {
    columns: true,
    skip_empty_lines: true,
  })

  const populations = new Map<string, number>()
  for (const row of rows) {
    const location = String(row.location || '').trim()
    const pop = Number.parseInt(row.population, 10)
    if (!location || !Number.isFinite(pop) || pop <= 0) continue
    const known = populations.get(location)
    if (known === undefined || pop > known) populations.set(location, pop)
  }
  console.log(`Population data for ${populations.size} locations`)

  const countries = JSON.parse(readFileSync(COUNTRIES_PATH, 'utf8'))
  let updated = 0
  const missing: string[] = []

  for (const country of countries) {
    const owidName = ID_TO_OWID[country.id] || country.id
    const pop = populations.get(owidName)
    const resolvedName = populations.has(owidName) ? owidName : country.id

    country.population = pop ?? 0
    country.id = resolvedName
    country.name = resolvedName

    if (pop !== undefined) {
      updated++
    } else {
      missing.push(country.id)
    }
  }

  writeFileSync(COUNTRIES_PATH, JSON.stringify(countries, null, 2))
  console.log(`Updated ${updated}/${countries.length} countries with population data`)
  if (missing.length > 0) {
    console.log(`No population found for: ${missing.join(', ')}`)
  }
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})