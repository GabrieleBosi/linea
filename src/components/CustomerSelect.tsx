import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Customer } from '@/domain/types'

/** Searchable customer select. Spec 6.3. */
export function CustomerSelect({ customers, value, onChange }: { customers: Customer[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const selected = customers.find((c) => c.id === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id="customer" variant="outline" role="combobox" aria-expanded={open} aria-label="Customer" className="w-full justify-between font-normal">
          {selected ? selected.name : <span className="text-muted-foreground">Select a customer</span>}
          <span aria-hidden className="text-muted-foreground">
            ▾
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search customers" />
          <CommandList>
            <CommandEmpty>No customer with that name.</CommandEmpty>
            <CommandGroup>
              {customers.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.name}
                  onSelect={() => {
                    onChange(c.id)
                    setOpen(false)
                  }}
                >
                  <span className={c.id === value ? 'font-medium' : ''}>{c.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{c.country}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
