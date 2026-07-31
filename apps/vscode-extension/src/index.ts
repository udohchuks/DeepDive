export const PACKAGE_NAME = '@deepdive/vscode-extension';
export const APP_NAME = '@deepdive/vscode-extension';

// `activation.ts` is deliberately absent from this barrel: it imports `vscode`,
// which only resolves inside the extension host. Everything with a decision in
// it lives in the modules below and is tested without an editor.
export * from './deepdive_client.js';
export * from './diagnostics.js';
export * from './tree_model.js';
export * from './hint_view.js';
export * from './forms.js';
export * from './panel_view.js';
export * from './sidebar_provider.js';
export * from './ui/hint_panel.js';
export * from './ui/struggle_modal.js';
