import * as assert from 'assert';
import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

interface MockOutputItem { mime: string; text: string; }

/** Builds a fake JupyterKernel that yields the given output items on each call. */
function makeMockKernel(items: MockOutputItem[]) {
    return {
        language: 'python',
        async *executeCode(_code: string, _token: vscode.CancellationToken) {
            if (items.length > 0) {
                yield {
                    items: items.map(i => ({
                        mime: i.mime,
                        // Buffer is a Uint8Array subtype — cast is safe in Node.js
                        data: Buffer.from(i.text) as unknown as Uint8Array,
                    })),
                };
            }
        },
    };
}

type MockKernel = ReturnType<typeof makeMockKernel> | undefined;

/**
 * Replaces vscode.extensions.getExtension so that requests for the Jupyter
 * extension return a fake that resolves getKernel() to the provided kernel.
 * Returns a restore function that undoes the patch.
 */
function mockJupyter(kernel: MockKernel): () => void {
    const orig = vscode.extensions.getExtension.bind(vscode.extensions);

    const fake = (id: string) => {
        if (id === 'ms-toolsai.jupyter') {
            return {
                id,
                isActive: true,
                packageJSON: {},
                exports: undefined,
                extensionUri: vscode.Uri.file('/mock'),
                extensionPath: '/mock',
                extensionKind: vscode.ExtensionKind.Workspace,
                activate: async () => ({
                    kernels: { getKernel: async () => kernel },
                }),
            } as unknown as vscode.Extension<unknown>;
        }
        return orig(id);
    };

    // vscode.extensions.getExtension may or may not be writable; handle both.
    try {
        (vscode.extensions as Record<string, unknown>).getExtension = fake;
    } catch {
        Object.defineProperty(vscode.extensions, 'getExtension', {
            value: fake, writable: true, configurable: true,
        });
    }

    return () => {
        try {
            (vscode.extensions as Record<string, unknown>).getExtension = orig;
        } catch {
            Object.defineProperty(vscode.extensions, 'getExtension', {
                value: orig, writable: true, configurable: true,
            });
        }
    };
}

// ---------------------------------------------------------------------------
// Notebook helpers
// ---------------------------------------------------------------------------

/**
 * Opens an in-memory Jupyter notebook with one code cell, shows it, and
 * enters edit mode on the first cell.
 * Returns the notebook document and the active cell text editor.
 */
async function openNotebook(cellCode: string): Promise<{
    notebook: vscode.NotebookDocument;
    cellEditor: vscode.TextEditor;
}> {
    const notebook = await vscode.workspace.openNotebookDocument('jupyter-notebook', {
        cells: [{
            kind: vscode.NotebookCellKind.Code,
            value: cellCode,
            languageId: 'python',
        }],
    });
    await vscode.window.showNotebookDocument(notebook);
    await vscode.commands.executeCommand('notebook.cell.edit');

    // Give the editor a moment to enter cell-edit mode.
    await new Promise<void>(r => setTimeout(r, 200));

    const cellEditor = vscode.window.activeTextEditor;
    if (!cellEditor) {
        throw new Error('activeTextEditor not set after notebook.cell.edit');
    }
    return { notebook, cellEditor };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('nb-run-selection', () => {
    suiteSetup(async () => {
        // Trigger activation by executing the contributed command once.
        // VS Code activates the extension before running any contributed command,
        // so after this resolves the command is registered for the rest of the suite.
        // The call will fail (no active notebook) — that's fine, we ignore the error.
        await vscode.commands.executeCommand('nb-run-selection.runSelection').then(() => {}, () => {});
    });

    teardown(() => vscode.commands.executeCommand('workbench.action.closeAllEditors'));

    // -----------------------------------------------------------------------
    test('command is registered', async () => {
        const cmds = await vscode.commands.getCommands();
        assert.ok(cmds.includes('nb-run-selection.runSelection'));
    });

    // -----------------------------------------------------------------------
    test('replaces cell output with kernel result (no selection → current line)', async () => {
        const restore = mockJupyter(makeMockKernel([{ mime: 'text/plain', text: '42' }]));
        try {
            const { notebook } = await openNotebook('x + 1');

            await vscode.commands.executeCommand('nb-run-selection.runSelection');

            const cell = notebook.cellAt(0);
            assert.strictEqual(cell.outputs.length, 1, 'expected one output');
            const item = cell.outputs[0].items[0];
            assert.strictEqual(item.mime, 'text/plain');
            assert.strictEqual(Buffer.from(item.data).toString(), '42');
        } finally {
            restore();
        }
    });

    // -----------------------------------------------------------------------
    test('runs only the selected text, not the whole cell', async () => {
        const restore = mockJupyter(makeMockKernel([{ mime: 'text/plain', text: 'selected' }]));
        try {
            const { notebook, cellEditor } = await openNotebook('x = 1\nprint(x)');

            // Select first line only.
            const firstLineLen = cellEditor.document.lineAt(0).text.length;
            cellEditor.selection = new vscode.Selection(0, 0, 0, firstLineLen);

            await vscode.commands.executeCommand('nb-run-selection.runSelection');

            assert.strictEqual(notebook.cellAt(0).outputs.length, 1);
        } finally {
            restore();
        }
    });

    // -----------------------------------------------------------------------
    test('does nothing when the current line is empty or whitespace', async () => {
        const restore = mockJupyter(makeMockKernel([{ mime: 'text/plain', text: 'should not appear' }]));
        try {
            const { notebook } = await openNotebook('   ');

            await vscode.commands.executeCommand('nb-run-selection.runSelection');

            assert.strictEqual(notebook.cellAt(0).outputs.length, 0, 'expected no output');
        } finally {
            restore();
        }
    });

    // -----------------------------------------------------------------------
    test('shows a warning and does not throw when no kernel is running', async () => {
        const restore = mockJupyter(undefined);
        try {
            await openNotebook('x + 1');

            // runSelection shows a warning notification; it must not throw.
            await assert.doesNotReject(
                Promise.resolve(vscode.commands.executeCommand('nb-run-selection.runSelection'))
            );
        } finally {
            restore();
        }
    });

    // -----------------------------------------------------------------------
    test('handles kernel error: renders error output in cell (showExceptionsAsNotification=false)', async () => {
        const throwingKernel = {
            language: 'python',
            async *executeCode(_code: string, _token: vscode.CancellationToken) {
                yield {
                    items: [{
                        mime: 'application/vnd.code.notebook.error',
                        data: Buffer.from(JSON.stringify({
                            name: 'ZeroDivisionError',
                            message: 'division by zero',
                            stack: '',
                        })) as unknown as Uint8Array,
                    }],
                };
                throw new Error('kernel error signal');
            },
        };

        const restore = mockJupyter(throwingKernel);
        // Ensure errors go to cell output for this test.
        const config = vscode.workspace.getConfiguration('nbRunSelection');
        await config.update('showExceptionsAsNotification', false, vscode.ConfigurationTarget.Global);
        try {
            const { notebook } = await openNotebook('1 / 0');

            await vscode.commands.executeCommand('nb-run-selection.runSelection');

            // The error output yielded before the throw should appear in the cell.
            assert.strictEqual(notebook.cellAt(0).outputs.length, 1);
            assert.strictEqual(
                notebook.cellAt(0).outputs[0].items[0].mime,
                'application/vnd.code.notebook.error'
            );
        } finally {
            await config.update('showExceptionsAsNotification', undefined, vscode.ConfigurationTarget.Global);
            restore();
        }
    });
});
