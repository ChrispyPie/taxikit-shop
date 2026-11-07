    async function loadData() {
      if (!currentUserId) {
        location.href = 'index.html';
        return;
      }
      if (!getToken()) {
        location.href = 'index.html';
        return;
      }
      // Måste föraren välja nytt lösenord? Då gäller det först (sköts i index.html)
      try {
        const me = await rpc('get_me');
        if (me && me.must_change_password) { location.href = 'index.html'; return; }
        if (window.DEMO) { DEMO.set(me); DEMO.banner(); }
      } catch (e) {}
      if (window.PROFILBILD) {
        const pm = document.getElementById('profile-menu');
        PROFILBILD.init({ button: document.getElementById('profile-btn'), menu: pm, before: pm.lastElementChild, itemStyle: 'padding:8px; cursor:pointer;' });
      }
      let denied = false;
      try {
        await reloadDrivers();
      } catch (e) { console.error(e); denied = true; }

      if (denied || !hasAdminAccess()) {
        document.getElementById('access-denied').style.display = 'block';
        document.getElementById('admin-app').style.display = 'none';
        return;
      }
      // admin.html#bilar öppnar Bilar direkt (länk från Åkeridata)
      const mt = /^#message=(\d+)$/.exec(location.hash);
      if (mt && canSeeCases()) { history.replaceState(null, '', location.pathname); openMenu('arenden'); ARENDEN_ADMIN.openThread(+mt[1]); return; }
      if (location.hash === '#arenden' && canSeeCases()) { history.replaceState(null, '', location.pathname); openMenu('arenden'); return; }
      if (location.hash === '#onskemal' && canSeeCases()) { history.replaceState(null, '', location.pathname); openMenu('onskemal'); return; }
      if (location.hash === '#bilar' && canSeeAkeridata()) { history.replaceState(null, '', location.pathname); openMenu('bilar'); return; }
      // admin.html#verkstad öppnar Bil & verkstad (verkstadstimmar) direkt (länk från förarappen)
      if (location.hash === '#loner' && canSeeAkeridata()) { history.replaceState(null, '', location.pathname); openMenu('loner'); return; }
      if (location.hash === '#verkstad' && canSeeAkeridata()) { history.replaceState(null, '', location.pathname); openMenu('arenden'); return; }
      // admin.html#arende=issue:12 öppnar ett ärende i Ärenden (länk från klockan i förarappen)
      const arm = /^#arende=(issue|maint|wh|task|sjuk|wish)(?::|%3A)(\d+)$/.exec(location.hash);
      if (arm && canSeeCases()) { history.replaceState(null, '', location.pathname); ARENDEN_ADMIN.openCase(arm[1], arm[2]); openMenu('arenden'); return; }
      render();
      // Antal verkstadstider som väntar på beslut visas på rutan
      if (canSeeAkeridata()) VERKSTAD_ADMIN.count().then(() => { if (!path.length) render(); });
      // Antal personligt olästa ärenden visas på Ärenden-rutan
      if (canSeeCases()) ARENDEN_ADMIN.refresh().then(() => { if (!path.length) render(); });
    }
