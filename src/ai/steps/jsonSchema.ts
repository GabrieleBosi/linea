import { z } from 'zod'

/**
 * JSON schema for the model from the zod schema. Gemini's responseJsonSchema takes a JSON
 * Schema subset: no $schema key, nullable as anyOf with null. zod 4 emits both shapes.
 */
export function toModelJsonSchema(schema: z.ZodType): unknown {
  const raw = z.toJSONSchema(schema, { target: 'draft-7', unrepresentable: 'any' }) as Record<string, unknown>
  delete raw.$schema
  return raw
}
