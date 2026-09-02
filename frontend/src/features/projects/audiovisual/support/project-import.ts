import type { components } from "@/types/api.generated"

export type ProjectImportDocument = components["schemas"]["ProjectImportDocument"]
export type ProjectImportValidation = components["schemas"]["ProjectImportValidationResponse"]
export type ProjectImportPlan = components["schemas"]["ProjectImportExecuteBody"]
export type ProjectImportRoute = components["schemas"]["ProjectImportRouteSelection"]
export type ProjectImportResult = {
  project_id: number
  project_public_id: string
  title: string
  items: number
  speech: number
  silence: number
  cost?: number
  preparation_incomplete?: boolean
}

export const PROJECT_IMPORT_EXAMPLE = {
  schema: "origins-project-import",
  version: 1,
  title: "Evening story",
  description: "A calm story prepared for spoken delivery.",
  language: "English",
  items: [
    { type: "speech", role: "Narrator", text: "The room grew quiet as the story began." },
    { type: "silence", seconds: 1.5 },
    { type: "speech", role: "Maya", text: "Stay with me. There is one more thing you should know." },
  ],
} as const

/** Decode only. The backend owns every schema and domain validation rule. */
export function decodeProjectImportJson(source: string): unknown {
  try {
    return JSON.parse(source) as unknown
  } catch {
    throw new Error("This file is not valid JSON.")
  }
}
