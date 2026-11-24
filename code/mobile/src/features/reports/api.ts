import { apiGet, apiSend } from '../../lib/apiClient';
import type { AdminReport, ReportReason, ReportTarget, TakedownResult } from './types';

/** Report a listing or a person you've chatted with. */
export async function createReport(target: ReportTarget, reason: ReportReason, details?: string) {
  return apiSend('/reports', 'POST', { ...target, reason, details: details?.trim() || undefined });
}

/** Admin: open reports, oldest first. */
export async function fetchOpenReports(): Promise<AdminReport[]> {
  return apiGet<AdminReport[]>('/admin/reports');
}

/** Admin: "actioned" on a listing report takes the listing down. */
export async function resolveReport(reportId: string, outcome: 'actioned' | 'dismissed', note: string) {
  return apiSend(`/admin/reports/${reportId}/resolve`, 'POST', { outcome, note });
}

/** Admin: take a listing off the feed for good, with or without a report. */
export async function takedownListing(listingId: string, reason: string): Promise<TakedownResult> {
  return apiSend<TakedownResult>(`/admin/listings/${listingId}/takedown`, 'POST', { reason });
}
