"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useSyncExternalStore } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import * as A from "@/lib/aid";

const URGENCY_COLOR = ["", "#6b7280", "#2563eb", "#d97706", "#ea580c", "#dc2626"];

function icon(kind: "request" | "offer", label: string, color: string, done: boolean, focused: boolean) {
  const size = kind === "request" ? 38 : 32;
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:${kind === "request" ? "50%" : "10px"};background:${done ? "#9ca3af" : color};color:#fff;display:grid;place-items:center;font-size:${size * 0.5}px;border:3px solid ${focused ? "#facc15" : "#fff"};box-shadow:0 4px 14px rgba(0,0,0,.35);${focused ? "animation:pulse 1.2s ease-in-out infinite;" : ""}">${label}</div>`,
  });
}

function FocusController({ focus, version }: { focus: A.State["focus"]; version: number }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    map.flyTo([focus.lat, focus.lng], focus.zoom ?? Math.max(map.getZoom(), 14), { duration: 0.9 });
  }, [focus, version, map]);
  return null;
}

export default function AidMap() {
  const s = useSyncExternalStore(A.subscribe, A.getState, A.getState);
  const focusedId = s.focus?.id;

  return (
    <MapContainer center={[A.CENTER.lat, A.CENTER.lng]} zoom={14} className="h-full w-full" zoomControl={false} attributionControl>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FocusController focus={s.focus} version={s.focusVersion} />
      {s.requests
        .filter((r) => r.status === "matched" && r.matchedTo)
        .map((r) => {
          const o = s.offers.find((x) => x.id === r.matchedTo);
          if (!o) return null;
          return <Polyline key={`l${r.id}`} positions={[[o.lat, o.lng], [r.lat, r.lng]]} pathOptions={{ color: "#2563eb", weight: 4, dashArray: "8 8", opacity: 0.8 }} />;
        })}
      {s.offers.map((o) => (
        <Marker
          key={o.id}
          position={[o.lat, o.lng]}
          draggable
          icon={icon("offer", "🙋", o.status === "busy" ? "#1d4ed8" : "#0f766e", o.status === "done", focusedId === o.id)}
          eventHandlers={{
            dragend: (e) => {
              const p = (e.target as L.Marker).getLatLng();
              A.moveEntity(o.id, p.lat, p.lng);
              A.log(`${o.who} moved on the map by the coordinator.`, "info", "coordinator");
            },
          }}
        >
          <Tooltip direction="top" offset={[0, -18]}>
            <b>{o.who}</b> · {o.can.join(", ")}
            {o.capacity ? ` · ${o.capacity}` : ""} · {o.status}
          </Tooltip>
        </Marker>
      ))}
      {s.requests.map((r) => (
        <Marker
          key={r.id}
          position={[r.lat, r.lng]}
          draggable
          icon={icon("request", A.NEED_STYLE[r.need].icon, URGENCY_COLOR[r.urgency], r.status === "done", focusedId === r.id)}
          eventHandlers={{
            dragend: (e) => {
              const p = (e.target as L.Marker).getLatLng();
              A.moveEntity(r.id, p.lat, p.lng);
            },
          }}
        >
          <Tooltip direction="top" offset={[0, -20]}>
            <b>{r.who}</b> · {A.NEED_STYLE[r.need].label} · {r.people} people · urgency {r.urgency} · {r.status}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
