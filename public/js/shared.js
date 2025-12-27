import { serverTeamFromServerField as serverTeamFromStats } from "./stats.js";

export function escapeHtml(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return ch;
    }
  });
}

export function formatDate(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}

export function formatDateKey(ts) {
  if (!ts) return "unknown-date";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "unknown-date";
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function normalizeGroupValue(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim().toLowerCase();
  return trimmed || fallback;
}

export function serverPlayerIndex(server) {
  if (typeof server !== "number") return null;
  if (server >= 1 && server <= 4) return server - 1;
  if (server === 1) return 0;
  if (server === 2) return 2;
  return null;
}

export function splitTeamPlayers(label, fallbackTeam) {
  if (typeof label !== "string" || !label.trim()) {
    return [`${fallbackTeam} P1`, `${fallbackTeam} P2`];
  }
  const parts = label
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 1) {
    parts.push(`${parts[0]}?`);
  }
  while (parts.length < 2) {
    parts.push(`${fallbackTeam} P${parts.length + 1}`);
  }
  return parts.slice(0, 2);
}

export function serverTeamFromServerField(server) {
  return serverTeamFromStats(server);
}

export function shouldHideSetForFinishedMatch(match, top, bottom) {
  if (match.status !== "finished") return false;
  const normalize = (value) => {
    if (value == null) return null;
    const trimmed = String(value).trim();
    if (!trimmed || trimmed === "-" || trimmed === "?") return null;
    const num = Number(trimmed);
    return Number.isNaN(num) ? trimmed : num;
  };

  const topNorm = normalize(top);
  const bottomNorm = normalize(bottom);
  const bothMissing = topNorm == null && bottomNorm == null;
  const bothZero =
    typeof topNorm === "number" &&
    typeof bottomNorm === "number" &&
    topNorm === 0 &&
    bottomNorm === 0;

  return bothMissing || bothZero;
}
