import { expect, test } from "bun:test"
import { RGBA, TextareaRenderable } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { inputSuggestion } from "../src/input-suggestion"

test("typing, paste, focus loss, and disposal restore the original placeholder", async () => {
  const screen = await createTestRenderer({ width: 80, height: 10 })
  const editor = new TextareaRenderable(screen.renderer, { id: "prompt", placeholder: "Ask anything", width: 80, height: 3 })
  const other = new TextareaRenderable(screen.renderer, { id: "dialog", width: 80, height: 3 })
  screen.renderer.root.add(editor)
  screen.renderer.root.add(other)
  editor.focus()
  const originalColor = editor.placeholderColor
  const input = inputSuggestion(screen.renderer, () => true)
  const muted = RGBA.fromHex("#888888")
  try {
    input.show("Add tests", muted)
    screen.mockInput.pressKey("x")
    expect(editor.plainText).toBe("x")
    expect(editor.placeholder).toBe("Ask anything")
    expect(editor.placeholderColor).toEqual(originalColor)
    input.show("Add tests", muted)
    expect(editor.placeholder).toBe("Ask anything")
    screen.mockInput.pressBackspace()
    input.show("Add tests", muted)
    screen.mockInput.pasteBracketedText("pasted")
    expect(editor.plainText).toBe("pasted")
    expect(editor.placeholder).toBe("Ask anything")
    editor.setText("")
    input.show("Add tests", muted)
    other.focus()
    expect(editor.placeholder).toBe("Ask anything")
    screen.mockInput.pressTab()
    expect(other.plainText).not.toBe("Add tests")
    editor.focus()
    input.show("Add tests", muted)
    input.dispose()
    expect(editor.placeholder).toBe("Ask anything")
    expect(editor.placeholderColor).toEqual(originalColor)
  } finally {
    input.dispose()
    await screen.dispose()
  }
})
