import { ExtensionMessageBridge } from './bridge.js';
import { DeepDiveWebviewProvider } from './webview_provider.js';

export interface ExtensionContextStub {
  subscriptions: { dispose(): void }[];
}

export function activateExtension(context: ExtensionContextStub) {
  const bridge = new ExtensionMessageBridge();
  const provider = new DeepDiveWebviewProvider(bridge);

  context.subscriptions.push({
    dispose: () => {
      // Disposer
    },
  });

  return { bridge, provider };
}
