import { StoryRoleEditor } from "@/components/story-role-editor"
import type { SpeechCreatorController } from "./speech/speech-creator-controller"

export function CreatorRoleEditor({ creator }: { creator: SpeechCreatorController }) {
  return <StoryRoleEditor className="creator-role-trigger" value={creator.authoredRole} busy={creator.roleBusy} onSave={creator.saveRole} />
}
