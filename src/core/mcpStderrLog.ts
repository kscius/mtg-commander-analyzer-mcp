/**
 * MCP stdio servers must not write to stdout (reserved for JSON-RPC).
 * Use this for diagnostic lines visible in Cursor's MCP log panel.
 */

export function logMcpDiag(message: string): void {
  process.stderr.write(`${message}\n`);
}

/** Log when OpenAI is invoked or skipped during deck build enhancement. */
export function logOpenAI(message: string): void {
  logMcpDiag(`[OpenAI] ${message}`);
}
