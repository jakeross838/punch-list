// The PDF reader's worker has no types of its own: the preview page runs it on the page itself.
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown;
}
