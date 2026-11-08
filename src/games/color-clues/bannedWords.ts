/**
 * Clues have to describe things, not name colors, so color names and words that only
 * adjust a color (bright, pale, shade…) are not allowed. Each word of a clue is
 * checked on its own, along with its hyphenated parts, so "blue-green" is caught
 * but a compound like "blackberry" is fine.
 */

const COLOR_NAMES = [
  'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'violet', 'pink', 'brown',
  'black', 'white', 'gray', 'grey',
]

const MODIFIERS = [
  'bright', 'dark', 'light', 'pale', 'deep', 'dull', 'dim', 'vivid', 'muted', 'pastel',
  'saturated', 'desaturated', 'faded', 'neon', 'hue', 'shade', 'tint', 'tone',
  'color', 'colour', 'colored', 'coloured',
]

const BANNED = new Set([...COLOR_NAMES, ...MODIFIERS])

/** The first color word in a clue, written as the player wrote it, or null. */
export function findBannedWord(words: string[]): string | null {
  for (const word of words) {
    for (const part of word.split(/[^\p{L}]+/u)) {
      if (part && BANNED.has(part.toLowerCase())) return part
    }
  }
  return null
}
