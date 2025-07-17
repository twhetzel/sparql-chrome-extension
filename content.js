// Inject UI
function escapeHtml(text) {
  var map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

function injectUI() {
  // Inject highlight.js CSS if not already present
  if (!document.getElementById('hljs-css')) {
    const hljsCss = document.createElement('link');
    hljsCss.id = 'hljs-css';
    hljsCss.rel = "stylesheet";
    hljsCss.href = chrome.runtime.getURL("css/github.min.css");
    document.head.appendChild(hljsCss);
  }

  // Inject highlight.js JS if not already present
  if (!document.getElementById('hljs-js')) {
    const hljsScript = document.createElement('script');
    hljsScript.id = 'hljs-js';
    hljsScript.src = chrome.runtime.getURL("js/highlight.min.js");
    hljsScript.onload = () => {
      window.hljs && window.hljs.highlightAll();
    };
    document.head.appendChild(hljsScript);
  }


  if (document.getElementById('nl-to-sparql-box')) return; // Avoid double inject
  const box = document.createElement('div');
  box.id = 'nl-to-sparql-box';
  box.style = 'position:fixed;bottom:30px;right:30px;z-index:10000;background:white;padding:16px;border-radius:8px;box-shadow:0 2px 12px #888;max-width:400px;';
  box.innerHTML = `
    <b>Ask your SPARQL query:</b>
    <textarea id="nl-input" rows="3" style="width:100%;height:80px;resize:none;"></textarea>
    <div style="margin:6px 0 8px 0; text-align:center;">
      <input type="range" id="height-slider" min="40" max="250" value="80" style="width: 60%;">
    </div>
    <button id="nl-submit">Convert</button>
    <div id="sparql-output" style="margin-top:1em;word-break:break-word;"></div>
  `;
  
  document.body.appendChild(box);

  const heightSlider = document.getElementById('height-slider');
  const textarea = document.getElementById('nl-input');
  heightSlider.addEventListener('input', () => {
    textarea.style.height = `${heightSlider.value}px`;
  });


document.getElementById('nl-submit').onclick = function() {
    const text = document.getElementById('nl-input').value;
    document.getElementById('sparql-output').innerHTML = 'Generating SPARQL...';

    try {
      chrome.storage.local.get(['openai_api_key'], function(result) {
        (async () => {
          try {
            const apiKey = result.openai_api_key;
            if (!apiKey) {
              document.getElementById('sparql-output').innerHTML = 'API key missing!';
              return;
            }
            const messages = [
              { role: "system", content: "You are an expert at writing SPARQL queries." },
              { role: "user", content: `Write a SPARQL query for the following request, suitable for the YASGUI endpoint. Only return the query, no explanation:\n\n${text}` }
            ];
            const completion = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + apiKey
              },
              body: JSON.stringify({
                model: "gpt-4o",
                messages: messages,
                max_tokens: 512,
                temperature: 0
              })
            }).then(r => r.json());

            const sparql = completion?.choices?.[0]?.message?.content || "Error generating query";
            document.getElementById('sparql-output').innerHTML =
              `<pre><code class="sparql">${escapeHtml(sparql)}</code></pre>`;
            if (window.hljs) window.hljs.highlightAll();

            try {
              const yasqeTextarea = document.querySelector('.yasqe textarea');
              if (yasqeTextarea) {
                yasqeTextarea.value = sparql;
                yasqeTextarea.dispatchEvent(new Event('change', { bubbles: true }));
              }
            } catch (e) {
              // fallback: nothing
            }
          } catch (err) {
            document.getElementById('sparql-output').innerHTML =
              "Error: Extension context lost. Try reloading the page and the extension.";
          }
        })();
      });
    } catch (e) {
      document.getElementById('sparql-output').innerHTML =
        "Error: Extension context lost (outer). Try reloading the page and the extension.";
    }
  };
}

window.addEventListener('load', injectUI);