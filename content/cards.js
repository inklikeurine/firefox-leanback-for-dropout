// Leanback for Dropout — the card every Leanback screen draws
// (content/screen.js). A card is a link holding the picture, a badge, the
// running time (or the time left) and a progress bar, with the title and a
// subtitle under it. Also the readers for Dropout's tiles that Home and the
// other screens share. Site-agnostic: the selectors come from the caller.

(function () {
  function hrefOf(el) {
    if (!el) return "";
    const h = el.href || el.getAttribute("href") || "";
    return typeof h === "string" && h && !h.startsWith("javascript:") ? h : "";
  }

  /** "1:45:05" → 6305, "24:30" → 1470; null for anything else. */
  function parseDuration(s) {
    const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(String(s || "").trim());
    if (!m) return null;
    return (Number(m[1] || 0) * 3600) + Number(m[2]) * 60 + Number(m[3]);
  }

  /** "06:03" → "6:03": Dropout pads short running times; a TV reads them bare. */
  function tidyDuration(s) {
    return parseDuration(s) === null ? s : s.replace(/^0(?=\d)/, "");
  }

  // A progress bar's width as a percentage, or null.
  function percentOf(bar) {
    if (!bar) return null;
    const w = parseFloat((bar.style && bar.style.width) || "");
    return Number.isFinite(w) ? Math.min(100, Math.max(0, w)) : null;
  }

  function setText(node, v) {
    const t = v || "";
    if (node.textContent !== t) node.textContent = t;
  }

  function setAttr(node, name, v) {
    if (v === null || v === undefined || v === "") {
      if (node.hasAttribute(name)) node.removeAttribute(name);
    } else if (node.getAttribute(name) !== String(v)) node.setAttribute(name, String(v));
  }

  function el(doc, tag, cls) {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  /**
   * A card for `item`: {key, href, title, subtitle, image, durationText,
   * badge, fraction (0–1, or null), watch ("watched" for a tick), viewAll}. Returns the card's parts;
   * `wrap` is the element to place, `link` the one that takes the selection.
   */
  function makeCard(doc, item) {
    const wrap = el(doc, "div", "tenfoot-card");
    const link = el(doc, "a", "tenfoot-card-link");
    const art = el(doc, "img", "tenfoot-card-art");
    art.alt = "";
    art.loading = "lazy";
    art.decoding = "async";
    const badge = el(doc, "span", "tenfoot-card-badge");
    const time = el(doc, "span", "tenfoot-card-time");
    const bar = el(doc, "span", "tenfoot-card-progress");
    const fill = el(doc, "span", "tenfoot-card-progress-fill");
    bar.appendChild(fill);
    const label = el(doc, "span", "tenfoot-card-viewall");
    const tick = el(doc, "span", "tenfoot-card-tick");
    tick.setAttribute("aria-hidden", "true");
    link.append(art, badge, time, bar, tick, label);
    const title = el(doc, "div", "tenfoot-card-title");
    const sub = el(doc, "div", "tenfoot-card-sub");
    wrap.append(link, title, sub);
    const card = { item, wrap, link, art, badge, time, bar, fill, tick, label, title, sub };
    updateCard(card, item);
    return card;
  }

  /** Redraw a card for `item`, writing only what changed. */
  function updateCard(card, item) {
    card.item = item;
    setAttr(card.link, "href", item.href);
    setAttr(card.link, "aria-label", [item.title, item.subtitle].filter(Boolean).join(", "));
    setAttr(card.wrap, "data-tenfoot-card", item.key);
    if (item.viewAll) {
      card.wrap.dataset.tenfootViewall = "true";
      setText(card.label, "View all");
      setAttr(card.art, "src", null);
    } else {
      delete card.wrap.dataset.tenfootViewall;
      setText(card.label, "");
      if (item.image && card.art.getAttribute("src") !== item.image) card.art.setAttribute("src", item.image);
    }
    setText(card.badge, item.badge || "");
    card.badge.hidden = !item.badge;
    setText(card.time, item.durationText || "");
    card.time.hidden = !item.durationText;
    const f = typeof item.fraction === "number" && item.fraction > 0 ? Math.min(1, item.fraction) : null;
    card.bar.hidden = f === null;
    const w = f === null ? "" : `${Math.round(f * 1000) / 10}%`;
    if (card.fill.style.width !== w) card.fill.style.width = w;
    setAttr(card.wrap, "data-tenfoot-watch", item.watch || null);
    card.tick.hidden = item.watch !== "watched";
    setText(card.title, item.viewAll ? item.subtitle : item.title);
    setText(card.sub, item.viewAll ? "" : item.subtitle);
  }

  /**
   * Place `items` as cards in `box`, by key: a card still there keeps its
   * element (and so the selection), and only what is out of place moves.
   * Returns the links in order.
   */
  function reconcile(doc, box, cards, items) {
    const seen = new Set();
    let prev = null;
    const links = [];
    for (const it of items) {
      let card = cards.get(it.key);
      if (!card) {
        card = makeCard(doc, it);
        cards.set(it.key, card);
      } else updateCard(card, it);
      seen.add(it.key);
      const ref = prev ? prev.nextSibling : box.firstChild;
      if (card.wrap !== ref) box.insertBefore(card.wrap, ref);
      prev = card.wrap;
      links.push(card.link);
    }
    for (const [k, card] of cards) {
      if (!seen.has(k)) {
        card.wrap.remove();
        cards.delete(k);
      }
    }
    return links;
  }

  globalThis.TenfootCards = Object.freeze({
    makeCard, updateCard, reconcile, hrefOf, parseDuration, tidyDuration, percentOf, setText, setAttr
  });
})();
