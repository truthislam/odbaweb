/* odba web · GA4 conversion events. Load after the GA4 tag (gtag.js). */
(function () {
  function send(name, params) { if (window.gtag) gtag('event', name, params || {}); }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="tel:"]');
    if (a) send('tap_to_call', { phone_number: a.getAttribute('href').slice(4) });
  });
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f && f.tagName === 'FORM') send('lead_form_submit', { form_id: f.id || f.getAttribute('name') || 'unnamed' });
  }, true);
})();
