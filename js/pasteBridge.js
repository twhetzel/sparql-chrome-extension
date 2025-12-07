(function () {
  if (window.__NL_TO_SPARQL_PASTE_BRIDGE__) return;
  window.__NL_TO_SPARQL_PASTE_BRIDGE__ = true;

  function resolveYasqeInstance() {
    const candidates = [];
    const globalYasgui = window.yasgui || window.YASGUI;
    if (globalYasgui) {
      if (typeof globalYasgui.getTab === 'function') {
        const currentTab = globalYasgui.getTab();
        if (currentTab && currentTab.yasqe) candidates.push(currentTab.yasqe);
      }
      if (Array.isArray(globalYasgui.tabs)) {
        globalYasgui.tabs.forEach(tab => {
          if (tab && tab.yasqe) candidates.push(tab.yasqe);
        });
      }
      if (globalYasgui.yasqe) candidates.push(globalYasgui.yasqe);
    }
    if (window.yasqe && typeof window.yasqe.setValue === 'function') {
      candidates.push(window.yasqe);
    }
    document.querySelectorAll('.yasqe').forEach(el => {
      if (el.yasqe && typeof el.yasqe.setValue === 'function') candidates.push(el.yasqe);
      if (el.__yasqe && typeof el.__yasqe.setValue === 'function') candidates.push(el.__yasqe);
    });
    return candidates.find(instance => instance && typeof instance.setValue === 'function') || null;
  }

  function focusYasqe(yasqe, query) {
    if (!yasqe || typeof yasqe.setValue !== 'function') return false;
    yasqe.setValue(query);
    if (typeof yasqe.refresh === 'function') yasqe.refresh();
    if (typeof yasqe.focus === 'function') yasqe.focus();
    if (typeof yasqe.setCursor === 'function') {
      const lines = query.split('\n');
      yasqe.setCursor(lines.length - 1, lines[lines.length - 1].length);
    }
    return true;
  }

  function tryPasteIntoDom(root, query) {
    if (!root) return false;
    const codeMirror = root.querySelector('.yasqe .CodeMirror, .CodeMirror');
    if (codeMirror && codeMirror.CodeMirror) {
      codeMirror.CodeMirror.setValue(query);
      codeMirror.CodeMirror.setCursor({ line: codeMirror.CodeMirror.lineCount() - 1, ch: 0 });
      codeMirror.CodeMirror.focus();
      return true;
    }
    const cmModern = root.querySelector('.yasqe .cm-editor, .cm-editor');
    if (cmModern) {
      const textarea = cmModern.querySelector('textarea');
      if (textarea) {
        textarea.value = query;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  function tryPasteIntoFrink(root, query) {
    if (!root) return false;

    // Look for textarea or input with SPARQL-related identifiers
    const selectors = [
      'textarea[placeholder*="SPARQL" i]',
      'textarea[placeholder*="Query" i]',
      'textarea[id*="sparql" i]',
      'textarea[id*="query" i]',
      'textarea[name*="sparql" i]',
      'textarea[name*="query" i]',
      'textarea[class*="sparql" i]',
      'textarea[class*="query" i]'
    ];

    // Try each selector
    for (const selector of selectors) {
      try {
        const element = root.querySelector(selector);
        if (element && (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT')) {
          element.value = query;
          element.focus();
          // Trigger input and change events to notify the page
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      } catch (e) {
        // Continue trying other selectors
      }
    }

    // Fallback: Find by label text
    const labels = root.querySelectorAll('label');
    for (const label of labels) {
      const labelText = (label.textContent || '').toLowerCase();
      if (labelText.includes('sparql') && labelText.includes('query')) {
        const forAttr = label.getAttribute('for');
        if (forAttr) {
          const target = root.getElementById(forAttr);
          if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) {
            target.value = query;
            target.focus();
            target.dispatchEvent(new Event('input', { bubbles: true }));
            target.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
        // If no 'for' attribute, look for next sibling textarea
        let next = label.nextElementSibling;
        while (next) {
          if (next.tagName === 'TEXTAREA' || next.tagName === 'INPUT') {
            next.value = query;
            next.focus();
            next.dispatchEvent(new Event('input', { bubbles: true }));
            next.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
          next = next.nextElementSibling;
        }
        // Also check for textarea within the same parent or nearby
        const parent = label.parentElement;
        if (parent) {
          const nearbyTextarea = parent.querySelector('textarea, input[type="text"]');
          if (nearbyTextarea) {
            nearbyTextarea.value = query;
            nearbyTextarea.focus();
            nearbyTextarea.dispatchEvent(new Event('input', { bubbles: true }));
            nearbyTextarea.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
      }
    }

    return false;
  }

  function tryPaste(query) {
    // Try YASGUI methods first (maintains existing functionality)
    if (focusYasqe(resolveYasqeInstance(), query)) return true;
    if (tryPasteIntoDom(document, query)) return true;

    // Try frink-query-ui page
    if (tryPasteIntoFrink(document, query)) return true;

    // Continue with existing fallbacks
    const altContainer = document.querySelector('#g4hwvd > div > div:nth-child(2) > div');
    if (altContainer && tryPasteIntoDom(altContainer, query)) return true;
    const iframe = document.querySelector('iframe');
    if (iframe && iframe.contentWindow) {
      try {
        const iframeWindow = iframe.contentWindow;
        if (focusYasqe(iframeWindow.yasqe || iframeWindow.YASQE, query)) return true;
        if (tryPasteIntoDom(iframeWindow.document, query)) return true;
        if (tryPasteIntoFrink(iframeWindow.document, query)) return true;
      } catch (err) {
        console.warn('NL-to-SPARQL paste bridge: unable to access iframe contents', err);
      }
    }
    return false;
  }

  window.addEventListener('message', event => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== 'NL_TO_SPARQL_PASTE_REQUEST') return;
    const { id, query } = event.data;
    let success = false;
    let error = null;
    try {
      success = tryPaste(query);
      if (!success) {
        error = 'Could not locate the SPARQL query editor.';
      }
    } catch (err) {
      error = err && err.message ? err.message : String(err);
    }
    window.postMessage({ type: 'NL_TO_SPARQL_PASTE_RESPONSE', id, success, error }, '*');
  });
})();

