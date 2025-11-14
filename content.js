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
    <label class="nl-model-label" for="nl-model-select">OpenAI model</label>
    <select id="nl-model-select" class="nl-model-select">
      <option value="gpt-5-chat-latest">gpt-5-chat-latest</option>
      <option value="gpt-4o">gpt-4o</option>
      <option value="gpt-4.1">gpt-4.1</option>
    </select>
    <label class="nl-context-label" for="nl-context-input">Optional context</label>
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
    <hr class="nl-divider" aria-hidden="true">
    <div id="nl-controls" class="nl-controls">
      <button id="nl-submit" class="nl-button nl-button--primary">Convert</button>
      <button id="nl-clear" class="nl-button">Clear</button>
      <button id="nl-copy" class="nl-button">Copy</button>
      <button id="nl-paste" class="nl-button">Paste to YASGUI</button>
      <button id="nl-reset-position" class="nl-button">Reset Position</button>
    </div>
    <div id="sparql-output" class="nl-output"></div>
    <div id="nl-status" class="nl-status" aria-live="polite"></div>
    <section id="nl-history" class="nl-history" aria-label="Generated query history">
      <div class="nl-history-header">
        <span class="nl-history-title">History</span>
        <div class="nl-history-actions">
          <button id="nl-history-export" class="nl-button nl-button--secondary">Export JSON</button>
          <button id="nl-history-clear" class="nl-button nl-button--secondary">Clear</button>
        </div>
      </div>
      <p id="nl-history-empty" class="nl-history-empty">No history yet.</p>
      <div id="nl-history-list" class="nl-history-list" role="list"></div>
    </section>
  `;
  document.body.appendChild(box);

  const textarea = document.getElementById('nl-input');

  const contextTextarea = document.getElementById('nl-context-input');
  const contextFileInput = document.getElementById('nl-context-file');
  const contextClearButton = document.getElementById('nl-context-clear');
  const contextStatus = document.getElementById('nl-context-status');
  const MAX_CONTEXT_CHARS = 20000;
  const modelSelect = document.getElementById('nl-model-select');
  const allowedModels = ['gpt-5-chat-latest', 'gpt-4o', 'gpt-4.1'];
  const DEFAULT_MODEL = 'gpt-5-chat-latest';
  const controls = document.getElementById('nl-controls');
  const historyList = document.getElementById('nl-history-list');
  const historyEmpty = document.getElementById('nl-history-empty');
  const historyExportButton = document.getElementById('nl-history-export');
  const historyClearButton = document.getElementById('nl-history-clear');
  const getPasteButton = () => document.getElementById('nl-paste');
  let selectedModel = DEFAULT_MODEL;
  const HISTORY_KEY = 'ontoprompt_history';
  const MAX_HISTORY_ENTRIES = 50;
  let historyEntries = [];

  const formatTimestamp = timestamp => {
    try {
      return new Date(timestamp).toLocaleString(undefined, {
        dateStyle: 'short',
        timeStyle: 'short'
      });
    } catch (err) {
      return '';
    }
  };

  const truncate = (text, limit = 160) => {
    if (!text) return '';
    if (text.length <= limit) return text;
    return `${text.slice(0, limit - 1)}…`;
  };

  const persistHistory = () => {
    chrome.storage.local.set({ [HISTORY_KEY]: historyEntries }, () => {
      if (chrome.runtime?.lastError) {
        console.warn('OntoPrompt: failed to persist history', chrome.runtime.lastError);
      }
    });
  };

  const renderHistory = () => {
    if (!historyList || !historyEmpty) return;
    historyList.innerHTML = '';
    if (!historyEntries.length) {
      historyEmpty.style.display = 'block';
      historyList.style.display = 'none';
      historyExportButton?.setAttribute('disabled', 'true');
      historyClearButton?.setAttribute('disabled', 'true');
      return;
    }

    historyEmpty.style.display = 'none';
    historyList.style.display = 'flex';
    historyExportButton?.removeAttribute('disabled');
    historyClearButton?.removeAttribute('disabled');

    const fragment = document.createDocumentFragment();
    historyEntries.forEach(entry => {
      const item = document.createElement('article');
      item.className = 'nl-history-item';
      item.setAttribute('role', 'listitem');
      item.dataset.entryId = entry.id;
      const promptPreview = truncate(entry.prompt || '(No prompt)');
      const modelLabel = entry.model ? `Model: ${entry.model}` : 'Model not recorded';
      const contextBlock = entry.context
        ? `<pre>${escapeHtml(entry.context)}</pre>`
        : '<p class="nl-history-item__muted">No additional context.</p>';

      item.innerHTML = `
        <div class="nl-history-item__top">
          <div class="nl-history-item__summary">
            <span class="nl-history-item__timestamp">${escapeHtml(formatTimestamp(entry.timestamp) || '')}</span>
            <span class="nl-history-item__model">${escapeHtml(modelLabel)}</span>
            <p class="nl-history-item__prompt">${escapeHtml(promptPreview)}</p>
          </div>
          <div class="nl-history-item__actions">
            <button class="nl-history-button" data-action="restore" data-id="${entry.id}">Restore</button>
            <button class="nl-history-button" data-action="copy" data-id="${entry.id}">Copy</button>
            <button class="nl-history-button" data-action="paste" data-id="${entry.id}">Paste</button>
          </div>
        </div>
        <details class="nl-history-item__details">
          <summary>Show details</summary>
          <div class="nl-history-item__section">
            <strong>Prompt</strong>
            <pre>${escapeHtml(entry.prompt || '')}</pre>
          </div>
          <div class="nl-history-item__section">
            <strong>Context</strong>
            ${contextBlock}
          </div>
          <div class="nl-history-item__section">
            <strong>Generated SPARQL</strong>
            <pre><code class="sparql">${escapeHtml(entry.query || '')}</code></pre>
          </div>
        </details>
      `;
      fragment.appendChild(item);
    });

    historyList.appendChild(fragment);
    if (window.hljs) {
      window.hljs.highlightAll();
    }
  };

  const loadHistory = () => {
    chrome.storage.local.get([HISTORY_KEY], result => {
      const stored = result?.[HISTORY_KEY];
      if (Array.isArray(stored)) {
        historyEntries = stored;
      } else {
        historyEntries = [];
      }
      renderHistory();
    });
  };

  const addHistoryEntry = entry => {
    if (!entry || !entry.id) return;
    const existingIndex = historyEntries.findIndex(
      item =>
        item.prompt === entry.prompt &&
        item.context === entry.context &&
        item.query === entry.query &&
        item.model === entry.model
    );
    if (existingIndex !== -1) {
      historyEntries.splice(existingIndex, 1);
    }
    historyEntries.unshift(entry);
    if (historyEntries.length > MAX_HISTORY_ENTRIES) {
      historyEntries = historyEntries.slice(0, MAX_HISTORY_ENTRIES);
    }
    persistHistory();
    renderHistory();
  };

  const clearHistory = () => {
    if (!historyEntries.length) {
      setStatus('History is already empty.', 'info');
      return;
    }
    if (!window.confirm('Clear all saved prompts and generated SPARQL queries?')) {
      return;
    }
    historyEntries = [];
    persistHistory();
    renderHistory();
    setStatus('History cleared.', 'success');
    getPasteButton()?.classList.remove('nl-button--highlight');
  };

  const exportHistory = () => {
    if (!historyEntries.length) {
      setStatus('History is empty. Nothing to export.', 'info');
      return;
    }
    const payload = JSON.stringify(historyEntries, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `ontoprompt-history-${timestamp}.json`;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      getPasteButton()?.classList.remove('nl-button--highlight');
    };

    const fallbackToClipboard = () => {
      navigator.clipboard.writeText(payload)
        .then(() => {
          setStatus('History copied to clipboard as JSON.', 'success');
        })
        .catch(err => {
          console.error('OntoPrompt: failed to copy history', err);
          setStatus('Unable to export history.', 'error');
        })
        .finally(cleanup);
    };

    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.rel = 'noopener';
      anchor.target = '_blank';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setStatus('History export started.', 'success');
      setTimeout(cleanup, 2000);
    } catch (err) {
      console.error('OntoPrompt: history export failed', err);
      fallbackToClipboard();
    }
  };

  const findHistoryEntry = id => historyEntries.find(entry => entry.id === id);

  const restoreHistoryEntry = entry => {
    textarea.value = entry.prompt || '';
    contextTextarea.value = entry.context || '';
    if (entry.context) {
      setContextStatus('Context restored from history.', 'info');
    } else {
      setContextStatus('', 'info');
    }
    if (allowedModels.includes(entry.model)) {
      selectedModel = entry.model;
    } else {
      selectedModel = DEFAULT_MODEL;
    }
    if (modelSelect) {
      modelSelect.value = selectedModel;
      chrome.storage.local.set({ openai_model: selectedModel });
    }
    if (entry.query) {
      renderQuery(entry.query);
      setStatus('History entry restored. Review or paste the SPARQL query.', 'success');
      getPasteButton()?.classList.add('nl-button--highlight');
    } else {
      document.getElementById('sparql-output').innerHTML = '';
      setStatus('History entry restored. Generate a new SPARQL query to continue.', 'info');
    }
    textarea.focus();
  };

  const copyHistoryEntry = entry => {
    if (!entry.query) {
      setStatus('No SPARQL query available to copy.', 'error');
      return;
    }
    navigator.clipboard.writeText(entry.query)
      .then(() => {
        setStatus('History query copied to clipboard.', 'success');
        getPasteButton()?.classList.remove('nl-button--highlight');
      })
      .catch(() => {
        setStatus('Copy failed. You may need to copy manually.', 'error');
      });
  };

  const pasteHistoryEntry = (entry, triggerButton) => {
    if (!entry.query) {
      setStatus('No SPARQL query available to paste.', 'error');
      return;
    }
    if (triggerButton) {
      triggerButton.disabled = true;
    }
    setStatus('Pasting history query into YASGUI…', 'info');
    insertIntoYasgui(entry.query)
      .then(() => {
        setStatus('History query pasted into YASGUI.', 'success');
        getPasteButton()?.classList.remove('nl-button--highlight');
      })
      .catch(err => {
        setStatus(err.message || 'Unable to paste history query.', 'error');
      })
      .finally(() => {
        if (triggerButton) {
          triggerButton.disabled = false;
        }
      });
  };

  const handleHistoryClick = event => {
    const actionButton = event.target.closest('button[data-action]');
    if (!actionButton) return;
    const { action, id } = actionButton.dataset;
    if (!id) return;
    const entry = findHistoryEntry(id);
    if (!entry) {
      setStatus('History entry not found.', 'error');
      return;
    }
    switch (action) {
      case 'restore':
        restoreHistoryEntry(entry);
        break;
      case 'copy':
        copyHistoryEntry(entry);
        break;
      case 'paste':
        pasteHistoryEntry(entry, actionButton);
        break;
      default:
        break;
    }
  };

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

  historyList?.addEventListener('click', handleHistoryClick);
  historyExportButton?.addEventListener('click', exportHistory);
  historyClearButton?.addEventListener('click', clearHistory);
  loadHistory();

  chrome.storage.local.get(['openai_model'], ({ openai_model: storedModel }) => {
    if (typeof storedModel === 'string') {
      if (allowedModels.includes(storedModel)) {
        selectedModel = storedModel;
      } else if (storedModel === 'gpt-5.1') {
        selectedModel = DEFAULT_MODEL;
        chrome.storage.local.set({ openai_model: selectedModel });
      } else {
        selectedModel = DEFAULT_MODEL;
      }
    }
    if (modelSelect) {
      modelSelect.value = selectedModel;
    }
  });

  modelSelect?.addEventListener('change', () => {
    const value = modelSelect.value;
    selectedModel = allowedModels.includes(value) ? value : DEFAULT_MODEL;
    if (selectedModel !== value) {
      modelSelect.value = selectedModel;
    }
    chrome.storage.local.set({ openai_model: selectedModel });
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
                model: selectedModel,
                messages: [
                  { role: 'system', content: 'You are an expert at writing SPARQL queries.' },
                  { role: 'user', content: userContent }
                ],
                max_tokens: 1024,
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
            addHistoryEntry({
              id: `hist-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
              timestamp: Date.now(),
              prompt,
              context,
              model: selectedModel,
              query: cleaned
            });
            if (controls) {
              controls.scrollIntoView({ block: 'start', behavior: 'smooth' });
            }
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
