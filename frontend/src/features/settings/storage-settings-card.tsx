import { Cloud } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { ActionButton } from "@/components/operator-action"
import { Input } from "@/components/ui/input"
import { studioApi } from "@/lib/api"
import { useAsyncAction } from "@/hooks/use-async-action"
import type { SettingsSnapshot } from "@/types/domain"

export function StorageSettingsCard({ settings, onUpdated }: { settings: SettingsSnapshot; onUpdated: (next: SettingsSnapshot) => void }) {
  const initial = useMemo(() => settings.storage_settings, [settings.storage_settings])
  const [values, setValues] = useState(() => ({ endpoint: String(initial.endpoint || ""), bucket: String(initial.bucket || ""), prefix: String(initial.prefix || "text-to-voice"), region: String(initial.region || "us-east-1"), access_key: "", secret_key: "" }))
  const actions = useAsyncAction<"save" | "test">()
  const field = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) => setValues((current) => ({ ...current, [key]: event.target.value }))
  const save = () => actions.run("save", async () => { try { onUpdated(await studioApi.updateStorageSettings(values)); setValues((current) => ({ ...current, access_key: "", secret_key: "" })); toast.success("Reference storage saved.") } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Storage could not be saved.") } })
  const test = () => actions.run("test", async () => { try { const status = await studioApi.testStorage(); if (status.configured) toast.success("Storage is reachable."); else toast.error(String(status.reason || "Storage is not ready.")) } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Storage test failed.") } })
  return <section className="settings-card settings-wide"><header><Cloud /><div><h2>Reference audio storage</h2><p>Private S3-compatible storage used only when Alibaba must fetch an upload, such as voice references and external subtitles. Files are never made public.</p></div></header><div className="settings-form-grid"><label className="settings-span"><span>Endpoint</span><Input value={values.endpoint} onChange={field("endpoint")} placeholder="https://storage.example.com" /></label><label><span>Bucket</span><Input value={values.bucket} onChange={field("bucket")} /></label><label><span>Signing region</span><Input value={values.region} onChange={field("region")} /></label><label><span>Folder prefix</span><Input value={values.prefix} onChange={field("prefix")} /></label><label><span>Access key</span><Input type="password" value={values.access_key} onChange={field("access_key")} placeholder={initial.access_key_configured ? "Configured — leave blank to keep" : "Required"} /></label><label><span>Secret key</span><Input type="password" value={values.secret_key} onChange={field("secret_key")} placeholder={initial.secret_key_configured ? "Configured — leave blank to keep" : "Required"} /></label></div><div className="settings-card-actions"><ActionButton variant="outline" busy={actions.isPending("save")} busyLabel="Saving storage…" disabled={actions.busy} onClick={() => void save()}>Save storage</ActionButton><ActionButton variant="outline" busy={actions.isPending("test")} busyLabel="Testing connection…" disabled={actions.busy} onClick={() => void test()}>Test connection</ActionButton></div></section>
}
