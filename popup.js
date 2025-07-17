document.getElementById('saveBtn').addEventListener('click', function() {
  const apiKey = document.getElementById('apiKey').value;
  chrome.storage.local.set({ openai_api_key: apiKey }, function() {
    document.getElementById('status').innerText = 'Saved!';
    setTimeout(() => { document.getElementById('status').innerText = ''; }, 1500);
  });
});
