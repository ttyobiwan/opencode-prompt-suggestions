import { Plugin, usePlugin } from "@opencode/plugin/tui"
import { createEffect, onCleanup } from "solid-js"
import { generateSuggestion } from "./suggestion"
import { inputSuggestion } from "./input-suggestion"

export default Plugin.define({
  id: "prompt-suggestions.tui",
  setup(context) {
    return context.ui.slot({
      append: "prompt.footer",
      render: (props) => <Suggestion sessionID={props.sessionID} mode={props.mode} />,
    })
  },
})

function Suggestion(props: { sessionID?: string; mode: "normal" | "shell" }) {
  const context = usePlugin()
  const input = inputSuggestion(context.renderer, () =>
    props.mode === "normal" && context.keymap.mode.current() === "base" && !!props.sessionID && isCurrent(props.sessionID),
  )
  let request: AbortController | undefined
  let completion: string | undefined

  function dismiss() {
    cancelRequest()
    input.clear()
  }

  function isCurrent(sessionID: string) {
    const route = context.ui.router.current()
    return route.type === "session" && route.sessionID === sessionID && props.sessionID === sessionID
  }

  const stopCompletion = context.data.on("session.execution.succeeded", (event) => {
    if (!isCurrent(event.data.sessionID) || completion === event.id) return
    completion = event.id
    dismiss()
    if (!input.canShow()) return
    const sessionID = event.data.sessionID
    const controller = new AbortController()
    request = controller
    const timeout = setTimeout(() => controller.abort(), 30_000)
    void generateSuggestion(context.client, sessionID, controller.signal)
      .then((suggestion) => {
        if (controller.signal.aborted || !isCurrent(sessionID)) return
        if (context.data.session.status(sessionID) === "running") return
        if (suggestion) input.show(suggestion, context.theme.text.muted)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        console.error("Prompt suggestion failed:", { sessionID, error })
      })
      .finally(() => clearTimeout(timeout))
  })

  const stopStarted = context.data.on("session.execution.started", (event) => {
    if (event.data.sessionID === props.sessionID) dismiss()
  })
  const stopPrompt = context.data.on("session.inbox.enqueued", (event) => {
    if (event.data.sessionID === props.sessionID) dismiss()
  })

  createEffect(() => {
    props.sessionID
    props.mode
    context.ui.router.current()
    context.keymap.mode.current()
    dismiss()
  })

  function cancelRequest() {
    request?.abort()
    request = undefined
  }
  context.renderer.keyInput.on("keypress", cancelRequest)
  context.renderer.keyInput.on("paste", cancelRequest)
  onCleanup(() => {
    dismiss()
    stopCompletion()
    stopStarted()
    stopPrompt()
    input.dispose()
    context.renderer.keyInput.off("keypress", cancelRequest)
    context.renderer.keyInput.off("paste", cancelRequest)
  })

  return null
}
