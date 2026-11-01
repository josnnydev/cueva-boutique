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

export function renderProductCard(product) {
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

  const attributes = [
    `class="product-card"`,
    `id="${escapeHtml(anchor)}"`,
    "data-product-card",
    `data-name="${escapeHtml(product.name)}"`,
    `data-price="${Number(product.price)}"`,
    `data-discount="0"`,
    ...(oldPrice ? [`data-old-price="${oldPrice}"`] : []),
    `data-category="${escapeHtml(product.categorySlug)}"`,
    ...(permanentOffer ? ["data-permanent-offer"] : []),
    `data-base-discount="${Number(product.baseDiscount || 0)}"`,
    ...(product.offerEligible === false ? ['data-offer-eligible="false"'] : [])
  ].join(" ");

  const badges = [];
  if (Number(product.baseDiscount) > 0) {
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
            <div class="product-card__media">
              <img src="${escapeHtml(thumb)}" alt="${escapeHtml(alt)}" width="${Number(width)}" height="${Number(height)}" loading="lazy" decoding="async">
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
                <button class="btn btn--cart product-card__cart" type="button" data-add-to-cart aria-label="Agregar ${escapeHtml(product.name)} al carrito">
                  ${CART_ICON}
                  Agregar
                </button>
                <button class="btn btn--share product-card__share" type="button" data-share-product aria-label="Compartir ${escapeHtml(product.name)}">
                  ${SHARE_ICON}
                  Compartir
                </button>
              </div>
            </div>
          </article>`;
}

export function renderProductGrid(products) {
  return products.map(renderProductCard).join("\n\n");
}
