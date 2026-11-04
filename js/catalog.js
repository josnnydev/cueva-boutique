/* ==========================================================================
   Cueva Boutique · Catálogo remoto
   --------------------------------------------------------------------------
   Actualiza las tarjetas de la tienda con los datos publicados desde el CMS.
   Si la API no está configurada, falla o tarda, la tienda se queda tal cual.
   ========================================================================== */
(function () {
  "use strict";

  var cfg = window.CUEVA_CONFIG || {};
  var cms = Object.assign(
    {
      enabled: true,
      endpoint: "/api/public/catalog",
      timeout: 6000
    },
    cfg.cms || {}
  );

  if (!cms.enabled || !window.fetch) {
    return;
  }

  var grid = document.getElementById("product-grid");
  if (!grid) {
    return;
  }

  var currencySymbol = cfg.currencySymbol || "$";
  var numberFormat = new Intl.NumberFormat(cfg.locale || "es-DO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatMoney(value) {
    var rounded = Math.round(Number(value) * 100) / 100;
    return currencySymbol + numberFormat.format(rounded);
  }

  function imageSource(product) {
    return product.image
      ? product.image.thumb || product.image.src
      : "assets/img/logo-cueva.webp";
  }

  function galleryImages(product) {
    if (Array.isArray(product.images) && product.images.length) {
      return product.images;
    }
    return product.image ? [product.image] : [];
  }

  function gallerySlides(product) {
    return galleryImages(product)
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
          escapeHtml(image.alt || product.name) +
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

  function syncGallery(card, product) {
    if (window.CuevaGallery && typeof window.CuevaGallery.sync === "function") {
      window.CuevaGallery.sync(card, product);
    }
  }

  function updateVersion(site) {
    if (!site) return;

    document.querySelectorAll("[data-site-version]").forEach(function (element) {
      element.textContent = site.version || "";
    });

    document.querySelectorAll("[data-site-updated]").forEach(function (element) {
      var value = String(site.updatedAt || "");
      var parts = value.split("-");
      element.textContent =
        parts.length === 3 ? parts[2] + "/" + parts[1] + "/" + parts[0] : value;
    });
  }

  function updateCard(card, product) {
    card.id = product.anchor;
    card.setAttribute("data-name", product.name);
    card.setAttribute("data-price", String(product.price));
    card.setAttribute("data-category", product.category.slug);
    card.setAttribute("data-base-discount", String(product.baseDiscount || 0));

    if (product.compareAtPrice) {
      card.setAttribute("data-old-price", String(product.compareAtPrice));
    } else {
      card.removeAttribute("data-old-price");
    }

    if (product.offerEligible === false) {
      card.setAttribute("data-offer-eligible", "false");
    } else {
      card.removeAttribute("data-offer-eligible");
    }

    if (product.compareAtPrice && !product.baseDiscount) {
      card.setAttribute("data-permanent-offer", "");
    } else {
      card.removeAttribute("data-permanent-offer");
    }

    if (product.soldOut) {
      card.setAttribute("data-sold-out", "");
      card.classList.add("is-sold-out");
    } else {
      card.removeAttribute("data-sold-out");
      card.classList.remove("is-sold-out");
    }

    var media = card.querySelector(".product-card__media");
    var image = media ? media.querySelector("img") : null;

    if (image && !(window.CuevaGallery && media.querySelector("[data-gallery-slide]"))) {
      image.src = imageSource(product);
      image.alt = (product.image && product.image.alt) || product.name;
      image.width = (product.image && product.image.width) || 480;
      image.height = (product.image && product.image.height) || 480;
    }

    syncGallery(card, product);

    if (media) {
      var badge = media.querySelector(".product-card__badge");
      var badgeText = product.soldOut
        ? "Agotado"
        : product.baseDiscount > 0
          ? "−" + Number(product.baseDiscount) + "%"
          : product.compareAtPrice && !product.baseDiscount
            ? "Oferta"
            : "";

      if (badgeText) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "product-card__badge";
          media.appendChild(badge);
        }
        badge.textContent = badgeText;
        badge.className =
          "product-card__badge" +
          (product.soldOut
            ? " product-card__badge--soldout"
            : badgeText === "Oferta"
              ? " product-card__badge--soft"
              : "");
      } else if (badge) {
        badge.remove();
      }

      var tag = media.querySelector(".product-card__tag");
      if (product.badge) {
        if (!tag) {
          tag = document.createElement("span");
          tag.className = "product-card__tag";
          media.appendChild(tag);
        }
        tag.textContent = product.badge;
      } else if (tag) {
        tag.remove();
      }
    }

    var actions = card.querySelector(".product-card__actions");
    var cartButton = actions ? actions.querySelector(".product-card__cart") : null;
    if (cartButton) {
      if (product.soldOut) {
        cartButton.className = "btn btn--soldout product-card__cart";
        cartButton.removeAttribute("data-add-to-cart");
        cartButton.disabled = true;
        cartButton.setAttribute("aria-label", product.name + " agotado");
        cartButton.innerHTML =
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12l1.2 13H4.8L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>Agotado';
      } else {
        cartButton.className = "btn btn--cart product-card__cart";
        cartButton.setAttribute("data-add-to-cart", "");
        cartButton.disabled = false;
        cartButton.setAttribute("aria-label", "Agregar " + product.name + " al carrito");
        cartButton.innerHTML =
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12l1.2 13H4.8L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>Agregar';
      }
    }

    var meta = card.querySelector(".product-card__meta span");
    if (meta) {
      meta.textContent = product.category.name;
    }

    var title = card.querySelector("h3");
    if (title) {
      title.textContent = product.name;
    }

    var description = card.querySelector(".product-card__desc");
    if (description) {
      description.textContent = product.shortDescription || "";
    }

    var priceNow = card.querySelector("[data-price-now]");
    if (priceNow) {
      priceNow.textContent = formatMoney(product.price);
    }

    var priceOld = card.querySelector("[data-price-old]");
    if (priceOld) {
      if (product.compareAtPrice) {
        priceOld.textContent = formatMoney(product.compareAtPrice);
        priceOld.hidden = false;
      } else {
        priceOld.textContent = "";
        priceOld.hidden = true;
      }
    }

    var addButton = card.querySelector("[data-add-to-cart]");
    if (addButton) {
      addButton.setAttribute("aria-label", "Agregar " + product.name + " al carrito");
    }

    var shareButton = card.querySelector("[data-share-product]");
    if (shareButton) {
      shareButton.setAttribute("aria-label", "Compartir " + product.name);
    }
  }

  function createCard(product) {
    var article = document.createElement("article");
    article.className = "product-card" + (product.soldOut ? " is-sold-out" : "");
    article.id = product.anchor;
    article.setAttribute("data-product-card", "");
    article.setAttribute("data-name", product.name);
    article.setAttribute("data-price", String(product.price));

    if (product.compareAtPrice) {
      article.setAttribute("data-old-price", String(product.compareAtPrice));
    }
    article.setAttribute("data-category", product.category.slug);
    article.setAttribute("data-base-discount", String(product.baseDiscount || 0));

    if (product.offerEligible === false) {
      article.setAttribute("data-offer-eligible", "false");
    }
    if (product.compareAtPrice && !product.baseDiscount) {
      article.setAttribute("data-permanent-offer", "");
    }
    if (product.soldOut) {
      article.setAttribute("data-sold-out", "");
    }

    var badge = "";
    if (product.soldOut) {
      badge =
        '<span class="product-card__badge product-card__badge--soldout">Agotado</span>';
    } else if (product.baseDiscount > 0) {
      badge =
        '<span class="product-card__badge">−' +
        Number(product.baseDiscount) +
        "%</span>";
    } else if (product.compareAtPrice) {
      badge = '<span class="product-card__badge product-card__badge--soft">Oferta</span>';
    }
    if (product.badge) {
      badge += '<span class="product-card__tag">' + escapeHtml(product.badge) + "</span>";
    }

    var oldPrice = product.compareAtPrice
      ? '<span class="price-old" data-price-old>' +
        formatMoney(product.compareAtPrice) +
        "</span>"
      : '<span class="price-old" data-price-old hidden></span>';

    var cartButton = product.soldOut
      ? '<button class="btn btn--soldout product-card__cart" type="button" disabled aria-label="' +
        escapeHtml(product.name) +
        ' agotado"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12l1.2 13H4.8L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>Agotado</button>'
      : '<button class="btn btn--cart product-card__cart" type="button" data-add-to-cart aria-label="Agregar ' +
        escapeHtml(product.name) +
        ' al carrito"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12l1.2 13H4.8L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>Agregar</button>';

    article.innerHTML =
      '<div class="product-card__media" data-gallery>' +
      '<div class="product-card__slides" data-gallery-slides>' +
      gallerySlides(product) +
      "</div>" +
      badge +
      "</div>" +
      '<div class="product-card__body">' +
      '<div class="product-card__meta"><span>' +
      escapeHtml(product.category.name) +
      "</span></div>" +
      "<h3>" +
      escapeHtml(product.name) +
      "</h3>" +
      '<p class="product-card__desc">' +
      escapeHtml(product.shortDescription || "") +
      "</p>" +
      '<div class="product-card__price">' +
      '<span class="price-now" data-price-now>' +
      formatMoney(product.price) +
      "</span>" +
      oldPrice +
      "</div>" +
      '<div class="product-card__actions">' +
      cartButton +
      '<button class="btn btn--share product-card__share" type="button" data-share-product aria-label="Compartir ' +
      escapeHtml(product.name) +
      '"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="M8.4 10.8l7.2-4.1M8.4 13.2l7.2 4.1"/></svg>Compartir</button>' +
      "</div></div>";

    syncGallery(article, product);

    return article;
  }

  function updateFilters(categories) {
    var container = document.querySelector(".filters");
    if (!container || !Array.isArray(categories)) {
      return;
    }

    var flash = container.querySelector(".filter--flash");
    var wanted = {};

    categories.forEach(function (category) {
      wanted[category.slug] = category;
    });

    Array.prototype.slice
      .call(container.querySelectorAll("[data-filter]"))
      .forEach(function (button) {
        var filter = button.getAttribute("data-filter");
        if (!filter || filter === "all" || filter.indexOf("desc-") === 0) {
          return;
        }
        if (!wanted[filter]) {
          button.remove();
        }
      });

    categories.forEach(function (category) {
      var button = Array.prototype.slice
        .call(container.querySelectorAll("[data-filter]"))
        .filter(function (candidate) {
          return candidate.getAttribute("data-filter") === category.slug;
        })[0];

      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "filter";
        button.setAttribute("data-filter", category.slug);
        button.setAttribute("aria-pressed", "false");
      }

      button.textContent = category.name;
      container.insertBefore(button, flash || null);
    });
  }

  function hydrate(data) {
    if (!data || !Array.isArray(data.products) || !data.products.length) {
      return;
    }

    updateVersion(data.site);
    updateFilters(data.categories);

    document.dispatchEvent(
      new CustomEvent("cueva:settings", { detail: data.site })
    );

    if (data.dailyOffers && Object.keys(data.dailyOffers).length) {
      document.dispatchEvent(
        new CustomEvent("cueva:offers", { detail: data.dailyOffers })
      );
    }

    var categoryOrder = new Map();
    (data.categories || []).forEach(function (category, index) {
      categoryOrder.set(category.slug, index);
    });

    var products = data.products.slice().sort(function (a, b) {
      var orderA = categoryOrder.has(a.category.slug) ? categoryOrder.get(a.category.slug) : 99;
      var orderB = categoryOrder.has(b.category.slug) ? categoryOrder.get(b.category.slug) : 99;
      if (orderA !== orderB) return orderA - orderB;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name, "es");
    });

    var existing = new Map();
    grid.querySelectorAll("[data-product-card]").forEach(function (card) {
      existing.set(card.id, card);
    });

    var known = new Set();
    var fragment = document.createDocumentFragment();

    products.forEach(function (product) {
      known.add(product.anchor);
      var card = existing.get(product.anchor);
      if (card) {
        updateCard(card, product);
      } else {
        card = createCard(product);
      }
      fragment.appendChild(card);
    });

    grid.querySelectorAll("[data-product-card]").forEach(function (card) {
      if (!known.has(card.id)) {
        card.remove();
      }
    });

    grid.appendChild(fragment);

    document.dispatchEvent(
      new CustomEvent("cueva:catalog", { detail: { count: products.length } })
    );
  }

  var lastSignature = "";
  var refreshing = false;

  function signature(data) {
    return JSON.stringify({
      site: data.site,
      categories: data.categories,
      products: data.products
    });
  }

  function loadCatalog() {
    if (refreshing) return;
    refreshing = true;

    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = window.setTimeout(function () {
      if (controller) controller.abort();
    }, Number(cms.timeout) || 6000);

    fetch(cms.endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-cache",
      signal: controller ? controller.signal : undefined
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Catálogo no disponible: " + response.status);
        }
        return response.json();
      })
      .then(function (payload) {
        if (!payload || !payload.ok || !payload.data) {
          return;
        }

        var next = signature(payload.data);
        if (next === lastSignature) {
          return;
        }

        hydrate(payload.data);
        lastSignature = next;
      })
      .catch(function () {
        // La tienda estática sigue siendo el respaldo.
      })
      .finally(function () {
        refreshing = false;
        window.clearTimeout(timer);
      });
  }

  loadCatalog();

  // Revalida el catálogo mientras la página está abierta (la API cachea 30 s).
  window.setInterval(function () {
    if (!document.hidden) {
      loadCatalog();
    }
  }, 60000);

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      loadCatalog();
    }
  });
})();
