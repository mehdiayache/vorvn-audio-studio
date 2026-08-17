export const COSYVOICE_SSML_CHARACTER_LIMIT = 20_000

export type SsmlValidation = {
  valid: boolean
  message: string
}

function xmlParser() {
  return new DOMParser()
}

function parserError(document: Document) {
  return document.getElementsByTagName("parsererror")[0]
    || document.getElementsByTagNameNS("http://www.mozilla.org/newlayout/xml/parsererror.xml", "parsererror")[0]
}

export function escapeSsmlText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

export function wrapPlainTextAsSsml(value: string) {
  return `<speak>\n${escapeSsmlText(value)}\n</speak>`
}

export function validateSsmlDocument(value: string): SsmlValidation {
  const text = value.trim()
  if (!text) return { valid: false, message: "Write an SSML document first." }
  if (value.length > COSYVOICE_SSML_CHARACTER_LIMIT) {
    return { valid: false, message: `One SSML document cannot exceed ${COSYVOICE_SSML_CHARACTER_LIMIT.toLocaleString()} characters.` }
  }
  const folded = text.toLocaleLowerCase()
  if (folded.includes("<!doctype") || folded.includes("<!entity")) {
    return { valid: false, message: "SSML document declarations and entities are not supported." }
  }

  const document = xmlParser().parseFromString(text, "application/xml")
  const error = parserError(document)
  if (error) {
    const rawDetail = (error.textContent || "The XML is malformed.").replace(/\s+/g, " ").trim()
    const detail = rawDetail.match(/error on line.*?(?=Below is a rendering|$)/i)?.[0]
      || rawDetail
    return { valid: false, message: `Invalid SSML: ${detail}` }
  }
  if (document.documentElement.localName.toLocaleLowerCase() !== "speak") {
    return { valid: false, message: "SSML must have one <speak> root element." }
  }
  return { valid: true, message: "Valid SSML document" }
}

export function ssmlToPlainText(value: string) {
  const document = xmlParser().parseFromString(value, "application/xml")
  if (!parserError(document) && document.documentElement.localName.toLocaleLowerCase() === "speak") {
    return document.documentElement.textContent?.trim() || ""
  }
  return value
    .replace(/<\?xml[^>]*>/gi, "")
    .replace(/<\/?speak(?:\s[^>]*)?>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .trim()
}
