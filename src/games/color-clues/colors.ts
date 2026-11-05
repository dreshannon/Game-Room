import { COLUMNS, ROWS } from './logic'

// A coarse grid of anchor colors. Every board cell blends between its nearest anchors.
const ANCHORS = [
  ['#5c2a12', '#a62a17', '#e8222e', '#e6176f', '#b2308f', '#7a3a9a', '#5b3a96'],
  ['#e08a1e', '#f98f2e', '#f77e72', '#f277a2', '#b766a8', '#6e4aa0', '#37277f'],
  ['#ffd20f', '#ffd766', '#f5dca0', '#eeeeee', '#b9c8ea', '#6e8fce', '#27389a'],
  ['#f0e822', '#dfe765', '#a8d98c', '#96dcc8', '#7bd5ee', '#4aa7df', '#2a6bbd'],
  ['#7c9f36', '#6fb23f', '#239a48', '#1fb55f', '#2cb89a', '#12b6cf', '#1a9fd8'],
]

type Lab = [number, number, number]

const toLinear = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4

const fromLinear = (channel: number) =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055

// Blending in OKLab keeps brightness even, so the gradient doesn't turn muddy between hues.
function hexToOklab(hex: string): Lab {
  const [r, g, b] = [1, 3, 5].map((start) =>
    toLinear(parseInt(hex.slice(start, start + 2), 16) / 255),
  ) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function oklabToHex([L, a, b]: Lab) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  const bytes = linear.map((channel) => {
    const value = fromLinear(Math.min(1, Math.max(0, channel)))
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, '0')
  })
  return `#${bytes.join('')}`
}

const mix = (a: Lab, b: Lab, amount: number): Lab => [
  a[0] + (b[0] - a[0]) * amount,
  a[1] + (b[1] - a[1]) * amount,
  a[2] + (b[2] - a[2]) * amount,
]

const anchors = ANCHORS.map((row) => row.map(hexToOklab))

function colorAt(row: number, column: number) {
  const y = (row / (ROWS - 1)) * (anchors.length - 1)
  const x = (column / (COLUMNS - 1)) * (anchors[0]!.length - 1)
  const top = Math.min(Math.floor(y), anchors.length - 2)
  const left = Math.min(Math.floor(x), anchors[0]!.length - 2)
  const upper = mix(anchors[top]![left]!, anchors[top]![left + 1]!, x - left)
  const lower = mix(anchors[top + 1]![left]!, anchors[top + 1]![left + 1]!, x - left)
  return oklabToHex(mix(upper, lower, y - top))
}

/** One color per board cell, in reading order. */
export const BOARD_COLORS = Array.from({ length: ROWS * COLUMNS }, (_, cell) =>
  colorAt(Math.floor(cell / COLUMNS), cell % COLUMNS),
)
