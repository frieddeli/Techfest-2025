/**
 * @fileoverview Background script for the Fact Checker extension.
 * Handles context menu creation, content script injection, and API communication.
 */

// Constants
const MENU_ID = 'factCheckAI';
const API_URL = 'https://api.perplexity.ai/chat/completions';
const MODEL = 'sonar';
const TOKEN_LIMIT = 2048;
const TEMP = 0.1;

/**
 * Creates the context menu item when the extension is installed.
 */
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Fact check with AI',
    contexts: ['selection']
  });
});

/**
 * Handles context menu clicks and initiates the fact checking process.
 * 
 * @param {Object} info - Information about the clicked context menu item and selection
 * @param {Object} tab - Information about the current tab
 */
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID) {
    verifyScriptInjection(tab, info.selectionText);
  }
});

/**
 * Checks if the content script is already injected, injects if needed.
 * 
 * @param {Object} tab - Information about the current tab
 * @param {string} selectedText - The text selected by the user
 */
function verifyScriptInjection(tab, selectedText) {
  chrome.tabs.sendMessage(tab.id, { action: 'checkInjection' }, (response) => {
    if (chrome.runtime.lastError || !response || !response.injected) {
      injectScript(tab, selectedText);
    } else {
      initiateFactCheck(tab.id, selectedText, tab.url);
    }
  });
}

/**
 * Injects the content script into the tab.
 * 
 * @param {Object} tab - Information about the current tab
 * @param {string} selectedText - The text selected by the user
 */
function injectScript(tab, selectedText) {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js']
  }, () => {
    if (chrome.runtime.lastError) {
      console.error('Error injecting script:', chrome.runtime.lastError.message);
      return;
    }
    initiateFactCheck(tab.id, selectedText, tab.url);
  });
}

/**
 * Sends a message to the content script to show loading and initiates fact checking.
 * 
 * @param {number} tabId - The ID of the current tab
 * @param {string} text - The text selected by the user
 * @param {string} url - The URL of the current page
 */
function initiateFactCheck(tabId, text, url) {
  chrome.tabs.sendMessage(tabId, { action: 'showLoading' });

  chrome.storage.sync.get('apiKey', async (data) => {
    if (data.apiKey) {
      try {
        const pageContent = await getPageContent(tabId);
        const result = await queryAI(text, pageContent, url, data.apiKey);
        console.log('Sending fact check result to content script:', result);
        chrome.tabs.sendMessage(tabId, {
          action: 'factCheckResult',
          data: result
        });
      } catch (error) {
        console.error('Error in fact checking:', error);
        reportError(tabId, error.message);
      }
    } else {
      reportError(tabId, 'API Key not found. Please set it in the extension popup.');
    }
  });
}

/**
 * Handles fact check errors by sending an error message to the content script.
 * 
 * @param {number} tabId - The ID of the current tab
 * @param {string} errorMessage - The error message to display
 */
function reportError(tabId, errorMessage) {
  chrome.tabs.sendMessage(tabId, {
    action: 'factCheckError',
    error: errorMessage
  });
}

/**
 * Fetches the content of the current page.
 * 
 * @param {number} tabId - The ID of the current tab
 * @returns {Promise<string>} The text content of the page
 */
async function getPageContent(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => document.body.innerText
    });
    return result;
  } catch (error) {
    console.error('Error fetching page content:', error);
    return '';
  }
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
