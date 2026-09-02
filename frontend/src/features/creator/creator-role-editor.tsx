import { StoryRoleEditor } from "@/components/story-role-editor"
import type { CreatorController } from "./creator-controller"

export function CreatorRoleEditor({ creator }: { creator: CreatorController }) {
  return <StoryRoleEditor className="creator-role-trigger" value={creator.authoredRole} busy={creator.roleBusy} onSave={creator.saveRole} />
}
