import * as vscode from 'vscode';

// ---------- Minimal type surface of the ms-toolsai.jupyter public API ----------
// Based on https://github.com/microsoft/vscode-jupyter/blob/main/src/api.d.ts

interface JupyterOutputItem {
    mime: string;
    data: Uint8Array;
}

interface JupyterOutput {
    items: JupyterOutputItem[];
    metadata?: { [key: string]: unknown };
}

interface JupyterKernel {
    readonly language: string;
    executeCode(code: string, token: vscode.CancellationToken): AsyncIterable<JupyterOutput>;
}

interface JupyterKernels {
    getKernel(uri: vscode.Uri): Thenable<JupyterKernel | undefined>;
}

interface JupyterExtensionAPI {
    readonly kernels: JupyterKernels;
}

// -------------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('nb-run-selection.runSelection', runSelection)
    );
}

/**
 * Executes the selected text (or current line) directly in the notebook's
 * kernel via the Jupyter extension API, without inserting any temporary cell.
 * The resulting outputs replace the current outputs of the active cell.
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

    // Obtain the kernel that is already running for this notebook.
    const kernel = await getJupyterKernel(notebook.uri);
    if (!kernel) {
        vscode.window.showWarningMessage(
            'Notebook: Run Selection — no kernel is running for this notebook.'
        );
        return;
    }

    // Execute the code fragment directly in the kernel.
    // executeCode() does not affect the cell execution count or history.
    const tokenSource = new vscode.CancellationTokenSource();
    const outputs: vscode.NotebookCellOutput[] = [];

    try {
        for await (const out of kernel.executeCode(code, tokenSource.token)) {
            outputs.push(
                new vscode.NotebookCellOutput(
                    out.items.map(item => new vscode.NotebookCellOutputItem(item.data, item.mime)),
                    out.metadata
                )
            );
        }
    } catch (err) {
        const showAsNotification = vscode.workspace
            .getConfiguration('nbRunSelection')
            .get<boolean>('showExceptionsAsNotification', false);

        if (showAsNotification || outputs.length === 0) {
            vscode.window.showErrorMessage(`Notebook: Run Selection — kernel error: ${err}`);
            return;
        }
    } finally {
        tokenSource.dispose();
    }

    if (outputs.length === 0) {
        return;
    }

    // Replace the active cell's outputs with the selection's results.
    // We use replaceCells (the only stable API for setting outputs) with the
    // same cell content so only the outputs change visually.
    const replacement = new vscode.NotebookCellData(
        currentCell.kind,
        currentCell.document.getText(),
        currentCell.document.languageId
    );
    replacement.outputs = outputs;
    replacement.metadata = { ...currentCell.metadata };

    const edit = new vscode.WorkspaceEdit();
    edit.set(notebook.uri, [
        vscode.NotebookEdit.replaceCells(
            new vscode.NotebookRange(currentCell.index, currentCell.index + 1),
            [replacement]
        )
    ]);
    await vscode.workspace.applyEdit(edit);
}

async function getJupyterKernel(notebookUri: vscode.Uri): Promise<JupyterKernel | undefined> {
    const ext = vscode.extensions.getExtension<JupyterExtensionAPI>('ms-toolsai.jupyter');
    if (!ext) {
        vscode.window.showErrorMessage(
            'Notebook: Run Selection — the Jupyter extension (ms-toolsai.jupyter) is not installed.'
        );
        return undefined;
    }
    const api = await ext.activate();
    return api.kernels.getKernel(notebookUri);
}

export function deactivate() {}
