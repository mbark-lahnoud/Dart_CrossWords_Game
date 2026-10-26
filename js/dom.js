/* Petit utilitaire de création d'éléments (textContent uniquement : pas d'injection HTML). */
(function (g) {
  "use strict";
  var DCP = g.DCP = g.DCP || {};
  DCP.Dom = {
    h: function (tag, attrs, children) {
      var el = document.createElement(tag);
      Object.keys(attrs || {}).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else el.setAttribute(k, v === true ? "" : v);
      });
      (children || []).forEach(function (ch) {
        if (ch === null || ch === undefined) return;
        el.appendChild(typeof ch === "string" ? document.createTextNode(ch) : ch);
      });
      return el;
    },
    clear: function (el) { while (el.firstChild) el.removeChild(el.firstChild); }
  };
})(typeof window !== "undefined" ? window : globalThis);
