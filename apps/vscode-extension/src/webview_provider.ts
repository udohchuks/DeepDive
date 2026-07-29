import { ExtensionMessageBridge } from './bridge.js';

export class DeepDiveWebviewProvider {
  constructor(private bridge: ExtensionMessageBridge) {}

  public getHtmlForWebview(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>DeepDive Extension Host</title>
</head>
<body>
  <div id="app">
    <h1>DeepDive Guided Project Studio</h1>
    <div id="phase-status">Phase Status: Active</div>
    <div id="hint-panel">Progressive Hints (L1-L4 Ceiling)</div>
    <div id="feedback-panel">Review Feedback</div>
  </div>
</body>
</html>`;
  }
}
