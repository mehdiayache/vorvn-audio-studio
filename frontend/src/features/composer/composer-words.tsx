import { AudioLines, Check, Columns2, Copy, WandSparkles } from "lucide-react"
import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { TextView } from "@/hooks/use-composer-text"
import { formatMicroMoney } from "@/lib/format"
import { useComposer } from "./composer-controller"

function textLabel(view: TextView) {
  return view === "raw" ? "Original" : view === "shaped" ? "Spoken" : "Tagged"
}

function TaggedScriptEditor({ value, onChange, autoFocus }: { value: string; onChange: (value: string) => void; autoFocus: boolean }) {
  const highlight = useRef<HTMLPreElement | null>(null)
  const fragments = value.split(/(\[[^\[\]\n]{1,40}\])/g)
  return <div className="tagged-script-editor">
    <pre ref={highlight} aria-hidden="true">{fragments.map((fragment, index) => /^\[[^\[\]\n]{1,40}\]$/.test(fragment) ? <mark key={index}>{fragment}</mark> : <span key={index}>{fragment}</span>)}</pre>
    <Textarea dir="auto" aria-label="Tagged script" value={value} onChange={(event) => onChange(event.target.value)} onScroll={(event) => { if (highlight.current) { highlight.current.scrollTop = event.currentTarget.scrollTop; highlight.current.scrollLeft = event.currentTarget.scrollLeft } }} placeholder="Type or paste what should be said…" autoFocus={autoFocus} />
  </div>
}

export function ComposerWords() {
  const composer = useComposer()
  const text = composer.textSession
  const [compareOpen, setCompareOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const states = ["raw", "shaped", ...(composer.capabilityControls.deliveryTags ? ["tagged" as const] : [])] as TextView[]
  const compareView = text.view === "raw" ? (text.states.tagged ? "tagged" : text.states.shaped ? "shaped" : null) : text.view

  const copy = async () => {
    await navigator.clipboard?.writeText(text.text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return <section className="composer-section script-section" aria-label="Script workspace">
    <header>
      <div><span className="eyebrow">Script workspace</span><h3>Write the performance</h3></div>
      <div className="script-utility-actions"><Button variant="ghost" size="sm" disabled={!text.text} onClick={() => void copy()}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy"}</Button><Button variant="ghost" size="sm" disabled={!compareView || !text.states.raw} onClick={() => setCompareOpen(true)}><Columns2 /> Compare</Button></div>
    </header>
    <div className="speech-states" role="tablist" aria-label="Script versions">{states.map((state) => <Button key={state} role="tab" aria-selected={text.view === state} variant="ghost" size="sm" className={text.view === state ? "active" : ""} disabled={state !== "raw" && !text.states[state]} onClick={() => text.select(state)}>{textLabel(state)}{state === text.view && <small>Used to generate</small>}</Button>)}</div>
    {composer.currentRoute && composer.taggedIncompatible && <div className="composer-warning"><b>Inline tags are not available with {composer.methodLabel}.</b><span>Your words remain unchanged until you choose what to do.</span><div>{text.states.shaped && <Button size="sm" variant="outline" onClick={() => text.select("shaped")}>Use Spoken version</Button>}{composer.hasInlineDeliveryTag && <Button size="sm" variant="outline" onClick={composer.removeInlineTags}>Remove inline tags</Button>}</div></div>}
    {text.view === "tagged" ? <TaggedScriptEditor value={text.text} onChange={text.updateText} autoFocus={Boolean(composer.currentRoute)} /> : <Textarea dir="auto" aria-label={`${textLabel(text.view)} script`} value={text.text} onChange={(event) => text.updateText(event.target.value)} placeholder="Type or paste what should be said…" autoFocus={Boolean(composer.currentRoute)} />}
    <div className="text-pass-actions">
      <Button variant="outline" disabled={!composer.currentRoute || !text.text.trim() || Boolean(text.busy) || composer.recovery.status === "loading"} onClick={() => void text.run("shape")}><AudioLines />{text.busy === "shape" ? "Rewriting…" : "Make it spoken"}</Button>
      {composer.capabilityControls.deliveryTags ? <>
        <Select value={text.density} onValueChange={text.setDensity}><SelectTrigger aria-label="Tag density"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="light">Light tags</SelectItem><SelectItem value="normal">Normal tags</SelectItem><SelectItem value="heavy">Heavy tags</SelectItem></SelectContent></Select>
        <Button variant="outline" disabled={!text.text.trim() || Boolean(text.busy) || composer.recovery.status === "loading"} onClick={() => void text.run("tag")}><WandSparkles />{text.busy === "tag" ? "Tagging…" : "Add delivery tags"}</Button>
      </> : <p className="composer-engine-note">{composer.currentRoute ? `${composer.methodLabel} does not use inline tags.` : "Choose an exact route to see its text tools."}</p>}
      <small className="text-pass-cost">Paid text preparation · {composer.config?.text_preparation?.model || "Qwen text"} · about {formatMicroMoney(composer.textPassEstimate)} each</small>
    </div>
    {text.error && <p className="composer-warning">{text.error}</p>}
    {text.review && <div className="text-review"><header><div><b>{text.review.kind === "shape" ? "Spoken version ready" : "Tagged version ready"}</b><span>{formatMicroMoney(Number(text.review.result.cost || 0))} · {text.review.result.cost_basis === "actual_tokens" ? "actual provider tokens" : "estimated"} · review before accepting</span></div><div><Button variant="ghost" onClick={text.reject}>Reject</Button><Button onClick={() => void text.accept()}>Accept version</Button></div></header><p>{text.review.result.difference?.map((change, index) => change.kind === "added" ? <ins key={index}>{change.text}</ins> : change.kind === "removed" ? <del key={index}>{change.text}</del> : <span key={index}>{change.text}</span>)}</p></div>}
    <Dialog open={compareOpen} onOpenChange={setCompareOpen}><DialogContent className="composer-compare-dialog"><DialogHeader><DialogTitle>Compare script versions</DialogTitle><DialogDescription>Original editorial words beside the prepared version. Both remain plain, copyable text.</DialogDescription></DialogHeader><div className="composer-compare-grid"><section><b>Original</b><pre>{text.states.raw}</pre></section><section><b>{compareView ? textLabel(compareView) : "Prepared"}</b><pre>{compareView ? text.states[compareView] : ""}</pre></section></div></DialogContent></Dialog>
  </section>
}
