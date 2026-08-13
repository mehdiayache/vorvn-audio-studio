import { Cloud, Users } from "lucide-react"

import { VoiceIdentity } from "@/components/voice-identity"
import { Button } from "@/components/ui/button"
import { resolveVoice } from "@/lib/voice"
import type { ProductionCastRole, VoiceDirectory } from "@/types/domain"

export function ProductionCastStrip({ cast, directory, onManage }: {
  cast: ProductionCastRole[]
  directory: VoiceDirectory
  onManage: () => void
}) {
  if (!cast.length) return null
  return <section className="production-cast-strip" aria-labelledby="production-cast-title">
    <header><span><Users /><b id="production-cast-title">Cast</b></span><Button variant="ghost" size="sm" onClick={onManage}>Manage Cast</Button></header>
    <div className="production-cast-list">
      {cast.map((role) => {
        const catalogue = role.catalogue_voice_id ? directory.registry?.bindings.find((item) => item.catalogue_voice_id === role.catalogue_voice_id) : undefined
        const voiceName = role.voice_identity_id ? resolveVoice(undefined, directory, role.voice_identity_id).name : catalogue?.name || "Catalogue voice"
        return <button className="production-cast-chip" key={role.id} onClick={onManage} title={`${role.name} · ${voiceName} · ${role.part_count || 0} Parts`}>
          <i style={{ backgroundColor: role.color || "var(--primary)" }} aria-hidden="true" />
          {role.voice_identity_id ? <VoiceIdentity voice="" identityId={role.voice_identity_id} directory={directory} compact showDetail={false} showCopy={false} /> : <span className="cast-catalogue-avatar"><Cloud aria-hidden="true" /></span>}
          <span><b>{role.name}</b><small>{voiceName} · {role.part_count || 0} Parts</small></span>
        </button>
      })}
    </div>
  </section>
}
