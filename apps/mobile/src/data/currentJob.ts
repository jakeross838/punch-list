// The job you are working in: the last one opened. The bottom bar's Schedule, Capture and Send go
// to it from anywhere in the app, and it is kept on the phone so it is still there next time.

import { kept } from './kept';

const current = kept('punch.currentJob');

export const setCurrentJob = (jobId: string) => current.set(jobId);
export const getCurrentJob = () => current.get();
export const useCurrentJob = () => current.useValue();
