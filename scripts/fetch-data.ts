import { parse } from 'csv-parse/sync'
import * as fs from 'fs'
import * as path from 'path'

interface WeeklyRecord {
  countryId: string
  week: string
  cases: number
  deaths: number
  hospitalizations?: number
  vaccinated?: number
  fullyVaccinated?: number
}

// ISO week: Monday–Sunday
function getISOWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  const dayOfWeek = d.getUTCDay()
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() - ((dayOfWeek + 6) % 7))
  return monday.toISOString().slice(0, 10)
}

// Date range: Nov 2019 – Nov 2022
const START_DATE = '2019-11-01'
const END_DATE = '2022-11-30'

// OWID aggregate locations to skip
const SKIP_LOCATIONS = new Set([
  'World',
  'High-income countries',
  'Low-income countries',
  'Lower-middle-income countries',
  'Upper-middle-income countries',
  'European Union (27)',
  'International',
  'Europe',
  'North America',
  'Asia',
  'South America',
  'Africa',
  'Oceania',
  // UK sub-regions (no separate boundary features)
  'England',
  'Scotland',
  'Wales',
  'Northern Ireland',
])

async function fetchAndProcessData(): Promise<void> {
  console.log('Downloading OWID COVID-19 dataset...')

  const response = await fetch(
    'https://raw.githubusercontent.com/owid/covid-19-data/master/public/data/owid-covid-data.csv'
  )
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const csvData = await response.text()
  console.log(`Downloaded ${(csvData.length / 1e6).toFixed(1)} MB`)

  console.log('Parsing CSV...')
  const records: Record<string, string>[] = parse(csvData, {
    columns: true,
    skip_empty_lines: true,
  })
  console.log(`Parsed ${records.length} rows`)

  // Aggregate by country + ISO week
  const weeklyMap = new Map<string, WeeklyRecord>()

  for (const row of records) {
    const location = row.location?.trim()
    const date = row.date?.trim()
    if (!location || !date) continue
    if (SKIP_LOCATIONS.has(location)) continue
    if (date < START_DATE || date > END_DATE) continue

    const week = getISOWeek(date)
    const key = `${location}||${week}`

    if (!weeklyMap.has(key)) {
      weeklyMap.set(key, {
        countryId: location,
        week,
        cases: 0,
        deaths: 0,
        hospitalizations: 0,
        vaccinated: 0,
        fullyVaccinated: 0,
      })
    }

    const rec = weeklyMap.get(key)!

    // Use cumulative totals from the latest day in the week
    // OWID columns are cumulative; we take the max within each week
    const totalCases = parseInt(row.total_cases || '0', 10) || 0
    const totalDeaths = parseInt(row.total_deaths || '0', 10) || 0
    const totalVacc = parseInt(row.total_vaccinations || '0', 10) || 0
    const fullyVacc = parseInt(row.people_fully_vaccinated || '0', 10) || 0
    const hosp = parseInt(row.hosp_patients || '0', 10) || 0

    if (totalCases > rec.cases) rec.cases = totalCases
    if (totalDeaths > rec.deaths) rec.deaths = totalDeaths
    if (totalVacc > (rec.vaccinated || 0)) rec.vaccinated = totalVacc
    if (fullyVacc > (rec.fullyVaccinated || 0)) rec.fullyVaccinated = fullyVacc
    if (hosp > (rec.hospitalizations || 0)) rec.hospitalizations = hosp
  }

  const weeklyData = Array.from(weeklyMap.values()).sort((a, b) =>
    a.countryId.localeCompare(b.countryId) || a.week.localeCompare(b.week)
  )

  console.log(`Aggregated to ${weeklyData.length} country-week records`)

  // Write output
  const outputDir = path.join(process.cwd(), 'public', 'data')
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  fs.writeFileSync(
    path.join(outputDir, 'weekly-data.json'),
    JSON.stringify(weeklyData, null, 2)
  )

  // Write a summary
  const countries = [...new Set(weeklyData.map(r => r.countryId))].sort()
  const weeks = [...new Set(weeklyData.map(r => r.week))].sort()
  console.log(`Countries: ${countries.length}`)
  console.log(`Week range: ${weeks[0]} to ${weeks[weeks.length - 1]}`)
  console.log(`Total weeks: ${weeks.length}`)

  fs.writeFileSync(
    path.join(outputDir, 'data-meta.json'),
    JSON.stringify({ countries, weeks, recordCount: weeklyData.length }, null, 2)
  )

  console.log('Done.')
}

fetchAndProcessData().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})
