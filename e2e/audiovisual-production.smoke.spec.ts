import { expect, test, type APIRequestContext } from "@playwright/test"

type Resource = { id: number; public_id: string; name: string }
type WorkspaceResource = Resource & { description?: string }
type ProductionResource = Resource & { project_id: number | null; folder_id: number | null }
type ProjectResource = Resource & { description?: string }
type WorkspaceOverview = { projects: ProjectResource[]; productions: ProductionResource[] }
type ProjectFolder = Resource & { project_id: number | null; parent_id: number | null }
type ProjectDetail = ProjectResource & { folders: ProjectFolder[]; productions: ProductionResource[] }

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
  return { workspace, project }
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

test("uses the fixed desktop rail, then opens Home Project and Production", async ({ page, request }) => {
  const browserIssues: string[] = []
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") browserIssues.push(`${message.type()}: ${message.text()}`)
  })
  page.on("pageerror", (error) => browserIssues.push(`pageerror: ${error.message}`))

  const { workspace, project } = await reusableProjectFixture(request)

  await page.addInitScript((workspaceId) => {
    window.localStorage.setItem("origins.current-workspace", String(workspaceId))
  }, workspace.id)
  await page.goto("/origins/")
  await expect(page.getByRole("heading", { name: "Choose a Workspace" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Origins", exact: true })).toBeVisible()
  await page.getByRole("button", { name: `Open Workspace ${workspace.name}` }).click()
  await expect(page).toHaveURL(/\/origins\/home$/)
  await expect(page.getByText(`Welcome back to ${workspace.name}`)).toBeVisible()
  const shell = page.locator(".studio-app-shell")
  await expect(shell).toHaveAttribute("data-navigation", "rail")
  await expect(page.getByRole("button", { name: /Origins navigation/ })).toHaveCount(0)
  await expect(page.locator(".studio-workspace-bar")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
  await expect(page.locator(".studio-rail")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
  const originsViewport = page.locator(".origins-viewport")
  await expect(originsViewport).toHaveCSS("border-radius", "16px")
  await expect(originsViewport).toHaveCSS("border-top-width", "1px")
  await expect(originsViewport).toHaveCSS("overflow", "clip")
  expect(await originsViewport.evaluate((element) => element.scrollHeight === element.clientHeight)).toBe(true)
  expect(await page.locator(".workspace-recent-rail").evaluateAll((elements) =>
    elements.every((element) => element.scrollWidth === element.clientWidth))).toBe(true)
  const homeLink = page.getByRole("link", { name: "Home", exact: true })
  await expect(homeLink).toHaveCSS("color", "oklch(0.491 0.27 292.581)")
  await expect(homeLink).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
  const projectsLink = page.getByRole("link", { name: "Projects", exact: true })
  await expect(projectsLink).toBeVisible()
  await expect(projectsLink).toHaveCSS("color", "oklch(0.147 0.004 49.3)")
  await expect(page.getByRole("button", { name: `Current Workspace: ${workspace.name}` })).toBeVisible()
  await projectsLink.click()
  await expect(projectsLink).toHaveAttribute("aria-current", "page")
  await expect(projectsLink).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible()
  await homeLink.click()
  await expect(homeLink).toHaveAttribute("aria-current", "page")

  await expect(page.getByText(`Welcome back to ${workspace.name}`)).toBeVisible()
  await expect(page.getByRole("heading", { name: "What do you want to create today?" })).toBeVisible()
  await page.getByRole("link", { name: `Open Project ${project.name}` }).click()
  await expect(page.getByRole("heading", { name: project.name })).toBeVisible()

  const projectResponse = await request.get(`/api/v1/projects/${project.public_id}`)
  expect(projectResponse.ok()).toBe(true)
  let projectDetail = (await projectResponse.json()).data as ProjectDetail
  let folder = projectDetail.folders.find((item) => item.name === "Browser Smoke References")
  if (!folder) {
    await page.getByRole("button", { name: "New Folder" }).click()
    await page.getByRole("textbox", { name: "Name" }).fill("Browser Smoke References")
    await page.getByRole("button", { name: "Create Folder" }).click()
    await expect(page.getByRole("button", { name: "Browser Smoke References" })).toBeVisible()
    const refreshedProjectResponse = await request.get(`/api/v1/projects/${project.public_id}`)
    projectDetail = (await refreshedProjectResponse.json()).data as ProjectDetail
    folder = projectDetail.folders.find((item) => item.name === "Browser Smoke References")
  } else {
    await page.getByRole("button", { name: folder.name }).click()
  }
  expect(folder).toBeTruthy()
  await expect(page).toHaveURL(new RegExp(`\\?folder=${folder!.public_id}$`))

  let nestedFolder = projectDetail.folders.find((item) =>
    item.name === "Browser Smoke Review" && item.parent_id === folder!.id)
  if (!nestedFolder) {
    await page.getByRole("button", { name: "New Folder" }).click()
    await page.getByRole("textbox", { name: "Name" }).fill("Browser Smoke Review")
    await page.getByRole("button", { name: "Create Folder" }).click()
    const refreshedProjectResponse = await request.get(`/api/v1/projects/${project.public_id}`)
    expect(refreshedProjectResponse.ok()).toBe(true)
    projectDetail = (await refreshedProjectResponse.json()).data as ProjectDetail
    nestedFolder = projectDetail.folders.find((item) =>
      item.name === "Browser Smoke Review" && item.parent_id === folder!.id)
  } else {
    await page.getByRole("button", { name: nestedFolder.name }).click()
  }
  expect(nestedFolder).toBeTruthy()
  await expect(page).toHaveURL(new RegExp(`\\?folder=${nestedFolder!.public_id}$`))
  await page.reload()
  await expect(page.getByRole("button", { name: nestedFolder!.name, current: "page" })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`\\?folder=${folder!.public_id}$`))
  await page.goForward()
  await expect(page).toHaveURL(new RegExp(`\\?folder=${nestedFolder!.public_id}$`))

  let production = projectDetail.productions.find((item) =>
    item.name === "Browser Smoke Project Production" && item.folder_id === nestedFolder!.id)
  const reusableProduction = projectDetail.productions.find((item) =>
    item.name === "Browser Smoke Project Production")
  if (!production && reusableProduction) {
    const movedResponse = await request.patch(`/api/v1/productions/${reusableProduction.id}`, {
      data: { project_id: project.id, folder_id: nestedFolder!.id },
    })
    expect(movedResponse.ok()).toBe(true)
    production = (await movedResponse.json()).data as ProductionResource
    await page.reload()
  }
  if (!production) {
    await page.getByRole("button", { name: "New Production" }).click()
    await page.getByRole("textbox", { name: "Name" }).fill("Browser Smoke Project Production")
    await page.getByRole("button", { name: "Create Production" }).click()
    await expect(page.getByRole("heading", { name: "Rename Production Browser Smoke Project Production" })).toBeVisible()
  } else {
    await page.getByRole("link", { name: `Open Production ${production.name}` }).click()
    await expect(page.getByRole("heading", { name: `Rename Production ${production.name}` })).toBeVisible()
  }
  const projectBreadcrumb = page.getByRole("link", { name: project.name, exact: true })
  await expect(projectBreadcrumb).toHaveAttribute(
    "href", `/origins/projects/${project.public_id}?folder=${nestedFolder!.public_id}`)
  await projectBreadcrumb.click()
  await expect(page).toHaveURL(
    `/origins/projects/${project.public_id}?folder=${nestedFolder!.public_id}`)
  await expect(page.getByRole("button", { name: nestedFolder!.name, current: "page" })).toBeVisible()

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
  await expect(page.getByRole("link", { name: "Productions", exact: true }))
    .toHaveAttribute("href", "/origins/productions")
  await expect(page.getByRole("link", { name: project.name, exact: true })).toHaveCount(0)
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
