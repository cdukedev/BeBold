/* Keyboard command handling only.
 *
 * The toggle is delegated to the content script rather than resolved here, because
 * reading tab.url from the service worker would require the "tabs" permission, which
 * carries a "Read your browsing history" warning. Any warning increase disables the
 * extension for all existing users pending re-consent, so it is off the table.
 * chrome.tabs.sendMessage needs only the tab id, which is free.
 */
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-site') return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id != null) await chrome.tabs.sendMessage(tab.id, { action: 'toggleSite' });
  } catch { /* no content script on this page */ }
});
