import type { ReactNode } from "react"
import { ChevronLeft, ChevronRight, Image as ImageIcon, LocateFixed, Magnet, Maximize2, Minus, Plus, Redo2, Undo2, Waves } from "lucide-react"

import { OperatorIconButton } from "./operator-action"
import { OperatorTooltip } from "./operator-tooltip"
import { Button } from "./ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "./ui/dropdown-menu"
import { Slider } from "./ui/slider"
import "./studio-timeline-controls.css"

export type StudioTimelineLocale = "en" | "fr" | "ar" | "id"
const labels = {
  en: { timeline: "Timeline", commands: "Timeline command bar", editing: "Timeline editing tools", inserts: "Timeline insert actions", undo: "Undo edit", redo: "Redo edit", undoHelp: "Undo the latest composition edit.", redoHelp: "Restore the composition edit you undid.", previous: "Previous view", next: "Next view", previousHelp: "Move one view earlier", nextHelp: "Move one view later", snapOff: "Turn snapping off", snapOn: "Turn snapping on", snapHelp: "Align clip edges to the playhead, Script Parts, and other clip edges. Hold Alt while dragging to bypass it temporarily.", follow: "Follow", followHelp: "Keep the playhead visible during playback", saving: "Saving…", add: "Add to Timeline", place: "Place media at playhead", visual: "Image or video", audio: "Audio", views: "Timeline view controls", out: "Zoom out", in: "Zoom in", zoom: "Timeline zoom", fit: "Fit", fitLabel: "Fit entire timeline", fitHelp: "Fit the entire composition in view", unit: "pixels per second" },
  fr: { timeline: "Timeline", commands: "Barre de commandes de la Timeline", editing: "Outils de montage", inserts: "Ajout de médias", undo: "Annuler la modification", redo: "Rétablir la modification", undoHelp: "Annuler la dernière modification de la composition.", redoHelp: "Rétablir la modification annulée.", previous: "Vue précédente", next: "Vue suivante", previousHelp: "Afficher la vue précédente", nextHelp: "Afficher la vue suivante", snapOff: "Désactiver le magnétisme", snapOn: "Activer le magnétisme", snapHelp: "Aligner les clips sur la tête de lecture, les parties du Script et les autres clips. Maintenir Alt pendant le déplacement pour le désactiver temporairement.", follow: "Suivre", followHelp: "Garder la tête de lecture visible", saving: "Enregistrement…", add: "Ajouter à la Timeline", place: "Placer à la tête de lecture", visual: "Image ou vidéo", audio: "Audio", views: "Contrôles de vue", out: "Zoom arrière", in: "Zoom avant", zoom: "Zoom de la Timeline", fit: "Ajuster", fitLabel: "Afficher toute la Timeline", fitHelp: "Afficher la composition entière", unit: "pixels par seconde" },
  ar: { timeline: "المخطط الزمني", commands: "شريط أدوات المخطط الزمني", editing: "أدوات التحرير", inserts: "إضافة الوسائط", undo: "تراجع عن التعديل", redo: "إعادة التعديل", undoHelp: "التراجع عن آخر تعديل في التركيب.", redoHelp: "إعادة التعديل الذي تم التراجع عنه.", previous: "العرض السابق", next: "العرض التالي", previousHelp: "الانتقال إلى العرض السابق", nextHelp: "الانتقال إلى العرض التالي", snapOff: "إيقاف المحاذاة", snapOn: "تشغيل المحاذاة", snapHelp: "محاذاة حواف المقاطع مع موضع التشغيل وأجزاء النص والمقاطع الأخرى. اضغط Alt أثناء السحب لتجاوز المحاذاة مؤقتًا.", follow: "متابعة", followHelp: "إبقاء موضع التشغيل ظاهرًا", saving: "جارٍ الحفظ…", add: "إضافة إلى المخطط الزمني", place: "وضع الوسائط عند موضع التشغيل", visual: "صورة أو فيديو", audio: "صوت", views: "عناصر التحكم في العرض", out: "تصغير", in: "تكبير", zoom: "تكبير المخطط الزمني", fit: "ملاءمة", fitLabel: "عرض المخطط الزمني بالكامل", fitHelp: "عرض التركيب بالكامل", unit: "بكسل في الثانية" },
  id: { timeline: "Timeline", commands: "Bilah perintah Timeline", editing: "Alat pengeditan Timeline", inserts: "Tambahkan media", undo: "Urungkan edit", redo: "Ulangi edit", undoHelp: "Urungkan edit komposisi terakhir.", redoHelp: "Pulihkan edit yang diurungkan.", previous: "Tampilan sebelumnya", next: "Tampilan berikutnya", previousHelp: "Pindah ke tampilan sebelumnya", nextHelp: "Pindah ke tampilan berikutnya", snapOff: "Matikan penempelan", snapOn: "Aktifkan penempelan", snapHelp: "Sejajarkan tepi klip ke posisi pemutaran, bagian Script, dan klip lain. Tahan Alt saat menyeret untuk melewatinya sementara.", follow: "Ikuti", followHelp: "Jaga posisi pemutaran tetap terlihat", saving: "Menyimpan…", add: "Tambahkan ke Timeline", place: "Tempatkan media di posisi pemutaran", visual: "Gambar atau video", audio: "Audio", views: "Kontrol tampilan Timeline", out: "Perkecil", in: "Perbesar", zoom: "Zoom Timeline", fit: "Sesuaikan", fitLabel: "Tampilkan seluruh Timeline", fitHelp: "Tampilkan seluruh komposisi", unit: "piksel per detik" },
} satisfies Record<StudioTimelineLocale, Record<string, string>>

/** The actual Studio command bar; the host owns editing and navigation state. */
export function StudioTimelineToolbar({ canUndo, canRedo, disabled = false, saving = false, snapping, followPlayhead, onUndo, onRedo, onMoveView, onSnappingChange, onFollowPlayheadChange, onAddVisual, onAddAudio, extraTools, locale = "en", undoLabel, redoLabel }: {
  canUndo: boolean; canRedo: boolean; disabled?: boolean; saving?: boolean
  snapping: boolean; followPlayhead: boolean
  onUndo: () => void; onRedo: () => void; onMoveView: (direction: -1 | 1) => void
  onSnappingChange: (enabled: boolean) => void; onFollowPlayheadChange: (enabled: boolean) => void
  onAddVisual?: () => void; onAddAudio?: () => void; extraTools?: ReactNode
  locale?: StudioTimelineLocale; undoLabel?: string; redoLabel?: string
}) {
  const c = labels[locale]
  const editingDisabled = disabled || saving
  return <div className="studio-timeline-toolbar timeline-command-bar" aria-label={c.commands}>
    <div className="timeline-editing-tools" aria-label={c.editing}>
      <span className="sound-scene-toolbar-title"><b>{c.timeline}</b></span>
      <div className="sound-scene-history">
        <OperatorIconButton label={undoLabel || c.undo} detail={c.undoHelp} disabled={!canUndo || editingDisabled} onClick={onUndo}><Undo2 /></OperatorIconButton>
        <OperatorIconButton label={redoLabel || c.redo} detail={c.redoHelp} disabled={!canRedo || editingDisabled} onClick={onRedo}><Redo2 /></OperatorIconButton>
      </div>
      <div className="sound-scene-viewport-tools">
        <OperatorTooltip label={c.previousHelp}><Button variant="ghost" size="icon-sm" aria-label={c.previous} onClick={() => onMoveView(-1)}><ChevronLeft /></Button></OperatorTooltip>
        <OperatorTooltip label={c.nextHelp}><Button variant="ghost" size="icon-sm" aria-label={c.next} onClick={() => onMoveView(1)}><ChevronRight /></Button></OperatorTooltip>
        <OperatorTooltip label={snapping ? c.snapOff : c.snapOn} detail={c.snapHelp}><Button variant="ghost" size="icon-sm" className={snapping ? "is-active" : undefined} aria-label={snapping ? c.snapOff : c.snapOn} aria-pressed={snapping} onClick={() => onSnappingChange(!snapping)}><Magnet /></Button></OperatorTooltip>
        <OperatorTooltip label={c.followHelp}><Button variant="ghost" size="sm" className={followPlayhead ? "is-active" : undefined} aria-pressed={followPlayhead} onClick={() => onFollowPlayheadChange(!followPlayhead)}><LocateFixed /><span>{c.follow}</span></Button></OperatorTooltip>
      </div>
    </div>
    <div className="timeline-insert-actions" aria-label={c.inserts}>
      <span className="sound-scene-save-state" role="status">{saving && <b>{c.saving}</b>}</span>
      {extraTools}
      {(onAddAudio || onAddVisual) && <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="outline" size="sm" disabled={editingDisabled}><Plus data-icon="inline-start" />{c.add}</Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="sound-scene-add-menu">
          <DropdownMenuLabel>{c.place}</DropdownMenuLabel>
          <DropdownMenuGroup>
            {onAddVisual && <DropdownMenuItem onSelect={onAddVisual}><ImageIcon />{c.visual}</DropdownMenuItem>}
            {onAddAudio && <DropdownMenuItem onSelect={onAddAudio}><Waves />{c.audio}</DropdownMenuItem>}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>}
    </div>
  </div>
}

/** Continuous zoom uses a logarithmic scale so both long and short edits remain reachable.
 * Historical hosts can supply their actual levels to retain indexed zoom exactly. */
export function StudioTimelineZoom({ pixelsPerSecond, min = .001, max = 200, onChange, onFit, locale = "en", className = "", zoomSteps }: {
  pixelsPerSecond: number; min?: number; max?: number
  onChange: (value: number) => void; onFit: () => void
  locale?: StudioTimelineLocale; className?: string; zoomSteps?: readonly number[]
}) {
  const c = labels[locale]
  const lower = Number.isFinite(min) && min > 0 ? min : .001
  const upper = Number.isFinite(max) && max > lower ? max : Math.max(200, lower * 2)
  const steps = zoomSteps?.filter(value => Number.isFinite(value) && value > 0)
  const discrete = steps && steps.length > 1 ? steps : null
  const value = Math.max(lower, Math.min(upper, Number.isFinite(pixelsPerSecond) ? pixelsPerSecond : lower))
  const sliderMaximum = discrete ? discrete.length - 1 : 1_000
  const sliderValue = discrete
    ? discrete.reduce((best, candidate, index) => Math.abs(candidate - pixelsPerSecond) < Math.abs(discrete[best]! - pixelsPerSecond) ? index : best, 0)
    : Math.round(Math.log(value / lower) / Math.log(upper / lower) * sliderMaximum)
  const update = (next: number) => {
    const bounded = Math.max(0, Math.min(sliderMaximum, next))
    onChange(discrete ? discrete[Math.round(bounded)]! : lower * (upper / lower) ** (bounded / sliderMaximum))
  }
  return <div className={`studio-timeline-zoom-dock sound-scene-zoom-dock ${className}`} aria-label={c.views}>
    <div className="sound-scene-zoom">
      <OperatorTooltip label={c.out} disabledTrigger={sliderValue === 0}><Button variant="ghost" size="icon-sm" disabled={sliderValue === 0} onClick={() => update(sliderValue - (discrete ? 1 : 50))} aria-label={c.out}><Minus /></Button></OperatorTooltip>
      <Slider aria-label={c.zoom} aria-valuetext={`${Number(pixelsPerSecond.toPrecision(4))} ${c.unit}`} value={[sliderValue]} min={0} max={sliderMaximum} step={1} onValueChange={([next = sliderValue]) => update(next)} />
      <OperatorTooltip label={c.in} disabledTrigger={sliderValue === sliderMaximum}><Button variant="ghost" size="icon-sm" disabled={sliderValue === sliderMaximum} onClick={() => update(sliderValue + (discrete ? 1 : 50))} aria-label={c.in}><Plus /></Button></OperatorTooltip>
    </div>
    <OperatorTooltip label={c.fitHelp}><Button variant="ghost" size="sm" onClick={onFit} aria-label={c.fitLabel}><Maximize2 /><span>{c.fit}</span></Button></OperatorTooltip>
  </div>
}
