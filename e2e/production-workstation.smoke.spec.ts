import { expect, test } from "@playwright/test"

type Resource = { id: number; public_id: string; name: string }

test("opens a Production and renders Timeline and Director without browser warnings", async ({ page, request }) => {
  const browserIssues: string[] = []
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") browserIssues.push(`${message.type()}: ${message.text()}`)
  })
  page.on("pageerror", (error) => browserIssues.push(`pageerror: ${error.message}`))

  const marker = `${Date.now()}-${test.info().workerIndex}`
  const ventureResponse = await request.post("/api/v1/ventures", { data: { name: `Browser Smoke Venture ${marker}`, description: "Disposable browser CI fixture" } })
  expect(ventureResponse.ok()).toBe(true)
  const venture = (await ventureResponse.json()).data as Resource

  const projectResponse = await request.post(`/api/v1/ventures/${venture.id}/projects`, { data: { name: `Browser Smoke Project ${marker}`, description: "" } })
  expect(projectResponse.ok()).toBe(true)
  const project = (await projectResponse.json()).data as Resource

  const productionResponse = await request.post(`/api/v1/projects/${project.id}/productions`, { data: { name: `Browser Smoke Production ${marker}`, description: "" } })
  expect(productionResponse.ok()).toBe(true)
  const production = (await productionResponse.json()).data as Resource

  await page.goto(`/audio-studio/productions/${production.public_id}`)
  await expect(page.getByRole("heading", { name: `Rename Production ${production.name}` })).toBeVisible()

  await page.getByRole("button", { name: "Timeline · Assemble audio and visuals" }).click()
  await expect(page.getByLabel("Timeline command bar")).toBeVisible()
  await expect(page.getByRole("complementary", { name: "Media Browser" })).toBeVisible()
  await expect(page.getByRole("button", { name: "New Timeline track" })).toBeVisible()

  await page.getByRole("button", { name: "Director · Create and collect visuals" }).click()
  await expect(page.getByRole("textbox", { name: "Director prompt" })).toBeVisible()
  await expect(page.getByRole("combobox", { name: "Choose generation model" })).toBeVisible()

  expect(browserIssues, browserIssues.join("\n")).toEqual([])
})
