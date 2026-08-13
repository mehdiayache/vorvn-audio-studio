import { ArrowRight, Plus, UserRound, Users } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type { CSSProperties } from "react"

import { VoiceIdentity } from "@/components/voice-identity"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { studioApi } from "@/lib/api"
import type { Production, ProductionCastRole, ProductionPersona, VoiceDirectory } from "@/types/domain"

type Assignment = { kind: "identity" | "catalogue"; id: string; label: string; detail: string }

const ROLE_COLORS = ["#2563eb", "#7c3aed", "#0f766e", "#c2410c", "#be185d", "#4f46e5"]

function assignmentValue(role: ProductionCastRole) {
  return role.voice_source_kind === "catalogue" ? `catalogue:${role.catalogue_voice_id}` : `identity:${role.voice_identity_id}`
}

function parseAssignment(value: string) {
  const [kind, ...rest] = value.split(":")
  return { kind: kind as "identity" | "catalogue", id: rest.join(":") }
}

export function CastManagerContent({ production, cast, directory, onChanged }: {
  production: Production
  cast: ProductionCastRole[]
  directory: VoiceDirectory
  onChanged: () => Promise<void>
}) {
  const ventureId = production.trail.find((item) => item.type === "venture")?.public_id || ""
  const [personas, setPersonas] = useState<ProductionPersona[]>([])
  const [name, setName] = useState("")
  const [personaId, setPersonaId] = useState("none")
  const [assignment, setAssignment] = useState("")
  const [color, setColor] = useState(ROLE_COLORS[cast.length % ROLE_COLORS.length])
  const [newPersona, setNewPersona] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const assignments = useMemo<Assignment[]>(() => [
    ...(directory.identities || []).map((identity) => ({ kind: "identity" as const, id: identity.id, label: identity.name, detail: "Owned Voice Identity" })),
    ...(directory.registry?.bindings || []).filter((item) => item.source !== "custom" && item.catalogue_voice_id && ["active", "ready"].includes(item.status.toLocaleLowerCase())).map((item) => ({ kind: "catalogue" as const, id: item.catalogue_voice_id!, label: item.name, detail: `${item.provider} · ${item.model_id} · ${item.tier}` })),
  ], [directory.identities, directory.registry?.bindings])

  useEffect(() => {
    if (!ventureId) return
    let active = true
    void studioApi.venturePersonas(ventureId).then((items) => { if (active) setPersonas(items) }).catch(() => { if (active) setPersonas([]) })
    return () => { active = false }
  }, [ventureId])

  async function createRole() {
    const selected = parseAssignment(assignment)
    if (!name.trim() || !selected.id) { setError("Name the role and choose who performs it."); return }
    setBusy(true); setError("")
    try {
      await studioApi.createCastRole(production.public_id, {
        name: name.trim(), persona_id: personaId === "none" ? null : personaId,
        color, voice_source_kind: selected.kind,
        voice_identity_id: selected.kind === "identity" ? selected.id : null,
        catalogue_voice_id: selected.kind === "catalogue" ? selected.id : null,
      })
      setName(""); setPersonaId("none"); setAssignment(""); setColor(ROLE_COLORS[(cast.length + 1) % ROLE_COLORS.length])
      await onChanged()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The Cast Role could not be created.") }
    finally { setBusy(false) }
  }

  async function recast(role: ProductionCastRole, value: string) {
    const selected = parseAssignment(value)
    if (!selected.id || value === assignmentValue(role)) return
    setBusy(true); setError("")
    try {
      await studioApi.recastRole(role.id, {
        voice_source_kind: selected.kind,
        voice_identity_id: selected.kind === "identity" ? selected.id : null,
        catalogue_voice_id: selected.kind === "catalogue" ? selected.id : null,
      })
      await onChanged()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The Cast Role could not be reassigned.") }
    finally { setBusy(false) }
  }

  async function createCharacter() {
    if (!newPersona.trim() || !ventureId) return
    setBusy(true); setError("")
    try {
      const persona = await studioApi.createPersona(ventureId, { name: newPersona.trim() })
      setPersonas((current) => [...current, persona].sort((a, b) => a.name.localeCompare(b.name)))
      setPersonaId(persona.id); setNewPersona("")
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The character could not be created.") }
    finally { setBusy(false) }
  }

  return <div className="cast-manager-body cast-workbench-content">
      <div className="cast-future-rule"><ArrowRight /><span><b>Recast is future-only</b><p>Future recordings use the new voice. Existing Takes remain unchanged.</p></span></div>
      <section><div className="cast-manager-section-title"><span><Users /><b>Roles in this Production</b></span><small>{cast.length}</small></div>
        {cast.length ? <div className="cast-manager-roles">{cast.map((role) => <article key={role.id}><i style={{ backgroundColor: role.color || "var(--primary)" }} /><div><b>{role.name}</b><small>{role.persona_name || "Ad-hoc role"} · {role.part_count || 0} Parts</small>{role.voice_identity_id && <VoiceIdentity voice="" identityId={role.voice_identity_id} directory={directory} compact showEditorialFlag={false} />}</div><Select disabled={busy} value={assignmentValue(role)} onValueChange={(value) => void recast(role, value)}><SelectTrigger aria-label={`Recast ${role.name}`}><SelectValue /></SelectTrigger><SelectContent>{assignments.map((option) => <SelectItem key={`${option.kind}:${option.id}`} value={`${option.kind}:${option.id}`}>{option.label} · {option.detail}</SelectItem>)}</SelectContent></Select></article>)}</div> : <div className="cast-manager-empty"><Users /><b>No roles yet</b><p>Create the narrator or characters used by this Production.</p></div>}
      </section>
      <section className="cast-create-role"><div className="cast-manager-section-title"><span><Plus /><b>Add Cast Role</b></span></div>
        <label>Role name<Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Narrator, Paul, Mother…" /></label>
        <fieldset className="cast-color-field"><legend>Role color</legend><div>{ROLE_COLORS.map((item) => <button type="button" key={item} className={color === item ? "selected" : undefined} style={{ "--role-color": item } as CSSProperties} aria-label={`Use role color ${item}`} aria-pressed={color === item} onClick={() => setColor(item)}><span /></button>)}</div><small>Color is always paired with the role name and Voice.</small></fieldset>
        <label>Character (optional)<Select value={personaId} onValueChange={setPersonaId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No permanent character</SelectItem>{personas.map((persona) => <SelectItem key={persona.id} value={persona.id}>{persona.name}</SelectItem>)}</SelectContent></Select></label>
        <label>Who performs it<Select value={assignment} onValueChange={setAssignment}><SelectTrigger><SelectValue placeholder="Choose a Voice Identity" /></SelectTrigger><SelectContent><SelectGroup><SelectLabel>Your voices</SelectLabel>{assignments.filter((item) => item.kind === "identity").map((option) => <SelectItem key={option.id} value={`identity:${option.id}`}>{option.label}</SelectItem>)}</SelectGroup><SelectGroup><SelectLabel>Provider catalogue</SelectLabel>{assignments.filter((item) => item.kind === "catalogue").map((option) => <SelectItem key={option.id} value={`catalogue:${option.id}`}>{option.label} · {option.detail}</SelectItem>)}</SelectGroup></SelectContent></Select></label>
        <Button disabled={busy || !name.trim() || !assignment} onClick={() => void createRole()}><Plus /> Add role</Button>
      </section>
      <section className="cast-character-library"><div className="cast-manager-section-title"><span><UserRound /><b>Venture Character Library</b></span><small>{personas.length}</small></div><div><Input value={newPersona} onChange={(event) => setNewPersona(event.target.value)} placeholder="New character name" /><Button variant="outline" disabled={busy || !newPersona.trim()} onClick={() => void createCharacter()}>Create character</Button></div></section>
      {error && <p className="cast-manager-error" role="alert">{error}</p>}
    </div>
}

export function CastManagerSheet({ open, production, cast, directory, onOpenChange, onChanged }: {
  open: boolean
  production: Production
  cast: ProductionCastRole[]
  directory: VoiceDirectory
  onOpenChange: (open: boolean) => void
  onChanged: () => Promise<void>
}) {
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="cast-manager-sheet"><SheetHeader><SheetTitle>Production Cast</SheetTitle><SheetDescription>Role, Voice Identity, and future recording assignment.</SheetDescription></SheetHeader><CastManagerContent production={production} cast={cast} directory={directory} onChanged={onChanged} /></SheetContent></Sheet>
}
