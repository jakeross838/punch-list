// Preview page: no listening (the page may not use the microphone). What is left to do is typed,
// or said with the computer's own dictation.

export interface Listening {
  available: boolean;
  on: boolean;
  problem: string | null;
  start(text: string): Promise<void>;
  stop(): void;
}

/** One more thing said, after what is there: a new sentence. */
export function afterText(text: string, heard: string): string {
  const a = text.trim();
  const b = heard.trim();
  if (!a) return b;
  if (!b) return a;
  return /[.!?]$/.test(a) ? `${a} ${b}` : `${a}. ${b}`;
}

export function useListening(_onText: (text: string) => void, _hints: string[]): Listening {
  return { available: false, on: false, problem: null, start: async () => undefined, stop: () => undefined };
}
