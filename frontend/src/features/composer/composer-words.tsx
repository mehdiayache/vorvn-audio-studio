import { AudioLines, Check, ChevronDown, Columns2, Copy, Maximize2, Minimize2, WandSparkles } from "lucide-react"
import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { InlineDeliveryTags } from "@/components/inline-delivery-tags"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { TextView } from "@/hooks/use-composer-text"
import { formatMicroMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useComposer } from "./composer-controller"

function textLabel(view: TextView) {
  return view === "raw" ? "Original" : view === "shaped" ? "Spoken" : "Tagged"
}

function TaggedScriptEditor({ value, onChange, autoFocus }: { value: string; onChange: (value: string) => void; autoFocus: boolean }) {
  const highlight = useRef<HTMLPreElement | null>(null)
  return <div className="tagged-script-editor">
    <pre ref={highlight} aria-hidden="true"><InlineDeliveryTags text={value} /></pre>
    <Textarea dir="auto" aria-label="Tagged script" value={value} onChange={(event) => onChange(event.target.value)} onScroll={(event) => { if (highlight.current) { highlight.current.scrollTop = event.currentTarget.scrollTop; highlight.current.scrollLeft = event.currentTarget.scrollLeft } }} placeholder="Type or paste what should be said…" autoFocus={autoFocus} />
  </div>
}

export function ComposerWords() {
  const composer = useComposer()
  const text = composer.textSession
  const [compareOpen, setCompareOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const states = ["raw", "shaped", ...(composer.capabilityControls.deliveryTags ? ["tagged" as const] : [])] as TextView[]
  const savedCompareView = text.view === "raw" ? (text.states.tagged ? "tagged" : text.states.shaped ? "shaped" : null) : text.view
  const candidateView: TextView | null = text.review?.kind === "shape" ? "shaped" : text.review?.kind === "tag" ? "tagged" : null
  const compareView = candidateView || savedCompareView
  const compareText = text.review?.result.after || (compareView ? text.states[compareView] : "")
  const displayedText = text.review?.result.after || text.text
  const spokenLabel = text.spokenProfile === "spoken_2" ? "Speech editing" : "Natural phrasing"
  const textToolDisabled = !composer.currentRoute || !text.text.trim() || Boolean(text.busy) || composer.recovery.status === "loading"

  const copy = async () => {
    await navigator.clipboard?.writeText(displayedText)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return <section className={cn("composer-section script-section", focusMode && "is-focus")} aria-label="Script workspace">
    <div className="script-command-row">
      <div className="speech-states" role="tablist" aria-label="Script versions">{states.map((state) => <Button key={state} role="tab" aria-selected={text.view === state && !text.review} variant="ghost" size="sm" className={text.view === state && !text.review ? "active" : ""} disabled={Boolean(text.review) || (state !== "raw" && !text.states[state])} onClick={() => text.select(state)}>{textLabel(state)}{state === text.view && !text.review && <small>Recording input</small>}</Button>)}</div>
      <div className="script-command-actions">
        {!text.review && <div className="text-tools" aria-label="Text tools">
          <div className="spoken-split-action">
            <Button variant="ghost" size="sm" disabled={textToolDisabled} onClick={() => void text.run("shape", false, text.spokenProfile)}><AudioLines />{text.busy === "shape" ? "Preparing…" : `Make spoken · ${spokenLabel}`}</Button>
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Choose Spoken preparation method" disabled={textToolDisabled}><ChevronDown /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="spoken-method-menu">
              <DropdownMenuItem onSelect={() => void text.run("shape", false, "spoken_1")}><span><b>Spoken 1 · Natural phrasing</b><small>Reshapes sentences for comfortable listening.</small></span>{text.spokenProfile === "spoken_1" && <Check />}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void text.run("shape", false, "spoken_2")}><span><b>Spoken 2 · Speech editing</b><small>Cuts and reshapes written prose for spoken rhythm.</small></span>{text.spokenProfile === "spoken_2" && <Check />}</DropdownMenuItem>
            </DropdownMenuContent></DropdownMenu>
          </div>
          {composer.capabilityControls.deliveryTags && <>
            <Select value={text.density} onValueChange={text.setDensity}><SelectTrigger aria-label="Tag density"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="light">Light tags</SelectItem><SelectItem value="normal">Normal tags</SelectItem><SelectItem value="heavy">Heavy tags</SelectItem></SelectContent></Select>
            <Button variant="ghost" size="sm" disabled={!text.text.trim() || Boolean(text.busy) || composer.recovery.status === "loading"} onClick={() => void text.run("tag")}><WandSparkles />{text.busy === "tag" ? "Tagging…" : "Add tags"}</Button>
          </>}
        </div>}
        <div className="script-utility-actions" aria-label="Script actions">
          <Button variant="ghost" size="icon-sm" aria-label={copied ? "Copied" : "Copy"} title={copied ? "Copied" : "Copy script"} disabled={!displayedText} onClick={() => void copy()}>{copied ? <Check /> : <Copy />}</Button>
          <Button variant="ghost" size="icon-sm" aria-label="Compare" title="Compare script versions" disabled={!compareView || !text.states.raw} onClick={() => setCompareOpen(true)}><Columns2 /></Button>
          <Button variant="ghost" size="icon-sm" aria-label={focusMode ? "Show Sound" : "Focus editor"} title={focusMode ? "Show Sound controls" : "Focus editor"} aria-pressed={focusMode} onClick={() => setFocusMode((current) => !current)}>{focusMode ? <Minimize2 /> : <Maximize2 />}</Button>
        </div>
      </div>
    </div>
    <div className="script-content-stack">
      {composer.currentRoute && composer.taggedIncompatible && <div className="composer-warning"><b>Inline tags are not available with {composer.methodLabel}.</b><span>Your words remain unchanged until you choose what to do.</span><div>{text.states.shaped && <Button size="sm" variant="outline" onClick={() => text.select("shaped")}>Use Spoken version</Button>}{composer.hasInlineDeliveryTag && <Button size="sm" variant="outline" onClick={composer.removeInlineTags}>Remove inline tags</Button>}</div></div>}
      <div className={cn("script-editor-shell", text.review && "is-reviewing")}>
        {text.review ? <>
          <div className="candidate-toolbar">
            <div><span className="eyebrow">{text.review.kind === "shape" ? `${text.review.result.spoken_profile === "spoken_2" ? "Spoken 2 · Speech editing" : "Spoken 1 · Natural phrasing"} candidate` : "Tagged candidate"}</span><b>Review the prepared words where you write</b><small>{formatMicroMoney(Number(text.review.result.cost || 0))} · {text.review.result.cost_basis === "actual_tokens" ? "actual provider tokens" : "estimated"}</small></div>
            <Button variant="outline" size="sm" onClick={() => setCompareOpen(true)}><Columns2 /> Compare with Original</Button>
          </div>
          <Textarea className="candidate-editor" dir="auto" aria-label={`${text.review.kind === "shape" ? "Spoken" : "Tagged"} candidate`} value={text.review.result.after || ""} readOnly />
          <div className="candidate-actions"><Button variant="ghost" disabled={Boolean(text.busy)} onClick={() => void text.reject()}>Reject</Button><Button disabled={Boolean(text.busy)} onClick={() => void text.accept()}><Check />{text.busy ? "Accepting…" : `Accept ${text.review.kind === "shape" ? "Spoken" : "Tagged"}`}</Button></div>
        </> : text.view === "tagged"
          ? <TaggedScriptEditor value={text.text} onChange={text.updateText} autoFocus={Boolean(composer.currentRoute)} />
          : <Textarea dir="auto" aria-label={`${textLabel(text.view)} script`} value={text.text} onChange={(event) => text.updateText(event.target.value)} placeholder="Type or paste what should be said…" autoFocus={Boolean(composer.currentRoute)} />}
      </div>
    </div>
    <div className="script-meta-row">
      <span>{displayedText.length.toLocaleString()} characters</span>
      {!composer.currentRoute && <span>Choose a Voice and recording method to prepare text</span>}
      {composer.currentRoute && !composer.capabilityControls.deliveryTags && <span>{composer.methodLabel} uses words without inline tags</span>}
      <span>Text tools · {composer.config?.text_preparation?.model || "Qwen text"} · about {formatMicroMoney(composer.textPassEstimate)}</span>
    </div>
    {text.error && <p className="composer-warning">{text.error}</p>}
    <Dialog open={compareOpen} onOpenChange={setCompareOpen}><DialogContent className="composer-compare-dialog"><DialogHeader><DialogTitle>Compare script versions</DialogTitle><DialogDescription>Original editorial words beside the prepared version. Both remain plain, copyable text.</DialogDescription></DialogHeader><div className="composer-compare-grid"><section><b>Original</b><pre>{text.states.raw}</pre></section><section><b>{compareView ? textLabel(compareView) : "Prepared"}</b><pre>{compareText}</pre></section></div></DialogContent></Dialog>
  </section>
}
