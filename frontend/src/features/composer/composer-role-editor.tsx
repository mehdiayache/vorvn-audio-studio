import { StoryRoleEditor } from "@/components/story-role-editor"
import type { ComposerController } from "./composer-controller"

export function ComposerRoleEditor({ composer }: { composer: ComposerController }) {
  return <StoryRoleEditor className="composer-role-trigger" value={composer.authoredRole} busy={composer.roleBusy} onSave={composer.saveRole} />
}
