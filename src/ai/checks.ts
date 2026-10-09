// Code checks for the LLM steps. Spec 4.2, 4.3 and 4.1 rule 7. Pure functions.

import { isCatalogSize } from '@/domain/catalog'
import type { Check } from '@/domain/types'

export function check(name: string, pass: boolean, detail: string): Check {
  return { name, pass, detail }
}

// --- Instruction-like text -------------------------------------------------------------

/** Cyrillic and other lookalikes that hide Latin words. NFKC handles most width and ligature tricks. */
const HOMOGLYPHS: Record<string, string> = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', һ: 'h', к: 'k', т: 't', в: 'b', м: 'm', н: 'h',
  А: 'A', Е: 'E', О: 'O', Р: 'P', С: 'C', У: 'Y', Х: 'X', І: 'I', Ј: 'J', Ѕ: 'S', Н: 'H', К: 'K', Т: 'T', В: 'B', М: 'M',
}

export function normalizeForScan(text: string): string {
  const nfkc = text.normalize('NFKC')
  let out = ''
  for (const ch of nfkc) out += HOMOGLYPHS[ch] ?? ch
  // Zero-width characters hide words. Soft hyphens too.
  return out.replace(/[​-‏⁠﻿­]/g, '')
}

/** Spaced letters: "i g n o r e". Collapsed so the word patterns see the word. */
function collapseSpacedLetters(text: string): string {
  return text.replace(/\b(?:[A-Za-z]\s){4,}[A-Za-z]\b/g, (m) => m.replace(/\s+/g, ''))
}

export const INSTRUCTION_PATTERNS: ReadonlyArray<{ id: string; re: RegExp }> = [
  { id: 'ignore_previous', re: /\b(ignore|disregard|forget|override|skip)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|any|your|the)\b[^.\n]{0,30}\b(instructions?|prompts?|rules?|guidelines?|directions?|constraints?|system)\b/i },
  { id: 'role_prefix', re: /(^|\n)\s*[[<(]?\s*(system|assistant|developer|user|instruction|prompt)\s*[\]>)]?\s*:/i },
  { id: 'role_tag', re: /<\/?\s*(system|assistant|instructions?|prompt)\b[^>]*>|\[(system|assistant|instructions?)\]/i },
  { id: 'you_are_now', re: /\b(you are now|you're now|from now on you are|act as|pretend (to be|you are)|your new role|you must now|new instructions?)\b/i },
  { id: 'system_prompt', re: /\b(system prompt|system instructions?|hidden prompt|developer message|(reveal|print|show|repeat|output|put)\b[^.\n]{0,20}\byour (instructions|prompt))\b/i },
  { id: 'schema_break', re: /\b(reply|respond|answer|output|return)\b[^.\n]{0,20}\b(in|as)\s+(markdown|html|xml|yaml|plain text|csv)\b|\bnot (in |as )?json\b|\binstead of json\b/i },
  { id: 'add_field', re: /\b(add|include|output|emit|set|put)\b[^.\n]{0,30}\b(field|key|property|attribute)\b/i },
  { id: 'zero_price', re: /\b(zero|0|free|no)\s*(unit\s*)?(price|cost)\b|\b(price|discount)\b[^.\n]{0,20}\b(100\s*%|zero|0\s*(eur|€))/i },
  { id: 'decode', re: /\b(decode|base64|rot13|unescape)\b[^.\n]{0,30}\b(and|then)\b[^.\n]{0,20}\b(obey|follow|execute|run|apply)\b|\bbase64\b/i },
  { id: 'code_fence', re: /```|~~~/ },
  { id: 'script_tag', re: /<\s*(script|iframe|object|embed)\b|<\s*img\b[^>]*on\w+\s*=/i },
  { id: 'shell', re: /\$\([^)]{1,80}\)|`[^`\n]{1,80}`|\b(rm\s+-rf|curl\s+http|wget\s+http|chmod\s+\+x|sudo\s)\b/i },
  { id: 'sql', re: /\b(drop\s+table|delete\s+from|union\s+select|insert\s+into|update\s+\w+\s+set)\b|;\s*--/i },
  { id: 'template', re: /\{\{[^}]{1,80}\}\}|\$\{[^}]{1,80}\}|<%[^%]{1,80}%>/ },
  { id: 'bot_role', re: /\b(pricing|discount|sales|helpful|ai)\s+(bot|assistant|agent)\b/i },
  { id: 'jailbreak', re: /\b(jailbreak|prompt injection|dan mode|developer mode)\b/i },
  { id: 'html_comment', re: /<!--[\s\S]{0,400}?(ignore|instruction|system|output|add|price|quantity|field)[\s\S]{0,400}?-->/i },
  // German
  { id: 'de_ignore', re: /\b(ignorier(e|en|t)?|vergiss|vergessen|missachte(n)?)\b[^.\n]{0,40}\b(vorherigen?|obigen?|alle|deine|die)\b[^.\n]{0,30}\b(anweisung(en)?|regeln|vorgaben|instruktionen)\b/i },
  { id: 'de_role', re: /\b(du bist (jetzt|ab jetzt|nun)|sie sind (jetzt|nun)|ab jetzt bist du|neue anweisung(en)?)\b/i },
  // Italian
  { id: 'it_ignore', re: /\b(ignora|ignorate|dimentica|dimenticate|trascura)\b[^.\n]{0,40}\b(precedenti|tutte|le|ogni)\b[^.\n]{0,30}\b(istruzioni|regole|indicazioni)\b/i },
  { id: 'it_role', re: /\b(sei ora|ora sei|da ora (in poi )?sei|nuove istruzioni|comportati come)\b/i },
]

export type InstructionScan = { flagged: boolean; hits: string[] }

export function scanInstructions(text: string): InstructionScan {
  const scanned = collapseSpacedLetters(normalizeForScan(text))
  const hits = INSTRUCTION_PATTERNS.filter((p) => p.re.test(scanned)).map((p) => p.id)
  return { flagged: hits.length > 0, hits }
}

/** Spec 4.1 rule 7, layer five. Fails when the input looks like it carries instructions. */
export function noInstructionText(text: string): Check {
  const scan = scanInstructions(text)
  return check('no_instruction_text', !scan.flagged, scan.flagged ? `Instruction-like text: ${scan.hits.join(', ')}. Treat the draft with care.` : 'No instruction-like text in the input.')
}

// --- Grounding -------------------------------------------------------------------------

function squash(s: string): string {
  return normalizeForScan(s).replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Every span appears verbatim in the input (whitespace and case normalized). */
export function spanGrounded(text: string, spans: readonly string[]): Check {
  const hay = squash(text)
  const missing = spans.filter((s) => s.trim() !== '' && !hay.includes(squash(s)))
  const empty = spans.filter((s) => s.trim() === '').length
  const pass = missing.length === 0 && empty === 0
  const detail = pass
    ? `${spans.length} span(s) found in the input.`
    : `${missing.length} span(s) not found in the input${empty ? `, ${empty} empty` : ''}: ${missing.map((m) => `"${m.slice(0, 40)}"`).join(', ')}`
  return check('span_grounded', pass, detail)
}

export type IntakeLineLike = { family: string; size: number | null; material: string; length_mm: number | null; quantity: number | null }

export function sizeInCatalog(lines: readonly IntakeLineLike[]): Check {
  const bad = lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.family !== 'UNKNOWN' && (l.size === null || !isCatalogSize(l.family as 'HEA' | 'HEB' | 'IPE', l.size)))
  return check(
    'size_in_catalog',
    bad.length === 0,
    bad.length === 0 ? 'Every size exists in the catalog.' : `Unknown configuration on line(s) ${bad.map(({ l, i }) => `${i + 1} (${l.family} ${l.size ?? '?'})`).join(', ')}.`,
  )
}

export function quantityPositive(lines: readonly IntakeLineLike[]): Check {
  const bad = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.quantity !== null && (!Number.isInteger(l.quantity) || l.quantity <= 0))
  return check('quantity_positive', bad.length === 0, bad.length === 0 ? 'Every quantity is a positive integer.' : `Bad quantity on line(s) ${bad.map(({ i }) => i + 1).join(', ')}.`)
}

const METRES_RE = /\b(\d+(?:[.,]\d+)?)\s?(m|metres?|meters?|mtr)\b(?![a-z])/gi

/** Lengths in metres in the text became millimetres. A length below 100 looks like metres that were not converted. */
export function unitsNormalized(text: string, lines: readonly IntakeLineLike[]): Check {
  const suspicious = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.length_mm !== null && (l.length_mm < 100 || l.length_mm > 40000))
  const metres = [...normalizeForScan(text).matchAll(METRES_RE)].map((m) => Math.round(Number(m[1]?.replace(',', '.')) * 1000))
  const lengths = new Set(lines.map((l) => l.length_mm).filter((v): v is number => v !== null))
  const unmatched = metres.filter((mm) => lines.length > 0 && !lengths.has(mm))
  const pass = suspicious.length === 0 && unmatched.length === 0
  const parts: string[] = []
  if (suspicious.length) parts.push(`length(s) not in millimetres on line(s) ${suspicious.map(({ i }) => i + 1).join(', ')}`)
  if (unmatched.length) parts.push(`${unmatched.map((v) => `${v / 1000} m`).join(', ')} in the text but not in the output`)
  return check('units_normalized', pass, pass ? 'Lengths are in millimetres.' : parts.join('; ') + '.')
}

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, januar: 1, gennaio: 1, gen: 1,
  february: 2, feb: 2, februar: 2, febbraio: 2,
  march: 3, mar: 3, märz: 3, maerz: 3, marzo: 3,
  april: 4, apr: 4, aprile: 4,
  may: 5, mai: 5, maggio: 5, mag: 5,
  june: 6, jun: 6, juni: 6, giugno: 6, giu: 6,
  july: 7, jul: 7, juli: 7, luglio: 7, lug: 7,
  august: 8, aug: 8, agosto: 8, ago: 8,
  september: 9, sep: 9, sept: 9, settembre: 9, set: 9,
  october: 10, oct: 10, oktober: 10, okt: 10, ottobre: 10, ott: 10,
  november: 11, nov: 11, novembre: 11,
  december: 12, dec: 12, dezember: 12, dez: 12, dicembre: 12, dic: 12,
}

/** True when the text carries the date: ISO, numeric d.m.y or d/m/y, or day plus month name. */
export function dateSupported(text: string, iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return false
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const t = normalizeForScan(text).toLowerCase()
  if (t.includes(iso)) return true
  const numeric = new RegExp(`\\b0?${d}[./-]0?${mo}[./-](${y}|${String(y).slice(2)})\\b|\\b0?${mo}[./-]0?${d}[./-](${y}|${String(y).slice(2)})\\b`)
  if (numeric.test(t)) return true
  const names = Object.entries(MONTHS).filter(([, n]) => n === mo).map(([name]) => name)
  const dayRe = `\\b0?${d}(st|nd|rd|th|\\.)?\\b`
  return names.some((name) => {
    const re1 = new RegExp(`${dayRe}[^.\\n]{0,12}\\b${name}\\b`)
    const re2 = new RegExp(`\\b${name}\\b[^.\\n]{0,12}${dayRe}`)
    return re1.test(t) || re2.test(t)
  })
}

export function datesGrounded(text: string, dates: { stated_date: string | null; requested_delivery_date: string | null }): Check {
  const bad: string[] = []
  if (dates.stated_date !== null && !dateSupported(text, dates.stated_date)) bad.push(`stated_date ${dates.stated_date}`)
  if (dates.requested_delivery_date !== null && !dateSupported(text, dates.requested_delivery_date)) bad.push(`requested_delivery_date ${dates.requested_delivery_date}`)
  return check('dates_grounded', bad.length === 0, bad.length === 0 ? 'Dates are null or supported by the text.' : `Not supported by the text: ${bad.join(', ')}.`)
}

// --- Reply checks ----------------------------------------------------------------------

export function allLinesCovered(quotedLineNos: readonly number[], decisionLineNos: readonly number[]): Check {
  const counts = new Map<number, number>()
  for (const n of decisionLineNos) counts.set(n, (counts.get(n) ?? 0) + 1)
  const missing = quotedLineNos.filter((n) => !counts.has(n))
  const extra = decisionLineNos.filter((n) => !quotedLineNos.includes(n))
  const dup = [...counts.entries()].filter(([, c]) => c > 1).map(([n]) => n)
  const pass = missing.length === 0 && extra.length === 0 && dup.length === 0
  const parts: string[] = []
  if (missing.length) parts.push(`no decision for L${missing.join(', L')}`)
  if (extra.length) parts.push(`decision for a line not in the revision: L${extra.join(', L')}`)
  if (dup.length) parts.push(`more than one decision for L${dup.join(', L')}`)
  return check('all_lines_covered', pass, pass ? 'Every quoted line has exactly one decision.' : parts.join('; ') + '.')
}

export type ChangesLike = { quantity: number | null; length_mm: number | null; size: number | null; target_unit_price: number | null }

export function changesAreNumbers(decisions: ReadonlyArray<{ line_no: number; decision: string; changes: ChangesLike }>): Check {
  const bad: string[] = []
  for (const d of decisions) {
    if (d.decision !== 'change') continue
    const c = d.changes
    if (c.quantity !== null && (!Number.isInteger(c.quantity) || c.quantity <= 0)) bad.push(`L${d.line_no} quantity`)
    if (c.length_mm !== null && !(c.length_mm > 0)) bad.push(`L${d.line_no} length`)
    if (c.size !== null && !(c.size > 0)) bad.push(`L${d.line_no} size`)
    if (c.target_unit_price !== null && !(c.target_unit_price > 0)) bad.push(`L${d.line_no} target price`)
  }
  return check('changes_are_numbers', bad.length === 0, bad.length === 0 ? 'Changed quantities and prices are positive numbers.' : `Not positive: ${bad.join(', ')}.`)
}

// --- Text steps: price_memo and cover_text (spec 4.4, 4.5) ------------------------------------

const NUMBER_RE = /\d(?:[\d.,]*\d)?/g

/** "1,234.56", "1.234,56", "1 234" and "93,064" all become one number. */
export function parseNumberToken(token: string): number | null {
  let t = token.replace(/\s/g, '')
  const lastComma = t.lastIndexOf(',')
  const lastDot = t.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    // The later separator is the decimal mark; the other groups thousands.
    t = lastComma > lastDot ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  } else if (lastComma >= 0) {
    const after = t.length - lastComma - 1
    t = after === 3 && (t.match(/,/g) ?? []).length === 1 && !/^\d{1,3},\d{3}$/.test(t) ? t.replace(/,/g, '') : /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.')
  }
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function numbersIn(text: string): number[] {
  const out: number[] = []
  for (const m of text.match(NUMBER_RE) ?? []) {
    const n = parseNumberToken(m)
    if (n !== null) out.push(n)
  }
  return out
}

function decimalsOf(token: string): number {
  const m = /[.,](\d+)$/.exec(token.replace(/\s/g, ''))
  if (!m) return 0
  // A trailing group of three digits after a comma is a thousands group, not decimals.
  return token.includes(',') && !token.includes('.') && m[1]!.length === 3 ? 0 : m[1]!.length
}

/** Every number in the input, in the units a memo may use: as given, as a percentage, in metres. */
export function allowedNumbers(input: unknown): Set<number> {
  const out = new Set<number>()
  const add = (n: number) => {
    out.add(n)
    out.add(n * 100)
    out.add(n / 1000)
  }
  const walk = (v: unknown): void => {
    if (typeof v === 'number') add(v)
    else if (typeof v === 'string') for (const n of numbersIn(v)) add(n)
    else if (Array.isArray(v)) {
      add(v.length)
      v.forEach(walk)
    } else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(walk)
  }
  walk(input)
  return out
}

function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round(n * f) / f
}

/** Spec 4.4: every number in the memo appears in the input, at the precision the memo uses. */
export function numbersGrounded(text: string, input: unknown): Check {
  const allowed = allowedNumbers(input)
  const missing: string[] = []
  for (const token of text.match(NUMBER_RE) ?? []) {
    const n = parseNumberToken(token)
    if (n === null) continue
    const d = decimalsOf(token)
    let found = false
    for (const a of allowed) {
      if (Math.abs(roundTo(a, d) - n) < 1e-9) {
        found = true
        break
      }
    }
    if (!found) missing.push(token)
  }
  return check('numbers_grounded', missing.length === 0, missing.length === 0 ? 'Every number in the text is in the input.' : `Not in the input: ${missing.join(', ')}.`)
}

/** Spec 4.4: every cited id is in the top 5. */
export function referencesExist(cited: readonly string[], allowed: readonly string[]): Check {
  const unknown = cited.filter((c) => !allowed.includes(c))
  return check('references_exist', unknown.length === 0, unknown.length === 0 ? `${cited.length} cited id(s), all in the list.` : `Not in the list: ${unknown.join(', ')}.`)
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w !== '').length
}

/** Spec 4.4 and 4.5: a word limit. */
export function lengthOk(text: string, maxWords: number): Check {
  const n = wordCount(text)
  return check('length_ok', n <= maxWords, `${n} word(s), limit ${maxWords}.`)
}

/** Spec 4.4: the memo states the suggested price and it sits inside the range. */
export function priceInRange(text: string, suggested: number, range: readonly [number, number] | null): Check {
  const stated = numbersIn(text).some((n) => Math.abs(n - suggested) < 0.005 || Math.abs(n - roundTo(suggested, 0)) < 1e-9 || Math.abs(n - roundTo(suggested, 1)) < 1e-9)
  if (!stated) return check('price_in_range', false, `The suggested price ${suggested.toFixed(2)} is not stated.`)
  if (!range) return check('price_in_range', true, 'Price stated. No range: no won reference.')
  const inside = suggested >= range[0] - 0.005 && suggested <= range[1] + 0.005
  return check('price_in_range', inside, inside ? `Price stated and inside ${range[0].toFixed(2)} to ${range[1].toFixed(2)}.` : `Price stated but outside ${range[0].toFixed(2)} to ${range[1].toFixed(2)}.`)
}

// --- cover_text (spec 4.5) ---------------------------------------------------------------------

type CoverLineLike = { line_no: number; family: string; size: number; quantity: number; total_price: number }

function hasNumber(text: string, n: number): boolean {
  return numbersIn(text).some((x) => Math.abs(x - n) < 0.005 || Math.abs(x - roundTo(n, 0)) < 1e-9)
}

/** Spec 4.5: each line's quantity and total price appears in the text. */
export function everyLinePresent(text: string, lines: readonly CoverLineLike[]): Check {
  const missing = lines.filter((l) => !hasNumber(text, l.quantity) || !hasNumber(text, l.total_price)).map((l) => `L${l.line_no}`)
  return check('every_line_present', missing.length === 0, missing.length === 0 ? `${lines.length} line(s) with quantity and total.` : `Quantity or total missing for ${missing.join(', ')}.`)
}

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** The ISO dates a text names, in ISO, dd.mm.yyyy, dd/mm/yyyy and "22 October 2026" forms. */
export function datesIn(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) out.push(`${m[1]}-${m[2]}-${m[3]}`)
  for (const m of text.matchAll(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/g)) out.push(`${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`)
  for (const m of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/gi)) {
    out.push(`${m[3]}-${String(MONTH_NAMES.indexOf(m[2]!.toLowerCase()) + 1).padStart(2, '0')}-${m[1]!.padStart(2, '0')}`)
  }
  for (const m of text.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi)) {
    out.push(`${m[3]}-${String(MONTH_NAMES.indexOf(m[1]!.toLowerCase()) + 1).padStart(2, '0')}-${m[2]!.padStart(2, '0')}`)
  }
  return out
}

/** Spec 4.5: the validity date appears. */
export function validityPresent(text: string, validUntil: string): Check {
  const ok = datesIn(text).includes(validUntil)
  return check('validity_present', ok, ok ? `Valid until ${validUntil} is stated.` : `The validity date ${validUntil} is not in the text.`)
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== '')
}

function mentionsLine(paragraph: string, line: { line_no: number; family: string; size: number }): boolean {
  const p = paragraph.toLowerCase()
  // String.raw keeps \b and \s as regex escapes. A plain template string turned them into a
  // backspace and a literal "s", so "Line 3" and "L3" never matched.
  return new RegExp(String.raw`\b(line|l|item|position|pos\.?)\s*${line.line_no}\b`).test(p) || p.includes(`${line.family.toLowerCase()} ${line.size}`)
}

/** Spec 4.5: for each flagged line the exact phrase appears in the same paragraph as the line, and in no other paragraph. */
export function feasibilityDisclaimer(text: string, flagged: readonly { line_no: number; family: string; size: number }[]): Check {
  const phrase = 'subject to technical validation'
  const paras = paragraphs(text)
  const missing = flagged.filter((l) => !paras.some((p) => mentionsLine(p, l) && p.toLowerCase().includes(phrase))).map((l) => `L${l.line_no}`)
  const stray = paras.filter((p) => p.toLowerCase().includes(phrase) && !flagged.some((l) => mentionsLine(p, l)))
  if (flagged.length === 0 && stray.length === 0) return check('feasibility_disclaimer', true, 'No line is subject to validation and the phrase is absent.')
  if (missing.length > 0) return check('feasibility_disclaimer', false, `The phrase "${phrase}" is missing next to ${missing.join(', ')}.`)
  if (stray.length > 0) return check('feasibility_disclaimer', false, `The phrase appears in a paragraph that names no flagged line.`)
  return check('feasibility_disclaimer', true, `The phrase sits with ${flagged.map((l) => `L${l.line_no}`).join(', ')}.`)
}

/** Spec 4.5: no delivery date appears unless the input has one. Any date other than the validity date counts. */
export function noDeliveryPromise(text: string, validUntil: string, deliveryDate: string | null): Check {
  const allowed = new Set([validUntil, ...(deliveryDate ? [deliveryDate] : [])])
  const extra = [...new Set(datesIn(text))].filter((d) => !allowed.has(d))
  const lead = /\b(lead time|delivery (?:within|in)\s+\d+|within\s+\d+\s+(?:days|weeks)|weeks? of (?:delivery|lead))\b/i.test(text) && !deliveryDate
  if (extra.length > 0) return check('no_delivery_promise', false, `Date(s) not in the input: ${extra.join(', ')}.`)
  if (lead) return check('no_delivery_promise', false, 'The text promises a lead time.')
  return check('no_delivery_promise', true, deliveryDate ? `Only the validity and the delivery date ${deliveryDate}.` : 'No date beyond the validity date.')
}

/**
 * Every number in the text appears in the rendered prompt at the value shown there. The prompt
 * carries prices with two decimals and margins with one, as the screens do, so a memo that
 * rounds 20.15 percent to 20.2 while the composer shows 20.1 fails. Trailing zeros are free:
 * "780" matches "780.00".
 */
export function numbersDisplayed(text: string, rendered: string): Check {
  const shown = numbersIn(rendered)
  const differs = (text.match(NUMBER_RE) ?? []).filter((token) => {
    const n = parseNumberToken(token)
    return n !== null && !shown.some((s) => Math.abs(s - n) < 1e-9)
  })
  return check('numbers_displayed', differs.length === 0, differs.length === 0 ? 'Every number matches a displayed value.' : `Not shown on screen at this value: ${differs.join(', ')}.`)
}
