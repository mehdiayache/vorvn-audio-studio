import { expect, test, type APIRequestContext, type Request } from "@playwright/test"

type Resource = { id: number; public_id: string; name: string }
type WorkspaceResource = Resource & { description?: string }
type ProductionResource = Resource & { project_id: number | null; folder_id: number | null }
type ProjectResource = Resource & { description?: string }
type WorkspaceOverview = { projects: ProjectResource[]; productions: ProductionResource[] }
type ProjectFolder = Resource & { project_id: number | null; parent_id: number | null }
type FileResource = Resource & { folder_id: number | null }
type ProjectDetail = ProjectResource & { folders: ProjectFolder[]; productions: ProductionResource[]; files: FileResource[] }

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

async function differentWorkspace(request: APIRequestContext, workspaceId: number) {
  const listedResponse = await request.get("/api/v1/workspaces")
  expect(listedResponse.ok()).toBe(true)
  const listed = (await listedResponse.json()).data as WorkspaceResource[]
  const existing = listed.find((workspace) => workspace.id !== workspaceId)
  if (existing) return existing
  const response = await request.post("/api/v1/workspaces", {
    data: {
      name: "Browser Smoke Alternate Workspace",
      description: "Disposable browser Workspace-selection fixture",
    },
  })
  expect(response.ok()).toBe(true)
  return (await response.json()).data as WorkspaceResource
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
  await expect(page.getByRole("region", { name: /^Production Library/ })).toBeVisible()
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
  const wrongWorkspace = await differentWorkspace(request, workspace.id)

  await page.addInitScript((workspaceId) => {
    if (!window.localStorage.getItem("origins.current-workspace")) {
      window.localStorage.setItem("origins.current-workspace", String(workspaceId))
    }
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

  const universalFileName = "Browser Smoke Universal File"
  let universalFile = projectDetail.files.find((item) =>
    item.name === universalFileName && item.folder_id === nestedFolder!.id)
  if (!universalFile) {
    await page.getByRole("button", { name: "Upload File" }).click()
    const uploadDialog = page.getByRole("dialog", { name: "Upload a File" })
    await uploadDialog.locator('input[type="file"]').setInputFiles({
      name: `${universalFileName}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from("Origins universal File browser fixture\n", "utf8"),
    })
    await uploadDialog.getByRole("button", { name: "Upload File" }).click()
    await expect(page.locator(`[data-file-name="${universalFileName}"]`)).toBeVisible()
    const uploadedProjectResponse = await request.get(`/api/v1/projects/${project.public_id}`)
    expect(uploadedProjectResponse.ok()).toBe(true)
    projectDetail = (await uploadedProjectResponse.json()).data as ProjectDetail
    universalFile = projectDetail.files.find((item) =>
      item.name === universalFileName && item.folder_id === nestedFolder!.id)
  }
  expect(universalFile).toBeTruthy()
  await expect(page.locator(`[data-file-id="${universalFile!.id}"][data-file-name="${universalFileName}"]`)).toBeVisible()

  const universalAudioName = "Browser Smoke Universal Audio Fixture"
  let universalAudio = projectDetail.files.find((item) =>
    item.name === universalAudioName && item.folder_id === nestedFolder!.id)
  if (!universalAudio) {
    await page.getByRole("button", { name: "Upload File" }).click()
    const uploadDialog = page.getByRole("dialog", { name: "Upload a File" })
    await uploadDialog.locator('input[type="file"]').setInputFiles("tests/acceptance/sound_scene_multistream_harness/public/qa-cue.wav")
    await uploadDialog.getByRole("textbox", { name: "Name" }).fill(universalAudioName)
    await uploadDialog.getByRole("button", { name: "Upload File" }).click()
    await expect(uploadDialog).toBeHidden()
    await expect(page.locator(`[data-file-name="${universalAudioName}"]`)).toBeVisible()
    const uploadedProjectResponse = await request.get(`/api/v1/projects/${project.public_id}`)
    expect(uploadedProjectResponse.ok()).toBe(true)
    projectDetail = (await uploadedProjectResponse.json()).data as ProjectDetail
    universalAudio = projectDetail.files.find((item) =>
      item.name === universalAudioName && item.folder_id === nestedFolder!.id)
  }
  expect(universalAudio).toBeTruthy()

  await page.getByRole("link", { name: "Library", exact: true }).click()
  await expect(page).toHaveURL(/\/origins\/library$/)
  await expect(page.locator(`[data-file-id="${universalFile!.id}"][data-file-name="${universalFileName}"]`)).toBeVisible()
  await expect(page.getByRole("button", { name: `Add ${universalFileName} to Timeline` })).toHaveCount(0)
  await page.getByRole("button", { name: `Preview ${universalFileName}` }).click()
  const textPreview = page.getByRole("dialog", { name: universalFileName })
  await expect(textPreview.getByText("Origins universal File browser fixture")).toBeVisible()
  await expect(textPreview.getByRole("button", { name: "Copy" })).toBeVisible()
  await expect(textPreview.getByRole("link", { name: `Download ${universalFileName}` })).toHaveAttribute("download", `${universalFileName}.txt`)
  await textPreview.getByRole("button", { name: "Close" }).click()

  await expect(page.locator(`[data-file-id="${universalAudio!.id}"][data-file-name="${universalAudioName}"]`)).toBeVisible()
  await page.getByRole("button", { name: `Preview ${universalAudioName}` }).click()
  const audioPreview = page.getByRole("dialog", { name: universalAudioName })
  const audioPlayer = audioPreview.locator("audio")
  await expect(audioPlayer).toBeVisible()
  expect(await audioPlayer.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(250)
  await expect(audioPreview.getByRole("link", { name: `Download ${universalAudioName}` })).toBeVisible()
  await audioPreview.getByRole("button", { name: "Close" }).click()
  await page.goto(`/origins/projects/${project.public_id}?folder=${nestedFolder!.public_id}`)
  await expect(page.getByRole("button", { name: nestedFolder!.name, current: "page" })).toBeVisible()

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
    const refreshedProjectResponse = await request.get(`/api/v1/projects/${project.public_id}`)
    expect(refreshedProjectResponse.ok()).toBe(true)
    projectDetail = (await refreshedProjectResponse.json()).data as ProjectDetail
    production = projectDetail.productions.find((item) =>
      item.name === "Browser Smoke Project Production" && item.folder_id === nestedFolder!.id)
  }
  expect(production).toBeTruthy()
  const projectSummaryRequests: string[] = []
  const fullProjectRequests: string[] = []
  const captureProjectRequests = (browserRequest: Request) => {
    if (browserRequest.method() !== "GET") return
    const pathname = new URL(browserRequest.url()).pathname
    if (pathname === `/api/v1/workspaces/${workspace.id}/projects`) projectSummaryRequests.push(pathname)
    if (/^\/api\/v1\/projects\/[^/]+$/.test(pathname)) fullProjectRequests.push(pathname)
  }
  page.on("request", captureProjectRequests)
  await page.evaluate(({ workspaceId }) => {
    window.localStorage.setItem("origins.current-workspace", String(workspaceId))
  }, { workspaceId: wrongWorkspace.id })
  const groupedProductionUrl = `/origins/productions/audiovisual/${production!.public_id}`
  await page.goto(groupedProductionUrl)
  await expect(page).toHaveURL(groupedProductionUrl)
  await expect(page.getByRole("button", { name: `Current Workspace: ${workspace.name}` })).toBeVisible()
  await expect(page.getByRole("heading", { name: `Rename Production ${production!.name}` })).toBeVisible()
  await page.getByRole("button", { name: "Creator Library · Create and collect reusable Files" }).click()
  await page.getByRole("combobox", { name: "Library scope" }).click()
  await page.getByRole("option", { name: "Workspace" }).click()
  await expect(page.locator(`[data-file-id="${universalFile!.id}"][data-file-name="${universalFileName}"]`)).toBeVisible()
  await expect(page.getByRole("button", { name: `Add ${universalFileName} to Timeline` })).toHaveCount(0)
  const projectBreadcrumb = page.getByRole("link", { name: project.name, exact: true })
  await expect(projectBreadcrumb).toHaveAttribute(
    "href", `/origins/projects/${project.public_id}?folder=${nestedFolder!.public_id}`)
  await expect.poll(() => projectSummaryRequests.length).toBeGreaterThan(0)
  expect(fullProjectRequests).toEqual([])
  page.off("request", captureProjectRequests)
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
  await page.evaluate(({ workspaceId }) => {
    window.localStorage.setItem("origins.current-workspace", String(workspaceId))
  }, { workspaceId: wrongWorkspace.id })
  const standaloneProductionUrl = `/origins/productions/audiovisual/${standalone.public_id}`
  await page.goto(standaloneProductionUrl)
  await expect(page).toHaveURL(standaloneProductionUrl)
  await expect(page.getByRole("button", { name: `Current Workspace: ${workspace.name}` })).toBeVisible()
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

  const creatorDialog = page.getByRole("dialog", { name: "Create speech" })
  await expect(creatorDialog).toBeVisible()
  await expect(creatorDialog).toBeFocused()
  await expect(page.getByRole("tooltip", { name: /Hide Creator/ })).toHaveCount(0)
  await expect(creatorDialog.locator("[data-slot='dialog-description']")).toHaveClass(/sr-only/)
  const destination = creatorDialog.locator(".create-creator-destination")
  await expect(destination).toHaveCSS("white-space", "nowrap")
  expect(await destination.locator(":scope > *").evaluateAll((elements) => new Set(elements.map((element) => Math.round(element.getBoundingClientRect().top))).size)).toBe(1)
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
