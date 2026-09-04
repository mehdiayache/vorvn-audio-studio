import { CircleAlert, FileText, LoaderCircle } from "lucide-react"
import { lazy, Suspense, useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import type { WorkspaceFile } from "@/types/domain"
import { fileTextFormat, isTextPreviewFile } from "./file-presentation"
import type { FileSyntaxLanguage, FileSyntaxLine } from "./file-syntax-highlight"

const Markdown = lazy(() => import("react-markdown"))
const MAX_TEXT_PREVIEW_BYTES = 2_000_000

export type FileTextPreviewModel = {
  fileId: number
  format: string
  status: "loading" | "ready" | "error" | "too-large"
  text: string
}

function displayText(body: string, format: string) {
  if (format !== "JSON") return body
  try { return JSON.stringify(JSON.parse(body), null, 2) } catch { return body }
}

export function useFileTextPreview(file: WorkspaceFile, url: string): FileTextPreviewModel | null {
  const previewable = isTextPreviewFile(file)
  const format = fileTextFormat(file)
  const inlineText = typeof file.text === "string" ? file.text : null
  const tooLarge = Boolean(file.size_bytes && file.size_bytes > MAX_TEXT_PREVIEW_BYTES)
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; text: string }>({
    status: inlineText !== null ? "ready" : "loading",
    text: inlineText || "",
  })

  useEffect(() => {
    if (!previewable) return
    if (inlineText !== null) {
      setState({ status: "ready", text: inlineText })
      return
    }
    if (tooLarge) return
    if (!url) {
      setState({ status: "error", text: "" })
      return
    }
    const controller = new AbortController()
    setState({ status: "loading", text: "" })
    void fetch(url, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(`Preview request failed with ${response.status}`)
      setState({ status: "ready", text: await response.text() })
    }).catch((reason: unknown) => {
      if (reason && typeof reason === "object" && "name" in reason && reason.name === "AbortError") return
      setState({ status: "error", text: "" })
    })
    return () => controller.abort()
  }, [inlineText, previewable, tooLarge, url])

  return useMemo(() => previewable ? {
    fileId: file.id,
    format,
    status: tooLarge ? "too-large" : state.status,
    text: displayText(state.text, format),
  } : null, [file.id, format, previewable, state.status, state.text, tooLarge])
}

function syntaxLanguage(format: string): FileSyntaxLanguage | null {
  if (format === "JSON") return "json"
  if (format === "YAML" || format === "YML") return "yaml"
  if (format === "XML") return "xml"
  if (format === "MD" || format === "MARKDOWN") return "markdown"
  return null
}

function SyntaxText({ language, text }: { language: FileSyntaxLanguage; text: string }) {
  const [lines, setLines] = useState<FileSyntaxLine[] | null>(null)

  useEffect(() => {
    let active = true
    setLines(null)
    void import("./file-syntax-highlight").then(({ highlightFileText }) => highlightFileText(text, language)).then((next) => {
      if (active) setLines(next)
    }).catch(() => {
      if (active) setLines(null)
    })
    return () => { active = false }
  }, [language, text])

  if (!lines) return <pre>{text}</pre>
  return <pre className="file-syntax-preview">{lines.map((line, lineIndex) => <span className="file-syntax-line" key={lineIndex}>{line.map((token, tokenIndex) => <span className="file-syntax-token" style={{ color: token.color }} key={tokenIndex}>{token.content}</span>)}{"\n"}</span>)}</pre>
}

function MarkdownDocument({ text }: { text: string }) {
  return <div className="file-markdown-document">
    <Suspense fallback={<div className="file-preview-message" role="status"><LoaderCircle className="spin" /><b>Opening Markdown</b></div>}>
      <Markdown
        skipHtml
        components={{
          a: ({ children, href }) => href ? <a href={href} rel="noreferrer" target="_blank">{children}</a> : <span>{children}</span>,
          img: ({ alt }) => <span className="file-markdown-image-placeholder" role="note">Image: {alt || "Untitled"}</span>,
        }}
      >{text}</Markdown>
    </Suspense>
  </div>
}

function parseDelimitedText(text: string, delimiter: "," | "\t") {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === delimiter && !quoted) {
      row.push(cell)
      cell = ""
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1
      row.push(cell)
      if (row.some((value) => value.length > 0)) rows.push(row)
      row = []
      cell = ""
    } else {
      cell += character
    }
  }
  row.push(cell)
  if (row.some((value) => value.length > 0)) rows.push(row)
  return rows
}

function DelimitedTable({ text, delimiter }: { text: string; delimiter: "," | "\t" }) {
  const rows = useMemo(() => parseDelimitedText(text, delimiter), [delimiter, text])
  const visibleRows = rows.slice(0, 200)
  const [headings = [], ...body] = visibleRows
  return <div className="file-data-table-wrap">
    <table className="file-data-table">
      <thead><tr>{headings.map((heading, index) => <th key={`${heading}-${index}`} scope="col">{heading || `Column ${index + 1}`}</th>)}</tr></thead>
      <tbody>{body.map((values, rowIndex) => <tr key={rowIndex}>{headings.map((_, columnIndex) => <td key={columnIndex}>{values[columnIndex] || ""}</td>)}</tr>)}</tbody>
    </table>
    {rows.length > visibleRows.length && <p className="file-data-table-limit">Showing the first {visibleRows.length.toLocaleString()} rows of {rows.length.toLocaleString()}.</p>}
  </div>
}

export function FileTextPreview({ preview }: { preview: FileTextPreviewModel }) {
  const markdown = preview.format === "MD" || preview.format === "MARKDOWN"
  const [mode, setMode] = useState<"preview" | "source">("preview")

  useEffect(() => { setMode("preview") }, [preview.fileId])

  if (preview.status === "too-large") return <div className="file-preview-message"><FileText /><b>Preview unavailable</b><p>Text previews are limited to 2 MB. Download the File to read the complete content.</p></div>
  if (preview.status === "loading") return <div className="file-preview-message" role="status"><LoaderCircle className="spin" /><b>Loading {preview.format}</b><p>Reading the File content…</p></div>
  if (preview.status === "error") return <div className="file-preview-message" role="alert"><CircleAlert /><b>Preview unavailable</b><p>The File is still safe to download.</p></div>

  const language = syntaxLanguage(preview.format)
  const renderedMarkdown = markdown && mode === "preview"
  const delimiter = preview.format === "CSV" ? "," : preview.format === "TSV" ? "\t" : null
  return <section className={`file-text-preview${renderedMarkdown ? " is-document-preview" : " is-source-preview"}`} aria-label={`${preview.format} preview`}>
    <header className="file-text-preview-bar">
      <span>{renderedMarkdown ? "Document" : preview.format}</span>
      {markdown && <div className="file-text-view-switch" role="group" aria-label="Markdown view">
        <Button type="button" size="sm" variant={mode === "preview" ? "secondary" : "ghost"} aria-pressed={mode === "preview"} onClick={() => setMode("preview")}>Preview</Button>
        <Button type="button" size="sm" variant={mode === "source" ? "secondary" : "ghost"} aria-pressed={mode === "source"} onClick={() => setMode("source")}>Source</Button>
      </div>}
    </header>
    <div className="file-text-preview-body">
      {renderedMarkdown
        ? <MarkdownDocument text={preview.text} />
        : delimiter ? <DelimitedTable text={preview.text} delimiter={delimiter} />
          : language ? <SyntaxText language={language} text={preview.text} /> : <pre>{preview.text}</pre>}
    </div>
  </section>
}
