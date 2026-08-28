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

type RememberedLinkedAudio = NonNullable<
  SoundSceneDocument["linked_visual_audio_settings"]
>["clips"][string]

function rememberClip(clip: SoundSceneClip): RememberedLinkedAudio {
  return {
    clip_id: clip.id,
    gain: clip.gain,
    fade_in_ms: clip.fade_in_ms,
    fade_out_ms: clip.fade_out_ms,
    ducking: clip.ducking,
    duck_amount_db: clip.duck_amount_db ?? -12,
    muted: clip.muted,
    locked: clip.locked,
    effects: structuredClone(clip.effects),
  }
}

function linkedClip(
  asset: VentureAsset,
  visualClip: VisualSceneDocument["tracks"][number]["clips"][number],
  remembered?: RememberedLinkedAudio,
): SoundSceneClip {
  const clip: SoundSceneClip = {
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
  if (!remembered) return clip
  return {
    ...clip,
    id: remembered.clip_id,
    gain: remembered.gain,
    fade_in_ms: remembered.fade_in_ms,
    fade_out_ms: remembered.fade_out_ms,
    ducking: remembered.ducking,
    duck_amount_db: remembered.duck_amount_db,
    muted: remembered.muted,
    locked: remembered.locked,
    effects: structuredClone(remembered.effects),
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
  const existing = new Map<string, SoundSceneClip>()
  const remembered = document.linked_visual_audio_settings ?? {
    track: { name: "Video audio", volume: 1, muted: false },
    clips: {},
  }

  for (const track of document.tracks) {
    for (const clip of track.clips) {
      if (clip.linked_visual_clip_id) {
        existing.set(clip.linked_visual_clip_id, clip)
        remembered.track = {
          name: track.name,
          volume: track.volume,
          muted: track.muted,
        }
        remembered.clips[clip.linked_visual_clip_id] = rememberClip(clip)
      }
    }
    track.clips = track.clips.filter((clip) =>
      !clip.linked_visual_clip_id || desiredIds.has(clip.linked_visual_clip_id))
  }

  let target = document.tracks.find((track) => track.id === VIDEO_AUDIO_TRACK_ID)
  if (desired.length && !target) {
    target = {
      id: VIDEO_AUDIO_TRACK_ID,
      kind: "audio",
      ...remembered.track,
      clips: [],
    }
    document.tracks.unshift(target)
  }

  for (const { clip: visualClip, asset } of desired) {
    const current = existing.get(visualClip.id)
    if (!current) {
      target!.clips.push(linkedClip(
        asset, visualClip, remembered.clips[visualClip.id]))
      continue
    }
    current.asset_id = asset.id
    current.asset_version_id = Number(asset.version_id) || null
    current.duration_ms = visualClip.duration_ms
    current.source_offset_ms = visualClip.source_offset_ms
    current.anchor = { kind: "absolute", position_ms: visualClip.start_ms }
    current.loop = false
  }

  if (target?.clips.length) {
    remembered.track = {
      name: target.name,
      volume: target.volume,
      muted: target.muted,
    }
    for (const clip of target.clips) {
      if (clip.linked_visual_clip_id)
        remembered.clips[clip.linked_visual_clip_id] = rememberClip(clip)
    }
  }
  document.tracks = document.tracks.filter((track) =>
    track.id !== VIDEO_AUDIO_TRACK_ID || track.clips.length > 0)
  if (Object.keys(remembered.clips).length)
    document.linked_visual_audio_settings = remembered
  return {
    changed: JSON.stringify(document) !== JSON.stringify(source),
    document,
  }
}

export function videoHasEmbeddedAudio(asset?: VentureAsset) {
  return hasEmbeddedAudio(asset)
}
