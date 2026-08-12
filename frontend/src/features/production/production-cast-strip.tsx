import { Cloud, Users } from "lucide-react"

import { VoiceIdentity } from "@/components/voice-identity"
import { Button } from "@/components/ui/button"
import type { ProductionCastRole, VoiceDirectory } from "@/types/domain"

export function ProductionCastStrip({ cast, directory, onManage }: {
  cast: ProductionCastRole[]
  directory: VoiceDirectory
  onManage: () => void
}) {
  return <section className="production-cast-strip" aria-labelledby="production-cast-title">
    <header><span><Users /><b id="production-cast-title">Cast</b></span><Button variant="ghost" size="sm" onClick={onManage}>Manage Cast</Button></header>
    {cast.length ? <div className="production-cast-list">
      {cast.map((role) => <button className="production-cast-chip" key={role.id} onClick={onManage} title={`${role.name} · ${role.part_count || 0} Parts`}>
        <i style={{ backgroundColor: role.color || "var(--primary)" }} aria-hidden="true" />
        {role.voice_identity_id ? <VoiceIdentity voice="" identityId={role.voice_identity_id} directory={directory} compact showDetail={false} /> : <span className="cast-catalogue-avatar"><Cloud aria-hidden="true" /></span>}
        <span><b>{role.name}</b><small>{role.persona_name || (role.catalogue_voice_id ? "Catalogue voice" : "Production role")}</small></span>
      </button>)}
    </div> : <button className="production-cast-empty" onClick={onManage}><Users /><span><b>No cast yet</b><small>Add roles to keep character identity visible across this Production.</small></span></button>}
  </section>
}
