import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, typography, fonts, shadow } from '../../constants/colors';
import type { AdminStats } from '../../features/admin/types';

/** Proposal §6.1 target: median time-to-listing-clearance ≤ 4 hours. */
const TLC_TARGET_MINUTES = 4 * 60;

/** "95 min", "3.2 h", "2.1 days" */
export function formatMinutes(m: number | null | undefined): string {
  if (m == null) return '—';
  if (m < 60) return `${m} min`;
  if (m < 48 * 60) return `${(m / 60).toFixed(1)} h`;
  return `${(m / 1440).toFixed(1)} days`;
}

const pct = (v: number | null | undefined) => (v == null ? '—' : `${v}%`);

/**
 * The admin dashboard: the proposal's evaluation metrics (§6.1 and §6.2),
 * worked out live from the database. Shown in the app's Review tab, which also
 * works in a web browser, so it doubles as the admin web dashboard.
 */
export function StatsCard({ stats }: { stats: AdminStats }) {
  const c = stats.clearance;
  const d = stats.deals;
  const tlcMet = c.median_minutes != null && c.median_minutes <= TLC_TARGET_MINUTES;
  const openDisputes = (stats.disputes_by_status.open ?? 0) + (stats.disputes_by_status.under_review ?? 0);
  const byType = stats.listings_by_type;

  return (
    <View style={styles.wrap}>
      {/* primary metric */}
      <View style={styles.card}>
        <Text style={styles.label}>TIME TO LISTING CLEARANCE · LAST {c.window_days} DAYS</Text>
        <View style={styles.hero}>
          <Text style={styles.big}>{formatMinutes(c.median_minutes)}</Text>
          <Text style={styles.bigSub}>median, submitted → decided</Text>
        </View>
        {c.median_minutes != null ? (
          <View style={[styles.target, tlcMet ? styles.targetMet : styles.targetMissed]}>
            <Ionicons name={tlcMet ? 'checkmark-circle' : 'alert-circle'} size={14} color={tlcMet ? colors.success : colors.error} />
            <Text style={[styles.targetText, { color: tlcMet ? colors.success : colors.error }]}>
              {tlcMet ? 'Meets the pilot target of 4 hours or less' : 'Above the pilot target of 4 hours'}
            </Text>
          </View>
        ) : null}
        <View style={styles.grid}>
          <Stat value={pct(c.within_24h_percent)} label="decided within 24 h" />
          <Stat value={formatMinutes(c.p90_minutes)} label="90th percentile" />
          <Stat value={String(c.reviewed)} label="decisions" />
          <Stat value={pct(c.approval_rate_percent)} label="approved" />
          <Stat
            value={String(stats.queue.pending)}
            label={
              stats.queue.oldest_waiting_minutes != null
                ? `waiting · oldest ${formatMinutes(stats.queue.oldest_waiting_minutes)}`
                : 'waiting now'
            }
            warn={(stats.queue.oldest_waiting_minutes ?? 0) > TLC_TARGET_MINUTES}
          />
        </View>
      </View>

      {/* secondary metrics */}
      <View style={styles.card}>
        <Text style={styles.label}>DEALS · ALL TIME</Text>
        <Metric
          value={pct(d?.completion_rate_percent)}
          title="Completion rate"
          detail={`${d?.completed ?? 0} of ${d?.ended ?? 0} finished deals reached a QR-verified handoff`}
        />
        <Metric
          value={pct(d?.lend_share_percent)}
          title="Lend / borrow share"
          detail={`${d?.lend ?? 0} of ${d?.total ?? 0} deals were lending`}
        />
        <Metric
          value={pct(d?.on_time_return_percent)}
          title="On-time returns"
          detail={`${d?.lend_returned_on_time ?? 0} of ${d?.lend_due ?? 0} due items came back by the return date, with no dispute`}
        />
        <Metric
          value={pct(d?.lend_dispute_rate_percent)}
          title="Dispute rate (lending)"
          detail={`${d?.lend_disputed ?? 0} of ${d?.lend ?? 0} lend deals went to an admin · all deals: ${pct(d?.dispute_rate_percent)}`}
          warn={(d?.lend_dispute_rate_percent ?? 0) > 20}
        />
      </View>

      {/* platform */}
      <View style={styles.card}>
        <Text style={styles.label}>PLATFORM</Text>
        <View style={styles.grid}>
          <Stat value={String(stats.listings_by_status.live ?? 0)} label="live listings" />
          <Stat
            value={`${byType.sell ?? 0} / ${byType.lend ?? 0} / ${byType.exchange ?? 0}`}
            label="ever listed: sell / lend / swap"
          />
          <Stat value={String(stats.users_by_verification.verified ?? 0)} label="verified students" />
          <Stat value={String(openDisputes)} label="open disputes" warn={openDisputes > 0} />
          <Stat value={String(stats.reports_open ?? 0)} label="open reports" warn={(stats.reports_open ?? 0) > 0} />
        </View>
      </View>
    </View>
  );
}

function Stat({ value, label, warn }: { value: string; label: string; warn?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, warn && styles.warn]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Metric({ value, title, detail, warn }: { value: string; title: string; detail: string; warn?: boolean }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, warn && styles.warn]}>{value}</Text>
      <View style={styles.flex}>
        <Text style={styles.metricTitle}>{title}</Text>
        <Text style={styles.metricDetail}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  flex: { flex: 1 },
  card: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.card,
    padding: 14,
    gap: 10, ...shadow.card,
  },
  label: { ...typography.label, color: colors.textMuted },
  hero: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  big: { fontSize: 30, fontFamily: fonts.displayBold, color: colors.primary },
  bigSub: { fontSize: 12, fontFamily: fonts.regular, color: colors.textMuted },
  target: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.chip,
  },
  targetMet: { backgroundColor: colors.successTint },
  targetMissed: { backgroundColor: colors.errorTint },
  targetText: { fontSize: 12, fontFamily: fonts.bold },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  stat: { width: '50%', gap: 2, paddingRight: 8 },
  statValue: { fontSize: 16, fontFamily: fonts.extrabold, color: colors.text },
  statLabel: { fontSize: 11, fontFamily: fonts.regular, color: colors.textMuted },
  warn: { color: colors.error },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 2 },
  metricValue: { width: 58, fontSize: 20, fontFamily: fonts.displayBold, color: colors.primary },
  metricTitle: { fontSize: 13, fontFamily: fonts.bold, color: colors.text },
  metricDetail: { fontSize: 11, fontFamily: fonts.regular, color: colors.textMuted, marginTop: 1, lineHeight: 15 },
});
