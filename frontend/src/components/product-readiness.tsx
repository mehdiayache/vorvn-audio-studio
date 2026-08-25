import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

import { studioApi } from "@/lib/api"
import { productIdentity } from "@/lib/product-identity"
import type { StudioConfig } from "@/types/domain"

export type ProductReadiness =
  | { status: "checking"; config: null; message: string }
  | { status: "ready"; config: StudioConfig; message: string }
  | { status: "setup_required"; config: StudioConfig; message: string }
  | { status: "unavailable"; config: null; message: string }

type ReadinessContextValue = ProductReadiness & { refresh: () => Promise<void> }

const ProductReadinessContext = createContext<ReadinessContextValue | null>(null)

export function ProductReadinessProvider({ children }: { children: React.ReactNode }) {
  const [readiness, setReadiness] = useState<ProductReadiness>({
    status: "checking",
    config: null,
    message: `Checking ${productIdentity.name}`,
  })

  const refresh = useCallback(async () => {
    setReadiness({ status: "checking", config: null, message: `Checking ${productIdentity.name}` })
    try {
      const config = await studioApi.config()
      setReadiness(config.has_key
        ? { status: "ready", config, message: `${productIdentity.name} ready` }
        : { status: "setup_required", config, message: "Setup required" })
    } catch {
      setReadiness({ status: "unavailable", config: null, message: `${productIdentity.name} unavailable` })
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  const value = useMemo(() => ({ ...readiness, refresh }), [readiness, refresh])
  return <ProductReadinessContext.Provider value={value}>{children}</ProductReadinessContext.Provider>
}

export function useProductReadiness() {
  const value = useContext(ProductReadinessContext)
  if (!value) throw new Error("useProductReadiness must be used inside ProductReadinessProvider")
  return value
}
