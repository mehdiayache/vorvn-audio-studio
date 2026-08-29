import { AudioLines, Check, ChevronDown, CircleAlert, Code2, Columns2, Copy, FileText, Maximize2, Minimize2, WandSparkles } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import type { TextView } from "@/hooks/use-composer-text"
import { formatMicroMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useComposer } from "./composer-controller"

function textLabel(view: TextView) {
  return view === "raw" ? "Original" : view === "shaped" ? "Spoken" : "Tagged"
}

function TaggedScriptEditor({ value, onChange, autoFocus }: { value: string; onChange: (value: string) => void; autoFocus: boolean }) {
  // A syntax-highlight overlay cannot share exact glyph geometry with a native
  // textarea once tags have padding. Use one truthful editing surface so the
  // caret, selection and deletion always target the characters operators see.
  return <Textarea className="tagged-script-editor" dir="auto" aria-label="Tagged script" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Type or paste what should be said…" autoFocus={autoFocus} />
}

export function ComposerWords() {
  const composer = useComposer()
  const text = composer.textSession
  const [compareOpen, setCompareOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [plainTextConfirmOpen, setPlainTextConfirmOpen] = useState(false)
  const states = ["raw", "shaped", ...(composer.capabilityControls.deliveryTags || text.states.tagged ? ["tagged" as const] : [])] as TextView[]
  const savedCompareView = text.view === "raw" ? (text.states.tagged ? "tagged" : text.states.shaped ? "shaped" : null) : text.view
  const candidateView: TextView | null = text.review?.kind === "shape" ? "shaped" : text.review?.kind === "tag" ? "tagged" : null
  const compareView = candidateView || savedCompareView
  const compareText = text.review?.result.after || (compareView ? text.states[compareView] : "")
  const displayedText = text.review?.result.after || text.text
  const spokenLabel = text.spokenProfile === "spoken_2" ? "Speech edit" : "Natural"
  const densityLabel = `${text.density.slice(0, 1).toUpperCase()}${text.density.slice(1)}`
  const textToolDisabled = !composer.currentRoute || !text.text.trim() || Boolean(text.busy) || composer.recovery.status === "loading"

  const copy = async () => {
    await navigator.clipboard?.writeText(displayedText)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return <section className={cn("composer-section script-section", focusMode && "is-focus")} aria-label="Script workspace">
    <div className="script-command-row">
      <div className="script-version-row">
        <Tabs value={text.review ? "" : text.view} onValueChange={(value) => text.select(value as TextView)}>
          <TabsList variant="line" aria-label="Script versions" className="speech-states">{states.map((state) => <TabsTrigger key={state} value={state} disabled={Boolean(text.review) || (state !== "raw" && !text.states[state])}>{textLabel(state)}</TabsTrigger>)}</TabsList>
        </Tabs>
        {!text.review && <span className="recording-input-label">Recording input · <b>{textLabel(text.view)}</b></span>}
      </div>
      <div className="script-command-actions">
        {!text.review && <div className="text-tools" aria-label="Text tools">
          <div className="text-preparation-action">
            <Button variant="outline" size="sm" disabled={textToolDisabled} onClick={() => void text.run("shape", false, text.spokenProfile)}><AudioLines />{text.busy === "shape" ? "Preparing…" : "Make spoken"}</Button>
            <DropdownMenu><OperatorTooltip label="Spoken preparation" detail={`Current method: ${spokenLabel}. Choose how the words are prepared.`} side="bottom" disabledTrigger={textToolDisabled}><DropdownMenuTrigger asChild><Button variant="outline" size="sm" aria-label="Choose Spoken preparation method" disabled={textToolDisabled}>{spokenLabel}<ChevronDown /></Button></DropdownMenuTrigger></OperatorTooltip><DropdownMenuContent align="end" className="spoken-method-menu"><DropdownMenuGroup><DropdownMenuRadioGroup value={text.spokenProfile} onValueChange={text.setSpokenProfile}>
              <DropdownMenuRadioItem value="spoken_1"><span><b>Spoken 1 · Natural phrasing</b><small>Reshapes sentences for comfortable listening.</small></span></DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="spoken_2"><span><b>Spoken 2 · Speech editing</b><small>Cuts and reshapes written prose for spoken rhythm.</small></span></DropdownMenuRadioItem>
            </DropdownMenuRadioGroup></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
          </div>
          {composer.capabilityControls.deliveryTags && <>
            <div className="text-preparation-action">
              <Button variant="outline" size="sm" disabled={textToolDisabled} onClick={() => void text.run("tag")}><WandSparkles />{text.busy === "tag" ? "Tagging…" : "Add tags"}</Button>
              <DropdownMenu><OperatorTooltip label="Tag density" detail={`Current density: ${densityLabel}. Choose how many supported delivery tags to add.`} side="bottom" disabledTrigger={textToolDisabled}><DropdownMenuTrigger asChild><Button variant="outline" size="sm" aria-label="Choose tag density" disabled={textToolDisabled}>{densityLabel}<ChevronDown /></Button></DropdownMenuTrigger></OperatorTooltip><DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuRadioGroup value={text.density} onValueChange={text.setDensity}>
                <DropdownMenuRadioItem value="light">Light · only important moments</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="normal">Normal · balanced direction</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="heavy">Heavy · frequent direction</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
            </div>
          </>}
        </div>}
        <div className="script-utility-actions" aria-label="Script actions">
          <OperatorIconButton label={copied ? "Script copied" : "Copy script"} disabled={!displayedText} onClick={() => void copy()}>{copied ? <Check /> : <Copy />}</OperatorIconButton>
          <OperatorIconButton label="Compare script versions" detail="Shows the current preparation beside the Original." disabled={!compareView || !text.states.raw} onClick={() => setCompareOpen(true)}><Columns2 /></OperatorIconButton>
          <OperatorIconButton label={focusMode ? "Show Sound controls" : "Focus editor"} detail={focusMode ? "Restores Voice and output controls." : "Gives the script the full creative workspace."} aria-pressed={focusMode} onClick={() => setFocusMode((current) => !current)}>{focusMode ? <Minimize2 /> : <Maximize2 />}</OperatorIconButton>
        </div>
      </div>
    </div>
    <div className="script-content-stack">
      {composer.currentRoute && composer.taggedIncompatible && <div className="composer-warning"><b>This recording method cannot record the current Tagged version.</b><span>Original and Spoken remain available. Nothing will be deleted.</span><div>{text.states.shaped && <Button size="sm" variant="outline" onClick={() => text.select("shaped")}>Use Spoken</Button>}<Button size="sm" variant="outline" onClick={() => { if (text.states.tagged) text.select("tagged"); setFocusMode(true) }}>Review tags</Button></div></div>}
      {composer.capabilityControls.ssml && !text.review && <div className="ssml-mode-row" aria-label="Script format">
        <div className="ssml-mode-actions">
          <Button variant={composer.enableSsml ? "ghost" : "secondary"} size="sm" aria-pressed={!composer.enableSsml} onClick={() => { if (composer.enableSsml) setPlainTextConfirmOpen(true) }}><FileText />Plain text</Button>
          <Button variant={composer.enableSsml ? "secondary" : "ghost"} size="sm" aria-pressed={composer.enableSsml} onClick={() => { if (!composer.enableSsml) composer.enableSsmlDocument() }}><Code2 />{composer.enableSsml ? "SSML document" : "Convert to SSML"}</Button>
        </div>
        {composer.enableSsml
          ? <span className={cn("ssml-status", composer.ssmlValidation.valid ? "is-valid" : "is-invalid")} role="status">{composer.ssmlValidation.valid ? <Check /> : <CircleAlert />}{composer.ssmlValidation.message}</span>
          : <span className="ssml-mode-help">Advanced provider markup for pauses and pronunciation.</span>}
      </div>}
      <div className={cn("script-editor-shell", text.review && "is-reviewing")}>
        {text.review ? <>
          <div className="candidate-toolbar">
            <div><span className="eyebrow">{text.review.kind === "shape" ? `${text.review.result.spoken_profile === "spoken_2" ? "Spoken 2 · Speech editing" : "Spoken 1 · Natural phrasing"} candidate` : "Tagged candidate"}</span><b>Review the prepared words where you write</b><small>{formatMicroMoney(Number(text.review.result.cost ?? 0))} · {text.review.result.cost_basis === "actual_tokens" ? "actual provider tokens" : "estimated"}</small></div>
            <Button variant="outline" size="sm" onClick={() => setCompareOpen(true)}><Columns2 /> Compare with Original</Button>
          </div>
          <Textarea className="candidate-editor" dir="auto" aria-label={`${text.review.kind === "shape" ? "Spoken" : "Tagged"} candidate`} value={text.review.result.after || ""} readOnly />
          <div className="candidate-actions"><Button variant="ghost" disabled={Boolean(text.busy)} onClick={() => void text.reject()}>Reject</Button><Button disabled={Boolean(text.busy)} onClick={() => void text.accept()}><Check />{text.busy ? "Accepting…" : `Accept ${text.review.kind === "shape" ? "Spoken" : "Tagged"}`}</Button></div>
        </> : text.view === "tagged" && !composer.enableSsml
          ? <TaggedScriptEditor value={text.text} onChange={text.updateText} autoFocus={Boolean(composer.currentRoute)} />
          : <Textarea dir="auto" aria-label={composer.enableSsml ? `${textLabel(text.view)} SSML document` : `${textLabel(text.view)} script`} value={text.text} onChange={(event) => text.updateText(event.target.value)} placeholder={composer.enableSsml ? "Write one <speak> document…" : "Type or paste what should be said…"} autoFocus={Boolean(composer.currentRoute)} />}
      </div>
    </div>
    <div className="script-meta-row">
      <span>{displayedText.length.toLocaleString()} characters</span>
      {!composer.currentRoute && <span>Choose a Voice and recording method to prepare text</span>}
      {composer.currentRoute && !composer.capabilityControls.deliveryTags && <span>{composer.methodLabel} uses words without inline tags</span>}
      <span>Text tools · {composer.config?.text_preparation?.model || "Qwen text"} · about {formatMicroMoney(composer.textPassEstimate)}</span>
    </div>
    {text.error && <p className="composer-warning">{text.error}</p>}
    <Dialog open={plainTextConfirmOpen} onOpenChange={setPlainTextConfirmOpen}><DialogContent><DialogHeader><DialogTitle>Return to plain text?</DialogTitle><DialogDescription>SSML markup and controls will be removed. Only the readable words remain in this script version.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setPlainTextConfirmOpen(false)}>Keep SSML</Button><Button onClick={() => { composer.usePlainText(); setPlainTextConfirmOpen(false) }}>Use plain text</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={compareOpen} onOpenChange={setCompareOpen}><DialogContent className="composer-compare-dialog"><DialogHeader><DialogTitle>Compare script versions</DialogTitle><DialogDescription>Original editorial words beside the prepared version.</DialogDescription></DialogHeader><div className="composer-compare-grid"><section><b>Original</b><pre>{text.states.raw}</pre></section><section><b>{compareView ? textLabel(compareView) : "Prepared"}</b><pre>{compareText}</pre></section></div></DialogContent></Dialog>
  </section>
}
