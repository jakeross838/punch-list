// iPhone: what is said, written down as it is said, with Apple's speech recognition. It runs on
// the phone itself when the phone can, so nothing is sent and a long walk is not cut off. The job's
// locations, companies and people are given as hints, so their names come out spelled right.

import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useMemo, useRef, useState } from 'react';

export interface Listening {
  /** Whether this phone can listen at all. */
  available: boolean;
  on: boolean;
  /** What stopped it, to show. */
  problem: string | null;
  /** Starts listening; what is heard goes after text. */
  start(text: string): Promise<void>;
  stop(): void;
}

const OFF = 'The microphone or speech recognition is off for Punch List. Turn them on in Settings, under Punch List, or type it.';

/** One more thing said, after what is there: a new sentence. */
export function afterText(text: string, heard: string): string {
  const a = text.trim();
  const b = heard.trim();
  if (!a) return b;
  if (!b) return a;
  return /[.!?]$/.test(a) ? `${a} ${b}` : `${a}. ${b}`;
}

export function useListening(onText: (text: string) => void, hints: string[]): Listening {
  const [on, setOn] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // What was there before this listening, and what it heard and settled on.
  const base = useRef('');
  const available = useMemo(() => {
    try {
      return ExpoSpeechRecognitionModule.isRecognitionAvailable();
    } catch {
      return false;
    }
  }, []);

  useSpeechRecognitionEvent('start', () => setOn(true));
  useSpeechRecognitionEvent('end', () => setOn(false));
  useSpeechRecognitionEvent('result', (event) => {
    const text = afterText(base.current, event.results[0]?.transcript ?? '');
    if (event.isFinal) base.current = text;
    onText(text);
  });
  useSpeechRecognitionEvent('error', (event) => {
    if (event.error === 'aborted' || event.error === 'no-speech') return;
    setProblem(event.error === 'not-allowed' ? OFF : 'Listening stopped. Tap the microphone to go on, or type the rest.');
  });

  return {
    available,
    on,
    problem,
    async start(text: string) {
      setProblem(null);
      const allowed = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!allowed.granted) {
        setProblem(OFF);
        return;
      }
      base.current = text.trim();
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        requiresOnDeviceRecognition: ExpoSpeechRecognitionModule.supportsOnDeviceRecognition(),
        contextualStrings: hints.slice(0, 100),
        iosTaskHint: 'dictation',
      });
    },
    stop() {
      ExpoSpeechRecognitionModule.stop();
    },
  };
}
