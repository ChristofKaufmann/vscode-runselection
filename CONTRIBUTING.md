# Contributing Guide

This is a very simple extension, but contributions are welcome.

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
