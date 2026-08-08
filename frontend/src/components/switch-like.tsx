import { Checkbox } from "@/components/ui/checkbox"

export function SwitchLike({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="switch-like"><Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} /><span>{label}</span></label>
}
