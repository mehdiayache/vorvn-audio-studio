import { NavLink } from "react-router-dom"

import { StudioIcon, type StudioIconRole } from "@/design-system/vorvn/icons/icon-contract"
import { cn } from "@/lib/utils"

export type StudioNavigationItem = {
  id: string
  label: string
  iconRole: StudioIconRole
  href: string
}

export function StudioHorizontalChrome({ items, className }: { items: StudioNavigationItem[]; className?: string }) {
  return (
    <nav className={cn("vorvn-studio-chrome", className)} aria-label="Audio Studio tools">
      <div className="vorvn-studio-chrome-scroll">
        {items.map((item) => (
          <NavLink
            key={item.id}
            to={item.href}
            end={item.href === "/audio-studio/"}
            className={({ isActive }) => cn("vorvn-studio-chrome-link", isActive && "is-active")}
          >
            <StudioIcon role={item.iconRole} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

