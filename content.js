function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function stripMarkdownFences(text) {
  if (!text) return '';
  let trimmed = text.trim();
  const fenceStart = /^```[\w-]*\s*/;
  const fenceEnd = /```$/;
  if (fenceStart.test(trimmed)) {
    trimmed = trimmed.replace(fenceStart, '');
  }
  if (fenceEnd.test(trimmed)) {
    trimmed = trimmed.replace(fenceEnd, '');
  }
  return trimmed.trim();
}

function getGeneratedQuery() {
  const codeElem = document.querySelector('#sparql-output code');
  if (!codeElem) return '';
  const rawText = codeElem.innerText || codeElem.textContent || '';
  return stripMarkdownFences(rawText);
}

let pasteBridgeReadyPromise = null;

function ensurePasteBridge() {
  if (pasteBridgeReadyPromise) return pasteBridgeReadyPromise;
  pasteBridgeReadyPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('js/pasteBridge.js');
    script.onload = () => {
      script.remove();
      resolve();
    };
    script.onerror = err => {
      script.remove();
      pasteBridgeReadyPromise = null;
      reject(new Error('Failed to load YASGUI bridge script.'));
    };
    document.documentElement.appendChild(script);
  });
  return pasteBridgeReadyPromise;
}

async function insertIntoYasgui(query) {
  await ensurePasteBridge();
  const messageId = `nl-paste-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return new Promise((resolve, reject) => {
    const listener = event => {
      if (event.source !== window) return;
      if (!event.data || event.data.type !== 'NL_TO_SPARQL_PASTE_RESPONSE') return;
      if (event.data.id !== messageId) return;
      window.removeEventListener('message', listener);
      clearTimeout(timeout);
      if (event.data.success) {
        resolve();
      } else {
        reject(new Error(event.data.error || 'Unable to paste into YASGUI.'));
      }
    };

    const timeout = setTimeout(() => {
      window.removeEventListener('message', listener);
      reject(new Error('Timed out while contacting YASGUI.'));
    }, 2000);

    window.addEventListener('message', listener);
    window.postMessage({ type: 'NL_TO_SPARQL_PASTE_REQUEST', id: messageId, query }, '*');
  });
}

function setStatus(message, type = 'info') {
  const statusEl = document.getElementById('nl-status');
  if (!statusEl) return;
  statusEl.textContent = message || '';
  if (message) {
    statusEl.setAttribute('data-status-type', type);
  } else {
    statusEl.removeAttribute('data-status-type');
  }
}

function toggleActionButtons(disabled) {
  const buttons = document.querySelectorAll('#nl-submit, #nl-clear, #nl-copy, #nl-paste');
  buttons.forEach(btn => {
    btn.disabled = disabled;
  });
}

function renderLoadingState() {
  const output = document.getElementById('sparql-output');
  if (!output) return;
  output.innerHTML = `
    <div class="nl-loading">
      <span class="nl-spinner" aria-hidden="true"></span>
      <span>Generating SPARQL…</span>
    </div>
  `;
}

function renderQuery(query) {
  const output = document.getElementById('sparql-output');
  if (!output) return;
  output.innerHTML = `<pre><code class="sparql">${escapeHtml(query)}</code></pre>`;
  if (window.hljs) {
    window.hljs.highlightAll();
  }
}

function injectUI() {
  if (document.getElementById('nl-to-sparql-box')) return;

  const box = document.createElement('div');
  box.id = 'nl-to-sparql-box';
  box.className = 'nl-to-sparql-box';
  box.innerHTML = `
    <div class="nl-to-sparql-box__title">Ask your SPARQL query:</div>
    <textarea id="nl-input" class="nl-input" rows="3" placeholder="Describe the query you need…"></textarea>
    <label class="nl-context-label" for="nl-context-input">
      <span>Optional context</span>
    </label>
    <div class="nl-context-section">
      <textarea id="nl-context-input" class="nl-context-input" rows="4" placeholder="Paste supplemental notes or ontology snippets that should inform the query (optional)."></textarea>
      <div class="nl-context-actions">
        <label class="nl-context-upload">
          <input type="file" id="nl-context-file" accept=".txt,.md,.json,.sparql,.csv,.tsv,.ttl,.rdf" hidden>
          <span class="nl-context-upload-btn">Upload context file</span>
        </label>
        <button id="nl-context-clear" type="button" class="nl-button nl-button--secondary">Clear context</button>
      </div>
      <div id="nl-context-status" class="nl-context-status" aria-live="polite"></div>
    </div>
    <div class="nl-controls">
      <button id="nl-submit" class="nl-button nl-button--primary">Convert</button>
      <button id="nl-clear" class="nl-button">Clear</button>
      <button id="nl-copy" class="nl-button">Copy</button>
      <button id="nl-paste" class="nl-button">Paste to YASGUI</button>
      <button id="nl-reset-position" class="nl-button">Reset Position</button>
    </div>
    <div id="sparql-output" class="nl-output"></div>
    <div id="nl-status" class="nl-status" aria-live="polite"></div>
  `;
  document.body.appendChild(box);

  const textarea = document.getElementById('nl-input');

  const contextTextarea = document.getElementById('nl-context-input');
  const contextFileInput = document.getElementById('nl-context-file');
  const contextClearButton = document.getElementById('nl-context-clear');
  const contextStatus = document.getElementById('nl-context-status');
  const MAX_CONTEXT_CHARS = 20000;

  function setContextStatus(message, type = 'info') {
    contextStatus.textContent = message;
    contextStatus.setAttribute('data-status-type', type);
    contextStatus.style.display = message ? 'block' : 'none';
  }

  contextTextarea.addEventListener('input', () => {
    if (contextTextarea.value.length > MAX_CONTEXT_CHARS) {
      contextTextarea.value = contextTextarea.value.slice(0, MAX_CONTEXT_CHARS);
      setContextStatus(`Context trimmed to ${MAX_CONTEXT_CHARS} characters.`, 'warning');
    } else {
      setContextStatus('', 'info');
    }
  });
  setContextStatus('', 'info');

  contextFileInput.addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 512 * 1024) {
      setContextStatus('File too large (max 512 KB).', 'warning');
      contextFileInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const text = String(e.target?.result || '').slice(0, MAX_CONTEXT_CHARS);
      contextTextarea.value = text;
      setContextStatus(`Loaded context from ${file.name}.`, 'success');
    };
    reader.onerror = () => {
      setContextStatus('Failed to read context file.', 'error');
    };
    reader.readAsText(file);
    contextFileInput.value = '';
  });

  contextClearButton.addEventListener('click', () => {
    contextTextarea.value = '';
    setContextStatus('Context cleared.', 'info');
  });

  const dragHandle = box.querySelector('.nl-to-sparql-box__title');
  dragHandle.classList.add('nl-drag-handle');
  const dragState = {
    active: false,
    pointerId: null,
    offsetX: 0,
    offsetY: 0,
    latestLeft: null,
    latestTop: null
  };

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const constraintPadding = 8;

  const constrainToViewport = (left, top) => {
    const maxLeft = window.innerWidth - box.offsetWidth - constraintPadding;
    const maxTop = window.innerHeight - box.offsetHeight - constraintPadding;
    return {
      left: clamp(left, constraintPadding, Math.max(maxLeft, constraintPadding)),
      top: clamp(top, constraintPadding, Math.max(maxTop, constraintPadding))
    };
  };

  const applyPositionStyle = (left, top) => {
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.right = 'auto';
    box.style.bottom = 'auto';
  };

  const savePosition = (left, top) => {
    chrome.storage.local.set({ nl_panel_position: { left, top } });
  };

  const loadPosition = () => {
    chrome.storage.local.get(['nl_panel_position'], ({ nl_panel_position: saved }) => {
      if (!saved || typeof saved.left !== 'number' || typeof saved.top !== 'number') {
        return;
      }
      const { left, top } = constrainToViewport(saved.left, saved.top);
      applyPositionStyle(left, top);
      dragState.latestLeft = left;
      dragState.latestTop = top;
    });
  };

  const onPointerMove = event => {
    if (!dragState.active || event.pointerId !== dragState.pointerId) return;
    const rawLeft = event.clientX - dragState.offsetX;
    const rawTop = event.clientY - dragState.offsetY;
    const { left, top } = constrainToViewport(rawLeft, rawTop);
    applyPositionStyle(left, top);
    dragState.latestLeft = left;
    dragState.latestTop = top;
  };

  const endDrag = event => {
    if (!dragState.active || event.pointerId !== dragState.pointerId) return;
    dragState.active = false;
    dragHandle.releasePointerCapture(event.pointerId);
    box.classList.remove('is-dragging');
    document.body.style.userSelect = '';
    if (
      typeof dragState.latestLeft === 'number' &&
      typeof dragState.latestTop === 'number'
    ) {
      savePosition(dragState.latestLeft, dragState.latestTop);
    }
  };

  dragHandle.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.pointerType !== 'touch') return;
    const rect = box.getBoundingClientRect();
    dragState.active = true;
    dragState.pointerId = event.pointerId;
    dragState.offsetX = event.clientX - rect.left;
    dragState.offsetY = event.clientY - rect.top;
    dragHandle.setPointerCapture(event.pointerId);
    box.classList.add('is-dragging');
    document.body.style.userSelect = 'none';
    event.preventDefault();
  });

  dragHandle.addEventListener('pointermove', onPointerMove);
  dragHandle.addEventListener('pointerup', endDrag);
  dragHandle.addEventListener('pointercancel', endDrag);

  loadPosition();

  window.addEventListener('resize', () => {
    const currentLeft = parseFloat(box.style.left);
    const currentTop = parseFloat(box.style.top);
    if (Number.isNaN(currentLeft) || Number.isNaN(currentTop)) {
      return;
    }
    const { left, top } = constrainToViewport(currentLeft, currentTop);
    applyPositionStyle(left, top);
    dragState.latestLeft = left;
    dragState.latestTop = top;
    savePosition(left, top);
  });

  document.getElementById('nl-clear').onclick = () => {
    textarea.value = '';
    document.getElementById('sparql-output').innerHTML = '';
    setStatus('Cleared input.', 'info');
    contextTextarea.value = '';
    updateContextCharCount();
    setContextStatus('', 'info');
  };

  const triggerConversion = () => {
    if (convertInProgress) return;
    document.getElementById('nl-submit').click();
  };

  document.getElementById('nl-copy').onclick = () => {
    const query = getGeneratedQuery();
    if (!query) {
      setStatus('There is no query to copy yet.', 'error');
      return;
    }
    document.getElementById('nl-paste')?.classList.remove('nl-button--highlight');
    navigator.clipboard.writeText(query)
      .then(() => {
        setStatus('Copied to clipboard.', 'success');
      })
      .catch(() => {
        setStatus('Copy failed. You may need to copy manually.', 'error');
      });
  };

  document.getElementById('nl-paste').onclick = async () => {
    const query = getGeneratedQuery();
    if (!query) {
      setStatus('Generate a query before pasting into YASGUI.', 'error');
      return;
    }
    const pasteButton = document.getElementById('nl-paste');
    pasteButton.disabled = true;
    setStatus('Pasting into YASGUI…', 'info');
    try {
      await insertIntoYasgui(query);
      setStatus('Query pasted into YASGUI.', 'success');
      pasteButton.classList.remove('nl-button--highlight');
    } catch (err) {
      setStatus(err.message || 'Unable to paste into YASGUI.', 'error');
    } finally {
      pasteButton.disabled = false;
    }
  };

  document.getElementById('nl-reset-position').onclick = () => {
    chrome.storage.local.remove(['nl_panel_position'], () => {
      box.style.left = '';
      box.style.top = '';
      box.style.right = '';
      box.style.bottom = '';
      box.style.bottom = '30px';
      box.style.right = '30px';
      dragState.latestLeft = null;
      dragState.latestTop = null;
      setStatus('Panel position reset.', 'info');
    });
  };

  let convertInProgress = false;

  document.getElementById('nl-submit').onclick = () => {
    const prompt = textarea.value.trim();
    if (!prompt) {
      setStatus('Please describe the query you need before converting.', 'error');
      return;
    }
    const context = contextTextarea.value.trim();
    renderLoadingState();
    setStatus('');
    toggleActionButtons(true);
    convertInProgress = true;

    try {
      chrome.storage.local.get(['openai_api_key'], ({ openai_api_key: apiKey }) => {
        (async () => {
          try {
            if (!apiKey) {
              document.getElementById('sparql-output').innerHTML = '';
              setStatus('OpenAI API key is missing. Add it from the extension popup.', 'error');
              return;
            }

            let userContent = `Write a SPARQL query for the following request, suitable for the YASGUI endpoint. Only return the query, no explanation:\n\n${prompt}`;
            if (context) {
              userContent = `Use the following additional context when writing the SPARQL query:\n---\n${context}\n---\n\nRequest:\n${prompt}`;
            }

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
              },
              body: JSON.stringify({
                model: 'gpt-5.1',
                messages: [
                  { role: 'system', content: 'You are an expert at writing SPARQL queries.' },
                  { role: 'user', content: userContent }
                ],
                max_tokens: 512,
                temperature: 0
              })
            });

            if (!response.ok) {
              throw new Error(`OpenAI API error (${response.status})`);
            }

            const completion = await response.json();
            const content = completion?.choices?.[0]?.message?.content;
            const cleaned = stripMarkdownFences(content);

            if (!cleaned) {
              throw new Error('The model returned an empty response.');
            }

            renderQuery(cleaned);
            setStatus('Query generated. Review before executing.', 'success');
            box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
            const pasteButton = document.getElementById('nl-paste');
            if (pasteButton) {
              pasteButton.classList.add('nl-button--highlight');
            }
          } catch (err) {
            console.error('SPARQL generation error', err);
            document.getElementById('sparql-output').innerHTML = '';
            setStatus(err.message || 'Something went wrong while generating the query.', 'error');
          } finally {
            toggleActionButtons(false);
            convertInProgress = false;
          }
        })();
      });
    } catch (err) {
      console.error('Unexpected error', err);
      document.getElementById('sparql-output').innerHTML = '';
      setStatus('Unexpected error: try reloading the page and the extension.', 'error');
      toggleActionButtons(false);
      convertInProgress = false;
    }
  };

  textarea.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      triggerConversion();
    }
  });
}

window.addEventListener('load', injectUI);
