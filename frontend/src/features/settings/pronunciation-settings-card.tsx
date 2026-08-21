import { MessageSquareText, Plus, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { ActionButton, OperatorIconButton } from "@/components/operator-action"
import { Checkbox } from "@/components/ui/checkbox"
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog"
import { Input } from "@/components/ui/input"
import { studioApi } from "@/lib/api"
import { useAsyncAction } from "@/hooks/use-async-action"
import type { PronunciationRule } from "@/types/domain"

const blank = { pattern: "", replacement: "", whole_word: true, match_case: false, enabled: true, phoneme: false }

export function PronunciationSettingsCard() {
  const [rules, setRules] = useState<PronunciationRule[]>([])
  const [draft, setDraft] = useState(blank)
  const [deleteRule, setDeleteRule] = useState<PronunciationRule | null>(null)
  const [deleting, setDeleting] = useState(false)
  const actions = useAsyncAction<string>()
  useEffect(() => { void studioApi.pronunciations().then(setRules).catch(() => undefined) }, [])
  const save = () => actions.run("add", async () => { try { const result = await studioApi.savePronunciation(draft); setRules(result.rules); setDraft(blank); toast.success("Pronunciation rule added.") } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Rule could not be saved.") } })
  const toggle = (rule: PronunciationRule) => actions.run(`toggle:${rule.id}`, async () => { try { const result = await studioApi.savePronunciation({ ...rule, enabled: !rule.enabled }); setRules(result.rules) } catch (reason) { toast.error(reason instanceof Error ? reason.message : "The pronunciation rule could not be updated.") } })
  return <><section className="settings-card settings-wide"><header><MessageSquareText /><div><h2>Pronunciation dictionary</h2><p>Global corrections applied before compatible speech synthesis. Rules are visible and editable here instead of being hidden in prompts.</p></div></header><div className="pronunciation-create"><Input aria-label="Written form" placeholder="Written form" value={draft.pattern} onChange={(event) => setDraft({ ...draft, pattern: event.target.value })} /><Input aria-label="Pronunciation" placeholder="Say it like this" value={draft.replacement} onChange={(event) => setDraft({ ...draft, replacement: event.target.value })} /><ActionButton busy={actions.isPending("add")} busyLabel="Adding rule…" disabled={!draft.pattern.trim() || !draft.replacement.trim()} onClick={() => void save()}><Plus /> Add rule</ActionButton></div><div className="pronunciation-list">{rules.length ? rules.map((rule) => { const toggling = actions.isPending(`toggle:${rule.id}`); return <article key={rule.id}><Checkbox checked={rule.enabled} disabled={toggling} aria-busy={toggling || undefined} onCheckedChange={() => void toggle(rule)} /><span><b>{rule.pattern}</b><small>{toggling ? "Saving…" : rule.replacement}</small></span><OperatorIconButton size="icon" label={`Delete ${rule.pattern}`} detail="Permanently removes this rule from future speech." onClick={() => setDeleteRule(rule)}><Trash2 /></OperatorIconButton></article> }) : <p>No pronunciation rules. Text is sent without global replacements.</p>}</div></section>
    <DeleteConfirmationDialog open={Boolean(deleteRule)} onOpenChange={(open) => { if (!open) setDeleteRule(null) }} title={`Delete “${deleteRule?.pattern || "this rule"}”?`} description="This permanently removes the pronunciation rule from future compatible speech generation." confirmLabel="Delete pronunciation rule" busy={deleting} onConfirm={() => { if (!deleteRule) return; setDeleting(true); void studioApi.deletePronunciation(deleteRule.id).then(() => { setRules((current) => current.filter((item) => item.id !== deleteRule.id)); setDeleteRule(null); toast.success("Pronunciation rule deleted.") }).catch((reason) => toast.error(reason instanceof Error ? reason.message : "The pronunciation rule could not be deleted.")).finally(() => setDeleting(false)) }} />
  </>
}
