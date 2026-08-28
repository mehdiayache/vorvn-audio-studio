import type { VentureAsset } from "@/types/domain"
import { DirectorAssetListEditor } from "./director-asset-list-editor"
import type { DirectorAdvancedValues } from "./director-advanced-settings"
import { withParameterValue, type DirectorOperationCapability } from "./director-composer-config"
import { DirectorScalarParameter, DirectorShotEditor, directorParameterIsVisible } from "./director-parameter-editor"

export function DirectorPrimaryControls({ capability, values, assets, onChange }: {
  capability: DirectorOperationCapability
  values: DirectorAdvancedValues
  assets: VentureAsset[]
  onChange: (values: DirectorAdvancedValues) => void
}) {
  const fields = capability.parameters.filter((field) => field.exposure === "primary" && directorParameterIsVisible(field, values.parameters))
  if (!fields.length) return null
  const setParameter = (key: string, value: unknown) => {
    const field = capability.parameters.find((candidate) => candidate.key === key)
    if (field) onChange({ ...values, parameters: withParameterValue(field, values.parameters, value) })
  }
  const quick = fields.filter(({ type }) => type !== "asset_list" && type !== "structured_shots")
  const creative = fields.filter(({ type }) => type === "asset_list" || type === "structured_shots")
  return <div className="director-primary-controls" aria-label="Creative controls">
    {quick.length > 0 && <div className="director-primary-options">{quick.map((field) => <DirectorScalarParameter key={field.key} field={field} value={values.parameters[field.key]} onChange={(value) => setParameter(field.key, value)} />)}</div>}
    {creative.map((field) => field.type === "structured_shots"
      ? <DirectorShotEditor key={field.key} field={field} value={values.parameters[field.key]} onChange={(value) => setParameter(field.key, value)} />
      : <DirectorAssetListEditor key={field.key} field={field} value={values.parameters[field.key]} assets={assets} onChange={(value) => setParameter(field.key, value)} />)}
  </div>
}
