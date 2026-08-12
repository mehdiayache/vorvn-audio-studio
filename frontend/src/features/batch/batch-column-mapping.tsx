import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { BatchPreview } from "@/types/domain"

export const sameForEveryRow = "__same__"
export type BatchColumns = { text: string; name: string; voice: string; language: string }

export function mappedColumn(value: string) {
  return value === sameForEveryRow ? null : Number(value)
}

export function BatchColumnMapping({ sheet, columns, onChange, unknownVoices }: {
  sheet: BatchPreview
  columns: BatchColumns
  onChange: (columns: BatchColumns) => void
  unknownVoices: Array<{ voice: string; first_row: number }>
}) {
  const textColumn = mappedColumn(columns.text) ?? 0
  const nameColumn = mappedColumn(columns.name)
  return <>
    <div className="batch-mapping">{(["text", "name", "voice", "language"] as const).map((key) => <label key={key}>
      <span>{key === "text" ? "Words to speak" : key === "name" ? "File name" : key === "voice" ? "Exact route ID per row" : "Language per row"}</span>
      <Select value={columns[key]} onValueChange={(value) => onChange({ ...columns, [key]: value })}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {key !== "text" && <SelectItem value={sameForEveryRow}>Same setup for every row</SelectItem>}
          {sheet.headers.map((header, index) => <SelectItem value={String(index)} key={`${header}-${index}`}>{header}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>)}</div>
    {mappedColumn(columns.voice) !== null && <p className={unknownVoices.length ? "batch-warning" : "batch-mapping-ok"}>
      {unknownVoices.length
        ? `${unknownVoices.length} unresolved exact route ID(s): ${unknownVoices.slice(0, 3).map((item) => `${item.voice} (row ${item.first_row})`).join(", ")}. Generation is blocked until they are corrected.`
        : "Every populated route ID in this column resolves to a ready cloned binding or provider catalogue voice."}
    </p>}
    <div className="batch-table"><table><thead><tr><th>Output file</th><th>Words</th></tr></thead><tbody>{sheet.preview.map((row, index) => {
      const words = (row[textColumn] || "").trim()
      const label = nameColumn == null ? `row-${index + 2}` : (row[nameColumn] || `row-${index + 2}`).trim()
      return <tr key={index}><td>{label}.mp3</td><td className={!words ? "empty" : ""}>{words || "Empty — skipped"}</td></tr>
    })}</tbody></table></div>
  </>
}
