/** Fills {{name}} placeholders. Values are inserted as they are; the prompts wrap data in markers. */
export function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = values[key]
    if (v === undefined) throw new Error(`Prompt placeholder {{${key}}} has no value`)
    return v
  })
}
