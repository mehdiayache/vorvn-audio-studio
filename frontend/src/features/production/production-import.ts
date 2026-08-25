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

export const PRODUCTION_IMPORT_EXAMPLE = {
  schema: "audio-studio-production-import",
  version: 1,
  title: "Evening story",
  items: [
    { type: "speech", role: "Narrator", text: "The room grew quiet as the story began." },
    { type: "silence", seconds: 1.5 },
    { type: "speech", role: "Maya", text: "Stay with me. There is one more thing you should know." },
  ],
} as const

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

function optionalString(value: unknown, label: string, maximum?: number, allowBlank = false) {
  return value === undefined ? undefined : string(value, label, maximum, allowBlank)
}

function optionalNumber(value: unknown, label: string, minimum: number, maximum: number) {
  return value === undefined ? undefined : number(value, label, minimum, maximum)
}

function optionalInteger(value: unknown, label: string, minimum: number, maximum: number) {
  return value === undefined ? undefined : integer(value, label, minimum, maximum)
}

function normalizeRole(value: string) {
  const label = value.trim().replace(/\s+/g, " ")
  return { label, key: label.toLocaleLowerCase("en-US") }
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

  const roles = new Map<string, ProductionImportRole>()
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
    const role = normalizeRole(string(item.role, `Item ${itemNumber}: role`, 120))
    const speechMode = item.speech_mode
    if (speechMode !== undefined && speechMode !== "exact" && speechMode !== "directed") {
      throw new Error(`Item ${itemNumber}: speech_mode must be “exact” or “directed”.`)
    }
    const outputFormat = optionalString(item.format, `Item ${itemNumber}: format`, 24)
    if (outputFormat !== undefined && !["mp3", "mp3-24k", "wav", "opus"].includes(outputFormat)) {
      throw new Error(`Item ${itemNumber}: format must be “mp3”, “mp3-24k”, “wav”, or “opus”.`)
    }
    speechCount += 1
    const knownRole = roles.get(role.key)
    roles.set(role.key, knownRole
      ? { ...knownRole, count: knownRole.count + 1 }
      : { name: role.label, count: 1 })
    return {
      type: "speech" as const,
      role: knownRole?.name || role.label,
      text: string(item.text, `Item ${itemNumber}: text`, 500_000),
      language: optionalString(item.language, `Item ${itemNumber}: language`, 80) ?? "Auto",
      speech_mode: (speechMode ?? "exact") as "exact" | "directed",
      instruction: optionalString(item.instruction, `Item ${itemNumber}: instruction`, undefined, true) ?? "",
      rate: optionalNumber(item.rate, `Item ${itemNumber}: rate`, 0.5, 2) ?? 1,
      pitch: optionalNumber(item.pitch, `Item ${itemNumber}: pitch`, 0.5, 2) ?? 1,
      volume: optionalInteger(item.volume, `Item ${itemNumber}: volume`, 0, 100) ?? 50,
      seed: optionalInteger(item.seed, `Item ${itemNumber}: seed`, 0, 2_147_483_647) ?? 0,
      format: (outputFormat ?? "mp3") as "mp3" | "mp3-24k" | "wav" | "opus",
    }
  })
  return {
    document: {
      schema: "audio-studio-production-import",
      version: 1,
      title: document.title as string,
      description: typeof document.description === "string" ? document.description : "",
      items,
    },
    speechCount,
    silenceCount,
    roles: [...roles.values()],
  }
}
