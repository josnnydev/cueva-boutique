/* ==========================================================================
   Cueva Boutique · Galería de producto
   --------------------------------------------------------------------------
   Carrusel en las tarjetas y visor ampliado. Funciona con el HTML estático y
   con las tarjetas que rehidrata js/catalog.js desde la API.
   ========================================================================== */
(function () {
  "use strict";

  var lightbox = null;
  var lightboxState = { items: [], index: 0, trigger: null };
  var touchStartX = 0;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function slidesMarkup(images, name) {
    return images
      .map(function (image, index) {
        var full = image.src || "";
        var preview = image.thumb || full;
        return (
          '<img class="product-card__slide' +
          (index === 0 ? " is-active" : "") +
          '" data-gallery-slide data-full="' +
          escapeHtml(full) +
          '" src="' +
          escapeHtml(preview) +
          '" alt="' +
          escapeHtml(image.alt || name) +
          '" width="' +
          Number(image.width || 480) +
          '" height="' +
          Number(image.height || 480) +
          '" loading="lazy" decoding="async"' +
          (index === 0 ? "" : " hidden") +
          ">"
        );
      })
      .join("");
  }

  function createButton(className, attribute, label, text) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.setAttribute(attribute, "");
    button.setAttribute("aria-label", label);
    button.textContent = text;
    return button;
  }

  function ensureControls(media, multiple) {
    var host = media.querySelector("[data-gallery-slides]");
    if (!host) {
      host = document.createElement("div");
      host.className = "product-card__slides";
      host.setAttribute("data-gallery-slides", "");
      media.insertBefore(host, media.firstChild);
    }

    if (!media.querySelector("[data-gallery-prev]")) {
      media.appendChild(
        createButton(
          "product-card__gallery-nav product-card__gallery-nav--prev",
          "data-gallery-prev",
          "Foto anterior",
          "\u2039"
        )
      );
    }
    if (!media.querySelector("[data-gallery-next]")) {
      media.appendChild(
        createButton(
          "product-card__gallery-nav product-card__gallery-nav--next",
          "data-gallery-next",
          "Foto siguiente",
          "\u203a"
        )
      );
    }
    if (!media.querySelector("[data-gallery-count]")) {
      var counter = document.createElement("span");
      counter.className = "product-card__gallery-count";
      counter.setAttribute("data-gallery-count", "");
      media.appendChild(counter);
    }
    if (!media.querySelector("[data-gallery-open]")) {
      media.appendChild(
        createButton(
          "product-card__gallery-open",
          "data-gallery-open",
          "Ver foto ampliada",
          ""
        )
      );
    }

    var navs = media.querySelectorAll("[data-gallery-prev], [data-gallery-next]");
    Array.prototype.forEach.call(navs, function (button) {
      button.hidden = !multiple;
    });
    var count = media.querySelector("[data-gallery-count]");
    if (count) count.hidden = !multiple;
    media.toggleAttribute("data-gallery-single", !multiple);
  }

  function setIndex(media, index) {
    var slides = media.querySelectorAll("[data-gallery-slide]");
    if (!slides.length) return 0;

    var next = ((index % slides.length) + slides.length) % slides.length;
    Array.prototype.forEach.call(slides, function (slide, position) {
      var active = position === next;
      slide.hidden = !active;
      slide.classList.toggle("is-active", active);
    });

    var counter = media.querySelector("[data-gallery-count]");
    if (counter) counter.textContent = next + 1 + " / " + slides.length;

    media.setAttribute("data-gallery-index", String(next));
    return next;
  }

  function currentIndex(media) {
    return Number(media.getAttribute("data-gallery-index") || 0) || 0;
  }

  function step(media, delta) {
    var slides = media.querySelectorAll("[data-gallery-slide]");
    if (slides.length < 2) return;
    setIndex(media, currentIndex(media) + delta);
  }

  function galleryItems(media) {
    return Array.prototype.map
      .call(media.querySelectorAll("[data-gallery-slide]"), function (slide) {
        return {
          src: slide.getAttribute("data-full") || slide.getAttribute("src"),
          alt: slide.getAttribute("alt") || ""
        };
      })
      .filter(function (item) {
        return Boolean(item.src);
      });
  }

  function mountLightbox() {
    if (lightbox) return lightbox;

    var element = document.createElement("div");
    element.className = "gallery-lightbox";
    element.id = "gallery-lightbox";
    element.hidden = true;
    element.setAttribute("role", "dialog");
    element.setAttribute("aria-modal", "true");
    element.setAttribute("aria-label", "Foto ampliada del producto");
    element.innerHTML =
      '<div class="gallery-lightbox__backdrop" data-lightbox-close></div>' +
      '<figure class="gallery-lightbox__figure">' +
      '<img data-lightbox-image alt="">' +
      '<figcaption class="gallery-lightbox__caption">' +
      '<span data-lightbox-name></span>' +
      '<span data-lightbox-count></span>' +
      "</figcaption>" +
      "</figure>" +
      '<button type="button" class="gallery-lightbox__close" data-lightbox-close aria-label="Cerrar foto ampliada">\u00d7</button>' +
      '<button type="button" class="gallery-lightbox__nav gallery-lightbox__nav--prev" data-lightbox-prev aria-label="Foto anterior">\u2039</button>' +
      '<button type="button" class="gallery-lightbox__nav gallery-lightbox__nav--next" data-lightbox-next aria-label="Foto siguiente">\u203a</button>';

    document.body.appendChild(element);

    lightbox = {
      element: element,
      image: element.querySelector("[data-lightbox-image]"),
      name: element.querySelector("[data-lightbox-name]"),
      count: element.querySelector("[data-lightbox-count]"),
      prev: element.querySelector("[data-lightbox-prev]"),
      next: element.querySelector("[data-lightbox-next]")
    };

    return lightbox;
  }

  function showLightbox(index) {
    if (!lightbox) return;
    var total = lightboxState.items.length;
    if (!total) return;

    lightboxState.index = ((index % total) + total) % total;
    var item = lightboxState.items[lightboxState.index];

    lightbox.image.src = item.src;
    lightbox.image.alt = item.alt;
    lightbox.name.textContent = item.alt;
    lightbox.count.textContent = lightboxState.index + 1 + " / " + total;
    lightbox.prev.hidden = total < 2;
    lightbox.next.hidden = total < 2;

    var neighbouring = [
      lightboxState.items[(lightboxState.index + total - 1) % total],
      lightboxState.items[(lightboxState.index + 1) % total]
    ];
    neighbouring.forEach(function (candidate) {
      if (!candidate || candidate === item) return;
      var preload = new Image();
      preload.src = candidate.src;
    });
  }

  function openLightbox(media, trigger) {
    var items = galleryItems(media);
    if (!items.length) return;

    mountLightbox();
    lightboxState.items = items;
    lightboxState.trigger = trigger || null;
    showLightbox(currentIndex(media));

    lightbox.element.hidden = false;
    document.body.classList.add("has-lightbox");
    if (lightbox.element.querySelector("[data-lightbox-close]")) {
      lightbox.element.querySelector("[data-lightbox-close]").focus();
    }
  }

  function closeLightbox() {
    if (!lightbox || lightbox.element.hidden) return;
    lightbox.element.hidden = true;
    document.body.classList.remove("has-lightbox");
    if (lightboxState.trigger && typeof lightboxState.trigger.focus === "function") {
      lightboxState.trigger.focus();
    }
  }

  function isOpen() {
    return Boolean(lightbox && !lightbox.element.hidden);
  }

  function sync(card, product) {
    if (!card || !product) return;
    var media = card.querySelector(".product-card__media");
    if (!media) return;

    var images =
      Array.isArray(product.images) && product.images.length
        ? product.images
        : product.image
          ? [product.image]
          : [];

    if (!images.length) return;

    var host = media.querySelector("[data-gallery-slides]");
    if (!host) {
      host = document.createElement("div");
      host.className = "product-card__slides";
      host.setAttribute("data-gallery-slides", "");
      media.insertBefore(host, media.firstChild);
    }

    var previousIndex = currentIndex(media);
    host.innerHTML = slidesMarkup(images, product.name || "");
    ensureControls(media, images.length > 1);
    setIndex(media, Math.min(previousIndex, images.length - 1));
  }

  function init(root) {
    Array.prototype.forEach.call(
      (root || document).querySelectorAll("[data-gallery]"),
      function (media) {
        var count = media.querySelectorAll("[data-gallery-slide]").length;
        ensureControls(media, count > 1);
        setIndex(media, 0);
      }
    );
  }

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!target || typeof target.closest !== "function") return;

    if (target.closest("[data-lightbox-close]")) {
      event.preventDefault();
      closeLightbox();
      return;
    }

    if (target.closest("[data-lightbox-prev]")) {
      event.preventDefault();
      showLightbox(lightboxState.index - 1);
      return;
    }

    if (target.closest("[data-lightbox-next]")) {
      event.preventDefault();
      showLightbox(lightboxState.index + 1);
      return;
    }

    var prev = target.closest("[data-gallery-prev]");
    if (prev) {
      event.preventDefault();
      var prevMedia = prev.closest("[data-gallery]");
      if (prevMedia) step(prevMedia, -1);
      return;
    }

    var next = target.closest("[data-gallery-next]");
    if (next) {
      event.preventDefault();
      var nextMedia = next.closest("[data-gallery]");
      if (nextMedia) step(nextMedia, 1);
      return;
    }

    var open = target.closest("[data-gallery-open]");
    if (open) {
      event.preventDefault();
      var openMedia = open.closest("[data-gallery]");
      if (openMedia) openLightbox(openMedia, open);
    }
  });

  document.addEventListener("keydown", function (event) {
    if (!isOpen()) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeLightbox();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      showLightbox(lightboxState.index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      showLightbox(lightboxState.index + 1);
    } else if (event.key === "Tab") {
      var focusable = Array.prototype.slice.call(
        lightbox.element.querySelectorAll("button:not([hidden])")
      );
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  document.addEventListener(
    "touchstart",
    function (event) {
      if (!isOpen() || !event.touches.length) return;
      touchStartX = event.touches[0].clientX;
    },
    { passive: true }
  );

  document.addEventListener(
    "touchend",
    function (event) {
      if (!isOpen() || !event.changedTouches.length) return;
      var delta = event.changedTouches[0].clientX - touchStartX;
      if (Math.abs(delta) < 40) return;
      showLightbox(lightboxState.index + (delta < 0 ? 1 : -1));
    },
    { passive: true }
  );

  window.CuevaGallery = {
    sync: sync,
    init: init,
    open: openLightbox,
    close: closeLightbox
  };

  init(document);

  document.addEventListener("cueva:catalog", function () {
    init(document);
  });
})();
