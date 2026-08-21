const SAMPLE_RATE = 8000
const CHANNELS = 1
const BYTES_PER_SAMPLE = 2
const DURATION_SECONDS = 60 * 60
const HEADER_BYTES = 44
const DATA_BYTES = SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE * DURATION_SECONDS
const FILE_BYTES = HEADER_BYTES + DATA_BYTES

function writeHeader(bytes, offset) {
  const header = new ArrayBuffer(HEADER_BYTES)
  const view = new DataView(header)
  const text = (at, value) => [...value].forEach((char, index) => view.setUint8(at + index, char.charCodeAt(0)))
  text(0, "RIFF")
  view.setUint32(4, 36 + DATA_BYTES, true)
  text(8, "WAVE")
  text(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, CHANNELS, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE, true)
  view.setUint16(32, CHANNELS * BYTES_PER_SAMPLE, true)
  view.setUint16(34, 16, true)
  text(36, "data")
  view.setUint32(40, DATA_BYTES, true)
  const source = new Uint8Array(header)
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = source[offset + index]
}

function renderRange(start, end) {
  const bytes = new Uint8Array(end - start + 1)
  let cursor = 0
  if (start < HEADER_BYTES) {
    const headerEnd = Math.min(end, HEADER_BYTES - 1)
    writeHeader(bytes.subarray(0, headerEnd - start + 1), start)
    cursor = headerEnd - start + 1
  }
  for (; cursor < bytes.length; cursor += 1) {
    const fileOffset = start + cursor
    const pcmOffset = fileOffset - HEADER_BYTES
    const sampleIndex = Math.floor(pcmOffset / BYTES_PER_SAMPLE)
    const byteIndex = pcmOffset % BYTES_PER_SAMPLE
    const withinMinute = sampleIndex % (SAMPLE_RATE * 60)
    const sample = withinMinute < SAMPLE_RATE / 20
      ? Math.round(14000 * Math.sin(2 * Math.PI * 880 * withinMinute / SAMPLE_RATE))
      : 0
    bytes[cursor] = byteIndex === 0 ? sample & 0xff : (sample >> 8) & 0xff
  }
  return bytes
}

function rangedResponse(request) {
  const range = request.headers.get("range")
  const headers = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Content-Type": "audio/wav",
  }
  if (!range) {
    let cursor = 0
    const stream = new ReadableStream({
      pull(controller) {
        if (cursor >= FILE_BYTES) { controller.close(); return }
        const end = Math.min(FILE_BYTES - 1, cursor + 256 * 1024 - 1)
        controller.enqueue(renderRange(cursor, end))
        cursor = end + 1
      },
    })
    return new Response(stream, {
      status: 200, headers: { ...headers, "Content-Length": String(FILE_BYTES) },
    })
  }
  const match = /bytes=(\d+)-(\d*)/.exec(range)
  const start = Math.min(FILE_BYTES - 1, Number(match?.[1] || 0))
  const requestedEnd = match?.[2] ? Number(match[2]) : start + 1024 * 1024 - 1
  const end = Math.min(FILE_BYTES - 1, requestedEnd)
  return new Response(renderRange(start, end), {
    status: 206,
    headers: {
      ...headers,
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${FILE_BYTES}`,
    },
  })
}

self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()))
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))
self.addEventListener("fetch", (event) => {
  if (new URL(event.request.url).pathname.endsWith("/qa-60.wav"))
    event.respondWith(rangedResponse(event.request))
})
