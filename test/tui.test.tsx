import { expect, test } from "bun:test"
import { PluginContextProvider } from "@opencode/plugin/tui"
import type { Context, SlotClaim } from "@opencode/plugin/tui/context"
import { createTestRenderer } from "@opentui/core/testing"
import { render } from "@opentui/solid"
import { RGBA, TextareaRenderable } from "@opentui/core"
import plugin from "../tui"

test.each([
  { name: "empty prompt", text: "", mode: "normal", inputMode: "base", focused: true, eligible: true },
  { name: "existing draft", text: "My next request", mode: "normal", inputMode: "base", focused: true, eligible: false },
  { name: "shell mode", text: "", mode: "shell", inputMode: "base", focused: true, eligible: false },
  { name: "another input mode", text: "", mode: "normal", inputMode: "dialog", focused: true, eligible: false },
  { name: "unfocused prompt", text: "", mode: "normal", inputMode: "base", focused: false, eligible: false },
] as const)("completion with $name", async (scenario) => {
  const screen = await createTestRenderer({ width: 80, height: 10 })
  const handlers = new Map<string, (event: any) => void>()
  let claim: SlotClaim<"prompt.footer"> | undefined
  const muted = RGBA.fromHex("#888888")
  let draft = ""
  let submitted = false
  let sessionReads = 0
  const editor = new TextareaRenderable(screen.renderer, {
    id: "prompt", width: 80, height: 3, placeholder: "Ask anything",
    initialValue: scenario.text,
    onContentChange: () => { draft = editor.plainText },
    onSubmit: () => { submitted = true },
  })
  const context = {
    renderer: screen.renderer,
    theme: { text: { muted } },
    keymap: { mode: { current: () => scenario.inputMode } },
    ui: {
      slot(value: SlotClaim<"prompt.footer">) { claim = value; return () => {} },
      router: { current: () => ({ type: "session", sessionID: "ses_test" }) },
    },
    data: {
      on(type: string, handler: (event: any) => void) {
        handlers.set(type, handler)
        return () => { handlers.delete(type) }
      },
      session: { status: () => "idle" },
    },
    client: {
      session: {
        get: async () => {
          sessionReads++
          return { location: { directory: "/project" } }
        },
        inbox: { list: async () => [] },
        context: async () => [
          { type: "user", text: "Implement validation" },
          { type: "assistant", time: { completed: 1 }, finish: "stop", content: [{ type: "text", text: "Implemented" }] },
        ],
      },
      agent: { get: async () => ({ data: { model: { providerID: "test", id: "small" } } }) },
      generate: { text: async () => ({ text: "Add validation tests" }) },
    },
  } as unknown as Context
  try {
    await plugin.setup(context)
    await render(() => <PluginContextProvider value={context}>{claim!.render({ sessionID: "ses_test", mode: scenario.mode, showDetails: true })}</PluginContextProvider>, screen.renderer)
    screen.renderer.root.add(editor)
    if (scenario.focused) editor.focus()
    await screen.flush()
    handlers.get("session.execution.succeeded")!({ id: "event_complete", data: { sessionID: "ses_test" } })
    expect(sessionReads).toBe(scenario.eligible ? 1 : 0)
    if (!scenario.eligible) {
      expect(editor.plainText).toBe(scenario.text)
      expect(editor.placeholder).toBe("Ask anything")
      return
    }
    await screen.waitForFrame((frame) => frame.includes("Add validation tests"))
    expect(editor.plainText).toBe("")
    expect(editor.placeholderColor).toEqual(muted)
    let tabPropagated = false
    screen.renderer.keyInput.on("keypress", () => { tabPropagated = true })
    screen.mockInput.pressTab()
    await screen.flush()
    expect(editor.plainText).toBe("Add validation tests")
    expect(draft).toBe("Add validation tests")
    expect(editor.placeholder).toBe("Ask anything")
    expect(submitted).toBe(false)
    expect(tabPropagated).toBe(false)
  } finally {
    await screen.dispose()
    expect(handlers.size).toBe(0)
  }
})
