import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useComposer } from "./composer-controller"

export function ComposerDialogs() {
  const composer = useComposer()
  return <>
    <Dialog open={Boolean(composer.editorialCommand)} onOpenChange={(open) => { if (!open) composer.setEditorialCommand(null) }}>
      <DialogContent><DialogHeader><DialogTitle>Update this Part before recording?</DialogTitle><DialogDescription>The edited words and Cast Role must become the Part’s editorial truth before its single recording can be replaced.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => composer.setEditorialCommand(null)}>Cancel</Button><Button onClick={() => { const next = composer.editorialCommand; composer.setEditorialCommand(null); if (next) composer.continueGeneration(next, true) }}>Update Part and record</Button></DialogFooter></DialogContent>
    </Dialog>
    <Dialog open={composer.confirmationEstimate !== null} onOpenChange={(open) => { if (!open) { composer.setConfirmationEstimate(null); composer.setPendingCommand(null) } }}>
      <DialogContent><DialogHeader><DialogTitle>Generate this recording?</DialogTitle><DialogDescription>This request is estimated at ${composer.confirmationEstimate?.toFixed(4)}. Actual provider usage is stored after completion.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => { composer.setConfirmationEstimate(null); composer.setPendingCommand(null) }}>Cancel</Button><Button onClick={() => { const next = composer.pendingCommand; composer.setConfirmationEstimate(null); composer.setPendingCommand(null); if (next) void composer.executeGeneration({ ...next.command, confirmed: true }, next.updateEditorial).catch(() => undefined) }}>Generate</Button></DialogFooter></DialogContent>
    </Dialog>
    <Dialog open={Boolean(composer.textSession.pending)} onOpenChange={(open) => { if (!open) composer.textSession.cancelPending() }}>
      <DialogContent><DialogHeader><DialogTitle>Run this text pass?</DialogTitle><DialogDescription>This paid rewrite is estimated at ${Number(composer.textSession.pending?.estimate || 0).toFixed(4)}. You will review the result before accepting it.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={composer.textSession.cancelPending}>Cancel</Button><Button onClick={() => void composer.textSession.confirmPending()}>Continue</Button></DialogFooter></DialogContent>
    </Dialog>
  </>
}
