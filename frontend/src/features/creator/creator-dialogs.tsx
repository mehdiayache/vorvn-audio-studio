import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useSpeechCreator } from "./speech/speech-creator-controller"

export function CreatorDialogs() {
  const creator = useSpeechCreator()
  return <>
    <Dialog open={Boolean(creator.editorialCommand)} onOpenChange={(open) => { if (!open) creator.setEditorialCommand(null) }}>
      <DialogContent><DialogHeader><DialogTitle>Update this Part before generating?</DialogTitle><DialogDescription>The edited words become the Part’s script. The current audio remains available until the new recording succeeds.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => creator.setEditorialCommand(null)}>Cancel</Button><Button onClick={() => { const next = creator.editorialCommand; creator.setEditorialCommand(null); if (next) creator.continueGeneration(next, true) }}>Update Part and generate</Button></DialogFooter></DialogContent>
    </Dialog>
    <Dialog open={creator.confirmationEstimate !== null} onOpenChange={(open) => { if (!open) { creator.setConfirmationEstimate(null); creator.setPendingCommand(null) } }}>
      <DialogContent><DialogHeader><DialogTitle>Generate this recording?</DialogTitle><DialogDescription>This request is estimated at ${creator.confirmationEstimate?.toFixed(4)}. Actual provider usage is stored after completion.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => { creator.setConfirmationEstimate(null); creator.setPendingCommand(null) }}>Cancel</Button><Button onClick={() => { const next = creator.pendingCommand; creator.setConfirmationEstimate(null); creator.setPendingCommand(null); if (next) void creator.executeGeneration({ ...next.command, confirmed: true }, next.updateEditorial).catch(() => undefined) }}>Generate</Button></DialogFooter></DialogContent>
    </Dialog>
    <Dialog open={Boolean(creator.textSession.pending)} onOpenChange={(open) => { if (!open) creator.textSession.cancelPending() }}>
      <DialogContent><DialogHeader><DialogTitle>Run this text pass?</DialogTitle><DialogDescription>This paid rewrite is estimated at ${Number(creator.textSession.pending?.estimate || 0).toFixed(4)}. You will review the result before accepting it.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={creator.textSession.cancelPending}>Cancel</Button><Button onClick={() => void creator.textSession.confirmPending()}>Continue</Button></DialogFooter></DialogContent>
    </Dialog>
  </>
}
