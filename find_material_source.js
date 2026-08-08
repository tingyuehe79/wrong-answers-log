/*
 * 在兰鲸微课原网页控制台运行，用来定位“资料原文”来自哪个接口/函数。
 *
 * 用法：
 * 1. 先在控制台粘贴并运行本脚本。
 * 2. 点击题号 1.1，或刷新/切换题目，让页面重新请求/渲染资料。
 * 3. 控制台如果看到 [MATERIAL SOURCE MATCH]，里面的 url 就是来源接口。
 * 4. 运行 __dumpMaterialSourceResults() 查看累计命中。
 */
(() => {
  const KEYWORDS = [
    "根据地区生产总值",
    "2025年一季度Z省地区生产总值22300亿元",
    "货物进出口12932亿元",
    "能繁母猪存栏62.3万头",
  ];

  const results = [];
  const seen = new Set();

  function normalize(value) {
    return String(value || "")
      .replace(/\s+/g, "")
      .replace(/[（）]/g, (m) => (m === "（" ? "(" : ")"));
  }

  function containsMaterial(value) {
    const text = normalize(value);
    return KEYWORDS.some((keyword) => text.includes(normalize(keyword)));
  }

  function snippet(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    const idxs = KEYWORDS.map((keyword) => text.indexOf(keyword)).filter(
      (idx) => idx >= 0,
    );
    const idx = idxs.length ? Math.min(...idxs) : 0;
    return text.slice(Math.max(0, idx - 120), idx + 700);
  }

  function findMatchesInJson(value, path = "$", out = []) {
    if (value == null) return out;
    if (typeof value === "string") {
      if (containsMaterial(value)) {
        out.push({ path, snippet: snippet(value) });
      }
      return out;
    }
    if (typeof value !== "object") return out;
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        findMatchesInJson(item, `${path}[${index}]`, out),
      );
      return out;
    }
    Object.keys(value).forEach((key) => {
      findMatchesInJson(value[key], `${path}.${key}`, out);
    });
    return out;
  }

  function recordMatch(source) {
    const key = `${source.kind}|${source.method || ""}|${source.url}|${
      source.path || ""
    }|${source.status || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(source);
    console.groupCollapsed(
      "%c[MATERIAL SOURCE MATCH]",
      "color:#0a7;font-weight:bold",
      source.kind,
      source.method || "",
      source.url,
      source.path || "",
    );
    console.log(source);
    if (source.snippet) console.log(source.snippet);
    console.groupEnd();
  }

  function inspectBody(kind, url, method, status, body) {
    if (!body || !containsMaterial(body)) return;
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch (_) {}

    if (parsed) {
      const matches = findMatchesInJson(parsed);
      if (matches.length) {
        matches.forEach((match) =>
          recordMatch({
            kind,
            url,
            method,
            status,
            path: match.path,
            snippet: match.snippet,
          }),
        );
        return;
      }
    }

    recordMatch({
      kind,
      url,
      method,
      status,
      path: "(raw text/html)",
      snippet: snippet(body),
    });
  }

  if (!window.__materialSourceFetchHooked) {
    window.__materialSourceFetchHooked = true;
    const originalFetch = window.fetch;
    window.fetch = async function patchedFetch(input, init) {
      const method = (init && init.method) || "GET";
      const url =
        typeof input === "string"
          ? input
          : input && input.url
            ? input.url
            : String(input);
      const response = await originalFetch.apply(this, arguments);
      try {
        const clone = response.clone();
        clone.text().then((body) => {
          inspectBody("fetch", url, method, response.status, body);
        });
      } catch (e) {
        console.warn("fetch inspect failed", url, e);
      }
      return response;
    };
  }

  if (!window.__materialSourceXhrHooked) {
    window.__materialSourceXhrHooked = true;
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
      this.__materialSourceMethod = method;
      this.__materialSourceUrl = url;
      return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function patchedSend() {
      this.addEventListener("load", function () {
        try {
          inspectBody(
            "xhr",
            this.__materialSourceUrl,
            this.__materialSourceMethod,
            this.status,
            this.responseText,
          );
        } catch (e) {
          console.warn("xhr inspect failed", this.__materialSourceUrl, e);
        }
      });
      return originalSend.apply(this, arguments);
    };
  }

  window.__scanMaterialDom = function scanMaterialDom() {
    const matches = [];
    document.querySelectorAll("body *").forEach((el) => {
      const text = el.innerText || el.textContent || "";
      if (!containsMaterial(text)) return;
      const rect = el.getBoundingClientRect();
      matches.push({
        tag: el.tagName,
        id: el.id,
        className: el.className,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        },
        text: snippet(text),
        element: el,
      });
    });
    matches.sort((a, b) => a.text.length - b.text.length);
    console.table(
      matches.slice(0, 20).map((m) => ({
        tag: m.tag,
        id: m.id,
        className: String(m.className).slice(0, 80),
        w: m.rect.w,
        h: m.rect.h,
        text: m.text.slice(0, 120),
      })),
    );
    return matches;
  };

  window.__dumpMaterialSourceResults = function dumpMaterialSourceResults() {
    console.table(
      results.map((r) => ({
        kind: r.kind,
        method: r.method,
        status: r.status,
        url: r.url,
        path: r.path,
        snippet: String(r.snippet || "").slice(0, 160),
      })),
    );
    return results;
  };

  window.__materialSourceResults = results;

  console.log(
    "%cMaterial source finder installed.",
    "color:#0a7;font-weight:bold",
  );
  console.log(
    "现在点击/刷新题目 1.1；若有接口返回材料，会打印 [MATERIAL SOURCE MATCH]。",
  );
  console.log(
    "如果没有接口命中，运行 __scanMaterialDom() 查看材料当前在哪个 DOM 节点。",
  );
})();
