import type { WorkspaceFile } from "@/types/domain"
import type { CreatorContext } from "@/lib/api"
import { MediaFileListEditor } from "./media-file-list-editor"
import type { MediaOperationCapability, MediaParameterValues } from "./media-creator-config"
import { MediaScalarParameter, MediaShotEditor, mediaParameterIsVisible } from "./media-parameter-editor"

export function MediaPrimaryParameters({ context, modelId, operation, capability, values, files, onChange }: {
  context: CreatorContext
  modelId: string
  operation: string
  capability: MediaOperationCapability
  values: MediaParameterValues
  files: WorkspaceFile[]
  onChange: (key: string, value: unknown) => void
}) {
  const fields = capability.parameters.filter(
    (field) => field.exposure === "primary" && mediaParameterIsVisible(field, values),
  )
  if (!fields.length) return null
  return <div className="media-primary-parameters">
    {fields.map((field) => field.type === "structured_shots"
      ? <MediaShotEditor key={field.key} field={field} value={values[field.key]} onChange={(value) => onChange(field.key, value)} />
      : field.type === "file_list"
        ? <MediaFileListEditor key={field.key} context={context} modelId={modelId} operation={operation} field={field} value={values[field.key]} files={files} onChange={(value) => onChange(field.key, value)} />
        : <MediaScalarParameter key={field.key} field={field} value={values[field.key]} onChange={(value) => onChange(field.key, value)} />)}
  </div>
}
