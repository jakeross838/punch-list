// Clicking the toolbar button shows or hides the panel on the Buildertrend tab.
// On any other tab it opens Buildertrend first.

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  if (tab.url?.startsWith('https://buildertrend.net/')) {
    chrome.tabs.sendMessage(tab.id, { type: 'toggle-panel' }).catch(() => {
      // The content script loads with the page; a tab opened before install needs a reload.
      chrome.tabs.reload(tab.id!);
    });
  } else {
    chrome.tabs.create({ url: 'https://buildertrend.net/' });
  }
});
