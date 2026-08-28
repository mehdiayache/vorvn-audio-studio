import { Plus, Trash2, X } from "lucide-react"

import { OperatorIconButton } from "@/components/operator-action"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { VentureAsset } from "@/types/domain"
import { visualAssetName } from "../director-assets"
import type { DirectorParameterCapability } from "./director-composer-config"

type AssetListItem = {
  name: string
  description: string
  variant: string
  asset_ids: number[]
  audio_asset_ids: number[]
  start_time_ms?: number
  end_time_ms?: number
}

type AssetVariant = {
  id: string
  label: string
  media_types: string[]
  min_assets: number
  max_assets: number
  trim?: {
    start_default: number
    end_default: number
    duration_min: number
    duration_max: number
  }
}

function assetLabel(asset: VentureAsset) {
  const seconds = asset.duration_ms ? ` · ${Math.round(asset.duration_ms / 100) / 10}s` : ""
  return `${visualAssetName(asset)}${seconds}`
}

function AssetPicker({ label, assets, selected, maximum, onChange }: {
  label: string
  assets: VentureAsset[]
  selected: number[]
  maximum: number
  onChange: (value: number[]) => void
}) {
  const available = assets.filter((asset) => !selected.includes(asset.id))
  return <div className="director-subject-assets">
    <span>{label}</span>
    {selected.length > 0 && <div className="director-subject-asset-list">{selected.map((assetId) => {
      const asset = assets.find(({ id }) => id === assetId)
      return <span className="director-subject-asset" key={assetId}>{asset ? assetLabel(asset) : `Asset ${assetId}`}<OperatorIconButton type="button" label={`Remove ${asset ? visualAssetName(asset) : "Asset"}`} size="icon-xs" onClick={() => onChange(selected.filter((id) => id !== assetId))}><X /></OperatorIconButton></span>
    })}</div>}
    {selected.length < maximum && available.length > 0 && <Select value="" onValueChange={(value) => onChange([...selected, Number(value)])}>
      <SelectTrigger className="w-full"><SelectValue placeholder={`Choose ${label.toLowerCase()}`} /></SelectTrigger>
      <SelectContent><SelectGroup>{available.map((asset) => <SelectItem key={asset.id} value={String(asset.id)}>{assetLabel(asset)}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>}
    {selected.length < maximum && available.length === 0 && <span className="director-subject-unavailable">No compatible Asset is available in this Production.</span>}
  </div>
}

export function DirectorAssetListEditor({ field, value, assets, onChange }: {
  field: DirectorParameterCapability
  value: unknown
  assets: VentureAsset[]
  onChange: (value: AssetListItem[]) => void
}) {
  const items = Array.isArray(value) ? value as AssetListItem[] : []
  const variants = (Array.isArray(field.item.variants) ? field.item.variants : []) as AssetVariant[]
  const audio = (field.item.audio || {}) as { media_types?: string[]; max_assets?: number }
  const maximum = Number(field.max || 0)
  const update = (index: number, changes: Partial<AssetListItem>) => onChange(items.map((item, current) => current === index ? { ...item, ...changes } : item))
  const add = () => {
    const variant = variants[0]
    if (!variant) return
    onChange([...items, {
      name: `subject_${items.length + 1}`,
      description: "",
      variant: variant.id,
      asset_ids: [],
      audio_asset_ids: [],
      ...(variant.trim ? { start_time_ms: variant.trim.start_default, end_time_ms: variant.trim.end_default } : {}),
    }])
  }
  return <section className="director-subject-editor">
    <header><span>{field.label}</span><Button type="button" variant="outline" size="sm" disabled={Boolean(maximum && items.length >= maximum)} onClick={add}><Plus /> Add subject</Button></header>
    {items.map((item, index) => {
      const variant = variants.find(({ id }) => id === item.variant) || variants[0]
      if (!variant) return null
      const compatible = assets.filter((asset) => variant.media_types.includes(String(asset.media_type)))
      const audioAssets = assets.filter((asset) => audio.media_types?.includes(String(asset.media_type)))
      return <div className="director-subject" key={`${item.name}-${index}`}>
        <div className="director-subject-heading">
          <span>Subject {index + 1}</span>
          <OperatorIconButton type="button" label={`Remove subject ${index + 1}`} detail="Removes this subject reference from the generation." size="icon-xs" onClick={() => onChange(items.filter((_, current) => current !== index))}><Trash2 /></OperatorIconButton>
        </div>
        <div className="director-subject-grid">
          <label><span>Reference type</span><Select value={variant.id} onValueChange={(next) => {
            const selected = variants.find(({ id }) => id === next)
            update(index, { variant: next, asset_ids: [], ...(selected?.trim ? { start_time_ms: selected.trim.start_default, end_time_ms: selected.trim.end_default } : { start_time_ms: undefined, end_time_ms: undefined }) })
          }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{variants.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectGroup></SelectContent></Select></label>
          <label><span>Prompt name</span><Input maxLength={Number(field.item.name_max_length || 64)} value={item.name} onChange={(event) => update(index, { name: event.target.value.replace(/^@/, "") })} /></label>
        </div>
        <label><span>Description{field.item.description_required ? "" : " (optional)"}</span><Input required={Boolean(field.item.description_required)} maxLength={Number(field.item.description_max_length || 300)} value={item.description} onChange={(event) => update(index, { description: event.target.value })} /></label>
        <AssetPicker label={variant.label} assets={compatible} selected={item.asset_ids || []} maximum={variant.max_assets} onChange={(asset_ids) => update(index, { asset_ids })} />
        {variant.trim && <div className="director-subject-grid">
          <label><span>Starts at (ms)</span><Input type="number" min={0} step={100} value={item.start_time_ms ?? variant.trim.start_default} onChange={(event) => update(index, { start_time_ms: Number(event.target.value) })} /></label>
          <label><span>Ends at (ms)</span><Input type="number" min={variant.trim.duration_min} step={100} value={item.end_time_ms ?? variant.trim.end_default} onChange={(event) => update(index, { end_time_ms: Number(event.target.value) })} /></label>
        </div>}
        {Number(audio.max_assets || 0) > 0 && <AssetPicker label="Reference audio" assets={audioAssets} selected={item.audio_asset_ids || []} maximum={Number(audio.max_assets)} onChange={(audio_asset_ids) => update(index, { audio_asset_ids })} />}
      </div>
    })}
    {items.length === 0 && <p className="director-subject-empty">Optional. Add a named subject, then reference it in the direction with <code>@subject_name</code>.</p>}
  </section>
}
