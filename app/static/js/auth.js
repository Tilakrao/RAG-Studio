/* RAG Studio — landing page show/hide (no login required for local dev tool) */
(function () {
  function showApp() {
    document.getElementById('landing').style.display = 'none';
    document.getElementById('appShell').style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function goHome() {
    document.getElementById('appShell').style.display = 'none';
    document.getElementById('landing').style.display = 'flex';
    document.body.style.overflow = 'auto';
    window.scrollTo(0, 0);
  }

  document.addEventListener('DOMContentLoaded', function () {
    /* landing is visible by default — allow scrolling */
    document.body.style.overflow = 'auto';

    /* "Launch App" buttons go straight to the app */
    document.querySelectorAll('.js-open-login').forEach(el =>
      el.addEventListener('click', showApp)
    );

    /* sign-out / home buttons return to landing */
    const sob = document.getElementById('signOutBtn');
    if (sob) sob.addEventListener('click', goHome);
    const thb = document.getElementById('topbarHomeBtn');
    if (thb) thb.addEventListener('click', goHome);
  });
})();
