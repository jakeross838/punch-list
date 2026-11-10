// The parts of the app switched on in this build. What goes out to people is set in @punch/core's
// features.ts, where every part named there is off. A build can switch parts back on for itself by
// naming them in EXPO_PUBLIC_FEATURES ("types,hours", or "all"): the walk through of the whole app
// does, so the parts that are out of sight still get checked.

import { featuresFrom, setFeatures } from '@punch/core';

setFeatures(featuresFrom(process.env.EXPO_PUBLIC_FEATURES));
