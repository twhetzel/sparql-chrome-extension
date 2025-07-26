# SPARQL Assistant Chrome Extension

## Description
The Chrome Extension is designed for use with the site https://yasgui.triply.cc/# and has been tested with the endpoint selection https://ubergraph.apps.renci.org/sparql. The Extension allows the user to ask the SPARQL query in plain English and returns the SPARQL query.

## Installation
- Clone or download the code
- Open your Chrome browser and go to Settings --> Extensions
- Click on "Load unpacked". This will open a file browser. Select the entire folder that contains the Chrome Extension. A new card will be added to your Extensions for the SPARQL Assistant.
- In the upper-right hand side of the browser, click on the Extensions icon and pin the SPARQL Assistant so the icon remains visible.
- Click on the SPARQL Assistant icon, which launch a pop-up window where you can enter your OpenAI API key.
- Navigate to https://yasgui.triply.cc/#. The SPARQL Assistant will be visible in the bottom right-hand side of the browser.

**Note:** This Extension is under development and is not yet available in the Chrome Web Store.

## Prompting Guidelines
When writing the details of a SPARQL query in plain English be sure to include a mention of these important parts of a SPARQL query:
- what fields should be selected
- what ontology should be queried
- mention whether obsolete terms should be excluded
- mention other conditions that should be matched

To build up complex queries, start with a basic query and add more conditions as needed for the complexity of the query/information to extract from the ontology.


## Additional Features
See or add issues to request new features or see what is planned.