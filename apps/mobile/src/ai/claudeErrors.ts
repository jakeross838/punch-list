// What went wrong asking Claude, the same way on the iPhone and the preview page, and how the app
// says it.

export type ClaudeTrouble =
  /** Claude is not set up for the company yet (no key on the server). */
  | 'not_set_up'
  /** This month's allowance is used. */
  | 'used_up'
  /** Not signed in at a company, or switched off. */
  | 'signed_out'
  /** No signal, or the server could not be reached. */
  | 'offline'
  /** The preview page may not ask Claude. */
  | 'not_allowed'
  /** Too many at once. */
  | 'busy'
  /** Claude did not answer, or the answer could not be read. */
  | 'no_answer';

export class ClaudeError extends Error {
  readonly trouble: ClaudeTrouble;
  constructor(trouble: ClaudeTrouble, message?: string) {
    super(message ?? claudeMessage(trouble));
    this.name = 'ClaudeError';
    this.trouble = trouble;
  }
}

const MESSAGES: Record<ClaudeTrouble, string> = {
  not_set_up: 'Claude is not set up yet for your company.',
  used_up: "Your company has used this month's allowance for Claude. It starts again on the first of the month.",
  signed_out: 'Sign in again to use Claude.',
  offline: 'Claude could not be reached. Check the signal and try again.',
  not_allowed: 'Claude is not allowed on this page.',
  busy: 'Too many at once. Try again in a minute.',
  no_answer: 'Claude did not answer. Try again.',
};

export function claudeMessage(trouble: ClaudeTrouble): string {
  return MESSAGES[trouble];
}

/** What to tell the person about anything thrown while asking Claude. */
export function troubleMessage(e: unknown): string {
  return e instanceof ClaudeError ? e.message : MESSAGES.no_answer;
}
