/* Förarens inkorg: Meddelande till admin, Sjuk, Verkstadstimmar. */
(function(){var I=window.INKORG=MAILBOX.create(false,'INKORG');I.id='inkorg';I.title='Meddelanden';var timer;
 I.start=function(){I.refresh();if(!timer)timer=setInterval(function(){if(!document.hidden)I.refresh();},120000);};
 var logout=I.logout;I.logout=function(){clearInterval(timer);timer=null;logout();};
 I.app=function(tab){localStorage.setItem('bil_tab',tab);openItem(VERKSTAD.id);VERKSTAD.openTab(tab);};
})();
