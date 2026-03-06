# Notebook: Run Selection

**Notebook: Run Selection/Line** runs selected code (or the current line) in a notebook cell — like **Jupyter: Run Selection/Line in Interactive Window**, but for notebooks. Useful when running an entire cell is too coarse and you just want to execute a sub-expression or a few lines.

## Usage

![Selecting code in a notebook cell and pressing Shift+Enter executes the selected code](images/demo.gif)

1. Open a Jupyter notebook (`.ipynb`).
2. Start a kernel, e.g. by executing a code cell.
3. Click into a code cell and select the code you want to run.
4. Press **Shift+Enter** (if the keybinding does not work, see below). You need to grant kernel access once.

The selected code is executed in the *existing* kernel. The output replaces the current output of the active cell.

If nothing is selected and you execute the command **Notebook: Run Selection/Line** using the command palette, the current line is executed, but the keybinding **Shift+Enter** is only active with a selection.

> [!IMPORTANT]
>
> The command **Notebook: Execute Cell and Select Below** may take priority over Shift+Enter. User keybindings have an even higher priority, so add this to the list `[...]` in your keyboard shortcuts file `keybindings.json`:
>
> ```json
>     {
>         "key": "shift+enter",
>         "command": "nb-run-selection.runSelectionOrLine",
>         "when": "editorHasSelection && notebookCellEditorFocused && !interactiveEditorFocused"
>     },
> ```

## Configuration

| Setting                                       | Type    | Default | Description                                                                                           |
| --------------------------------------------- | ------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `nbRunSelection.showExceptionsAsNotification` | boolean | `false` | Show kernel exceptions as a notification popup. Set to `false` to render them as cell output instead. |

## License

[MIT](LICENSE)

## Original Issue

This extension serves as a workaround for issue [microsoft/vscode#200625](https://github.com/microsoft/vscode/issues/200625).

Limitations:

- Currently, this extension cannot start a kernel.
- The keybinding is conflicting with **Notebook: Execute Cell and Select Below**, which should only be triggered if there is no selection.
