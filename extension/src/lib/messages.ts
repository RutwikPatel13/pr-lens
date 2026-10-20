import type { PrRef } from '@pr-lens/shared';

const hasType = (value: unknown, type: string): value is { type: string } =>
  typeof value === 'object' && value !== null && 'type' in value && value.type === type;

// Side panel → content script on the GitHub tab.
export type ScrollToAnchorMessage = {
  type: 'pr-lens/scroll-to-anchor';
  anchor: string;
};

export function isScrollToAnchorMessage(value: unknown): value is ScrollToAnchorMessage {
  return hasType(value, 'pr-lens/scroll-to-anchor') && 'anchor' in value && typeof value.anchor === 'string';
}

// Content script → service worker: the in-page button was clicked.
export type OpenPanelMessage = { type: 'pr-lens/open-panel' };

export function isOpenPanelMessage(value: unknown): value is OpenPanelMessage {
  return hasType(value, 'pr-lens/open-panel');
}

// Content script → service worker: rule-flag counts for the button's badge. The content
// script can't call the backend itself: CORS only admits the extension's own origin.
export type RiskCountsRequest = { type: 'pr-lens/risk-counts'; pr: PrRef };

export type RiskCountsResponse = { status: 'ok'; high: number; medium: number } | { status: 'unavailable' };

export function isRiskCountsRequest(value: unknown): value is RiskCountsRequest {
  return hasType(value, 'pr-lens/risk-counts') && 'pr' in value && typeof value.pr === 'object' && value.pr !== null;
}
