import { useEffect, useRef, useState } from "react";

/**
 * Cloudflare Turnstile (captcha invisible para el visitante).
 *
 * Solo se carga si existe VITE_TURNSTILE_SITE_KEY en el build. Si no está
 * definida, el login funciona igual y el servidor tampoco exige captcha.
 */

const SITE_KEY = String(import.meta.env.VITE_TURNSTILE_SITE_KEY || "").trim();

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loader: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (loader) return loader;

  loader = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
    const script = existing ?? document.createElement("script");

    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("No se pudo cargar el captcha.")),
      { once: true }
    );

    if (!existing) {
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.turnstile = "1";
      document.head.appendChild(script);
    }
  });

  return loader;
}

export const TURNSTILE_ENABLED = SITE_KEY.length > 0;

export default function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  const [error, setError] = useState("");

  callback.current = onToken;

  useEffect(() => {
    if (!SITE_KEY || !container.current) return;

    let cancelled = false;
    let widgetId = "";

    loadTurnstile()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return;

        widgetId = window.turnstile.render(container.current, {
          sitekey: SITE_KEY,
          theme: "dark",
          language: "es",
          callback: (token: string) => callback.current(token),
          "expired-callback": () => callback.current(""),
          "error-callback": () => callback.current("")
        });
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(
          caught instanceof Error ? caught.message : "No se pudo cargar el captcha."
        );
      });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          // El widget ya no existe.
        }
      }
      callback.current("");
    };
  }, []);

  if (!SITE_KEY) return null;

  return (
    <div className="turnstile-slot">
      <div ref={container} />
      {error && <p className="field-hint">{error}</p>}
    </div>
  );
}
