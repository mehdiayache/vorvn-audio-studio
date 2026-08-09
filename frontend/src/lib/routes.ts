import type { ResourceType } from "@/types/domain"

export type StudioRoute = { type: ResourceType; id: string | number } | { type: "home" | "speak" | "batch" | "voices" | "activity" | "subtitles" | "settings"; id: null }

const ROOT_PATTERN = "(?:audio-studio|studio)"

export function studioRouteFromLocation(pathname: string, search: string): StudioRoute {
  if (new RegExp(`^/${ROOT_PATTERN}/speak/?$`).test(pathname)) return { type: "speak", id: null }
  if (new RegExp(`^/${ROOT_PATTERN}/voices/?$`).test(pathname)) return { type: "voices", id: null }
  if (new RegExp(`^/${ROOT_PATTERN}/activity/?$`).test(pathname)) return { type: "activity", id: null }
  if (new RegExp(`^/${ROOT_PATTERN}/settings/?$`).test(pathname)) return { type: "settings", id: null }
  if (new RegExp(`^/${ROOT_PATTERN}/subtitles/?$`).test(pathname)) return { type: "subtitles", id: null }
  if (new RegExp(`^/${ROOT_PATTERN}/batch/?$`).test(pathname)) return { type: "batch", id: null }
  const pathMatch = pathname.match(new RegExp(`^/${ROOT_PATTERN}/(ventures|projects|series|productions|workspaces)/([a-zA-Z0-9_-]+)/?$`))
  if (pathMatch?.[1] && pathMatch[2]) {
    const plural = pathMatch[1]
    const type: ResourceType = plural === "workspaces" ? "production" : plural === "series" ? "series" : plural.slice(0, -1) as ResourceType
    const identifier = pathMatch[2]
    return { type, id: /^\d+$/.test(identifier) ? Number(identifier) : identifier }
  }
  const value = Number(new URLSearchParams(search).get("project"))
  if (Number.isInteger(value) && value > 0) return { type: "production", id: value }
  return { type: "home", id: null }
}

export function productionIdFromLocation(pathname: string, search: string, fallback = 6) {
  const route = studioRouteFromLocation(pathname, search)
  return route.type === "production" && typeof route.id === "number" ? route.id : fallback
}

export function normalizeStudioLocation(pathname: string, search: string) {
  const route = studioRouteFromLocation(pathname, search)
  if (/^\/studio(?:\/|$)/.test(pathname)) {
    if (route.type === "production") return `/audio-studio/productions/${route.id}`
    if (route.type === "voices") return "/audio-studio/voices"
    if (route.type === "activity") return "/audio-studio/activity"
    if (route.type === "settings") return "/audio-studio/settings"
    if (route.type === "speak") return "/audio-studio/speak"
    if (route.type === "subtitles") return "/audio-studio/subtitles"
    if (route.type === "batch") return "/audio-studio/batch"
    if (route.type !== "home") return `/audio-studio/${route.type === "series" ? "series" : `${route.type}s`}/${route.id}`
    return "/audio-studio/"
  }
  if (pathname === "/audio-studio/" && new URLSearchParams(search).has("project") && route.type === "production") return `/audio-studio/productions/${route.id}`
  if (pathname.startsWith("/audio-studio/workspaces/") && route.type === "production") return `/audio-studio/productions/${route.id}`
  return null
}
