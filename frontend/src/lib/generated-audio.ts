import type { GenerateResult } from "@/types/domain"

export type PlayableGenerateResult = GenerateResult & { url: string }

/**
 * Normalize every successful speech endpoint to one frontend contract.
 *
 * Successful generation must return the canonical playable URL. A saved file
 * without that URL is an invalid response, not a frontend reconstruction job.
 */
export function playableGenerateResult(result: GenerateResult): PlayableGenerateResult {
  const url = result.url?.trim()
  if (!url) throw new Error("The server saved the recording without returning its audio file.")
  return { ...result, url }
}
