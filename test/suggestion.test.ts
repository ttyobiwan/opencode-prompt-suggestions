import { afterAll, describe, expect, test } from "bun:test"
import { OpenCode } from "@opencode/client"
import type { SessionMessageInfo } from "@opencode/client"
import { buildPrompt, generateSuggestion, validateSuggestion } from "../src/suggestion"

function exchange(user: string, assistant: string): SessionMessageInfo[] {
  return [
    { type: "user", id: "msg_user", time: { created: 1 }, text: user },
    {
      type: "assistant",
      id: "msg_assistant",
      agent: "build",
      model: { providerID: "test", id: "primary" },
      time: { created: 2, completed: 3 },
      finish: "stop",
      content: [{ type: "text", text: assistant }],
    },
  ]
}

describe("prediction context", () => {
  test("keeps the last four exchanges in order", () => {
    const messages = Array.from({ length: 6 }, (_, i) => exchange(`request-${i}`, `answer-${i}`)).flat()
    const prompt = buildPrompt(messages)!
    expect(prompt).not.toContain("request-0")
    expect(prompt).not.toContain("request-1")
    expect(prompt.indexOf("request-2")).toBeLessThan(prompt.indexOf("request-5"))
  })

  test("excludes reasoning and intermediate tool-driven replies", () => {
    const messages = exchange("Fix it", "Fixed")
    messages.splice(1, 0, {
      type: "assistant", id: "msg_intermediate", agent: "build",
      model: { providerID: "test", id: "primary" }, time: { created: 2, completed: 3 },
      finish: "tool-calls",
      content: [{ type: "text", text: "Intermediate commentary" }, { type: "reasoning", text: "Private reasoning" }],
    })
    const prompt = buildPrompt(messages)!
    expect(prompt).toContain("Fixed")
    expect(prompt).not.toContain("Intermediate commentary")
    expect(prompt).not.toContain("Private reasoning")
  })

  test("does not suggest from an unfinished latest exchange", () => {
    const messages = exchange("First", "Done")
    messages.push({ type: "user", id: "msg_next", time: { created: 4 }, text: "Next" })
    expect(buildPrompt(messages)).toBeUndefined()
  })

  test("bounds serialized context, including Unicode and JSON escaping", () => {
    for (const value of ["🌍".repeat(10_000), "\u0000".repeat(10_000)]) {
      const prompt = buildPrompt(exchange(value, value))!
      const transcript = prompt.split("Transcript (one JSON exchange per line):\n")[1]
      expect(new TextEncoder().encode(transcript).length).toBeLessThanOrEqual(12_000)
      expect(transcript).not.toContain("�")
      expect(() => JSON.parse(transcript)).not.toThrow()
    }
  })

  test("preserves the user request when an escaped assistant response exceeds the budget", () => {
    const user = "Explain this behavior. ".repeat(120)
    const prompt = buildPrompt(exchange(user, "\u0000".repeat(10_000)))!
    const transcript = prompt.split("Transcript (one JSON exchange per line):\n")[1]
    expect(JSON.parse(transcript).user).toBe(user)
    expect(new TextEncoder().encode(transcript).length).toBeLessThanOrEqual(12_000)
  })
})

test("accepts a short line and rejects malformed output", () => {
  expect(validateSuggestion("  Add the tests  ")).toBe("Add the tests")
  for (const text of ["", "first\nsecond", "```prompt```", "x".repeat(241), "hello\u001bworld"]) {
    expect(validateSuggestion(text)).toBeUndefined()
  }
})

const requests: { path: string; body?: { model?: unknown; prompt?: string }; directory: string | null }[] = []
let model: { providerID: string; id: string } | undefined = { providerID: "test", id: "small" }
const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname
    const body = request.method === "POST" ? await request.json() : undefined
    requests.push({ path, body, directory: request.headers.get("x-opencode-directory") })
    if (path.endsWith("/agent/title")) return Response.json({ data: { model } })
    if (path.endsWith("/context")) return Response.json({ data: exchange("Implement this", "Implementation complete") })
    if (path.endsWith("/inbox")) return Response.json({ data: [] })
    if (path.endsWith("/generate")) return Response.json({ data: { text: "Add tests for this change" } })
    return Response.json({ data: { id: "ses_test", location: { directory: "/project with spaces" } } })
  },
})
afterAll(() => server.stop(true))
const client = OpenCode.make({ baseUrl: server.url.toString() })

test("uses the normalized small model through stateless generation", async () => {
  requests.length = 0
  expect(await generateSuggestion(client, "ses_test", new AbortController().signal)).toBe("Add tests for this change")
  const generation = requests.find((entry) => entry.path.endsWith("/generate"))!
  expect(generation.body?.model).toEqual({ providerID: "test", id: "small" })
  expect(generation.directory).toBe(encodeURIComponent("/project with spaces"))
  expect(requests.some((entry) => /prompt|synthetic/.test(entry.path))).toBe(false)
})

test("does not fall back to the primary model when small model is absent", async () => {
  model = undefined
  requests.length = 0
  await expect(generateSuggestion(client, "ses_test", new AbortController().signal)).rejects.toThrow("No small model")
  expect(requests.some((entry) => entry.path.endsWith("/generate"))).toBe(false)
})
