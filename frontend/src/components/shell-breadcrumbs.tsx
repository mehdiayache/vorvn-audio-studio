import { Clapperboard, ChevronRight } from "lucide-react"
import { Link } from "react-router-dom"

import { originsBase } from "@/lib/links"

export function ShellBreadcrumbs({ leaf, className = "" }: { leaf?: string; className?: string }) {
  return <nav className={`shell-breadcrumbs ${className}`.trim()} aria-label="Location">
    <Link className="shell-breadcrumb-root" to={`${originsBase}/`}><Clapperboard /><span>Origins</span></Link>
    {leaf && <span className="shell-breadcrumb-item"><ChevronRight /><b aria-current="page">{leaf}</b></span>}
  </nav>
}
