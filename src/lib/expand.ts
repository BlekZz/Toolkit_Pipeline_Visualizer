import { RRule } from 'rrule'
import { CronExpressionParser } from 'cron-parser'
import { DEFAULT_TIMEZONE } from '../schema/types'
import type { CalendarOccurrence, ScheduleFrequency } from '../schema/types'
import type { NormalizedDocument, NormalizedSchedule, NormalizedPipeline } from './normalize'

export interface DateRange {
  start: Date
  end: Date
}

// ─── Timezone helpers ─────────────────────────────────────────────────────────

/**
 * Convert a wall-clock date/time in a named IANA timezone to a UTC Date.
 * Uses Intl.DateTimeFormat to determine the UTC offset at that instant.
 */
function wallClockToUtc(dateStr: string, timeStr: string, timezone: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute] = timeStr.split(':').map(Number)

  // Step 1: treat the wall-clock time as if it were UTC (nominal)
  const nominal = new Date(Date.UTC(year, month - 1, day, hour, minute, 0))

  // Step 2: find what that nominal UTC instant looks like in the target timezone
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false,
  }).formatToParts(nominal)

  const get = (type: string): number => {
    const v = parts.find((p) => p.type === type)?.value ?? '0'
    return Number(v)
  }

  const localH = get('hour') === 24 ? 0 : get('hour')
  const localMs = Date.UTC(get('year'), get('month') - 1, get('day'), localH, get('minute'), get('second'))

  // offset = local representation of nominal - nominal itself
  const offset = localMs - nominal.getTime()
  return new Date(nominal.getTime() - offset)
}

// ─── Occurrence builder ───────────────────────────────────────────────────────

function makeId(pipelineId: string, scheduleId: string, utcDate: Date): string {
  return `${pipelineId}::${scheduleId}::${utcDate.toISOString()}`
}

function buildOccurrence(
  pipeline: NormalizedPipeline,
  schedule: NormalizedSchedule,
  startUtc: Date,
  durationSeconds: number,
): CalendarOccurrence {
  const endUtc = new Date(startUtc.getTime() + durationSeconds * 1000)
  return {
    id:              makeId(pipeline.id, schedule.id, startUtc),
    pipelineId:      pipeline.id,
    pipelineName:    pipeline.name,
    scheduleId:      schedule.id,
    scheduleTitle:   schedule.title,
    scheduledStart:  startUtc.toISOString(),
    scheduledEnd:    endUtc.toISOString(),
    durationSeconds,
    displayTimezone: DEFAULT_TIMEZONE, // caller overwrites with doc.displayTimezone
    recurrenceMode:  'simple', // caller overwrites
    directTags:      schedule.directTags,
    inheritedTags:   schedule.inheritedTags,
    projectContexts: pipeline.projectRefs,
    needsReview:     schedule.needsReview,
    assumptions:     schedule.assumptions,
  }
}

// ─── Frequency classification ─────────────────────────────────────────────────

function classifyScheduleFrequency(schedule: NormalizedSchedule): ScheduleFrequency {
  const def = schedule.schedule
  if (def.type === 'one_time') return 'monthly-or-less'

  const rec = def.recurrence

  if (rec.mode === 'simple') {
    if (rec.frequency === 'daily')   return 'daily'
    if (rec.frequency === 'weekly')  return 'weekly'
    return 'monthly-or-less'
  }

  if (rec.mode === 'rrule') {
    const m = rec.rrule.match(/FREQ=(\w+)/i)
    if (m) {
      const f = m[1].toUpperCase()
      if (f === 'SECONDLY' || f === 'MINUTELY' || f === 'HOURLY') return 'sub-daily'
      if (f === 'DAILY')   return 'daily'
      if (f === 'WEEKLY')  return 'weekly'
    }
    return 'monthly-or-less'
  }

  if (rec.mode === 'cron') {
    try {
      const iter = CronExpressionParser.parse(rec.cron, { currentDate: new Date() })
      const t1 = iter.next().getTime()
      const t2 = iter.next().getTime()
      const gap = t2 - t1
      if (gap < 86_400_000)          return 'sub-daily'       // < 24 h
      if (gap < 7 * 86_400_000)      return 'daily'           // < 7 days
      if (gap < 29 * 86_400_000)     return 'weekly'          // < 29 days
      return 'monthly-or-less'
    } catch {
      return 'daily'
    }
  }

  return 'daily'
}

// ─── Recurrence expanders ─────────────────────────────────────────────────────

const WEEKDAY_TO_NUM: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

function expandSimple(
  pipeline: NormalizedPipeline,
  schedule: NormalizedSchedule,
  range: DateRange,
  displayTimezone: string,
): CalendarOccurrence[] {
  const def = schedule.schedule
  if (def.type !== 'recurring') return []
  if (def.recurrence.mode !== 'simple') return []

  const { frequency, interval, byWeekday, byMonthDay, endDate } = def.recurrence
  const time     = def.time ?? '00:00'
  const duration = def.durationSeconds

  // Human-readable source description (stable across all occurrences of this schedule)
  const srcParts: string[] = [interval > 1 ? `every ${interval} ${frequency === 'daily' ? 'days' : frequency === 'weekly' ? 'weeks' : 'months'}` : frequency]
  if (byWeekday?.length) srcParts.push(byWeekday.join(', '))
  if (byMonthDay != null) srcParts.push(`day ${byMonthDay === -1 ? 'last' : byMonthDay}`)
  const simpleSource = srcParts.join(' / ')

  // Determine iteration bounds
  const startDate   = new Date(Math.max(new Date(def.startDate + 'T00:00:00Z').getTime(), range.start.getTime()))
  const hardEndDate = endDate ? new Date(endDate + 'T23:59:59Z') : null
  const rangeEnd    = hardEndDate ? new Date(Math.min(hardEndDate.getTime(), range.end.getTime())) : range.end

  const results: CalendarOccurrence[] = []

  if (frequency === 'daily') {
    // Iterate day by day in the range
    const dayMs = 86400000 * interval
    // Start from the nearest multiple of interval from def.startDate
    const anchor = wallClockToUtc(def.startDate, time, schedule.timezone)
    let cur = new Date(anchor)
    // Advance to range start
    while (cur < startDate) cur = new Date(cur.getTime() + dayMs)
    while (cur <= rangeEnd) {
      if (cur >= range.start) {
        const occ = buildOccurrence(pipeline, schedule, cur, duration)
        occ.recurrenceMode = 'simple'
        occ.recurrenceSource = simpleSource
        occ.displayTimezone = displayTimezone
        results.push(occ)
      }
      cur = new Date(cur.getTime() + dayMs)
    }

  } else if (frequency === 'weekly') {
    const targetDays = new Set((byWeekday ?? []).map((d) => WEEKDAY_TO_NUM[d]))
    // Walk day by day through the range
    const rangeStartDay = new Date(startDate)
    rangeStartDay.setUTCHours(0, 0, 0, 0)
    const cur = new Date(rangeStartDay)
    while (cur <= rangeEnd) {
      // Convert wall-clock time in schedule timezone for this calendar day
      const ymd = cur.toISOString().slice(0, 10)
      const utcOccurrence = wallClockToUtc(ymd, time, schedule.timezone)
      const dayOfWeek = utcOccurrence.getUTCDay()
      if (
        targetDays.has(dayOfWeek) &&
        utcOccurrence >= range.start &&
        utcOccurrence <= range.end &&
        utcOccurrence >= new Date(def.startDate + 'T00:00:00Z')
      ) {
        const occ = buildOccurrence(pipeline, schedule, utcOccurrence, duration)
        occ.recurrenceMode = 'simple'
        occ.displayTimezone = displayTimezone
        results.push(occ)
      }
      cur.setUTCDate(cur.getUTCDate() + 1)
    }

  } else if (frequency === 'monthly') {
    const targetDay = byMonthDay ?? 1
    // Walk month by month
    const anchor = new Date(def.startDate + 'T00:00:00Z')
    let year  = anchor.getUTCFullYear()
    let month = anchor.getUTCMonth() // 0-based
    while (true) {
      const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
      const day = targetDay === -1 ? daysInMonth : targetDay
      if (day < 1 || day > daysInMonth) { month++; if (month > 11) { month = 0; year++ }; continue }
      const utcOccurrence = wallClockToUtc(
        `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        time,
        schedule.timezone,
      )
      if (utcOccurrence > rangeEnd) break
      if (utcOccurrence >= range.start && utcOccurrence >= new Date(def.startDate + 'T00:00:00Z')) {
        const occ = buildOccurrence(pipeline, schedule, utcOccurrence, duration)
        occ.recurrenceMode = 'simple'
        occ.displayTimezone = displayTimezone
        results.push(occ)
      }
      month += interval
      if (month > 11) { month -= 12; year++ }
    }
  }

  return results
}

function expandRrule(
  pipeline: NormalizedPipeline,
  schedule: NormalizedSchedule,
  range: DateRange,
  displayTimezone: string,
): CalendarOccurrence[] {
  const def = schedule.schedule
  if (def.type !== 'recurring') return []
  if (def.recurrence.mode !== 'rrule') return []

  // Hoist past the mode guard — narrowing on def.recurrence doesn't survive into the .map closure
  const rec = def.recurrence
  const duration = def.durationSeconds

  try {
    const rule = RRule.fromString(rec.rrule)
    const occurrences = rule.between(range.start, range.end, true)

    // Apply endDate constraint if present
    const hardEnd = rec.endDate ? new Date(rec.endDate + 'T23:59:59Z') : null

    return occurrences
      .filter((d) => !hardEnd || d <= hardEnd)
      .map((d) => {
        // rrule returns "floating" dates: UTC fields hold wall-clock values.
        // Convert to real UTC using the schedule timezone.
        const ymd = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
        const hm  = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
        const realUtc = wallClockToUtc(ymd, hm, schedule.timezone)

        const occ = buildOccurrence(pipeline, schedule, realUtc, duration)
        occ.recurrenceMode = 'rrule'
        occ.recurrenceSource = rec.rrule
        occ.displayTimezone = displayTimezone
        return occ
      })
  } catch {
    console.warn(`[warn] pipeline "${pipeline.id}", schedule "${schedule.id}": failed to expand rrule`)
    return []
  }
}

function expandCron(
  pipeline: NormalizedPipeline,
  schedule: NormalizedSchedule,
  range: DateRange,
  displayTimezone: string,
): CalendarOccurrence[] {
  const def = schedule.schedule
  if (def.type !== 'recurring') return []
  if (def.recurrence.mode !== 'cron') return []

  const duration = def.durationSeconds
  const hardEnd  = def.recurrence.endDate ? new Date(def.recurrence.endDate + 'T23:59:59Z') : null
  const endBound = hardEnd ? new Date(Math.min(hardEnd.getTime(), range.end.getTime())) : range.end

  try {
    const expr = CronExpressionParser.parse(def.recurrence.cron, {
      currentDate: range.start,
      endDate:     endBound,
      tz:          schedule.timezone,
    })

    const results: CalendarOccurrence[] = []
    while (expr.hasNext()) {
      const cronDate = expr.next()
      const d = cronDate.toDate()
      if (d < range.start || d > endBound) break
      const startDateBound = new Date(def.startDate + 'T00:00:00Z')
      if (d < startDateBound) continue
      const occ = buildOccurrence(pipeline, schedule, d, duration)
      occ.recurrenceMode = 'cron'
      occ.recurrenceSource = def.recurrence.cron
      occ.displayTimezone = displayTimezone
      results.push(occ)
    }
    return results
  } catch {
    console.warn(`[warn] pipeline "${pipeline.id}", schedule "${schedule.id}": failed to expand cron`)
    return []
  }
}

function expandOneTime(
  pipeline: NormalizedPipeline,
  schedule: NormalizedSchedule,
  range: DateRange,
  displayTimezone: string,
): CalendarOccurrence[] {
  const def = schedule.schedule
  if (def.type !== 'one_time') return []

  const startUtc = new Date(def.startDateTime)
  if (startUtc < range.start || startUtc > range.end) return []

  const occ = buildOccurrence(pipeline, schedule, startUtc, def.durationSeconds)
  occ.recurrenceMode = 'one_time'
  occ.recurrenceSource = def.startDateTime
  occ.displayTimezone = displayTimezone
  return [occ]
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function expandRecurrence(doc: NormalizedDocument, range: DateRange): CalendarOccurrence[] {
  const results: CalendarOccurrence[] = []

  for (const pipeline of doc.pipelines) {
    for (const schedule of pipeline.schedules) {
      if (!schedule.enabled) continue

      const def  = schedule.schedule
      let occs: CalendarOccurrence[] = []

      if (def.type === 'one_time') {
        occs = expandOneTime(pipeline, schedule, range, doc.displayTimezone)
      } else if (def.recurrence.mode === 'simple') {
        occs = expandSimple(pipeline, schedule, range, doc.displayTimezone)
      } else if (def.recurrence.mode === 'rrule') {
        occs = expandRrule(pipeline, schedule, range, doc.displayTimezone)
      } else if (def.recurrence.mode === 'cron') {
        occs = expandCron(pipeline, schedule, range, doc.displayTimezone)
      }

      const freq = classifyScheduleFrequency(schedule)
      for (const occ of occs) occ.scheduleFrequency = freq
      results.push(...occs)
    }
  }

  return results
}
