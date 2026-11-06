// Preview page: the spreadsheet, to open in Excel, Numbers or Google Sheets. The preview link's
// page cannot download files itself, so it hands the file to the viewer through the page's host,
// which asks before it saves; a page on its own downloads it.

type Downloads = { save: (request: { filename: string; data: string }) => Promise<{ status: string }> };
type Host = { use?: (name: string) => Promise<unknown> };

async function hostDownloads(): Promise<Downloads | null> {
  const host = (globalThis as { claude?: Host }).claude;
  if (!host?.use) return null;
  try {
    return ((await host.use('downloads')) as Downloads | null) ?? null;
  } catch {
    return null;
  }
}

function linkDownload(data: string, fileName: string): void {
  const blob = new Blob([data], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function shareSpreadsheet(csv: string, fileName: string, _title: string): Promise<void> {
  // The byte order mark tells Excel the file is UTF-8.
  const data = '﻿' + csv;
  const downloads = await hostDownloads();
  if (downloads) {
    try {
      await downloads.save({ filename: fileName, data });
      return;
    } catch (e) {
      // Said no: nothing more to do. Anything else: the page tries its own download.
      if ((e as { code?: string } | null)?.code === 'declined') return;
    }
  }
  linkDownload(data, fileName);
}
