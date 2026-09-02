import { expect, test } from "@playwright/test"

type Resource = { id: number; public_id: string; name: string }

test("opens an audiovisual Project and renders Timeline and Creator Library without browser warnings", async ({ page, request }) => {
  const browserIssues: string[] = []
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") browserIssues.push(`${message.type()}: ${message.text()}`)
  })
  page.on("pageerror", (error) => browserIssues.push(`pageerror: ${error.message}`))

  const marker = `${Date.now()}-${test.info().workerIndex}`
  const workspaceResponse = await request.post("/api/v1/workspaces", { data: { name: `Browser Smoke Workspace ${marker}`, description: "Disposable browser CI fixture" } })
  expect(workspaceResponse.ok()).toBe(true)
  const workspace = (await workspaceResponse.json()).data as Resource

  const projectResponse = await request.post(`/api/v1/workspaces/${workspace.id}/projects/audiovisual`, { data: { name: `Browser Smoke Project ${marker}`, description: "" } })
  expect(projectResponse.ok()).toBe(true)
  const project = (await projectResponse.json()).data as Resource

  await page.goto(`/origins/projects/audiovisual/${project.public_id}`)
  await expect(page.getByRole("heading", { name: `Rename Project ${project.name}` })).toBeVisible()

  await page.getByRole("button", { name: "Timeline · Assemble audio and visuals" }).click()
  await expect(page.getByLabel("Timeline command bar")).toBeVisible()
  await expect(page.getByRole("complementary", { name: "Media Browser" })).toBeVisible()
  await expect(page.getByRole("button", { name: "New Timeline track" })).toBeVisible()

  await page.getByRole("button", { name: "Creator Library · Create and collect reusable Files" }).click()
  await expect(page.getByRole("heading", { name: "No media collected yet" })).toBeVisible()
  await page.getByRole("button", { name: "Show Creator" }).click()
  await expect(page.getByRole("textbox", { name: "Media prompt" })).toBeVisible()
  await expect(page.getByRole("combobox", { name: "Choose generation model" })).toBeVisible()

  expect(browserIssues, browserIssues.join("\n")).toEqual([])
})
