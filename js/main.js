/* Consola: estado de la expresión, teclado (en pantalla y físico) y persistencia. */
(function () {
  "use strict";

  var App = window.OrbitCalc;
  var engine = App.engine;
  var STORE_KEY = "orbit-calc:v1";
  var OPERATORS = "+-*/^";

  var els = {
    main: document.getElementById("main"),
    sub: document.getElementById("sub"),
    status: document.getElementById("status"),
    announce: document.getElementById("announce"),
    keys: document.querySelector(".keys"),
    count: document.getElementById("count"),
    hint: document.getElementById("hint"),
    deorbit: document.getElementById("deorbit"),
  };

  var state = {
    expr: "", // expresión en forma canónica: 0-9 . + - * / ^ ( )
    done: false, // true justo después de "="
    lastExpr: "",
    lastValue: null,
  };

  /* ---------- persistencia ---------- */

  function load() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      var data = raw ? JSON.parse(raw) : null;
      return data && Array.isArray(data.sats) ? data.sats : [];
    } catch (err) {
      return [];
    }
  }

  function save() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify({ sats: orbits.serialize() }));
    } catch (err) {
      /* almacenamiento no disponible: la calculadora sigue funcionando */
    }
  }

  /* ---------- vista ---------- */

  function setStatus(label, text, isError) {
    els.status.innerHTML = "";
    els.status.append(label + ": ");
    var strong = document.createElement("b");
    strong.textContent = text;
    els.status.appendChild(strong);
    els.status.classList.toggle("is-error", Boolean(isError));
  }

  function lastChar() {
    return state.expr[state.expr.length - 1];
  }

  function openParens() {
    var open = 0;
    for (var i = 0; i < state.expr.length; i++) {
      if (state.expr[i] === "(") open++;
      else if (state.expr[i] === ")") open--;
    }
    return open;
  }

  function hasOperation(expr) {
    return /[+*/^(]|.-/.test(expr);
  }

  function render() {
    var mainText;
    var subText = " ";

    if (state.done) {
      mainText = engine.format(state.lastValue);
      subText = engine.pretty(state.lastExpr) + " =";
    } else {
      mainText = state.expr ? engine.pretty(state.expr) : "0";
      if (hasOperation(state.expr)) {
        var preview = engine.evaluate(state.expr);
        if (preview.ok) subText = "= " + engine.format(preview.value);
      }
    }

    els.main.textContent = mainText;
    els.sub.textContent = subText;
    els.main.dataset.size = mainText.length <= 10 ? "l" : mainText.length <= 16 ? "m" : "s";
    els.main.classList.toggle("is-result", state.done);
  }

  function animateResult() {
    if (!els.main.animate || window.Pluton.reducedMotion()) return;
    els.main.animate(
      [
        { transform: "translateY(10px)", opacity: 0.2 },
        { transform: "translateY(0)", opacity: 1 },
      ],
      { duration: 360, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
    );
  }

  function shake() {
    if (!els.main.animate || window.Pluton.reducedMotion()) return;
    els.main.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-7px)" },
        { transform: "translateX(5px)" },
        { transform: "translateX(-2px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 340, easing: "cubic-bezier(0.65, 0, 0.35, 1)" }
    );
  }

  /* ---------- entrada ---------- */

  function typeDigit(d) {
    if (state.done) {
      state.expr = "";
      state.done = false;
    }
    // Un "0" suelto se reemplaza: evita números como 007.
    if (/(^|[^0-9.])0$/.test(state.expr)) state.expr = state.expr.slice(0, -1);
    state.expr += d;
  }

  function typeDot() {
    if (state.done) {
      state.expr = "";
      state.done = false;
    }
    var current = state.expr.match(/[0-9.]*$/)[0];
    if (current.indexOf(".") !== -1) return;
    state.expr += current ? "." : "0.";
  }

  function typeOperator(op) {
    if (state.done) {
      state.expr = engine.canonical(state.lastValue);
      state.done = false;
    }
    var last = lastChar();

    // "5 × −3": el menos puede seguir a × ÷ ^ o a un paréntesis como signo.
    if (op === "-" && (last === "*" || last === "/" || last === "^" || last === "(")) {
      state.expr += "-";
      return;
    }
    // Un operador nuevo sustituye al anterior en vez de apilarse.
    while (state.expr && OPERATORS.indexOf(lastChar()) !== -1) state.expr = state.expr.slice(0, -1);
    last = lastChar();

    if (!state.expr) {
      state.expr = op === "-" ? "-" : "0" + op;
    } else if (last === "(") {
      if (op === "-") state.expr += "-";
    } else {
      if (last === ".") state.expr = state.expr.slice(0, -1);
      state.expr += op;
    }
  }

  function typeParen(paren) {
    if (state.done) {
      state.expr = "";
      state.done = false;
    }
    if (paren === "(") {
      state.expr += "(";
      return;
    }
    var last = lastChar();
    if (openParens() > 0 && last !== "(" && OPERATORS.indexOf(last) === -1) state.expr += ")";
  }

  function backspace() {
    if (state.done) {
      clearAll();
      return;
    }
    state.expr = state.expr.slice(0, -1);
  }

  function clearAll() {
    state.expr = "";
    state.done = false;
    setStatus("status", "listo para lanzar");
  }

  function equals() {
    if (state.done || !state.expr) return;
    var result = engine.evaluate(state.expr);

    if (!result.ok) {
      var message = engine.describeError(result.error);
      setStatus("error", message, true);
      els.announce.textContent = "Error: " + message;
      shake();
      return;
    }

    var closed = state.expr + new Array(openParens() + 1).join(")");
    var isOperation = engine.canonical(result.value) !== closed;

    state.lastExpr = closed;
    state.lastValue = result.value;
    state.done = true;
    render();
    animateResult();
    els.announce.textContent = engine.pretty(closed) + " es igual a " + engine.format(result.value);

    if (isOperation) {
      var sat = orbits.add(
        {
          value: engine.canonical(result.value),
          label: engine.format(result.value, 8),
          expr: engine.pretty(closed),
        },
        true
      );
      setStatus("status", "en órbita · anillo " + (sat.ring + 1));
      save();
    } else {
      setStatus("status", "listo para lanzar");
    }
  }

  // Un satélite devuelve su valor a la expresión en curso.
  function insertValue(sat) {
    var value = sat.value;
    var wrapped = value[0] === "-" ? "(" + value + ")" : value;
    var last = lastChar();

    if (state.done || !state.expr) {
      state.expr = value;
      state.done = false;
    } else if (/[0-9.)]/.test(last)) {
      state.expr += "*" + wrapped;
    } else {
      state.expr += wrapped;
    }
    setStatus("status", "valor " + sat.label + " recuperado");
    els.announce.textContent = "Valor " + sat.label + " añadido a la expresión";
    render();
  }

  function press(key) {
    if (key >= "0" && key <= "9") typeDigit(key);
    else if (key === ".") typeDot();
    else if (OPERATORS.indexOf(key) !== -1) typeOperator(key);
    else if (key === "(" || key === ")") typeParen(key);
    else if (key === "back") backspace();
    else if (key === "clear") clearAll();
    else if (key === "equals") {
      equals();
      return;
    } else return;

    if (els.status.classList.contains("is-error")) setStatus("status", "listo para lanzar");
    render();
  }

  /* ---------- teclado en pantalla ---------- */

  els.keys.addEventListener("click", function (event) {
    var button = event.target.closest("[data-key]");
    if (!button) return;
    // Clic de ratón o dedo (detail > 0): se suelta el foco para que el Enter
    // del teclado físico siga siendo "=" y no repita esta tecla.
    if (event.detail > 0) button.blur();
    press(button.dataset.key);
  });

  /* ---------- teclado físico ---------- */

  var KEYMAP = {
    Enter: "equals",
    "=": "equals",
    Backspace: "back",
    Escape: "clear",
    Delete: "clear",
    ",": ".",
    x: "*",
    X: "*",
    "×": "*",
    "÷": "/",
    "−": "-",
  };

  function flash(key) {
    var button = els.keys.querySelector('[data-key="' + key + '"]');
    if (!button) return;
    button.classList.add("is-pressed");
    window.setTimeout(function () {
      button.classList.remove("is-pressed");
    }, 140);
  }

  document.addEventListener("keydown", function (event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    var key = KEYMAP[event.key] || event.key;
    if (!/^([0-9.()+\-*/^]|equals|back|clear)$/.test(key)) return;

    // Si alguien navega con Tab, Enter activa el control enfocado, no "=".
    var target = event.target;
    if (event.key === "Enter" && target instanceof Element && target.closest("button, a, [role='button']") && target.matches(":focus-visible")) {
      return;
    }

    event.preventDefault();
    flash(key);
    press(key);
  });

  /* ---------- escena ---------- */

  var orbits = App.createOrbits({
    stage: document.getElementById("stage"),
    svg: document.getElementById("sky"),
    onReuse: insertValue,
    onChange: function (count) {
      els.count.textContent = count + "/8";
      els.deorbit.hidden = count === 0;
      els.hint.textContent = count
        ? "toca un satélite para reutilizar su valor"
        : "sin satélites · calcula algo para lanzar el primero";
    },
  });

  els.deorbit.addEventListener("click", function () {
    orbits.clear();
    save();
    setStatus("status", "órbitas despejadas");
  });

  load().forEach(function (item) {
    if (item && typeof item.value === "string" && typeof item.label === "string") {
      orbits.add({ n: item.n, value: item.value, label: item.label, expr: String(item.expr || "") }, false);
    }
  });

  render();
})();
