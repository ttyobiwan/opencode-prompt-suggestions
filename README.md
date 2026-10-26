# OpenCode prompt suggestions

Plugin-only prototype for OpenCode V2. After the active session finishes, it predicts one next prompt and displays it as muted placeholder text inside the empty, focused input. Press Tab to insert it, then Enter to submit. Other keys or paste dismiss the suggestion.

The default model is the built-in `title` agent's configured model. OpenCode normalizes `small_model` to `agents.title.model`; the plugin reads that public API and does not load configuration files itself. A missing model skips generation and writes a diagnostic to the plugin log.

## Installation

Add the repository to `plugins` in `opencode.json`:

```json
{
  "plugins": ["github:ttyobiwan/opencode-prompt-suggestions"]
}
```

Or install it with the CLI:

```sh
opencode plugin add github:ttyobiwan/opencode-prompt-suggestions
```

OpenCode installs the package and dependencies and loads its TUI automatically.
No manual clone or separate entry in `cli.json` is needed. Start a new TUI instance
after changing the configuration. Both local and remote servers use the connected
server's model credentials.

## Prototype limits

- Uses `context.renderer.currentFocusedEditor` and OpenTUI's textarea placeholder and `insertText()` methods. This depends on OpenCode's input implementation rather than a stable prompt API. No OpenCode changes are required.
- Suggestions appear only in an empty, focused input in normal mode. Tab inserts text without submitting or running the normal Tab binding. The original placeholder is restored on acceptance, dismissal, focus loss, or cleanup.
- At most four recent exchanges and 12,000 UTF-8 bytes of serialized conversation are sent. Reasoning and tool output are excluded. Context retrieval still reads the active post-compaction transcript.
- One generation request per completion per mounted TUI. Multiple TUI clients can make independent requests.
- Requests have a thirty-second deadline; typing or pasting cancels the request. Failures produce no suggestion and are not retried. Output is limited to one line and 240 Unicode code points after generation; the API has no per-request token cap.

## Development

Clone the repository and install dependencies with Bun:

```sh
git clone https://github.com/ttyobiwan/opencode-prompt-suggestions.git
cd opencode-prompt-suggestions
bun install --frozen-lockfile
```

For local development, use the absolute path to the clone in `plugins` instead
of the GitHub entry, for example `"/absolute/path/to/opencode-prompt-suggestions"`.
The root `index.ts` and `tui.ts` forward to `src/` because OpenCode's local-directory
loader requires these entrypoints. Restart the TUI after changing the plugin entry.

```sh
bun run typecheck
bun run test
```
