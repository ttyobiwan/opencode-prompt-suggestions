import type { CliRenderer, KeyEvent, TextareaRenderable } from "@opentui/core"

export function inputSuggestion(renderer: CliRenderer, available: () => boolean) {
  let current: {
    editor: TextareaRenderable
    text: string
    placeholder: TextareaRenderable["placeholder"]
    color: TextareaRenderable["placeholderColor"]
  } | undefined

  function eligibleEditor() {
    const editor = renderer.currentFocusedEditor
    if (!available() || !editor || editor.isDestroyed || editor.plainText !== "") return
    // OpenCode does not expose its prompt; use the focused textarea's OpenTUI interface.
    if (!("placeholder" in editor) || !("placeholderColor" in editor)) return
    return editor as TextareaRenderable
  }

  function clear() {
    const previous = current
    current = undefined
    if (!previous || previous.editor.isDestroyed) return
    if (previous.editor.placeholder === previous.text) {
      previous.editor.placeholder = previous.placeholder
      previous.editor.placeholderColor = previous.color
    }
  }

  function keypress(event: KeyEvent) {
    const suggestion = current
    if (!suggestion) return
    const accept = event.name === "tab" && !event.shift && !event.ctrl && !event.meta && !event.option && !event.super && !event.hyper
    const editor = suggestion.editor
    const active = eligibleEditor() === editor
    clear()
    if (!accept || !active) return
    event.preventDefault()
    event.stopPropagation()
    editor.insertText(suggestion.text)
  }

  function focusChanged() {
    if (current && renderer.currentFocusedEditor !== current.editor) clear()
  }

  renderer.keyInput.prependListener("keypress", keypress)
  renderer.keyInput.prependListener("paste", clear)
  renderer.on("focused_editor", focusChanged)

  return {
    clear,
    canShow: () => eligibleEditor() !== undefined,
    show(text: string, color: TextareaRenderable["placeholderColor"]) {
      clear()
      const textarea = eligibleEditor()
      if (!textarea) return
      current = { editor: textarea, text, placeholder: textarea.placeholder, color: textarea.placeholderColor }
      textarea.placeholderColor = color
      textarea.placeholder = text
    },
    dispose() {
      clear()
      renderer.keyInput.off("keypress", keypress)
      renderer.keyInput.off("paste", clear)
      renderer.off("focused_editor", focusChanged)
    },
  }
}
