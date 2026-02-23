import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('nb-run-selection.runSelection', runSelection)
    );
}

/**
 * Inserts a new code cell containing the selected text (or the current line when
 * nothing is selected) right after the active cell, executes it, then — if
 * `nbRunSelection.deleteTempCellAfterExecution` is true — transfers its outputs
 * to the original cell and removes the temporary cell.
 */
async function runSelection(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const notebookEditor = vscode.window.activeNotebookEditor;
    if (!notebookEditor) {
        return;
    }

    const notebook = notebookEditor.notebook;

    // Identify which cell the active text editor belongs to.
    const currentCell = notebook.getCells().find(
        cell => cell.document.uri.toString() === editor.document.uri.toString()
    );

    if (!currentCell || currentCell.kind !== vscode.NotebookCellKind.Code) {
        return;
    }

    // Selected text, or the full current line when the selection is empty.
    const { selection } = editor;
    const code = selection.isEmpty
        ? editor.document.lineAt(selection.active.line).text
        : editor.document.getText(selection);

    if (!code.trim()) {
        return;
    }

    const insertIndex = currentCell.index + 1;

    // Insert a temporary cell right after the active cell.
    const wsEdit = new vscode.WorkspaceEdit();
    wsEdit.set(notebook.uri, [
        vscode.NotebookEdit.insertCells(insertIndex, [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                code,
                currentCell.document.languageId
            )
        ])
    ]);
    await vscode.workspace.applyEdit(wsEdit);

    // Focus the new cell so notebook.cell.execute targets it.
    await vscode.window.showNotebookDocument(notebook, {
        selections: [new vscode.NotebookRange(insertIndex, insertIndex + 1)],
        preserveFocus: false,
    });

    await vscode.commands.executeCommand('notebook.cell.execute');

    // Capture the live cell object by reference so we can track it even if
    // surrounding cells are inserted/deleted while we wait.
    const tempCell = notebook.cellAt(insertIndex);

    const config = vscode.workspace.getConfiguration('nbRunSelection');
    if (config.get<boolean>('deleteTempCellAfterExecution')) {
        await deleteCellAfterExecution(notebook, currentCell, tempCell);
    }
}

/**
 * Waits for `tempCell` to finish executing, appends its outputs to
 * `originalCell`, then deletes `tempCell` — all in one atomic workspace edit.
 */
async function deleteCellAfterExecution(
    notebook: vscode.NotebookDocument,
    originalCell: vscode.NotebookCell,
    tempCell: vscode.NotebookCell
): Promise<void> {
    // Fast path: kernel finished before we attached the listener.
    if (tempCell.executionSummary !== undefined) {
        await transferOutputsAndDelete(notebook, originalCell, tempCell);
        return;
    }

    // onDidChangeNotebookDocument fires a cellChanges entry with executionSummary
    // set the moment the kernel marks the cell as done. No timeout — we wait as
    // long as the kernel needs.
    await new Promise<void>(resolve => {
        const disposable = vscode.workspace.onDidChangeNotebookDocument(event => {
            if (event.notebook !== notebook) {
                return;
            }
            for (const change of event.cellChanges) {
                if (change.cell === tempCell && change.executionSummary !== undefined) {
                    disposable.dispose();
                    resolve();
                    return;
                }
            }
        });
    });

    await transferOutputsAndDelete(notebook, originalCell, tempCell);
}

/**
 * Replaces the outputs of `originalCell` with those from `tempCell`, then
 * deletes `tempCell` — both in a single workspace edit.
 *
 * `NotebookEdit` has no `updateCellOutputs` in the stable API, so we use
 * `replaceCells` with a reconstructed `NotebookCellData` that carries the new
 * outputs. The cell content, language, and metadata are preserved.
 */
async function transferOutputsAndDelete(
    notebook: vscode.NotebookDocument,
    originalCell: vscode.NotebookCell,
    tempCell: vscode.NotebookCell
): Promise<void> {
    // Re-resolve indices at apply time — insertions/deletions elsewhere may have
    // shifted them since we captured the cell references.
    const originalIndex = notebook.getCells().indexOf(originalCell);
    const tempIndex = notebook.getCells().indexOf(tempCell);

    if (tempIndex === -1) {
        return; // temp cell already gone
    }

    // Build new NotebookCellOutput instances so they are independent of the
    // cell we are about to delete.
    const transferredOutputs = tempCell.outputs.map(output =>
        new vscode.NotebookCellOutput(
            output.items.map(item => new vscode.NotebookCellOutputItem(item.data, item.mime)),
            output.metadata
        )
    );

    // Always delete the temp cell; also replace the original cell's outputs
    // when there is something to show.
    const notebookEdits: vscode.NotebookEdit[] = [
        vscode.NotebookEdit.deleteCells(new vscode.NotebookRange(tempIndex, tempIndex + 1))
    ];

    if (originalIndex !== -1 && transferredOutputs.length > 0) {
        const replacement = new vscode.NotebookCellData(
            originalCell.kind,
            originalCell.document.getText(),
            originalCell.document.languageId
        );
        replacement.outputs = transferredOutputs;
        replacement.metadata = { ...originalCell.metadata };

        // Prepend so the replacement runs before the delete; a 1-for-1
        // replaceCells does not shift any indices.
        notebookEdits.unshift(
            vscode.NotebookEdit.replaceCells(
                new vscode.NotebookRange(originalIndex, originalIndex + 1),
                [replacement]
            )
        );
    }

    const edit = new vscode.WorkspaceEdit();
    edit.set(notebook.uri, notebookEdits);
    await vscode.workspace.applyEdit(edit);
}

export function deactivate() {}
