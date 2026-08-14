// Mobile nav toggle + subtle scroll state for the header.
(function () {
  var nav = document.querySelector('.nav');
  var toggle = document.querySelector('.nav-toggle');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.getAttribute('data-open') === 'true';
      nav.setAttribute('data-open', String(!open));
      toggle.setAttribute('aria-expanded', String(!open));
    });
    // close menu when a link is tapped
    nav.querySelectorAll('.nav-links a').forEach(function (a) {
      a.addEventListener('click', function () { nav.setAttribute('data-open', 'false'); });
    });
  }

  // Highlight the current page in the nav.
  var path = location.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  document.querySelectorAll('.nav-links a').forEach(function (a) {
    var href = a.getAttribute('href').replace(/\.html$/, '').replace(/\/index$/, '/');
    if (href === path || (href !== '/' && path.indexOf(href) === 0)) a.classList.add('active');
  });
})();
