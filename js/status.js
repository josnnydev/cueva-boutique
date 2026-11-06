/* ==========================================================================
   Cueva Boutique · Imagen para el estado de WhatsApp
   --------------------------------------------------------------------------
   Genera una imagen vertical (1080 × 1920) con la foto del producto, su
   nombre, una descripción corta y el precio. Se muestra dentro del diálogo
   de compartir y se puede descargar o enviar con el menú del sistema.
   ========================================================================== */
(function () {
  "use strict";

  var cfg = window.CUEVA_CONFIG || {};
  var WIDTH = 1080;
  var HEIGHT = 1920;

  var state = {
    token: 0,
    card: null,
    blob: null,
    file: null,
    fileName: "",
    caption: "",
    previewUrl: ""
  };

  var els = {
    preview: document.querySelector("[data-state-preview]"),
    loading: document.querySelector("[data-state-loading]"),
    download: document.querySelector("[data-state-download]"),
    share: document.querySelector("[data-state-share]"),
    copy: document.querySelector("[data-state-copy]"),
    message: document.querySelector("[data-state-message]")
  };

  function textOf(element) {
    return element ? element.textContent.replace(/\s+/g, " ").trim() : "";
  }

  function absoluteUrl(value) {
    try {
      return new URL(value, window.location.href).href;
    } catch (error) {
      return value;
    }
  }

  function formatPhone(value) {
    var digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 11 && digits.charAt(0) === "1") {
      return (
        "+1 (" +
        digits.slice(1, 4) +
        ") " +
        digits.slice(4, 7) +
        "-" +
        digits.slice(7)
      );
    }
    return "+" + digits;
  }

  function readProduct(card) {
    var slide =
      card.querySelector("[data-gallery-slide].is-active") ||
      card.querySelector("[data-gallery-slide]:not([hidden])") ||
      card.querySelector("[data-gallery-slide]") ||
      card.querySelector("img");
    var priceEl = card.querySelector("[data-price-now]");
    var oldEl = card.querySelector("[data-price-old]");
    var descEl = card.querySelector(".product-card__desc");
    var badgeEl = card.querySelector(".product-card__badge");
    var tagEl = card.querySelector(".product-card__tag");

    var link = new URL(window.location.href);
    link.search = "";
    if (card.id) {
      link.hash = card.id;
    } else {
      link.hash = "";
    }

    return {
      id: card.id || "",
      name: (card.getAttribute("data-name") || "Producto").trim(),
      description: textOf(descEl),
      price: textOf(priceEl),
      oldPrice:
        oldEl && !oldEl.hidden && oldEl.getAttribute("hidden") === null
          ? textOf(oldEl)
          : "",
      badge: textOf(badgeEl),
      tag: textOf(tagEl),
      soldOut: card.hasAttribute("data-sold-out"),
      image: slide
        ? absoluteUrl(slide.getAttribute("data-full") || slide.getAttribute("src"))
        : "",
      url: link.href
    };
  }

  function badgeLabel(product) {
    if (product.soldOut) return "AGOTADO";
    if (product.badge) {
      if (/^[−-]/.test(product.badge) || /%/.test(product.badge)) {
        return "OFERTA " + product.badge.replace(/^[−-]\s*/, "−");
      }
      return product.badge.toUpperCase();
    }
    if (product.tag) return product.tag.toUpperCase();
    return "";
  }

  function captionFor(product) {
    var lines = [product.name];
    if (product.description) {
      lines.push(product.description);
    }
    lines.push("");
    lines.push(
      "Precio: " +
        (product.price || "consultar") +
        (product.oldPrice ? " · antes " + product.oldPrice : "")
    );
    if (product.soldOut) {
      lines.push("Agotado por ahora · pregunta por reposición");
    }
    if (product.url) {
      lines.push(product.url);
    }
    return lines.join("\n");
  }

  function fileNameFor(product) {
    var base = String(product.id || product.name || "producto")
      .replace(/^product-/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return "estado-cueva-" + (base || "producto") + ".jpg";
  }

  function waitForFonts() {
    if (!document.fonts || !document.fonts.ready) {
      return Promise.resolve();
    }
    return Promise.race([
      document.fonts.ready.catch(function () {}),
      new Promise(function (resolve) {
        window.setTimeout(resolve, 1200);
      })
    ]);
  }

  function imageFromBlob(blob) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var image = new Image();
      image.onload = function () {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("No se pudo leer la imagen."));
      };
      image.src = url;
    });
  }

  function loadImage(src) {
    if (!src || typeof window.fetch !== "function") {
      return Promise.resolve(null);
    }

    return window
      .fetch(src, { mode: "cors", cache: "force-cache" })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("No se pudo cargar la foto.");
        }
        return response.blob();
      })
      .then(function (blob) {
        if (window.createImageBitmap) {
          return window
            .createImageBitmap(blob)
            .catch(function () {
              return imageFromBlob(blob);
            });
        }
        return imageFromBlob(blob);
      })
      .catch(function () {
        // Si la foto no se puede leer, la imagen se genera con un monograma.
        return null;
      });
  }

  function setSpacing(ctx, value) {
    try {
      ctx.letterSpacing = value + "px";
    } catch (error) {
      // Navegadores antiguos: se dibuja sin espaciado adicional.
    }
  }

  function roundedPath(ctx, x, y, width, height, radius) {
    var r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, width, height, r);
      return;
    }
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawCover(ctx, image, x, y, width, height, radius) {
    ctx.save();
    roundedPath(ctx, x, y, width, height, radius);
    ctx.clip();

    if (!image) {
      var placeholder = ctx.createLinearGradient(x, y, x, y + height);
      placeholder.addColorStop(0, "#181824");
      placeholder.addColorStop(1, "#0d0d14");
      ctx.fillStyle = placeholder;
      ctx.fillRect(x, y, width, height);

      ctx.fillStyle = "rgba(212, 175, 55, 0.9)";
      ctx.font = '600 150px "Cormorant Garamond", Georgia, serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("CB", x + width / 2, y + height / 2 - 10);

      ctx.fillStyle = "rgba(246, 241, 231, 0.5)";
      ctx.font = '400 28px "Jost", "Helvetica Neue", Arial, sans-serif';
      setSpacing(ctx, 4);
      ctx.fillText("CUEVA BOUTIQUE", x + width / 2, y + height / 2 + 105);
      setSpacing(ctx, 0);
      ctx.restore();
      return;
    }

    var imageWidth = image.width || width;
    var imageHeight = image.height || height;
    var scale = Math.max(width / imageWidth, height / imageHeight);
    var drawWidth = imageWidth * scale;
    var drawHeight = imageHeight * scale;
    ctx.drawImage(
      image,
      x + (width - drawWidth) / 2,
      y + (height - drawHeight) / 2,
      drawWidth,
      drawHeight
    );
    ctx.restore();
  }

  function wrapLines(ctx, value, maxWidth, maxLines) {
    var words = String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean);
    var lines = [];
    var current = "";

    for (var index = 0; index < words.length; index += 1) {
      var word = words[index];
      var candidate = current ? current + " " + word : word;

      if (ctx.measureText(candidate).width <= maxWidth || !current) {
        current = candidate;
        continue;
      }

      lines.push(current);
      current = word;

      if (lines.length === maxLines - 1) {
        break;
      }
    }

    if (current) {
      lines.push(current);
    }

    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
    }

    var consumed = lines.join(" ").split(" ").length;
    if (consumed < words.length && lines.length) {
      var last = lines[lines.length - 1];
      var suffix = "…";
      while (
        last.length > 1 &&
        ctx.measureText(last + suffix).width > maxWidth
      ) {
        last = last.slice(0, -1).trim();
      }
      lines[lines.length - 1] = last + suffix;
    }

    return lines;
  }

  function fitWrapped(ctx, value, maxWidth, maxLines, options) {
    var size = options.max;
    var lines = [];

    do {
      ctx.font = options.weight + " " + size + "px " + options.family;
      lines = wrapLines(ctx, value, maxWidth, maxLines);
      if (lines.join(" ").indexOf("…") === -1) {
        break;
      }
      size -= options.step;
    } while (size > options.min);

    return {
      lines: lines,
      size: size,
      lineHeight: Math.round(size * options.lineHeight)
    };
  }

  function drawStatus(ctx, product, image) {
    ctx.fillStyle = "#08080c";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    var background = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    background.addColorStop(0, "#0d0d15");
    background.addColorStop(0.55, "#101018");
    background.addColorStop(1, "#08080c");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    var glow = ctx.createRadialGradient(540, 330, 0, 540, 330, 780);
    glow.addColorStop(0, "rgba(212, 175, 55, 0.18)");
    glow.addColorStop(1, "rgba(212, 175, 55, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WIDTH, 1200);

    ctx.strokeStyle = "rgba(212, 175, 55, 0.3)";
    ctx.lineWidth = 2;
    ctx.strokeRect(44, 44, WIDTH - 88, HEIGHT - 88);

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#e8cf8a";
    ctx.font = '600 34px "Jost", "Helvetica Neue", Arial, sans-serif';
    setSpacing(ctx, 12);
    ctx.fillText(String(cfg.storeName || "Cueva Boutique").toUpperCase(), WIDTH / 2, 126);
    setSpacing(ctx, 0);

    ctx.fillStyle = "rgba(246, 241, 231, 0.55)";
    ctx.font = '400 21px "Jost", "Helvetica Neue", Arial, sans-serif';
    setSpacing(ctx, 6);
    ctx.fillText("COLECCIÓN EXCLUSIVA", WIDTH / 2, 168);
    setSpacing(ctx, 0);

    drawCover(ctx, image, 90, 220, 900, 930, 38);

    ctx.strokeStyle = "rgba(212, 175, 55, 0.28)";
    ctx.lineWidth = 2;
    roundedPath(ctx, 90, 220, 900, 930, 38);
    ctx.stroke();

    var label = badgeLabel(product);
    if (label) {
      ctx.font = '600 26px "Jost", "Helvetica Neue", Arial, sans-serif';
      var labelWidth = ctx.measureText(label).width;
      var badgeWidth = labelWidth + 56;
      var badgeX = 120;
      var badgeY = 268;
      roundedPath(ctx, badgeX, badgeY, badgeWidth, 58, 29);
      ctx.fillStyle = product.soldOut ? "#7f1d1d" : "#d4af37";
      ctx.fill();
      ctx.fillStyle = product.soldOut ? "#ffffff" : "#0a0a10";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, badgeX + badgeWidth / 2, badgeY + 30);
      ctx.textBaseline = "alphabetic";
    }

    ctx.textAlign = "left";
    ctx.fillStyle = "#f6f1e7";
    var title = fitWrapped(ctx, product.name, 900, 2, {
      max: 68,
      min: 50,
      step: 4,
      weight: "600",
      family: '"Cormorant Garamond", Georgia, "Times New Roman", serif',
      lineHeight: 1.15
    });
    ctx.font =
      '600 ' +
      title.size +
      'px "Cormorant Garamond", Georgia, "Times New Roman", serif';
    var cursorY = 1256;
    title.lines.forEach(function (line) {
      ctx.fillText(line, 90, cursorY);
      cursorY += title.lineHeight;
    });

    if (product.description) {
      ctx.fillStyle = "rgba(246, 241, 231, 0.72)";
      var description = fitWrapped(ctx, product.description, 900, 3, {
        max: 33,
        min: 28,
        step: 2,
        weight: "400",
        family: '"Jost", "Helvetica Neue", Arial, sans-serif',
        lineHeight: 1.5
      });
      ctx.font =
        '400 ' + description.size + 'px "Jost", "Helvetica Neue", Arial, sans-serif';
      var descriptionY = cursorY + 20;
      description.lines.forEach(function (line) {
        ctx.fillText(line, 90, descriptionY);
        descriptionY += description.lineHeight;
      });
      var contentBottom = descriptionY - description.lineHeight;
    } else {
      var contentBottom = cursorY - title.lineHeight;
    }

    var priceLabelY = Math.min(Math.max(contentBottom + 96, 1512), 1598);
    var priceBaseline = priceLabelY + 102;

    ctx.fillStyle = "rgba(246, 241, 231, 0.52)";
    ctx.font = '500 22px "Jost", "Helvetica Neue", Arial, sans-serif';
    setSpacing(ctx, 4);
    ctx.fillText("PRECIO", 90, priceLabelY);
    setSpacing(ctx, 0);

    ctx.fillStyle = "#e8cf8a";
    ctx.font = '600 94px "Jost", "Helvetica Neue", Arial, sans-serif';
    var priceText = product.price || "Consultar";
    ctx.fillText(priceText, 90, priceBaseline);
    var priceWidth = ctx.measureText(priceText).width;

    if (product.oldPrice) {
      var oldX = 90 + priceWidth + 32;
      ctx.font = '400 38px "Jost", "Helvetica Neue", Arial, sans-serif';
      var oldWidth = ctx.measureText(product.oldPrice).width;
      ctx.strokeStyle = "rgba(246, 241, 231, 0.45)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(oldX, priceBaseline - 16);
      ctx.lineTo(oldX + oldWidth, priceBaseline - 16);
      ctx.stroke();
      ctx.fillStyle = "rgba(246, 241, 231, 0.5)";
      ctx.fillText(product.oldPrice, oldX, priceBaseline - 6);
    }

    ctx.strokeStyle = "rgba(212, 175, 55, 0.25)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(90, 1770);
    ctx.lineTo(990, 1770);
    ctx.stroke();

    var phone = formatPhone(cfg.whatsappNumber);
    ctx.fillStyle = "rgba(246, 241, 231, 0.55)";
    ctx.font = '500 21px "Jost", "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = "left";
    setSpacing(ctx, 3);
    ctx.fillText("PEDIDOS POR WHATSAPP", 90, 1814);
    setSpacing(ctx, 0);

    ctx.textAlign = "right";
    ctx.fillStyle = "#e8cf8a";
    ctx.font = '500 26px "Jost", "Helvetica Neue", Arial, sans-serif';
    ctx.fillText(phone || String(cfg.storeName || "Cueva Boutique"), 990, 1814);

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(246, 241, 231, 0.42)";
    ctx.font = '400 21px "Jost", "Helvetica Neue", Arial, sans-serif';
    ctx.fillText(window.location.host || "", 540, 1856);
  }

  function buildImage(product) {
    var canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    return waitForFonts()
      .then(function () {
        return loadImage(product.image);
      })
      .then(function (image) {
        var ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("El navegador no pudo preparar la imagen.");
        }
        drawStatus(ctx, product, image);

        return new Promise(function (resolve, reject) {
          if (typeof canvas.toBlob !== "function") {
            reject(new Error("El navegador no pudo exportar la imagen."));
            return;
          }
          canvas.toBlob(
            function (blob) {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error("El navegador no pudo exportar la imagen."));
              }
            },
            "image/jpeg",
            0.92
          );
        });
      });
  }

  function setMessage(value) {
    if (els.message) {
      els.message.textContent = value || "";
    }
  }

  function setBusy(busy) {
    if (els.loading) {
      els.loading.hidden = !busy;
    }
    if (els.download) {
      els.download.disabled = busy || !state.blob;
    }
    if (els.copy) {
      els.copy.disabled = busy || !state.blob;
      els.copy.classList.remove("is-copied");
      els.copy.textContent = "Copiar texto";
    }
    if (els.share) {
      els.share.disabled = busy || !state.file;
    }
  }

  function clearPreview() {
    if (state.previewUrl) {
      URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = "";
    }
    if (els.preview) {
      els.preview.hidden = true;
      els.preview.removeAttribute("src");
    }
  }

  function canShareFile(file) {
    if (
      !file ||
      typeof navigator.share !== "function" ||
      typeof navigator.canShare !== "function"
    ) {
      return false;
    }
    try {
      return navigator.canShare({ files: [file] });
    } catch (error) {
      return false;
    }
  }

  function prepareActions() {
    var canShare = canShareFile(state.file);
    if (els.share) {
      els.share.hidden = !canShare;
    }
    if (els.download) {
      els.download.classList.toggle("btn--cart", !canShare);
      els.download.classList.toggle("btn--share", canShare);
    }
    if (els.share) {
      els.share.classList.toggle("btn--cart", canShare);
      els.share.classList.toggle("btn--share", !canShare);
    }
    return canShare;
  }

  function load(card) {
    if (!card) {
      return;
    }

    state.token += 1;
    var token = state.token;
    var product = readProduct(card);

    state.card = card;
    state.blob = null;
    state.file = null;
    state.fileName = fileNameFor(product);
    state.caption = captionFor(product);
    setMessage("");
    clearPreview();
    setBusy(true);

    if (els.share) {
      els.share.hidden = true;
    }

    buildImage(product)
      .then(function (blob) {
        if (token !== state.token) {
          return;
        }

        state.blob = blob;
        state.previewUrl = URL.createObjectURL(blob);

        if (els.preview) {
          els.preview.src = state.previewUrl;
          els.preview.alt = "Imagen para el estado de " + product.name;
          els.preview.hidden = false;
        }
        if (els.loading) {
          els.loading.hidden = true;
        }

        try {
          state.file = new File([blob], state.fileName, { type: "image/jpeg" });
        } catch (error) {
          state.file = null;
        }

        setBusy(false);
        var canShare = prepareActions();
        setMessage(
          canShare
            ? "Lista. Puedes compartirla o descargarla."
            : "Imagen lista. Descárgala para publicarla en tu estado."
        );
      })
      .catch(function () {
        if (token !== state.token) {
          return;
        }
        setBusy(false);
        clearPreview();
        setMessage(
          "No se pudo preparar la imagen. Cierra y vuelve a abrir Compartir para intentarlo de nuevo."
        );
      });
  }

  function reset() {
    state.token += 1;
    state.card = null;
    state.blob = null;
    state.file = null;
    state.fileName = "";
    state.caption = "";
    clearPreview();
    setMessage("");
    setBusy(true);
    if (els.share) {
      els.share.hidden = true;
    }
  }

  function download() {
    if (!state.blob) {
      return;
    }

    if (!state.previewUrl) {
      state.previewUrl = URL.createObjectURL(state.blob);
    }

    var link = document.createElement("a");
    link.href = state.previewUrl;
    link.download = state.fileName || "estado-cueva.jpg";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setMessage(
      "Imagen descargada. Abre WhatsApp → Estados → Mi estado y elige la foto."
    );
  }

  function shareImage() {
    if (!state.file || typeof navigator.share !== "function") {
      return;
    }

    var payload = {
      files: [state.file],
      title: state.card
        ? (state.card.getAttribute("data-name") || "Producto") +
          " — " +
          (cfg.storeName || "Cueva Boutique")
        : "Producto — Cueva Boutique",
      text: state.caption
    };

    var attempt = function (data) {
      return navigator.share(data);
    };

    try {
      var result = attempt(payload);
      if (result && typeof result.then === "function") {
        result
          .then(function () {
            setMessage("Imagen compartida.");
          })
          .catch(function (error) {
            if (error && error.name === "AbortError") {
              return;
            }
            // Algunos navegadores no aceptan texto junto con archivos.
            if (payload.text) {
              try {
                var retry = attempt({ files: payload.files });
                if (retry && typeof retry.then === "function") {
                  retry
                    .then(function () {
                      setMessage("Imagen compartida.");
                    })
                    .catch(function (retryError) {
                      if (retryError && retryError.name === "AbortError") {
                        return;
                      }
                      setMessage(
                        "No se pudo compartir. Descarga la imagen y publícala en tu estado."
                      );
                    });
                  return;
                }
              } catch (retryError) {
                // Continúa con el mensaje de error.
              }
            }
            setMessage(
              "No se pudo compartir. Descarga la imagen y publícala en tu estado."
            );
          });
      } else {
        setMessage("Imagen compartida.");
      }
    } catch (error) {
      setMessage(
        "No se pudo compartir. Descarga la imagen y publícala en tu estado."
      );
    }
  }

  function copyText() {
    if (!state.caption) {
      return;
    }

    var done = function () {
      setMessage("Texto copiado.");
      if (els.copy) {
        els.copy.textContent = "¡Copiado!";
        els.copy.classList.add("is-copied");
      }
    };

    var fallback = function () {
      var area = document.createElement("textarea");
      area.value = state.caption;
      area.setAttribute("readonly", "");
      area.style.cssText = "position:fixed;top:-1000px;left:-1000px;opacity:0";
      document.body.appendChild(area);
      area.select();
      var copied = false;
      try {
        copied = document.execCommand("copy");
      } catch (error) {
        copied = false;
      }
      document.body.removeChild(area);
      return copied;
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(state.caption)
        .then(done)
        .catch(function () {
          if (fallback()) {
            done();
          } else {
            setMessage("Copia el texto manualmente desde la descripción.");
          }
        });
    } else if (fallback()) {
      done();
    } else {
      setMessage("Copia el texto manualmente desde la descripción.");
    }
  }

  if (els.download) {
    els.download.addEventListener("click", download);
  }
  if (els.share) {
    els.share.addEventListener("click", shareImage);
  }
  if (els.copy) {
    els.copy.addEventListener("click", copyText);
  }

  window.CuevaStatus = {
    load: load,
    reset: reset
  };
})();
