import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@fontsource-variable/inter"

import { App } from "@/app"
import { productIdentity } from "@/lib/product-identity"
import "@/styles/base.css"
import "@/styles/studio-deck.css"

document.title = productIdentity.documentTitle

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
