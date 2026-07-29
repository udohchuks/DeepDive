export interface WebviewMessage {
  type: 'submit_artifact' | 'request_hint' | 'answer_clarification';
  payload: Record<string, unknown>;
}

export interface WebviewHostBridge {
  postMessage(message: WebviewMessage): Promise<void>;
  onMessage(handler: (message: WebviewMessage) => void): void;
}

export class ExtensionMessageBridge {
  private handlers: ((message: WebviewMessage) => void)[] = [];

  public registerHandler(handler: (message: WebviewMessage) => void): void {
    this.handlers.push(handler);
  }

  public async dispatch(message: WebviewMessage): Promise<void> {
    for (const h of this.handlers) {
      h(message);
    }
  }
}
