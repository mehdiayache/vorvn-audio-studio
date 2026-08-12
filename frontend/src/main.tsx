import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@fontsource-variable/inter"

import { App } from "@/app"
import "@/design-system/vorvn/snapshot/tokens.css"
import "@/styles/base.css"
import "@/styles/shell.css"
import "@/design-system/vorvn/foundation/theme.css"
import "@/design-system/vorvn/foundation/shell.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
