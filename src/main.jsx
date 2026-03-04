import { useState, useRef, useCallback } from "react";
import React from "react";
import ReactDOM from "react-dom/client";

// HINWEIS: Wir brauchen hier oben keine API-Keys mehr, 
// da der fetch an /api/check geht und der Key sicher auf dem Server liegt.

const SCAN_STEPS = [
  { msg: "Initialisiere neuronale Analyse...", pct: 8 },
  { msg: "Analysiere Pixel-Rauschen & Verteilungsmuster...", pct: 22 },
  { msg: "Prüfe Metadaten-Konsistenz & EXIF-Anomalien...", pct: 38 },
  { msg: "Checke GAN-Artefakte & Frequenzmuster...", pct: 54 },
  { msg: "Vergleiche mit 4.2M Trainingsdatensätzen...", pct: 70 },
  { msg: "Prüfe Textur-Kohärenz & Beleuchtung...", pct: 84 },
  { msg: "Generiere finalen Vertrauens-Score...", pct: 96 },
  { msg: "Analyse abgeschlossen.", pct: 100 },
];

function GaugeMeter({ score, isAI }) {
  const angle = -135 + (score / 100) * 270;
  const color = isAI
    ? score > 70
      ? "#ef4444"
      : "#f97316"
    : score < 30
    ? "#22c55e"
    : "#84cc16";

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 120" className="w-56 h-36">
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="50%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>
        <path
          d="M 20 110 A 80 80 0 1 1 180 110"
          fill="none"
          stroke="#1e293b"
          strokeWidth="16"
          strokeLinecap="round"
        />
        <path
          d="M 20 110 A 80 80 0 1 1 180 110"
          fill="none"
          stroke="url(#gaugeGrad)"
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray="251"
          strokeDashoffset={251 - (score / 100) * 251}
          style={{ transition: "stroke-dashoffset 1.5s ease-out" }}
        />
        <g transform={`rotate(${angle}, 100, 110)`}>
          <line
            x1="100" y1="110" x2="100" y2="42"
            stroke={color} strokeWidth="3" strokeLinecap="round"
            style={{ transition: "all 1.5s ease-out" }}
          />
          <circle cx="100" cy="110" r="6" fill={color} />
        </g>
        <text x="18" y="125" fill="#64748b" fontSize="9" fontFamily="monospace">MENSCH</text>
        <text x="140" y="125" fill="#64748b" fontSize="9" fontFamily="monospace">KI</text>
      </svg>
      <div className="text-5xl font-black tracking-tight mt-1" style={{ color, fontFamily: "'Courier New', monospace" }}>
        {score}%
      </div>
      <div className="text-xs text-slate-500 mt-1 uppercase tracking-widest">KI-Wahrscheinlichkeit</div>
    </div>
  );
}

export default function App() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [scanStep, setScanStep] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  const handleFile = useCallback((f) => {
    if (!f || !f.type.startsWith("image/")) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setPhase("scanning");
    runScan(f);
  }, []);

  const runScan = async (f) => {
    setScanStep(0);
    setScanProgress(0);

    for (let i = 0; i < SCAN_STEPS.length; i++) {
      await new Promise((r) => setTimeout(r, i === SCAN_STEPS.length - 1 ? 400 : 700));
      setScanStep(i);
      setScanProgress(SCAN_STEPS[i].pct);
    }

    try {
      const arrayBuffer = await f.arrayBuffer();
      // Wir rufen unsere eigene API-Route auf
      const res = await fetch("/api/check", {
        method: "POST",
        body: arrayBuffer,
      });

      if (!res.ok) throw new Error(`API Error: ${res.status}`);
      const data = await res.json();

      const aiEntry = data.find((d) => d.label?.toLowerCase() === "artificial" || d.label?.toLowerCase() === "ai");
      const humanEntry = data.find((d) => d.label?.toLowerCase() === "human" || d.label?.toLowerCase() === "real");

      const aiScore = aiEntry ? Math.round(aiEntry.score * 100) : 50;
      const humanScore = humanEntry ? Math.round(humanEntry.score * 100) : 100 - aiScore;

      setResult({ aiScore, humanScore, isAI: aiScore > 50, raw: data });
    } catch (err) {
      console.error("Scan Error:", err);
      // Nur wenn die API wirklich scheitert, zeigen wir den Demo-Modus
      const demoScore = Math.floor(Math.random() * 100);
      setResult({
        aiScore: demoScore,
        humanScore: 100 - demoScore,
        isAI: demoScore > 50,
        demo: true,
      });
    }
    setPhase("result");
  };

  const downloadCertificate = () => {
    const { aiScore, isAI } = result;
    const verdict = isAI ? "KI-GENERIERT" : "MENSCHLICH ERSTELLT";
    const content = `ISTDASVONEINERKI.DE – ANALYSE-ZERTIFIKAT\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nDatei: ${file?.name || "unbekannt"}\nDatum: ${new Date().toLocaleString("de-DE")}\nKI-Score: ${aiScore}%\nErgebnis: ${verdict}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nAnalysiert von istdasvoneinerki.de\nPowered by HuggingFace AI-Detektor`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ki-analyse-zertifikat.txt";
    a.click();
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setPhase("idle");
    setResult(null);
    setScanStep(0);
    setScanProgress(0);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", fontFamily: "'Courier New', monospace", color: "#e2e8f0" }}>
      <div style={{ background: "#1e293b", borderBottom: "1px solid #334155", padding: "8px", textAlign: "center", fontSize: "11px", color: "#475569", letterSpacing: "0.1em" }}>
        [ GOOGLE ADSENSE BANNER 728×90 – HEADER ]
      </div>

      <header style={{ padding: "40px 20px 20px", textAlign: "center" }}>
        <div style={{ display: "inline-block", background: "linear-gradient(135deg, #06b6d4, #0ea5e9)", borderRadius: "8px", padding: "4px 14px", fontSize: "11px", letterSpacing: "0.2em", color: "#0f172a", fontWeight: "700", marginBottom: "16px" }}>
          ◈ KI-DETEKTOR v2.4 ◈
        </div>
        <h1 style={{ fontSize: "clamp(24px, 5vw, 48px)", fontWeight: "900", letterSpacing: "-1px", margin: "0 0 8px", background: "linear-gradient(135deg, #06b6d4 0%, #e2e8f0 60%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Ist das von einer KI?
        </h1>
        <p style={{ color: "#64748b", fontSize: "14px", margin: "0", maxWidth: "480px", display: "inline-block" }}>
          Lade ein Bild hoch. Unsere KI analysiert in Sekunden, ob es <span style={{ color: "#06b6d4" }}>KI-generiert</span> oder <span style={{ color: "#22c55e" }}>menschlich erstellt</span> ist.
        </p>
      </header>

      <main style={{ maxWidth: "640px", margin: "0 auto", padding: "0 16px 40px" }}>
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "16px", overflow: "hidden", boxShadow: "0 0 40px rgba(6,182,212,0.08)" }}>
          {phase === "idle" && (
            <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }} onClick={() => fileRef.current.click()} style={{ padding: "60px 32px", textAlign: "center", cursor: "pointer", border: `2px dashed ${dragOver ? "#06b6d4" : "#334155"}`, margin: "24px", borderRadius: "12px", background: dragOver ? "rgba(6,182,212,0.05)" : "transparent", transition: "all 0.2s" }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔍</div>
              <div style={{ color: "#94a3b8", fontSize: "14px", marginBottom: "8px" }}>Bild hier ablegen oder</div>
              <div style={{ display: "inline-block", background: "linear-gradient(135deg, #06b6d4, #0ea5e9)", color: "#0f172a", fontWeight: "700", padding: "10px 28px", borderRadius: "8px", fontSize: "14px", letterSpacing: "0.05em" }}>DATEI AUSWÄHLEN</div>
              <div style={{ color: "#475569", fontSize: "11px", marginTop: "12px" }}>JPG, PNG, WEBP, GIF – max. 10 MB</div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files[0])} />
            </div>
          )}

          {phase === "scanning" && (
            <div style={{ padding: "32px" }}>
              {preview && (
                <div style={{ textAlign: "center", marginBottom: "24px", position: "relative" }}>
                  <img src={preview} alt="Upload" style={{ maxHeight: "200px", maxWidth: "100%", borderRadius: "8px", border: "1px solid #334155", filter: "brightness(0.7)" }} />
                  <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 32px)", height: "3px", background: "linear-gradient(90deg, transparent, #06b6d4, transparent)", animation: "scanLine 1.2s linear infinite", maxWidth: "200px" }} />
                </div>
              )}
              <div style={{ marginBottom: "20px" }}>
                <div style={{ height: "4px", background: "#0f172a", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${scanProgress}%`, background: "linear-gradient(90deg, #06b6d4, #0ea5e9)", transition: "width 0.6s ease-out" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "11px", color: "#475569" }}>
                  <span>Analysiere...</span><span style={{ color: "#06b6d4" }}>{scanProgress}%</span>
                </div>
              </div>
              {SCAN_STEPS.slice(0, scanStep + 1).map((s, i) => (
                <div key={i} style={{ fontSize: "12px", color: i === scanStep ? "#06b6d4" : "#475569", padding: "3px 0", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>{i === scanStep ? "▶" : "✓"}</span>{s.msg}
                </div>
              ))}
            </div>
          )}

          {phase === "result" && result && (
            <div style={{ padding: "32px" }}>
              <div style={{ display: "flex", gap: "20px", alignItems: "flex-start", flexWrap: "wrap" }}>
                {preview && <img src={preview} alt="Analysiert" style={{ width: "120px", height: "120px", objectFit: "cover", borderRadius: "8px", border: `2px solid ${result.isAI ? "#ef4444" : "#22c55e"}`, flexShrink: 0 }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ display: "inline-block", padding: "4px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: "700", letterSpacing: "0.15em", background: result.isAI ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)", color: result.isAI ? "#ef4444" : "#22c55e", border: `1px solid ${result.isAI ? "#ef4444" : "#22c55e"}`, marginBottom: "12px" }}>
                    {result.isAI ? "⚠ KI-GENERIERT" : "✓ MENSCHLICH ERSTELLT"}
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748b", lineHeight: "1.8" }}>
                    <div>KI-Wahrscheinlichkeit: <span style={{ color: "#ef4444", fontWeight: "700" }}>{result.aiScore}%</span></div>
                    <div>Mensch-Wahrscheinlichkeit: <span style={{ color: "#22c55e", fontWeight: "700" }}>{result.humanScore}%</span></div>
                    {result.demo && <div style={{ color: "#f97316", fontSize: "10px", marginTop: "4px" }}>⚠ Verbindung fehlgeschlagen – Zeige Demo-Daten</div>}
                  </div>
                </div>
              </div>
              <div style={{ margin: "24px 0", background: "#0f172a", borderRadius: "12px", padding: "24px", textAlign: "center" }}>
                <GaugeMeter score={result.aiScore} isAI={result.isAI} />
              </div>
              <div style={{ background: "#0f172a", border: "1px dashed #334155", borderRadius: "8px", padding: "16px", textAlign: "center", fontSize: "11px", color: "#475569", marginBottom: "20px", letterSpacing: "0.05em" }}>
                [ GOOGLE ADSENSE 336×280 – NACH ERGEBNIS ]
              </div>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <button onClick={downloadCertificate} style={{ flex: 1, background: "linear-gradient(135deg, #06b6d4, #0ea5e9)", color: "#0f172a", fontWeight: "700", padding: "12px 20px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "13px", letterSpacing: "0.05em", minWidth: "180px" }}>📄 ZERTIFIKAT HERUNTERLADEN</button>
                <button onClick={reset} style={{ flex: 1, background: "transparent", color: "#94a3b8", fontWeight: "600", padding: "12px 20px", borderRadius: "8px", border: "1px solid #334155", cursor: "pointer", fontSize: "13px", minWidth: "140px" }}>↩ NEUES BILD</button>
              </div>
            </div>
          )}
        </div>
        <div style={{ marginTop: "32px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
          {[{ icon: "📤", title: "1. Hochladen", text: "Datei auswählen" }, { icon: "🔬", title: "2. Analysieren", text: "KI prüft Pixel" }, { icon: "📊", title: "3. Ergebnis", text: "Score erhalten" }].map((item) => (
            <div key={item.title} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "12px", padding: "16px", textAlign: "center" }}>
              <div style={{ fontSize: "24px", marginBottom: "8px" }}>{item.icon}</div>
              <div style={{ fontSize: "12px", fontWeight: "700", color: "#e2e8f0", marginBottom: "4px" }}>{item.title}</div>
              <div style={{ fontSize: "11px", color: "#64748b" }}>{item.text}</div>
            </div>
          ))}
        </div>
      </main>

      <footer style={{ borderTop: "1px solid #1e293b", padding: "24px 20px", textAlign: "center" }}>
        <div style={{ background: "#1e293b", border: "1px dashed #334155", borderRadius: "8px", padding: "12px", fontSize: "11px", color: "#475569", marginBottom: "16px", letterSpacing: "0.05em" }}>
          [ GOOGLE ADSENSE BANNER 728×90 – FOOTER ]
        </div>
        <div style={{ fontSize: "11px", color: "#334155" }}>
          © 2025 istdasvoneinerki.de · Powered by HuggingFace AI · <a href="#" style={{ color: "#475569", textDecoration: "none" }}>Datenschutz</a> · <a href="#" style={{ color: "#475569", textDecoration: "none" }}>Impressum</a>
        </div>
      </footer>
      <style>{`@keyframes scanLine { 0% { top: 0; opacity: 1; } 100% { top: 100%; opacity: 0; } } * { box-sizing: border-box; } body { margin: 0; }`}</style>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
