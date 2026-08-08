import { useState } from "react";
import { AvatarScene } from "./avatar/AvatarScene";
import type { AvatarAction, AvatarCommand } from "./avatar/types";
import "./App.css";

const actions: { action: AvatarAction; label: string }[] = [
  { action: "idle", label: "Idle" },
  { action: "wave", label: "Wave" },
  { action: "nod", label: "Nod" },
  { action: "shakeHead", label: "Shake" },
  { action: "talk", label: "Talk" },
];

export default function App() {
  const [command, setCommand] = useState<AvatarCommand>({ action: "idle", emotion: "neutral", nonce: 0 });

  const run = (action: AvatarAction) => {
    setCommand((current) => ({ ...current, action, nonce: current.nonce + 1 }));
  };

  return (
    <main className="app-shell">
      <section className="avatar-stage">
        <div className="topbar">
          <div>
            <span className="eyebrow">AVATAR FOUNDATION</span>
            <h1>Companion</h1>
          </div>
          <span className="status"><i /> Ready</span>
        </div>

        <div className="canvas-wrap">
          <AvatarScene command={command} />
          <div className="hint">Drag to rotate · Pinch to zoom</div>
        </div>

        <div className="control-panel">
          <p className="state-copy">Current behavior <strong>{command.action}</strong></p>
          <div className="action-grid">
            {actions.map(({ action, label }) => (
              <button key={action} className={command.action === action ? "active" : ""} onClick={() => run(action)}>
                {label}
              </button>
            ))}
          </div>
          <p className="roadmap">Next: production VRM model → animation clips → voice/lip sync → AI behavior planner.</p>
        </div>
      </section>
    </main>
  );
}
