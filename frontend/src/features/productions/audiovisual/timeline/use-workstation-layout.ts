import { useStudioWorkstationLayout } from "@/components/use-studio-workstation-layout"

export function useWorkstationLayout() {
  return useStudioWorkstationLayout({ storageKey: "origins.timeline.workstation-layout.v1" })
}
