import type { LatLngTuple } from "leaflet";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { VoiceRecorder } from "capacitor-voice-recorder";
import { v4 as uuidv4 } from "uuid";
import MarkerClusterGroup from "react-leaflet-cluster";

// Leaflet map
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import * as L from "leaflet";
// @ts-ignore
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
// @ts-ignore
import markerIcon from "leaflet/dist/images/marker-icon.png";
// @ts-ignore
import markerShadow from "leaflet/dist/images/marker-shadow.png";
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

const IS_WEB = Capacitor.getPlatform() === "web";

/* ────────────────────────────────────────────────────────────────────────────
   Types & Storage
──────────────────────────────────────────────────────────────────────────── */
type Note = {
  id: string;
  filePath: string;  // path in Filesystem
  webPath: string;   // src for <audio> (blob:/file:/content:/)
  createdAt: string;
  lat: number;
  lon: number;
  label?: string;
  durationMs?: number;
  mimeType?: string;
};

const NOTES_INDEX = "notesIndex.json";

async function readNotes(): Promise<Note[]> {
  try {
    const res = await Filesystem.readFile({ path: NOTES_INDEX, directory: Directory.Data, encoding: Encoding.UTF8 });
    const raw = res.data as unknown; // string | Blob (web)
    const text = typeof raw === "string" ? raw : await (raw as Blob).text();
    return JSON.parse(text) as Note[];
  } catch {
    return [];
  }
}
async function writeNotes(notes: Note[]) {
  await Filesystem.writeFile({
    path: NOTES_INDEX,
    data: JSON.stringify(notes),
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    recursive: true,
  });
}

/* ────────────────────────────────────────────────────────────────────────────
   Utils
──────────────────────────────────────────────────────────────────────────── */
function msToClock(ms: number) {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), ss = (s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}
function toBase64Standard(input: string): string {
  let b64 = input.replace(/^data:.*;base64,/, "").trim().replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  if (pad === 1) throw new Error("Invalid base64 length");
  if (pad > 0) b64 += "=".repeat(4 - pad);
  return b64;
}
function base64ToBlob(b64: string, mime = "application/octet-stream"): Blob {
  const clean = b64.replace(/^data:.*;base64,/, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ""; const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function mimeToExt(m: string): string {
  if (!m) return "m4a";
  if (m.includes("webm")) return "webm";
  if (m.includes("wav")) return "wav";
  if (m.includes("mp3")) return "mp3";
  return "m4a";
}

/* ────────────────────────────────────────────────────────────────────────────
   Record View
──────────────────────────────────────────────────────────────────────────── */
/* ─── Record view (drop-in replacement) ───────────────────────────────────── */
type UIStatus = "IDLE" | "RECORDING" | "SAVED" | "FAILED_TO_RECORD";

const RecordView: React.FC<{ onSaved: (n: Note) => void }> = ({ onSaved }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [uiStatus, setUiStatus] = useState<UIStatus>("IDLE");
  const timerRef = useRef<number | null>(null);

  // Geo state
  const positionRef = useRef<{ lat: number; lon: number } | null>(null);
  const watchIdRef = useRef<string | null>(null);

  // Web fallback recorder
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);

  // Warm up permissions
  useEffect(() => {
    (async () => {
      try {
        const perm = await Geolocation.checkPermissions();
        if (perm.location !== "granted") await Geolocation.requestPermissions();
      } catch { }
    })();
  }, []);

  const startTimer = () => {
    const t0 = Date.now();
    timerRef.current = window.setInterval(() => setElapsed(Date.now() - t0), 200) as unknown as number;
  };
  const stopTimer = () => { if (timerRef.current) window.clearInterval(timerRef.current); timerRef.current = null; };

  async function startGeoWatch() {
    try {
      // snapshot once
      const first = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 8000 });
      positionRef.current = { lat: first.coords.latitude, lon: first.coords.longitude };
    } catch { }
    try {
      // then watch for improvements during the recording
      const id = await Geolocation.watchPosition({ enableHighAccuracy: true },
        (pos, err) => {
          if (err) return;
          if (pos) positionRef.current = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        }
      );
      watchIdRef.current = id as string | null;
    } catch { }
  }

  function stopGeoWatch() {
    if (watchIdRef.current) {
      Geolocation.clearWatch({ id: watchIdRef.current }).catch(() => { });
      watchIdRef.current = null;
    }
  }

  const start = async () => {
    try {
      setStatus(null);

      await startGeoWatch();

      if (IS_WEB) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mr = new MediaRecorder(stream);
        mediaChunksRef.current = [];
        mr.ondataavailable = (e) => { if (e.data && e.data.size) mediaChunksRef.current.push(e.data); };
        mr.start();
        mediaRecorderRef.current = mr;
        mediaStreamRef.current = stream;
        setIsRecording(true); setUiStatus("RECORDING"); setElapsed(0); startTimer();
        return;
      }

      await VoiceRecorder.requestAudioRecordingPermission();
      await VoiceRecorder.startRecording();
      setIsRecording(true); setUiStatus("RECORDING"); setElapsed(0); startTimer();
    } catch {
      setUiStatus("FAILED_TO_RECORD"); setStatus("FAILED_TO_RECORD");
      stopGeoWatch();
    }
  };

  const stop = async () => {
    try {
      stopTimer();
      stopGeoWatch();

      if (IS_WEB) {
        const mr = mediaRecorderRef.current;
        if (!mr) throw new Error("No recorder");
        const finished = new Promise<Blob>((resolve) => { mr.onstop = () => resolve(new Blob(mediaChunksRef.current, { type: "audio/webm" })); });
        mr.stop();
        const blob = await finished;
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null; mediaStreamRef.current = null;

        const arrayBuffer = await blob.arrayBuffer();
        const base64 = arrayBufferToBase64(arrayBuffer);
        const id = uuidv4();
        const filename = `audio/${id}.webm`;
        await Filesystem.writeFile({ path: filename, directory: Directory.Data, data: base64, recursive: true });
        const webPath = URL.createObjectURL(blob);

        const coords = positionRef.current ?? { lat: 0, lon: 0 };
        const note: Note = {
          id, filePath: filename, webPath,
          createdAt: new Date().toISOString(),
          lat: coords.lat, lon: coords.lon,
          label: new Date().toLocaleString(), durationMs: elapsed, mimeType: "audio/webm",
        };
        const existing = await readNotes(); await writeNotes([note, ...existing]); onSaved(note);
        setIsRecording(false); setUiStatus("SAVED"); setStatus("Saved"); setTimeout(() => setStatus(null), 1200);
        return;
      }

      const result = await VoiceRecorder.stopRecording();
      setIsRecording(false);

      const rawBase64 = result?.value?.recordDataBase64;
      const ms = result?.value?.msDuration as number | undefined;
      const mime = (result?.value?.mimeType as string | undefined) || "audio/m4a";
      if (!rawBase64) throw new Error("No audio data");

      const base64 = toBase64Standard(rawBase64);
      const id = uuidv4();
      const ext = mimeToExt(mime);
      const filename = `audio/${id}.${ext}`;
      await Filesystem.writeFile({ path: filename, directory: Directory.Data, data: base64, recursive: true });
      const fileUri = await Filesystem.getUri({ path: filename, directory: Directory.Data });
      const webPath = Capacitor.convertFileSrc(fileUri.uri);

      const coords = positionRef.current ?? (await (async () => {
        try {
          const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 8000 });
          return { lat: p.coords.latitude, lon: p.coords.longitude };
        } catch { return { lat: 0, lon: 0 }; }
      })());

      const note: Note = {
        id, filePath: filename, webPath,
        createdAt: new Date().toISOString(),
        lat: coords.lat, lon: coords.lon,
        label: new Date().toLocaleString(), durationMs: ms ?? elapsed, mimeType: mime,
      };
      const existing = await readNotes(); await writeNotes([note, ...existing]); onSaved(note);
      setUiStatus("SAVED"); setStatus("Saved"); setTimeout(() => setStatus(null), 1200);
    } catch {
      setIsRecording(false); setUiStatus("FAILED_TO_RECORD"); setStatus("FAILED_TO_RECORD"); setTimeout(() => setStatus(null), 1800);
      stopGeoWatch();
    }
  };

  return (
    <div className="center">
      <div className="badge">{uiStatus === "RECORDING" ? "Recording…" : uiStatus === "FAILED_TO_RECORD" ? "FAILED_TO_RECORD" : status || ""}</div>
      <button onClick={isRecording ? stop : start} className={`btn-circle${isRecording ? " rec" : ""}`}>
        {isRecording ? "Stop" : "Record"}
      </button>
      <div className="badge" style={{ height: 24 }}>{isRecording ? msToClock(elapsed) : ""}</div>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────────────
   Map View
──────────────────────────────────────────────────────────────────────────── */
type MapViewProps = {
  notes: Note[];
  onDelete: (id: string) => Promise<void>;
};

const MapView: React.FC<MapViewProps> = ({ notes, onDelete }) => {
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      } catch {
        setCoords(null);
      }
    })();
  }, []);

  const located = useMemo(() => notes.filter(n => !(n.lat === 0 && n.lon === 0)), [notes]);
  const unlocated = useMemo(() => notes.filter(n => (n.lat === 0 && n.lon === 0)), [notes]);

  const center = useMemo<LatLngTuple>(() => {
    if (coords) return [coords.lat, coords.lon];
    if (located.length > 0) return [located[0].lat, located[0].lon];
    return [42.2808, -83.743];
  }, [coords, located]);

  // Ensure Leaflet measures container after mount & on resize
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const kick = () => m.invalidateSize({ animate: false });
    const id = requestAnimationFrame(kick);
    window.addEventListener("resize", kick);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", kick);
    };
  }, []);

  // Keep map centered when `center` changes
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    m.setView(center);
  }, [center[0], center[1]]);

  // Fit bounds when we have located notes
  useEffect(() => {
    const m = mapRef.current;
    if (!m || located.length === 0) return;
    const b = L.latLngBounds(located.map(n => [n.lat, n.lon] as [number, number]));
    m.fitBounds(b, { padding: [40, 40] });
  }, [JSON.stringify(located.map(n => [n.lat, n.lon]))]);

  const onPlay = async (note: Note) => {
    if (!audioRef.current) return;
    const a = audioRef.current;

    // A) Try the stored webPath first
    try {
      a.pause();
      a.src = note.webPath;
      a.currentTime = 0;
      a.load();
      await a.play();
      return; // success
    } catch (e) {
      console.warn("play failed on webPath:", e, { src: note.webPath, mime: note.mimeType });
    }

    // B) Fallback: read the file with Capacitor FS and build a Blob URL
    try {
      const rf = await Filesystem.readFile({ path: note.filePath, directory: Directory.Data });
      const data = rf.data as string;               // base64 on native + web
      const mime =
        note.mimeType ||
        (note.filePath.endsWith(".webm") ? "audio/webm" :
          note.filePath.endsWith(".mp3") ? "audio/mpeg" :
            note.filePath.endsWith(".wav") ? "audio/wav" : "audio/m4a");

      const blob = base64ToBlob(data, mime);
      const url = URL.createObjectURL(blob);

      a.pause();
      a.src = url;
      a.currentTime = 0;
      a.load();
      await a.play();
      return; // success
    } catch (e2) {
      console.warn("play failed on Blob fallback:", e2, { filePath: note.filePath, mime: note.mimeType });
    }

    // C) Still failing — surface something useful
    alert("Couldn't play this memo. If this keeps happening, try re-recording one to verify playback.");
  };

  // NEW: delete wrapper with confirm and stop playback if needed
  const onDeleteClick = async (note: Note) => {
    if (!confirm("Delete this memo? This will permanently remove the audio file.")) return;
    try {
      // stop if the same memo is playing
      if (audioRef.current && audioRef.current.src === note.webPath) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    } catch { }
    await onDelete(note.id);
  };

  return (
    <div style={{ height: "100%", position: "relative", minHeight: 0 }}>
      <div style={{ position: "absolute", inset: 0 }}>
        <MapContainer
          ref={mapRef}
          center={center}
          zoom={15}
          maxZoom={22}
          zoomSnap={0.25}
          zoomDelta={0.25}
          style={{ height: "100%", width: "100%" }}
          preferCanvas
        >
          <TileLayer
            attribution="© OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxNativeZoom={19}
          />

          <MarkerClusterGroup spiderfyOnMaxZoom showCoverageOnHover={false} maxClusterRadius={40}>

            {located.map((n) => (
              <Marker key={n.id} position={[n.lat, n.lon]}>
                <Popup>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14 }}>
                    {n.label || new Date(n.createdAt).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 12, color: "#a3a3a3", marginBottom: 10 }}>
                    {(n.mimeType || "").replace("audio/", "").toUpperCase()} · {n.durationMs ? msToClock(n.durationMs) : ""}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => onPlay(n)}
                      style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #404040", background: "#0a0a0a", color: "#e5e5e5" }}
                    >
                      ▶ Play
                    </button>
                    <button
                      onClick={() => onDeleteClick(n)}
                      style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #7f1d1d", background: "#1f2937", color: "#fca5a5", fontWeight: 700 }}
                    >
                      🗑 Delete
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>

        </MapContainer>
      </div>

      {/* Unlocated tray: add delete buttons too */}
      {unlocated.length > 0 && (
        <div style={{ position: "absolute", left: 12, right: 12, bottom: 76, background: "rgba(10,10,10,0.92)", border: "1px solid #404040", borderRadius: 12, padding: 10, fontSize: 14 }}>
          <div style={{ marginBottom: 6, color: "#e5e5e5" }}>
            Saved {unlocated.length} memo{unlocated.length > 1 ? "s" : ""} without location:
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {unlocated.slice(0, 8).map((n) => (
              <div key={n.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button onClick={() => onPlay(n)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #404040", background: "#0a0a0a", color: "#e5e5e5" }}>
                  {n.label || new Date(n.createdAt).toLocaleString()}
                </button>
                <button onClick={() => onDeleteClick(n)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #7f1d1d", background: "#1f2937", color: "#fca5a5" }}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <audio
        ref={audioRef}
        preload="metadata"
        playsInline
        controls   // keep for now; remove later if you want
        style={{ position: "fixed", left: 8, right: 8, bottom: 8, opacity: 0.001, pointerEvents: "none", height: 28 }}
      />
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────────────
   App Shell
──────────────────────────────────────────────────────────────────────────── */
export default function App() {
  const [tab, setTab] = useState<"record" | "map">("record");
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => { (async () => setNotes(await readNotes()))(); }, []);

  const handleSaved = (note: Note) => setNotes((p) => [note, ...p]);

  // NEW: delete by id (removes audio file + updates index)
  const handleDelete = async (id: string) => {
    const all = await readNotes();
    const target = all.find(n => n.id === id);

    // try to delete audio file; continue even if it fails
    if (target) {
      try {
        await Filesystem.deleteFile({ path: target.filePath, directory: Directory.Data });
        // Revoke blob URL to release memory (web)
        if (target.webPath?.startsWith("blob:")) {
          try { URL.revokeObjectURL(target.webPath); } catch { }
        }
      } catch (e) {
        console.warn("deleteFile failed (continuing):", e);
      }
    }

    const next = all.filter(n => n.id !== id);
    await writeNotes(next);
    setNotes(next);
  };

  return (
    <div className="app">
      <div className="header">{tab === "record" ? "New Voice Memo" : "Your Memos"}</div>
      <main className="content">
        {tab === "record"
          ? <RecordView onSaved={handleSaved} />
          : <MapView notes={notes} onDelete={handleDelete} />  /* ← pass it in */
        }
      </main>
      <div className="footer">
        <button className={`tab ${tab === "record" ? "active" : ""}`} onClick={() => setTab("record")}>Record</button>
        <button className={`tab ${tab === "map" ? "active" : ""}`} onClick={() => setTab("map")}>Map</button>
      </div>
    </div>
  );
}

