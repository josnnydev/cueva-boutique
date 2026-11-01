/* ==========================================================================
   Configuración de Cueva Boutique
   --------------------------------------------------------------------------
   1. WhatsApp: código de país + número, sin "+", espacios ni guiones.
      República Dominicana: 1 + 8293815317 = 18293815317
   2. El enlace corto se usa para los botones generales de contacto.
   3. Los precios se muestran en pesos dominicanos (DOP) con el símbolo "$".
   ========================================================================== */
window.CUEVA_CONFIG = {
  storeName: "Cueva Boutique",

  // Versión visible en el pie de la tienda. Súbela en cada actualización publicada.
  // Correcciones: 1.1.1 · Funciones nuevas: 1.2.0
  version: "1.2.0",
  updatedAt: "2026-11-01",

  // WhatsApp principal para pedidos de productos.
  whatsappNumber: "18293815317",

  // Enlace corto oficial para el chat general.
  generalLink: "https://wa.me/message/P3LU5C3LG4JPA1",

  instagramHandle: "@cueva_boutique",
  instagramUrl:
    "https://www.instagram.com/cueva_boutique?mdxt=MTh0ZnBxb3Bta3ZuaA==",

  locale: "es-DO",
  currency: "DOP",
  currencySymbol: "$",

  generalMessage:
    "¡Hola Cueva Boutique! 👋 Vi su web y quiero información sobre los productos y las ofertas flash de hoy. ¿Me ayudan?",

  // Si es true, el contador de las ofertas termina a medianoche.
  offersEndAtMidnight: true,

  // Ofertas flash rotativas: cada día se eligen productos distintos.
  dailyOffers: {
    enabled: true,
    count: 6, // productos distintos por día
    step: 0, // 0 = automático (count + 1), para no repetir entre días
    highDiscount: 15,
    highCount: 3, // de los 6, cuántos llevan el descuento alto
    lowDiscount: 10,
    startDate: "2026-10-31", // fecha de inicio de la rotación (AAAA-MM-DD)
    seed: 484 // semilla fija: el orden es igual para todos los visitantes
  },

  // Catálogo administrado desde el CMS (Netlify Functions + Supabase).
  // Si la API no está disponible, la tienda usa el HTML estático generado.
  cms: {
    enabled: true,
    endpoint: "/api/public/catalog",
    timeout: 6000
  }
};
