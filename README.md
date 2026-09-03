# Highwater

**Mutual-aid dispatch for a flood: coordinators and their agents on one live board.**

When the Grand River comes up, help is a group chat: forty unread messages, a spreadsheet nobody updates, and a volunteer with a truck who doesn't know where to go. Highwater is one map. Requests and volunteers are pins. The coordinator drags pins, bumps urgency and marks things done by hand. The dispatch agent reads the same board through WebMCP, logs what comes in, matches the nearest suitable volunteer, draws the dispatch line, and broadcasts what's still unmet.

Built for [The WebMCP Challenge](https://webmcp.devpost.com/). **Live: https://highwater-six.vercel.app**

## Why WebMCP

Dispatch is a shared-state problem. An agent that only sees a screenshot of a map cannot know that the coordinator just moved Jamal's truck to the other side of the closed bridge. Highwater exposes the board as eleven structured tools registered with `document.modelContext.registerTool`:

| Tool | What it does |
| --- | --- |
| `get_situation` / `get_stats` | Everything on the board, open-and-urgent first, with coordinates |
| `add_request` / `add_offer` | Log incoming needs and volunteers; street names are placed on the map via a small gazetteer |
| `find_volunteers_for` | Nearest capable volunteers with distance in km and availability |
| `match` / `unmatch` | Dispatch, or release a stuck volunteer and reopen the request |
| `update_request` / `update_volunteer` | Urgency, status, notes, capacity |
| `broadcast` | Message volunteers or everyone; lands in the event feed |
| `focus_map` | Fly the coordinator's map to what the agent is talking about |

Every human edit (a dragged pin, an urgency click) changes the same model the tools read, and every agent edit lands in the event feed with a 🤖 mark.

## How to try it

1. Open the live URL in **ChatGPT's in-app browser** or **Chrome 149+** with `chrome://flags/#enable-webmcp-testing`. DevTools → Application → WebMCP lists the tools.
2. Or use the built-in dispatch agent on the right. Paste: *"3 texts just came in: Maria at 22 Erb St has water at the door and needs sandbags, 2 adults. The Chen family on King St has an infant, basement flooding fast, need to get out. Jamal texted he has a truck with 40 sandbags and is free now."* Then drag a volunteer pin across the river and ask *"Priya's boat is stuck at the Bridgeport bridge. Who else can get the seniors' residence out?"*

## Run locally

```bash
pnpm install
echo "GEMINI_API_KEY=your_key" > .env.local   # only for the in-page agent
pnpm dev
```

## Stack

Next.js 16 · Leaflet + react-leaflet (OpenStreetMap tiles) · Tailwind 4 · Gemini function calling · WebMCP (`document.modelContext`)

Fictional scenario and people; not an emergency service.

## License

MIT
