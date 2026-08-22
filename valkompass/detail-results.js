(function () {
  var partyNames = {
    s: "Socialdemokraterna", sd: "Sverigedemokraterna", m: "Moderaterna",
    v: "V\u00e4nsterpartiet", c: "Centerpartiet", kd: "Kristdemokraterna",
    mp: "Milj\u00f6partiet", l: "Liberalerna", nyans: "Partiet Nyans",
    afs: "Alternativ f\u00f6r Sverige", med: "Medborgerlig Samling"
  };

  function findQuestionById(qid) {
    var pq = window.partyQuestions;
    if (!pq || !qid) return null;
    var keys = Object.keys(pq);
    for (var i = 0; i < keys.length; i++) {
      var bank = pq[keys[i]] || [];
      for (var j = 0; j < bank.length; j++) {
        if (bank[j].id === qid) return bank[j];
      }
    }
    return null;
  }

  function plainText(s) {
    return (s || "").replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1");
  }

  function bestOptionForParty(q, partyId) {
    if (!q || !q.options) return null;
    var best = null, bestVal = -99;
    q.options.forEach(function (opt) {
      var v = opt.scores && typeof opt.scores[partyId] === "number" ? opt.scores[partyId] : -99;
      if (v > bestVal) { bestVal = v; best = opt; }
    });
    return best;
  }

  function topOtherParty(scores, excludeId) {
    if (!scores) return null;
    var bestId = null, bestVal = -99;
    Object.keys(scores).forEach(function (id) {
      if (id === excludeId) return;
      var v = scores[id];
      if (typeof v === "number" && v > bestVal) { bestVal = v; bestId = id; }
    });
    if (bestId == null || bestVal < 1) return null;
    return { id: bestId, name: partyNames[bestId] || bestId, val: bestVal };
  }

  function resolveStateFromDom() {
    if (window.__vkState && window.__vkState.chosenParty && window.__vkState.allAnswers) {
      return window.__vkState;
    }
    try {
      var all = JSON.parse(localStorage.getItem("valkompass_results_v2") || "{}");
      var summary = document.getElementById("chosen-summary");
      var text = summary ? summary.textContent || "" : "";
      var pid = null;
      Object.keys(partyNames).forEach(function (id) {
        if (text.indexOf(partyNames[id]) !== -1) pid = id;
      });
      if (pid && all[pid] && all[pid].allAnswers) {
        return {
          allAnswers: all[pid].allAnswers,
          chosenParty: { id: pid, name: partyNames[pid] },
          ranked: all[pid].ranked || null
        };
      }
    } catch (e) {}
    return null;
  }

  function buildNarrative(a, q, chosenParty) {
    var sc = a.scores || a;
    var val = typeof sc[chosenParty.id] === "number" ? sc[chosenParty.id] : 0;
    var userLabel = plainText(a.label || "");
    var partyOpt = bestOptionForParty(q, chosenParty.id);
    var partyLabel = partyOpt ? plainText(partyOpt.label) : "";
    var other = topOtherParty(sc, chosenParty.id);
    var qShort = plainText(q.text);
    if (qShort.length > 110) qShort = qShort.slice(0, 107) + "\u2026";

    var lines = [];
    lines.push(qShort);

    if (userLabel) {
      lines.push("Du svarade i stil med: \u201c" + userLabel + "\u201d.");
    }

    if (val >= 1) {
      lines.push("H\u00e4r \u00e4r du och " + chosenParty.name + " i stort sett \u00f6verens.");
    } else if (val <= -1) {
      if (partyLabel && partyLabel !== userLabel) {
        lines.push(chosenParty.name + " st\u00e5r n\u00e4rmare: \u201c" + partyLabel + "\u201d.");
      } else {
        lines.push("H\u00e4r skiljer du dig tydligt fr\u00e5n " + chosenParty.name + ".");
      }
      if (other && other.val >= 1) {
        lines.push("Ditt svar ligger mer i linje med " + other.name + ".");
      }
    } else {
      lines.push("H\u00e4r \u00e4r du mer neutral gentemot " + chosenParty.name + ".");
      if (other && other.val >= 1) {
        lines.push("Svaret pekar \u00e4nd\u00e5 mer mot " + other.name + ".");
      }
    }

    return { val: val, text: lines.join(" ") };
  }

  function buildDetailedResults() {
    var st = resolveStateFromDom();
    if (!st || !st.chosenParty) return;
    window.__vkState = st;
    var allAnswers = st.allAnswers || [];
    var chosenParty = st.chosenParty;
    var disagreeEl = document.getElementById("detail-disagree");
    var agreeEl = document.getElementById("detail-agree");
    var titleD = document.getElementById("detail-disagree-title");
    var titleA = document.getElementById("detail-agree-title");
    if (!disagreeEl || !agreeEl) return;
    disagreeEl.innerHTML = "";
    agreeEl.innerHTML = "";
    if (titleD) titleD.textContent = "D\u00e4r ni skiljer er \u00e5t";
    if (titleA) titleA.textContent = "D\u00e4r ni \u00e4r \u00f6verens";

    var disagree = [], agree = [], neutral = [];
    allAnswers.forEach(function (a) {
      var q = findQuestionById(a.id);
      if (!q) return;
      var item = buildNarrative(a, q, chosenParty);
      if (item.val <= -1) disagree.push(item);
      else if (item.val >= 1) agree.push(item);
      else neutral.push(item);
    });

    function addItems(list, container, cls) {
      if (!list.length) {
        var empty = document.createElement("p");
        empty.className = "detail-empty";
        empty.textContent = "Inga fr\u00e5gor i den h\u00e4r gruppen \u00e4n.";
        container.appendChild(empty);
        return;
      }
      list.forEach(function (it) {
        var div = document.createElement("div");
        div.className = "detail-item " + cls;
        var body = document.createElement("div");
        body.className = "qtext";
        body.textContent = it.text;
        div.appendChild(body);
        container.appendChild(div);
      });
    }

    addItems(disagree, disagreeEl, "disagree");
    addItems(agree, agreeEl, "agree");
    var neutralEl = document.getElementById("detail-neutral");
    var neutralWrap = document.getElementById("detail-neutral-wrap");
    var titleN = document.getElementById("detail-neutral-title");
    if (neutralEl) neutralEl.innerHTML = "";
    if (titleN) titleN.textContent = "Mer neutralt";
    if (neutralWrap) neutralWrap.style.display = neutral.length ? "" : "none";
    if (neutralEl && neutral.length) addItems(neutral, neutralEl, "neutral");
  }

  function wireDetail() {
    var btn = document.getElementById("btn-detail");
    if (!btn || btn._wired) return;
    btn._wired = true;
    btn.onclick = function (e) {
      e.preventDefault();
      var panel = document.getElementById("detail-panel");
      if (!panel) return;
      var open = panel.classList.toggle("open");
      btn.textContent = open ? "D\u00f6lj detaljer" : "Mer detaljer";
      if (open) buildDetailedResults();
    };
  }

  document.addEventListener("DOMContentLoaded", wireDetail);
  wireDetail();
  window.__vkDetail = {
    wire: wireDetail,
    build: buildDetailedResults,
    reset: function () {
      var panel = document.getElementById("detail-panel");
      if (panel) panel.classList.remove("open");
      var bd = document.getElementById("btn-detail");
      if (bd) bd.textContent = "Mer detaljer";
    }
  };
})();
