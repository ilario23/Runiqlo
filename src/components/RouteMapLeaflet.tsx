'use client';

import {useEffect, useRef} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface ZoneSegment {
  points: [number, number][];
  color: string;
}

// Leaflet path options need literal colors, not CSS vars — these mirror globals.css tokens.
const INK = '#1a1814';
const PAPER = '#f2ede2';

interface RouteMapLeafletProps {
  /** Colored polyline segments (one per HR zone run). Replaces the single polyline. */
  segments: ZoneSegment[];
  /** White dot that follows chart hover. */
  hoverPos?: [number, number] | null;
  /** Sport color — used for start/end markers. */
  color: string;
}

export default function RouteMapLeaflet({segments, hoverPos, color}: RouteMapLeafletProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const segmentLinesRef = useRef<L.Polyline[]>([]);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const startMarkerRef = useRef<L.CircleMarker | null>(null);
  const endMarkerRef = useRef<L.CircleMarker | null>(null);

  // ── Initialise map once ────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
      dragging: true,
      doubleClickZoom: true,
    });

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      {maxZoom: 19},
    ).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Draw / redraw zone-coloured segments ───────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || segments.length === 0) return;

    // Remove old segments and markers
    segmentLinesRef.current.forEach((p) => p.remove());
    segmentLinesRef.current = [];
    startMarkerRef.current?.remove();
    endMarkerRef.current?.remove();

    // Draw each segment with its zone colour
    const allLatLngs: L.LatLng[] = [];

    for (const seg of segments) {
      if (seg.points.length < 2) continue;
      const poly = L.polyline(seg.points, {
        color: seg.color,
        weight: 4,
        opacity: 0.85,
        smoothFactor: 1,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);
      segmentLinesRef.current.push(poly);
      seg.points.forEach(([lat, lng]) => allLatLngs.push(L.latLng(lat, lng)));
    }

    if (allLatLngs.length > 0) {
      map.fitBounds(L.latLngBounds(allLatLngs), {padding: [24, 24]});
    }

    // Start dot
    const firstPt = segments[0]?.points[0];
    if (firstPt) {
      startMarkerRef.current = L.circleMarker(firstPt, {
        radius: 5,
        color: PAPER,
        fillColor: color,
        fillOpacity: 1,
        weight: 2,
      }).addTo(map);
    }

    // End dot
    const lastSeg = segments[segments.length - 1];
    const lastPt = lastSeg?.points[lastSeg.points.length - 1];
    if (lastPt) {
      endMarkerRef.current = L.circleMarker(lastPt, {
        radius: 5,
        color: PAPER,
        fillColor: color,
        fillOpacity: 0.45,
        weight: 2,
      }).addTo(map);
    }
  }, [segments, color]);

  // ── Move hover dot ─────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!hoverPos) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    if (markerRef.current) {
      markerRef.current.setLatLng(hoverPos);
    } else {
      markerRef.current = L.circleMarker(hoverPos, {
        radius: 6,
        color: PAPER,
        fillColor: INK,
        fillOpacity: 1,
        weight: 2,
      }).addTo(map);
    }
  }, [hoverPos]);

  return (
    <div
      ref={containerRef}
      className="w-full h-[300px] rounded-xl overflow-hidden"
      style={{background: 'var(--color-paper-2)'}}
    />
  );
}
