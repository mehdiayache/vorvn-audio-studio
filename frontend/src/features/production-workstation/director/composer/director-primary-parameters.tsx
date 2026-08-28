import type { VentureAsset } from "@/types/domain"
import { DirectorAssetListEditor } from "./director-asset-list-editor"
import type { DirectorOperationCapability, DirectorParameterValues } from "./director-composer-config"
import { DirectorScalarParameter, DirectorShotEditor, directorParameterIsVisible } from "./director-parameter-editor"

export function DirectorPrimaryParameters({ capability, values, assets, onChange }: {
  capability: DirectorOperationCapability
  values: DirectorParameterValues
  assets: VentureAsset[]
  onChange: (key: string, value: unknown) => void
}) {
  const fields = capability.parameters.filter(
    (field) => field.exposure === "primary" && directorParameterIsVisible(field, values),
  )
  if (!fields.length) return null
  return <div className="director-primary-parameters">
    {fields.map((field) => field.type === "structured_shots"
      ? <DirectorShotEditor key={field.key} field={field} value={values[field.key]} onChange={(value) => onChange(field.key, value)} />
      : field.type === "asset_list"
        ? <DirectorAssetListEditor key={field.key} field={field} value={values[field.key]} assets={assets} onChange={(value) => onChange(field.key, value)} />
        : <DirectorScalarParameter key={field.key} field={field} value={values[field.key]} onChange={(value) => onChange(field.key, value)} />)}
  </div>
}
