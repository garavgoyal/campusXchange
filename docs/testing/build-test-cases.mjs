#!/usr/bin/env node
// Builds the test-case document for every functional requirement in the SRS,
// from the REAL results of the automated test runs plus the manual test cases.
//
//   cd code/backend && npm run test:e2e && npm test      # writes test-results/*.json
//   cd code/mobile  && npm test                          # writes test-results/unit.json
//   node docs/testing/build-test-cases.mjs               # writes TEST-CASES.md + test-cases.csv
//
// Every automated test name starts with the requirement it checks
// ("FR-LST-5 · a new listing is saved as pending_review"), which is how a
// result is matched to its requirement here.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const out = path.join(root, 'docs/testing');

// ---------------------------------------------------------------------------
// Requirements from the SRS
// ---------------------------------------------------------------------------
const tex = fs.readFileSync(path.join(root, 'srs/SRS.tex'), 'utf8');
const clean = (s) =>
  s
    .replace(/\\(texttt|emph|textbf)\{([^}]*)\}/g, '$2')
    .replace(/\$\\rightarrow\$/g, '→')
    .replace(/\\&/g, '&')
    .replace(/~/g, ' ')
    .replace(/\\_/g, '_')
    .replace(/--/g, '–')
    .replace(/``|''/g, '"')
    .replace(/\\textsuperscript\{[^}]*\}/g, '')
    .replace(/\\[a-z]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const requirements = [];
const nfrRequirements = [];
let group = '';
for (const line of tex.split('\n')) {
  const sec = line.match(/^\\section\{([^}]*)\}/);
  if (sec) group = sec[1];
  const m = line.match(/^(FR-[A-Z]+-\d+) & (.*) & (High|Medium|Low) & \\(impl|partl|planned)/);
  if (m) requirements.push({ id: m[1], text: clean(m[2]), priority: m[3], group: clean(group) });
  const n = line.match(/^(NFR-[A-Z]+-\d+) & (.*) & (High|Medium|Low) & \\(impl|partl|planned)/);
  if (n) nfrRequirements.push({ id: n[1], text: clean(n[2]), priority: n[3], status: n[4] });
}
// SRS order of areas, numbers in order within each area.
const areaOrder = [...new Set(nfrRequirements.map((r) => r.id.split('-')[1]))];
const nfrKey = (r) => areaOrder.indexOf(r.id.split('-')[1]) * 1000 + Number(r.id.split('-')[2]);
nfrRequirements.sort((a, b) => nfrKey(a) - nfrKey(b));

const STATUS = { impl: 'Implemented', partl: 'Partly implemented', planned: 'Planned' };

/**
 * How each non-functional requirement is checked. `fr` lists functional
 * requirements whose automated tests also prove it; `how` says what else checks
 * it (inspection, CI, a manual case) or why it cannot be checked yet.
 */
const NFR_VERIFY = {
  'NFR-PRF-1': { how: 'Not measured yet: needs a load test against the deployed backend.' },
  'NFR-PRF-2': { how: 'Not measured yet: needs a load test against the deployed backend.' },
  'NFR-PRF-3': { check: 'inspection', how: 'Inspection: indexes on listings (status, category) and (owner_id) in migration 000; the test database is built from the same migrations.' },
  'NFR-PRF-4': { fr: ['NFR-SEC-6'], how: 'The 8 MB limit is tested (a larger upload gets 413). Compressing photos in the app before upload is not built.' },
  'NFR-PRF-5': { manual: 'MT-CHT-10', how: 'Manual: two phones in one chat (MT-CHT-10).' },
  'NFR-SEC-3': { how: 'Also by inspection: .env files are git-ignored and the app only has the public key.' },
  'NFR-SEC-4': { fr: ['FR-ADM-3'], how: 'Admin ID-card queue returns signed links valid for 600 s.' },
  'NFR-SEC-8': { how: 'Deployment only (HTTPS is provided by the host); nothing is deployed yet.' },
  'NFR-SEC-10': { how: 'Header test; the dependency audit is a step in CI (ci.yml).' },
  'NFR-PRV-1': { check: 'inspection', how: 'Inspection: the users table holds only email, name, roll number, hostel and the ID-card path.' },
  'NFR-PRV-2': { fr: ['FR-BRW-5'], how: 'Guest feed and detail have no meeting location.' },
  'NFR-PRV-5': { fr: ['FR-AUTH-4'], how: 'One account per roll number, also refused by the database.' },
  'NFR-REL-1': { how: 'Needs monitoring of the deployed system during the pilot.' },
  'NFR-REL-2': { fr: ['FR-PAY-2', 'FR-PAY-5', 'FR-PAY-7'], how: 'Escrow and deal status are checked together in the payment tests; not every multi-step write runs as one database transaction yet.' },
  'NFR-REL-3': { fr: ['FR-CHT-7'], how: 'Exactly one accepted offer per thread.' },
  'NFR-REL-4': { how: 'No test case yet. To check: turn Wi-Fi off in the app and retry an action; expect an error with a retry, not a crash.' },
  'NFR-USE-1': { how: 'Needs a timed usability test with new students during the pilot.' },
  'NFR-USE-2': { manual: 'MT-PAY-6', how: 'Status wording is checked in MT-PAY-6; the clarity rating needs a pilot survey.' },
  'NFR-USE-3': { how: 'No test case yet. To check: run the manual cases on a small Android phone.' },
  'NFR-POR-1': { manual: 'all manual cases', how: 'One Expo codebase; run the manual cases on one Android phone and one iPhone.' },
  'NFR-POR-2': { how: 'Not measured yet: needs a budget Android phone (2–3 GB RAM).' },
  'NFR-POR-3': { check: 'ci', how: 'The automated tests run two backend processes side by side on one database; no session state is kept in the backend.' },
  'NFR-MNT-1': { check: 'ci', how: 'CI type-checks both projects in strict mode on every push.' },
  'NFR-MNT-2': { check: 'inspection', how: 'Inspection: .github/workflows/ci.yml runs on every push and pull request.' },
  'NFR-MNT-3': { check: 'ci', how: 'The test database is built by running supabase/migrations 000–011 in order.' },
  'NFR-MNT-4': { check: 'inspection', how: 'Inspection: every controller route appears in docs/api-contract.md.' },
  'NFR-MNT-5': { check: 'ci', how: 'This document: every functional requirement has an automated or a manual test case.' },
  'NFR-SCL-1': { fr: ['FR-BRW-7'], how: 'Pages of 20, never more than 50; feed queries use the indexes of NFR-PRF-3.' },
  'NFR-SCL-2': { check: 'ci', how: 'CI is in place; deployment to a staging host is not done yet.' },
};

/** Built and tested in this repo, but deliberately not part of the pilot. */
const NOT_BUILT = {
  'FR-AUTH-10': 'No registrar student list is available yet; ID cards are checked by an admin instead (FR-ADM-3/4).',
  'FR-MOD-7': 'No AI moderation service is connected; every listing gets human review. Tested: no score is set and nothing is auto-rejected.',
};
/** Passes against a stand-in for an outside service, not the real one. */
const SIMULATED = { 'FR-PAY-2': true };
/** Built differently from the SRS wording; noted next to the result. */
const NOTES = {
  'FR-PAY-2': 'Payment gateway not connected yet: "pay" records the money as held in escrow. All escrow rules are tested.',
  'FR-CHT-10': 'Delivered through Supabase Realtime instead of a separate WebSocket server.',
  'FR-ADM-6': 'The admin Review tab also runs in a web browser (Expo web), which serves as the web dashboard.',
};

// ---------------------------------------------------------------------------
// Automated results
// ---------------------------------------------------------------------------
const TAG = /\b(N?FR-[A-Z]+-\d+)\b/;
const runs = [
  ['code/backend/test-results/e2e.json', 'API end-to-end'],
  ['code/backend/test-results/unit.json', 'Backend unit'],
  ['code/mobile/test-results/unit.json', 'App unit'],
];
const automated = [];
const missing = [];
const runTimes = [];
for (const [file, kind] of runs) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    missing.push(file);
    continue;
  }
  const report = JSON.parse(fs.readFileSync(full, 'utf8'));
  runTimes.push(fs.statSync(full).mtimeMs);
  for (const suite of report.testResults) {
    const testFile = path.relative(root, suite.name);
    for (const t of suite.assertionResults) {
      if (t.status === 'todo' || t.status === 'pending' || t.status === 'skipped') continue;
      const tag = t.title.match(TAG)?.[1] ?? [...t.ancestorTitles].reverse().map((a) => a.match(TAG)?.[1]).find(Boolean);
      if (!tag) continue;
      automated.push({
        fr: tag,
        title: t.title.replace(/^N?FR-[A-Z]+-\d+\s*·\s*/, ''),
        kind,
        file: testFile,
        result: t.status === 'passed' ? 'Pass' : 'Fail',
      });
    }
  }
}

/** Date of the automated run: when its result files were written (campus time). */
const RUN_DATE = runTimes.length
  ? new Date(Math.max(...runTimes)).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  : 'not run';

const manual = JSON.parse(fs.readFileSync(path.join(out, 'manual-test-cases.json'), 'utf8'));

// ---------------------------------------------------------------------------
// Build rows
// ---------------------------------------------------------------------------
const byFr = (list, id) => list.filter((x) => x.fr === id);
const rows = [];
const summary = [];

for (const req of requirements) {
  const auto = byFr(automated, req.id);
  const man = byFr(manual, req.id);
  auto.forEach((t, i) =>
    rows.push({
      id: `TC-${req.id.slice(3)}.${String(i + 1).padStart(2, '0')}`,
      fr: req.id, group: req.group, type: `Automated (${t.kind})`, test: t.title,
      steps: `Runs in CI: ${t.file}`, expected: t.title, result: t.result, tester: 'CI', date: RUN_DATE,
    }),
  );
  man.forEach((m) =>
    rows.push({
      id: m.id, fr: req.id, group: req.group, type: 'Manual (on a phone)', test: m.title,
      steps: m.steps, expected: m.expected, result: m.status ?? 'To run', tester: m.tester ?? '', date: m.date ?? '',
    }),
  );

  const passed = auto.filter((t) => t.result === 'Pass').length;
  let overall;
  if (NOT_BUILT[req.id]) overall = auto.length ? 'Not built (planned); safe default tested' : 'Not built (planned)';
  else if (auto.length && passed < auto.length) overall = `FAIL (${auto.length - passed} failing)`;
  else if (SIMULATED[req.id] && auto.length) overall = 'Pass (simulated gateway)';
  else if (auto.length && man.length) overall = 'Pass + manual check';
  else if (auto.length) overall = 'Pass';
  else if (man.length) overall = 'Manual test';
  else overall = 'No test';
  summary.push({
    ...req, auto: auto.length, passed, manual: man.map((m) => m.id).join(', '),
    overall, note: NOT_BUILT[req.id] ?? NOTES[req.id] ?? '',
  });
}

// Non-functional (security / privacy) tests, listed separately.
const nfr = automated.filter((t) => t.fr.startsWith('NFR-'));

const nfrSummary = nfrRequirements.map((req) => {
  const v = NFR_VERIFY[req.id] ?? {};
  const direct = byFr(automated, req.id);
  const linked = (v.fr ?? []).flatMap((id) => byFr(automated, id));
  const all = [...direct, ...linked];
  const passed = all.filter((t) => t.result === 'Pass').length;
  let overall;
  if (all.length && passed < all.length) overall = `FAIL (${all.length - passed} failing)`;
  else if (req.status === 'planned') overall = 'Planned (not measured yet)';
  else if (all.length) overall = req.status === 'partl' ? 'Pass (partly built)' : 'Pass';
  else if (v.manual) overall = 'Manual test';
  else if (v.check === 'inspection') overall = 'Checked by inspection';
  else if (v.check === 'ci') overall = req.status === 'partl' ? 'Checked in CI (partly built)' : 'Checked in CI';
  else overall = 'Not tested yet';
  return {
    ...req, direct: direct.length, linked: linked.length, linkedFrom: (v.fr ?? []).join(', '),
    passed, manual: v.manual ?? '', how: v.how ?? '', overall,
  };
});

// ---------------------------------------------------------------------------
// Write CSV
// ---------------------------------------------------------------------------
const nfrSeen = {};
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const csv = [
  ['Test ID', 'Requirement', 'Test case', 'Type', 'Result', 'Tester', 'Date', 'Steps / where it runs', 'Expected result', 'Feature'],
  ...rows.map((r) => [r.id, r.fr, r.test, r.type, r.result, r.tester, r.date, r.steps, r.expected, r.group]),
  ...nfr.map((t) => [`TC-${t.fr.slice(4)}.${String((nfrSeen[t.fr] = (nfrSeen[t.fr] ?? 0) + 1)).padStart(2, '0')}`, t.fr, t.title, `Automated (${t.kind})`, t.result, 'CI', RUN_DATE, `Runs in CI: ${t.file}`, t.title, 'Security and privacy']),
]
  .map((r) => r.map(csvCell).join(','))
  .join('\n');
fs.writeFileSync(path.join(out, 'test-cases.csv'), csv + '\n');

const coverageCsv = [
  ['Requirement', 'Feature', 'Priority', 'Result', 'Automated tests passing', 'Manual test cases', 'What the SRS says', 'Note'],
  ...summary.map((s) => [s.id, s.group, s.priority, s.overall, s.auto ? `${s.passed} of ${s.auto}` : 'none', s.manual || 'none', s.text, s.note]),
]
  .map((r) => r.map(csvCell).join(','))
  .join('\n');
fs.writeFileSync(path.join(out, 'coverage.csv'), coverageCsv + '\n');

const nfrCsv = [
  ['Requirement', 'Priority', 'Status in SRS', 'Result', 'Own automated tests', 'Also proved by tests of', 'Tests passing', 'Manual', 'How it is checked', 'What the SRS says'],
  ...nfrSummary.map((s) => [s.id, s.priority, STATUS[s.status], s.overall, s.direct || 'none', s.linkedFrom ? `${s.linkedFrom} (${s.linked})` : '', s.direct + s.linked ? `${s.passed} of ${s.direct + s.linked}` : '', s.manual, s.how, s.text]),
]
  .map((r) => r.map(csvCell).join(','))
  .join('\n');
fs.writeFileSync(path.join(out, 'nfr-coverage.csv'), nfrCsv + '\n');

// ---------------------------------------------------------------------------
// Write Markdown
// ---------------------------------------------------------------------------
const md = [];
const totalAuto = automated.length;
const totalPass = automated.filter((t) => t.result === 'Pass').length;
const count = (o) => summary.filter((s) => s.overall === o).length;
md.push('# CampusXchange — test cases for the SRS functional requirements', '');
md.push(`Generated by \`docs/testing/build-test-cases.mjs\`. Do not edit by hand.`, '');
md.push(`Automated results are from the run on **${RUN_DATE}** (tester: CI). Manual cases show "To run" until the team runs them on a phone; the tester fills in their name, the date and the result in the test-case sheet (or in \`manual-test-cases.json\` as \`status\`, \`tester\`, \`date\`, then re-runs this script).`, '');
md.push('## Summary', '');
md.push(`- **${requirements.length} functional requirements** in the SRS.`);
const frAuto = automated.filter((t) => t.fr.startsWith('FR-'));
md.push(`- **${frAuto.length} automated tests for the functional requirements** (${frAuto.filter((t) => t.result === 'Pass').length} passing), plus **${nfr.length} security and privacy tests** — all run on every push in GitHub Actions.`);
md.push(`- **${manual.length} manual test cases** for what only a person with a phone can check (OTP email, camera, live chat, screens).`);
md.push(`- Pass: ${count('Pass')} · Pass (simulated gateway): ${count('Pass (simulated gateway)')} · Pass + manual check: ${count('Pass + manual check')} · Manual only: ${count('Manual test')} · Not built (planned): ${summary.filter((s) => s.overall.startsWith('Not built')).length} · Failing: ${summary.filter((s) => s.overall.startsWith('FAIL')).length} · No test: ${count('No test')}`);
if (missing.length) md.push('', `> Missing result files (run those suites first): ${missing.join(', ')}`);
md.push('', '## Requirement coverage', '');
md.push('| Requirement | Priority | What it says | Automated | Manual | Result | Note |');
md.push('|---|---|---|---|---|---|---|');
for (const s of summary) {
  md.push(`| ${s.id} | ${s.priority} | ${s.text.replace(/\|/g, '/')} | ${s.auto ? `${s.passed}/${s.auto}` : '—'} | ${s.manual || '—'} | ${s.overall} | ${s.note} |`);
}
md.push('', '## Test cases', '');
let current = '';
for (const r of rows) {
  if (r.group !== current) {
    current = r.group;
    md.push('', `### ${current}`, '', '| Test ID | Requirement | Type | Test case | Result |', '|---|---|---|---|---|');
  }
  md.push(`| ${r.id} | ${r.fr} | ${r.type} | ${r.test.replace(/\|/g, '/')} | ${r.result} |`);
}
md.push('', '### Manual test steps', '');
for (const m of manual) {
  md.push(`**${m.id} — ${m.title}** (${m.fr})`, '', `- Steps: ${m.steps}`, `- Expected: ${m.expected}`, `- Result: ${m.status ? `${m.status} — tester: ${m.tester ?? '______'}, date: ${m.date ?? '______'}` : '☐ Pass ☐ Fail — tester: ______ date: ______'}`, '');
}
const nfrCount = (pre) => nfrSummary.filter((s) => s.overall.startsWith(pre)).length;
md.push('## Non-functional requirement coverage', '');
md.push(`${nfrSummary.length} non-functional requirements. Pass: ${nfrCount('Pass')} · Checked in CI: ${nfrCount('Checked in CI')} · Checked by inspection: ${nfrCount('Checked by inspection')} · Manual test: ${nfrCount('Manual test')} · Planned (not measured yet): ${nfrCount('Planned')} · Not tested yet: ${nfrCount('Not tested yet')} · Failing: ${nfrCount('FAIL')}`, '');
md.push('| Requirement | Priority | Status | Tests passing | How it is checked | Result |', '|---|---|---|---|---|---|');
for (const s of nfrSummary) {
  const n = s.direct + s.linked;
  const tests = n ? `${s.passed}/${n}${s.linkedFrom ? ` (incl. ${s.linkedFrom})` : ''}` : '—';
  md.push(`| ${s.id} | ${s.priority} | ${STATUS[s.status]} | ${tests} | ${s.how.replace(/\|/g, '/')} | ${s.overall} |`);
}
md.push('', '## Security and privacy (non-functional) tests', '', '| Requirement | Test case | Result |', '|---|---|---|');
for (const t of nfr) md.push(`| ${t.fr} | ${t.title.replace(/\|/g, '/')} | ${t.result} |`);
fs.writeFileSync(path.join(out, 'TEST-CASES.md'), md.join('\n') + '\n');

console.log(
  `${nfrSummary.length} NFRs (${nfrSummary.filter((s) => s.overall === 'Not tested yet').map((s) => s.id).join(', ')} not tested yet) · ` +
  `${requirements.length} requirements · ${totalAuto} automated (${totalPass} pass) · ${manual.length} manual · ` +
    `${summary.filter((s) => s.overall === 'No test').map((s) => s.id).join(', ') || 'every FR has a test'}`,
);
