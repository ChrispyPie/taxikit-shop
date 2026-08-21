(function () {
  var partyQuestions = window.partyQuestions;
  var glossary = window.glossary || {};

  var parties = [
    { id: "s", name: "Socialdemokraterna", short: "S", pct: "30,3 %", x: 32, y: 48 },
    { id: "sd", name: "Sverigedemokraterna", short: "SD", pct: "20,5 %", x: 78, y: 78 },
    { id: "m", name: "Moderaterna", short: "M", pct: "19,1 %", x: 72, y: 55 },
    { id: "v", name: "V\u00e4nsterpartiet", short: "V", pct: "6,8 %", x: 12, y: 28 },
    { id: "c", name: "Centerpartiet", short: "C", pct: "6,7 %", x: 48, y: 38 },
    { id: "kd", name: "Kristdemokraterna", short: "KD", pct: "5,3 %", x: 70, y: 68 },
    { id: "mp", name: "Milj\u00f6partiet", short: "MP", pct: "5,1 %", x: 22, y: 18 },
    { id: "l", name: "Liberalerna", short: "L", pct: "4,6 %", x: 58, y: 32 },
    { id: "nyans", name: "Partiet Nyans", short: "NY", pct: "0,4 %", x: 38, y: 42 },
    { id: "afs", name: "Alternativ f\u00f6r Sverige", short: "AFS", pct: "0,3 %", x: 88, y: 88 },
    { id: "med", name: "Medborgerlig Samling", short: "MED", pct: "0,2 %", x: 75, y: 45 }
  ];

  var STORAGE_KEY = "valkompass_results_v1";
  function loadSaved() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch (e) { return {}; }
  }
  function saveResult(partyId, data) {
    var all = loadSaved();
    all[partyId] = data;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
  function getSaved(partyId) { return loadSaved()[partyId] || null; }

  var chosenParty = null;
  var currentQ = 0;
  var phase = "specific";
  var currentQueue = [];
  var answers = [];
  var status = [];
  var allAnswers = [];
  var totalAnswered = 0;
  var answeredIds = {};
  var markers = {};

  function shuffle(array) {
    var arr = array.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function setSubtitle(text) {
    document.getElementById("subtitle").textContent = text;
  }
  function escapeHtml(str) {
    var d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }
  function renderQuestionText(raw) {
    return escapeHtml(raw).replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, function (_, term, def) {
      var explanation = def || glossary[term] || glossary[term.toLowerCase()] || "";
      if (!explanation) return term;
      return '<span class="term" data-term="' + escapeHtml(term) + '" data-def="' + escapeHtml(explanation) + '">' + escapeHtml(term) + '</span>';
    });
  }
  function showTermPopup(term, def, anchorEl) {
    var popup = document.getElementById("term-popup");
    document.getElementById("term-title").textContent = term;
    document.getElementById("term-body").textContent = def;
    popup.classList.remove("hidden");
    var rect = anchorEl.getBoundingClientRect();
    var gap = 8;
    var ph = popup.offsetHeight || 80;
    var spaceBelow = window.innerHeight - rect.bottom;
    var top = (spaceBelow < ph + gap + 12 && rect.top > ph + gap + 12) ? rect.top - ph - gap : rect.bottom + gap;
    if (top < 8) top = 8;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, window.innerHeight - ph - 8);
    popup.style.top = top + "px";
    popup.style.bottom = "auto";
  }
  function hideTermPopup() {
    document.getElementById("term-popup").classList.add("hidden");
  }
  document.getElementById("close-term").onclick = function (e) {
    e.stopPropagation();
    hideTermPopup();
  };
  document.addEventListener("click", function (e) {
    var termEl = e.target.closest(".term");
    if (termEl) {
      e.stopPropagation();
      showTermPopup(termEl.getAttribute("data-term"), termEl.getAttribute("data-def"), termEl);
      return;
    }
    var popup = document.getElementById("term-popup");
    if (!popup.classList.contains("hidden") && !popup.contains(e.target)) hideTermPopup();
  });

  var compass = document.getElementById("compass");
  parties.forEach(function (p) {
    var marker = document.createElement("div");
    marker.className = "compass-marker";
    marker.style.left = p.x + "%";
    marker.style.top = p.y + "%";
    marker.textContent = p.short;
    marker.title = p.name;
    marker.onclick = function () { selectParty(p); };
    compass.appendChild(marker);
    markers[p.id] = marker;
  });

  function renderPartyList() {
    var partyList = document.getElementById("party-list");
    partyList.innerHTML = "";
    var saved = loadSaved();
    parties.forEach(function (p) {
      var btn = document.createElement("button");
      btn.className = "party-btn" + (chosenParty && chosenParty.id === p.id ? " active" : "");
      var left = document.createElement("span");
      left.textContent = p.name;
      if (saved[p.id]) {
        var tag = document.createElement("span");
        tag.className = "saved";
        tag.textContent = " \u2713 sparad";
        left.appendChild(tag);
      }
      var right = document.createElement("span");
      right.className = "pct";
      right.textContent = p.pct;
      btn.appendChild(left);
      btn.appendChild(right);
      btn.onclick = function () { selectParty(p); };
      partyList.appendChild(btn);
    });
  }
  renderPartyList();

  var infoBtn = document.getElementById("info-btn");
  var infoPopup = document.getElementById("info-popup");
  infoBtn.onclick = function (e) {
    e.stopPropagation();
    infoPopup.classList.toggle("hidden");
  };
  document.getElementById("close-info").onclick = function () {
    infoPopup.classList.add("hidden");
  };
  document.addEventListener("click", function (e) {
    if (!infoPopup.contains(e.target) && e.target !== infoBtn) infoPopup.classList.add("hidden");
  });

  function selectParty(party) {
    chosenParty = party;
    Object.keys(markers).forEach(function (id) { markers[id].classList.remove("selected"); });
    markers[party.id].classList.add("selected");
    document.getElementById("selected-name").textContent = party.name;
    document.getElementById("selection-panel").classList.remove("hidden");
    infoPopup.classList.add("hidden");
    renderPartyList();
    var saved = getSaved(party.id);
    document.getElementById("btn-start").textContent = saved ? "Visa sparat resultat" : "Starta test";
  }

  document.getElementById("btn-back").onclick = function () {
    chosenParty = null;
    Object.keys(markers).forEach(function (id) { markers[id].classList.remove("selected"); });
    document.getElementById("selection-panel").classList.add("hidden");
    setSubtitle("Testa om du verkligen st\u00e4mmer med partiet du tror");
    renderPartyList();
  };

  document.getElementById("btn-start").onclick = function () {
    if (!chosenParty) return;
    if (!partyQuestions) {
      alert("Fr\u00e5gorna har inte laddats. Ladda om sidan.");
      return;
    }
    var saved = getSaved(chosenParty.id);
    if (saved) {
      allAnswers = saved.allAnswers || [];
      totalAnswered = saved.answered || 0;
      answeredIds = {};
      allAnswers.forEach(function (a) {
        if (a && a.id) answeredIds[a.id] = true;
      });
      showResults();
      return;
    }
    allAnswers = [];
    totalAnswered = 0;
    answeredIds = {};
    phase = "specific";
    var bank = partyQuestions[chosenParty.id] || partyQuestions.sd;
    if (!bank || !bank.length) {
      alert("Inga fr\u00e5gor finns \u00e4nnu f\u00f6r detta parti.");
      return;
    }
    currentQueue = shuffle(bank.slice());
    answers = [];
    status = [];
    for (var i = 0; i < currentQueue.length; i++) { answers.push(null); status.push("unseen"); }
    currentQ = 0;
    status[0] = "skipped";
    setSubtitle("Testar hur v\u00e4l dina \u00e5sikter st\u00e4mmer \u00f6verens med " + chosenParty.name);
    document.getElementById("step-party").classList.add("hidden");
    document.getElementById("step-questions").classList.remove("hidden");
    buildSegments();
    showQuestion();
  };

  function buildSegments() {
    var cont = document.getElementById("segments");
    cont.innerHTML = "";
    for (var i = 0; i < currentQueue.length; i++) {
      (function (idx) {
        var seg = document.createElement("div");
        seg.className = "segment " + status[idx];
        if (idx === currentQ) seg.classList.add("current");
        seg.onclick = function () { jumpTo(idx); };
        cont.appendChild(seg);
      })(i);
    }
  }
  function updateSegments() {
    var segs = document.querySelectorAll("#segments .segment");
    for (var i = 0; i < segs.length; i++) {
      segs[i].className = "segment " + status[i];
      if (i === currentQ) segs[i].classList.add("current");
    }
  }
  function jumpTo(i) {
    if (i < 0 || i >= currentQueue.length) return;
    currentQ = i;
    if (status[i] === "unseen") status[i] = "skipped";
    showQuestion();
  }

  document.getElementById("btn-prev").onclick = function () {
    if (currentQ > 0) jumpTo(currentQ - 1);
  };
  document.getElementById("btn-next").onclick = function () {
    if (currentQ < currentQueue.length - 1) jumpTo(currentQ + 1);
    else finishPhase();
  };
  document.getElementById("btn-finish-early").onclick = function () {
    var answered = 0;
    for (var i = 0; i < answers.length; i++) if (answers[i] !== null) answered++;
    if (answered === 0 && totalAnswered === 0) {
      alert("Svara p\u00e5 minst en fr\u00e5ga f\u00f6rst.");
      return;
    }
    mergeCurrentAnswers();
    showResults();
  };
  document.getElementById("btn-see-results").onclick = function () {
    mergeCurrentAnswers();
    showResults();
  };

  function startMixedPhase() {
    mergeCurrentAnswers();
    phase = "mixed";
    currentQueue = [];
    Object.keys(partyQuestions).forEach(function (pid) {
      var qs = partyQuestions[pid];
      if (!qs || !qs.length) return;
      qs.forEach(function (q) {
        if (q.id && answeredIds[q.id]) return;
        currentQueue.push(q);
      });
    });
    currentQueue = shuffle(currentQueue);
    if (currentQueue.length === 0) {
      alert("Inga fler fr\u00e5gor tillg\u00e4ngliga \u00e4nnu.");
      showResults();
      return;
    }
    answers = [];
    status = [];
    for (var i = 0; i < currentQueue.length; i++) { answers.push(null); status.push("unseen"); }
    currentQ = 0;
    status[0] = "skipped";
    document.getElementById("step-continue").classList.add("hidden");
    document.getElementById("step-results").classList.add("hidden");
    document.getElementById("step-questions").classList.remove("hidden");
    buildSegments();
    showQuestion();
  }
  document.getElementById("btn-continue").onclick = startMixedPhase;
  document.getElementById("btn-continue-from-results").onclick = startMixedPhase;

  document.getElementById("btn-save-exit").onclick = function () {
    chosenParty = null;
    Object.keys(markers).forEach(function (id) { markers[id].classList.remove("selected"); });
    document.getElementById("step-results").classList.add("hidden");
    document.getElementById("step-party").classList.remove("hidden");
    document.getElementById("selection-panel").classList.add("hidden");
    setSubtitle("Testa om du verkligen st\u00e4mmer med partiet du tror");
    renderPartyList();
  };

  document.getElementById("btn-retake").onclick = function () {
    var all = loadSaved();
    delete all[chosenParty.id];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    allAnswers = [];
    totalAnswered = 0;
    answeredIds = {};
    phase = "specific";
    var bank = partyQuestions[chosenParty.id] || partyQuestions.sd;
    currentQueue = shuffle(bank.slice());
    answers = [];
    status = [];
    for (var i = 0; i < currentQueue.length; i++) { answers.push(null); status.push("unseen"); }
    currentQ = 0;
    status[0] = "skipped";
    setSubtitle("Testar hur v\u00e4l dina \u00e5sikter st\u00e4mmer \u00f6verens med " + chosenParty.name);
    document.getElementById("step-results").classList.add("hidden");
    document.getElementById("step-questions").classList.remove("hidden");
    buildSegments();
    showQuestion();
  };

  function showQuestion() {
    hideTermPopup();
    var q = currentQueue[currentQ];
    document.getElementById("question-text").innerHTML = renderQuestionText(q.text);
    var qidEl = document.getElementById("qid-label");
    if (qidEl) {
      qidEl.textContent = q.id || "";
      qidEl.classList.remove("copied");
      qidEl.onclick = function (e) {
        e.stopPropagation();
        if (!q.id) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(q.id).then(function () {
            qidEl.classList.add("copied");
            qidEl.textContent = "kopierad";
            setTimeout(function () {
              qidEl.textContent = q.id;
              qidEl.classList.remove("copied");
            }, 1200);
          });
        }
      };
    }
    if (phase === "specific") {
      document.getElementById("phase-info").textContent =
        "Fr\u00e5ga " + (currentQ + 1) + " av " + currentQueue.length + " (viktiga f\u00f6r " + chosenParty.name + ")";
    } else {
      document.getElementById("phase-info").textContent =
        "Extrafr\u00e5ga " + (currentQ + 1) + " av " + currentQueue.length;
    }
    document.getElementById("btn-prev").disabled = currentQ === 0;
    document.getElementById("btn-next").textContent =
      currentQ === currentQueue.length - 1 ? "Klar \u2192" : "Fram\u00e5t \u2192";
    var optionsDiv = document.getElementById("options");
    optionsDiv.innerHTML = "";
    var shuffled = shuffle(q.options.slice());
    shuffled.forEach(function (opt) {
      var btn = document.createElement("button");
      btn.innerHTML = renderQuestionText(opt.label);
      if (answers[currentQ] && JSON.stringify(answers[currentQ]) === JSON.stringify(opt.scores)) {
        btn.classList.add("selected");
      }
      btn.onclick = function (e) {
        if (e.target.closest(".term")) return;
        selectAnswer(opt.scores, btn);
      };
      optionsDiv.appendChild(btn);
    });
    updateSegments();
  }

  function selectAnswer(scores, btnEl) {
    answers[currentQ] = scores;
    status[currentQ] = "answered";
    var btns = document.querySelectorAll("#options button");
    for (var i = 0; i < btns.length; i++) btns[i].classList.remove("selected");
    btnEl.classList.add("selected");
    updateSegments();
    setTimeout(function () {
      if (currentQ < currentQueue.length - 1) jumpTo(currentQ + 1);
      else finishPhase();
    }, 300);
  }

  function finishPhase() {
    mergeCurrentAnswers();
    if (phase === "specific") {
      document.getElementById("step-questions").classList.add("hidden");
      document.getElementById("step-continue").classList.remove("hidden");
    } else {
      showResults();
    }
  }

  function mergeCurrentAnswers() {
    for (var i = 0; i < answers.length; i++) {
      if (!answers[i]) continue;
      var qid = currentQueue[i] && currentQueue[i].id ? currentQueue[i].id : ("x-" + i);
      if (answeredIds[qid]) continue;
      answeredIds[qid] = true;
      allAnswers.push({ id: qid, scores: answers[i] });
      totalAnswered++;
    }
    for (var j = 0; j < answers.length; j++) answers[j] = null;
  }

  function showResults() {
    hideTermPopup();
    document.getElementById("step-questions").classList.add("hidden");
    document.getElementById("step-continue").classList.add("hidden");
    document.getElementById("step-results").classList.remove("hidden");
    setSubtitle("Resultat f\u00f6r " + chosenParty.name);
    var scores = {};
    parties.forEach(function (p) { scores[p.id] = 0; });
    allAnswers.forEach(function (a) {
      var sc = a.scores || a;
      Object.keys(sc).forEach(function (id) {
        scores[id] = (scores[id] || 0) + sc[id];
      });
    });
    var maxPossible = totalAnswered * 2;
    var ranked = parties.map(function (p) {
      var match = maxPossible === 0 ? 50 : Math.round(((scores[p.id] + maxPossible) / (maxPossible * 2)) * 100);
      return { id: p.id, name: p.name, match: match };
    }).sort(function (a, b) { return b.match - a.match; });
    var chosenMatch = null;
    for (var i = 0; i < ranked.length; i++) {
      if (ranked[i].id === chosenParty.id) { chosenMatch = ranked[i]; break; }
    }
    saveResult(chosenParty.id, {
      answered: totalAnswered,
      match: chosenMatch.match,
      allAnswers: allAnswers,
      ranked: ranked.map(function (r) { return { id: r.id, match: r.match }; }),
      date: new Date().toISOString()
    });
    document.getElementById("chosen-summary").textContent =
      "Du valde " + chosenParty.name + ". Din faktiska matchning: " + chosenMatch.match + "%\nBesvarade fr\u00e5gor: " + totalAnswered;
    var list = document.getElementById("results-list");
    list.innerHTML = "";
    ranked.forEach(function (r) {
      var div = document.createElement("div");
      div.className = "result-item";
      var nameSpan = document.createElement("span");
      nameSpan.textContent = r.name;
      var matchSpan = document.createElement("span");
      matchSpan.className = "match" + (r.match < 40 ? " low" : "");
      matchSpan.textContent = r.match + "%";
      div.appendChild(nameSpan);
      div.appendChild(matchSpan);
      list.appendChild(div);
    });
  }
})();
