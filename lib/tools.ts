import type { ToolDef } from "@/lib/webmcp";
import * as A from "@/lib/aid";

const needEnum = { type: "string", enum: [...A.NEEDS], description: "Kind of help." };

/** Highwater's WebMCP tools: the live mutual-aid board for a flood, editable by coordinators and agents. */
export const aidTools: ToolDef[] = [
  {
    name: "get_situation",
    description:
      "Read the whole board: stats, every request (who, need, people, urgency 1-5, status, matched volunteer, location) sorted open-and-urgent first, every volunteer offer (what they can do, capacity, status, assignments), and recent events. Call this before making changes.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute: () => A.summary(),
  },
  {
    name: "add_request",
    description:
      "Log a new request for help from a resident. Give an address or street (e.g. 'Erb St', 'King St', 'Union St') so it can be placed on the map, or lat/lng. Urgency 1 (can wait) to 5 (life safety: medical, rising water with people who can't move).",
    inputSchema: {
      type: "object",
      properties: {
        who: { type: "string", description: "Household or person, e.g. 'the Chen family'." },
        need: needEnum,
        address: { type: "string" },
        lat: { type: "number" },
        lng: { type: "number" },
        people: { type: "integer", minimum: 1 },
        notes: { type: "string", description: "Key facts: water level, infants, wheelchairs, medical conditions." },
        urgency: { type: "integer", minimum: 1, maximum: 5 },
      },
      required: ["who", "need"],
    },
    execute: (a) => {
      const r = A.addRequest({ who: String(a.who), need: a.need, address: a.address as string | undefined, lat: a.lat as number | undefined, lng: a.lng as number | undefined, people: a.people as number | undefined, notes: a.notes as string | undefined, urgency: a.urgency as number | undefined, by: "agent" });
      return `Request ${r.id}: ${r.who}, ${r.need}, ${r.people} people, urgency ${r.urgency}, at ${r.lat.toFixed(4)},${r.lng.toFixed(4)}`;
    },
  },
  {
    name: "add_offer",
    description: "Register a volunteer or resource: who they are, what kinds of help they can give, where they are, capacity (e.g. '40 sandbags', 'boat, 4 per trip', 'beds for 40').",
    inputSchema: {
      type: "object",
      properties: {
        who: { type: "string" },
        can: { type: "array", items: needEnum },
        address: { type: "string" },
        lat: { type: "number" },
        lng: { type: "number" },
        capacity: { type: "string" },
        notes: { type: "string" },
      },
      required: ["who", "can"],
    },
    execute: (a) => {
      const o = A.addOffer({ who: String(a.who), can: a.can, address: a.address as string | undefined, lat: a.lat as number | undefined, lng: a.lng as number | undefined, capacity: a.capacity as string | undefined, notes: a.notes as string | undefined, by: "agent" });
      return `Offer ${o.id}: ${o.who} can do ${o.can.join(", ")} at ${o.lat.toFixed(4)},${o.lng.toFixed(4)}`;
    },
  },
  {
    name: "find_volunteers_for",
    description: "List volunteers who can meet a request's need, nearest first, with distance in km and whether they're free or busy. Use before matching.",
    inputSchema: { type: "object", properties: { request: { type: "string", description: "Request id or resident name." }, need: needEnum }, required: ["request"] },
    annotations: { readOnlyHint: true },
    execute: (a) => {
      const c = A.candidates(String(a.request), a.need as A.Need | undefined);
      if (!c) throw new Error(`No request matching "${a.request}"`);
      return c.length ? c : "Nobody on the board can meet that need yet. Consider broadcast.";
    },
  },
  {
    name: "match",
    description: "Assign a volunteer to a request. Draws the dispatch line on the map, marks the request matched and the volunteer busy.",
    inputSchema: { type: "object", properties: { request: { type: "string" }, volunteer: { type: "string", description: "Offer id or name." } }, required: ["request", "volunteer"] },
    execute: (a) => {
      const r = A.match(String(a.request), String(a.volunteer), "agent");
      if ("error" in r) throw new Error(r.error);
      return `Matched ${r.offer.who} to ${r.request.who}, ${r.distance_km} km away.`;
    },
  },
  {
    name: "unmatch",
    description: "Release a volunteer from a request (e.g. they got stuck) and put the request back in the open queue.",
    inputSchema: { type: "object", properties: { request: { type: "string" } }, required: ["request"] },
    execute: (a) => {
      const r = A.unmatch(String(a.request), "agent");
      if (!r) throw new Error(`No matched request "${a.request}"`);
      return `${r.who} is open again.`;
    },
  },
  {
    name: "update_request",
    description: "Change a request's urgency, status (open, matched, done), notes, people count or need.",
    inputSchema: {
      type: "object",
      properties: {
        request: { type: "string" },
        urgency: { type: "integer", minimum: 1, maximum: 5 },
        status: { type: "string", enum: ["open", "matched", "done"] },
        notes: { type: "string" },
        people: { type: "integer" },
        need: needEnum,
      },
      required: ["request"],
    },
    execute: (a) => {
      const { request, ...rest } = a;
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined && v !== null) patch[k] = v;
      const r = A.updateRequest(String(request), patch, "agent");
      if (!r) throw new Error(`No request matching "${request}"`);
      return `Updated ${r.who}: ${JSON.stringify(patch)}`;
    },
  },
  {
    name: "update_volunteer",
    description: "Change a volunteer's status (available, busy, done), capacity or notes.",
    inputSchema: {
      type: "object",
      properties: { volunteer: { type: "string" }, status: { type: "string", enum: ["available", "busy", "done"] }, capacity: { type: "string" }, notes: { type: "string" } },
      required: ["volunteer"],
    },
    execute: (a) => {
      const { volunteer, ...rest } = a;
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined && v !== null) patch[k] = v;
      const o = A.updateOffer(String(volunteer), patch, "agent");
      if (!o) throw new Error(`No volunteer matching "${volunteer}"`);
      return `Updated ${o.who}: ${JSON.stringify(patch)}`;
    },
  },
  {
    name: "broadcast",
    description: "Send a message to volunteers (or everyone) and post it to the event feed. Use for urgent unmet needs or safety notices.",
    inputSchema: { type: "object", properties: { message: { type: "string" }, to: { type: "string", enum: ["volunteers", "all"] } }, required: ["message"] },
    execute: (a) => {
      const r = A.broadcast(String(a.message), a.to === "all" ? "all" : "volunteers", "agent");
      return `Broadcast sent to ${r.sent_to} people.`;
    },
  },
  {
    name: "focus_map",
    description: "Pan the coordinator's map to a request, a volunteer, or coordinates, so they see what you're talking about.",
    inputSchema: {
      type: "object",
      properties: { request: { type: "string" }, volunteer: { type: "string" }, lat: { type: "number" }, lng: { type: "number" }, zoom: { type: "integer", minimum: 11, maximum: 17 } },
    },
    annotations: { readOnlyHint: true },
    execute: (a) => {
      const t = a.request ? A.findRequest(String(a.request)) : a.volunteer ? A.findOffer(String(a.volunteer)) : typeof a.lat === "number" ? { lat: a.lat as number, lng: a.lng as number, id: undefined } : null;
      if (!t) throw new Error("Nothing to focus on.");
      A.focus({ lat: t.lat, lng: t.lng, zoom: (a.zoom as number | undefined) ?? 15, id: "id" in t ? t.id : undefined });
      return `Map centred on ${"who" in t ? t.who : `${t.lat},${t.lng}`}`;
    },
  },
  {
    name: "get_stats",
    description: "Quick numbers: open requests, urgent open, matched, done, people waiting, volunteers available/busy.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute: () => A.stats(),
  },
];
