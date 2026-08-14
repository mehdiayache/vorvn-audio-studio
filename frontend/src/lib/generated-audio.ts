import { audioUrl } from "@/lib/api"
import type { GenerateResult } from "@/types/domain"

export type PlayableGenerateResult = GenerateResult & { url: string }

/**
 * Normalize every successful speech endpoint to one frontend contract.
 *
 * Older server responses for replacement clips only returned `name`, even
 * though the paid render and database replacement had succeeded. Falling back
 * to that immutable filename keeps a successful render playable during mixed
 * frontend/backend deployments. A response with neither field is genuinely
 * unusable and remains an error.
 */
export function playableGenerateResult(result: GenerateResult): PlayableGenerateResult {
  const url = result.url || audioUrl(result.name)
  if (!url) throw new Error("The server saved the recording without returning its audio file.")
  return { ...result, url }
}
