// Exists only so Chrome registers a chrome-extension:// target the runner can
// use to discover this extension's ID.
chrome.runtime.onInstalled.addListener(() => {});
