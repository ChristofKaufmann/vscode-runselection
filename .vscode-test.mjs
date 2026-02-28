import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
    files: 'out/test/**/*.test.js',
    // The Jupyter extension must be present in the test environment.
    launchArgs: ['--install-extension', 'ms-toolsai.jupyter'],
    // To use a locally installed VS Codium instead of downloading VS Code:
    // use: { vscodeExecutablePath: '/usr/bin/codium' },
    mocha: {
        timeout: 30_000,
    },
});
