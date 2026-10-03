/* Motor de cálculo: tokeniza, analiza y evalúa sin eval().
   Gramática (descenso recursivo):
     expr    := term (("+" | "-") term)*
     term    := factor (("*" | "/") factor)*
     factor  := ("-" | "+") factor | power
     power   := primary ("^" factor)?
     primary := número | "(" expr ")"                                      */
(function () {
  "use strict";

  var App = (window.OrbitCalc = window.OrbitCalc || {});

  var OPERATORS = "+-*/^";

  function tokenize(src) {
    var tokens = [];
    var i = 0;
    while (i < src.length) {
      var ch = src[i];
      if (ch === " ") {
        i++;
      } else if ((ch >= "0" && ch <= "9") || ch === ".") {
        var start = i;
        var dots = 0;
        while (i < src.length && ((src[i] >= "0" && src[i] <= "9") || src[i] === ".")) {
          if (src[i] === ".") dots++;
          i++;
        }
        // Notación científica, solo cuando llega de un resultado reutilizado.
        if (src[i] === "e" && /^e[+-]?\d/.test(src.slice(i, i + 3))) {
          i += 2;
          while (i < src.length && src[i] >= "0" && src[i] <= "9") i++;
        }
        var text = src.slice(start, i);
        if (dots > 1 || text === ".") return null;
        tokens.push({ type: "num", value: parseFloat(text) });
      } else if (OPERATORS.indexOf(ch) !== -1) {
        tokens.push({ type: "op", value: ch });
        i++;
      } else if (ch === "(" || ch === ")") {
        tokens.push({ type: ch });
        i++;
      } else {
        return null;
      }
    }

    // Multiplicación implícita: 2(3), (2)(3), (2)3
    var out = [];
    for (var k = 0; k < tokens.length; k++) {
      var prev = out[out.length - 1];
      var cur = tokens[k];
      if (prev && (prev.type === "num" || prev.type === ")") && (cur.type === "(" || (cur.type === "num" && prev.type === ")"))) {
        out.push({ type: "op", value: "*" });
      }
      out.push(cur);
    }
    return out;
  }

  function CalcError(code) {
    this.code = code;
  }

  function parse(tokens) {
    var pos = 0;

    function peek() {
      return tokens[pos];
    }

    function isOp(symbols) {
      var t = peek();
      return t && t.type === "op" && symbols.indexOf(t.value) !== -1;
    }

    function expr() {
      var value = term();
      while (isOp("+-")) {
        var op = tokens[pos++].value;
        var right = term();
        value = op === "+" ? value + right : value - right;
      }
      return value;
    }

    function term() {
      var value = factor();
      while (isOp("*/")) {
        var op = tokens[pos++].value;
        var right = factor();
        if (op === "/") {
          if (right === 0) throw new CalcError("div0");
          value = value / right;
        } else {
          value = value * right;
        }
      }
      return value;
    }

    function factor() {
      if (isOp("+-")) {
        var op = tokens[pos++].value;
        var value = factor();
        return op === "-" ? -value : value;
      }
      return power();
    }

    function power() {
      var base = primary();
      if (isOp("^")) {
        pos++;
        return Math.pow(base, factor());
      }
      return base;
    }

    function primary() {
      var t = tokens[pos++];
      if (!t) throw new CalcError("syntax");
      if (t.type === "num") return t.value;
      if (t.type === "(") {
        var value = expr();
        var close = tokens[pos++];
        if (!close || close.type !== ")") throw new CalcError("syntax");
        return value;
      }
      throw new CalcError("syntax");
    }

    var result = expr();
    if (pos < tokens.length) throw new CalcError("syntax");
    return result;
  }

  // Cierra los paréntesis que queden abiertos: "2*(3+4" se evalúa como "2*(3+4)".
  function balance(src) {
    var open = 0;
    for (var i = 0; i < src.length; i++) {
      if (src[i] === "(") open++;
      else if (src[i] === ")") open--;
      if (open < 0) return null;
    }
    return src + new Array(open + 1).join(")");
  }

  function evaluate(src) {
    if (!src) return { ok: false, error: "empty" };
    var balanced = balance(src);
    if (balanced === null) return { ok: false, error: "syntax" };
    var tokens = tokenize(balanced);
    if (!tokens || !tokens.length) return { ok: false, error: "syntax" };
    try {
      var value = parse(tokens);
      if (!isFinite(value)) return { ok: false, error: "range" };
      // 12 cifras significativas: 0.1 + 0.2 da 0.3, no 0.30000000000000004.
      value = parseFloat(value.toPrecision(12));
      if (value === 0) value = 0; // evita -0
      return { ok: true, value: value };
    } catch (err) {
      if (err instanceof CalcError) return { ok: false, error: err.code };
      throw err;
    }
  }

  // Forma canónica para volver a meter un número en la expresión.
  function canonical(value) {
    return String(value);
  }

  // Número para mostrar: coma decimal, exponente solo en los extremos.
  function format(value, maxLength) {
    var abs = Math.abs(value);
    var text;
    if (abs !== 0 && (abs >= 1e12 || abs < 1e-6)) {
      text = value.toExponential(6).replace(/\.?0+e/, "e");
    } else {
      text = String(value);
    }
    if (maxLength && text.length > maxLength) {
      var digits = Math.max(1, maxLength - 5);
      text = String(parseFloat(value.toPrecision(digits)));
      if (text.length > maxLength) text = value.toExponential(Math.max(0, maxLength - 6)).replace(/\.?0+e/, "e");
    }
    return text.replace(".", ",").replace("-", "−").replace("e+", "e");
  }

  // Expresión para mostrar: símbolos tipográficos y aire alrededor de los operadores.
  function pretty(src) {
    var out = "";
    for (var i = 0; i < src.length; i++) {
      var ch = src[i];
      var prev = src[i - 1];
      var unary = (ch === "-" || ch === "+") && (i === 0 || "(+-*/^e".indexOf(prev) !== -1);
      if (unary) out += ch === "-" ? "−" : "+";
      else if (ch === "*") out += " × ";
      else if (ch === "/") out += " ÷ ";
      else if (ch === "-") out += " − ";
      else if (ch === "+") out += " + ";
      else if (ch === "^") out += "^";
      else if (ch === ".") out += ",";
      else out += ch;
    }
    return out;
  }

  var ERRORS = {
    div0: "división entre cero",
    range: "resultado fuera de rango",
    syntax: "expresión incompleta",
    empty: "nada que calcular",
  };

  App.engine = {
    evaluate: evaluate,
    format: format,
    canonical: canonical,
    pretty: pretty,
    describeError: function (code) {
      return ERRORS[code] || ERRORS.syntax;
    },
  };
})();
