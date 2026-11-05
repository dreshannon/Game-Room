import { describe, expect, it } from 'vitest'
import { BOARD_COLORS } from './colors'
import { CELL_COUNT } from './logic'

describe('board colors', () => {
  it('gives every cell its own valid color', () => {
    expect(BOARD_COLORS).toHaveLength(CELL_COUNT)
    expect(BOARD_COLORS.every((color) => /^#[0-9a-f]{6}$/.test(color))).toBe(true)
    expect(new Set(BOARD_COLORS).size).toBe(CELL_COUNT)
  })
})
