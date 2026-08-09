import { Component } from "react"
import type { ErrorInfo, ReactNode } from "react"

import { Button } from "@/components/ui/button"

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Audio Studio UI failure", error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return <main className="state-page" role="alert">
      <h1>Audio Studio needs to reload this view</h1>
      <p>Your saved work and running Jobs are preserved.</p>
      <Button onClick={() => window.location.reload()}>Reload Audio Studio</Button>
    </main>
  }
}
