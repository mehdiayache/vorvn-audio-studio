import type { components } from "@/types/api.generated"

export type ProductionImportDocument = components["schemas"]["ProductionImportDocument"]
export type ProductionImportCounts = components["schemas"]["ProductionImportResponse"]

export type ProductionImportRole = {
  name: string
  count: number
}

export type ParsedProductionImport = {
  document: ProductionImportDocument
  speechCount: number
  silenceCount: number
  roles: ProductionImportRole[]
}

const TOP_LEVEL_FIELDS = new Set(["schema", "version", "title", "items"])
const SPEECH_FIELDS = new Set([
  "type", "role", "text", "language", "speech_mode", "instruction",
  "rate", "pitch", "volume", "seed", "format",
])
const SILENCE_FIELDS = new Set(["type", "seconds"])

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`)
  }
  return value as Record<string, unknown>
}

function exactFields(value: Record<string, unknown>, allowed: Set<string>, label: string) {
  const extra = Object.keys(value).filter((key) => !allowed.has(key))
  if (extra.length) throw new Error(`${label}: unsupported field “${extra[0]}”.`)
}

function string(value: unknown, label: string, maximum?: number, allowBlank = false) {
  if (typeof value !== "string") throw new Error(`${label} must be text.`)
  if (!allowBlank && !value.trim()) throw new Error(`${label} cannot be blank.`)
  if (maximum !== undefined && value.length > maximum) throw new Error(`${label} cannot exceed ${maximum.toLocaleString()} characters.`)
  return value
}

function number(value: unknown, label: string, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a number.`)
  if (value < minimum || value > maximum) throw new Error(`${label} must be between ${minimum} and ${maximum}.`)
  return value
}

function integer(value: unknown, label: string, minimum: number, maximum: number) {
  const result = number(value, label, minimum, maximum)
  if (!Number.isInteger(result)) throw new Error(`${label} must be a whole number.`)
  return result
}

export function parseProductionImportText(source: string): ParsedProductionImport {
  let decoded: unknown
  try {
    decoded = JSON.parse(source)
  } catch {
    throw new Error("This file is not valid JSON.")
  }
  const document = record(decoded, "Document")
  exactFields(document, TOP_LEVEL_FIELDS, "Document")
  if (document.schema !== "audio-studio-production-import") {
    throw new Error("Document schema must be “audio-studio-production-import”.")
  }
  if (document.version !== 1) throw new Error("Only Production import version 1 is supported.")
  string(document.title, "Document title", 200)
  if (!Array.isArray(document.items)) throw new Error("Document items must be a list.")
  if (!document.items.length) throw new Error("Document items cannot be empty.")
  if (document.items.length > 1_000) throw new Error("A V1 import can contain at most 1,000 items.")

  const roles = new Map<string, number>()
  let speechCount = 0
  let silenceCount = 0
  const items: ProductionImportDocument["items"] = document.items.map((raw, index) => {
    const itemNumber = index + 1
    const item = record(raw, `Item ${itemNumber}`)
    if (item.type === "silence") {
      exactFields(item, SILENCE_FIELDS, `Item ${itemNumber}`)
      silenceCount += 1
      return { type: "silence" as const, seconds: number(item.seconds, `Item ${itemNumber}: seconds`, 0.1, 120) }
    }
    if (item.type !== "speech") throw new Error(`Item ${itemNumber}: type must be “speech” or “silence”.`)
    exactFields(item, SPEECH_FIELDS, `Item ${itemNumber}`)
    const role = string(item.role, `Item ${itemNumber}: role`, 120)
    if (role !== role.trim()) throw new Error(`Item ${itemNumber}: role cannot start or end with spaces.`)
    const speechMode = item.speech_mode
    if (speechMode !== "exact" && speechMode !== "directed") {
      throw new Error(`Item ${itemNumber}: speech_mode must be “exact” or “directed”.`)
    }
    speechCount += 1
    roles.set(role, (roles.get(role) || 0) + 1)
    return {
      type: "speech" as const,
      role,
      text: string(item.text, `Item ${itemNumber}: text`, 500_000),
      language: string(item.language, `Item ${itemNumber}: language`, 80),
      speech_mode: speechMode as "exact" | "directed",
      instruction: string(item.instruction, `Item ${itemNumber}: instruction`, undefined, true),
      rate: number(item.rate, `Item ${itemNumber}: rate`, 0.5, 2),
      pitch: number(item.pitch, `Item ${itemNumber}: pitch`, 0.5, 2),
      volume: integer(item.volume, `Item ${itemNumber}: volume`, 0, 100),
      seed: integer(item.seed, `Item ${itemNumber}: seed`, 0, 2_147_483_647),
      format: string(item.format, `Item ${itemNumber}: format`, 24),
    }
  })
  return {
    document: {
      schema: "audio-studio-production-import",
      version: 1,
      title: document.title as string,
      items,
    },
    speechCount,
    silenceCount,
    roles: [...roles].map(([name, count]) => ({ name, count })),
  }
}
