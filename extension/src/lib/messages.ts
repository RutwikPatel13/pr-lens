// Messages from the side panel to the content script on the GitHub tab.
export type ScrollToAnchorMessage = {
  type: 'pr-lens/scroll-to-anchor';
  anchor: string;
};

export function isScrollToAnchorMessage(value: unknown): value is ScrollToAnchorMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'pr-lens/scroll-to-anchor' &&
    'anchor' in value &&
    typeof value.anchor === 'string'
  );
}
