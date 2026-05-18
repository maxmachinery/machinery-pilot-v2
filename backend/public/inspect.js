(function machineryPilotInspect() {
  'use strict';

  // ── Field finder (recursive: shadow DOM + same-origin iframes) ────────────
  function findAllFormFields(root) {
    root = root || document;
    var fields = [];
    var selector = 'input, textarea, select';
    var skipTypes = ['hidden', 'submit', 'button', 'reset', 'image', 'file'];

    root.querySelectorAll(selector).forEach(function(el) {
      if (skipTypes.indexOf(el.type) !== -1) return;
      // Skip invisible elements (but not date inputs which may be opacity:0)
      if (el.offsetParent === null && el.type !== 'date' && el.type !== 'datetime-local') return;
      fields.push(extractFieldInfo(el));
    });

    // Walk shadow DOMs
    root.querySelectorAll('*').forEach(function(el) {
      if (el.shadowRoot) {
        fields = fields.concat(findAllFormFields(el.shadowRoot));
      }
    });

    // Walk same-origin iframes
    root.querySelectorAll('iframe').forEach(function(iframe) {
      try {
        if (iframe.contentDocument) {
          fields = fields.concat(findAllFormFields(iframe.contentDocument));
        }
      } catch (e) {
        console.warn('[MP] Skipped cross-origin iframe:', iframe.src);
      }
    });

    return fields;
  }

  // ── Extract all useful attributes from one element ────────────────────────
  function extractFieldInfo(el) {
    var label = findLabel(el);
    var info = {
      tagName:         el.tagName.toLowerCase(),
      type:            el.type || null,
      id:              el.id || null,
      name:            el.name || null,
      className:       el.className || null,
      placeholder:     el.placeholder || null,
      ariaLabel:       el.getAttribute('aria-label') || null,
      ariaLabelledBy:  el.getAttribute('aria-labelledby') || null,
      ariaRequired:    el.getAttribute('aria-required') || null,
      required:        el.required || false,
      readOnly:        el.readOnly || false,
      disabled:        el.disabled || false,
      maxLength:       el.maxLength > 0 ? el.maxLength : null,
      pattern:         el.pattern || null,
      inputMode:       el.getAttribute('inputmode') || null,
      label:           label || null,
      value:           el.value || null,
      cssSelector:     getRobustSelector(el),
      dataAttributes:  extractDataAttributes(el),
      bounds:          getBounds(el),
    };

    if (el.tagName === 'SELECT') {
      info.options = Array.from(el.options).map(function(o) {
        return { value: o.value, text: o.text, selected: o.selected };
      });
    }

    if (el.type === 'date' || el.type === 'datetime-local') {
      info.dateFormat = el.type === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm';
    }

    return info;
  }

  // ── Label resolution (6 strategies, most → least reliable) ───────────────
  function findLabel(el) {
    // 1. <label for="id">
    if (el.id) {
      try {
        var root = el.getRootNode();
        var lbl = root.querySelector ? root.querySelector('label[for="' + CSS.escape(el.id) + '"]') : null;
        if (lbl) return lbl.textContent.trim().replace(/[\*:]\s*$/, '').trim();
      } catch (e) {}
    }

    // 2. Ancestor <label>
    var parentLabel = el.closest('label');
    if (parentLabel) {
      var clone = parentLabel.cloneNode(true);
      clone.querySelectorAll('input, textarea, select').forEach(function(c) { c.remove(); });
      return clone.textContent.trim().replace(/[\*:]\s*$/, '').trim();
    }

    // 3. aria-labelledby
    var lblById = el.getAttribute('aria-labelledby');
    if (lblById) {
      var lblEl = document.getElementById(lblById);
      if (lblEl) return lblEl.textContent.trim();
    }

    // 4. aria-label
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');

    // 5. Nearest preceding sibling text node / element
    var parent = el.parentElement;
    if (parent) {
      var prev = el.previousElementSibling;
      if (prev && ['LABEL','SPAN','DIV','TD','TH','P'].indexOf(prev.tagName) !== -1) {
        var t = prev.textContent.trim().replace(/[\*:]\s*$/, '').trim();
        if (t.length > 0 && t.length < 80) return t;
      }
      // One level up
      var parentPrev = parent.previousElementSibling;
      if (parentPrev && ['LABEL','SPAN','DIV','TD','TH'].indexOf(parentPrev.tagName) !== -1) {
        var t2 = parentPrev.textContent.trim().replace(/[\*:]\s*$/, '').trim();
        if (t2.length > 0 && t2.length < 80) return t2;
      }
    }

    // 6. Placeholder as last resort
    if (el.placeholder) return el.placeholder;

    return null;
  }

  // ── Build a robust CSS selector ───────────────────────────────────────────
  function getRobustSelector(el) {
    if (el.id && !/^[0-9]/.test(el.id)) {
      try { return '#' + CSS.escape(el.id); } catch (e) { return '#' + el.id; }
    }
    if (el.name) return '[name="' + el.name + '"]';
    var sel = el.tagName.toLowerCase();
    if (el.className && typeof el.className === 'string') {
      var classes = el.className.split(/\s+/).filter(Boolean).slice(0, 2);
      if (classes.length) {
        try {
          sel += '.' + classes.map(function(c) { return CSS.escape(c); }).join('.');
        } catch (e) {
          sel += '.' + classes.join('.');
        }
      }
    }
    return sel;
  }

  function extractDataAttributes(el) {
    var data = {};
    for (var i = 0; i < el.attributes.length; i++) {
      var attr = el.attributes[i];
      if (attr.name.startsWith('data-')) data[attr.name] = attr.value;
    }
    return Object.keys(data).length ? data : null;
  }

  function getBounds(el) {
    try {
      var r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    } catch (e) { return null; }
  }

  // ── Framework detection ───────────────────────────────────────────────────
  function detectFramework() {
    var hints = [];
    if (window.React || document.querySelector('[data-reactroot],[data-react-helmet]')) hints.push('React');
    if (window.angular || document.querySelector('[ng-app],[ng-controller],[data-ng-app]')) hints.push('Angular');
    if (window.Vue || document.querySelector('[data-v-app]')) hints.push('Vue');
    if (document.querySelector('lightning-input,lightning-textarea,[data-aura-rendered-by]')) hints.push('Salesforce Lightning');
    if (document.querySelector('[id*="_ctl"],[id*="ctl00"]')) hints.push('ASP.NET WebForms');
    if (document.querySelector('.MuiInputBase-root,.MuiTextField-root')) hints.push('Material-UI');
    if (document.querySelector('.x-form-field,.x-form-text')) hints.push('Ext JS / Sencha');
    return hints.length ? hints : ['Unknown / vanilla HTML'];
  }

  // ── Run ───────────────────────────────────────────────────────────────────
  var fields = findAllFormFields();

  var payload = {
    capturedAt:   new Date().toISOString(),
    pageUrl:      window.location.href,
    pageHostname: window.location.hostname,
    pageTitle:    document.title,
    framework:    detectFramework(),
    userAgent:    navigator.userAgent,
    viewportSize: { width: window.innerWidth, height: window.innerHeight },
    fieldCount:   fields.length,
    fields:       fields,
  };

  var json = JSON.stringify(payload, null, 2);

  // Copy to clipboard (best-effort)
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(json)
      .then(function() {
        console.log('%c[Machinery Pilot] Copied to clipboard ✓', 'color:#16a34a;font-weight:bold;font-size:14px;');
      })
      .catch(function() {
        console.warn('[MP] Clipboard write blocked — use the download button.');
      });
  }

  // Download button (auto-removes after 60 s)
  var dateStr = new Date().toISOString().slice(0, 10);
  var filename = 'terex-portal-' + dateStr + '.json';
  var blob = new Blob([json], { type: 'application/json' });
  var url  = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.textContent = '\u2B07 Download capture (' + fields.length + ' fields found)';
  a.style.cssText = [
    'position:fixed', 'top:20px', 'right:20px', 'z-index:2147483647',
    'background:#0D1F3C', 'color:white', 'padding:12px 20px',
    'border-radius:8px', 'font-family:Inter,system-ui,sans-serif',
    'font-size:14px', 'font-weight:600', 'text-decoration:none',
    'box-shadow:0 4px 12px rgba(0,0,0,0.25)', 'cursor:pointer',
    'display:inline-block', 'line-height:1.4',
  ].join(';');
  document.body.appendChild(a);
  setTimeout(function() {
    a.remove();
    URL.revokeObjectURL(url);
  }, 60000);

  // Console summary
  console.group('%c[Machinery Pilot] Form structure captured', 'color:#0D1F3C;font-weight:bold;font-size:14px;');
  console.log('Page:',       window.location.href);
  console.log('Framework:',  payload.framework.join(', '));
  console.log('Fields found:', fields.length);
  console.log('Labels:', fields.map(function(f) {
    return f.label || f.id || f.name || '(no label)';
  }).join(' | '));
  console.log('JSON copied to clipboard. Download button visible top-right for 60 s.');
  console.log('Share the file or paste the clipboard content to: hello@machinerypilot.com');
  console.groupEnd();

  return payload;
})();
