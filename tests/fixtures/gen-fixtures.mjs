// Throwaway generator: pins CURRENT plugin calendar math as fixtures.
// Pure fns copied verbatim from week-calendar-sync/main.js:168-232
// (only change: currentPersonalYearWeek takes an injected `now`).
// Run: node tests/fixtures/gen-fixtures.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function pad2(n) { return String(n).padStart(2, '0'); }

function formatYMD(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Calendar (y, m, d) → personal { yy: 21–100, doy: 1–366 }; null if before yy=21
function dateToPersonal(y, m, d) {
    const date = new Date(y, m - 1, d);
    date.setHours(0, 0, 0, 0);
    for (let yy = 100; yy >= 21; yy--) {
        const start = new Date(2000 + yy, 0, 1);
        if (date >= start) {
            const doy = Math.floor((date - start) / 86400000) + 1;
            return { yy, doy };
        }
    }
    return null;
}

function personalToDate(yy, doy) {
    const d = new Date(2000 + yy, 0, 1);
    d.setDate(d.getDate() + (doy - 1));
    return d;
}

// Days in personal year yy: 365 or 366
function personalYearDays(yy) {
    const start = new Date(2000 + yy, 0, 1);
    const next  = new Date(2000 + yy + 1, 0, 1);
    return Math.round((next - start) / 86400000);
}

function currentPersonalYearWeek(now = new Date()) {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    for (let yy = 100; yy >= 21; yy--) {
        const yearStart = new Date(2000 + yy, 0, 1);
        if (today >= yearStart) {
            const delta = Math.floor((today - yearStart) / 86400000);
            return { yy, ww: Math.min(Math.floor(delta / 7) + 1, 52) };
        }
    }
    return { yy: 21, ww: 1 };
}

function weekStartDate(yy, ww) {
    // Calendar arithmetic, not ms addition — DST-safe for winter weeks
    const d = new Date(2000 + yy, 0, 1 + (ww - 1) * 7);
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

// ── Fixture generation ────────────────────────────────────────────────────────
const out = {
    personalToDate: [],
    personalYearDays: [],
    weekStartDate: [],
    dateToPersonal: [],
    currentPersonalYearWeek: [],
};

for (let yy = 21; yy <= 100; yy++) {
    out.personalToDate.push({ input: { yy, doy: 1 }, output: formatYMD(personalToDate(yy, 1)) });
    out.personalYearDays.push({ input: { yy }, output: personalYearDays(yy) });
    for (const ww of [1, 26, 52]) {
        out.weekStartDate.push({ input: { yy, ww }, output: weekStartDate(yy, ww) });
    }
}

const dates = [
    [2021, 1, 1], [2020, 12, 31], [2021, 1, 2], [2020, 2, 29], [2021, 12, 31], [2022, 1, 1],
    [2025, 3, 30], [2025, 10, 26], [2025, 12, 31], [2026, 1, 1], [2000, 1, 1],
    [2099, 12, 31], [2100, 1, 1], [2125, 1, 1],
];
for (const [y, m, d] of dates) {
    out.dateToPersonal.push({ input: { y, m, d }, output: dateToPersonal(y, m, d) });
}

for (const s of ['2026-11-18', '2025-12-31', '2026-01-01', '2020-12-31', '2021-01-01']) {
    const [y, m, d] = s.split('-').map(Number);
    out.currentPersonalYearWeek.push({ input: { now: s }, output: currentPersonalYearWeek(new Date(y, m - 1, d, 12, 0, 0)) });
}

const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, 'calendar.json'), JSON.stringify(out, null, 2) + '\n');
console.log('wrote calendar.json', Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])));
