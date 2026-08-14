import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@fontsource-variable/inter"

import { App } from "@/app"
import "@/design-system/vorvn/snapshot/tokens.css"
import "@/design-system/vorvn/foundation/theme.css"
import "@/styles/base.css"
import "@/styles/studio-deck.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
