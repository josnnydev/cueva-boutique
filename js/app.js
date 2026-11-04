/* ==========================================================================
   Cueva Boutique — Interactividad
   ========================================================================== */
(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.add("js");

  var cfg = Object.assign(
    {
      storeName: "Cueva Boutique",
      whatsappNumber: "18293815317",
      generalLink: "",
      instagramHandle: "@cueva_boutique",
      instagramUrl: "https://www.instagram.com/cueva_boutique",
      locale: "es-DO",
      currency: "DOP",
      currencySymbol: "$",
      generalMessage: "¡Hola Cueva Boutique! 👋 Quiero información sobre los productos y las ofertas flash de hoy.",
      offersEndAtMidnight: true
    },
    window.CUEVA_CONFIG || {}
  );

  var whatsappNumber = String(cfg.whatsappNumber || "").replace(/\D/g, "");
  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var numberWhole = new Intl.NumberFormat(cfg.locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  var numberCents = new Intl.NumberFormat(cfg.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  function formatMoney(value) {
    var rounded = Math.round(Number(value) * 100) / 100;
    var isWhole = Math.abs(rounded - Math.round(rounded)) < 0.005;
    return (
      (cfg.currencySymbol || "$") +
      (isWhole ? numberWhole : numberCents).format(rounded)
    );
  }

  function whatsappLink(message) {
    return "https://wa.me/" + whatsappNumber + "?text=" + encodeURIComponent(message);
  }

  /* ----------------------------------------------------------------------
     Versión publicada
     ---------------------------------------------------------------------- */
  document.querySelectorAll("[data-site-version]").forEach(function (element) {
    element.textContent = cfg.version || "";
  });

  document.querySelectorAll("[data-site-updated]").forEach(function (element) {
    if (!cfg.updatedAt) {
      element.textContent = "";
      return;
    }

    var published = new Date(cfg.updatedAt + "T00:00:00");

    if (isNaN(published.getTime())) {
      element.textContent = cfg.updatedAt;
      return;
    }

    element.textContent = new Intl.DateTimeFormat(cfg.locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(published);
  });

  /* ----------------------------------------------------------------------
     Enlaces generales de WhatsApp e Instagram
     ---------------------------------------------------------------------- */
  var generalHref = cfg.generalLink || whatsappLink(cfg.generalMessage);

  function applySiteSettings(site) {
    if (!site) {
      return;
    }

    var nextNumber = String(site.whatsapp || "").replace(/\D/g, "");
    if (nextNumber) {
      whatsappNumber = nextNumber;
    }

    if (site.generalLink) {
      generalHref = site.generalLink;
    } else if (nextNumber) {
      generalHref = whatsappLink(cfg.generalMessage);
    }

    document.querySelectorAll("[data-wa-general]").forEach(function (link) {
      link.href = generalHref;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    });

    document.querySelectorAll("[data-instagram]").forEach(function (link) {
      if (site.instagramUrl) {
        link.href = site.instagramUrl;
      }
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      if (site.instagramHandle && String(link.textContent || "").trim().indexOf("@") === 0) {
        link.textContent = site.instagramHandle;
      }
    });

    // El checkout del carrito usa el número vigente en el próximo render.
    if (typeof renderCart === "function") {
      renderCart();
    }
  }

  window.CuevaStore = { applySettings: applySiteSettings };
  document.addEventListener("cueva:settings", function (event) {
    applySiteSettings(event.detail);
  });

  document.querySelectorAll("[data-wa-general]").forEach(function (link) {
    link.href = generalHref;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  });

  document.querySelectorAll("[data-instagram]").forEach(function (link) {
    link.href = cfg.instagramUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  });

  /* ----------------------------------------------------------------------
     Precios, ofertas diarias rotativas y mensaje de WhatsApp por producto
     ---------------------------------------------------------------------- */
  var productCards = [];

  function refreshProductCards() {
    productCards = Array.prototype.slice.call(
      document.querySelectorAll("[data-product-card]")
    );
  }

  refreshProductCards();

  var dailyOffers = Object.assign(
    {
      enabled: true,
      count: 6,
      step: 0,
      highDiscount: 15,
      highCount: 3,
      lowDiscount: 10,
      startDate: "2026-10-31",
      seed: 484
    },
    cfg.dailyOffers || {}
  );

  // Generador pseudoaleatorio con semilla: el orden es igual para todos.
  function seededRandom(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffleWithSeed(list, seed) {
    var arr = list.slice();
    var random = seededRandom(seed);
    for (var i = arr.length - 1; i > 0; i -= 1) {
      var j = Math.floor(random() * (i + 1));
      var swap = arr[i];
      arr[i] = arr[j];
      arr[j] = swap;
    }
    return arr;
  }

  function parseLocalDate(value) {
    var parts = String(value || "").split("-");
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    var day = Number(parts[2]);
    if (!year || !month || !day) {
      return new Date();
    }
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }

  function dayNumber(date) {
    var start = parseLocalDate(dailyOffers.startDate);
    var today = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
    return Math.max(0, Math.round((today.getTime() - start.getTime()) / 86400000));
  }

  function dayKey(date) {
    return date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate();
  }

  // Elige los productos del día. La ventana avanza 6 posiciones cada día,
  // así que dos días consecutivos nunca comparten productos.
  function picksForDay(date) {
    var eligible = productCards.filter(function (card) {
      return (
        !card.hasAttribute("data-permanent-offer") &&
        card.getAttribute("data-offer-eligible") !== "false"
      );
    });

    if (!dailyOffers.enabled || !eligible.length) {
      return [];
    }

    var permutation = shuffleWithSeed(eligible, Number(dailyOffers.seed) || 1);
    var count = Math.min(Math.max(1, Number(dailyOffers.count) || 6), permutation.length);
    // Avanza al menos count + 1 para que dos días seguidos no compartan productos.
    var step = Math.max(count + 1, Number(dailyOffers.step) || 0);
    var day = dayNumber(date);
    var start = (day * step) % permutation.length;
    var picks = [];

    for (var i = 0; i < count; i += 1) {
      picks.push(permutation[(start + i) % permutation.length]);
    }

    // Rota el orden para que el descuento alto no caiga siempre en los mismos.
    var shift = count ? day % count : 0;
    picks = picks.slice(shift).concat(picks.slice(0, shift));

    var highCount = Math.min(Math.max(0, Number(dailyOffers.highCount) || 0), count);

    return picks.map(function (card, index) {
      return {
        card: card,
        discount: index < highCount ? dailyOffers.highDiscount : dailyOffers.lowDiscount
      };
    });
  }

  function setCardBadge(card, discount) {
    var media = card.querySelector(".product-card__media");
    if (!media) {
      return;
    }

    var badge = media.querySelector(".product-card__badge");

    if (discount > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "product-card__badge";
        media.insertBefore(badge, media.firstChild);
      }
      badge.textContent = "−" + discount + "%";
      badge.hidden = false;
      return;
    }

    // La oferta permanente de CCA Polaris conserva su badge "Oferta".
    if (badge && !card.hasAttribute("data-permanent-offer")) {
      badge.remove();
    }
  }

  function applyCardPricing(card, discount) {
    var basePrice = Number(card.getAttribute("data-price"));
    var manualOldPrice = Number(card.getAttribute("data-old-price"));

    if (!Number.isFinite(basePrice)) {
      return;
    }

    var baseDiscount = Number(card.getAttribute("data-base-discount")) || 0;
    var activeDiscount = Math.max(Number(discount) || 0, baseDiscount);
    var finalPrice =
      activeDiscount > 0
        ? Math.round(basePrice * (1 - activeDiscount / 100) * 100) / 100
        : basePrice;
    var oldPrice =
      activeDiscount > 0
        ? basePrice
        : Number.isFinite(manualOldPrice) && manualOldPrice > 0
        ? manualOldPrice
        : null;

    card.setAttribute("data-discount", String(activeDiscount));

    var priceNow = card.querySelector("[data-price-now]");
    var priceOld = card.querySelector("[data-price-old]");

    if (priceNow) {
      priceNow.textContent = formatMoney(finalPrice);
    }

    if (priceOld && oldPrice) {
      priceOld.textContent = formatMoney(oldPrice);
      priceOld.hidden = false;
    } else if (priceOld) {
      priceOld.hidden = true;
    }

    setCardBadge(card, activeDiscount);
  }

  function updateFlashLists(picks) {
    document.querySelectorAll("[data-flash-products]").forEach(function (el) {
      var discount = Number(el.getAttribute("data-flash-products"));
      var names = picks
        .filter(function (pick) {
          return Number(pick.discount) === discount;
        })
        .map(function (pick) {
          return pick.card.getAttribute("data-name") || "";
        })
        .filter(Boolean);

      el.textContent = names.length ? names.join(" · ") : "Se renovarán pronto";
    });
  }

  var offersDayKey = "";

  function applyDailyOffers() {
    var today = new Date();
    var picks = picksForDay(today);
    var discountsById = {};

    picks.forEach(function (pick) {
      discountsById[pick.card.id] = pick.discount;
    });

    productCards.forEach(function (card) {
      var discount = card.hasAttribute("data-permanent-offer")
        ? 0
        : discountsById[card.id] || 0;
      applyCardPricing(card, discount);
    });

    offersDayKey = dayKey(today);
    updateFlashLists(picks);

    // Si el visitante está viendo una categoría o un descuento, refresca.
    if (typeof currentFilter !== "undefined" && currentFilter && currentFilter !== "all") {
      applyFilter(currentFilter);
    }

    renderCart();
  }

  // La tienda avisa cuando el catálogo remoto cambió las tarjetas.
  document.addEventListener("cueva:catalog", function () {
    refreshProductCards();
    refreshFilterButtons();
    if (
      currentFilter !== "all" &&
      !filterButtons.some(function (button) {
        return button.getAttribute("data-filter") === currentFilter;
      })
    ) {
      currentFilter = "all";
    }
    applyDailyOffers();
  });

  // Los ajustes de ofertas también pueden cambiar desde el panel.
  document.addEventListener("cueva:offers", function (event) {
    if (!event.detail) {
      return;
    }
    dailyOffers = Object.assign({}, dailyOffers, event.detail);
    applyDailyOffers();
  });

  function refreshOffersIfNewDay() {
    if (dayKey(new Date()) !== offersDayKey) {
      applyDailyOffers();
    }
  }

  // Pequeña API para pruebas locales (solo si se activa CUEVA_DEBUG).
  if (window.CUEVA_DEBUG) {
    window.CuevaOffers = {
      picksForDay: picksForDay,
      applyDailyOffers: applyDailyOffers,
      dayNumber: dayNumber
    };
  }

  /* ----------------------------------------------------------------------
     Carrito de compras
     ---------------------------------------------------------------------- */
  var CART_KEY = "cuevaCartV1";
  var cartToggle = document.querySelector("[data-cart-toggle]");
  var cartPanel = document.getElementById("cart-panel");
  var cartBackdrop = document.querySelector(".cart-backdrop");
  var cartItemsEl = document.querySelector("[data-cart-items]");
  var cartEmptyEl = document.querySelector("[data-cart-empty]");
  var cartTotalEl = document.querySelector("[data-cart-total]");
  var cartUnitsEl = document.querySelector("[data-cart-units]");
  var cartSavingsEl = document.querySelector("[data-cart-savings]");
  var cartSavingsRow = document.querySelector("[data-cart-savings-row]");
  var cartCountEls = Array.prototype.slice.call(
    document.querySelectorAll("[data-cart-count]")
  );
  var cartHeadCount = document.querySelector("[data-cart-head-count]");
  var cartWaLink = document.querySelector("[data-cart-wa]");
  var cartClearBtn = document.querySelector("[data-cart-clear]");
  var cartContinue = document.querySelector("[data-cart-continue]");
  var lastCartTrigger = null;
  var cart = loadCart();

  function loadCart() {
    try {
      var stored = JSON.parse(window.localStorage.getItem(CART_KEY) || "{}");
      var clean = {};
      if (stored && typeof stored === "object") {
        Object.keys(stored).forEach(function (id) {
          var quantity = Math.floor(Number(stored[id]));
          if (quantity > 0 && document.getElementById(id)) {
            clean[id] = Math.min(quantity, 99);
          }
        });
      }
      return clean;
    } catch (error) {
      return {};
    }
  }

  function saveCart() {
    try {
      window.localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch (error) {
      // El carrito sigue funcionando en memoria si localStorage no está disponible.
    }
  }

  function cardPricing(card) {
    var base = Number(card.getAttribute("data-price")) || 0;
    var discount = Number(card.getAttribute("data-discount")) || 0;
    var price =
      discount > 0
        ? Math.round(base * (1 - discount / 100) * 100) / 100
        : base;

    return { base: base, discount: discount, price: price };
  }

  function cartEntries() {
    return Object.keys(cart)
      .map(function (id) {
        var card = document.getElementById(id);
        if (!card) {
          return null;
        }

        var quantity = cart[id];
        var pricing = cardPricing(card);
        var image = card.querySelector("img");

        return {
          id: id,
          card: card,
          quantity: quantity,
          name: card.getAttribute("data-name") || "Producto",
          image: image ? image.getAttribute("src") : "",
          base: pricing.base,
          discount: pricing.discount,
          price: pricing.price,
          lineTotal: Math.round(pricing.price * quantity * 100) / 100
        };
      })
      .filter(Boolean);
  }

  function setCartQuantity(id, quantity) {
    var next = Math.max(0, Math.min(99, Math.floor(Number(quantity) || 0)));
    if (next === 0) {
      delete cart[id];
    } else {
      cart[id] = next;
    }
    saveCart();
    renderCart();
  }

  function addToCart(id, trigger) {
    setCartQuantity(id, (cart[id] || 0) + 1);
    openCart(trigger);
  }

  function cartItemElement(entry) {
    var item = document.createElement("li");
    item.className = "cart-item";
    item.setAttribute("data-cart-item", entry.id);

    var media = document.createElement("div");
    media.className = "cart-item__media";
    var image = document.createElement("img");
    image.src = entry.image;
    image.alt = "";
    image.width = 64;
    image.height = 78;
    image.decoding = "sync";
    media.appendChild(image);

    var info = document.createElement("div");
    info.className = "cart-item__info";

    var name = document.createElement("p");
    name.className = "cart-item__name";
    name.textContent = entry.name;

    var price = document.createElement("p");
    price.className = "cart-item__price";
    price.appendChild(document.createTextNode(formatMoney(entry.price)));

    if (entry.discount > 0) {
      var oldPrice = document.createElement("s");
      oldPrice.textContent = formatMoney(entry.base);
      price.appendChild(oldPrice);

      var offer = document.createElement("span");
      offer.className = "cart-item__off";
      offer.textContent = "−" + entry.discount + "%";
      price.appendChild(offer);
    }

    var quantity = document.createElement("div");
    quantity.className = "cart-item__qty";

    var decrease = document.createElement("button");
    decrease.type = "button";
    decrease.setAttribute("data-cart-dec", "");
    decrease.setAttribute("aria-label", "Quitar una unidad de " + entry.name);
    decrease.textContent = "−";

    var amount = document.createElement("span");
    amount.textContent = String(entry.quantity);
    amount.setAttribute("aria-label", "Cantidad: " + entry.quantity);

    var increase = document.createElement("button");
    increase.type = "button";
    increase.setAttribute("data-cart-inc", "");
    increase.setAttribute("aria-label", "Agregar una unidad de " + entry.name);
    increase.textContent = "+";

    quantity.appendChild(decrease);
    quantity.appendChild(amount);
    quantity.appendChild(increase);

    info.appendChild(name);
    info.appendChild(price);
    info.appendChild(quantity);

    var side = document.createElement("div");
    side.className = "cart-item__side";

    var lineTotal = document.createElement("strong");
    lineTotal.textContent = formatMoney(entry.lineTotal);

    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "cart-item__remove";
    remove.setAttribute("data-cart-remove", "");
    remove.setAttribute("aria-label", "Eliminar " + entry.name + " del carrito");
    remove.textContent = "Eliminar";

    side.appendChild(lineTotal);
    side.appendChild(remove);

    item.appendChild(media);
    item.appendChild(info);
    item.appendChild(side);

    return item;
  }

  function buildCartMessage(entries, total, savings) {
    var lines = [
      "¡Hola " + cfg.storeName + "! 👋",
      "",
      "Quiero hacer este pedido:"
    ];

    entries.forEach(function (entry) {
      var line =
        "• " + entry.quantity + " × " + entry.name + " — " +
        formatMoney(entry.price) + " c/u";

      if (entry.discount > 0) {
        line += " (" + entry.discount + "% OFF)";
      }

      line += " = " + formatMoney(entry.lineTotal);
      lines.push(line);
    });

    lines.push("", "Total: " + formatMoney(total));

    if (savings > 0.005) {
      lines.push("Ahorro con ofertas: " + formatMoney(savings));
    }

    lines.push(
      "",
      "Pago: contra entrega o transferencia (BHD, Banreservas o Popular).",
      "¿Me confirman disponibilidad y entrega?"
    );

    return lines.join("\n");
  }

  function renderCart() {
    if (!cartPanel || !cartItemsEl) {
      return;
    }

    var entries = cartEntries();
    var total = 0;
    var units = 0;
    var savings = 0;

    cartItemsEl.textContent = "";

    entries.forEach(function (entry) {
      total += entry.lineTotal;
      units += entry.quantity;
      savings += (entry.base - entry.price) * entry.quantity;
      cartItemsEl.appendChild(cartItemElement(entry));
    });

    total = Math.round(total * 100) / 100;
    savings = Math.round(savings * 100) / 100;

    var isEmpty = entries.length === 0;
    cartEmptyEl.hidden = !isEmpty;
    cartItemsEl.hidden = isEmpty;

    cartCountEls.forEach(function (el) {
      el.textContent = String(units);
      el.hidden = units === 0;
    });

    if (cartHeadCount) {
      cartHeadCount.textContent = String(units);
    }

    if (cartToggle) {
      cartToggle.setAttribute(
        "aria-label",
        units > 0
          ? "Abrir carrito, " + units + (units === 1 ? " producto" : " productos")
          : "Abrir carrito de compras"
      );
    }

    if (cartTotalEl) {
      cartTotalEl.textContent = formatMoney(total);
    }

    if (cartUnitsEl) {
      cartUnitsEl.textContent = units + (units === 1 ? " unidad" : " unidades");
    }

    if (cartSavingsEl) {
      cartSavingsEl.textContent = "−" + formatMoney(savings);
    }

    if (cartSavingsRow) {
      cartSavingsRow.hidden = savings <= 0.005;
    }

    if (cartClearBtn) {
      cartClearBtn.hidden = isEmpty;
    }

    if (cartWaLink) {
      if (isEmpty) {
        cartWaLink.href = "#";
        cartWaLink.setAttribute("aria-disabled", "true");
        cartWaLink.classList.add("is-disabled");
      } else {
        cartWaLink.href = whatsappLink(buildCartMessage(entries, total, savings));
        cartWaLink.target = "_blank";
        cartWaLink.rel = "noopener noreferrer";
        cartWaLink.removeAttribute("aria-disabled");
        cartWaLink.classList.remove("is-disabled");
      }
    }
  }

  function openCart(trigger) {
    if (!cartPanel) {
      return;
    }

    lastCartTrigger = trigger || document.activeElement;
    if (isMenuOpen()) {
      closeMenu(false);
    }

    cartPanel.classList.add("is-open");
    cartPanel.setAttribute("aria-hidden", "false");
    document.body.classList.add("cart-open");

    if (cartToggle) {
      cartToggle.setAttribute("aria-expanded", "true");
    }

    if (cartBackdrop) {
      cartBackdrop.hidden = false;
      // Fuerza el frame para que la transición de opacidad se vea.
      void cartBackdrop.offsetWidth;
      cartBackdrop.classList.add("is-visible");
    }

    window.setTimeout(function () {
      var closeButton = cartPanel.querySelector(".cart-panel__close");
      if (closeButton && cartPanel.classList.contains("is-open")) {
        closeButton.focus({ preventScroll: true });
      }
    }, 90);
  }

  function closeCart() {
    if (!cartPanel) {
      return;
    }

    cartPanel.classList.remove("is-open");
    cartPanel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("cart-open");

    if (cartToggle) {
      cartToggle.setAttribute("aria-expanded", "false");
    }

    if (cartBackdrop) {
      cartBackdrop.classList.remove("is-visible");
      window.setTimeout(function () {
        if (!cartPanel.classList.contains("is-open")) {
          cartBackdrop.hidden = true;
        }
      }, 320);
    }

    if (
      lastCartTrigger &&
      typeof lastCartTrigger.focus === "function" &&
      document.contains(lastCartTrigger)
    ) {
      lastCartTrigger.focus({ preventScroll: true });
    }
  }

  if (cartToggle) {
    cartToggle.addEventListener("click", function () {
      if (cartPanel.classList.contains("is-open")) {
        closeCart();
      } else {
        openCart(cartToggle);
      }
    });
  }

  document.querySelectorAll("[data-cart-close]").forEach(function (button) {
    button.addEventListener("click", closeCart);
  });

  if (cartContinue) {
    cartContinue.addEventListener("click", function () {
      closeCart();
    });
  }

  if (cartClearBtn) {
    cartClearBtn.addEventListener("click", function () {
      cart = {};
      saveCart();
      renderCart();
    });
  }

  if (cartWaLink) {
    cartWaLink.addEventListener("click", function (event) {
      if (!cartEntries().length) {
        event.preventDefault();
      }
    });
  }

  if (cartItemsEl) {
    cartItemsEl.addEventListener("click", function (event) {
      var button = event.target.closest(
        "[data-cart-dec], [data-cart-inc], [data-cart-remove]"
      );
      if (!button) {
        return;
      }

      var item = button.closest("[data-cart-item]");
      if (!item) {
        return;
      }

      var id = item.getAttribute("data-cart-item");
      var entry = cartEntries().filter(function (candidate) {
        return candidate.id === id;
      })[0];

      if (!entry) {
        return;
      }

      if (button.hasAttribute("data-cart-inc")) {
        setCartQuantity(id, entry.quantity + 1);
      } else if (button.hasAttribute("data-cart-dec")) {
        setCartQuantity(id, entry.quantity - 1);
      } else {
        setCartQuantity(id, 0);
      }
    });
  }

  // Delegación: también funciona con tarjetas nuevas del catálogo remoto.
  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    var addButton = target.closest("[data-add-to-cart]");
    if (addButton) {
      var addCard = addButton.closest("[data-product-card]");
      if (addCard && !addCard.hasAttribute("data-sold-out")) {
        addToCart(addCard.id, addButton);
      }
      return;
    }

    var shareButton = target.closest("[data-share-product]");
    if (shareButton) {
      var shareCard = shareButton.closest("[data-product-card]");
      if (shareCard) {
        openShare(shareCard, shareButton);
      }
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && cartPanel && cartPanel.classList.contains("is-open")) {
      closeCart();
    }
  });

  // Si un producto pasa a agotado, deja de estar en el carrito.
  document.addEventListener("cueva:catalog", function () {
    var changed = false;
    Object.keys(cart).forEach(function (id) {
      var card = document.getElementById(id);
      if (card && card.hasAttribute("data-sold-out")) {
        delete cart[id];
        changed = true;
      }
    });

    if (changed) {
      saveCart();
      renderCart();
    }
  });

  if (cartPanel) {
    cartPanel.addEventListener("keydown", function (event) {
      if (event.key !== "Tab") {
        return;
      }

      var focusable = Array.prototype.slice.call(
        cartPanel.querySelectorAll(
          'a[href]:not([aria-disabled="true"]), button:not([hidden]):not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );

      if (!focusable.length) {
        return;
      }

      var first = focusable[0];
      var last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  window.addEventListener("storage", function (event) {
    if (event.key === CART_KEY) {
      cart = loadCart();
      renderCart();
    }
  });

  renderCart();


  /* ----------------------------------------------------------------------
     Compartir productos
     ---------------------------------------------------------------------- */
  var shareDialog = document.getElementById("share-dialog");
  var shareBackdrop = document.querySelector(".share-backdrop");
  var shareImage = document.querySelector("[data-share-image]");
  var shareName = document.querySelector("[data-share-name]");
  var shareDesc = document.querySelector("[data-share-desc]");
  var sharePrice = document.querySelector("[data-share-price]");
  var shareStatus = document.querySelector("[data-share-status]");
  var shareUrlInput = document.querySelector("[data-share-url]");
  var shareWa = document.querySelector("[data-share-wa]");
  var shareGmail = document.querySelector("[data-share-gmail]");
  var shareTelegram = document.querySelector("[data-share-telegram]");
  var shareFacebook = document.querySelector("[data-share-facebook]");
  var shareX = document.querySelector("[data-share-x]");
  var shareNative = document.querySelector("[data-share-native]");
  var shareCopy = document.querySelector("[data-share-copy]");
  var shareCopyLabel = document.querySelector("[data-share-copy-label]");
  var shareProduct = null;
  var shareFile = null;
  var lastShareTrigger = null;

  function absoluteUrl(path) {
    try {
      return new URL(path, window.location.href).href;
    } catch (error) {
      return path;
    }
  }

  function productShareData(card) {
    var description = card.querySelector(".product-card__desc");
    var price = card.querySelector("[data-price-now]");
    var image = card.querySelector("img");
    var base = new URL(window.location.href);
    base.search = "";
    base.hash = card.id;

    return {
      id: card.id,
      name: (card.getAttribute("data-name") || "Producto").trim(),
      description: description
        ? description.textContent.replace(/\s+/g, " ").trim()
        : "",
      price: price ? price.textContent.trim() : "",
      image: image ? absoluteUrl(image.getAttribute("src")) : "",
      url: base.href
    };
  }

  function shareMessage(data) {
    var lines = [
      "Mira este producto de " + cfg.storeName + ":",
      "",
      data.name
    ];

    if (data.description) {
      lines.push(data.description);
    }

    lines.push("", "Precio: " + data.price, "Producto: " + data.url);

    if (data.image) {
      lines.push("Foto: " + data.image);
    }

    return lines.join("\n");
  }

  function shareShortMessage(data) {
    return (
      data.name +
      (data.price ? " — " + data.price : "") +
      (data.description ? "\n" + data.description : "")
    );
  }

  function shareNetworkLink(network, data) {
    var message = shareMessage(data);

    switch (network) {
      case "whatsapp":
        return "https://wa.me/?text=" + encodeURIComponent(message);
      case "gmail":
        return (
          "https://mail.google.com/mail/?view=cm&fs=1&su=" +
          encodeURIComponent("Producto de " + cfg.storeName + ": " + data.name) +
          "&body=" +
          encodeURIComponent(message)
        );
      case "telegram":
        return (
          "https://t.me/share/url?url=" +
          encodeURIComponent(data.url) +
          "&text=" +
          encodeURIComponent(shareShortMessage(data))
        );
      case "facebook":
        return (
          "https://www.facebook.com/sharer/sharer.php?u=" +
          encodeURIComponent(data.url)
        );
      case "x":
        return (
          "https://twitter.com/intent/tweet?text=" +
          encodeURIComponent(shareShortMessage(data)) +
          "&url=" +
          encodeURIComponent(data.url)
        );
      default:
        return data.url;
    }
  }

  function prepareShareFile(data) {
    shareFile = null;

    if (!data.image || typeof window.fetch !== "function") {
      return;
    }

    window
      .fetch(data.image)
      .then(function (response) {
        if (!response.ok) {
          throw new Error("No se pudo cargar la imagen");
        }
        return response.blob();
      })
      .then(function (blob) {
        if (!blob || !/^image\//.test(blob.type) || shareProduct !== data) {
          return;
        }
        var extension = (blob.type.split("/")[1] || "webp").split("+")[0];
        try {
          shareFile = new File([blob], data.id + "." + extension, {
            type: blob.type
          });
        } catch (error) {
          shareFile = null;
        }
      })
      .catch(function () {
        shareFile = null;
      });
  }

  function setShareLink(link, network) {
    if (!link || !shareProduct) {
      return;
    }
    link.href = shareNetworkLink(network, shareProduct);
  }

  function openShare(card, trigger) {
    if (!shareDialog || !card) {
      return;
    }

    lastShareTrigger = trigger || document.activeElement;

    if (cartPanel && cartPanel.classList.contains("is-open")) {
      closeCart();
    }

    shareProduct = productShareData(card);
    shareImage.src = shareProduct.image;
    shareImage.alt = shareProduct.name;
    shareName.textContent = shareProduct.name;
    shareDesc.textContent = shareProduct.description;
    sharePrice.textContent = shareProduct.price;
    shareStatus.textContent = "";
    shareCopyLabel.textContent = "Copiar enlace";
    shareCopy.classList.remove("is-copied");

    if (shareUrlInput) {
      shareUrlInput.value = shareProduct.url;
    }

    setShareLink(shareWa, "whatsapp");
    setShareLink(shareGmail, "gmail");
    setShareLink(shareTelegram, "telegram");
    setShareLink(shareFacebook, "facebook");
    setShareLink(shareX, "x");

    if (shareNative) {
      shareNative.hidden = typeof navigator.share !== "function";
    }

    prepareShareFile(shareProduct);

    shareDialog.classList.add("is-open");
    shareDialog.setAttribute("aria-hidden", "false");
    document.body.classList.add("share-open");

    if (shareBackdrop) {
      shareBackdrop.hidden = false;
      void shareBackdrop.offsetWidth;
      shareBackdrop.classList.add("is-visible");
    }

    window.setTimeout(function () {
      var closeButton = shareDialog.querySelector(".share-dialog__close");
      var focusInside = shareDialog.contains(document.activeElement);

      if (
        closeButton &&
        shareDialog.classList.contains("is-open") &&
        !focusInside
      ) {
        closeButton.focus({ preventScroll: true });
      }
    }, 90);
  }

  function closeShare() {
    if (!shareDialog) {
      return;
    }

    shareDialog.classList.remove("is-open");
    shareDialog.setAttribute("aria-hidden", "true");
    document.body.classList.remove("share-open");

    if (shareBackdrop) {
      shareBackdrop.classList.remove("is-visible");
      window.setTimeout(function () {
        if (!shareDialog.classList.contains("is-open")) {
          shareBackdrop.hidden = true;
        }
      }, 280);
    }

    if (
      lastShareTrigger &&
      typeof lastShareTrigger.focus === "function" &&
      document.contains(lastShareTrigger)
    ) {
      lastShareTrigger.focus({ preventScroll: true });
    }
  }

  function selectShareUrl() {
    if (!shareUrlInput) {
      return;
    }
    shareUrlInput.focus({ preventScroll: true });
    shareUrlInput.select();
  }

  function copyShareLink() {
    if (!shareProduct) {
      return;
    }

    var value = shareProduct.url;
    var fallback = function () {
      var area = document.createElement("textarea");
      area.value = value;
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

    var done = function () {
      shareStatus.textContent = "Enlace del producto copiado.";
      shareCopyLabel.textContent = "¡Copiado!";
      shareCopy.classList.add("is-copied");
      window.setTimeout(function () {
        if (!shareDialog.classList.contains("is-open")) {
          return;
        }
        shareCopyLabel.textContent = "Copiar enlace";
        shareCopy.classList.remove("is-copied");
      }, 2200);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(done).catch(function () {
        if (fallback()) {
          done();
        } else {
          shareStatus.textContent = "Copia el enlace manualmente:";
          selectShareUrl();
        }
      });
    } else if (fallback()) {
      done();
    } else {
      shareStatus.textContent = "Copia el enlace manualmente:";
      selectShareUrl();
    }
  }

  document.querySelectorAll("[data-share-close]").forEach(function (element) {
    element.addEventListener("click", closeShare);
  });

  if (shareCopy) {
    shareCopy.addEventListener("click", copyShareLink);
  }

  if (shareUrlInput) {
    shareUrlInput.addEventListener("focus", selectShareUrl);
    shareUrlInput.addEventListener("click", selectShareUrl);
  }

  if (shareNative) {
    shareNative.addEventListener("click", function () {
      if (!shareProduct || typeof navigator.share !== "function") {
        return;
      }

      var payload = {
        title: shareProduct.name + " — " + cfg.storeName,
        text: shareMessage(shareProduct),
        url: shareProduct.url
      };

      try {
        if (
          shareFile &&
          typeof navigator.canShare === "function" &&
          navigator.canShare({ files: [shareFile] })
        ) {
          payload.files = [shareFile];
          delete payload.url;
        }

        var result = navigator.share(payload);
        if (result && typeof result.then === "function") {
          result.then(closeShare).catch(function (error) {
            if (error && error.name === "AbortError") {
              return;
            }
            shareStatus.textContent =
              "No se pudo abrir el menú del sistema. Usa una de las opciones.";
          });
        } else {
          closeShare();
        }
      } catch (error) {
        shareStatus.textContent =
          "No se pudo abrir el menú del sistema. Usa una de las opciones.";
      }
    });
  }

  shareDialog.querySelectorAll("a.share-target").forEach(function (link) {
    link.addEventListener("click", function () {
      window.setTimeout(function () {
        closeShare();
      }, 180);
    });
  });

  document.addEventListener("keydown", function (event) {
    if (
      event.key === "Escape" &&
      shareDialog &&
      shareDialog.classList.contains("is-open")
    ) {
      closeShare();
    }
  });

  if (shareDialog) {
    shareDialog.addEventListener("keydown", function (event) {
      if (event.key !== "Tab") {
        return;
      }

      var focusable = Array.prototype.slice.call(
        shareDialog.querySelectorAll(
          'a[href]:not([aria-disabled="true"]), button:not([hidden]):not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );

      if (!focusable.length) {
        return;
      }

      var first = focusable[0];
      var last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  /* ----------------------------------------------------------------------
     Contador de ofertas flash hasta medianoche
     ---------------------------------------------------------------------- */
  var countdowns = Array.prototype.slice.call(
    document.querySelectorAll("[data-countdown]")
  );

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function updateCountdown() {
    if (!countdowns.length) {
      return;
    }

    var now = new Date();

    // Al cruzar la medianoche, cambia la rotación en el acto.
    if (offersDayKey && dayKey(now) !== offersDayKey) {
      applyDailyOffers();
    }

    var end = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0, 0, 0, 0
    );
    var remaining = Math.max(0, end.getTime() - now.getTime());

    var hours = Math.floor(remaining / 3600000);
    var minutes = Math.floor(remaining / 60000) % 60;
    var seconds = Math.floor(remaining / 1000) % 60;
    var label = pad(hours) + ":" + pad(minutes) + ":" + pad(seconds);

    countdowns.forEach(function (el) {
      el.textContent = label;
    });
  }

  if (cfg.offersEndAtMidnight) {
    updateCountdown();
    window.setInterval(updateCountdown, 1000);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) {
        updateCountdown();
      }
    });
  }

  /* ----------------------------------------------------------------------
     Filtros del catálogo
     ---------------------------------------------------------------------- */
  var filterButtons = [];

  function refreshFilterButtons() {
    filterButtons = Array.prototype.slice.call(
      document.querySelectorAll("[data-filter]")
    );
  }

  refreshFilterButtons();
  var emptyState = document.querySelector("[data-empty]");
  var currentFilter = "all";

  function matchesFilter(card, filter) {
    if (filter === "all") {
      return true;
    }

    if (filter.indexOf("desc-") === 0) {
      return card.getAttribute("data-discount") === filter.replace("desc-", "");
    }

    return card.getAttribute("data-category") === filter;
  }

  function applyFilter(filter, options) {
    var settings = options || {};
    var visibleCount = 0;
    currentFilter = filter;

    filterButtons.forEach(function (button) {
      var isActive = button.getAttribute("data-filter") === filter;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    productCards.forEach(function (card) {
      var show = matchesFilter(card, filter);
      card.hidden = !show;
      card.classList.remove("is-filtering");

      if (show) {
        // Reinicia la animación de entrada de la tarjeta.
        void card.offsetWidth;
        card.classList.add("is-filtering");
        visibleCount += 1;
      }
    });

    if (emptyState) {
      emptyState.hidden = visibleCount !== 0;
    }

    if (settings.scroll) {
      var catalog = document.getElementById("tienda");
      if (catalog) {
        catalog.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "start"
        });
      }
    }

    if (settings.focus) {
      var activeButton = filterButtons.find(function (button) {
        return button.getAttribute("data-filter") === filter;
      });
      if (activeButton) {
        activeButton.focus({ preventScroll: true });
      }
    }
  }

  // Delegación: también cubre las categorías nuevas del catálogo remoto.
  var filtersEl = document.querySelector(".filters");
  if (filtersEl) {
    filtersEl.addEventListener("click", function (event) {
      var button = event.target.closest("[data-filter]");
      if (button && filtersEl.contains(button)) {
        applyFilter(button.getAttribute("data-filter"));
      }
    });
  }

  document.querySelectorAll("[data-filter-link]").forEach(function (link) {
    link.addEventListener("click", function (event) {
      event.preventDefault();
      applyFilter(link.getAttribute("data-filter-link"), {
        scroll: true,
        focus: event.detail === 0
      });
    });
  });

  document.querySelectorAll("[data-clear-filter]").forEach(function (button) {
    button.addEventListener("click", function () {
      applyFilter("all");
    });
  });

  // Activa las ofertas del día y las renueva cuando cambia la fecha.
  applyDailyOffers();
  window.setInterval(refreshOffersIfNewDay, 60000);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      refreshOffersIfNewDay();
    }
  });

  /* ----------------------------------------------------------------------
     Menú móvil
     ---------------------------------------------------------------------- */
  var header = document.getElementById("site-header");
  var menuToggle = document.querySelector("[data-menu-toggle]");
  var siteNav = document.getElementById("primary-nav");
  var navBackdrop = document.querySelector("[data-nav-close]");
  var lastFocusedElement = null;

  function isMenuOpen() {
    return siteNav && siteNav.classList.contains("is-open");
  }

  function positionMobileMenu() {
    if (!siteNav || !header) {
      return;
    }

    if (window.innerWidth > 980) {
      siteNav.style.removeProperty("top");
      siteNav.style.removeProperty("height");
      return;
    }

    // El encabezado usa backdrop-filter, así que el panel fijo se posiciona
    // respecto al encabezado: top es su alto y el alto restante se mide
    // hasta el borde inferior de la ventana.
    var headerRect = header.getBoundingClientRect();
    var menuTop = Math.max(0, Math.round(headerRect.height));
    var headerBottom = Math.max(0, Math.round(headerRect.bottom));
    siteNav.style.top = menuTop + "px";
    siteNav.style.height = Math.max(0, window.innerHeight - headerBottom) + "px";
  }

  function openMenu(focusFirstLink) {
    if (!siteNav || !menuToggle) {
      return;
    }

    lastFocusedElement = document.activeElement;
    siteNav.classList.add("is-open");
    positionMobileMenu();
    menuToggle.setAttribute("aria-expanded", "true");
    menuToggle.setAttribute("aria-label", "Cerrar menú de navegación");
    document.body.classList.add("menu-open");

    if (navBackdrop) {
      navBackdrop.hidden = false;
    }

    var firstLink = siteNav.querySelector("a");
    if (focusFirstLink && firstLink) {
      window.setTimeout(function () {
        if (isMenuOpen()) {
          firstLink.focus({ preventScroll: true });
        }
      }, 120);
    }
  }

  function closeMenu(restoreFocus) {
    if (!siteNav || !menuToggle) {
      return;
    }

    var wasOpen = isMenuOpen();
    siteNav.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Abrir menú de navegación");
    document.body.classList.remove("menu-open");

    if (navBackdrop) {
      navBackdrop.hidden = true;
    }

    if (
      wasOpen &&
      restoreFocus !== false &&
      lastFocusedElement &&
      typeof lastFocusedElement.focus === "function"
    ) {
      lastFocusedElement.focus({ preventScroll: true });
    }
  }

  if (menuToggle && siteNav) {
    menuToggle.addEventListener("click", function (event) {
      if (isMenuOpen()) {
        closeMenu();
      } else {
        // Solo movemos el foco al primer enlace cuando se abre con teclado.
        openMenu(event.detail === 0);
      }
    });

    siteNav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        closeMenu(false);
      });
    });

    if (navBackdrop) {
      navBackdrop.addEventListener("click", function () {
        closeMenu();
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && isMenuOpen()) {
        closeMenu();
      }
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 980) {
        if (isMenuOpen()) {
          closeMenu(false);
        }
        positionMobileMenu();
      } else if (isMenuOpen()) {
        positionMobileMenu();
      }
    });
  }

  /* ----------------------------------------------------------------------
     Sombra del encabezado al hacer scroll
     ---------------------------------------------------------------------- */
  function updateHeader() {
    if (header) {
      header.classList.toggle("is-scrolled", window.scrollY > 6);
    }
  }

  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });

  /* ----------------------------------------------------------------------
     Animaciones de entrada
     ---------------------------------------------------------------------- */
  var revealElements = Array.prototype.slice.call(
    document.querySelectorAll("[data-reveal], .section-head")
  );

  if (
    !prefersReducedMotion &&
    "IntersectionObserver" in window &&
    revealElements.length
  ) {
    var revealObserver = new IntersectionObserver(
      function (entries, observer) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );

    revealElements.forEach(function (element, index) {
      element.classList.add("reveal");
      element.style.setProperty(
        "--reveal-delay",
        (index % 4) * 0.07 + "s"
      );
      revealObserver.observe(element);
    });
  }

  /* ----------------------------------------------------------------------
     Año del pie de página
     ---------------------------------------------------------------------- */
  var year = document.querySelector("[data-year]");
  if (year) {
    year.textContent = String(new Date().getFullYear());
  }
})();
