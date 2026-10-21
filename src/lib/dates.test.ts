import { describe, expect, it } from 'vitest'
import { formatDate, monthKey, monthLabel, toIsoDate, yearOf } from './dates'

describe('dates', () => {
  it('formats local dates as YYYY-MM-DD', () => {
    expect(toIsoDate(new Date(2026, 9, 5))).toBe('2026-10-05')
  })

  it('groups the lookbook by month', () => {
    expect(monthKey('2026-10-20')).toBe('2026-10')
    expect(monthLabel('2026-10')).toBe('October')
    expect(yearOf('2026-10')).toBe('2026')
  })

  it('formats dates for people', () => {
    expect(formatDate('2026-10-05')).toBe('Oct 5, 2026')
  })
})
