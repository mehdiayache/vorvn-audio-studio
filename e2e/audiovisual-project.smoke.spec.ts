import { expect, test, type APIRequestContext } from "@playwright/test"

type Resource = { id: number; public_id: string; name: string }
type WorkspaceResource = Resource & { description?: string }
type WorkspaceOverview = { projects: Resource[] }

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
  let project = overview.projects[0]
  if (!project) {
    const projectResponse = await request.post(`/api/v1/workspaces/${workspace.id}/projects/audiovisual`, { data: { name: "Browser Smoke Audiovisual Project", description: "" } })
    expect(projectResponse.ok()).toBe(true)
    project = (await projectResponse.json()).data as Resource
  }
  return project
}

test("opens an audiovisual Project and renders Timeline and Creator Library without browser warnings", async ({ page, request }) => {
  const browserIssues: string[] = []
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") browserIssues.push(`${message.type()}: ${message.text()}`)
  })
  page.on("pageerror", (error) => browserIssues.push(`pageerror: ${error.message}`))

  const project = await reusableBrowserFixture(request)

  await page.goto(`/origins/projects/audiovisual/${project.public_id}`)
  await expect(page.getByRole("heading", { name: `Rename Project ${project.name}` })).toBeVisible()

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
