import { expect, test } from "@playwright/test"

type Resource = { id: number; public_id: string; name: string }

test("opens an audiovisual Project and renders Timeline and Director without browser warnings", async ({ page, request }) => {
  const browserIssues: string[] = []
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") browserIssues.push(`${message.type()}: ${message.text()}`)
  })
  page.on("pageerror", (error) => browserIssues.push(`pageerror: ${error.message}`))

  const marker = `${Date.now()}-${test.info().workerIndex}`
  const spaceResponse = await request.post("/api/v1/spaces", { data: { name: `Browser Smoke Space ${marker}`, description: "Disposable browser CI fixture" } })
  expect(spaceResponse.ok()).toBe(true)
  const space = (await spaceResponse.json()).data as Resource

  const projectResponse = await request.post(`/api/v1/spaces/${space.id}/projects/audiovisual`, { data: { name: `Browser Smoke Project ${marker}`, description: "" } })
  expect(projectResponse.ok()).toBe(true)
  const project = (await projectResponse.json()).data as Resource

  await page.goto(`/audio-studio/projects/audiovisual/${project.public_id}`)
  await expect(page.getByRole("heading", { name: `Rename Production ${project.name}` })).toBeVisible()

  await page.getByRole("button", { name: "Timeline · Assemble audio and visuals" }).click()
  await expect(page.getByLabel("Timeline command bar")).toBeVisible()
  await expect(page.getByRole("complementary", { name: "Media Browser" })).toBeVisible()
  await expect(page.getByRole("button", { name: "New Timeline track" })).toBeVisible()

  await page.getByRole("button", { name: "Director · Create and collect visuals" }).click()
  await expect(page.getByRole("textbox", { name: "Director prompt" })).toBeVisible()
  await expect(page.getByRole("combobox", { name: "Choose generation model" })).toBeVisible()

  expect(browserIssues, browserIssues.join("\n")).toEqual([])
})
