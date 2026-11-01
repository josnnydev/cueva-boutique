import { useRef, useState, type ChangeEvent } from "react";
import { api, ApiError } from "../api";
import { useToast } from "../toast";
import type { Product } from "../types";

type SignResponse = {
  path: string;
  signedUrl: string;
  token: string;
  publicUrl: string;
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen. Prueba con JPG, PNG o WebP."));
    };
    image.src = url;
  });
}

function renderCanvas(image: HTMLImageElement, maxSize: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("El navegador no pudo procesar la imagen.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("No se pudo convertir la foto a WebP."));
      },
      "image/webp",
      quality
    );
  });
}

async function uploadToSignedUrl(signedUrl: string, blob: Blob): Promise<void> {
  const response = await fetch(signedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "image/webp"
    },
    body: blob
  });

  if (!response.ok) {
    throw new Error(`Supabase Storage respondió ${response.status}.`);
  }
}

export default function ImageUploader({
  product,
  onUpdated
}: {
  product: Product;
  onUpdated: () => Promise<void> | void;
}) {
  const { show } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [error, setError] = useState("");
  const current = product.image;

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("El archivo debe ser una imagen.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError("La foto original no puede superar 12 MB.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      setStep("Leyendo la foto…");
      const image = await loadImage(file);

      setStep("Redimensionando…");
      const fullCanvas = renderCanvas(image, 1200);
      const thumbCanvas = renderCanvas(image, 480);
      const fullBlob = await toBlob(fullCanvas, 0.82);
      const thumbBlob = await toBlob(thumbCanvas, 0.78);

      setStep("Pidiendo permiso de subida…");
      const fullSign = await api<SignResponse>(`/products/${product.id}/images/sign`, {
        method: "POST",
        body: JSON.stringify({
          contentType: "image/webp",
          bytes: fullBlob.size,
          kind: "full"
        })
      });

      const thumbSign = await api<SignResponse>(`/products/${product.id}/images/sign`, {
        method: "POST",
        body: JSON.stringify({
          contentType: "image/webp",
          bytes: thumbBlob.size,
          kind: "thumb"
        })
      });

      setStep("Subiendo la foto…");
      await uploadToSignedUrl(fullSign.signedUrl, fullBlob);
      await uploadToSignedUrl(thumbSign.signedUrl, thumbBlob);

      setStep("Guardando en el producto…");
      await api(`/products/${product.id}/images`, {
        method: "POST",
        body: JSON.stringify({
          path: fullSign.path,
          thumbPath: thumbSign.path,
          alt: product.name,
          width: fullCanvas.width,
          height: fullCanvas.height,
          bytes: fullBlob.size + thumbBlob.size,
          isPrimary: true
        })
      });

      await onUpdated();
      show("Foto actualizada.", "success");
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : caught instanceof Error ? caught.message : "No se pudo subir la foto.";
      setError(message);
      show(message, "error");
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  async function removeImage() {
    if (!current) return;
    const confirmed = window.confirm("¿Eliminar la foto principal de este producto?");
    if (!confirmed) return;

    setBusy(true);
    setError("");
    try {
      await api(`/products/${product.id}/images/${current.id}`, { method: "DELETE" });
      await onUpdated();
      show("Foto eliminada.", "success");
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : "No se pudo eliminar la foto.";
      setError(message);
      show(message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="image-uploader">
      <div className="image-uploader__preview">
        {current?.url ? (
          <img src={current.url} alt={current.alt || product.name} />
        ) : (
          <div className="image-uploader__empty">
            <span>Sin foto</span>
            <small>Sube una imagen cuadrada o vertical.</small>
          </div>
        )}
      </div>

      <div className="image-uploader__body">
        <strong>Foto principal</strong>
        <p>
          Se convierte a WebP y se optimiza automáticamente. La miniatura se usa en la
          cuadrícula de la tienda.
        </p>

        {error && <div className="alert alert--error">{error}</div>}
        {busy && <div className="progress-note">{step || "Procesando…"}</div>}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFile}
          hidden
        />

        <div className="row-actions">
          <button
            type="button"
            className="btn btn--gold btn--small"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {current ? "Reemplazar foto" : "Subir foto"}
          </button>
          {current && (
            <button
              type="button"
              className="btn btn--danger btn--small"
              onClick={removeImage}
              disabled={busy}
            >
              Eliminar
            </button>
          )}
        </div>

        {current?.width && current?.height && (
          <small className="muted">
            {current.width} × {current.height} px
            {current.bytes ? ` · ${(current.bytes / 1024).toFixed(0)} KB` : ""}
          </small>
        )}
      </div>
    </div>
  );
}
