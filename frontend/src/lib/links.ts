import type { ResourceType } from "@/types/domain"

export const audioStudioBase = "/audio-studio"

export function resourceHref(type: ResourceType, id: string | number) {
  if (type === "space") return `${audioStudioBase}/projects?space=${id}`
  const collection = type === "series" ? "series" : `${type}s`
  return `${audioStudioBase}/${collection}/${id}`
}
