import { Image as ImageIcon } from "lucide-react"
import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"

import type { WorkspaceFile, VisualSceneDocument } from "@/types/domain"
import { visualFileName, visualFilePlaybackUrl, visualFilePosterUrl, visualFileUrl } from "@/features/files/file-presentation"
import type { VisualSceneClip } from "@/types/domain"
import type { VisualClipRef, VisualSceneSession } from "@/features/visual-scene/engine/visual-scene-session"

export function visualLayerStyle(clip: VisualSceneClip, document: VisualSceneDocument, zIndex: number): CSSProperties {
  const horizontal = clip.flip_horizontal ? -clip.scale : clip.scale
  const vertical = clip.flip_vertical ? -clip.scale : clip.scale
  return {
    zIndex,
    objectFit: clip.fit,
    opacity: clip.opacity,
    transform: `translate(${clip.position_x / document.canvas.width * 100}%, ${clip.position_y / document.canvas.height * 100}%) rotate(${clip.rotation_degrees || 0}deg) scale(${horizontal}, ${vertical})`,
    transformOrigin: "center center",
  }
}

function VideoLayer({ file, clip, playheadMs, playing, style, selected = false, onPointerDown }: {
  file: WorkspaceFile
  clip: VisualSceneClip
  playheadMs: number
  playing: boolean
  style: CSSProperties
  selected?: boolean
  onPointerDown?: (event: ReactPointerEvent) => void
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const localSeconds = Math.max(0, (playheadMs - clip.start_ms + clip.source_offset_ms) / 1_000)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (!playing) {
      node.pause()
      if (node.readyState >= 1 && Math.abs(node.currentTime - localSeconds) > .04) {
        try { node.currentTime = localSeconds } catch { /* metadata will retry */ }
      }
      return
    }
    if (node.readyState >= 1 && (node.paused || Math.abs(node.currentTime - localSeconds) > .12)) {
      try { node.currentTime = localSeconds } catch { /* metadata will retry */ }
    }
    if (node.paused) void node.play().catch(() => undefined)
  }, [localSeconds, playing])
  return <video ref={ref} src={visualFilePlaybackUrl(file)} poster={visualFilePosterUrl(file)} style={style} data-selected={selected ? "true" : undefined} muted playsInline preload="metadata" aria-label={visualFileName(file)} onPointerDown={onPointerDown} onLoadedMetadata={() => {
    const node = ref.current
    if (!node) return
    try { node.currentTime = localSeconds } catch { /* source is not seekable yet */ }
    if (playing) void node.play().catch(() => undefined)
  }} />
}

export function VisualSceneMonitor({ document, files, playheadMs, playback, selection = null, session }: { document: VisualSceneDocument; files: WorkspaceFile[]; playheadMs: number; playback: "idle" | "preparing" | "playing"; selection?: VisualClipRef | null; session?: VisualSceneSession }) {
  const byId = new Map(files.map((file) => [file.id, file]))
  const active = document.tracks.flatMap((track, index) => track.visible ? track.clips.flatMap((clip) => {
    const file = byId.get(clip.file_id)
    return file && (file.media_type === "image" || file.media_type === "video") && playheadMs >= clip.start_ms && playheadMs < clip.start_ms + clip.duration_ms
      ? [{ track, clip, file, index }] : []
  }) : [])
  const frameStyle = {
    aspectRatio: `${document.canvas.width} / ${document.canvas.height}`,
    "--visual-scene-aspect": document.canvas.width / document.canvas.height,
  } as CSSProperties

  function moveSelected(event: ReactPointerEvent, ref: VisualClipRef, clip: VisualSceneClip) {
    if (!session || !selection || selection.trackId !== ref.trackId || selection.clipId !== ref.clipId || clip.locked || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const frame = event.currentTarget.parentElement
    if (!frame) return
    const rect = frame.getBoundingClientRect()
    const startX = event.clientX
    const startY = event.clientY
    const originalX = clip.position_x
    const originalY = clip.position_y
    let started = false
    const move = (next: PointerEvent) => {
      if (!started && Math.hypot(next.clientX - startX, next.clientY - startY) < 3) return
      if (!started) { started = true; session.beginGesture() }
      session.previewClipTransform(ref, {
        position_x: originalX + (next.clientX - startX) * document.canvas.width / rect.width,
        position_y: originalY + (next.clientY - startY) * document.canvas.height / rect.height,
      })
    }
    const cleanup = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", finish)
      window.removeEventListener("pointercancel", cancel)
    }
    const finish = () => { cleanup(); if (started) void session.commitGesture() }
    const cancel = () => { cleanup(); if (started) session.cancelGesture() }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", finish, { once: true })
    window.addEventListener("pointercancel", cancel, { once: true })
  }

  return <section className="visual-scene-monitor" aria-label="Visual monitor">
    <div className="visual-scene-monitor-frame" data-orientation={document.canvas.width < document.canvas.height ? "portrait" : "landscape"} style={frameStyle}>
      {active.length ? active.map(({ track, clip, file, index }) => {
        const ref = { trackId: track.id, clipId: clip.id }
        const selected = selection?.trackId === track.id && selection.clipId === clip.id
        const style = visualLayerStyle(clip, document, document.tracks.length - index)
        return file.media_type === "video"
          ? <VideoLayer key={clip.id} file={file} clip={clip} playheadMs={playheadMs} playing={playback === "playing"} style={style} selected={selected} onPointerDown={selected ? (event) => moveSelected(event, ref, clip) : undefined} />
          : <img key={clip.id} src={visualFileUrl(file)} alt={visualFileName(file)} style={style} data-selected={selected ? "true" : undefined} onPointerDown={selected ? (event) => moveSelected(event, ref, clip) : undefined} />
      })
        : <span><ImageIcon /><b>No media at the playhead</b><small>Add media or move the playhead over an image or video.</small></span>}
    </div>
  </section>
}
