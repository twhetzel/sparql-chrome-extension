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

  function tryPaste(query) {
    if (focusYasqe(resolveYasqeInstance(), query)) return true;
    if (tryPasteIntoDom(document, query)) return true;
    const altContainer = document.querySelector('#g4hwvd > div > div:nth-child(2) > div');
    if (altContainer && tryPasteIntoDom(altContainer, query)) return true;
    const iframe = document.querySelector('iframe');
    if (iframe && iframe.contentWindow) {
      try {
        const iframeWindow = iframe.contentWindow;
        if (focusYasqe(iframeWindow.yasqe || iframeWindow.YASQE, query)) return true;
        if (tryPasteIntoDom(iframeWindow.document, query)) return true;
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
        error = 'Could not locate the YASGUI editor.';
      }
    } catch (err) {
      error = err && err.message ? err.message : String(err);
    }
    window.postMessage({ type: 'NL_TO_SPARQL_PASTE_RESPONSE', id, success, error }, '*');
  });
})();

