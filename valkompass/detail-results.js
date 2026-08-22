(function () {
  var partyNames = {
    s: "Socialdemokraterna", sd: "Sverigedemokraterna", m: "Moderaterna",
    v: "V\u00e4nsterpartiet", c: "Centerpartiet", kd: "Kristdemokraterna",
    mp: "Milj\u00f6partiet", l: "Liberalerna", nyans: "Partiet Nyans",
    afs: "Alternativ f\u00f6r Sverige", med: "Medborgerlig Samling"
  };
  var nameToId = {};
  Object.keys(partyNames).forEach(function (id) { nameToId[partyNames[id]] = id; });

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
  function scoreLabel(s) {
    if (s >= 2) return "St\u00e4mmer starkt";
    if (s === 1) return "St\u00e4mmer delvis";
    if (s === 0) return "Neutralt";
    if (s === -1) return "Skiljer dig delvis";
    return "Skiljer dig tydligt";
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
          chosenParty: { id: pid, name: partyNames[pid] }
        };
      }
    } catch (e) {}
    return null;
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
    var pname = chosenParty.name;
    if (titleD) titleD.textContent = "Skiljer dig fr\u00e5n " + pname;
    if (titleA) titleA.textContent = "St\u00e4mmer med " + pname;
    var disagree = [], agree = [], neutral = [];
    allAnswers.forEach(function (a) {
      var q = findQuestionById(a.id);
      if (!q) return;
      var sc = a.scores || a;
      var val = typeof sc[chosenParty.id] === "number" ? sc[chosenParty.id] : 0;
      var item = { text: q.text, val: val };
      if (val <= -1) disagree.push(item);
      else if (val >= 1) agree.push(item);
      else neutral.push(item);
    });
    function addItems(list, container, cls) {
      if (!list.length) {
        var empty = document.createElement("p");
        empty.className = "detail-empty";
        empty.textContent = "Inga fr\u00e5gor i den h\u00e4r gruppen.";
        container.appendChild(empty);
        return;
      }
      list.forEach(function (it) {
        var div = document.createElement("div");
        div.className = "detail-item " + cls;
        var qt = document.createElement("div");
        qt.className = "qtext";
        qt.textContent = (it.text || "").replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1");
        var meta = document.createElement("div");
        meta.className = "meta";
        meta.textContent = scoreLabel(it.val) + " (" + (it.val > 0 ? "+" : "") + it.val + " f\u00f6r " + pname + ")";
        div.appendChild(qt);
        div.appendChild(meta);
        container.appendChild(div);
      });
    }
    addItems(disagree, disagreeEl, "disagree");
    addItems(agree, agreeEl, "agree");
    var neutralEl = document.getElementById("detail-neutral");
    var neutralWrap = document.getElementById("detail-neutral-wrap");
    var titleN = document.getElementById("detail-neutral-title");
    if (neutralEl) neutralEl.innerHTML = "";
    if (titleN) titleN.textContent = "Neutralt gentemot " + pname;
    if (neutralWrap) neutralWrap.style.display = neutral.length ? "" : "none";
    if (neutralEl && neutral.length) addItems(neutral, neutralEl, "neutral");
  }
  function wireDetail() {
    var btn = document.getElementById("btn-detail");
    if (!btn || btn._wired) return;
    btn._wired = true;
    btn.onclick = function () {
      var panel = document.getElementById("detail-panel");
      if (!panel) return;
      var open = panel.classList.toggle("open");
      btn.textContent = open ? "D\u00f6lj detaljerat resultat" : "Detaljerat resultat";
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
      if (bd) bd.textContent = "Detaljerat resultat";
    }
  };
})();
