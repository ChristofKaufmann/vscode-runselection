# Notebook: Run Selection

A VS Code extension that lets you run selected text (or the current line) inside a notebook cell — analogous to **Jupyter: Run Selection/Line in Interactive Window** for Python scripts, but for notebooks.

## Motivation

When exploring data or debugging, running an entire notebook cell is often too coarse. This extension lets you highlight a sub-expression or a few lines and execute just that fragment, without leaving the notebook workflow.

## Usage

1. Open a Jupyter notebook (`.ipynb`).
2. Click into a code cell and select the text you want to run.
3. Press **Shift+Enter**.

The selected code is executed in the existing kernel. The output appears on the original cell.

If nothing is selected, the current line is used.

## How it works

1. A temporary code cell is inserted immediately after the active cell.
2. The selection (or current line) is placed in that cell and executed.
3. Once the kernel signals completion, the cell's outputs are transferred to the original cell and the temporary cell is deleted.

## Configuration

| Setting | Default | Description |
|---|---|---|
| `nbRunSelection.deleteTempCellAfterExecution` | `true` | Delete the temporary cell after execution. Disable to keep it visible. |

## Development

```bash
npm install       # install dependencies
npm run watch     # incremental TypeScript compilation
```

Press **F5** to open an Extension Development Host with the extension loaded.

## License

[MIT](LICENSE)
