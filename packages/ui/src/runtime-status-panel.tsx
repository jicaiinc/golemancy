import type { RuntimeStatusResponse } from "@golemancy/protocol";
import { AlertTriangle, CheckCircle2, Database, Server, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

export interface RuntimeStatusPanelProps {
  status: RuntimeStatusResponse | null;
  error: string | null;
  loading: boolean;
  onRefresh: () => void;
}

export function RuntimeStatusPanel({ status, error, loading, onRefresh }: RuntimeStatusPanelProps) {
  const components = status?.components ?? [];

  return (
    <section className="runtime-panel" aria-label="Local runtime status">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Desktop Runtime</p>
          <h1>Golemancy</h1>
        </div>
        <button className="icon-button" type="button" onClick={onRefresh} aria-label="Refresh runtime status">
          <Server size={18} aria-hidden />
        </button>
      </div>

      <div className="status-grid">
        <StatusTile
          icon={<Server size={18} aria-hidden />}
          label="Sidecar"
          value={status ? `PID ${status.pid}` : loading ? "Checking" : "Unavailable"}
          tone={status && !error ? "ok" : error ? "error" : "pending"}
        />
        <StatusTile
          icon={<Database size={18} aria-hidden />}
          label="SQLite"
          value={status?.database.opened ? `Schema ${status.database.schemaVersion}` : "Not open"}
          tone={status?.database.opened ? "ok" : error ? "error" : "pending"}
        />
        <StatusTile
          icon={<ShieldCheck size={18} aria-hidden />}
          label="Local Auth"
          value={status ? "Bearer token active" : "Pending"}
          tone={status ? "ok" : error ? "error" : "pending"}
        />
      </div>

      {error ? (
        <div className="runtime-error" role="status">
          <AlertTriangle size={18} aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="runtime-details">
        <dl>
          <div>
            <dt>Node</dt>
            <dd>{status?.nodeVersion ?? "Waiting for sidecar"}</dd>
          </div>
          <div>
            <dt>Data Dir</dt>
            <dd>{status?.database.path ?? "Waiting for SQLite"}</dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd>{status ? new Date(status.startedAt).toLocaleString() : "Not connected"}</dd>
          </div>
        </dl>

        <div className="component-list" aria-label="Runtime components">
          {components.map((component) => (
            <div className="component-row" key={component.name}>
              <CheckCircle2 size={16} aria-hidden />
              <div>
                <strong>{component.name}</strong>
                <span>{component.detail}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

interface StatusTileProps {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "ok" | "pending" | "error";
}

function StatusTile({ icon, label, value, tone }: StatusTileProps) {
  return (
    <div className={`status-tile ${tone}`}>
      <div className="tile-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
