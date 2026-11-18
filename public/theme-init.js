try {
  var t = JSON.parse(localStorage.getItem('tempo_prefs_v1') || '{}').theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) {}
