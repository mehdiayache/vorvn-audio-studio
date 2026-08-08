import type { ResourceType } from "@/types/domain"

export const audioStudioBase = "/audio-studio"

export function resourceHref(type: ResourceType, id: number) {
  const collection = type === "series" ? "series" : `${type}s`
  return `${audioStudioBase}/${collection}/${id}`
}
