"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/** A free map (Leaflet with OpenStreetMap tiles, credited as their terms ask): shop pins coloured by
 * status, a van's path, visit markers and vans' last places. Pins can be dragged where `onMovePin` is
 * given, and a tap on the map reports its place where `onTap` is. Loaded only on map screens. */

export type MapPin = { id: string; lat: number; lng: number; label: string; color: string; draggable?: boolean };
export type MapProps = {
  pins?: MapPin[];
  path?: { lat: number; lng: number }[];
  dots?: { lat: number; lng: number; label: string; color?: string }[];
  onMovePin?: (id: string, lat: number, lng: number) => void;
  onTap?: (lat: number, lng: number) => void;
  height?: number;
};

const dotIcon = (color: string) => L.divIcon({ className: "", html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,.35)"></span>`, iconSize: [16, 16], iconAnchor: [8, 8] });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export default function MapView({ pins = [], path = [], dots = [], onMovePin, onTap, height = 380 }: MapProps) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const handlers = useRef({ onMovePin, onTap });
  handlers.current = { onMovePin, onTap };

  useEffect(() => {
    if (!box.current || map.current) return;
    const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView([20.6, 78.9], 5);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => handlers.current.onTap?.(e.latlng.lat, e.latlng.lng));
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const bounds: L.LatLngExpression[] = [];
    if (path.length > 1) {
      L.polyline(path.map((p) => [p.lat, p.lng] as L.LatLngTuple), { color: "#4f46e5", weight: 4, opacity: 0.75 }).addTo(g);
      path.forEach((p) => bounds.push([p.lat, p.lng]));
    }
    for (const d of dots) {
      L.circleMarker([d.lat, d.lng], { radius: 6, color: "white", weight: 2, fillColor: d.color ?? "#0f172a", fillOpacity: 1 }).bindTooltip(esc(d.label)).addTo(g);
      bounds.push([d.lat, d.lng]);
    }
    for (const p of pins) {
      const mk = L.marker([p.lat, p.lng], { icon: dotIcon(p.color), draggable: !!p.draggable && !!handlers.current.onMovePin, title: p.label }).bindTooltip(esc(p.label));
      if (p.draggable) mk.on("dragend", () => {
        const at = mk.getLatLng();
        handlers.current.onMovePin?.(p.id, at.lat, at.lng);
      });
      mk.addTo(g);
      bounds.push([p.lat, p.lng]);
    }
    if (bounds.length === 1) m.setView(bounds[0], 15);
    else if (bounds.length > 1) m.fitBounds(L.latLngBounds(bounds), { padding: [24, 24], maxZoom: 16 });
  }, [pins, path, dots]);

  return <div ref={box} style={{ height }} className="z-0 w-full overflow-hidden rounded-xl border border-border" />;
}
