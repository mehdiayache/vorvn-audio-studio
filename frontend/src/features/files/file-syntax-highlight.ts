import { createBundledHighlighter, createSingletonShorthands } from "shiki/core"
import { createJavaScriptRegexEngine } from "shiki/engine/javascript"

const bundledLanguages = {
  json: () => import("@shikijs/langs/json"),
  markdown: () => import("@shikijs/langs/markdown"),
  xml: () => import("@shikijs/langs/xml"),
  yaml: () => import("@shikijs/langs/yaml"),
}

const bundledThemes = {
  "github-dark-default": () => import("@shikijs/themes/github-dark-default"),
}

const createFileHighlighter = createBundledHighlighter({
  langs: bundledLanguages,
  themes: bundledThemes,
  engine: () => createJavaScriptRegexEngine(),
})

const { codeToTokens } = createSingletonShorthands(createFileHighlighter)

export type FileSyntaxLanguage = keyof typeof bundledLanguages
export type FileSyntaxLine = Array<{ color?: string; content: string }>

export async function highlightFileText(code: string, language: FileSyntaxLanguage) {
  const result = await codeToTokens(code, {
    lang: language,
    theme: "github-dark-default",
  })
  return result.tokens.map((line): FileSyntaxLine => line.map(({ color, content }) => ({ color, content })))
}
