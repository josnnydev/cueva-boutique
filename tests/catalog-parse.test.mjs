import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCatalog } from "../scripts/seed-catalog.mjs";

const root = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

const SAMPLE = `
<div class="product-grid" id="product-grid">
  <article class="product-card" id="product-kz-zs10-pro-x" data-product-card data-name="KZ ZS10 Pro X" data-price="2250" data-discount="0" data-category="audifonos">
    <div class="product-card__media">
      <img src="assets/img/productos/kz-zs10-pro-x.webp" alt="Audífonos KZ" width="268" height="480">
      <span class="product-card__tag">Favorito</span>
    </div>
    <div class="product-card__body">
      <h3>KZ ZS10 Pro X</h3>
      <p class="product-card__desc">Híbrido de 1 driver.</p>
    </div>
  </article>
  <article class="product-card" id="product-cca-polaris" data-product-card data-name="CCA Polaris" data-price="1250" data-old-price="1550" data-category="audifonos" data-permanent-offer>
    <div class="product-card__media">
      <img src="assets/img/productos/cca-polaris.webp" alt="CCA Polaris" width="465" height="480">
      <span class="product-card__tag">Más vendido</span>
    </div>
    <div class="product-card__body">
      <h3>CCA Polaris</h3>
      <p class="product-card__desc">Sonido de alta fidelidad.</p>
    </div>
  </article>
</div>`;

test("parseCatalog extrae los campos de las tarjetas actuales", () => {
  const products = parseCatalog(SAMPLE);

  assert.equal(products.length, 2);

  assert.deepEqual(
    {
      anchor: products[0].anchor,
      slug: products[0].slug,
      name: products[0].name,
      price: products[0].price,
      compareAtPrice: products[0].compareAtPrice,
      categorySlug: products[0].categorySlug,
      badge: products[0].badge,
      permanentOffer: products[0].permanentOffer,
      imageSrc: products[0].imageSrc,
      imageWidth: products[0].imageWidth
    },
    {
      anchor: "product-kz-zs10-pro-x",
      slug: "kz-zs10-pro-x",
      name: "KZ ZS10 Pro X",
      price: 2250,
      compareAtPrice: null,
      categorySlug: "audifonos",
      badge: "Favorito",
      permanentOffer: false,
      imageSrc: "assets/img/productos/kz-zs10-pro-x.webp",
      imageWidth: 268
    }
  );

  assert.equal(products[1].compareAtPrice, 1550);
  assert.equal(products[1].permanentOffer, true);
  assert.equal(products[1].sortOrder, 1);
});

test("el index.html real contiene 34 productos migrables", async () => {
  const html = await fs.readFile(path.join(root, "index.html"), "utf8");
  const products = parseCatalog(html);

  assert.equal(products.length, 34);
  assert.equal(new Set(products.map((product) => product.anchor)).size, 34);
  assert.ok(products.every((product) => product.price > 0));
  assert.ok(products.every((product) => product.imageSrc));
  assert.ok(products.every((product) => product.anchor.startsWith("product-")));
});
