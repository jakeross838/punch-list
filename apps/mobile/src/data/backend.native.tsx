// The iPhone's backend: the real database once the project's addresses are in apps/mobile/.env
// (see config.ts), and the sample until then. The preview page's is backend.tsx.

import { isConfigured } from './config';
import { LiveDataProvider } from './live/LiveBackend';
import { PreviewDataProvider } from './previewBackend';

export const DataProvider = isConfigured ? LiveDataProvider : PreviewDataProvider;
