"use client";

import dynamic from "next/dynamic";
import { useEffect, useSyncExternalStore } from "react";
import AgentPanel from "@/components/AgentPanel";
import * as A from "@/lib/aid";
import { aidTools } from "@/lib/tools";
import { registerTools } from "@/lib/webmcp";

const Board = dynamic(() => import("@/components/Board"), { ssr: false });
const AidMap = dynamic(() => import("@/components/AidMap"), { ssr: false, loading: () => <div className="grid h-full place-items-center text-slate-400">Loading map…</div> });

const SYSTEM = `You are the dispatch agent for Highwater, a neighbourhood mutual-aid board during the Grand River flood in Waterloo, Ontario. You work alongside a human coordinator who sees the same map and lists you edit.
Today is ${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}.
How to work:
- Call get_situation first, every time, because the coordinator moves pins and changes urgency by hand.
- When the coordinator pastes incoming messages, turn each one into add_request or add_offer with the best street you can infer and sensible urgency (5 = life safety: people who can't move, medical, water rising indoors; 4 = infants/elderly, no power and cold; 3 = property protection; 1-2 = can wait).
- Then, for every open request, find_volunteers_for and match the nearest suitable volunteer who is available. Prefer keeping high-capacity resources for high-urgency needs. If nobody fits, broadcast the unmet need.
- After matching, focus_map on the most urgent situation you touched.
- If told a volunteer is stuck or unavailable, update_volunteer, unmatch what they had, and re-match.
- Reply in 2-4 short sentences: what you logged, who you sent where, what's still unmet. Never print JSON or ids.`;

const SUGGESTIONS = [
  "3 texts just came in: Maria at 22 Erb St has water at the door and needs sandbags, 2 adults. The Chen family on King St has an infant, basement flooding fast, need to get out. Jamal texted he has a truck with 40 sandbags and is free now.",
  "Priya's boat is stuck at the Bridgeport bridge. Who else can get the seniors' residence out?",
  "What's still unmet, and who is closest?",
];

export default function Home() {
  const s = useSyncExternalStore(A.subscribe, A.getState, A.getState);
  useEffect(() => registerTools(aidTools), []);
  const st = A.stats();

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-50 text-slate-900">
      <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-700 text-lg text-white">🌊</span>
          <div>
            <div className="text-sm font-bold leading-tight">Highwater</div>
            <div className="text-[11px] text-slate-500">Mutual-aid dispatch · Grand River flood, Waterloo · coordinators and agents on one board</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span className={`rounded-full px-2 py-1 font-semibold ${st.urgent_open ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}`}>
            {st.urgent_open ? `${st.urgent_open} urgent unmet` : "no urgent unmet"}
          </span>
          <span className="text-slate-500">{s.requests.length} requests · {s.offers.length} volunteers</span>
          <button onClick={() => confirm("Reset the demo data?") && A.resetDemo()} className="rounded-md border border-slate-300 px-2 py-1 text-slate-500 hover:bg-slate-100">
            Reset
          </button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="w-[330px] shrink-0 border-r border-slate-200 bg-white">
          <Board />
        </aside>
        <main className="relative min-w-0 flex-1">
          <AidMap />
          <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-lg bg-white/90 px-2 py-1 text-[10px] text-slate-600 shadow">
            drag any pin to move it · agent dispatch lines in blue
          </div>
        </main>
        <aside className="flex w-[400px] shrink-0 flex-col border-l border-slate-200 bg-white">
          <AgentPanel
            title="Dispatch agent"
            systemPrompt={SYSTEM}
            suggestions={SUGGESTIONS}
            placeholder="Paste incoming messages or ask…"
            intro="I'm watching the board. Paste what's coming in and I'll log, match and dispatch. Move pins or change urgency any time; I re-read before acting."
          />
        </aside>
      </div>
    </div>
  );
}
