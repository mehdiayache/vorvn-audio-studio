import type { SoundSceneClip, SoundSceneDocument, VentureAsset, VisualSceneDocument } from "@/types/domain"

export const VIDEO_AUDIO_TRACK_ID = "embedded-video-audio"

function hasEmbeddedAudio(asset?: VentureAsset) {
  if (asset?.media_type !== "video") return false
  const metadata = { ...(asset.metadata || {}), ...(asset.version_metadata || {}) }
  return Boolean(
    Number(asset.sample_rate || 0) > 0 && Number(asset.channels || 0) > 0
    || String(metadata.audio_codec || "").trim(),
  )
}

function linkedClip(asset: VentureAsset, visualClip: VisualSceneDocument["tracks"][number]["clips"][number]): SoundSceneClip {
  return {
    id: crypto.randomUUID(),
    linked_visual_clip_id: visualClip.id,
    asset_id: asset.id,
    asset_version_id: Number(asset.version_id) || null,
    duration_ms: visualClip.duration_ms,
    source_offset_ms: visualClip.source_offset_ms,
    gain: 1,
    fade_in_ms: 0,
    fade_out_ms: 0,
    loop: false,
    ducking: false,
    duck_amount_db: -12,
    muted: false,
    locked: false,
    effects: [],
    anchor: { kind: "absolute", position_ms: visualClip.start_ms },
  }
}

export function synchronizeVideoAudio(
  source: SoundSceneDocument,
  visual: VisualSceneDocument,
  assets: VentureAsset[],
) {
  const document = structuredClone(source)
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]))
  const desired = visual.tracks.flatMap((track) => track.media_type === "video"
    ? track.clips.flatMap((clip) => {
      const asset = assetsById.get(clip.asset_id)
      return hasEmbeddedAudio(asset) ? [{ clip, asset: asset! }] : []
    })
    : [])
  const desiredIds = new Set(desired.map(({ clip }) => clip.id))
  const existing = new Map<string, { trackId: string; clip: SoundSceneClip }>()

  for (const track of document.tracks) {
    for (const clip of track.clips) {
      if (clip.linked_visual_clip_id)
        existing.set(clip.linked_visual_clip_id, { trackId: track.id, clip })
    }
    track.clips = track.clips.filter((clip) =>
      !clip.linked_visual_clip_id || desiredIds.has(clip.linked_visual_clip_id))
  }

  let target = document.tracks.find((track) => track.id === VIDEO_AUDIO_TRACK_ID)
  if (desired.length && !target) {
    target = {
      id: VIDEO_AUDIO_TRACK_ID,
      kind: "audio",
      name: "Video audio",
      volume: 1,
      muted: false,
      clips: [],
    }
    document.tracks.unshift(target)
  }

  for (const { clip: visualClip, asset } of desired) {
    const current = existing.get(visualClip.id)?.clip
    if (!current) {
      target!.clips.push(linkedClip(asset, visualClip))
      continue
    }
    current.asset_id = asset.id
    current.asset_version_id = Number(asset.version_id) || null
    current.duration_ms = visualClip.duration_ms
    current.source_offset_ms = visualClip.source_offset_ms
    current.anchor = { kind: "absolute", position_ms: visualClip.start_ms }
    current.loop = false
  }

  document.tracks = document.tracks.filter((track) =>
    track.id !== VIDEO_AUDIO_TRACK_ID || track.clips.length > 0)
  return {
    changed: JSON.stringify(document) !== JSON.stringify(source),
    document,
  }
}

export function videoHasEmbeddedAudio(asset?: VentureAsset) {
  return hasEmbeddedAudio(asset)
}
