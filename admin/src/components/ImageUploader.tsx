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

const MAX_IMAGES = 8;

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
      "Content-Type": "image/webp",
      // El CDN de Supabase guarda la foto 1 año: no se revalida en cada visita.
      "cache-control": "max-age=31536000"
    },
    body: blob
  });

  if (!response.ok) {
    throw new Error(`Supabase Storage respondió ${response.status}.`);
  }
}

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof ApiError
    ? caught.message
    : caught instanceof Error
      ? caught.message
      : fallback;
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
  const images = product.images || [];
  const full = images.length >= MAX_IMAGES;

  async function uploadOne(file: File, makePrimary: boolean): Promise<void> {
    const image = await loadImage(file);
    const fullCanvas = renderCanvas(image, 1200);
    const thumbCanvas = renderCanvas(image, 480);
    const fullBlob = await toBlob(fullCanvas, 0.82);
    const thumbBlob = await toBlob(thumbCanvas, 0.78);

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

    await uploadToSignedUrl(fullSign.signedUrl, fullBlob);
    await uploadToSignedUrl(thumbSign.signedUrl, thumbBlob);

    await api(`/products/${product.id}/images`, {
      method: "POST",
      body: JSON.stringify({
        path: fullSign.path,
        thumbPath: thumbSign.path,
        alt: product.name,
        width: fullCanvas.width,
        height: fullCanvas.height,
        bytes: fullBlob.size + thumbBlob.size,
        isPrimary: makePrimary
      })
    });
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      setError(`Este producto ya tiene ${MAX_IMAGES} fotos. Elimina una para agregar otra.`);
      return;
    }

    const selected = files.slice(0, room);
    setBusy(true);
    setError("");
    let uploaded = 0;
    const failures: string[] = [];

    try {
      for (let index = 0; index < selected.length; index += 1) {
        const file = selected[index];
        if (!file.type.startsWith("image/")) {
          failures.push(`${file.name}: no es una imagen.`);
          continue;
        }
        if (file.size > 12 * 1024 * 1024) {
          failures.push(`${file.name}: supera los 12 MB.`);
          continue;
        }

        setStep(
          selected.length > 1
            ? `Procesando foto ${index + 1} de ${selected.length}…`
            : "Procesando foto…"
        );

        try {
          await uploadOne(file, images.length === 0 && uploaded === 0);
          uploaded += 1;
        } catch (caught) {
          failures.push(`${file.name}: ${errorMessage(caught, "no se pudo subir.")}`);
        }
      }

      if (uploaded > 0) {
        await onUpdated();
        show(
          uploaded === 1 ? "Foto agregada a la galería." : `${uploaded} fotos agregadas a la galería.`,
          "success"
        );
      }
    } finally {
      setBusy(false);
      setStep("");
    }

    if (files.length > room) {
      failures.push(`Solo se agregaron ${room} fotos: el máximo es ${MAX_IMAGES}.`);
    }
    if (failures.length) {
      setError(failures.join(" "));
      show(failures[0], "error");
    }
  }

  async function makePrimary(imageId: string) {
    setBusy(true);
    setError("");
    try {
      await api(`/products/${product.id}/images/${imageId}`, {
        method: "PATCH",
        body: JSON.stringify({ isPrimary: true })
      });
      await onUpdated();
      show("Foto principal actualizada.", "success");
    } catch (caught) {
      const message = errorMessage(caught, "No se pudo cambiar la foto principal.");
      setError(message);
      show(message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function moveImage(index: number, direction: -1 | 1) {
    const target = index + direction;
    // La foto principal se mantiene siempre en la primera posición.
    if (index === 0 || target < 1 || target >= images.length) return;

    const order = images.map((image) => image.id);
    [order[index], order[target]] = [order[target], order[index]];

    setBusy(true);
    setError("");
    try {
      await api(`/products/${product.id}/images/order`, {
        method: "PUT",
        body: JSON.stringify({ imageIds: order })
      });
      await onUpdated();
      show("Orden de la galería actualizado.", "success");
    } catch (caught) {
      const message = errorMessage(caught, "No se pudo reordenar la galería.");
      setError(message);
      show(message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeImage(imageId: string, isPrimary: boolean) {
    const confirmed = window.confirm(
      isPrimary
        ? "¿Eliminar la foto principal? La siguiente foto de la galería pasará a ser la principal."
        : "¿Eliminar esta foto de la galería?"
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    try {
      await api(`/products/${product.id}/images/${imageId}`, { method: "DELETE" });
      await onUpdated();
      show("Foto eliminada.", "success");
    } catch (caught) {
      const message = errorMessage(caught, "No se pudo eliminar la foto.");
      setError(message);
      show(message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="image-uploader">
      <div className="gallery-head">
        <div>
          <strong>Galería del producto</strong>
          <p>
            La primera foto es la principal y se usa en la tarjeta. Las demás se ven en el
            carrusel y en la foto ampliada de la tienda.
          </p>
        </div>
        <span className={`gallery-count${full ? " gallery-count--full" : ""}`}>
          {images.length} / {MAX_IMAGES}
        </span>
      </div>

      {error && <div className="alert alert--error">{error}</div>}
      {busy && <div className="progress-note">{step || "Procesando…"}</div>}

      {images.length ? (
        <ul className="gallery-grid">
          {images.map((image, index) => (
            <li
              key={image.id}
              className={`gallery-item${image.isPrimary ? " gallery-item--primary" : ""}`}
            >
              <div className="gallery-item__media">
                <img
                  src={image.thumbUrl || image.url || ""}
                  alt={image.alt || product.name}
                  loading="lazy"
                />
                {image.isPrimary && <span className="gallery-item__badge">Principal</span>}
              </div>

              <div className="gallery-item__actions">
                {!image.isPrimary && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--tiny"
                    onClick={() => makePrimary(image.id)}
                    disabled={busy}
                    title="Usar como foto principal"
                  >
                    Principal
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn--ghost btn--tiny"
                  onClick={() => moveImage(index, -1)}
                  disabled={busy || index <= 1}
                  aria-label="Mover foto a la izquierda"
                  title="Mover a la izquierda"
                >
                  ←
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--tiny"
                  onClick={() => moveImage(index, 1)}
                  disabled={busy || index === 0 || index === images.length - 1}
                  aria-label="Mover foto a la derecha"
                  title="Mover a la derecha"
                >
                  →
                </button>
                <button
                  type="button"
                  className="btn btn--danger btn--tiny"
                  onClick={() => removeImage(image.id, image.isPrimary)}
                  disabled={busy}
                  aria-label="Eliminar foto"
                  title="Eliminar foto"
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="image-uploader__empty">
          <span>Sin fotos</span>
          <small>Sube una o varias imágenes cuadradas o verticales.</small>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFiles}
        multiple
        hidden
      />

      <div className="row-actions">
        <button
          type="button"
          className="btn btn--gold btn--small"
          onClick={() => inputRef.current?.click()}
          disabled={busy || full}
        >
          {images.length ? "Agregar fotos" : "Subir fotos"}
        </button>
      </div>

      <small className="muted">
        Hasta {MAX_IMAGES} fotos por producto. Se convierten a WebP y se optimizan
        automáticamente.
      </small>
    </div>
  );
}
