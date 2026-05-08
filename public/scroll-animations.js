/**
 * Instill AI — Advanced Scroll Animation Engine v2
 * Animations: fade-up · clip wipe · split text · counter roll · parallax · magnetic CTA · stagger cascade
 */
(function () {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ─────────────────────────────────────────────
     EASING FUNCTIONS
  ───────────────────────────────────────────── */
  const EASE_OUT_QUART  = 'cubic-bezier(0.25, 1, 0.5, 1)';
  const EASE_OUT_EXPO   = 'cubic-bezier(0.16, 1, 0.3, 1)';
  const EASE_OUT_BACK   = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

  /* ─────────────────────────────────────────────
     HELPERS
  ───────────────────────────────────────────── */
  function inViewport(el) {
    const r = el.getBoundingClientRect();
    return r.top < window.innerHeight && r.bottom > 0;
  }

  function css(el, props) {
    Object.assign(el.style, props);
  }

  function makeTrans(props, dur, ease, delay) {
    return props.map(p => `${p} ${dur}ms ${ease} ${delay}ms`).join(',');
  }

  /* ─────────────────────────────────────────────
     1. CORE FADE-UP REVEAL  (base behaviour)
  ───────────────────────────────────────────── */
  function initFadeUp(el, delay = 0) {
    if (inViewport(el)) return;
    css(el, {
      opacity: '0',
      transform: 'translateY(32px)',
      transition: makeTrans(['opacity', 'transform'], 700, EASE_OUT_EXPO, delay),
      willChange: 'opacity, transform',
    });
    return true;
  }
  function revealFadeUp(el) {
    css(el, { opacity: '1', transform: 'translateY(0)' });
    setTimeout(() => css(el, { willChange: 'auto' }), 820);
  }

  /* ─────────────────────────────────────────────
     2. CLIP-PATH WIPE  (headings)
  ───────────────────────────────────────────── */
  function initClip(el, delay = 0) {
    if (inViewport(el)) return;
    css(el, {
      clipPath: 'inset(0 100% 0 0)',
      transition: `clip-path 900ms ${EASE_OUT_EXPO} ${delay}ms`,
      willChange: 'clip-path',
    });
    return true;
  }
  function revealClip(el) {
    css(el, { clipPath: 'inset(0 0% 0 0)' });
    setTimeout(() => css(el, { willChange: 'auto' }), 1020);
  }

  /* ─────────────────────────────────────────────
     3. SCALE + FADE  (cards)
  ───────────────────────────────────────────── */
  function initScale(el, delay = 0) {
    if (inViewport(el)) return;
    css(el, {
      opacity: '0',
      transform: 'scale(0.94) translateY(20px)',
      transition: makeTrans(['opacity', 'transform'], 650, EASE_OUT_BACK, delay),
      willChange: 'opacity, transform',
    });
    return true;
  }
  function revealScale(el) {
    css(el, { opacity: '1', transform: 'scale(1) translateY(0)' });
    setTimeout(() => css(el, { willChange: 'auto' }), 780);
  }

  /* ─────────────────────────────────────────────
     4. SLIDE-IN FROM LEFT  (numbered items)
  ───────────────────────────────────────────── */
  function initSlideLeft(el, delay = 0) {
    if (inViewport(el)) return;
    css(el, {
      opacity: '0',
      transform: 'translateX(-28px)',
      transition: makeTrans(['opacity', 'transform'], 600, EASE_OUT_QUART, delay),
      willChange: 'opacity, transform',
    });
    return true;
  }
  function revealSlideLeft(el) {
    css(el, { opacity: '1', transform: 'translateX(0)' });
    setTimeout(() => css(el, { willChange: 'auto' }), 720);
  }

  /* ─────────────────────────────────────────────
     5. COUNTER ROLL-UP  (stat numbers)
  ───────────────────────────────────────────── */
  function animateCounter(el) {
    const raw = el.textContent.trim();
    const numMatch = raw.match(/[\d,.]+/);
    if (!numMatch) return;
    const target = parseFloat(numMatch[0].replace(/,/g, ''));
    const prefix = raw.slice(0, numMatch.index);
    const suffix = raw.slice(numMatch.index + numMatch[0].length);
    const isFloat = numMatch[0].includes('.');
    const decimals = isFloat ? numMatch[0].split('.')[1].length : 0;

    let start = null;
    const DURATION = 1400;

    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

    function step(ts) {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / DURATION, 1);
      const val = easeOutCubic(progress) * target;
      el.textContent = prefix + (decimals ? val.toFixed(decimals) : Math.floor(val).toLocaleString()) + suffix;
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ─────────────────────────────────────────────
     6. SPLIT TEXT  (word-by-word stagger on h1)
  ───────────────────────────────────────────── */
  function splitWords(el) {
    if (el.dataset.split) return;
    el.dataset.split = '1';

    // Preserve HTML (spans, em, etc.) — work on text nodes only
    function processNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const words = node.textContent.split(/(\s+)/);
        const frag = document.createDocumentFragment();
        words.forEach(word => {
          if (/^\s+$/.test(word)) {
            frag.appendChild(document.createTextNode(word));
          } else {
            const span = document.createElement('span');
            span.style.cssText = 'display:inline-block;overflow:hidden;vertical-align:bottom;';
            const inner = document.createElement('span');
            inner.className = 'word-inner';
            inner.textContent = word;
            span.appendChild(inner);
            frag.appendChild(span);
          }
        });
        node.parentNode.replaceChild(frag, node);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        Array.from(node.childNodes).forEach(processNode);
      }
    }

    if (!inViewport(el)) {
      Array.from(el.childNodes).forEach(processNode);
    }
  }

  function revealSplitWords(el) {
    const inners = el.querySelectorAll('.word-inner');
    inners.forEach((w, i) => {
      css(w, {
        display: 'inline-block',
        transform: 'translateY(110%)',
        opacity: '0',
      });
      requestAnimationFrame(() => {
        setTimeout(() => {
          css(w, {
            transition: `transform 700ms ${EASE_OUT_EXPO} ${i * 45}ms, opacity 500ms ease ${i * 45}ms`,
            transform: 'translateY(0)',
            opacity: '1',
          });
        }, 30);
      });
    });
  }

  /* ─────────────────────────────────────────────
     7. FEAT-ROW REVEAL  (list rows slide + rule)
  ───────────────────────────────────────────── */
  function initFeatRow(el, delay = 0) {
    if (inViewport(el)) return;
    css(el, {
      opacity: '0',
      transform: 'translateX(-16px)',
      borderBottomColor: 'transparent',
      transition: [
        `opacity 500ms ${EASE_OUT_QUART} ${delay}ms`,
        `transform 500ms ${EASE_OUT_QUART} ${delay}ms`,
        `border-bottom-color 400ms ease ${delay + 200}ms`,
      ].join(','),
      willChange: 'opacity, transform',
    });
    return true;
  }
  function revealFeatRow(el) {
    css(el, { opacity: '1', transform: 'translateX(0)', borderBottomColor: '' });
    setTimeout(() => css(el, { willChange: 'auto' }), 620);
  }

  /* ─────────────────────────────────────────────
     INTERSECTION OBSERVER — main reveal trigger
  ───────────────────────────────────────────── */
  if (reducedMotion) {
    // Still wire up counter if reduced-motion (non-animated version)
    document.querySelectorAll('[data-counter]').forEach(el => animateCounter(el));
    return;
  }

  const pending = new Map(); // el → {type, reveal}

  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const item = pending.get(entry.target);
      if (item) item.reveal(entry.target);
      io.unobserve(entry.target);
      pending.delete(entry.target);
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

  function watch(el, type, reveal, delay) {
    let hidden;
    if (type === 'fadeUp')    hidden = initFadeUp(el, delay);
    if (type === 'clip')      hidden = initClip(el, delay);
    if (type === 'scale')     hidden = initScale(el, delay);
    if (type === 'slideLeft') hidden = initSlideLeft(el, delay);
    if (type === 'featRow')   hidden = initFeatRow(el, delay);
    if (type === 'split') {
      splitWords(el);
      hidden = !inViewport(el);
    }
    if (!hidden) {
      if (type === 'counter') animateCounter(el);
      return;
    }
    pending.set(el, { type, reveal: type === 'counter' ? animateCounter : reveal });
    io.observe(el);
  }

  /* ─────────────────────────────────────────────
     WIRING — what gets which animation
  ───────────────────────────────────────────── */

  // H1 split-word on hero
  document.querySelectorAll('.hero h1').forEach(el => {
    watch(el, 'split', revealSplitWords, 0);
    // Fallback reveal on intersection
    const actualReveal = (target) => revealSplitWords(target);
    pending.set(el, { type: 'split', reveal: actualReveal });
    if (!inViewport(el)) io.observe(el);
  });

  // Section h2 headings — clip wipe
  document.querySelectorAll('.section h2, .why h2, .features h2, .pull h2, .cta-section h2, .pricing-hero h1, .integrations-hero h1, .tools-hero h1').forEach((el, i) => {
    watch(el, 'clip', revealClip, 0);
  });

  // Hero eyebrow + sub + CTA
  [
    ['.hero-eyebrow',  'fadeUp', 0],
    ['.hero-sub',      'fadeUp', 120],
    ['.hero-cta',      'fadeUp', 220],
    ['.hero-visual, .preview-panel', 'scale', 180],
  ].forEach(([sel, type, delay]) => {
    const fn = type === 'scale' ? revealScale : revealFadeUp;
    document.querySelectorAll(sel).forEach(el => watch(el, type, fn, delay));
  });

  // Tools strip
  document.querySelectorAll('.tools-strip').forEach(el => watch(el, 'fadeUp', revealFadeUp, 0));

  // Lede / pull quote
  document.querySelectorAll('.lede-grid > *, .pull blockquote, .pull cite').forEach((el, i) => {
    watch(el, 'fadeUp', revealFadeUp, i * 80);
  });

  // Why-grid cells — slide from left with stagger
  document.querySelectorAll('.why-grid').forEach(parent => {
    parent.querySelectorAll('.why-cell').forEach((el, i) => {
      watch(el, 'slideLeft', revealSlideLeft, i * 100);
    });
  });

  // Feat rows
  document.querySelectorAll('.feat-row').forEach((el, i) => {
    watch(el, 'featRow', revealFeatRow, i * 70);
  });

  // Feature cards — scale-in with stagger
  document.querySelectorAll('.features-grid, .feat-list').forEach(parent => {
    parent.querySelectorAll('.feature-card').forEach((el, i) => {
      watch(el, 'scale', revealScale, i * 90);
    });
  });

  // Steps
  document.querySelectorAll('.steps').forEach(parent => {
    parent.querySelectorAll('.step').forEach((el, i) => {
      watch(el, 'fadeUp', revealFadeUp, i * 90);
    });
  });

  // Use-cases
  document.querySelectorAll('.usecases-grid').forEach(parent => {
    parent.querySelectorAll('.usecase').forEach((el, i) => {
      watch(el, 'scale', revealScale, i * 80);
    });
  });

  // Integrations preview cards
  document.querySelectorAll('.integrations-preview-grid').forEach(parent => {
    parent.querySelectorAll('.integration-preview-card').forEach((el, i) => {
      watch(el, 'scale', revealScale, i * 60);
    });
  });

  // Pricing cards (legacy + current tiers layout)
  document.querySelectorAll('.pricing-grid, .tiers-grid').forEach(parent => {
    parent.querySelectorAll('.pricing-card, .tier-card').forEach((el, i) => {
      watch(el, 'scale', revealScale, i * 100);
    });
  });

  // FAQ
  document.querySelectorAll('.faq-grid').forEach(parent => {
    parent.querySelectorAll('.faq-item').forEach((el, i) => {
      watch(el, 'fadeUp', revealFadeUp, i * 70);
    });
  });

  // Generic section labels + eyebrows
  document.querySelectorAll('.section-label, .section-eyebrow, .eyebrow').forEach(el => {
    watch(el, 'fadeUp', revealFadeUp, 0);
  });

  // Stat cards (admin dashboard)
  document.querySelectorAll('.stats-grid .stat-card').forEach((el, i) => {
    watch(el, 'scale', revealScale, i * 80);
  });

  // Tools page cards
  document.querySelectorAll('.tools-grid .tool-card').forEach((el, i) => {
    watch(el, 'scale', revealScale, i * 70);
  });

  // Setup page cards
  document.querySelectorAll('.setup-grid .setup-card, .prereq-grid .prereq-card').forEach((el, i) => {
    watch(el, 'fadeUp', revealFadeUp, i * 80);
  });

  // Tool intro cards
  document.querySelectorAll('.tools-intro-row .tools-intro-card').forEach((el, i) => {
    watch(el, 'scale', revealScale, i * 100);
  });

  // Ref / data tables rows
  document.querySelectorAll('.ref-table tbody tr, .tbl tbody tr').forEach((el, i) => {
    watch(el, 'fadeUp', revealFadeUp, Math.min(i * 50, 400));
  });

  // CTA section
  document.querySelectorAll('.cta-section > *').forEach((el, i) => {
    watch(el, 'fadeUp', revealFadeUp, i * 80);
  });

  // Generic data-anim attribute for ad-hoc use
  document.querySelectorAll('[data-anim]').forEach(el => {
    const type = el.dataset.anim;
    const delay = parseInt(el.dataset.delay || '0', 10);
    const map = {
      'fade': [revealFadeUp, 'fadeUp'],
      'scale': [revealScale, 'scale'],
      'clip': [revealClip, 'clip'],
      'slide': [revealSlideLeft, 'slideLeft'],
      'counter': [animateCounter, 'counter'],
    };
    if (map[type]) watch(el, map[type][1], map[type][0], delay);
  });

  // Counter elements
  document.querySelectorAll('[data-counter]').forEach(el => {
    watch(el, 'counter', animateCounter, 0);
  });

  /* ─────────────────────────────────────────────
     8. PARALLAX  (hero visual + preview panel)
  ───────────────────────────────────────────── */
  const parallaxEls = Array.from(document.querySelectorAll('.preview-panel, .hero-visual'));

  if (parallaxEls.length) {
    let ticking = false;
    function doParallax() {
      const scrollY = window.scrollY;
      parallaxEls.forEach(el => {
        const rect = el.getBoundingClientRect();
        const center = rect.top + rect.height / 2 - window.innerHeight / 2;
        const shift = center * 0.08;
        el.style.transform = `translateY(${shift}px)`;
      });
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(doParallax); ticking = true; }
    }, { passive: true });
  }

  /* ─────────────────────────────────────────────
     9. MAGNETIC CTA BUTTONS
  ───────────────────────────────────────────── */
  document.querySelectorAll('.btn-signal.btn-lg, .btn-primary.btn-lg').forEach(btn => {
    btn.addEventListener('mousemove', e => {
      const r = btn.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2;
      const y = e.clientY - r.top - r.height / 2;
      btn.style.transform = `translate(${x * 0.18}px, ${y * 0.18}px)`;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transition = `transform 500ms ${EASE_OUT_EXPO}`;
      btn.style.transform = 'translate(0, 0)';
      setTimeout(() => btn.style.transition = '', 500);
    });
  });

  /* ─────────────────────────────────────────────
     10. TYPEWRITER  (preview panel lines on load)
  ───────────────────────────────────────────── */
  const previewLines = document.querySelectorAll('.preview-body .line');
  if (previewLines.length) {
    previewLines.forEach((line, i) => {
      css(line, { opacity: '0', transform: 'translateX(-8px)' });
      setTimeout(() => {
        css(line, {
          transition: `opacity 300ms ease, transform 300ms ${EASE_OUT_QUART}`,
          opacity: '1',
          transform: 'translateX(0)',
        });
      }, 600 + i * 90);
    });
  }

  /* ─────────────────────────────────────────────
     11. TOPBAR SCROLL STATE  (shrink on scroll)
  ───────────────────────────────────────────── */
  const topbar = document.querySelector('.topbar');
  if (topbar) {
    let lastY = 0;
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      if (y > 60) {
        topbar.style.boxShadow = '0 1px 0 var(--rule), 0 4px 24px oklch(0 0 0 / 0.06)';
        topbar.style.backdropFilter = 'blur(20px) saturate(1.4)';
      } else {
        topbar.style.boxShadow = '';
        topbar.style.backdropFilter = '';
      }
      lastY = y;
    }, { passive: true });
  }

})();
