const CART_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12l1.2 13H4.8L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>';

const SHARE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="M8.4 10.8l7.2-4.1M8.4 13.2l7.2 4.1"/></svg>';

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatMoney(value, symbol = "$") {
  const rounded = Math.round(Number(value) * 100) / 100;
  const isWhole = Math.abs(rounded - Math.round(rounded)) < 0.005;
  const formatted = new Intl.NumberFormat("es-DO", {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: isWhole ? 0 : 2
  }).format(rounded);
  return `${symbol}${formatted}`;
}

export function renderProductCard(product, index = 0) {
  const isFirstProduct = index === 0;
  const anchor = product.anchor || `product-${product.slug}`;
  const oldPrice =
    product.compareAtPrice !== null && product.compareAtPrice !== undefined
      ? Number(product.compareAtPrice)
      : null;
  const permanentOffer = Boolean(oldPrice && !product.baseDiscount);
  const image = product.imageSrc || "assets/img/logo-cueva.webp";
  const thumb = product.imageThumb || image;
  const alt = product.imageAlt || product.name;
  const width = product.imageWidth || 480;
  const height = product.imageHeight || 480;

  const gallery =
    Array.isArray(product.images) && product.images.length
      ? product.images
      : [{ src: image, thumb, alt, width, height }];
  const multiple = gallery.length > 1;

  const slides = gallery
    .map((item, slideIndex) => {
      const full = item.src || image;
      const preview = item.thumb || full;
      const firstVisible = isFirstProduct && slideIndex === 0;
      const responsive =
        preview !== full
          ? ` srcset="${escapeHtml(preview)} 480w, ${escapeHtml(full)} 1200w" sizes="(max-width: 640px) 46vw, (max-width: 1024px) 30vw, 300px"`
          : "";

      return `<img class="product-card__slide${slideIndex === 0 ? " is-active" : ""}" data-gallery-slide data-full="${escapeHtml(full)}" src="${escapeHtml(preview)}"${responsive} alt="${escapeHtml(item.alt || alt)}" width="${Number(item.width || width)}" height="${Number(item.height || height)}" loading="${firstVisible ? "eager" : "lazy"}" decoding="async"${firstVisible ? ' fetchpriority="high"' : ""}${slideIndex === 0 ? "" : " hidden"}>`;
    })
    .join("\n                ");

  const controls = `<div class="product-card__slides" data-gallery-slides>
                ${slides}
              </div>
              <button type="button" class="product-card__gallery-nav product-card__gallery-nav--prev" data-gallery-prev aria-label="Foto anterior"${multiple ? "" : " hidden"}>‹</button>
              <button type="button" class="product-card__gallery-nav product-card__gallery-nav--next" data-gallery-next aria-label="Foto siguiente"${multiple ? "" : " hidden"}>›</button>
              <span class="product-card__gallery-count" data-gallery-count${multiple ? "" : " hidden"}>1 / ${gallery.length}</span>
              <button type="button" class="product-card__gallery-open" data-gallery-open aria-label="Ver foto de ${escapeHtml(product.name)} ampliada"></button>`;

  const attributes = [
    `class="product-card${product.soldOut ? " is-sold-out" : ""}"`,
    `id="${escapeHtml(anchor)}"`,
    "data-product-card",
    `data-name="${escapeHtml(product.name)}"`,
    `data-price="${Number(product.price)}"`,
    `data-discount="0"`,
    ...(oldPrice ? [`data-old-price="${oldPrice}"`] : []),
    `data-category="${escapeHtml(product.categorySlug)}"`,
    ...(permanentOffer ? ["data-permanent-offer"] : []),
    `data-base-discount="${Number(product.baseDiscount || 0)}"`,
    ...(product.offerEligible === false ? ['data-offer-eligible="false"'] : []),
    ...(product.soldOut ? ["data-sold-out"] : [])
  ].join(" ");

  const badges = [];
  if (product.soldOut) {
    badges.push(
      '<span class="product-card__badge product-card__badge--soldout">Agotado</span>'
    );
  } else if (Number(product.baseDiscount) > 0) {
    badges.push(
      `<span class="product-card__badge">−${Number(product.baseDiscount)}%</span>`
    );
  } else if (permanentOffer) {
    badges.push(
      '<span class="product-card__badge product-card__badge--soft">Oferta</span>'
    );
  }
  if (product.badge) {
    badges.push(
      `<span class="product-card__tag">${escapeHtml(product.badge)}</span>`
    );
  }

  return `          <article ${attributes}>
            <div class="product-card__media" data-gallery${multiple ? "" : ' data-gallery-single'}>
              ${controls}
              ${badges.join("\n              ")}
            </div>
            <div class="product-card__body">
              <div class="product-card__meta">
                <span>${escapeHtml(product.categoryName)}</span>
              </div>
              <h3>${escapeHtml(product.name)}</h3>
              <p class="product-card__desc">${escapeHtml(product.shortDescription || "")}</p>
              <div class="product-card__price">
                <span class="price-now" data-price-now>${formatMoney(product.price, product.currencySymbol || "$")}</span>
                <span class="price-old" data-price-old${oldPrice ? "" : " hidden"}>${oldPrice ? formatMoney(oldPrice, product.currencySymbol || "$") : ""}</span>
              </div>
              <div class="product-card__actions">
                ${
                  product.soldOut
                    ? `<button class="btn btn--soldout product-card__cart" type="button" disabled aria-label="${escapeHtml(product.name)} agotado">${CART_ICON}Agotado</button>`
                    : `<button class="btn btn--cart product-card__cart" type="button" data-add-to-cart aria-label="Agregar ${escapeHtml(product.name)} al carrito">${CART_ICON}Agregar</button>`
                }
                <button class="btn btn--share product-card__share" type="button" data-share-product aria-label="Compartir ${escapeHtml(product.name)}">
                  ${SHARE_ICON}
                  Compartir
                </button>
              </div>
            </div>
          </article>`;
}

export function renderProductGrid(products) {
  return products.map((product, index) => renderProductCard(product, index)).join("\n\n");
}
