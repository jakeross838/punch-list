// Ross Built constants for the Buildertrend internal API.
// Ids come from the Buildertrend skill and the 7 October 2026 task field cut.
// Phase 0 confirms each one against live definitions before anything depends on it.

export const BT_ORIGIN = 'https://buildertrend.net';
export const RB_BUILDER_ID = 90761;

export const JOBS = {
  /** 715 North Shore Drive. Live job: read only until Phase 5 says otherwise. */
  fish: 28084846,
  /** "Claude Cowork" template. The only job Phase 0 is allowed to write to. */
  sandbox: 45997341,
} as const;

/** ZZ-Appliances, already given access to the sandbox job for assignee tests. */
export const TEST_SUB_ID = 34693285;

export const TASK_TYPE = { task: 0, punchList: 1, scheduleItem: 2 } as const;
export const TASK_STATUS = { notStarted: 0, completed: 1 } as const;

/** customField associatedType for Tasks (not the generic entity type enum). */
export const TASKS_ASSOCIATED_TYPE = 15;

/** Completion List task fields kept in the 7 October 2026 cut. */
export const TASK_FIELDS = {
  location: 553258,
  ready: 553297,
  waitingOn: 553668,
  readyBy: 554342,
  boughtOut: 554343,
  poOrCo: 554344,
} as const;

export type TaskFieldKey = keyof typeof TASK_FIELDS;

export const DELETE_TAG_NAME = 'DELETE';

/** Buildertrend stores a task group title cut to 46 characters. */
export const GROUP_TITLE_MAX = 46;
