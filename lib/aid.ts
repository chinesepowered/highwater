/** Highwater: a live mutual-aid board for a flood. Requests, offers, matches, broadcasts. One model for coordinators and agents. */

export const NEEDS = ["sandbags", "evacuation", "pump", "food", "medical", "shelter", "childcare", "other"] as const;
export type Need = (typeof NEEDS)[number];

export type Request = {
  id: string;
  who: string;
  need: Need;
  lat: number;
  lng: number;
  address?: string;
  people: number;
  notes?: string;
  urgency: number; // 1..5
  status: "open" | "matched" | "done";
  matchedTo?: string;
  createdAt: number;
  by: "agent" | "coordinator";
};
export type Offer = {
  id: string;
  who: string;
  can: Need[];
  lat: number;
  lng: number;
  capacity?: string;
  notes?: string;
  status: "available" | "busy" | "done";
  assigned: string[];
  by: "agent" | "coordinator";
};
export type Event = { id: string; ts: number; text: string; kind: "info" | "match" | "alert" | "broadcast"; by: "agent" | "coordinator" };

export type State = { requests: Request[]; offers: Offer[]; events: Event[]; focus: { lat: number; lng: number; zoom?: number; id?: string } | null; focusVersion: number };

export const NEED_STYLE: Record<Need, { icon: string; label: string }> = {
  sandbags: { icon: "🧱", label: "Sandbags" },
  evacuation: { icon: "🚤", label: "Evacuation" },
  pump: { icon: "🔧", label: "Pump" },
  food: { icon: "🍲", label: "Food" },
  medical: { icon: "🩺", label: "Medical" },
  shelter: { icon: "🏠", label: "Shelter" },
  childcare: { icon: "🧸", label: "Childcare" },
  other: { icon: "📌", label: "Other" },
};

const KEY = "highwater:v1";
const listeners = new Set<() => void>();
// eslint-disable-next-line prefer-const
let state: State;

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export const getState = () => state;
function emit(save = true) {
  for (const l of listeners) l();
  if (save && typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }
}
function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  emit();
}
export function hydrate() {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      state = { ...seed(), ...(JSON.parse(raw) as State), focus: null };
      emit(false);
    }
  } catch {}
}
export function resetDemo() {
  state = seed();
  emit();
}
function uid() {
  return Math.random().toString(36).slice(2, 8);
}

export const CENTER = { lat: 43.4668, lng: -80.5164 }; // Waterloo, Ontario, along the Grand River

function seed(): State {
  const now = Date.now();
  return {
    requests: [
      { id: "r1", who: "Nadia & kids", need: "sandbags", lat: 43.4712, lng: -80.5039, address: "Erb St E", people: 3, notes: "Water at the back step", urgency: 3, status: "open", createdAt: now - 3600e3, by: "coordinator" },
      { id: "r2", who: "Westhill seniors' residence", need: "evacuation", lat: 43.4598, lng: -80.5232, address: "King St S", people: 12, notes: "Ground floor flooding, 4 wheelchair users", urgency: 5, status: "open", createdAt: now - 2400e3, by: "coordinator" },
      { id: "r3", who: "The Okafors", need: "pump", lat: 43.4761, lng: -80.4922, address: "Bridgeport Rd", people: 4, notes: "Basement 30 cm and rising", urgency: 2, status: "matched", matchedTo: "o4", createdAt: now - 5400e3, by: "coordinator" },
      { id: "r4", who: "Lin family", need: "food", lat: 43.4527, lng: -80.5081, address: "Union St", people: 5, notes: "No power since last night, infant formula needed", urgency: 3, status: "open", createdAt: now - 1800e3, by: "coordinator" },
    ],
    offers: [
      { id: "o1", who: "Theo (pickup truck)", can: ["sandbags", "food"], lat: 43.4689, lng: -80.5301, capacity: "40 sandbags, 1 t", status: "available", assigned: [], by: "coordinator" },
      { id: "o2", who: "Priya (jon boat)", can: ["evacuation"], lat: 43.4634, lng: -80.5109, capacity: "4 people per trip", status: "available", assigned: [], by: "coordinator" },
      { id: "o3", who: "Anika, RN", can: ["medical"], lat: 43.4569, lng: -80.5024, capacity: "first aid kit, BP cuff", status: "available", assigned: [], by: "coordinator" },
      { id: "o4", who: "Dave (2 sump pumps)", can: ["pump"], lat: 43.4776, lng: -80.4961, status: "busy", assigned: ["r3"], by: "coordinator" },
      { id: "o5", who: "St. Matthew's hall", can: ["shelter", "food", "childcare"], lat: 43.4643, lng: -80.5204, capacity: "beds for 40, hot meals", status: "available", assigned: [], by: "coordinator" },
      { id: "o6", who: "Marcus (accessible van)", can: ["evacuation", "medical"], lat: 43.4501, lng: -80.5291, capacity: "2 wheelchairs + 4 seats", status: "available", assigned: [], by: "coordinator" },
    ],
    events: [
      { id: uid(), ts: now - 5400e3, text: "Dave dispatched to the Okafors with a pump.", kind: "match", by: "coordinator" },
      { id: uid(), ts: now - 7200e3, text: "Grand River expected to crest at 6 pm. Bridgeport bridge closed.", kind: "alert", by: "coordinator" },
    ],
    focus: null,
    focusVersion: 0,
  };
}
state = seed();

/* ---------- geo ---------- */
export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)) * 10) / 10;
}
/** Tiny gazetteer so an agent can place a text address without a geocoder. */
const STREETS: Record<string, { lat: number; lng: number }> = {
  "erb st": { lat: 43.4705, lng: -80.5085 },
  "king st": { lat: 43.4626, lng: -80.5196 },
  "bridgeport rd": { lat: 43.4757, lng: -80.4939 },
  "union st": { lat: 43.4534, lng: -80.5096 },
  "university ave": { lat: 43.4776, lng: -80.5322 },
  "columbia st": { lat: 43.4841, lng: -80.5292 },
  "weber st": { lat: 43.4642, lng: -80.5073 },
  "regina st": { lat: 43.4659, lng: -80.5178 },
  "park st": { lat: 43.4592, lng: -80.5157 },
  "albert st": { lat: 43.4706, lng: -80.5259 },
  "lakeshore": { lat: 43.4913, lng: -80.5387 },
  "uptown": { lat: 43.4657, lng: -80.5228 },
  "westmount": { lat: 43.4523, lng: -80.5359 },
};
export function locate(address?: string, lat?: number, lng?: number) {
  if (typeof lat === "number" && typeof lng === "number") return { lat, lng };
  const a = (address ?? "").toLowerCase();
  for (const [k, v] of Object.entries(STREETS)) if (a.includes(k)) return { lat: v.lat + (Math.random() - 0.5) * 0.004, lng: v.lng + (Math.random() - 0.5) * 0.004 };
  return { lat: CENTER.lat + (Math.random() - 0.5) * 0.02, lng: CENTER.lng + (Math.random() - 0.5) * 0.03 };
}

/* ---------- lookups ---------- */
export function findRequest(ref: string) {
  const r = ref.trim().toLowerCase();
  return state.requests.find((x) => x.id === r) ?? state.requests.find((x) => x.who.toLowerCase().includes(r)) ?? state.requests.find((x) => (x.address ?? "").toLowerCase().includes(r));
}
export function findOffer(ref: string) {
  const r = ref.trim().toLowerCase();
  return state.offers.find((x) => x.id === r) ?? state.offers.find((x) => x.who.toLowerCase().includes(r));
}
function normNeed(n: unknown): Need {
  const s = String(n ?? "other").toLowerCase();
  return (NEEDS.find((x) => s.includes(x)) ?? (s.includes("boat") || s.includes("rescue") ? "evacuation" : s.includes("nurse") || s.includes("doctor") ? "medical" : "other")) as Need;
}

/* ---------- actions ---------- */
export function log(text: string, kind: Event["kind"], by: Event["by"]) {
  set({ events: [{ id: uid(), ts: Date.now(), text, kind, by }, ...state.events].slice(0, 100) });
}
export function addRequest(input: { who: string; need: unknown; address?: string; lat?: number; lng?: number; people?: number; notes?: string; urgency?: number; by: Request["by"] }) {
  const pos = locate(input.address, input.lat, input.lng);
  const r: Request = {
    id: `r${uid()}`,
    who: input.who,
    need: normNeed(input.need),
    ...pos,
    address: input.address,
    people: Number(input.people ?? 1),
    notes: input.notes,
    urgency: Math.min(5, Math.max(1, Math.round(Number(input.urgency ?? 3)))),
    status: "open",
    createdAt: Date.now(),
    by: input.by,
  };
  set({ requests: [...state.requests, r], focus: { lat: r.lat, lng: r.lng, id: r.id }, focusVersion: state.focusVersion + 1 });
  log(`New request: ${r.who} needs ${r.need} (${r.people} people, urgency ${r.urgency})${r.address ? ` at ${r.address}` : ""}.`, r.urgency >= 4 ? "alert" : "info", input.by);
  return r;
}
export function addOffer(input: { who: string; can: unknown; address?: string; lat?: number; lng?: number; capacity?: string; notes?: string; by: Offer["by"] }) {
  const pos = locate(input.address, input.lat, input.lng);
  const can = (Array.isArray(input.can) ? input.can : [input.can]).map(normNeed);
  const o: Offer = { id: `o${uid()}`, who: input.who, can: Array.from(new Set(can)), ...pos, capacity: input.capacity, notes: input.notes, status: "available", assigned: [], by: input.by };
  set({ offers: [...state.offers, o], focus: { lat: o.lat, lng: o.lng, id: o.id }, focusVersion: state.focusVersion + 1 });
  log(`New volunteer: ${o.who} can help with ${o.can.join(", ")}${o.capacity ? ` (${o.capacity})` : ""}.`, "info", input.by);
  return o;
}
export function updateRequest(ref: string, patch: Partial<Pick<Request, "urgency" | "status" | "notes" | "people" | "need">>, by: Event["by"]) {
  const r = findRequest(ref);
  if (!r) return null;
  const next = { ...r, ...patch, urgency: patch.urgency ? Math.min(5, Math.max(1, patch.urgency)) : r.urgency };
  if (patch.status === "done" && r.matchedTo) {
    const o = findOffer(r.matchedTo);
    if (o) set({ offers: state.offers.map((x) => (x.id === o.id ? { ...x, assigned: x.assigned.filter((a) => a !== r.id), status: x.assigned.length <= 1 ? "available" : x.status } : x)) });
  }
  set({ requests: state.requests.map((x) => (x.id === r.id ? next : x)) });
  log(`${r.who}: ${Object.entries(patch).map(([k, v]) => `${k} → ${v}`).join(", ")}.`, patch.status === "done" ? "match" : "info", by);
  return next;
}
export function updateOffer(ref: string, patch: Partial<Pick<Offer, "status" | "notes" | "capacity" | "lat" | "lng">>, by: Event["by"]) {
  const o = findOffer(ref);
  if (!o) return null;
  const next = { ...o, ...patch };
  set({ offers: state.offers.map((x) => (x.id === o.id ? next : x)) });
  if (patch.lat === undefined) log(`${o.who}: ${Object.entries(patch).map(([k, v]) => `${k} → ${v}`).join(", ")}.`, "info", by);
  return next;
}
export function moveEntity(id: string, lat: number, lng: number) {
  if (state.requests.some((r) => r.id === id)) set({ requests: state.requests.map((r) => (r.id === id ? { ...r, lat, lng } : r)) });
  else set({ offers: state.offers.map((o) => (o.id === id ? { ...o, lat, lng } : o)) });
}
export function candidates(ref: string, need?: Need) {
  const r = findRequest(ref);
  if (!r) return null;
  const n = need ?? r.need;
  return state.offers
    .filter((o) => o.can.includes(n) && o.status !== "done")
    .map((o) => ({ id: o.id, who: o.who, can: o.can, capacity: o.capacity, status: o.status, assigned: o.assigned, distance_km: km(r, o) }))
    .sort((a, b) => a.distance_km - b.distance_km);
}
export function match(reqRef: string, offerRef: string, by: Event["by"]) {
  const r = findRequest(reqRef);
  const o = findOffer(offerRef);
  if (!r || !o) return { error: `Could not find ${!r ? reqRef : offerRef}` };
  set({
    requests: state.requests.map((x) => (x.id === r.id ? { ...x, status: "matched", matchedTo: o.id } : x)),
    offers: state.offers.map((x) => (x.id === o.id ? { ...x, status: "busy", assigned: Array.from(new Set([...x.assigned, r.id])) } : x)),
    focus: { lat: (r.lat + o.lat) / 2, lng: (r.lng + o.lng) / 2, id: r.id },
    focusVersion: state.focusVersion + 1,
  });
  log(`Matched ${o.who} → ${r.who} (${r.need}, ${km(r, o)} km).`, "match", by);
  return { request: r, offer: o, distance_km: km(r, o) };
}
export function unmatch(reqRef: string, by: Event["by"]) {
  const r = findRequest(reqRef);
  if (!r || !r.matchedTo) return null;
  const oid = r.matchedTo;
  set({
    requests: state.requests.map((x) => (x.id === r.id ? { ...x, status: "open", matchedTo: undefined } : x)),
    offers: state.offers.map((x) => (x.id === oid ? { ...x, assigned: x.assigned.filter((a) => a !== r.id), status: x.assigned.length <= 1 ? "available" : x.status } : x)),
  });
  log(`Unmatched ${r.who}; back in the open queue.`, "info", by);
  return r;
}
export function broadcast(text: string, to: string, by: Event["by"]) {
  log(`📣 To ${to}: ${text}`, "broadcast", by);
  return { sent_to: to === "all" ? state.offers.length + state.requests.length : state.offers.filter((o) => o.status !== "done").length };
}
export function focus(target: { lat: number; lng: number; zoom?: number; id?: string }) {
  set({ focus: target, focusVersion: state.focusVersion + 1 });
}
export function stats() {
  const open = state.requests.filter((r) => r.status === "open");
  return {
    open_requests: open.length,
    urgent_open: open.filter((r) => r.urgency >= 4).length,
    matched: state.requests.filter((r) => r.status === "matched").length,
    done: state.requests.filter((r) => r.status === "done").length,
    people_waiting: open.reduce((s, r) => s + r.people, 0),
    volunteers_available: state.offers.filter((o) => o.status === "available").length,
    volunteers_busy: state.offers.filter((o) => o.status === "busy").length,
  };
}
export function summary() {
  return {
    center: CENTER,
    stats: stats(),
    requests: [...state.requests]
      .sort((a, b) => (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1) || b.urgency - a.urgency)
      .map((r) => ({ id: r.id, who: r.who, need: r.need, people: r.people, urgency: r.urgency, status: r.status, matchedTo: r.matchedTo, address: r.address, notes: r.notes, lat: r.lat, lng: r.lng })),
    offers: state.offers.map((o) => ({ id: o.id, who: o.who, can: o.can, capacity: o.capacity, status: o.status, assigned: o.assigned, lat: o.lat, lng: o.lng })),
    recent: state.events.slice(0, 6).map((e) => e.text),
  };
}
