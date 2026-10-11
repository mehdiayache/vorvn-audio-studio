import { Image as ImageIcon } from "lucide-react"
import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"
import { useStudioPreviewGestures } from "@/components/studio-timeline/use-studio-preview-gestures"

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

  const movePreview = useStudioPreviewGestures({
    selection,
    active: active.some(item => item.track.id === selection?.trackId && item.clip.id === selection?.clipId),
    editable: Boolean(session),
    revisionKey: `${document.canvas.width}:${document.canvas.height}`,
    onBegin: () => session?.beginGesture(),
    onPreview: (ref, transform) => session?.previewClipTransform(ref, { position_x: (transform.positionX - .5) * document.canvas.width, position_y: (transform.positionY - .5) * document.canvas.height }),
    onCommit: () => session?.commitGesture(),
    onCancel: () => session?.cancelGesture(),
    onError: reason => session?.reportError(reason instanceof Error ? reason.message : "The visual placement could not be saved."),
  })
  function moveSelected(event: ReactPointerEvent, ref: VisualClipRef, clip: VisualSceneClip) {
    movePreview(event, ref, { positionX: .5 + clip.position_x / document.canvas.width, positionY: .5 + clip.position_y / document.canvas.height }, event.currentTarget.parentElement, clip.locked || Boolean(document.tracks.find(track => track.id === ref.trackId)?.locked))
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
