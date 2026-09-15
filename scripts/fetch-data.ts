import { parse } from 'csv-parse/sync'
import * as fs from 'fs'
import * as path from 'path'

interface WeekAcc {
  week: string
  newCases: number
  newDeaths: number
  cumCasesRow: number
  cumDeathsRow: number
  newHosp: number
  newIcu: number
  vacRow: number
  fullyVacRow: number
  fullVacPctRow: number
}

interface OutputRecord {
  countryId: string
  week: string
  cases: number
  deaths: number
  hospitalizations: number
  icu: number
  vaccinated: number
  fullyVaccinated: number
  fullyVaccinatedPercent: number
}

interface VaccineIntro {
  vaccine: string
  manufacturer: string
  firstDate: string | null
}

// ISO week: Monday–Sunday
function getISOWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  const dayOfWeek = d.getUTCDay()
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() - ((dayOfWeek + 6) % 7))
  return monday.toISOString().slice(0, 10)
}

function num(v: string | undefined): number {
  if (v === undefined || v === null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// WHO country name -> canonical app id (OWID location name)
const WHO_NAME_TO_ID: Record<string, string> = {
  'United States of America': 'United States',
  'Russian Federation': 'Russia',
  'United Kingdom of Great Britain and Northern Ireland': 'United Kingdom',
  'Republic of Korea': 'South Korea',
  'Türkiye': 'Turkey',
  'Netherlands (Kingdom of the)': 'Netherlands',
  'Viet Nam': 'Vietnam',
  'Venezuela (Bolivarian Republic of)': 'Venezuela',
  'Bolivia (Plurinational State of)': 'Bolivia',
  'Republic of Moldova': 'Moldova',
  "Lao People's Democratic Republic": 'Laos',
  'Iran (Islamic Republic of)': 'Iran',
  'Syrian Arab Republic': 'Syria',
  "Côte d'Ivoire": "Cote d'Ivoire",
  'United Republic of Tanzania': 'Tanzania',
  'Democratic Republic of the Congo': 'Democratic Republic of Congo',
  'Cabo Verde': 'Cape Verde',
  'Micronesia (Federated States of)': 'Micronesia (country)',
  'Kosovo (in accordance with UN Security Council resolution 1244 (1999))': 'Kosovo',
  'occupied Palestinian territory, including east Jerusalem': 'Palestine',
  'Timor-Leste': 'East Timor',
  'Brunei Darussalam': 'Brunei',
  "Democratic People's Republic of Korea": 'North Korea',
  'Holy See': 'Vatican',
  'Réunion': 'Reunion',
  'Saint Barthélemy': 'Saint Barthelemy',
  'Curaçao': 'Curacao',
  'Bonaire, Saint Eustatius and Saba': 'Bonaire Sint Eustatius and Saba',
  'Falkland Islands (Malvinas)': 'Falkland Islands',
}

// WHO entries to skip (aggregate / conveyance rows)
function isWhoAggregate(code: string, name: string): boolean {
  if (!name || !code) return true
  if (code.startsWith('XX')) return true
  if (name.toLowerCase().includes('international')) return true
  return false
}

// Normalize a country name: lowercase, strip diacritics & non-alphanumerics.
// WHO CSV releases spell the same territory differently (e.g. "THE UNITED
// KINGDOM" vs "United Kingdom of Great Britain and Northern Ireland").
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

// Normalized names that only appear in the WHO hospitalisation release
// (or otherwise differ from the case/death release).
const NORM_TO_ID: Record<string, string> = {
  theunitedkingdom: 'United Kingdom',
  turkey: 'Turkey',
  netherlands: 'Netherlands',
  northernmarianaislandscommonwealthofthe: 'Northern Mariana Islands',
  pitcairnislands: 'Pitcairn',
  saintmartin: 'Saint Martin (French part)',
  sintmaarten: 'Sint Maarten (Dutch part)',
  bonairesinteustatiusandsaba: 'Bonaire Sint Eustatius and Saba',
}

// WHO vaccine product introduction data is officially documented for the
// period November 2020 – February 2022; earlier dates in the file are errors.
const VACCINE_DATE_MIN = '2020-11-01'
const VACCINE_DATE_MAX = '2022-12-31'

// Date range: Nov 2019 – Nov 2023 (4 years)
const START_DATE = '2019-11-01'
const END_DATE = '2023-11-30'

function generateWeeks(start: string, end: string): string[] {
  const d = new Date(start + 'T00:00:00Z')
  const dow = d.getUTCDay()
  if (dow !== 1) {
    // advance to the first Monday on/after start so the grid begins inside the requested month
    const add = (7 - ((dow + 6) % 7)) % 7
    d.setUTCDate(d.getUTCDate() + add)
  }
  const weeks: string[] = []
  while (d.toISOString().slice(0, 10) <= end) {
    weeks.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 7)
  }
  return weeks
}

async function download(url: string): Promise<string> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`)
  return resp.text()
}

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'data')

async function main(): Promise<void> {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  // Canonical country list (ids used everywhere else in the app)
  const countries = JSON.parse(
    fs.readFileSync(path.join(OUTPUT_DIR, 'countries.json'), 'utf8')
  ) as { id: string; population: number }[]
  const appIds = new Set(countries.map((c) => c.id))
  const idToPopulation = new Map(countries.map((c) => [c.id, c.population]))
  const weeks = generateWeeks(START_DATE, END_DATE)

  console.log(`App countries: ${appIds.size}, weeks: ${weeks[0]} -> ${weeks[weeks.length - 1]} (${weeks.length})`)

  // ---------------------------------------------------------------
  // 1. WHO weekly cases & deaths
  // ---------------------------------------------------------------
  console.log('Downloading WHO weekly cases/deaths...')
  const whoData = parse((await download('https://srhdpeuwpubsa.blob.core.windows.net/whdh/COVID/WHO-COVID-19-global-data.csv')).replace(/^\uFEFF/, ''), {
    columns: true,
    skip_empty_lines: true,
  })

  const idToWhoName = new Map<string, string>()
  const normNameToId = new Map<string, string>()
  const acc = new Map<string, WeekAcc>()

  // WHO name -> app id (case-insensitive, diacritic-insensitive)
  for (const row of whoData) {
    const whoName = String(row.Country || '').trim()
    const code = String(row.Country_code || '').trim()
    if (isWhoAggregate(code, whoName)) continue
    const appId = WHO_NAME_TO_ID[whoName] ?? whoName
    if (!appIds.has(appId)) continue
    idToWhoName.set(appId, whoName)
    const key = norm(whoName)
    if (!normNameToId.has(key)) normNameToId.set(key, appId)
  }
  for (const [key, appId] of Object.entries(NORM_TO_ID)) {
    if (!normNameToId.has(key)) normNameToId.set(key, appId)
  }

  for (const row of whoData) {
    const whoName = String(row.Country || '').trim()
    const code = String(row.Country_code || '').trim()
    if (isWhoAggregate(code, whoName)) continue
    const appId = WHO_NAME_TO_ID[whoName] ?? whoName
    if (!appIds.has(appId)) continue

    const date = String(row.Date_reported || '').trim()
    if (!date || date < START_DATE || date > END_DATE) continue

    const week = getISOWeek(date)
    const key = `${appId}||${week}`
    if (!acc.has(key)) {
      acc.set(key, {
        week,
        newCases: 0,
        newDeaths: 0,
        cumCasesRow: 0,
        cumDeathsRow: 0,
        newHosp: 0,
        newIcu: 0,
        vacRow: 0,
        fullyVacRow: 0,
        fullVacPctRow: 0,
      })
    }
    const rec = acc.get(key)!
    rec.newCases += Math.max(num(row.New_cases), 0)
    rec.newDeaths += Math.max(num(row.New_deaths), 0)
    const cumC = num(row.Cumulative_cases)
    const cumD = num(row.Cumulative_deaths)
    if (cumC > rec.cumCasesRow) rec.cumCasesRow = cumC
    if (cumD > rec.cumDeathsRow) rec.cumDeathsRow = cumD
  }
  console.log(`WHO case/death records: ${[...acc.keys()].length}`)

  // ISO3 lookup from WHO daily data is unreliable in the weekly file; get iso3 from hosp-icu below.

  // ---------------------------------------------------------------
  // 2. WHO weekly hospitalisations & ICU admissions
  // ---------------------------------------------------------------
  console.log('Downloading WHO weekly hospitalisations / ICU admissions...')
  const whoHosp = parse((await download('https://srhdpeuwpubsa.blob.core.windows.net/whdh/COVID/WHO-COVID-19-global-hosp-icu-data.csv')).replace(/^\uFEFF/, ''), {
    columns: true,
    skip_empty_lines: true,
  })

  const iso3ToAppId = new Map<string, string>()
  for (const row of whoHosp) {
    const whoName = String(row.Country || '').trim()
    const iso3 = String(row.Country_code || '').trim()
    if (isWhoAggregate(iso3, whoName)) continue
    const appId = normNameToId.get(norm(whoName))
    if (!appId || !appIds.has(appId)) continue
    if (!iso3ToAppId.has(iso3)) iso3ToAppId.set(iso3, appId)

    const date = String(row.Date_reported || '').trim()
    if (!date || date < START_DATE || date > END_DATE) continue
    const week = getISOWeek(date)
    const key = `${appId}||${week}`
    if (!acc.has(key)) {
      acc.set(key, {
        week,
        newCases: 0,
        newDeaths: 0,
        cumCasesRow: 0,
        cumDeathsRow: 0,
        newHosp: 0,
        newIcu: 0,
        vacRow: 0,
        fullyVacRow: 0,
        fullVacPctRow: 0,
      })
    }
    const rec = acc.get(key)!
    rec.newHosp += Math.max(num(row.Covid_new_hospitalizations_last_7days), 0)
    rec.newIcu += Math.max(num(row.Covid_new_icu_admissions_last_7days), 0)
  }
  console.log(`ISO3 codes mapped: ${iso3ToAppId.size}`)

  // ---------------------------------------------------------------
  // 3. OWID vaccination data (counts + % fully vaccinated)
  // ---------------------------------------------------------------
  console.log('Downloading OWID vaccination data...')
  const owidRows = parse(await download('https://raw.githubusercontent.com/owid/covid-19-data/master/public/data/owid-covid-data.csv'), {
    columns: true,
    skip_empty_lines: true,
  })

  for (const row of owidRows) {
    const location = String(row.location || '').trim()
    if (!appIds.has(location)) continue
    const date = String(row.date || '').trim()
    if (!date || date < START_DATE || date > END_DATE) continue
    const week = getISOWeek(date)
    const key = `${location}||${week}`
    if (!acc.has(key)) {
      acc.set(key, {
        week,
        newCases: 0,
        newDeaths: 0,
        cumCasesRow: 0,
        cumDeathsRow: 0,
        newHosp: 0,
        newIcu: 0,
        vacRow: 0,
        fullyVacRow: 0,
        fullVacPctRow: 0,
      })
    }
    const rec = acc.get(key)!
    // OWID values are cumulative; take the latest day's value within the week
    const toc = num(row.total_vaccinations)
    const fully = num(row.people_fully_vaccinated)
    const pct = num(row.people_fully_vaccinated_per_hundred)
    if (toc > rec.vacRow) rec.vacRow = toc
    if (fully > rec.fullyVacRow) rec.fullyVacRow = fully
    if (pct > rec.fullVacPctRow) rec.fullVacPctRow = pct
  }
  console.log('OWID vaccination data processed')

  // ---------------------------------------------------------------
  // 4. Assemble cumulative series + full grid
  // ---------------------------------------------------------------
  // Running cumulatives per country (weeks processed in order)
  const cumByCountry = new Map<string, { cases: number; deaths: number; hosp: number; icu: number }>()
  const byCountryWeek = new Map<string, Map<string, WeekAcc>>()
  for (const [key, rec] of acc) {
    const [appId, week] = key.split('||')
    if (!byCountryWeek.has(appId)) byCountryWeek.set(appId, new Map())
    byCountryWeek.get(appId)!.set(week, rec)
  }

  const idToOwidPopulation = new Map<string, number>()
  for (const row of owidRows) {
    const loc = String(row.location || '').trim()
    if (!appIds.has(loc)) continue
    const p = num(row.population)
    const known = idToOwidPopulation.get(loc)
    if (p > 0 && (known === undefined || p > known)) idToOwidPopulation.set(loc, p)
  }

  const output: OutputRecord[] = []
  const orderedIds = countries.map((c) => c.id)

  for (const appId of orderedIds) {
    const weekMap = byCountryWeek.get(appId) || new Map<string, WeekAcc>()
    let cum = { cases: 0, deaths: 0, hosp: 0, icu: 0 }
    let vacRunning = 0
    let fullyRunning = 0
    let pctRunning = 0
    for (const week of weeks) {
      const rec = weekMap.get(week)
      if (rec) {
        cum = {
          cases: Math.max(rec.cumCasesRow, cum.cases + rec.newCases),
          deaths: Math.max(rec.cumDeathsRow, cum.deaths + rec.newDeaths),
          hosp: cum.hosp + rec.newHosp,
          icu: cum.icu + rec.newIcu,
        }
        // Vaccination counts are cumulative; carry forward the latest known value
        if (rec.vacRow > vacRunning) vacRunning = rec.vacRow
        if (rec.fullyVacRow > fullyRunning) fullyRunning = rec.fullyVacRow
        if (rec.fullVacPctRow > pctRunning) pctRunning = rec.fullVacPctRow
      }
      let pct = pctRunning
      if (pct <= 0 && fullyRunning > 0) {
        const pop = idToOwidPopulation.get(appId) || idToPopulation.get(appId) || 0
        pct = pop > 0 ? Math.round((fullyRunning / pop) * 1000) / 10 : 0
      }

      output.push({
        countryId: appId,
        week,
        cases: Math.max(0, cum.cases),
        deaths: Math.max(0, cum.deaths),
        hospitalizations: Math.max(0, cum.hosp),
        icu: Math.max(0, cum.icu),
        vaccinated: vacRunning,
        fullyVaccinated: fullyRunning,
        fullyVaccinatedPercent: pct,
      })
      cumByCountry.set(appId, cum)
    }
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'weekly-data.json'),
    JSON.stringify(output)
  )
  console.log(`Wrote ${output.length} country-week records`)

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'data-meta.json'),
    JSON.stringify({ countries: orderedIds, weeks, recordCount: output.length }, null, 2)
  )

  // ---------------------------------------------------------------
  // 5. WHO vaccine product introduction (vaccines.json)
  // ---------------------------------------------------------------
  console.log('Downloading WHO vaccine product introduction data...')
  const vacProd = parse((await download('https://srhdpeuwpubsa.blob.core.windows.net/whdh/COVID/COV_VAC_PROD.csv')).replace(/^\uFEFF/, ''), {
    columns: true,
    skip_empty_lines: true,
  })

  const vaccineByCountry = new Map<string, Map<string, { vaccine: string; manufacturer: string; firstDate: string | null }>>()
  const globalVaccines = new Map<string, { vaccine: string; manufacturer: string; firstDate: string | null }>()

  for (const row of vacProd) {
    const iso3 = String(row.ISO3 || '').trim().toUpperCase()
    const appId = iso3ToAppId.get(iso3)
    if (!appId) continue
    const name = String(row.COVID_VACCINE_PROD_NAME || row.COVID_VACCINE_PROD_DISPLAY || '').trim()
    const manufacturer = String(row.COVID_VACCINE_PROD_MANU_NAME || '').trim()
    if (!name) continue
    const display = String(row.COVID_VACCINE_PROD_DISPLAY || `${manufacturer} - ${name}`).trim()

    const dates = [row.COVID_VACCINE_PROD_DATE_START, row.COVID_VACCINE_PROD_DATE_AUTH]
      .map((d) => (d ? String(d).trim() : ''))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= VACCINE_DATE_MIN && d <= VACCINE_DATE_MAX)
      .sort()
    const firstDate = dates.length > 0 ? dates[0] : null

    if (!vaccineByCountry.has(appId)) vaccineByCountry.set(appId, new Map())
    const seen = vaccineByCountry.get(appId)!
    const existing = seen.get(display)
    if (!existing || (firstDate && (!existing.firstDate || firstDate < existing.firstDate))) {
      seen.set(display, { vaccine: display, manufacturer, firstDate })
    }

    const gExisting = globalVaccines.get(display)
    if (!gExisting || (firstDate && (!gExisting.firstDate || firstDate < gExisting.firstDate))) {
      globalVaccines.set(display, { vaccine: display, manufacturer, firstDate })
    }
  }

  const vaccinesJson: { countries: Record<string, VaccineIntro[]>; global: VaccineIntro[] } = {
    countries: {},
    global: [],
  }
  for (const [id, map] of vaccineByCountry) {
    vaccinesJson.countries[id] = [...map.values()].sort((a, b) =>
      (a.firstDate || '9999').localeCompare(b.firstDate || '9999')
    )
  }
  vaccinesJson.global = [...globalVaccines.values()]
    .filter((v) => v.firstDate !== null)
    .sort((a, b) => (a.firstDate!).localeCompare(b.firstDate!))

  fs.writeFileSync(path.join(OUTPUT_DIR, 'vaccines.json'), JSON.stringify(vaccinesJson, null, 2))
  console.log(`Vaccines: ${Object.keys(vaccinesJson.countries).length} countries, ${vaccinesJson.global.length} global products`)

  // ---------------------------------------------------------------
  // Diagnostics
  // ---------------------------------------------------------------
  const withWhoData = new Set(byCountryWeek.keys())
  const noWhoData = orderedIds.filter((id) => !withWhoData.has(id))
  console.log(`Countries with WHO data: ${withWhoData.size}; without: ${noWhoData.join(', ') || 'none'}`)
  console.log('Done.')
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})