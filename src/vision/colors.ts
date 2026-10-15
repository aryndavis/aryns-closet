// Finds an item's main color and gives it a friendly name.

const NAMED: [string, [number, number, number]][] = [
  ['black', [20, 20, 22]],
  ['charcoal', [60, 62, 66]],
  ['gray', [128, 128, 130]],
  ['silver', [192, 192, 196]],
  ['white', [245, 245, 242]],
  ['cream', [240, 228, 200]],
  ['beige', [215, 195, 160]],
  ['tan', [190, 150, 105]],
  ['dark brown', [72, 50, 32]],
  ['brown', [110, 70, 40]],
  ['burgundy', [110, 25, 45]],
  ['red', [200, 30, 40]],
  ['coral', [245, 120, 100]],
  ['orange', [235, 125, 30]],
  ['mustard', [205, 165, 40]],
  ['yellow', [245, 215, 60]],
  ['olive', [110, 115, 50]],
  ['sage', [160, 180, 140]],
  ['green', [50, 140, 70]],
  ['teal', [30, 130, 130]],
  ['light blue', [160, 195, 225]],
  ['slate', [80, 95, 102]],
  ['denim', [80, 110, 150]],
  ['blue', [40, 80, 190]],
  ['navy', [25, 35, 75]],
  ['lavender', [195, 175, 225]],
  ['purple', [110, 50, 150]],
  ['pink', [245, 170, 200]],
  ['hot pink', [235, 60, 150]],
]

type Lab = [number, number, number]

function toLab([r, g, b]: [number, number, number]): Lab {
  const lin = (c: number) => {
    const v = c / 255
    return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92
  }
  const [R, G, B] = [lin(r), lin(g), lin(b)]
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047)
  const y = f(R * 0.2126 + G * 0.7152 + B * 0.0722)
  const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}

const NAMED_LAB = NAMED.map(([name, rgb]) => [name, toLab(rgb)] as const)

export function colorName(rgb: [number, number, number]): string {
  const lab = toLab(rgb)
  let best = NAMED_LAB[0]
  let bestDistance = Infinity
  for (const entry of NAMED_LAB) {
    // Hue matters more than lightness for naming clothes ("dark brown", not "charcoal").
    const d = (lab[0] - entry[1][0]) ** 2 + 2 * (lab[1] - entry[1][1]) ** 2 + 2 * (lab[2] - entry[1][2]) ** 2
    if (d < bestDistance) {
      bestDistance = d
      best = entry
    }
  }
  return best[0]
}

export const toHex = ([r, g, b]: [number, number, number]) => `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`

/** Most common color among the given RGB samples (k-means with 3 clusters, biggest cluster wins). */
export function dominantColor(all: [number, number, number][]): [number, number, number] {
  if (all.length === 0) return [128, 128, 128]
  // Folds and shadows are darker than the fabric really is; skip the darkest 30% and brightest 5%.
  const luma = (c: [number, number, number]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  const sorted = [...all].sort((a, b) => luma(a) - luma(b))
  const trimmed = sorted.slice(Math.floor(sorted.length * 0.3), Math.ceil(sorted.length * 0.95))
  const samples = trimmed.length > 0 ? trimmed : sorted
  const k = Math.min(3, samples.length)
  const centers = Array.from({ length: k }, (_, i) => [...samples[Math.floor(((i + 0.5) * samples.length) / k)]] as [number, number, number])
  const assignment = new Array<number>(samples.length).fill(0)
  for (let iteration = 0; iteration < 8; iteration++) {
    samples.forEach((s, i) => {
      let best = 0
      let bestDistance = Infinity
      centers.forEach((c, j) => {
        const d = (s[0] - c[0]) ** 2 + (s[1] - c[1]) ** 2 + (s[2] - c[2]) ** 2
        if (d < bestDistance) {
          bestDistance = d
          best = j
        }
      })
      assignment[i] = best
    })
    centers.forEach((c, j) => {
      const members = samples.filter((_, i) => assignment[i] === j)
      if (members.length === 0) return
      for (let ch = 0; ch < 3; ch++) c[ch] = members.reduce((sum, m) => sum + m[ch], 0) / members.length
    })
  }
  const counts = centers.map((_, j) => assignment.filter((a) => a === j).length)
  return centers[counts.indexOf(Math.max(...counts))]
}
