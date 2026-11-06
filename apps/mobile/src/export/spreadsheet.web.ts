// Preview page: the spreadsheet downloads, to open in Excel, Numbers or Google Sheets.

export async function shareSpreadsheet(csv: string, fileName: string, _title: string): Promise<void> {
  // The byte order mark tells Excel the file is UTF-8.
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
