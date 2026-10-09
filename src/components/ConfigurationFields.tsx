import { sizesOf } from '@/domain/catalog'
import { FAMILIES, MATERIALS, type Configuration, type Family, type Material } from '@/domain/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

export type ConfigurationDraft = Configuration & { notes: string }

export const DEFAULT_CONFIGURATION: ConfigurationDraft = { family: 'HEA', size: 200, material: 'S355', length_mm: 12000, quantity: 100, notes: '' }

type Props = {
  value: ConfigurationDraft
  onChange: (next: ConfigurationDraft) => void
  disabled?: boolean
  /** Compact layout for table rows: no labels, no notes. */
  compact?: boolean
  idPrefix?: string
}

export function ConfigurationFields({ value, onChange, disabled, compact, idPrefix = 'cfg' }: Props) {
  const sizes = sizesOf(value.family)
  const set = (patch: Partial<ConfigurationDraft>) => onChange({ ...value, ...patch })
  const setFamily = (family: Family) => {
    const next = sizesOf(family)
    set({ family, size: next.includes(value.size) ? value.size : (next[0] ?? value.size) })
  }
  const field = (label: string, id: string, control: React.ReactNode) =>
    compact ? (
      control
    ) : (
      <div className="space-y-1">
        <Label htmlFor={id}>{label}</Label>
        {control}
      </div>
    )

  return (
    <div className={compact ? 'grid grid-cols-5 gap-1.5' : 'grid grid-cols-2 gap-3'}>
      {field(
        'Family',
        `${idPrefix}-family`,
        <Select value={value.family} onValueChange={(v) => setFamily(v as Family)} disabled={disabled}>
          <SelectTrigger id={`${idPrefix}-family`} aria-label="Family" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FAMILIES.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>,
      )}
      {field(
        'Size',
        `${idPrefix}-size`,
        <Select value={String(value.size)} onValueChange={(v) => set({ size: Number(v) })} disabled={disabled}>
          <SelectTrigger id={`${idPrefix}-size`} aria-label="Size" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sizes.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>,
      )}
      {field(
        'Material',
        `${idPrefix}-material`,
        <Select value={value.material} onValueChange={(v) => set({ material: v as Material })} disabled={disabled}>
          <SelectTrigger id={`${idPrefix}-material`} aria-label="Material" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MATERIALS.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>,
      )}
      {field(
        'Length (mm)',
        `${idPrefix}-length`,
        <Input
          id={`${idPrefix}-length`}
          aria-label="Length (mm)"
          type="number"
          min={1}
          step={100}
          value={value.length_mm}
          onChange={(e) => set({ length_mm: Number(e.target.value) })}
          disabled={disabled}
          className="h-8"
        />,
      )}
      {field(
        'Quantity',
        `${idPrefix}-quantity`,
        <Input
          id={`${idPrefix}-quantity`}
          aria-label="Quantity"
          type="number"
          min={1}
          step={1}
          value={value.quantity}
          onChange={(e) => set({ quantity: Number(e.target.value) })}
          disabled={disabled}
          className="h-8"
        />,
      )}
      {!compact && (
        <div className="col-span-2 space-y-1">
          <Label htmlFor={`${idPrefix}-notes`}>Notes</Label>
          <Textarea id={`${idPrefix}-notes`} value={value.notes} onChange={(e) => set({ notes: e.target.value })} disabled={disabled} rows={2} />
        </div>
      )}
    </div>
  )
}
