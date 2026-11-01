export type ApiErrorPayload = {
  code: string;
  message: string;
  details?: Array<{ path: string; message: string }> | null;
};

export class ApiError extends Error {
  status: number;
  code: string;
  details: ApiErrorPayload["details"];

  constructor(status: number, code: string, message: string, details?: ApiErrorPayload["details"]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Envelope<T> = {
  ok: boolean;
  data: T;
  error: ApiErrorPayload | null;
};

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers);

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (method !== "GET" && method !== "HEAD") {
    headers.set("X-CB-Request", "1");
  }

  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers
  });

  let payload: Envelope<T> | null = null;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload || !payload.ok) {
    if (response.status === 401) {
      window.dispatchEvent(new Event("cueva:unauthorized"));
    }
    throw new ApiError(
      response.status,
      payload?.error?.code || "REQUEST_FAILED",
      payload?.error?.message || "No se pudo completar la solicitud.",
      payload?.error?.details
    );
  }

  return payload.data;
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-DO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 MB";
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
