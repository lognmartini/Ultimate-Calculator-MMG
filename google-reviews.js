/* google-reviews.js
   Replaces the static review carousel with live Google reviews when
   /api/reviews returns them. Silent no-op otherwise, so the hand-picked
   quotes stay as the fallback and the page never shows an empty rail.

   Honest-display rules baked in:
   - the aggregate rating and count shown come from Google, not hardcoded
   - reviews are rendered as Google returned them, newest first
   - Google requires visible attribution, added below the rail
   The Places API returns at most 5 reviews, so this is a live sample of the
   full set on Google, not the whole thing. The link goes to all of them. */
(function () {
  "use strict";
  var MIN_STARS = 5;

  function apiBase() {
    var m = document.querySelector('meta[name="mmg-api-base"]');
    var b = (m && m.content) || "/";
    return b.charAt(b.length - 1) === "/" ? b : b + "/";
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function render(data) {
    var track = document.getElementById("mmgReviewTrack");
    if (!track) return;

    var list = (data.reviews || []).filter(function (r) {
      return r.rating >= MIN_STARS && r.text;
    });
    if (!list.length) return;

    track.innerHTML = list
      .map(function (r, i) {
        var t = r.text.length > 240 ? r.text.slice(0, 237).trim() + "\u2026" : r.text;
        var who = esc(r.author) + (r.relative ? " \u00b7 " + esc(r.relative) : "");
        return (
          '<blockquote class="mmg-review' + (i === 0 ? " is-active" : "") + '">' +
          "\u201c" + esc(t) + "\u201d" +
          "<cite>" + who + "</cite></blockquote>"
        );
      })
      .join("");

    // live aggregate replaces the hardcoded "5.0 \u00b7 169 reviews"
    if (data.rating && data.total) {
      var r1 = Number(data.rating).toFixed(1);
      document.querySelectorAll(".mmg-reviews-head strong").forEach(function (el, i) {
        if (i === 0) el.textContent = r1;
      });
      document.querySelectorAll(".mmg-hs-trust strong").forEach(function (el) {
        var tx = el.textContent || "";
        if (/^[0-9.]+$/.test(tx.trim())) el.textContent = r1;
        else if (/review/i.test(tx)) el.textContent = data.total + " reviews";
      });
    }

    if (!document.querySelector(".mmg-reviews-attrib")) {
      var p = document.createElement("p");
      p.className = "mmg-reviews-attrib";
      var href = data.placeUri || "";
      p.innerHTML =
        "Reviews from Google" +
        (href ? ' \u00b7 <a href="' + esc(href) + '" target="_blank" rel="noopener">read all on Google</a>' : "");
      var wrap = document.querySelector(".mmg-reviews");
      if (wrap) wrap.appendChild(p);
    }

    if (window.MMG_logan5_track) {
      try { window.MMG_logan5_track("reviews_live", { n: list.length }); } catch (e) {}
    }
  }

  function boot() {
    fetch(apiBase() + "api/reviews", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.configured && (d.reviews || []).length) render(d); })
      .catch(function () { /* keep the static quotes */ });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
