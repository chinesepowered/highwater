"use client";

import { useEffect, useSyncExternalStore } from "react";
import * as A from "@/lib/aid";

const URGENCY_COLOR = ["", "#6b7280", "#2563eb", "#d97706", "#ea580c", "#dc2626"];

export default function Board() {
  const s = useSyncExternalStore(A.subscribe, A.getState, A.getState);
  useEffect(() => {
    A.hydrate();
  }, []);
  const st = A.stats();
  const requests = [...s.requests].sort((a, b) => (a.status === "done" ? 1 : 0) - (b.status === "done" ? 1 : 0) || (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1) || b.urgency - a.urgency);

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-4 gap-2 border-b border-slate-200 p-3 text-center">
        {[
          ["open", st.open_requests, st.urgent_open ? `${st.urgent_open} urgent` : ""],
          ["waiting", st.people_waiting, "people"],
          ["matched", st.matched, "dispatched"],
          ["free", st.volunteers_available, `${st.volunteers_busy} busy`],
        ].map(([k, v, sub]) => (
          <div key={String(k)} className="rounded-xl bg-slate-100 py-2">
            <div className="text-xl font-bold tabular-nums">{v}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{k}</div>
            {sub ? <div className={`text-[10px] ${k === "open" && st.urgent_open ? "font-semibold text-red-600" : "text-slate-400"}`}>{sub}</div> : null}
          </div>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-3 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Requests</div>
        <ul className="space-y-2 p-3">
          {requests.map((r) => {
            const o = r.matchedTo ? s.offers.find((x) => x.id === r.matchedTo) : undefined;
            return (
              <li
                key={r.id}
                data-testid="request"
                onClick={() => A.focus({ lat: r.lat, lng: r.lng, id: r.id, zoom: 15 })}
                className={`cursor-pointer rounded-xl border bg-white p-2.5 shadow-sm transition hover:shadow ${s.focus?.id === r.id ? "border-yellow-400 ring-2 ring-yellow-300" : "border-slate-200"} ${r.status === "done" ? "opacity-50" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-full text-base text-white" style={{ background: URGENCY_COLOR[r.urgency] }}>
                    {A.NEED_STYLE[r.need].icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{r.who}</div>
                    <div className="truncate text-[11px] text-slate-500">
                      {A.NEED_STYLE[r.need].label} · {r.people} {r.people === 1 ? "person" : "people"}
                      {r.address ? ` · ${r.address}` : ""}
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.status === "open" ? "bg-red-50 text-red-700" : r.status === "matched" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>
                    {r.status === "matched" && o ? `→ ${o.who.split(" (")[0]}` : r.status}
                  </span>
                </div>
                {r.notes && <div className="mt-1 text-[11px] text-slate-600">{r.notes}</div>}
                <div className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-500">
                  <span>urgency</span>
                  {[1, 2, 3, 4, 5].map((u) => (
                    <button
                      key={u}
                      onClick={(e) => {
                        e.stopPropagation();
                        A.updateRequest(r.id, { urgency: u }, "coordinator");
                      }}
                      className="h-3.5 w-3.5 rounded-full border"
                      style={{ background: u <= r.urgency ? URGENCY_COLOR[r.urgency] : "transparent", borderColor: URGENCY_COLOR[u] }}
                      aria-label={`set urgency ${u}`}
                    />
                  ))}
                  <span className="ml-auto flex gap-1">
                    {r.status !== "done" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          A.updateRequest(r.id, { status: "done" }, "coordinator");
                        }}
                        className="rounded border border-slate-300 px-1.5 py-0.5 hover:bg-emerald-50"
                      >
                        ✓ done
                      </button>
                    )}
                    {r.by === "agent" && <span title="added by agent">🤖</span>}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="px-3 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Volunteers &amp; resources</div>
        <ul className="space-y-1.5 p-3">
          {s.offers.map((o) => (
            <li
              key={o.id}
              data-testid="offer"
              onClick={() => A.focus({ lat: o.lat, lng: o.lng, id: o.id, zoom: 15 })}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border bg-white px-2.5 py-2 text-sm shadow-sm ${s.focus?.id === o.id ? "border-yellow-400 ring-2 ring-yellow-300" : "border-slate-200"}`}
            >
              <span className={`grid h-7 w-7 place-items-center rounded-lg text-white ${o.status === "busy" ? "bg-blue-700" : o.status === "done" ? "bg-slate-400" : "bg-teal-700"}`}>🙋</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{o.who}</div>
                <div className="truncate text-[11px] text-slate-500">
                  {o.can.join(", ")}
                  {o.capacity ? ` · ${o.capacity}` : ""}
                </div>
              </div>
              <span className="text-[10px] text-slate-500">{o.status}</span>
              {o.by === "agent" && <span title="added by agent">🤖</span>}
            </li>
          ))}
        </ul>

        <div className="px-3 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Events</div>
        <ul className="space-y-1 p-3 pb-6">
          {s.events.slice(0, 8).map((e) => (
            <li key={e.id} data-testid="event" className={`rounded-lg px-2 py-1.5 text-[12px] ${e.kind === "alert" ? "bg-red-50 text-red-800" : e.kind === "broadcast" ? "bg-amber-50 text-amber-900" : e.kind === "match" ? "bg-blue-50 text-blue-900" : "bg-slate-50 text-slate-700"}`}>
              {e.text}
              <span className="ml-1 text-[10px] text-slate-400">
                {e.by === "agent" ? "🤖" : "👤"} {new Date(e.ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
