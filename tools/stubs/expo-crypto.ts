// For scripts that run the app's rules in Node: expo-crypto's one function the rules use.

import { randomUUID as uuid } from 'node:crypto';

export const randomUUID = (): string => uuid();
