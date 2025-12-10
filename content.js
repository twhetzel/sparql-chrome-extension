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


/**
 * VoiceInputHandler - Manages speech recognition for voice input
 */
class VoiceInputHandler {
  constructor(textarea, voiceBtn, setStatus, updateClearVisibility) {
    this.textarea = textarea;
    this.voiceBtn = voiceBtn;
    this.setStatus = setStatus;
    this.updateClearVisibility = updateClearVisibility;

    this.recognition = null;
    this.isRecording = false;
    this.recordingStartPosition = 0;
    this.currentInterimLength = 0;

    this.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (this.SpeechRecognition) {
      this.init();
    } else {
      // Browser doesn't support speech recognition
      this.voiceBtn.style.display = 'none';
    }
  }

  init() {
    this.recognition = new this.SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onstart = () => this.handleStart();
    this.recognition.onresult = (event) => this.handleResult(event);
    this.recognition.onerror = (event) => this.handleError(event);
    this.recognition.onend = () => this.handleEnd();

    this.voiceBtn.addEventListener('click', () => {
      if (this.isRecording) {
        this.stop();
      } else {
        this.start();
      }
    });
  }

  handleStart() {
    this.isRecording = true;
    this.voiceBtn.classList.add('is-recording');
    this.voiceBtn.setAttribute('aria-label', 'Stop voice input');
    this.voiceBtn.setAttribute('title', 'Stop voice input');
    this.setStatus('Listening...', 'info');

    // Ensure we capture the cursor position correctly
    // If cursor is at the start (0) but there's existing text, move to end
    const currentCursor = this.textarea.selectionStart;
    const hasText = this.textarea.value.trim().length > 0;

    if (currentCursor === 0 && hasText) {
      // Cursor is at start but there's text - move to end for appending
      this.textarea.focus();
      const endPos = this.textarea.value.length;
      this.textarea.setSelectionRange(endPos, endPos);
      this.recordingStartPosition = endPos;
    } else {
      // Use current cursor position
      this.recordingStartPosition = currentCursor;
    }

    // Add a space before new voice input if there's existing text at the insertion point
    if (this.recordingStartPosition > 0) {
      const charBefore = this.textarea.value[this.recordingStartPosition - 1];
      // Only add space if the character before is not already a space or newline
      if (charBefore && charBefore !== ' ' && charBefore !== '\n') {
        const textBefore = this.textarea.value.substring(0, this.recordingStartPosition);
        const textAfter = this.textarea.value.substring(this.recordingStartPosition);
        this.textarea.value = textBefore + ' ' + textAfter;
        this.recordingStartPosition += 1; // Adjust position to account for the space we added
        this.textarea.setSelectionRange(this.recordingStartPosition, this.recordingStartPosition);
      }
    }

    this.currentInterimLength = 0;
  }

  handleResult(event) {
    let interimTranscript = '';
    const finalParts = [];

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalParts.push(transcript);
      } else {
        interimTranscript += transcript;
      }
    }
    const finalTranscript = finalParts.join(' ');

    // On first result in this recording session, verify and correct the insertion position
    // This ensures we insert at the current cursor position, not an old/stale position
    if (event.resultIndex === 0 && this.currentInterimLength === 0) {
      const currentCursor = this.textarea.selectionStart;
      const textLength = this.textarea.value.length;

      // Always use the current cursor position for new recording sessions
      // This ensures text is inserted where the user expects it
      this.recordingStartPosition = currentCursor;
    }

    // Calculate the end of the recording area
    const recordingEndPosition = this.recordingStartPosition + this.currentInterimLength;

    // Get text before and after the recording area
    const textBefore = this.textarea.value.substring(0, this.recordingStartPosition);
    const textAfter = this.textarea.value.substring(recordingEndPosition);

    // Build new value: existing text before + all final transcripts + current interim (if any)
    let newValue = textBefore + finalTranscript;
    if (interimTranscript) {
      newValue += interimTranscript;
    }
    newValue += textAfter;

    // Update textarea with the new value
    this.textarea.value = newValue;

    // Update tracking: move start position forward by finalized text, track new interim length
    if (finalTranscript) {
      this.recordingStartPosition += finalTranscript.length;
    }
    this.currentInterimLength = interimTranscript.length;

    // Set cursor at the end of the transcribed text (after final + interim)
    const cursorPos = this.recordingStartPosition + this.currentInterimLength;
    this.textarea.selectionStart = this.textarea.selectionEnd = cursorPos;

    // Update clear button visibility when text changes
    this.updateClearVisibility();

    this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  handleError(event) {
    console.error('Speech recognition error:', event.error);
    if (event.error === 'no-speech') {
      this.setStatus('No speech detected. Try again.', 'error');
    } else if (event.error === 'not-allowed') {
      this.setStatus('Microphone permission denied. Please allow microphone access.', 'error');
      // Disable the voice button since permission was denied
      this.voiceBtn.disabled = true;
      this.voiceBtn.setAttribute('title', 'Microphone permission denied');
    } else if (event.error === 'aborted') {
      // User stopped recording, don't show error
      return;
    } else {
      this.setStatus(`Voice input error: ${event.error}`, 'error');
    }
    this.stop();
  }

  handleEnd() {
    this.stop();
  }

  start() {
    if (!this.recognition || this.voiceBtn.disabled) return;
    try {
      this.recognition.start();
    } catch (err) {
      console.error('Failed to start recognition:', err);
      this.setStatus('Unable to start voice input.', 'error');
    }
  }

  stop() {
    if (this.isRecording && this.recognition) {
      this.isRecording = false;
      try {
        this.recognition.stop();
      } catch (err) {
        // Ignore errors when stopping
      }
      this.voiceBtn.classList.remove('is-recording');
      this.voiceBtn.setAttribute('aria-label', 'Start voice input');
      this.voiceBtn.setAttribute('title', 'Start voice input');
      this.setStatus('', 'info');
      // Reset tracking variables
      this.recordingStartPosition = 0;
      this.currentInterimLength = 0;
    }
  }
}

function stripMarkdownFences(text) {
  if (!text) return '';
  let trimmed = text.trim();

  // First, try to extract content from markdown code blocks
  // Match: ```sparql ... ``` or ``` ... ```
  const markdownBlockMatch = trimmed.match(/```(?:\w+)?\s*\n?([\s\S]*?)```/);
  if (markdownBlockMatch) {
    trimmed = markdownBlockMatch[1].trim();
  } else {
    // Remove leading/trailing fences if present
    const fenceStart = /^```[\w-]*\s*/;
    const fenceEnd = /```$/;
    trimmed = trimmed.replace(fenceStart, '').replace(fenceEnd, '').trim();
  }

  // SPARQL keywords that indicate the start of a query
  const sparqlStartKeywords = /\b(SELECT|ASK|CONSTRUCT|DESCRIBE|INSERT|DELETE|PREFIX|BASE)\b/i;
  const lines = trimmed.split('\n');

  // Find the start of the actual query (first line with SPARQL keywords)
  let queryStart = lines.findIndex(line => sparqlStartKeywords.test(line));

  // If we found a SPARQL keyword, extract from there to the end
  // Otherwise, return the whole text (might already be just the query)
  if (queryStart >= 0) {
    trimmed = lines.slice(queryStart).join('\n').trim();

    // Try to find where explanatory text starts after the query
    // Look for patterns that suggest the query has ended
    const explanationPatterns = /^\s*(Note|This|That|The query|The SPARQL|Explanation|Here'?s|For|This query)/i;
    const queryLines = trimmed.split('\n');
    let queryEnd = queryLines.length;

    for (let i = 1; i < queryLines.length; i++) {
      const line = queryLines[i].trim();
      // If we hit a blank line followed by explanatory text, stop there
      if (line === '' && i + 1 < queryLines.length && explanationPatterns.test(queryLines[i + 1])) {
        queryEnd = i;
        break;
      }
      // If a line starts with explanatory text, stop before it
      if (line && explanationPatterns.test(line)) {
        queryEnd = i;
        break;
      }
    }

    trimmed = queryLines.slice(0, queryEnd).join('\n').trim();
  }

  // Remove any remaining explanatory prefixes/suffixes
  trimmed = trimmed.replace(/^(?:here'?s?|the|a)?\s*(?:sparql\s+)?query\s*[:\-–—]\s*/i, '');

  return trimmed;
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
    <div class="nl-to-sparql-box__title nl-drag-handle">
      <span class="nl-to-sparql-box__title-text">Ask your SPARQL query:</span>
      <button type="button" class="nl-minimize-btn" aria-label="Minimize panel" title="Minimize">
        <span class="nl-minimize-icon" aria-hidden="true">−</span>
      </button>
    </div>
    <div class="nl-to-sparql-box__content">
    <div class="nl-input-wrapper">
      <textarea id="nl-input" class="nl-input" rows="3" placeholder="Describe the query you need…"></textarea>
      <div class="nl-input-actions">
        <button type="button" id="nl-voice-btn" class="nl-voice-btn" aria-label="Start voice input" title="Start voice input">
          <span class="nl-voice-icon" aria-hidden="true">🎤</span>
        </button>
        <button type="button" id="nl-input-clear" class="nl-input-clear-btn" aria-label="Clear input" title="Clear input" style="display: none;">
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </div>
    <label class="nl-model-label" for="nl-model-select">OpenAI model</label>
    <select id="nl-model-select" class="nl-model-select">
      <option value="gpt-4.1">gpt-4.1</option>
    </select>
    <label class="nl-context-label" for="nl-context-input">
      Optional context
      <button type="button" class="nl-context-help" aria-label="Help with context" title="Help with context">
        <span aria-hidden="true">?</span>
      </button>
      <div id="nl-context-help-tooltip" class="nl-context-help-tooltip" role="tooltip" hidden>
        <p>The context field allows you to provide additional information about your ontology that helps generate more accurate SPARQL queries. You can paste ontology snippets, prefixes, or upload a file containing relevant context.</p>
        <p>Need help creating a context file for your ontology? <a href="https://github.com/twhetzel/sparql-chrome-extension/issues" target="_blank" rel="noopener noreferrer">Ask for help on our issue tracker</a>.</p>
        <button type="button" class="nl-context-help-close" aria-label="Close help">×</button>
      </div>
    </label>
    <div class="nl-context-section">
      <div class="nl-context-source-row">
        <label for="nl-context-source">
          Context source
          <span class="nl-context-note">(Context is sent to OpenAI; don’t include sensitive data.)</span>
        </label>
        <select id="nl-context-source" class="nl-context-select">
          <option value="none">None</option>
          <option value="omnigraph">Omnigraph repo URL…</option>
          <option value="custom">Custom URL…</option>
        </select>
      </div>
      <div class="nl-context-url-row" id="nl-context-url-row" hidden>
        <div id="nl-context-omnigraph-file-list" class="nl-context-omnigraph-file-list" hidden>
          <div class="nl-context-omnigraph-checkboxes">
            <label class="nl-context-omnigraph-checkbox">
              <input type="checkbox" value="nde_global.json" class="nl-context-omnigraph-checkbox-input">
              <span>NDE Global</span>
            </label>
            <label class="nl-context-omnigraph-checkbox">
              <input type="checkbox" value="nde_immport.json" class="nl-context-omnigraph-checkbox-input">
              <span>NDE ImmPort</span>
            </label>
            <label class="nl-context-omnigraph-checkbox">
              <input type="checkbox" value="nde_vivli.json" class="nl-context-omnigraph-checkbox-input">
              <span>NDE Vivli</span>
            </label>
            <label class="nl-context-omnigraph-checkbox">
              <input type="checkbox" value="nde_immunespace.json" class="nl-context-omnigraph-checkbox-input">
              <span>NDE ImmuneSpace</span>
            </label>
            <label class="nl-context-omnigraph-checkbox">
              <input type="checkbox" value="nde_project_tycho.json" class="nl-context-omnigraph-checkbox-input">
              <span>NDE Project Tycho</span>
            </label>
            <label class="nl-context-omnigraph-checkbox">
              <input type="checkbox" value="nde_radx_data_hub.json" class="nl-context-omnigraph-checkbox-input">
              <span>NDE RADx Data Hub</span>
            </label>
            <label class="nl-context-omnigraph-checkbox">
              <input type="checkbox" value="nde_vdjserver.json" class="nl-context-omnigraph-checkbox-input">
              <span>NDE VDJServer</span>
            </label>
            <label class="nl-context-omnigraph-checkbox">
              <input type="checkbox" value="nde_zenodo.json" class="nl-context-omnigraph-checkbox-input">
              <span>NDE Zenodo</span>
            </label>
          </div>
          <button id="nl-context-omnigraph-load" type="button" class="nl-button nl-button--secondary">Load Selected Files</button>
        </div>
        <input id="nl-context-url" type="url" class="nl-context-url" placeholder="">
        <button id="nl-context-url-load" type="button" class="nl-button nl-button--secondary">Load URL</button>
      </div>
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
      <button id="nl-paste" class="nl-button">Paste Query</button>
      <button id="nl-reset-position" class="nl-button">Reset Position</button>
    </div>
    <div id="sparql-output" class="nl-output"></div>
    <div id="nl-status" class="nl-status" aria-live="polite"></div>
    <div class="nl-footer">
      <a href="https://github.com/twhetzel/sparql-chrome-extension/issues" target="_blank" rel="noopener noreferrer" class="nl-footer-link">Report an issue</a>
    </div>
    <section id="nl-history" class="nl-history" aria-label="Generated query history">
        <div class="nl-history-header">
          <span class="nl-history-title">History</span>
          <div class="nl-history-actions">
            <button id="nl-history-export" class="nl-button nl-button--secondary">Export JSON</button>
            <label class="nl-history-import-label">
              <input type="file" id="nl-history-import" accept=".json" hidden>
              <span class="nl-button nl-button--secondary">Import JSON</span>
            </label>
            <button id="nl-history-clear" class="nl-button nl-button--secondary">Clear</button>
          </div>
        </div>
      <p id="nl-history-empty" class="nl-history-empty">No history yet.</p>
      <div id="nl-history-list" class="nl-history-list" role="list"></div>
    </section>
    </div>
  `;
  document.body.appendChild(box);

  const textarea = document.getElementById('nl-input');

  // Get DOM elements early so they're available to functions
  const contextTextarea = document.getElementById('nl-context-input');
  const contextFileInput = document.getElementById('nl-context-file');
  const contextClearButton = document.getElementById('nl-context-clear');
  const contextStatus = document.getElementById('nl-context-status');
  const contextSourceSelect = document.getElementById('nl-context-source');
  const contextUrlRow = document.getElementById('nl-context-url-row');
  const contextUrlInput = document.getElementById('nl-context-url');
  const contextUrlLoad = document.getElementById('nl-context-url-load');
  const contextOmnigraphFileList = document.getElementById('nl-context-omnigraph-file-list');
  const contextOmnigraphLoadButton = document.getElementById('nl-context-omnigraph-load');

  const persistContextSelection = (value, urlValue) => {
    chrome.storage.local.set({
      nl_context_source: value,
      nl_context_custom_url: urlValue || ''
    });
  };

  const updateContextSourceUI = () => {
    const value = contextSourceSelect?.value || 'none';
    const isCustom = value === 'custom';
    const isOmnigraph = value === 'omnigraph';
    const needsUrl = isCustom || isOmnigraph;
    const hasContext = contextTextarea?.value.trim().length > 0;

    if (contextUrlRow) {
      contextUrlRow.hidden = !needsUrl;
    }

    // Show/hide file selector vs URL input based on selection
    if (contextOmnigraphFileList) {
      contextOmnigraphFileList.hidden = !isOmnigraph;
    }
    if (contextUrlInput) {
      if (isOmnigraph) {
        // Hide URL input for omnigraph - users select files via checkboxes
        contextUrlInput.style.display = 'none';
      } else if (isCustom) {
        contextUrlInput.style.display = 'block';
        contextUrlInput.placeholder = 'https://example.com/context.json';
      } else {
        contextUrlInput.style.display = 'none';
      }
    }
    if (contextUrlLoad) {
      // Show load button for custom URL, hide for omnigraph (uses Load Selected Files button)
      contextUrlLoad.style.display = isCustom ? 'block' : 'none';
    }

    // Disable textarea when URL options are selected but no content loaded yet
    // Enable when "None" is selected (for manual input) or when content exists
    if (contextTextarea) {
      if (value === 'none') {
        // Always enable when "None" is selected (allows manual paste/upload)
        contextTextarea.disabled = false;
        contextTextarea.placeholder = 'Paste supplemental notes or ontology snippets that should inform the query (optional).';
      } else if (needsUrl && !hasContext) {
        // Disable when URL option is selected but no content loaded yet
        contextTextarea.disabled = true;
        contextTextarea.placeholder = 'Load context from URL to enable editing.';
      } else {
        // Enable when content exists
        contextTextarea.disabled = false;
        contextTextarea.placeholder = 'Paste supplemental notes or ontology snippets that should inform the query (optional).';
      }
    }
  };

  const removeMetadataFields = (context) => {
    // Remove metadata fields that aren't useful for the LLM
    // These are only used for tracking which files were loaded, not for query generation
    const cleaned = JSON.parse(JSON.stringify(context));
    delete cleaned.graph_id;
    delete cleaned.endpoint;
    delete cleaned.source_id;
    delete cleaned.repository_filter;
    delete cleaned.inherits_from;
    return cleaned;
  };

  const loadContextFromSource = async () => {
    const value = contextSourceSelect?.value || 'none';
    const isCustom = value === 'custom';
    const isOmnigraph = value === 'omnigraph';
    const needsUrl = isCustom || isOmnigraph;

    if (value === 'none') {
      setContextStatus('Context source set to none.', 'info');
      return;
    }

    try {
      if (needsUrl) {
        const url = (contextUrlInput?.value || '').trim();
        if (!url) {
          setContextStatus('Enter a URL to load context.', 'warning');
          return;
        }
        if (!/^https:\/\//i.test(url)) {
          setContextStatus('Only https URLs are allowed for context.', 'warning');
          return;
        }
        const text = await loadRemoteContext(url);
        // Parse and clean metadata if it's JSON
        try {
          const parsed = JSON.parse(text);
          const cleaned = removeMetadataFields(parsed);
          const cleanedText = JSON.stringify(cleaned, null, 2);
          applyLoadedContext(cleanedText, url);
        } catch (parseErr) {
          // If not valid JSON, use text as-is (might be plain text context)
          applyLoadedContext(text, url);
        }
        persistContextSelection(value, url);
      }
    } catch (err) {
      console.error('Context load failed', err);
      setContextStatus(err.message || 'Failed to load context.', 'error');
    }
  };

  // Handle omnigraph file loading - load and merge selected files
  const loadSelectedOmnigraphFiles = async () => {
    const checkboxes = contextOmnigraphFileList?.querySelectorAll('.nl-context-omnigraph-checkbox-input:checked');
    if (!checkboxes || checkboxes.length === 0) {
      setContextStatus('Select at least one file to load.', 'warning');
      return;
    }

    const filenames = Array.from(checkboxes).map(cb => cb.value);
    setContextStatus(`Loading ${filenames.length} file(s) from omnigraph repo...`, 'info');

    try {
      const contexts = [];

      // Load all selected files
      for (const filename of filenames) {
        const url = `${OMNIGRAPH_AGENT_BASE_URL}${filename}`;
        const text = await loadRemoteContext(url);
        const parsed = JSON.parse(text);
        contexts.push(parsed);
      }

      // Merge contexts
      const merged = mergeContextFiles(contexts);
      const mergedText = JSON.stringify(merged, null, 2);

      // Update URL input with first file's URL for reference
      if (contextUrlInput && filenames.length > 0) {
        contextUrlInput.value = `${OMNIGRAPH_AGENT_BASE_URL}${filenames[0]}`;
      }

      applyLoadedContext(mergedText, filenames.length === 1 ? filenames[0] : `${filenames.length} files merged`);

      // Persist selection
      const selectedFiles = filenames.join(',');
      chrome.storage.local.set({
        nl_context_source: 'omnigraph',
        nl_context_omnigraph_files: selectedFiles,
        nl_context_custom_url: contextUrlInput?.value || ''
      });
    } catch (err) {
      console.error('Failed to load omnigraph files', err);
      setContextStatus(err.message || 'Failed to load files from omnigraph repo.', 'error');
    }
  };

  contextOmnigraphLoadButton?.addEventListener('click', loadSelectedOmnigraphFiles);

  contextSourceSelect?.addEventListener('change', () => {
    const value = contextSourceSelect?.value || 'none';

    // Update UI visibility first (this hides/shows elements based on selection)
    updateContextSourceUI();

    // Clear context textarea whenever source changes (prepare for new content)
    if (contextTextarea) {
      contextTextarea.value = '';
    }

    // If "None" is selected, clear all context-related state
    if (value === 'none') {
      // Clear omnigraph checkboxes
      if (contextOmnigraphFileList) {
        const checkboxes = contextOmnigraphFileList.querySelectorAll('.nl-context-omnigraph-checkbox-input');
        checkboxes.forEach(cb => cb.checked = false);
      }
      // Clear URL input
      if (contextUrlInput) {
        contextUrlInput.value = '';
      }
      // Clear storage
      chrome.storage.local.set({
        nl_context_source: 'none',
        nl_context_custom_url: '',
        nl_context_omnigraph_files: ''
      });
      setContextStatus('Context cleared.', 'info');
    } else {
      // Reset checkboxes when switching away from omnigraph
      if (contextOmnigraphFileList && value !== 'omnigraph') {
        const checkboxes = contextOmnigraphFileList.querySelectorAll('.nl-context-omnigraph-checkbox-input');
        checkboxes.forEach(cb => cb.checked = false);
      }
      // Update status message based on selection
      if (value === 'omnigraph') {
        setContextStatus('Select one or more files and click "Load Selected Files" to load context.', 'info');
      } else {
        setContextStatus('Enter a URL and click "Load URL" to load context.', 'info');
      }
    }
  });

  contextUrlLoad?.addEventListener('click', loadContextFromSource);

  chrome.storage.local.get(['nl_context_source', 'nl_context_custom_url', 'nl_context_omnigraph_files'], async (result) => {
    const savedSource = result?.nl_context_source || 'none';
    const savedUrl = result?.nl_context_custom_url || '';
    const savedFiles = result?.nl_context_omnigraph_files || '';

    if (contextSourceSelect) {
      contextSourceSelect.value = savedSource;
      updateContextSourceUI();
    }

    // If "None" was saved, ensure context is cleared
    if (savedSource === 'none') {
      if (contextTextarea) {
        contextTextarea.value = '';
      }
      if (contextOmnigraphFileList) {
        const checkboxes = contextOmnigraphFileList.querySelectorAll('.nl-context-omnigraph-checkbox-input');
        checkboxes.forEach(cb => cb.checked = false);
      }
      if (contextUrlInput) {
        contextUrlInput.value = '';
      }
      setContextStatus('Context source set to none.', 'info');
    } else {
      // Restore omnigraph file checkboxes if applicable
      // Note: We restore the UI state but don't auto-load to avoid unnecessary network requests
      // User must explicitly click "Load Selected Files" to fetch content
      if (savedSource === 'omnigraph' && savedFiles && contextOmnigraphFileList) {
        const filenames = savedFiles.split(',').filter(f => f);
        const checkboxes = contextOmnigraphFileList.querySelectorAll('.nl-context-omnigraph-checkbox-input');
        checkboxes.forEach(cb => {
          cb.checked = filenames.includes(cb.value);
        });
        // Don't auto-load - require explicit user action to avoid unnecessary network requests
        if (filenames.length > 0) {
          setContextStatus('Previous file selection restored. Click "Load Selected Files" to load context.', 'info');
        }
      }

      if (contextUrlInput && savedUrl) {
        contextUrlInput.value = savedUrl;
      }
      // Auto-load if there's a saved URL for custom source (but not omnigraph with files, already handled above)
      if (savedUrl && savedSource === 'custom') {
        loadContextFromSource();
      }
    }
    // Update UI state after initial load
    updateContextSourceUI();
  });

  // Clear input button (show/hide based on content)
  const inputClearBtn = document.getElementById('nl-input-clear');
  const updateInputClearVisibility = () => {
    inputClearBtn.style.display = textarea.value.trim() ? 'flex' : 'none';
  };

  textarea.addEventListener('input', updateInputClearVisibility);
  updateInputClearVisibility(); // Initial check

  // Initialize voice input handler
  const voiceBtn = document.getElementById('nl-voice-btn');
  const voiceHandler = new VoiceInputHandler(textarea, voiceBtn, setStatus, updateInputClearVisibility);

  inputClearBtn.addEventListener('click', () => {
    textarea.value = '';
    textarea.focus();
    updateInputClearVisibility();
    // Also stop voice recording if active
    voiceHandler.stop();
  });

  const MAX_CONTEXT_CHARS = 50000;
  const OMNIGRAPH_AGENT_BASE_URL = 'https://raw.githubusercontent.com/twhetzel/omnigraph-agent/main/dist/context/';
  const modelSelect = document.getElementById('nl-model-select');
  const allowedModels = ['gpt-4.1'];
  const DEFAULT_MODEL = 'gpt-4.1';
  const controls = document.getElementById('nl-controls');
  const historyList = document.getElementById('nl-history-list');
  const historyEmpty = document.getElementById('nl-history-empty');
  const historyImportInput = document.getElementById('nl-history-import');
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

  const setContextStatus = (message, type = 'info') => {
    contextStatus.textContent = message;
    contextStatus.setAttribute('data-status-type', type);
    contextStatus.style.display = message ? 'block' : 'none';
  };

  const loadRemoteContext = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch URL (${res.status})`);
    return res.text();
  };

  const mergeContextFiles = (contexts) => {
    if (!contexts || contexts.length === 0) return null;
    if (contexts.length === 1) return removeMetadataFields(contexts[0]);

    // Start with the first context as the base
    const merged = JSON.parse(JSON.stringify(contexts[0]));

    // Merge additional contexts
    for (let i = 1; i < contexts.length; i++) {
      const ctx = contexts[i];

      // Merge entity_types (combine arrays, remove duplicates)
      if (ctx.entity_types && Array.isArray(ctx.entity_types)) {
        merged.entity_types = [...(merged.entity_types || []), ...ctx.entity_types];
        merged.entity_types = [...new Set(merged.entity_types)];
      }

      // Merge dimensions by name
      if (ctx.dimensions && Array.isArray(ctx.dimensions)) {
        const dimensionMap = new Map();
        // Add existing dimensions to map
        (merged.dimensions || []).forEach(dim => {
          dimensionMap.set(dim.name, dim);
        });
        // Merge new dimensions
        ctx.dimensions.forEach(dim => {
          const existing = dimensionMap.get(dim.name);
          if (existing) {
            // Merge: combine top_values, take max coverage, sum distinct values
            const existingValues = new Map();
            (existing.top_values || []).forEach(tv => {
              existingValues.set(tv.value, tv.count);
            });
            (dim.top_values || []).forEach(tv => {
              const currentCount = existingValues.get(tv.value) || 0;
              existingValues.set(tv.value, currentCount + tv.count);
            });
            existing.top_values = Array.from(existingValues.entries())
              .map(([value, count]) => ({ value, count }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 10); // Keep top 10
            existing.coverage = Math.max(existing.coverage || 0, dim.coverage || 0);
            existing.approx_distinct_values = Math.max(
              existing.approx_distinct_values || 0,
              dim.approx_distinct_values || 0
            );
          } else {
            dimensionMap.set(dim.name, JSON.parse(JSON.stringify(dim)));
          }
        });
        merged.dimensions = Array.from(dimensionMap.values());
      }

      // Handle dimension_overrides (merge objects)
      if (ctx.dimension_overrides) {
        merged.dimension_overrides = merged.dimension_overrides || {};
        Object.assign(merged.dimension_overrides, ctx.dimension_overrides);
      }

      // Merge prefixes (combine objects)
      if (ctx.prefixes) {
        merged.prefixes = merged.prefixes || {};
        Object.assign(merged.prefixes, ctx.prefixes);
      }

      // Merge text_blurb (concatenate with separator)
      if (ctx.text_blurb) {
        if (merged.text_blurb) {
          merged.text_blurb = `${merged.text_blurb}\n\n---\n\n${ctx.text_blurb}`;
        } else {
          merged.text_blurb = ctx.text_blurb;
        }
      }

      // Merge example_queries if present
      if (ctx.example_queries && Array.isArray(ctx.example_queries)) {
        merged.example_queries = [...(merged.example_queries || []), ...ctx.example_queries];
      }

      // Note: repository_filter, source_id, inherits_from are metadata fields
      // that will be removed before sending to OpenAI (see cleanup below)
      if (ctx.repository_filter) {
        merged.repository_filter = ctx.repository_filter;
      }
      if (ctx.source_id && !merged.source_id) {
        merged.source_id = ctx.source_id;
      }
    }

    // Remove metadata fields before returning
    return removeMetadataFields(merged);
  };

  const compressContextForAPI = (context) => {
    if (!context || !context.trim()) return context;
    try {
      // Try to parse as JSON
      const parsed = JSON.parse(context);
      // Return compressed JSON (no indentation) to save tokens
      return JSON.stringify(parsed);
    } catch (e) {
      // Not JSON, return as-is (preserve user's text formatting)
      return context;
    }
  };

  const applyLoadedContext = (text, sourceLabel) => {
    const originalLength = (text || '').length;
    const trimmed = (text || '').slice(0, MAX_CONTEXT_CHARS);
    contextTextarea.value = trimmed;

    // Show warning if content was truncated
    if (originalLength > MAX_CONTEXT_CHARS) {
      const truncatedChars = originalLength - MAX_CONTEXT_CHARS;
      setContextStatus(`Loaded context from ${sourceLabel}. WARNING: Content truncated by ${truncatedChars.toLocaleString()} characters (limit: ${MAX_CONTEXT_CHARS.toLocaleString()} chars).`, 'warning');
    } else {
      setContextStatus(sourceLabel ? `Loaded context from ${sourceLabel}.` : 'Context loaded.', 'success');
    }

    // Enable textarea after content is loaded
    if (contextTextarea) {
      contextTextarea.disabled = false;
    }
    updateContextSourceUI();
  };

  const persistHistory = () => {
    chrome.storage.local.set({ [HISTORY_KEY]: historyEntries }, () => {
      if (chrome.runtime?.lastError) {
        console.warn('SPARQLPrompt: failed to persist history', chrome.runtime.lastError);
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
            <button class="nl-history-button" data-action="delete" data-id="${entry.id}" title="Delete this entry">Delete</button>
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
    const message = `Are you sure you want to clear all ${historyEntries.length} history entries?\n\n` +
      `⚠️ This action cannot be undone.\n\n` +
      `Have you exported your history? If not, click "Cancel" and use the "Export JSON" button first.`;
    if (!window.confirm(message)) {
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
    const filename = `sparqlprompt-history-${timestamp}.json`;

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
          console.error('SPARQLPrompt: failed to copy history', err);
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
      console.error('SPARQLPrompt: history export failed', err);
      fallbackToClipboard();
    }
  };

  const findHistoryEntry = id => historyEntries.find(entry => entry.id === id);

  const restoreHistoryEntry = entry => {
    textarea.value = entry.prompt || '';
    contextTextarea.value = entry.context || '';

    // Reset context source UI state when restoring
    // This ensures checkboxes and source selector reflect the restored context
    if (contextSourceSelect) {
      contextSourceSelect.value = 'none';
    }

    // Clear omnigraph checkboxes
    if (contextOmnigraphFileList) {
      const checkboxes = contextOmnigraphFileList.querySelectorAll('.nl-context-omnigraph-checkbox-input');
      checkboxes.forEach(cb => cb.checked = false);
    }

    // Clear URL input
    if (contextUrlInput) {
      contextUrlInput.value = '';
    }

    // Clear saved context source in storage
    chrome.storage.local.set({
      nl_context_source: 'none',
      nl_context_custom_url: '',
      nl_context_omnigraph_files: ''
    });

    // Update UI state (enables textarea if content exists, disables if empty)
    updateContextSourceUI();

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
    setStatus('Pasting history query…', 'info');
    insertIntoYasgui(entry.query)
      .then(() => {
        setStatus('History query pasted successfully.', 'success');
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

  const deleteHistoryEntry = id => {
    const entry = findHistoryEntry(id);
    if (!entry) {
      setStatus('History entry not found.', 'error');
      return;
    }
    const promptPreview = truncate(entry.prompt || '(No prompt)', 50);
    if (!window.confirm(`Delete this history entry?\n\n"${promptPreview}"\n\nThis action cannot be undone.`)) {
      return;
    }
    const index = historyEntries.findIndex(e => e.id === id);
    if (index !== -1) {
      historyEntries.splice(index, 1);
      persistHistory();
      renderHistory();
      setStatus('History entry deleted.', 'success');
    }
  };

  const importHistory = file => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const imported = JSON.parse(e.target.result);
        if (!Array.isArray(imported)) {
          setStatus('Invalid history file format. Expected a JSON array.', 'error');
          return;
        }
        // Validate entries have required fields
        const validEntries = imported.filter(entry => entry && entry.id && (entry.prompt || entry.query));
        if (validEntries.length === 0) {
          setStatus('No valid history entries found in the file.', 'error');
          return;
        }
        // Merge with existing history, avoiding duplicates by ID
        const existingIds = new Set(historyEntries.map(e => e.id));
        const newEntries = validEntries.filter(e => !existingIds.has(e.id));
        if (newEntries.length === 0) {
          setStatus('All entries in the file already exist in history.', 'info');
          return;
        }
        historyEntries = [...historyEntries, ...newEntries].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        // Keep only the most recent 50 entries
        if (historyEntries.length > 50) {
          historyEntries = historyEntries.slice(0, 50);
        }
        persistHistory();
        renderHistory();
        setStatus(`Imported ${newEntries.length} history ${newEntries.length === 1 ? 'entry' : 'entries'}.`, 'success');
      } catch (err) {
        console.error('SPARQLPrompt: failed to import history', err);
        setStatus('Failed to parse history file. Please check the file format.', 'error');
      }
    };
    reader.onerror = () => {
      setStatus('Failed to read history file.', 'error');
    };
    reader.readAsText(file);
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
      case 'delete':
        deleteHistoryEntry(id);
        break;
      default:
        break;
    }
  };

  contextTextarea.addEventListener('input', () => {
    if (contextTextarea.value.length > MAX_CONTEXT_CHARS) {
      contextTextarea.value = contextTextarea.value.slice(0, MAX_CONTEXT_CHARS);
      setContextStatus(`Context trimmed to ${MAX_CONTEXT_CHARS} characters.`, 'warning');
    } else {
      setContextStatus('', 'info');
    }
    // Update disabled state when content changes
    updateContextSourceUI();
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
      // Enable textarea after file is loaded
      if (contextTextarea) {
        contextTextarea.disabled = false;
      }
      updateContextSourceUI();
    };
    reader.onerror = () => {
      setContextStatus('Failed to read context file.', 'error');
    };
    reader.readAsText(file);
    contextFileInput.value = '';
  });

  contextClearButton.addEventListener('click', () => {
    // Clear context textarea
    contextTextarea.value = '';

    // Reset context source selector to "None"
    if (contextSourceSelect) {
      contextSourceSelect.value = 'none';
      updateContextSourceUI();
    }

    // Clear omnigraph checkboxes
    if (contextOmnigraphFileList) {
      const checkboxes = contextOmnigraphFileList.querySelectorAll('.nl-context-omnigraph-checkbox-input');
      checkboxes.forEach(cb => cb.checked = false);
    }

    // Clear URL input
    if (contextUrlInput) {
      contextUrlInput.value = '';
    }

    // Clear storage
    chrome.storage.local.set({
      nl_context_source: 'none',
      nl_context_custom_url: '',
      nl_context_omnigraph_files: ''
    });

    setContextStatus('Context cleared.', 'info');
  });

  const contextHelpButton = document.querySelector('.nl-context-help');
  const contextHelpTooltip = document.getElementById('nl-context-help-tooltip');
  const contextHelpClose = document.querySelector('.nl-context-help-close');

  const showContextHelp = () => {
    if (contextHelpTooltip) {
      contextHelpTooltip.removeAttribute('hidden');
      // Let CSS handle the display
    }
  };

  const hideContextHelp = () => {
    if (contextHelpTooltip) {
      contextHelpTooltip.setAttribute('hidden', '');
      // Let CSS handle the display
    }
  };

  contextHelpButton?.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!contextHelpTooltip) {
      console.error('SPARQLPrompt: context help tooltip not found');
      return;
    }
    const isHidden = contextHelpTooltip.hasAttribute('hidden');
    if (isHidden) {
      showContextHelp();
    } else {
      hideContextHelp();
    }
  });

  contextHelpClose?.addEventListener('click', (e) => {
    e.stopPropagation();
    hideContextHelp();
  });

  // Close tooltip when clicking outside
  document.addEventListener('click', (e) => {
    if (contextHelpTooltip && !contextHelpTooltip.hidden) {
      if (!contextHelpTooltip.contains(e.target) && !contextHelpButton?.contains(e.target)) {
        hideContextHelp();
      }
    }
  });

  historyList?.addEventListener('click', handleHistoryClick);
  historyImportInput?.addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (file) {
      importHistory(file);
      event.target.value = ''; // Reset input so same file can be imported again
    }
  });
  historyExportButton?.addEventListener('click', exportHistory);
  historyClearButton?.addEventListener('click', clearHistory);
  loadHistory();

  chrome.storage.local.get(['openai_model'], ({ openai_model: storedModel }) => {
    if (typeof storedModel === 'string') {
      if (allowedModels.includes(storedModel)) {
        selectedModel = storedModel;
      } else {
        // Migrate any old model selections to the new default
        selectedModel = DEFAULT_MODEL;
        chrome.storage.local.set({ openai_model: selectedModel });
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
  // nl-drag-handle class is now added in HTML

  // Minimize/collapse functionality
  const minimizeBtn = box.querySelector('.nl-minimize-btn');
  const minimizeIcon = box.querySelector('.nl-minimize-icon');
  let positionBeforeCollapse = null; // Store position before minimizing

  const anchorToBottomRight = () => {
    // Use right/bottom positioning for anchoring
    // Clear any left/top that might interfere
    box.style.left = 'auto';
    box.style.top = 'auto';
    box.style.right = '30px';
    box.style.bottom = '30px';
  };

  const restorePositionAfterExpand = () => {
    if (positionBeforeCollapse) {
      box.style.left = `${positionBeforeCollapse.left}px`;
      box.style.top = `${positionBeforeCollapse.top}px`;
      box.style.right = 'auto';
      box.style.bottom = 'auto';
    } else {
      // If no saved position, anchor to bottom-right in expanded state too
      anchorToBottomRight();
    }
  };

  const toggleCollapsed = (collapsed, isInitialLoad = false) => {
    if (collapsed) {
      // Save current position before collapsing (unless it's initial load)
      if (!isInitialLoad) {
        const rect = box.getBoundingClientRect();
        const currentLeft = parseFloat(box.style.left);
        const currentTop = parseFloat(box.style.top);
        if (!Number.isNaN(currentLeft) && !Number.isNaN(currentTop)) {
          positionBeforeCollapse = { left: currentLeft, top: currentTop };
        } else {
          // Calculate from bounding rect if using right/bottom positioning
          positionBeforeCollapse = { left: rect.left, top: rect.top };
        }
        chrome.storage.local.set({ nl_panel_position_before_collapse: positionBeforeCollapse });
      }

      box.classList.add('is-collapsed');
      minimizeIcon.textContent = '+';
      minimizeBtn.setAttribute('aria-label', 'Expand panel');
      minimizeBtn.setAttribute('title', 'Expand');
      anchorToBottomRight();
    } else {
      box.classList.remove('is-collapsed');
      minimizeIcon.textContent = '−';
      minimizeBtn.setAttribute('aria-label', 'Minimize panel');
      minimizeBtn.setAttribute('title', 'Minimize');
      restorePositionAfterExpand();
    }
  };

  minimizeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const isCollapsed = !box.classList.contains('is-collapsed');
    toggleCollapsed(isCollapsed);
    chrome.storage.local.set({ nl_panel_collapsed: isCollapsed });
  });

  // Restore collapsed state and saved position on load
  chrome.storage.local.get(['nl_panel_collapsed', 'nl_panel_position_before_collapse'], (result) => {
    if (result.nl_panel_position_before_collapse) {
      positionBeforeCollapse = result.nl_panel_position_before_collapse;
    }
    if (result.nl_panel_collapsed) {
      toggleCollapsed(true, true);
    }
  });
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
    // Also update positionBeforeCollapse so next collapse/expand cycle uses this position
    if (!box.classList.contains('is-collapsed')) {
      positionBeforeCollapse = { left, top };
      chrome.storage.local.set({ nl_panel_position_before_collapse: positionBeforeCollapse });
    }
  };

  const loadPosition = () => {
    chrome.storage.local.get(['nl_panel_position', 'nl_panel_collapsed'], (result) => {
      // Don't load position if panel is collapsed (it should stay anchored to bottom-right)
      if (result.nl_panel_collapsed) {
        return;
      }
      const saved = result.nl_panel_position;
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
    // Don't start dragging if clicking the minimize button
    if (event.target.closest('.nl-minimize-btn')) return;
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
    // Don't adjust position when collapsed - it stays anchored to bottom-right via CSS
    if (box.classList.contains('is-collapsed')) {
      return;
    }
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
      setStatus('Generate a query before pasting.', 'error');
      return;
    }
    const pasteButton = document.getElementById('nl-paste');
    pasteButton.disabled = true;
    setStatus('Pasting query…', 'info');
    try {
      await insertIntoYasgui(query);
      setStatus('Query pasted successfully.', 'success');
      pasteButton.classList.remove('nl-button--highlight');
    } catch (err) {
      setStatus(err.message || 'Unable to paste query.', 'error');
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
    // Stop voice recording if active
    voiceHandler.stop();

    const prompt = textarea.value.trim();
    if (!prompt) {
      setStatus('Please describe the query you need before converting.', 'error');
      return;
    }
    const contextForHistory = contextTextarea.value.trim();
    // Compress JSON context to save tokens, but preserve plain text formatting
    const context = compressContextForAPI(contextForHistory);
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

            let userContent = context
              ? `Use the following additional context when writing the SPARQL query:\n---\n${context}\n---\n\nRequest:\n${prompt}\n\nIMPORTANT: Include all necessary PREFIX declarations at the beginning of the query.`
              : `Write a SPARQL query for the following request, suitable for the YASGUI endpoint. Include all necessary PREFIX declarations at the beginning of the query. Only return the query, no explanation:\n\n${prompt}`;

            userContent = `EXTENSION_MODE\n\n${userContent}`;

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
              },
              body: JSON.stringify({
                model: selectedModel,
                messages: [
                  { role: 'system', content: 'You are an expert at writing SPARQL queries. You must return ONLY the SPARQL query code with no explanatory text, no comments, and no markdown formatting. Return the raw query only. IMPORTANT: Always include all necessary PREFIX declarations at the beginning of the query so it can run directly without additional setup.' },
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
              context: contextForHistory,
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
