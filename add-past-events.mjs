// 国葬文書訴訟（cmvkzfy09n2wpl）の過去の期日を一括登録する（call4掲載の期日表より）。
// 使い方（PowerShell）:  $env:EDIT_KEY="編集パスワード"; node add-past-events.mjs
// すでに同じ日付の期日がある事件には追加しない（重複登録の防止）。
const BASE = "https://court-calendar-6q8.pages.dev";
const CASE_ID = "cmvkzfy09n2wpl";
const KEY = process.env.EDIT_KEY;
if (!KEY) { console.error("環境変数 EDIT_KEY（編集パスワード）を設定してください"); process.exit(1); }

const T = "東京地方裁判所";
const events = [
  { date: "2024-12-25", time: "15:30", type: "第1回弁論", place: "522号法廷", reportMeeting: false },
  { date: "2025-03-12", time: "15:30", type: "第2回弁論", place: "522号法廷" },
  { date: "2025-06-12", time: "14:00", type: "第3回弁論", place: "103号法廷" },
  { date: "2025-10-09", time: "11:00", type: "第4回弁論", place: "103号法廷" },
  { date: "2025-12-23", time: "13:30", type: "第5回弁論", place: "103号法廷" },
  { date: "2026-03-19", time: "14:00", type: "第6回弁論", place: "103号法廷" },
  { date: "2026-05-12", time: "15:00", type: "第7回弁論", place: "103号法廷" },
  { date: "2026-06-23", time: "10:30", type: "第8回弁論", place: "103号法廷" },
  { date: "2026-08-21", time: "10:15", type: "証人尋問（1日目）", place: "103号法廷" },
  { date: "2026-08-24", time: "13:25", type: "証人尋問（2日目）", place: "103号法廷" },
];

const headers = { "content-type": "application/json", "X-Edit-Key": KEY };
const existing = (await (await fetch(BASE + "/api/events", { headers })).json())
  .filter((e) => e.caseId === CASE_ID).map((e) => e.date);

for (const e of events) {
  if (existing.includes(e.date)) { console.log("skip（登録済み）", e.date); continue; }
  const res = await fetch(BASE + "/api/events", {
    method: "POST", headers,
    body: JSON.stringify({ caseId: CASE_ID, court: T, open: true, ...e }),
  });
  console.log(res.status, e.date, e.type, res.ok ? "" : await res.text());
}
