import { FileAudio2, Plus, Settings2, Unlink, UserRound } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { useVoiceDirectory } from "@/hooks/use-voice-directory"
import { studioApi } from "@/lib/api"
import type { SeriesOverview } from "@/types/domain"
import { CreateResourceDialog } from "./create-resource-dialog"
import { ResourceManage } from "./resource-manage"
import {
  DropdownMenuItem, ProductionMenu, ProductionRow, WorkPageHeader, WorkSection,
} from "./work-primitives"
import "./work.css"

const noPreference = "__none__"

export function SeriesPage({ data, refresh }: { data: SeriesOverview; refresh: () => void }) {
  const [creating, setCreating] = useState(false)
  const [editingDefaults, setEditingDefaults] = useState(false)
  const [language, setLanguage] = useState(String(data.defaults.language || ""))
  const [voiceIdentityId, setVoiceIdentityId] = useState(String(data.defaults.voice_identity_id || ""))
  const [savingDefaults, setSavingDefaults] = useState(false)
  const voices = useVoiceDirectory()
  const series = data.resource
  const parent = { id: series.id, type: "series" as const, name: series.name }

  const identities = useMemo(
    () => (voices.directory.identities || []).filter(
      (identity) => identity.metadata.status !== "archived",
    ),
    [voices.directory.identities],
  )
  const preferredVoice = identities.find((identity) => identity.id === voiceIdentityId)

  useEffect(() => {
    if (!editingDefaults) {
      setLanguage(String(data.defaults.language || ""))
      setVoiceIdentityId(String(data.defaults.voice_identity_id || ""))
    }
  }, [data.defaults, editingDefaults])

  async function makeStandalone(id: number, name: string) {
    try {
      await studioApi.moveProduction(id, null)
      refresh()
      toast.success(`${name} is now standalone.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to move this Production.")
    }
  }

  async function saveDefaults() {
    setSavingDefaults(true)
    try {
      await studioApi.updateResource("series", series.id, {
        defaults: {
          language: language.trim(),
          voice_identity_id: voiceIdentityId,
        },
      })
      setEditingDefaults(false)
      refresh()
      toast.success("Series preferences updated.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update Series preferences.")
    } finally {
      setSavingDefaults(false)
    }
  }

  return (
    <main className="work-page">
      <WorkPageHeader
        kind="Series"
        name={series.name}
        description={series.description}
        trail={data.trail}
        metrics={data.metrics}
        actions={(
          <>
            <ResourceManage
              kind="series"
              id={series.id}
              name={series.name}
              description={series.description}
              onUpdated={refresh}
            />
            <Button onClick={() => setCreating(true)}><Plus /> New Production</Button>
          </>
        )}
      />
      <div className="work-content series-layout">
        <aside className="series-defaults">
          <span className="series-group-label">Editorial preferences</span>
          <h2>Series defaults</h2>
          <p>These can prefill who speaks and the output language. They never choose a provider route.</p>
          <dl>
            <div>
              <dt>Preferred voice</dt>
              <dd>{preferredVoice?.name || (voiceIdentityId ? "Unavailable voice" : "Not set")}</dd>
            </div>
            <div>
              <dt>Output language</dt>
              <dd>{language || "Not set"}</dd>
            </div>
          </dl>
          <Button
            variant="outline"
            className="series-defaults-edit"
            onClick={() => setEditingDefaults(true)}
          >
            <Settings2 /> Edit preferences
          </Button>
        </aside>
        <WorkSection title="Productions">
          {data.productions.length ? (
            <div className="production-summary-list">
              {data.productions.map((production, index) => (
                <div className="series-production-item" key={production.id}>
                  <span className="series-order">{String(index + 1).padStart(2, "0")}</span>
                  <ProductionRow
                    production={production}
                    menu={(
                      <ProductionMenu label={`Actions for ${production.name}`}>
                        <DropdownMenuItem onSelect={() => void makeStandalone(production.id, production.name)}>
                          <Unlink /> Make standalone
                        </DropdownMenuItem>
                      </ProductionMenu>
                    )}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="work-empty compact">
              <FileAudio2 />
              <h3>No Productions</h3>
              <p>Create the first Production in this Series.</p>
              <Button onClick={() => setCreating(true)}><Plus /> New Production</Button>
            </div>
          )}
        </WorkSection>
      </div>
      <CreateResourceDialog
        kind="production"
        parent={parent}
        open={creating}
        onOpenChange={setCreating}
        onCreated={refresh}
      />
      <Dialog
        open={editingDefaults}
        onOpenChange={(open) => { if (!savingDefaults) setEditingDefaults(open) }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Series preferences</DialogTitle>
            <DialogDescription>
              Optional editorial prefills. The operator still chooses the exact recording method.
            </DialogDescription>
          </DialogHeader>
          <div className="resource-create-fields">
            <label>
              <span>Preferred Voice Identity <small>optional</small></span>
              <Select
                value={voiceIdentityId || noPreference}
                onValueChange={(value) => setVoiceIdentityId(value === noPreference ? "" : value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="No preferred voice" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={noPreference}>No preferred voice</SelectItem>
                  {voiceIdentityId && !preferredVoice && (
                    <SelectItem value={voiceIdentityId} disabled>
                      Unavailable voice ({voiceIdentityId})
                    </SelectItem>
                  )}
                  {identities.map((identity) => (
                    <SelectItem key={identity.id} value={identity.id}>
                      <UserRound /> {identity.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {voices.error && <small className="field-error">Voice Library unavailable: {voices.error}</small>}
            </label>
            <label>
              <span>Output language preference <small>optional</small></span>
              <Input
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                placeholder="e.g. Arabic"
              />
              <small>The Composer may prefill this value. It never limits the Voice Identity.</small>
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={savingDefaults}
              onClick={() => setEditingDefaults(false)}
            >
              Cancel
            </Button>
            <Button disabled={savingDefaults} onClick={() => void saveDefaults()}>
              {savingDefaults ? "Saving…" : "Save preferences"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
