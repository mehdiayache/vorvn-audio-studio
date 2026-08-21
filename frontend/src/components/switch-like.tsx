import { Switch } from "@/components/ui/switch"

export function SwitchLike({ label, checked, disabled = false, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return <label className="switch-like flex min-h-8 cursor-pointer items-center justify-between gap-3 text-sm has-disabled:cursor-not-allowed has-disabled:opacity-60">
    <span>{label}</span>
    <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={label} />
  </label>
}
