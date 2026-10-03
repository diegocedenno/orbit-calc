/* Escena orbital: cada resultado es un satélite alrededor de Plutón.
   Un único bucle requestAnimationFrame mueve todo y solo toca `transform`.
   Con prefers-reduced-motion no hay bucle: los satélites quedan fijos y
   aparecen con un fundido de opacidad. */
(function () {
  "use strict";

  var App = (window.OrbitCalc = window.OrbitCalc || {});
  var SVG_NS = "http://www.w3.org/2000/svg";

  var RINGS = [88, 132, 176, 220]; // radios en unidades del viewBox
  var PERIODS = [40, 58, 80, 106]; // segundos por vuelta: más lento cuanto más lejos
  var MAX_SATS = 8;
  var GOLDEN_ANGLE = 2.39996; // reparte los satélites sin que coincidan
  var PLUTO_RADIUS = 40;
  var LAUNCH_MS = 1700;
  var TAU = Math.PI * 2;

  function node(name, attrs, parent) {
    var el = document.createElementNS(SVG_NS, name);
    for (var key in attrs) el.setAttribute(key, attrs[key]);
    if (parent) parent.appendChild(el);
    return el;
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function easeOutCubic(p) {
    return 1 - Math.pow(1 - p, 3);
  }

  function easeOutQuart(p) {
    return 1 - Math.pow(1 - p, 4);
  }

  function reduced() {
    return window.Pluton && window.Pluton.reducedMotion();
  }

  App.createOrbits = function (options) {
    var stage = options.stage;
    var svg = options.svg;
    var ringsLayer = svg.querySelector("#rings");
    var trailsLayer = svg.querySelector("#trails");
    var satsLayer = svg.querySelector("#sats");
    var pulse = svg.querySelector("#pulse");

    var sats = [];
    var counter = 0; // nº de lanzamientos: decide anillo y ángulo
    var tilt = 1; // inclinación del plano orbital según la forma del escenario
    var labelScale = 1;
    var simTime = 0; // tiempo orbital; se detiene al pasar el cursor
    var lastFrame = 0;
    var frame = 0;
    var hovering = false;
    var focusing = false;

    var ringEls = RINGS.map(function (r) {
      return node("ellipse", { class: "orbit-dashed", rx: r, ry: r }, ringsLayer);
    });

    /* ---------- geometría ---------- */

    function layout() {
      var rect = stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      tilt = clamp(rect.height / rect.width, 0.5, 1);
      labelScale = clamp(600 / rect.width, 1, 1.6);
      svg.setAttribute("viewBox", "-300 " + -300 * tilt + " 600 " + 600 * tilt);
      stage.style.setProperty("--k", labelScale.toFixed(3));
      ringEls.forEach(function (el, i) {
        el.setAttribute("ry", (RINGS[i] * tilt).toFixed(2));
      });
      if (!frame) drawAll(performance.now());
    }

    function place(sat, now) {
      var radius = RINGS[sat.ring];
      var angle = sat.base + (simTime / (PERIODS[sat.ring] * 1000)) * TAU;

      if (sat.launchedAt !== null) {
        var p = clamp((now - sat.launchedAt) / LAUNCH_MS, 0, 1);
        radius = PLUTO_RADIUS + (radius - PLUTO_RADIUS) * easeOutCubic(p);
        angle -= (1 - easeOutQuart(p)) * Math.PI * 1.5; // espiral de salida
        if (p === 1) land(sat);
      }

      var cos = Math.cos(angle);
      var sin = Math.sin(angle);
      var x = radius * cos;
      var y = radius * sin * tilt;
      sat.el.setAttribute("transform", "translate(" + x.toFixed(2) + " " + y.toFixed(2) + ")");

      // La etiqueta se aparta hacia fuera para no pisar Plutón ni el propio satélite.
      var fontSize = 12 * labelScale;
      var halfWidth = sat.label.length * 0.3 * fontSize;
      var lx = cos * (11 + halfWidth * Math.abs(cos));
      var ly = sin * (11 + fontSize * 0.55);
      sat.labelEl.setAttribute("transform", "translate(" + lx.toFixed(2) + " " + ly.toFixed(2) + ")");

      if (sat.launchedAt !== null) {
        var dx = x - sat.x;
        var dy = y - sat.y;
        if (dx * dx + dy * dy > 0.01) {
          var heading = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
          sat.rocketEl.setAttribute("transform", "rotate(" + heading.toFixed(1) + ")");
        }
        sat.trail.push(x.toFixed(1) + " " + y.toFixed(1));
        sat.trailEl.setAttribute("d", "M" + sat.trail.join("L"));
      }
      sat.x = x;
      sat.y = y;
    }

    function drawAll(now) {
      for (var i = 0; i < sats.length; i++) place(sats[i], now);
    }

    /* ---------- bucle ---------- */

    function tick(now) {
      var dt = Math.min(now - lastFrame, 100);
      lastFrame = now;
      if (!hovering && !focusing) simTime += dt;
      drawAll(now);
      frame = sats.length ? requestAnimationFrame(tick) : 0;
    }

    function start() {
      if (frame || reduced() || document.hidden || !sats.length) return;
      lastFrame = performance.now();
      frame = requestAnimationFrame(tick);
    }

    function stop() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    }

    /* ---------- satélites ---------- */

    function build(sat) {
      var g = node("g", { class: "sat", tabindex: "0", role: "button" }, satsLayer);
      g.setAttribute("aria-label", "Reutilizar " + sat.label + ", resultado de " + sat.expr);

      node("circle", { class: "sat-hit", r: 22 }, g);
      node("circle", { class: "sat-focus", r: 13 }, g);
      sat.pingEl = node("circle", { class: "sat-ping", r: 9 }, g);

      // Cohete en miniatura: solo se ve durante el lanzamiento.
      sat.rocketEl = node("g", { class: "sat-rocket" }, g);
      var rocket = node("g", { transform: "scale(0.3) translate(-24 -36)" }, sat.rocketEl);
      // Los colores van por clase (style.css) para que sigan al tema claro u oscuro.
      node("path", { class: "sat-rocket-flame", d: "M17 66 C17 78 21 86 24 94 C27 86 31 78 31 66 Z" }, rocket);
      node("path", { class: "sat-rocket-fin", d: "M14 46 L5 64 L5 69 L15 63 Z" }, rocket);
      node("path", { class: "sat-rocket-fin", d: "M34 46 L43 64 L43 69 L33 63 Z" }, rocket);
      node("path", { class: "sat-rocket-body", d: "M24 3 C33 13 36 27 36 42 V60 C36 62 34.5 63 33 63 H15 C13.5 63 12 62 12 60 V42 C12 27 15 13 24 3 Z" }, rocket);

      // Satélite en órbita: cuerpo y dos paneles.
      var probe = node("g", { class: "sat-probe" }, g);
      node("rect", { x: -10.5, y: -1.75, width: 6, height: 3.5, rx: 0.8 }, probe);
      node("rect", { x: 4.5, y: -1.75, width: 6, height: 3.5, rx: 0.8 }, probe);
      node("circle", { r: 3.6 }, probe);

      sat.labelEl = node("text", { class: "sat-label", "text-anchor": "middle", "dominant-baseline": "central" }, g);
      sat.labelEl.textContent = sat.label;

      g.addEventListener("click", function () {
        reuse(sat);
      });
      g.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          reuse(sat);
        }
      });

      sat.el = g;
      sat.x = 0;
      sat.y = 0;
    }

    function reuse(sat) {
      if (!reduced() && sat.pingEl.animate) {
        sat.pingEl.animate(
          [
            { transform: "scale(1)", opacity: 0.9 },
            { transform: "scale(2.6)", opacity: 0 },
          ],
          { duration: 520, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
        );
      }
      options.onReuse(sat);
    }

    function land(sat) {
      sat.launchedAt = null;
      sat.el.classList.remove("is-launching");
      var trail = sat.trailEl;
      sat.trailEl = null;
      sat.trail = null;
      if (!trail) return;
      var fade = trail.animate([{ opacity: 0.7 }, { opacity: 0 }], {
        duration: 900,
        easing: "cubic-bezier(0.65, 0, 0.35, 1)",
        fill: "forwards",
      });
      fade.onfinish = function () {
        trail.remove();
      };
    }

    function retire(sat) {
      if (sat.trailEl) sat.trailEl.remove();
      var el = sat.el;
      el.classList.add("is-leaving");
      window.setTimeout(function () {
        el.remove();
      }, 420);
    }

    function add(data, animate) {
      var index = typeof data.n === "number" ? data.n : counter;
      counter = Math.max(counter, index + 1);

      var sat = {
        n: index,
        value: data.value,
        label: data.label,
        expr: data.expr,
        ring: index % RINGS.length,
        base: (index * GOLDEN_ANGLE) % TAU,
        launchedAt: null,
        trail: null,
        trailEl: null,
      };
      // La base descuenta el tiempo ya transcurrido: el satélite entra donde le toca.
      sat.base -= (simTime / (PERIODS[sat.ring] * 1000)) * TAU;

      build(sat);
      sats.push(sat);
      while (sats.length > MAX_SATS) retire(sats.shift());

      if (animate && !reduced()) {
        sat.launchedAt = performance.now();
        sat.trail = [];
        sat.trailEl = node("path", { class: "trail" }, trailsLayer);
        sat.el.classList.add("is-launching");
        pulse.animate(
          [
            { transform: "scale(1)", opacity: 0.55 },
            { transform: "scale(2)", opacity: 0 },
          ],
          { duration: 900, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
        );
      } else if (animate) {
        // Movimiento reducido: solo un fundido.
        sat.el.classList.add("is-fading-in");
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            sat.el.classList.remove("is-fading-in");
          });
        });
      }

      place(sat, performance.now());
      start();
      options.onChange(sats.length);
      return sat;
    }

    function clear() {
      sats.forEach(retire);
      sats = [];
      stop();
      options.onChange(0);
    }

    /* ---------- eventos ---------- */

    stage.addEventListener("pointerenter", function (event) {
      if (event.pointerType === "mouse") hovering = true;
    });
    stage.addEventListener("pointerleave", function () {
      hovering = false;
    });
    satsLayer.addEventListener("focusin", function () {
      focusing = true;
    });
    satsLayer.addEventListener("focusout", function () {
      focusing = false;
    });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop();
      else start();
    });

    if (window.matchMedia) {
      var query = window.matchMedia("(prefers-reduced-motion: reduce)");
      var onMotionChange = function () {
        if (query.matches) {
          stop();
          sats.forEach(function (sat) {
            if (sat.launchedAt !== null) land(sat);
          });
          drawAll(performance.now());
        } else {
          start();
        }
      };
      if (query.addEventListener) query.addEventListener("change", onMotionChange);
    }

    if (window.ResizeObserver) new ResizeObserver(layout).observe(stage);
    else window.addEventListener("resize", layout);
    layout();

    return {
      add: add,
      clear: clear,
      max: MAX_SATS,
      serialize: function () {
        return sats.map(function (sat) {
          return { n: sat.n, value: sat.value, label: sat.label, expr: sat.expr };
        });
      },
    };
  };
})();
