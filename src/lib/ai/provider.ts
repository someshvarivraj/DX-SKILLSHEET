/**
 * AI provider abstraction.
 *
 * The specification requires all processing to stay inside AWS and the choice
 * of AI service to be confirmed separately (§15). The application therefore
 * never talks to a vendor SDK directly: it talks to this interface, and the
 * concrete provider is selected by the AI_PROVIDER environment variable.
 * Swapping vendors is a configuration change, not a code change.
 */

export type AiRole = 'system' | 'user';

export type AiMessage = {
  role: AiRole;
  content: string;
};

export type AiRequest = {
  messages: AiMessage[];
  /** Kept at 0 by default so review is possible (§8.6). */
  temperature?: number;
  maxTokens?: number;
  /** Free-text label used in logs and history, e.g. the field code. */
  purpose?: string;
};

export type AiResponse = {
  text: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  /** Milliseconds spent in the call, for the operations screen. */
  durationMs: number;
};

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  generate(request: AiRequest): Promise<AiResponse>;
  /** Cheap reachability check for the health endpoint. */
  healthCheck(): Promise<{ ok: boolean; detail?: string }>;
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

/**
 * Fields that must never be included in a request to the AI service (ch.13):
 * the name, the date of birth and the dietary information are not needed to
 * generate any prose. The pipeline filters on this list, and the admin screen
 * shows it so the list can be presented at design time as the spec asks.
 */
export const FIELDS_NEVER_SENT_TO_AI = [
  'full_name',
  'age',
  'photo',
  'dietary',
  'employee_number',
] as const;

export function isSendableField(fieldCode: string): boolean {
  return !(FIELDS_NEVER_SENT_TO_AI as readonly string[]).includes(fieldCode);
}
