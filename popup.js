(function() {
  const apiInput = document.getElementById('apiKey');
  const saveButton = document.getElementById('saveBtn');
  const status = document.getElementById('status');
  const closeButton = document.querySelector('.popup-close');

  const API_KEY_REGEX = /^sk-[A-Za-z0-9_-]{20,}$/;

  function updateButtonState() {
    const hasText = apiInput.value.trim().length > 0;
    saveButton.disabled = !hasText;
  }

  apiInput.addEventListener('input', updateButtonState);
  updateButtonState();

  function setStatusMessage(message, type = 'info') {
    status.innerText = message;
    if (type === 'error') {
      status.setAttribute('data-status', 'error');
    } else {
      status.removeAttribute('data-status');
    }
    status.style.display = message ? 'block' : 'none';
  }

  saveButton.addEventListener('click', function() {
    const apiKey = apiInput.value.trim();
    if (!apiKey) {
      setStatusMessage('\u26A0\uFE0F Enter your API key before saving.', 'error');
      return;
    }
    if (!API_KEY_REGEX.test(apiKey)) {
      setStatusMessage('\u26A0\uFE0F That does not look like a valid OpenAI API key.', 'error');
      return;
    }
    chrome.storage.local.set({ openai_api_key: apiKey }, function() {
      setStatusMessage('Saved!', 'info');
      setTimeout(() => { setStatusMessage('', 'info'); }, 1500);
    });
  });

  closeButton?.addEventListener('click', () => {
    window.close();
  });

  setStatusMessage('', 'info');
})();
