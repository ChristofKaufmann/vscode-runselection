# Notebook: Run Selection

A VS Code extension that lets you run selected text (or the current line) inside a notebook cell — analogous to **Jupyter: Run Selection/Line in Interactive Window** for Python scripts, but for notebooks.

## Motivation

When exploring data or debugging, running an entire notebook cell is often too coarse. This extension lets you highlight a sub-expression or a few lines and execute just that fragment, without leaving the notebook workflow.

## Usage

1. Open a Jupyter notebook (`.ipynb`).
2. Click into a code cell and select the text you want to run.
3. Press **Shift+Enter**.

The selected code is executed in the existing kernel. The output replaces the current output of the active cell.

If nothing is selected, the current line is used.

## How it works

The extension uses the [Jupyter extension API](https://github.com/microsoft/vscode-jupyter) to execute the selection directly in the running kernel. The execution does not affect the cell's execution counter or the notebook's execution history.

## Requirements

The [Jupyter extension](https://marketplace.visualstudio.com/items?itemName=ms-toolsai.jupyter) (`ms-toolsai.jupyter`) must be installed and a kernel must be running for the notebook.

## Configuration

| Setting                                       | Type    | Default | Description                                                                                           |
| --------------------------------------------- | ------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `nbRunSelection.showExceptionsAsNotification` | boolean | `false` | Show kernel exceptions as a notification popup. Set to `false` to render them as cell output instead. |

## Development

```bash
npm install       # install dependencies
npm run watch     # incremental TypeScript compilation
```

Press **F5** to open an Extension Development Host with the extension loaded.

## Testing

The integration tests run inside a real VS Code instance using [`@vscode/test-cli`](https://github.com/microsoft/vscode-test-cli).

```bash
npm test
```

This compiles the extension and tests, then launches VS Code headlessly to run the test suite. The Jupyter extension is required and will be downloaded automatically on the first run.

## License

[MIT](LICENSE)
