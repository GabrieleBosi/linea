import { describe, expect, it } from 'vitest'
import { computeReadiness, executableCount, isExpired, latestSentRevision } from '@/domain/readiness'
import { line, quotation, TODAY } from './fixtures'

describe('order readiness', () => {
  it('is ready when every open line is executable and the latest revision is valid', () => {
    const r = computeReadiness([line({ commercial_status: 'agreed' })], [quotation()], TODAY)
    expect(r.ready).toBe(true)
    expect(r.blockers).toEqual([])
    expect(r.items.every((i) => i.ok)).toBe(true)
  })

  it('links the blocking lines', () => {
    const lines = [
      line({ commercial_status: 'agreed' }),
      line({ id: 'line-2', line_no: 2, commercial_status: 'quoted', technical_status: 'pending' }),
      line({ id: 'line-3', line_no: 3, commercial_status: 'declined' }),
    ]
    const r = computeReadiness(lines, [quotation()], TODAY)
    expect(r.ready).toBe(false)
    expect(r.items.find((i) => i.key === 'lines_agreed')?.blocking_line_ids).toEqual(['line-2'])
    expect(r.items.find((i) => i.key === 'lines_feasible')?.blocking_line_ids).toEqual(['line-2'])
    expect(r.blockers.join(' ')).toContain('L2')
    expect(r.blockers.join(' ')).not.toContain('L3')
  })

  it('needs at least one open line', () => {
    const r = computeReadiness([line({ commercial_status: 'withdrawn' })], [quotation()], TODAY)
    expect(r.items.find((i) => i.key === 'has_open_line')?.ok).toBe(false)
  })

  it('needs a sent, unexpired latest revision', () => {
    expect(computeReadiness([line({ commercial_status: 'agreed' })], [], TODAY).blockers).toContain('No revision has been sent.')
    const expired = computeReadiness([line({ commercial_status: 'agreed' })], [quotation({ valid_until: '2026-09-21' })], TODAY)
    expect(expired.ready).toBe(false)
    const superseded = computeReadiness([line({ commercial_status: 'agreed' })], [quotation({ status: 'superseded' })], TODAY)
    expect(superseded.blockers).toContain('The latest revision is superseded.')
  })

  it('uses the highest sent revision, ignoring drafts', () => {
    const q = [quotation({ id: 'q1', revision_no: 1, status: 'superseded' }), quotation({ id: 'q2', revision_no: 2 }), quotation({ id: 'q3', revision_no: 3, status: 'draft', valid_until: null })]
    expect(latestSentRevision(q)?.id).toBe('q2')
  })

  it('expired is derived from sent and valid_until', () => {
    expect(isExpired(quotation({ valid_until: '2026-09-21' }), TODAY)).toBe(true)
    expect(isExpired(quotation({ valid_until: '2026-09-22' }), TODAY)).toBe(false)
    expect(isExpired(quotation({ status: 'superseded', valid_until: '2020-01-01' }), TODAY)).toBe(false)
  })

  it('counts ready lines of open lines', () => {
    const lines = [line({ commercial_status: 'agreed' }), line({ id: 'l2', commercial_status: 'quoted' }), line({ id: 'l3', commercial_status: 'withdrawn' })]
    expect(executableCount(lines)).toEqual({ ready: 1, open: 2 })
  })
})
