import { Component } from "react"
import type { ErrorInfo, ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { productIdentity } from "@/lib/product-identity"

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${productIdentity.name} UI failure`, error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return <main className="state-page" role="alert">
      <h1>{productIdentity.name} needs to reload this view</h1>
      <p>Your saved work and running Jobs are preserved.</p>
      <Button onClick={() => window.location.reload()}>Reload {productIdentity.name}</Button>
    </main>
  }
}
