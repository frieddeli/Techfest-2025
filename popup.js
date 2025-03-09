/**
 * @fileoverview Popup script for the Fact Checker extension.
 * Handles API key management and fact checking in the popup UI.
 */

// Constants
const MSG_DISPLAY_TIME = 2000; // 2 seconds
const API_URL = 'https://api.perplexity.ai/chat/completions';
const MODEL = 'sonar';
const TOKEN_LIMIT = 2048;
const TEMP = 0.1;

/**
 * Initializes the popup when the DOM content is loaded.
 */
document.addEventListener('DOMContentLoaded', () => {
  // Get DOM elements
  const settingsIcon = document.getElementById('settingsIcon');
  const apiKeySection = document.getElementById('apiKeySection');
  const saveApiKeyBtn = document.getElementById('saveApiKey');
  const keyInput = document.getElementById('apiKey');
  const submitQueryBtn = document.getElementById('submitQuery');
  const queryTextarea = document.getElementById('queryText');
  const resultSection = document.getElementById('resultSection');
  const factCheckResult = document.getElementById('factCheckResult');
  const statusMsg = document.getElementById('status');

  // Load the saved API key
  loadStoredKey(keyInput);

  // Toggle API key section when settings icon is clicked
  settingsIcon.addEventListener('click', () => {
    apiKeySection.classList.toggle('hidden');
  });

  // Save the API key when the button is clicked
  saveApiKeyBtn.addEventListener('click', () => {
    storeKey(keyInput.value.trim(), statusMsg);
  });

  // Also save when Enter key is pressed in the API key input field
  keyInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      storeKey(keyInput.value.trim(), statusMsg);
    }
  });

  // Submit query when the button is clicked
  submitQueryBtn.addEventListener('click', () => {
    const queryText = queryTextarea.value.trim();
    if (queryText) {
      submitFactCheck(queryText, factCheckResult, resultSection, statusMsg);
    } else {
      showStatus(statusMsg, 'Please enter text to fact check.', 'error');
    }
  });
});

/**
 * Loads the saved API key from storage and populates the input field.
 * 
 * @param {HTMLInputElement} inputElement - The API key input element
 */
function loadStoredKey(inputElement) {
  chrome.storage.sync.get('apiKey', (data) => {
    if (data.apiKey) {
      inputElement.value = data.apiKey;
    }
  });
}

/**
 * Saves the API key to storage and displays a status message.
 * 
 * @param {string} apiKey - The API key to save
 * @param {HTMLElement} statusElement - The status display element
 */
function storeKey(apiKey, statusElement) {
  if (apiKey) {
    chrome.storage.sync.set({ apiKey }, () => {
      showStatus(statusElement, 'API Key saved!', 'success');
    });
  } else {
    showStatus(statusElement, 'Please enter a valid API Key.', 'error');
  }
}

/**
 * Submits text for fact checking using the Perplexity API.
 * 
 * @param {string} text - The text to fact check
 * @param {HTMLElement} resultElement - The element to display the result in
 * @param {HTMLElement} resultSection - The section containing the result
 * @param {HTMLElement} statusElement - The status display element
 */
function submitFactCheck(text, resultElement, resultSection, statusElement) {
  chrome.storage.sync.get('apiKey', async (data) => {
    if (!data.apiKey) {
      showStatus(statusElement, 'API Key not found. Please set it in the settings.', 'error');
      return;
    }

    try {
      showStatus(statusElement, 'Checking facts...', 'success');
      resultElement.innerHTML = '<p>Loading... This may take a few moments.</p>';
      resultSection.classList.remove('hidden');

      const result = await queryAI(text, '', window.location.href, data.apiKey);
      
      resultElement.innerHTML = formatResult(result);
    } catch (error) {
      console.error('Error in fact checking:', error);
      resultSection.classList.add('hidden');
      showStatus(statusElement, `Error: ${error.message}`, 'error');
    }
  });
}

/**
 * Formats the fact check result for display.
 * 
 * @param {string} result - The raw fact check result
 * @returns {string} The formatted HTML for display
 */
function formatResult(result) {
  // Convert markdown links to HTML
  const linkified = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  
  // Convert newlines to <br> tags
  return linkified.replace(/\n/g, '<br>');
}

/**
 * Performs fact checking using the Perplexity AI API.
 * 
 * @param {string} text - The text to fact check
 * @param {string} contextText - The surrounding context from the page
 * @param {string} url - The URL of the current page
 * @param {string} apiKey - The Perplexity API key
 * @returns {Promise<string>} The fact check result
 */
async function queryAI(text, contextText, url, apiKey) {
  const systemPrompt = `You are a multilingual fact-checking assistant. Your primary tasks are:

1. Detect the language of the given text.
2. Respond in the same language as the detected language of the input text.
3. Focus specifically on fact-checking the given selected text, not the entire article or page.
4. Find and provide reliable sources for the claims in the selected text, ensuring they are from different domains and strictly related to the subject.
5. Aim to provide 5-10 sources, prioritizing diversity of domains. Do not invent sources or include unrelated sources.
6. Provide a truth percentage based on the reliability and consensus of the sources. The percentage should reflect how well the selected text is supported by the sources, not the number of sources found.
7. Write a fact check (3-4 concise sentences) that directly addresses the claims in the selected text.
8. Provide context (3-4 concise sentences) that places the selected text within the broader topic or article it's from.

Format your response EXACTLY as follows, in the detected language:

Sources:
1. [source 1 title](URL)
2. [source 2 title](URL)
...

Truth: [percentage]

Fact Check: [your fact check with inline source references, e.g. [1], [2], etc.]

Context: [your context with inline source references, e.g. [1], [2], etc.]

If you cannot find enough reliable sources to fact-check the statement, say so explicitly and explain why. If a claim is widely accepted as common knowledge, state this and provide general reference sources.`;

  const userPrompt = `Fact check the following selected text: "${text}"\n\nBroader context from the page:\n${contextText}\n\nPage URL: ${url}`;

  const options = {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: TOKEN_LIMIT,
      temperature: TEMP,
      return_citations: true
    })
  };

  const response = await fetch(API_URL, options);
  const result = await response.json();

  console.log('Perplexity API response:', result);

  if (result.choices && result.choices.length > 0) {
    return result.choices[0].message.content;
  } else {
    throw new Error('Invalid response from Perplexity API');
  }
}

/**
 * Displays a status message for a limited time.
 * 
 * @param {HTMLElement} element - The element to display the status in
 * @param {string} message - The message to display
 * @param {string} className - The CSS class to apply to the status element
 */
function showStatus(element, message, className) {
  element.textContent = message;
  element.className = className;
  
  setTimeout(() => {
    element.textContent = '';
    element.className = '';
  }, MSG_DISPLAY_TIME);
}
