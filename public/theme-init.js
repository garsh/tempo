try {
  var t = JSON.parse(localStorage.getItem('tempo_prefs_v1') || '{}').theme;
  if (t === 'light' || t === 'dark') {
    document.documentElement.dataset.theme = t;
    var color = t === 'dark' ? '#000000' : '#f2f4f9';
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) {
      var m = metas[i];
      var media = m.getAttribute('data-media') || m.getAttribute('media') || '';
      if (!m.hasAttribute('data-media') && media) m.setAttribute('data-media', media);
      m.removeAttribute('media');
      m.content = color;
    }
  }
} catch (e) {}
