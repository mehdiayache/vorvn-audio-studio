import { Children, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"

import { cn } from "@/lib/utils"

import "./file-masonry.css"

function masonryColumnCount(width: number, minimumColumnWidth: number, maximumColumns: number, gap: number) {
  if (width <= 0) return maximumColumns
  return Math.max(1, Math.min(maximumColumns, Math.floor((width + gap) / (minimumColumnWidth + gap))))
}

export function FileMasonry({
  children,
  className,
  maximumColumns = 5,
  minimumColumnWidth = 176,
  gap = 10,
}: {
  children: ReactNode
  className?: string
  maximumColumns?: number
  minimumColumnWidth?: number
  gap?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(maximumColumns)
  const count = Children.count(children)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const update = (width: number) => setColumns(masonryColumnCount(width, minimumColumnWidth, maximumColumns, gap))
    update(container.getBoundingClientRect().width)
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) update(entry.contentRect.width)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [gap, maximumColumns, minimumColumnWidth])

  return <div
    ref={containerRef}
    className={cn("file-masonry", count > 0 && count <= columns && "is-single-row", className)}
    style={{ "--file-masonry-columns": columns, "--file-masonry-gap": `${gap}px` } as CSSProperties}
  >{children}</div>
}
