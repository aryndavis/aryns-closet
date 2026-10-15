const pad = (n: number) => String(n).padStart(2, '0')

export const toIsoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
export const today = () => toIsoDate(new Date())

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const formatDate = (iso: string) => parse(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
export const monthKey = (iso: string) => iso.slice(0, 7)
export const monthLabel = (key: string) => parse(`${key}-01`).toLocaleDateString('en-US', { month: 'long' })
export const yearOf = (key: string) => key.slice(0, 4)
