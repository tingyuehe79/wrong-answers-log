/*
 * 在兰鲸微课考试/错题结果页的浏览器控制台运行。
 *
 * 作用：
 * 1. 继续调用 /exam/get_question_info/ 抓取题目、选项、答案、解析。
 * 2. 逐题点击答题卡题号，从当前页面 DOM 里截取小题题干前面的资料原文。
 * 3. 导出带 materialText/materialImages 字段的 JSON。
 *
 * 如果导出的 materialText 为空，说明页面 DOM 结构和选择器不匹配。
 * 先在控制台运行 __debugCurrentQuestionMaterial()，把输出发给我再调选择器。
 */
(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const stripHtml = (value) => {
    const div = document.createElement("div");
    div.innerHTML = String(value || "").replace(
      /<script[\s\S]*?<\/script>/gi,
      "",
    );
    div.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    div.querySelectorAll("p,div,li").forEach((el) => el.append("\n"));
    return div.textContent.replace(/\n{3,}/g, "\n\n").trim();
  };

  const normalizeText = (value) =>
    String(value || "")
      .replace(/&nbsp;/g, " ")
      .replace(/[—–－~～-]/g, "-")
      .replace(/[，。；：、,.?:;!！“”"‘’'（）()【】\[\]{}<>《》]/g, "")
      .replace(/\s+/g, "")
      .toLowerCase();

  const anchorText = (value, maxLen = 28) => normalizeText(value).slice(0, maxLen);

  const extractImages = (root) =>
    Array.from(root.querySelectorAll("img[src]"))
      .map((img) => img.getAttribute("src"))
      .filter(Boolean);

  const unique = (arr) => [...new Set(arr.filter(Boolean))];

  function visibleText(el) {
    if (!el) return "";
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return "";
    return el.innerText || el.textContent || "";
  }

  function findLikelyQuestionContainer(anchors) {
    const candidates = Array.from(
      document.querySelectorAll(
        [
          ".question",
          ".question-box",
          ".questionBox",
          ".question-content",
          ".questionContent",
          ".topic",
          ".topic-content",
          ".exam-question",
          ".ksx-ue-question",
          ".content",
          ".paper-content",
          ".main",
          "body",
        ].join(","),
      ),
    );

    const matches = candidates
      .map((el) => ({ el, text: visibleText(el) }))
      .filter((item) => {
        const haystack = normalizeText(item.text);
        return anchors.some((needle) => needle && haystack.includes(needle));
      });

    if (!matches.length) return document.body;
    matches.sort((a, b) => a.text.length - b.text.length);
    return matches[0].el;
  }

  function findAnchorIndexInNormalizedText(fullText, anchors) {
    const normalizedFull = normalizeText(fullText);
    return anchors
      .map((needle) => normalizedFull.indexOf(needle))
      .filter((idx) => idx > 0)
      .sort((a, b) => a - b)[0];
  }

  function cleanupMaterialText(text) {
    const lines = String(text || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => {
        if (/^(答题卡|上一题|下一题|交卷|收藏|解析|正确答案|我的答案|题目列表)$/.test(line)) {
          return false;
        }
        if (/^[A-D][.、．\s]/.test(line)) return false;
        return true;
      });

    let cleaned = lines.join("\n").trim();
    cleaned = cleaned
      .replace(/^([\d.]+|第[一二三四五六七八九十]+题)\s*/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // 如果截到了大量页面导航文本，通常真正材料在最后一段，优先保留靠近小题的部分。
    if (cleaned.length > 2500) {
      cleaned = cleaned.slice(-2500).trim();
    }
    return cleaned;
  }

  function isMostlyQuestionOrOptionText(text, anchors) {
    const normalized = normalizeText(text);
    if (!normalized) return true;
    if (anchors.some((needle) => needle && normalized === needle)) return true;
    if (anchors.some((needle) => needle && normalized.includes(needle) && normalized.length < needle.length + 24)) {
      return true;
    }
    return false;
  }

  function candidateBlockElements() {
    const selectors = [
      "article",
      "section",
      ".article",
      ".material",
      ".materials",
      ".stem",
      ".question-stem",
      ".questionStem",
      ".question-material",
      ".questionMaterial",
      ".content",
      ".paper-content",
      ".topic-content",
      ".exam-content",
      ".exam-question",
      ".question",
      "p",
      "div",
    ];
    return Array.from(document.querySelectorAll(selectors.join(","))).filter((el) => {
      const text = visibleText(el).trim();
      if (text.length < 20) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      return true;
    });
  }

  function removeQuestionAndUiLines(text, q, anchors) {
    const optionTexts = [q.answer1, q.answer2, q.answer3, q.answer4]
      .map(stripHtml)
      .filter(Boolean);
    const questionText = stripHtml(q.question);
    const bannedNormalized = [
      questionText,
      ...optionTexts,
      "正确答案",
      "你的答案",
      "解析",
      "上一题",
      "下一题",
      "答题卡",
      "交卷",
      "收藏",
      "查看解析",
      "全部解析",
    ].map((x) => normalizeText(x));

    return String(text || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => {
        const n = normalizeText(line);
        if (!n) return false;
        if (/^[A-D][.、．\s]/.test(line)) return false;
        if (/^(A|B|C|D)$/.test(line)) return false;
        if (/^\d+\s*\/\s*\d+$/.test(line)) return false;
        if (bannedNormalized.some((ban) => ban && (n === ban || n.includes(ban) || ban.includes(n)))) {
          return false;
        }
        if (anchors.some((anchor) => anchor && (n === anchor || (n.includes(anchor) && n.length < anchor.length + 30)))) {
          return false;
        }
        return true;
      })
      .join("\n")
      .trim();
  }

  function extractByWholePageDifference(q, anchors) {
    const candidates = [];

    candidateBlockElements().forEach((el) => {
      const raw = visibleText(el);
      const text = cleanupMaterialText(removeQuestionAndUiLines(raw, q, anchors));
      if (text.length < 30) return;
      if (isMostlyQuestionOrOptionText(text, anchors)) return;

      const normalized = normalizeText(text);
      const hasQuestionAnchor = anchors.some((needle) => needle && normalizeText(raw).includes(needle));
      const rect = el.getBoundingClientRect();
      candidates.push({
        text,
        score:
          text.length +
          (hasQuestionAnchor ? 80 : 0) +
          (rect.top >= 0 && rect.top < window.innerHeight ? 40 : 0) -
          Math.max(0, normalized.length - 2500) * 0.1,
        source: el.className || el.id || el.tagName,
      });
    });

    const bodyText = cleanupMaterialText(
      removeQuestionAndUiLines(document.body.innerText || "", q, anchors),
    );
    if (bodyText.length >= 30 && !isMostlyQuestionOrOptionText(bodyText, anchors)) {
      candidates.push({
        text: bodyText.length > 3000 ? bodyText.slice(-3000).trim() : bodyText,
        score: Math.min(bodyText.length, 3000) - 120,
        source: "BODY_DIFF",
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || { text: "", source: "NO_DIFF_CANDIDATE" };
  }

  function extractMaterialFromCurrentDom(q) {
    const anchors = unique(
      [
        anchorText(stripHtml(q.question), 36),
        anchorText(q.answer1, 18),
        anchorText(q.answer2, 18),
        anchorText(q.answer3, 18),
        anchorText(q.answer4, 18),
      ].filter((x) => x && x.length >= 2),
    );
    const container = findLikelyQuestionContainer(anchors);
    const text = visibleText(container);
    const idx = findAnchorIndexInNormalizedText(text, anchors);

    let materialText = "";
    if (Number.isFinite(idx) && idx > 0) {
      // 用原始文本按近似位置截断，避免中文空白归一化后下标不一致导致切太多。
      const ratio = idx / Math.max(normalizeText(text).length, 1);
      materialText = text.slice(0, Math.floor(text.length * ratio)).trim();
    }

    materialText = cleanupMaterialText(materialText);
    let method = "before_anchor";

    if (!materialText || isMostlyQuestionOrOptionText(materialText, anchors)) {
      const diff = extractByWholePageDifference(q, anchors);
      materialText = diff.text;
      method = "whole_page_diff:" + diff.source;
    }

    return {
      materialText,
      materialImages: unique(extractImages(container)),
      debugAnchors: anchors,
      debugContainerClass: container.className || container.id || container.tagName,
      debugMethod: method,
    };
  }

  window.__debugCurrentQuestionMaterial = () => {
    const text = document.body.innerText || "";
    const chunks = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 80);
    console.log(chunks.join("\n"));
    return chunks;
  };

  async function waitForQuestionVisible(q, timeout = 2000) {
    const anchors = unique(
      [
        anchorText(stripHtml(q.question), 36),
        anchorText(q.answer1, 18),
        anchorText(q.answer2, 18),
        anchorText(q.answer3, 18),
        anchorText(q.answer4, 18),
      ].filter((x) => x && x.length >= 2),
    );
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const page = normalizeText(document.body.innerText || "");
      if (anchors.some((needle) => page.includes(needle))) return true;
      await sleep(100);
    }
    return false;
  }

  const numberCards = Array.from(
    document.querySelectorAll("#numberCardModal .iconBox"),
  ).filter((el) => el.getAttribute("questionsid"));

  const ids = unique(numberCards.map((el) => el.getAttribute("questionsid")));
  console.log("共找到题目数:", ids.length);
  if (!ids.length) {
    console.warn("没有找到 #numberCardModal .iconBox，请先打开答题卡/题号面板。");
    return;
  }

  const batchSize = 50;
  let allQuestions = [];
  const failedBatches = [];

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const body =
      "examResultsId=" +
      exam_results_id +
      "&testIds=" +
      batch.join(",") +
      "&examInfoId=" +
      exam_info_id;
    try {
      const res = await fetch("/exam/get_question_info/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body,
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const list = Array.isArray(data)
        ? data
        : data.data || data.list || data.result || [];
      if (!Array.isArray(list) || list.length === 0) {
        console.warn("第", i, "批返回异常，原始响应:", data);
      }
      allQuestions = allQuestions.concat(list);
      console.log("接口已获取", allQuestions.length, "/", ids.length);
    } catch (e) {
      console.error("第", i, "批请求失败:", e);
      failedBatches.push(batch);
    }
    await sleep(300);
  }

  const byQuestionId = new Map();
  allQuestions.forEach((q) => {
    [q._id, q.test_id, q.testId, q.id].filter(Boolean).forEach((id) => {
      byQuestionId.set(String(id), q);
    });
  });

  console.log("开始逐题从页面提取资料原文...");
  for (let i = 0; i < numberCards.length; i++) {
    const card = numberCards[i];
    const id = String(card.getAttribute("questionsid"));
    const q = byQuestionId.get(id);
    if (!q) continue;

    card.click();
    await waitForQuestionVisible(q);
    await sleep(120);

    const domMaterial = extractMaterialFromCurrentDom(q);
    q.materialText = domMaterial.materialText;
    q.materialImages = domMaterial.materialImages;
    console.log(
      `DOM ${i + 1}/${numberCards.length}`,
      id,
      "material chars:",
      q.materialText.length,
      "images:",
      q.materialImages.length,
      "container:",
      domMaterial.debugContainerClass,
      "method:",
      domMaterial.debugMethod,
      "anchor:",
      domMaterial.debugAnchors[0],
    );
  }

  const seen = new Set();
  allQuestions = allQuestions.filter((q) => {
    const key = q._id || q.test_id || q.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log("最终题目数:", allQuestions.length, "原始ID数:", ids.length);
  if (failedBatches.length) {
    console.warn("失败批次:", failedBatches);
  }

  const json = JSON.stringify(allQuestions, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "questions_with_materials_" + Date.now() + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  console.log("已触发下载：questions_with_materials_*.json");
})();
