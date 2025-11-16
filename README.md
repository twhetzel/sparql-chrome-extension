# SPARQLPrompt - A Chrome Extension to assist with writing SPARQL queries

## Description
SPARQLPrompt is a Chrome Extension designed for use with the site https://yasgui.triply.cc/# and to generate queries for the Ubergraph endpoint https://ubergraph.apps.renci.org/sparql. SPARQLPrompt allows the user to ask a question about an ontology in natural language and the Extension converts into a SPARQL query. SPARQLPrompt uses OpenAI to convert the natural language question into SPARQL, therefore an OpenAI API key is needed to use the Extension.

## Demo

Watch SPARQLPrompt in action! See how to use the extension to convert natural language questions into SPARQL queries.

**[Demo Video](icons/demo_video.mov)** - A walkthrough demonstrating how to use SPARQLPrompt to generate SPARQL queries from natural language prompts. _Coming soon..._

## Installation
- Clone or download the code. For stable versions, use the [latest release](https://github.com/twhetzel/sparql-chrome-extension/releases.)
- Open your Chrome browser and go to Settings --> Extensions
- Click on "Load unpacked". This will open a file browser. Select the entire folder that contains the Chrome Extension. A new card will be added to your Extensions for the SPARQLPrompt.
- In the upper-right hand side of the browser, click on the Extensions icon and pin the SPARQLPrompt Extension so the icon remains visible in your Chrome browser.
- Click on the SPARQLPrompt icon, which will launch a pop-up window where you can enter your OpenAI API key.
- The OpenAI API key is stored as plain text in `chrome.storage.local` on your machine. Avoid installing this extension on shared machines unless you trust all users. You can clear the saved key by opening Chrome DevTools on `https://yasgui.triply.cc/#` and running:
    ```
    chrome.storage.local.remove('openai_api_key');
    ```
- Navigate to https://yasgui.triply.cc/#. The SPARQLPrompt window will be visible in the bottom right-hand side of the browser.

## Prompting Guidelines
When writing the details of a SPARQL query in plain English be sure to include a mention of these important parts of a SPARQL query:
- what fields should be selected
- what ontology should be queried
- mention whether obsolete terms should be excluded
- mention other conditions that should be matched
- include a Context file for your ontology for detailed instructions to get the most accurate response
- to build up complex queries, start with a basic query and add more conditions as needed for the complexity of the query/information to extract from the ontology.

For detailed information on best practices for prompting to generate SPARQL queries as well as a sample Context file, see the OBO Academy tutorial [Generating SPARQL queries using Large Language Models LLMs](https://oboacademy.github.io/obook/tutorial/sparql-llm/#generating-sparql-queries-using-large-language-models-llms)


## Additional Features
Request new features or post bug reports using the [issue tracker](https://github.com/twhetzel/sparql-chrome-extension/issues).

## OpenAI API Usage and Billing

SPARQLPrompt uses the OpenAI API to generate SPARQL queries. Each query generation consumes API tokens, which may incur costs depending on your OpenAI account plan.

**Pricing Information:**
- SPARQLPrompt currently uses the `gpt-4.1` model
- Current pricing: **$2.00 per 1M input tokens** (as of the latest update)
- For the most up-to-date pricing information, see the [OpenAI Pricing Documentation](https://platform.openai.com/docs/pricing)
- Pricing may vary by model and can change over time

**To check your API usage and billing:**
1. Visit the [OpenAI Platform](https://platform.openai.com/)
2. Sign in to your OpenAI account
3. Navigate to **Usage** in the left sidebar to view:
   - Current usage statistics
   - Token consumption by model
   - Cost breakdown
   - Usage limits and quotas
4. Navigate to **Billing** to view:
   - Payment methods
   - Billing history
   - Current balance
   - Spending limits and alerts

**Tips for managing costs:**
- Monitor your usage regularly through the OpenAI dashboard
- Set up usage alerts to be notified when you approach spending limits
- Consider using the `gpt-4.1` model (currently the only available option) which is optimized for cost-effectiveness
- Export your query history regularly to avoid regenerating queries unnecessarily

## Updating to the Latest Version
1. In your local repository, pull the latest code:
   ```
   git checkout main
   git pull
   ```
2. Open Chrome and navigate to `chrome://extensions/`.
3. Ensure **Developer mode** is enabled (toggle in the upper-right).
4. Locate the SPARQLPrompt card and click the **Reload** button (circular arrow) in the card’s upper-right corner (see the screenshot below).
5. If the SPARQLPrompt window is already open in a YASGUI tab, refresh the page to update the SPARQLPrompt extension.

![Chrome extension reload button](icons/SPARQLPrompt_reload_button.png)

**Note:** This Extension is under development and is not yet available in the Chrome Web Store.
