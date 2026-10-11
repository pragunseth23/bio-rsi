/** Thin client for the FastAPI service proxied at /api. */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** True when the failure is connectivity, not a rejected request. */
export const isNetworkError = (e: unknown) =>
  !(e instanceof ApiError) || e.status >= 502;

function describe(detail: unknown): string {
  if (typeof detail === "string") return detail;
  // Pydantic validation errors: [{loc: [...], msg: "..."}]
  if (Array.isArray(detail) && detail.length) {
    return detail
      .map((d: { loc?: unknown[]; msg?: string }) => {
        const field = d.loc?.filter((x) => x !== "body").join(".");
        return field ? `${field}: ${d.msg}` : d.msg;
      })
      .join(" · ");
  }
  return "The request was rejected. Check the configuration and try again.";
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("The research service is unreachable.", 0);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      response.status >= 500 && !body
        ? "The research service is unreachable."
        : describe(body?.detail);
    throw new ApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}

export const postJson = <T>(path: string, body?: unknown, signal?: AbortSignal) =>
  api<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

export const svgUrl = (smiles: string) =>
  `/api/molecule/svg?smiles=${encodeURIComponent(smiles)}`;

/** Download the run export in-page so failures are reported, not hidden in a popup. */
export async function downloadExport(runId: string) {
  const response = await fetch(`/api/runs/${runId}/export`).catch(() => null);
  if (!response?.ok) throw new Error("Export failed. The run could not be retrieved.");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `discovery-${runId}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const storage = {
  get(key: string) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* storage unavailable (private mode); the app works without it */
    }
  },
};
