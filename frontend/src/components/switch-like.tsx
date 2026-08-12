import { Checkbox } from "@/components/ui/checkbox"

export function SwitchLike({ label, checked, disabled = false, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return <label className="switch-like"><Checkbox checked={checked} disabled={disabled} onCheckedChange={(value) => onChange(value === true)} /><span>{label}</span></label>
}
