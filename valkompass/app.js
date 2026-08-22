(function () {
  var partyQuestions = window.partyQuestions;
  var glossary = window.glossary || {};
  var BATCH = 10;

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

  var STORAGE_KEY = "valkompass_results_v2";
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
  var currentQueue = [];
  var answers = [];
  var status = [];
  var allAnswers = [];
  var totalAnswered = 0;
  var answeredIds = {};
  var markers = {};
  var lastRanked = [];

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
      return '<span class="term" data-term="' + escapeHtml(term) + '" data-def="' + escapeHtml(explanation) + '">' + escapeHtml(term) + "</span>";
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

  function partyBankCount(pid) {
    var bank = (partyQuestions && partyQuestions[pid]) || [];
    return bank.length;
  }

  function persistProgress() {
    if (!chosenParty) return;
    var prev = getSaved(chosenParty.id) || {};
    saveResult(chosenParty.id, {
      answered: totalAnswered,
      allAnswers: allAnswers,
      ranked: lastRanked && lastRanked.length ? lastRanked : prev.ranked || null,
      date: new Date().toISOString()
    });
  }

  function loadPartyState(party) {
    chosenParty = party;
    var saved = getSaved(party.id);
    allAnswers = (saved && saved.allAnswers) ? saved.allAnswers.slice() : [];
    totalAnswered = (saved && saved.answered) || allAnswers.length || 0;
    answeredIds = {};
    allAnswers.forEach(function (a) {
      if (a && a.id) answeredIds[a.id] = true;
    });
    lastRanked = (saved && saved.ranked) || [];
  }

  function startFresh(party) {
    if (!partyQuestions) {
      alert("Fr\u00e5gorna har inte laddats. Ladda om sidan.");
      return;
    }
    chosenParty = party;
    allAnswers = [];
    totalAnswered = 0;
    answeredIds = {};
    lastRanked = [];
    persistProgress();
    var bank = (partyQuestions && partyQuestions[party.id]) || [];
    if (!bank.length) {
      alert("Inga fr\u00e5gor finns \u00e4nnu f\u00f6r detta parti.");
      return;
    }
    startBatch();
  }

  function resumeParty(party) {
    if (!partyQuestions) {
      alert("Fr\u00e5gorna har inte laddats. Ladda om sidan.");
      return;
    }
    loadPartyState(party);
    var bank = (partyQuestions && partyQuestions[party.id]) || [];
    if (!bank.length) {
      alert("Inga fr\u00e5gor finns \u00e4nnu f\u00f6r detta parti.");
      return;
    }
    if (!remainingQuestions().length) {
      showResults();
      return;
    }
    startBatch();
  }

  function openSavedResults(party) {
    loadPartyState(party);
    showResults();
  }

  function renderPartyList() {
    var partyList = document.getElementById("party-list");
    partyList.innerHTML = "";
    var saved = loadSaved();
    parties.forEach(function (p) {
      var isSelected = chosenParty && chosenParty.id === p.id;
      var row = document.createElement("div");
      row.className = "party-btn" + (isSelected ? " active" : "");
      row.setAttribute("role", "button");
      row.tabIndex = 0;

      var left = document.createElement("span");
      left.className = "name-wrap";
      var nameText = document.createElement("span");
      nameText.textContent = p.name;
      left.appendChild(nameText);
      if (saved[p.id] && (saved[p.id].answered || 0) > 0) {
        var check = document.createElement("span");
        check.className = "check";
        check.textContent = " \u2713";
        check.title = "Sparat resultat";
        left.appendChild(check);
      }

      var answered = (saved[p.id] && saved[p.id].answered) || 0;
      var total = partyBankCount(p.id) || 10;
      var prog = document.createElement("span");
      prog.className = "prog";
      prog.textContent = answered + "/" + total;

      row.appendChild(left);

      if (isSelected) {
        var wrap = document.createElement("span");
        wrap.className = "row-actions";
        var ans = answered;
        if (ans === 0) {
          var b = document.createElement("button");
          b.className = "row-action";
          b.type = "button";
          b.textContent = "Starta";
          b.onclick = function (e) { e.stopPropagation(); startFresh(p); };
          wrap.appendChild(b);
        } else {
          if (ans < total) {
            var b2 = document.createElement("button");
            b2.className = "row-action";
            b2.type = "button";
            b2.textContent = "Forts\u00e4tt";
            b2.onclick = function (e) { e.stopPropagation(); resumeParty(p); };
            wrap.appendChild(b2);
          }
          if (ans >= 5) {
            var b3 = document.createElement("button");
            b3.className = "row-action secondary";
            b3.type = "button";
            b3.textContent = "Resultat";
            b3.onclick = function (e) { e.stopPropagation(); openSavedResults(p); };
            wrap.appendChild(b3);
          }
        }
        row.appendChild(wrap);
      } else {
        row.appendChild(prog);
      }

      row.onclick = function () {
        if (chosenParty && chosenParty.id === p.id) {
          chosenParty = null;
          Object.keys(markers).forEach(function (id) { markers[id].classList.remove("selected"); });
          renderPartyList();
        } else {
          selectParty(p);
        }
      };
      partyList.appendChild(row);
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
    if (markers[party.id]) markers[party.id].classList.add("selected");
    infoPopup.classList.add("hidden");
    renderPartyList();
  }

  function getPartyBank() {
    return (partyQuestions && chosenParty && partyQuestions[chosenParty.id]) || [];
  }

  function remainingQuestions() {
    var bank = getPartyBank();
    return bank.filter(function (q) { return q.id && !answeredIds[q.id]; });
  }

  function startBatch() {
    var left = remainingQuestions();
    if (!left.length) {
      alert("Inga fler fr\u00e5gor f\u00f6r detta parti just nu.");
      showResults();
      return;
    }
    var batch = shuffle(left).slice(0, BATCH);
    currentQueue = batch;
    answers = [];
    status = [];
    for (var i = 0; i < currentQueue.length; i++) { answers.push(null); status.push("unseen"); }
    currentQ = 0;
    status[0] = "skipped";
    setSubtitle("Testar hur v\u00e4l dina \u00e5sikter st\u00e4mmer \u00f6verens med " + chosenParty.name);
    document.getElementById("step-party").classList.add("hidden");
    document.getElementById("step-continue").classList.add("hidden");
    document.getElementById("step-results").classList.add("hidden");
    document.getElementById("step-questions").classList.remove("hidden");
    buildSegments();
    showQuestion();
  }

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
    else finishBatch();
  };

  function allBatchAnswered() {
    for (var i = 0; i < answers.length; i++) {
      if (answers[i] === null) return false;
    }
    return answers.length > 0;
  }

  function finishBatch() {
    if (!allBatchAnswered()) {
      alert("Svara p\u00e5 alla " + currentQueue.length + " fr\u00e5gor i den h\u00e4r omg\u00e5ngen, eller tryck Till start f\u00f6r att spara och l\u00e4mna.");
      for (var i = 0; i < answers.length; i++) {
        if (answers[i] === null) { jumpTo(i); break; }
      }
      return;
    }
    persistProgress();
    var left = remainingQuestions().length;
    document.getElementById("step-questions").classList.add("hidden");
    if (left > 0) {
      document.getElementById("continue-text").textContent =
        "Du har svarat p\u00e5 " + totalAnswered + " fr\u00e5gor om " + chosenParty.name +
        ". Det finns " + left + " fr\u00e5gor kvar f\u00f6r detta parti.";
      document.getElementById("btn-continue").style.display = "";
      document.getElementById("step-continue").classList.remove("hidden");
    } else {
      showResults();
    }
  }

  document.getElementById("btn-continue").onclick = function () {
    startBatch();
  };
  document.getElementById("btn-see-results").onclick = function () {
    if (totalAnswered < 5) {
      alert("Svara p\u00e5 minst 5 fr\u00e5gor innan du kan se resultat.");
      return;
    }
    showResults();
  };
  document.getElementById("btn-continue-from-results").onclick = function () {
    var left = remainingQuestions().length;
    if (!left) {
      alert("Inga fler fr\u00e5gor f\u00f6r detta parti just nu.");
      return;
    }
    startBatch();
  };

  document.getElementById("btn-save-exit").onclick = function () {
    persistProgress();
    chosenParty = null;
    Object.keys(markers).forEach(function (id) { markers[id].classList.remove("selected"); });
    document.getElementById("step-results").classList.add("hidden");
    document.getElementById("step-party").classList.remove("hidden");
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
    lastRanked = [];
    startBatch();
  };

  function updateEarlyResultsBtn() {
    var btn = document.getElementById("btn-early-results");
    if (!btn) return;
    var seen = 0;
    for (var i = 0; i < status.length; i++) {
      if (status[i] === "answered" || status[i] === "skipped") seen++;
    }
    var ok = totalAnswered >= 5 && (totalAnswered >= 10 || seen >= 10);
    btn.disabled = !ok;
  }

  var btnToStart = document.getElementById("btn-to-start");
  if (btnToStart) {
    btnToStart.onclick = function () {
      persistProgress();
      chosenParty = null;
      Object.keys(markers).forEach(function (id) { markers[id].classList.remove("selected"); });
      document.getElementById("step-questions").classList.add("hidden");
      document.getElementById("step-continue").classList.add("hidden");
      document.getElementById("step-results").classList.add("hidden");
      document.getElementById("step-party").classList.remove("hidden");
      setSubtitle("Testa om du verkligen st\u00e4mmer med partiet du tror");
      renderPartyList();
    };
  }
  var btnEarly = document.getElementById("btn-early-results");
  if (btnEarly) {
    btnEarly.onclick = function () {
      if (btnEarly.disabled || totalAnswered < 5) return;
      persistProgress();
      showResults();
    };
  }

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
    document.getElementById("phase-info").textContent =
      "Fr\u00e5ga " + (currentQ + 1) + " av " + currentQueue.length +
      " \u00b7 totalt besvarade: " + totalAnswered +
      " (" + chosenParty.name + ")";
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
    updateEarlyResultsBtn();
  }

  function selectAnswer(scores, btnEl) {
    answers[currentQ] = scores;
    status[currentQ] = "answered";
    var q = currentQueue[currentQ];
    var qid = q && q.id ? q.id : ("x-" + currentQ);
    if (!answeredIds[qid]) {
      answeredIds[qid] = true;
      allAnswers.push({ id: qid, scores: scores });
      totalAnswered++;
    } else {
      for (var ai = 0; ai < allAnswers.length; ai++) {
        if (allAnswers[ai].id === qid) { allAnswers[ai].scores = scores; break; }
      }
    }
    persistProgress();
    var btns = document.querySelectorAll("#options button");
    for (var i = 0; i < btns.length; i++) btns[i].classList.remove("selected");
    btnEl.classList.add("selected");
    updateSegments();
    updateEarlyResultsBtn();
    setTimeout(function () {
      if (currentQ < currentQueue.length - 1) jumpTo(currentQ + 1);
      else finishBatch();
    }, 280);
  }

  function buildExplanation(chosenMatch, topMatch) {
    if (!chosenMatch || !topMatch) return "";
    if (chosenMatch.id === topMatch.id) {
      return "Du valde " + chosenMatch.name + " och matchar det partiet b\u00e4st (" + chosenMatch.match + "%). Din sj\u00e4lvbild st\u00e4mmer v\u00e4l med dina svar.";
    }
    return "Du valde " + chosenMatch.name + " (" + chosenMatch.match + "%), men dina svar matchar " +
      topMatch.name + " b\u00e4ttre (" + topMatch.match + "%). " +
      "Tips: g\u00f6r \u00e4ven " + topMatch.name + "s test f\u00f6r att j\u00e4mf\u00f6ra.";
  }

  function showResults() {
    hideTermPopup();
    document.getElementById("step-party").classList.add("hidden");
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
    lastRanked = ranked;

    var chosenMatch = null;
    for (var i = 0; i < ranked.length; i++) {
      if (ranked[i].id === chosenParty.id) { chosenMatch = ranked[i]; break; }
    }
    var topMatch = ranked[0];

    saveResult(chosenParty.id, {
      answered: totalAnswered,
      match: chosenMatch ? chosenMatch.match : 0,
      allAnswers: allAnswers,
      ranked: ranked.map(function (r) { return { id: r.id, name: r.name, match: r.match }; }),
      date: new Date().toISOString()
    });

    document.getElementById("chosen-summary").textContent =
      "Du valde " + chosenParty.name + ". Matchning: " + (chosenMatch ? chosenMatch.match : 0) + "%\nBesvarade fr\u00e5gor: " + totalAnswered;

    var expl = buildExplanation(chosenMatch, topMatch);
    var explEl = document.getElementById("result-explanation");
    if (explEl) explEl.textContent = expl;

    var left = remainingQuestions().length;
    var contBtn = document.getElementById("btn-continue-from-results");
    if (contBtn) contBtn.style.display = left > 0 ? "" : "none";

    var list = document.getElementById("results-list");
    list.innerHTML = "";
    ranked.forEach(function (r) {
      var div = document.createElement("div");
      div.className = "result-item";
      var nameSpan = document.createElement("span");
      nameSpan.textContent = r.name;
      if (r.id === chosenParty.id) nameSpan.textContent += " (ditt val)";
      var matchSpan = document.createElement("span");
      matchSpan.className = "match" + (r.match < 40 ? " low" : "");
      matchSpan.textContent = r.match + "%";
      div.appendChild(nameSpan);
      div.appendChild(matchSpan);
      list.appendChild(div);
    });
  }

  function shareText() {
    if (!chosenParty || !lastRanked.length) return "";
    var chosenMatch = null;
    for (var i = 0; i < lastRanked.length; i++) {
      if (lastRanked[i].id === chosenParty.id) { chosenMatch = lastRanked[i]; break; }
    }
    var top = lastRanked[0];
    return buildExplanation(chosenMatch, top) +
      "\n\nBesvarade fr\u00e5gor: " + totalAnswered +
      "\nTesta sj\u00e4lv: https://taxikit.shop/valkompass";
  }
  function openShare(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  }
  var btnX = document.getElementById("btn-share-x");
  if (btnX) btnX.onclick = function () {
    var t = shareText();
    if (!t) return;
    openShare("https://twitter.com/intent/tweet?text=" + encodeURIComponent(t));
  };
  var btnWa = document.getElementById("btn-share-wa");
  if (btnWa) btnWa.onclick = function () {
    var t = shareText();
    if (!t) return;
    openShare("https://wa.me/?text=" + encodeURIComponent(t));
  };
  var btnFb = document.getElementById("btn-share-fb");
  if (btnFb) btnFb.onclick = function () {
    openShare("https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent("https://taxikit.shop/valkompass"));
  };
  var btnCopy = document.getElementById("btn-share-copy");
  if (btnCopy) btnCopy.onclick = function () {
    var t = shareText();
    if (!t) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () {
        btnCopy.textContent = "Kopierat!";
        setTimeout(function () { btnCopy.textContent = "Kopiera"; }, 1500);
      });
    } else {
      prompt("Kopiera texten:", t);
    }
  };
})();
