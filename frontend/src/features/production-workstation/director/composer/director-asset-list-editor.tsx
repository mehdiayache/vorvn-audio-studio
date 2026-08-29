import { useEffect, useMemo, useState } from "react"
import { Plus, Trash2, X } from "lucide-react"

import { OperatorIconButton } from "@/components/operator-action"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { studioApi, type DirectorCompatibilityResult } from "@/lib/api"
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

function AssetPicker({ label, assets, selected, minimum, maximum, checking, unknownCount = 0, error, onChange }: {
  label: string
  assets: VentureAsset[]
  selected: number[]
  minimum: number
  maximum: number
  checking?: boolean
  unknownCount?: number
  error?: string
  onChange: (value: number[]) => void
}) {
  const available = assets.filter((asset) => !selected.includes(asset.id))
  const missing = Math.max(0, minimum - selected.length)
  return <div className="director-subject-assets">
    <div className="director-subject-assets-heading"><span>{label}</span><span>{selected.length}/{maximum}</span></div>
    {selected.length > 0 && <div className="director-subject-asset-list">{selected.map((assetId) => {
      const asset = assets.find(({ id }) => id === assetId)
      return <span className="director-subject-asset" key={assetId}>{asset ? assetLabel(asset) : `Media ${assetId}`}<OperatorIconButton type="button" label={`Remove ${asset ? visualAssetName(asset) : "media"} from subject`} size="icon-xs" onClick={() => onChange(selected.filter((id) => id !== assetId))}><X /></OperatorIconButton></span>
    })}</div>}
    {selected.length < maximum && available.length > 0 && <Select value="" onValueChange={(value) => onChange([...selected, Number(value)])}>
      <SelectTrigger className="w-full" aria-label={`Choose ${label.toLowerCase()}`}><SelectValue placeholder={`Choose ${label.toLowerCase()}`} /></SelectTrigger>
      <SelectContent><SelectGroup>{available.map((asset) => <SelectItem key={asset.id} value={String(asset.id)}>{assetLabel(asset)}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>}
    {selected.length < maximum && available.length === 0 && <span className="director-subject-unavailable">{checking ? "Checking compatible media…" : error || "No compatible media is available in this Production."}</span>}
    {!checking && !error && unknownCount > 0 && <span className="director-subject-unavailable">{unknownCount} {unknownCount === 1 ? "item needs" : "items need"} technical metadata before use.</span>}
    {missing > 0 && <p className="director-subject-requirement" role="status">Add {missing} more {missing === 1 ? "reference" : "references"}. This subject requires {minimum === maximum ? minimum : `${minimum}–${maximum}`}.</p>}
  </div>
}

export function DirectorAssetListEditor({ productionId, modelId, operation, field, value, assets, onChange }: {
  productionId: number
  modelId: string
  operation: string
  field: DirectorParameterCapability
  value: unknown
  assets: VentureAsset[]
  onChange: (value: AssetListItem[]) => void
}) {
  const items = Array.isArray(value) ? value as AssetListItem[] : []
  const variants = (Array.isArray(field.item.variants) ? field.item.variants : []) as AssetVariant[]
  const audio = (field.item.audio || {}) as { media_types?: string[]; max_assets?: number }
  const maximum = Number(field.max || 0)
  const assetIds = useMemo(() => assets.map(({ id }) => id), [assets])
  const assetIdsKey = assetIds.join(",")
  const [checking, setChecking] = useState(false)
  const [compatibilityError, setCompatibilityError] = useState("")
  const [compatibility, setCompatibility] = useState(new Map<string, Map<number, DirectorCompatibilityResult>>())

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const targets = [
      ...variants.map(({ id }) => ({ key: `variant:${id}`, target: { parameter_key: field.key, variant_id: id } as const })),
      ...(Number(audio.max_assets || 0) > 0 ? [{ key: "audio", target: { parameter_key: field.key, audio: true } as const }] : []),
    ]
    setCompatibility(new Map())
    setCompatibilityError("")
    if (!assetIds.length || !targets.length) {
      setChecking(false)
      return () => controller.abort()
    }
    setChecking(true)
    void Promise.all(targets.map(async ({ key, target }) => {
      const results = await studioApi.directorInputCompatibility(productionId, {
        model_id: modelId,
        operation,
        ...target,
        asset_ids: assetIds,
      }, controller.signal)
      return [key, new Map(results.map((result) => [result.asset_id, result]))] as const
    })).then((results) => {
      if (active && !controller.signal.aborted) setCompatibility(new Map(results))
    }).catch((reason) => {
      if (!active || controller.signal.aborted) return
      setCompatibilityError(reason instanceof Error ? reason.message : "Compatible media could not be checked.")
    }).finally(() => {
      if (active && !controller.signal.aborted) setChecking(false)
    })
    return () => {
      active = false
      controller.abort()
    }
  // The ID signature is the request input; model and field identify the capability contract.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetIdsKey, field.key, modelId, operation, productionId])

  const compatibleAssets = (key: string) => {
    const results = compatibility.get(key)
    return assets.filter(({ id }) => results?.get(id)?.state === "compatible")
  }
  const unknownCount = (key: string) => {
    const results = compatibility.get(key)
    return assets.filter(({ id }) => results?.get(id)?.state === "unknown").length
  }
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
    <header><div><span>{field.label}</span><small>Name a subject once, then direct it with <code>@name</code>.</small></div><Button type="button" variant="outline" size="sm" disabled={Boolean(maximum && items.length >= maximum)} onClick={add}><Plus /> Add subject</Button></header>
    {items.map((item, index) => {
      const variant = variants.find(({ id }) => id === item.variant) || variants[0]
      if (!variant) return null
      const variantKey = `variant:${variant.id}`
      const compatible = compatibleAssets(variantKey)
      const audioAssets = compatibleAssets("audio")
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
        <AssetPicker label={variant.label} assets={compatible} selected={item.asset_ids || []} minimum={variant.min_assets} maximum={variant.max_assets} checking={checking} unknownCount={unknownCount(variantKey)} error={compatibilityError} onChange={(asset_ids) => update(index, { asset_ids })} />
        {variant.trim && <div className="director-subject-grid">
          <label><span>Starts at (ms)</span><Input type="number" min={0} step={100} value={item.start_time_ms ?? variant.trim.start_default} onChange={(event) => update(index, { start_time_ms: Number(event.target.value) })} /></label>
          <label><span>Ends at (ms)</span><Input type="number" min={variant.trim.duration_min} step={100} value={item.end_time_ms ?? variant.trim.end_default} onChange={(event) => update(index, { end_time_ms: Number(event.target.value) })} /></label>
        </div>}
        {Number(audio.max_assets || 0) > 0 && <AssetPicker label="Reference audio" assets={audioAssets} selected={item.audio_asset_ids || []} minimum={0} maximum={Number(audio.max_assets)} checking={checking} unknownCount={unknownCount("audio")} error={compatibilityError} onChange={(audio_asset_ids) => update(index, { audio_asset_ids })} />}
      </div>
    })}
    {items.length === 0 && <p className="director-subject-empty">Optional. Add a character, object or place only when the direction needs visual consistency.</p>}
  </section>
}
