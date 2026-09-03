import { expect, test, type APIRequestContext } from "@playwright/test"

type Resource = { id: number; public_id: string; name: string }
type WorkspaceResource = Resource & { description?: string }
type ProductionResource = Resource & { project_id: number | null }
type ProjectResource = Resource & { description?: string }
type WorkspaceOverview = { projects: ProjectResource[]; productions: ProductionResource[] }

async function reusableBrowserFixture(request: APIRequestContext) {
  const listedResponse = await request.get("/api/v1/workspaces")
  expect(listedResponse.ok()).toBe(true)
  const listed = (await listedResponse.json()).data as WorkspaceResource[]
  let workspace = listed.find(({ description }) => description === "Disposable browser CI fixture")
  if (!workspace) {
    const workspaceResponse = await request.post("/api/v1/workspaces", { data: { name: "Browser Smoke Workspace", description: "Disposable browser CI fixture" } })
    expect(workspaceResponse.ok()).toBe(true)
    workspace = (await workspaceResponse.json()).data as WorkspaceResource
  }

  const overviewResponse = await request.get(`/api/v1/workspaces/${workspace.id}`)
  expect(overviewResponse.ok()).toBe(true)
  const overview = (await overviewResponse.json()).data as WorkspaceOverview
  let production = overview.productions[0]
  if (!production) {
    const productionResponse = await request.post(`/api/v1/workspaces/${workspace.id}/productions/audiovisual`, { data: { name: "Browser Smoke Audiovisual Production", description: "" } })
    expect(productionResponse.ok()).toBe(true)
    production = (await productionResponse.json()).data as ProductionResource
  }
  return { workspace, production }
}

async function reusableProjectFixture(request: APIRequestContext) {
  const { workspace } = await reusableBrowserFixture(request)
  const overviewResponse = await request.get(`/api/v1/workspaces/${workspace.id}`)
  expect(overviewResponse.ok()).toBe(true)
  const overview = (await overviewResponse.json()).data as WorkspaceOverview
  let project = overview.projects.find(({ description }) => description === "Disposable browser Project fixture")
  if (!project) {
    const projectResponse = await request.post(`/api/v1/workspaces/${workspace.id}/projects`, {
      data: { name: "Browser Smoke Project", description: "Disposable browser Project fixture" },
    })
    expect(projectResponse.ok()).toBe(true)
    project = (await projectResponse.json()).data as ProjectResource
  }
  let production = overview.productions.find((item) => item.project_id === project.id)
    || overview.productions.find((item) => item.project_id === null)
  if (!production) {
    const productionResponse = await request.post(`/api/v1/workspaces/${workspace.id}/productions/audiovisual`, {
      data: { name: "Browser Smoke Grouped Production", description: "" },
    })
    expect(productionResponse.ok()).toBe(true)
    production = (await productionResponse.json()).data as ProductionResource
  }
  if (production.project_id !== project.id) {
    const membershipResponse = await request.patch(`/api/v1/productions/${production.id}`, {
      data: { project_id: project.id },
    })
    expect(membershipResponse.ok()).toBe(true)
  }
  return { workspace, project, production }
}

test("opens an audiovisual Production and renders Timeline and Creator Library without browser warnings", async ({ page, request }) => {
  const browserIssues: string[] = []
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") browserIssues.push(`${message.type()}: ${message.text()}`)
  })
  page.on("pageerror", (error) => browserIssues.push(`pageerror: ${error.message}`))

  const { production } = await reusableBrowserFixture(request)

  await page.goto(`/origins/productions/audiovisual/${production.public_id}`)
  await expect(page.getByRole("heading", { name: `Rename Production ${production.name}` })).toBeVisible()

  await page.getByRole("button", { name: "Timeline · Assemble audio and visuals" }).click()
  await expect(page.getByLabel("Timeline command bar")).toBeVisible()
  await expect(page.getByRole("complementary", { name: "Media Browser" })).toBeVisible()
  await expect(page.getByRole("button", { name: "New Timeline track" })).toBeVisible()

  await page.getByRole("button", { name: "Creator Library · Create and collect reusable Files" }).click()
  await expect(page.getByRole("heading", { name: "No Files yet" })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Media prompt" })).toBeVisible()
  await expect(page.getByRole("combobox", { name: "Choose generation model" })).toBeVisible()
  await page.getByRole("button", { name: "Hide Creator" }).click()
  await expect(page.getByRole("button", { name: "Show Creator" })).toBeVisible()
  await page.getByRole("button", { name: "Show Creator" }).click()
  await expect(page.getByRole("textbox", { name: "Media prompt" })).toBeVisible()

  expect(browserIssues, browserIssues.join("\n")).toEqual([])
})

test("expands and collapses the desktop rail, then opens Home Project and Production", async ({ page, request }) => {
  const browserIssues: string[] = []
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") browserIssues.push(`${message.type()}: ${message.text()}`)
  })
  page.on("pageerror", (error) => browserIssues.push(`pageerror: ${error.message}`))

  const { workspace, project, production } = await reusableProjectFixture(request)

  await page.addInitScript((workspaceId) => {
    window.localStorage.setItem("origins.current-workspace", String(workspaceId))
  }, workspace.id)
  await page.goto("/origins/")
  await expect(page.getByRole("heading", { name: "Choose a Workspace" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Origins", exact: true })).toBeVisible()
  await page.getByRole("button", { name: `Open Workspace ${workspace.name}` }).click()
  await expect(page).toHaveURL(/\/origins\/home$/)
  await expect(page.getByRole("heading", { name: workspace.name })).toBeVisible()
  const shell = page.locator(".studio-app-shell")
  const railToggle = page.locator(".studio-rail .studio-rail-toggle")
  await expect(shell).toHaveAttribute("data-rail-expanded", "false")
  await expect(railToggle).toHaveAccessibleName("Expand Origins navigation")
  await railToggle.click()
  await expect(shell).toHaveAttribute("data-rail-expanded", "true")
  const projectsLink = page.getByRole("link", { name: "Projects", exact: true })
  await expect(projectsLink).toBeVisible()
  await expect(page.getByRole("button", { name: `Current Workspace: ${workspace.name}` })).toBeVisible()
  await projectsLink.click()
  await expect(projectsLink).toHaveAttribute("aria-current", "page")
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible()
  const homeLink = page.getByRole("link", { name: "Home", exact: true })
  await homeLink.click()
  await expect(homeLink).toHaveAttribute("aria-current", "page")
  await railToggle.click()
  await expect(shell).toHaveAttribute("data-rail-expanded", "false")

  await expect(page.getByRole("heading", { name: workspace.name })).toBeVisible()
  await expect(page.getByRole("heading", { name: "What do you want to create today?" })).toBeVisible()
  await page.getByRole("link", { name: `Open Project ${project.name}` }).click()
  await expect(page.getByRole("heading", { name: project.name })).toBeVisible()
  await page.getByRole("link", { name: `Open Production ${production.name}` }).click()
  await expect(page.getByRole("heading", { name: `Rename Production ${production.name}` })).toBeVisible()

  const refreshedResponse = await request.get(`/api/v1/workspaces/${workspace.id}`)
  const refreshed = (await refreshedResponse.json()).data as WorkspaceOverview
  let standalone = refreshed.productions.find((item) => item.project_id === null)
  if (!standalone) {
    const standaloneResponse = await request.post(`/api/v1/workspaces/${workspace.id}/productions/audiovisual`, {
      data: { name: "Browser Smoke Standalone Production", description: "" },
    })
    expect(standaloneResponse.ok()).toBe(true)
    standalone = (await standaloneResponse.json()).data as ProductionResource
  }
  await page.goto(`/origins/productions/audiovisual/${standalone.public_id}`)
  await expect(page.getByRole("heading", { name: `Rename Production ${standalone.name}` })).toBeVisible()
  expect(browserIssues, browserIssues.join("\n")).toEqual([])
})

test("opens standalone Speech in the shared Creator Library grammar", async ({ page }) => {
  const browserIssues: string[] = []
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") browserIssues.push(`${message.type()}: ${message.text()}`)
  })
  page.on("pageerror", (error) => browserIssues.push(`pageerror: ${error.message}`))

  await page.goto("/origins/create/generate-speech")

  await expect(page.getByRole("dialog", { name: "Create speech" })).toBeVisible()
  await expect(page.getByRole("region", { name: "Creator Library" })).toBeVisible()
  const creator = page.getByRole("complementary", { name: "Creator" })
  await expect(creator).toBeVisible()
  await expect(page.getByRole("main", { name: "Library" })).toBeVisible()
  const modelPicker = creator.getByRole("combobox", { name: "Speech model" })
  await expect(modelPicker).toBeVisible()
  await expect(modelPicker).toBeEnabled()
  await expect(modelPicker).not.toHaveText(/Choose model/i)
  await creator.getByRole("button", { name: "Choose a voice" }).click()
  await page.locator(".voice-picker-select").first().click()
  await expect(creator.getByRole("button", { name: "Recording mode" })).toBeEnabled()
  await expect(page.getByRole("radiogroup", { name: "Library file type" })).toBeVisible()

  await creator.getByRole("button", { name: "Music", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "Create music" })).toBeVisible()
  await expect(creator.getByRole("combobox", { name: "Music model" })).toBeVisible()
  await expect(creator.getByRole("textbox", { name: "Music prompt" })).toBeVisible()

  await creator.getByRole("button", { name: "Sound Effect", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "Create a sound effect" })).toBeVisible()
  await expect(creator.getByRole("combobox", { name: "Sound Effect model" })).toBeVisible()
  await expect(creator.getByRole("textbox", { name: "Sound Effect prompt" })).toBeVisible()

  expect(browserIssues, browserIssues.join("\n")).toEqual([])
})
