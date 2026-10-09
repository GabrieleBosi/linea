import type { Configuration } from '@/domain/types'

export { sumAsShown } from '@/domain/money'

const eur0 = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const eur2 = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const int = new Intl.NumberFormat('en-IE', { maximumFractionDigits: 0 })

export function money(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : eur0.format(v)
}

export function unitMoney(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : eur2.format(v)
}

export function number(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : int.format(v)
}

export function pct(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined ? '—' : `${(v * 100).toFixed(digits)}%`
}

export function date(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '—'
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function configLabel(c: Configuration): string {
  return `${c.family} ${c.size} ${c.material}`
}

export function configDetail(c: Configuration): string {
  return `${number(c.length_mm)} mm · ${number(c.quantity)} pcs`
}

export function ageLabel(iso: string, now = Date.now()): string {
  const ms = now - Date.parse(iso)
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return 'under an hour'
  if (h < 24) return `${h} h`
  const d = Math.floor(h / 24)
  return d === 1 ? '1 day' : `${d} days`
}

export function humanStatus(s: string): string {
  return s.replace(/_/g, ' ')
}
