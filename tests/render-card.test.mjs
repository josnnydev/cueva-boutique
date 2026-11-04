import test from "node:test";
import assert from "node:assert/strict";
import { formatMoney, renderProductCard } from "../scripts/render-card.mjs";

const base = {
  anchor: "product-kz-zs10-pro-x",
  slug: "kz-zs10-pro-x",
  name: "KZ ZS10 Pro X",
  shortDescription: "Híbrido de 1 driver dinámico + 4 balanced armatures.",
  price: 2250,
  compareAtPrice: null,
  baseDiscount: 0,
  badge: "Favorito",
  categorySlug: "audifonos",
  categoryName: "Audífonos",
  offerEligible: true,
  imageSrc: "assets/img/productos/kz-zs10-pro-x.webp",
  imageThumb: "assets/img/productos/kz-zs10-pro-x.webp",
  imageAlt: "Audífonos KZ ZS10 Pro X",
  imageWidth: 268,
  imageHeight: 480
};

test("renderProductCard conserva el contrato de js/app.js", () => {
  const html = renderProductCard(base);

  for (const attribute of [
    "data-product-card",
    'data-name="KZ ZS10 Pro X"',
    'data-price="2250"',
    'data-discount="0"',
    'data-category="audifonos"',
    "data-add-to-cart",
    "data-share-product",
    'id="product-kz-zs10-pro-x"',
    'data-price-now',
    'data-price-old'
  ]) {
    assert.ok(html.includes(attribute), `Falta ${attribute}`);
  }

  assert.ok(html.includes("$2,250"), "El precio debe mostrarse formateado.");
  assert.ok(html.includes("product-card__tag"), "Debe conservar la etiqueta.");
});

test("una oferta permanente marca el producto y oculta el descuento diario", () => {
  const html = renderProductCard({
    ...base,
    compareAtPrice: 1550,
    offerEligible: false
  });

  assert.ok(html.includes("data-permanent-offer"));
  assert.ok(html.includes('data-offer-eligible="false"'));
  assert.ok(html.includes('data-old-price="1550"'));
});

test("un descuento base muestra el badge de porcentaje", () => {
  const html = renderProductCard({ ...base, baseDiscount: 15 });
  assert.ok(html.includes("−15%"));
  assert.ok(html.includes('data-base-discount="15"'));
});

test("escapeHtml evita inyección en nombres y descripciones", () => {
  const html = renderProductCard({
    ...base,
    name: 'Producto <script>alert("x")</script>',
    shortDescription: "A & B"
  });

  assert.ok(!html.includes("<script>alert"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("A &amp; B"));
});

test("formatMoney usa el símbolo y separadores locales", () => {
  assert.equal(formatMoney(2250), "$2,250");
  assert.equal(formatMoney(1250.5), "$1,250.50");
});

test("la galería incluye todas las fotos con la principal primero", () => {
  const html = renderProductCard({
    ...base,
    images: [
      { src: "assets/img/productos/a.webp", thumb: "assets/img/productos/a-thumb.webp", alt: "A", width: 480, height: 480 },
      { src: "assets/img/productos/b.webp", thumb: "assets/img/productos/b-thumb.webp", alt: "B", width: 480, height: 480 },
      { src: "assets/img/productos/c.webp", thumb: "assets/img/productos/c-thumb.webp", alt: "C", width: 480, height: 480 }
    ]
  });

  assert.equal((html.match(/data-gallery-slide\s/g) || []).length, 3);
  assert.ok(html.includes("data-gallery-prev"));
  assert.ok(html.includes("data-gallery-next"));
  assert.ok(html.includes(">1 / 3</span>"));
  assert.equal((html.match(/data-gallery-open/g) || []).length, 1);
});

test("un producto agotado se muestra con cartel y sin botón de compra", () => {
  const html = renderProductCard({ ...base, soldOut: true });

  assert.ok(html.includes("data-sold-out"));
  assert.ok(html.includes("is-sold-out"));
  assert.ok(html.includes("product-card__badge--soldout"));
  assert.ok(html.includes(">Agotado</button>"));
  assert.ok(!html.includes("data-add-to-cart"));
  assert.ok(html.includes("data-share-product"));
});
