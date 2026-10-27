// ============================================
// The loader an agency pastes into its own website
// ============================================
//   <script src="https://<renderer>/embed.js" data-key="…" data-lang="en" async></script>
//   <div data-autoura="tours"></div>                       the tour list
//   <div data-autoura="tour" data-tour="giza-day"></div>   one tour's page
//   <div data-autoura="enquire"></div>                     the enquiry form
//
// Each placeholder becomes a frame showing the block (/embed/{key}/{lang}/…),
// sized to its content by the block's own messages — only messages from this
// renderer's origin are believed. Plain ES5 so any website can load it.

const LOADER = `(function () {
  var me = document.currentScript;
  if (!me) return;
  var origin = new URL(me.src).origin;
  var KEY = /^[A-Za-z0-9]{20,40}$/;
  function mount(el) {
    if (el.getAttribute('data-autoura-mounted')) return;
    var kind = el.getAttribute('data-autoura');
    var key = el.getAttribute('data-key') || me.getAttribute('data-key') || '';
    var lang = el.getAttribute('data-lang') || me.getAttribute('data-lang') || 'en';
    var tour = el.getAttribute('data-tour') || '';
    if (!KEY.test(key) || !/^[a-z]{2}$/.test(lang)) return;
    var path = kind === 'tour' && /^[a-z0-9-]+$/.test(tour) ? 'tours/' + tour : kind === 'enquire' ? 'enquire' : 'tours';
    var f = document.createElement('iframe');
    f.name = 'autoura-' + Math.random().toString(36).slice(2);
    f.src = origin + '/embed/' + key + '/' + lang + '/' + path;
    f.title = el.getAttribute('data-title') || (kind === 'enquire' ? 'Enquiry' : 'Tours');
    f.loading = 'lazy';
    f.setAttribute('scrolling', 'no');
    f.style.cssText = 'width:100%;border:0;display:block;min-height:480px;overflow:hidden;background:transparent';
    el.setAttribute('data-autoura-mounted', '1');
    el.appendChild(f);
  }
  window.addEventListener('message', function (e) {
    if (e.origin !== origin || !e.data || e.data.autoura !== 'height') return;
    var frames = document.getElementsByTagName('iframe');
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].name && frames[i].name === e.data.frame) {
        frames[i].style.height = Math.ceil(Number(e.data.height) || 0) + 'px';
        frames[i].style.minHeight = '0';
      }
    }
  });
  function scan() {
    var els = document.querySelectorAll('[data-autoura]');
    for (var i = 0; i < els.length; i++) mount(els[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
  else scan();
})();
`

export function GET() {
  return new Response(LOADER, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'access-control-allow-origin': '*',
    },
  })
}
