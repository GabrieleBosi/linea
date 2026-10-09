// The data page cuts data.md at a heading to place the band table. A renamed heading would drop
// the table without an error, so the test pins it.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('design content', () => {
  it('data.md has the heading the data page splits on', () => {
    const text = readFileSync(resolve(import.meta.dirname, '../../src/design/content/data.md'), 'utf8')
    expect(text.split('## The eight anchor rows')).toHaveLength(2)
  })
})
