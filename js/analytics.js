/* ==========================================================================
   Cueva Boutique · Visitas anónimas
   --------------------------------------------------------------------------
   Registra en segundo plano cada página y producto visitado. No guarda datos
   personales: solo la ruta, el referente y un identificador aleatorio del
   navegador para contar visitantes únicos. El servidor ignora al administrador
   logueado y a los bots conocidos.
   ========================================================================== */
(function () {
  "use strict";

  var ENDPOINT = "/api/public/visits";
  var STORAGE_KEY = "cb_visit_id";
  var DEDUPE_MS = 15000;
  var lastSent = { page: "", at: 0 };
  var memoryId = "";
  var timer = null;

  function randomId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }

    var bytes = new Uint8Array(16);
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      window.crypto.getRandomValues(bytes);
    } else {
      for (var index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
    }

    var hex = Array.prototype.map
      .call(bytes, function (byte) {
        return byte.toString(16).padStart(2, "0");
      })
      .join("");

    return (
      hex.slice(0, 8) +
      "-" +
      hex.slice(8, 12) +
      "-" +
      hex.slice(12, 16) +
      "-" +
      hex.slice(16, 20) +
      "-" +
      hex.slice(20, 32)
    );
  }

  function readId(storage) {
    try {
      var value = storage.getItem(STORAGE_KEY);
      if (value && /^[A-Za-z0-9._-]{8,100}$/.test(value)) return value;
    } catch (error) {
      // Almacenamiento bloqueado (modo privado o cookies restringidas).
    }
    return "";
  }

  function sessionId() {
    var stored = readId(window.localStorage);
    if (stored) return stored;

    stored = readId(window.sessionStorage);
    if (stored) {
      try {
        window.localStorage.setItem(STORAGE_KEY, stored);
      } catch (error) {
        // Se mantiene solo en la sesión actual.
      }
      return stored;
    }

    if (!memoryId) memoryId = randomId();

    try {
      window.localStorage.setItem(STORAGE_KEY, memoryId);
    } catch (error) {
      try {
        window.sessionStorage.setItem(STORAGE_KEY, memoryId);
      } catch (storageError) {
        // Sin almacenamiento: se usa el identificador en memoria.
      }
    }

    return memoryId;
  }

  function currentPage() {
    var page = window.location.pathname || "/";
    var hash = window.location.hash || "";

    // Los productos viven como anclas (#product-...). Se registran aparte
    // para poder mostrar los más vistos, sin sumar filtros ni secciones.
    if (/^#product-/.test(hash)) {
      page += hash;
    }

    return page.slice(0, 200);
  }

  function currentReferrer() {
    var referrer = document.referrer || "";
    if (!referrer) return "";

    try {
      if (new URL(referrer).origin === window.location.origin) return "";
    } catch (error) {
      return "";
    }

    return referrer.slice(0, 500);
  }

  function send() {
    if (window.location.pathname.indexOf("/admin") === 0) return;
    if (navigator.webdriver) return;
    if (document.prerendering) return;

    var page = currentPage();
    var now = Date.now();
    if (page === lastSent.page && now - lastSent.at < DEDUPE_MS) return;

    var body;
    try {
      body = JSON.stringify({
        pagina: page,
        referrer: currentReferrer(),
        sessionId: sessionId()
      });
    } catch (error) {
      return;
    }

    lastSent = { page: page, at: now };

    // sendBeacon no bloquea la navegación y funciona al cerrar la pestaña.
    if (navigator.sendBeacon) {
      try {
        var blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon(ENDPOINT, blob)) return;
      } catch (error) {
        // Continúa con fetch como respaldo.
      }
    }

    try {
      window
        .fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body,
          credentials: "same-origin",
          keepalive: true
        })
        .catch(function () {});
    } catch (error) {
      // La analítica nunca debe afectar la tienda.
    }
  }

  function schedule(delay) {
    window.clearTimeout(timer);
    timer = window.setTimeout(send, typeof delay === "number" ? delay : 400);
  }

  if (document.readyState === "complete") {
    schedule(500);
  } else {
    window.addEventListener("load", function () {
      schedule(500);
    }, { once: true });
  }

  window.addEventListener("hashchange", function () {
    schedule(250);
  });

  window.addEventListener("popstate", function () {
    schedule(250);
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      window.clearTimeout(timer);
      send();
    }
  });

  window.CuevaAnalytics = { track: schedule };
})();
