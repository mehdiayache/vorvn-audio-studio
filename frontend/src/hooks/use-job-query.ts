import { useCallback } from "react"
import { useSearchParams } from "react-router-dom"

/**
 * Keeps the identity of a durable backend Job in the route that created it.
 * The Job remains observable after its initiating component unmounts and can
 * be recovered by opening or reloading the same URL.
 */
export function useJobQuery(parameter = "job") {
  const [search, setSearch] = useSearchParams()
  const jobId = search.get(parameter) || null
  const setJobId = useCallback((id: string | null, replace = true) => {
    setSearch((current) => {
      const next = new URLSearchParams(current)
      if (id) next.set(parameter, id)
      else next.delete(parameter)
      return next
    }, { replace })
  }, [parameter, setSearch])
  return [jobId, setJobId] as const
}
