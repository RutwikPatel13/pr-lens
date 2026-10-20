// Chrome only opens the side panel from a user gesture: the toolbar icon or the
// _execute_action keyboard shortcut (manifest "commands"). Once open, the panel is
// window-wide and stays open across tabs; it follows the active tab's URL itself.
void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
