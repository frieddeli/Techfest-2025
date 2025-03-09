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

  chrome.storage.sync.get(['apiKey', 'groqApiKey', 'toolhouseApiKey'], async (data) => {
    if (!data.apiKey && !data.groqApiKey) {
      reportError(tabId, 'No API Keys found. Please set at least one API Key in the extension popup.');
      return;
    }

    try {
      const pageContent = await getPageContent(tabId);
      
      let perplexityResult = null;
      let groqResult = null;

      // Run API calls in parallel if both keys are available
      const promises = [];
      
      if (data.apiKey) {
        promises.push(
          queryPerplexityAI(text, pageContent, url, data.apiKey)
            .then(result => { perplexityResult = result; })
            .catch(error => { console.error('Perplexity API error:', error); })
        );
      }
      
      if (data.groqApiKey && data.toolhouseApiKey) {
        promises.push(
          queryGroqWithToolhouse(text, data.groqApiKey, data.toolhouseApiKey)
            .then(result => { groqResult = result; })
            .catch(error => { console.error('Groq/Toolhouse API error:', error); })
        );
      }
      
      await Promise.all(promises);
      
      // Aggregate results
      const aggregatedResult = aggregateResults(perplexityResult, groqResult);
      
      console.log('Sending fact check result to content script:', aggregatedResult);
      chrome.tabs.sendMessage(tabId, {
        action: 'factCheckResult',
        data: aggregatedResult
      });
    } catch (error) {
      console.error('Error in fact checking:', error);
      reportError(tabId, error.message);
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
async function queryPerplexityAI(text, contextText, url, apiKey) {
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
 * Performs fact checking using Groq API with Toolhouse for web search.
 * 
 * @param {string} text - The text to fact check
 * @param {string} groqApiKey - The Groq API key
 * @param {string} toolhouseApiKey - The Toolhouse API key
 * @returns {Promise<string>} The fact check result
 */
async function queryGroqWithToolhouse(text, groqApiKey, toolhouseApiKey) {
  // First, use Toolhouse to perform a web search
  const searchResults = await performToolhouseSearch(text, toolhouseApiKey);
  
  // Then, use Groq to analyze the search results and fact check
  return queryGroqAI(text, searchResults, groqApiKey);
}

/**
 * Performs a web search using the Toolhouse API.
 * 
 * @param {string} query - The search query
 * @param {string} apiKey - The Toolhouse API key
 * @returns {Promise<string>} The search results
 */
async function performToolhouseSearch(query, apiKey) {
  const TOOLHOUSE_API_URL = 'https://api.toolhouse.ai/v1/search';
  
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      query: `Find reliable sources to fact check: ${query}`,
      num_results: 5,
      include_domains: [],
      exclude_domains: [],
      time_period: 'any'
    })
  };

  try {
    const response = await fetch(TOOLHOUSE_API_URL, options);
    const data = await response.json();
    
    console.log('Toolhouse API response:', data);
    
    if (data.results && data.results.length > 0) {
      // Format the search results for Groq
      return data.results.map((result, index) => {
        return `Source ${index + 1}: ${result.title}\nURL: ${result.url}\nSnippet: ${result.snippet}\n\n`;
      }).join('');
    } else {
      return 'No search results found.';
    }
  } catch (error) {
    console.error('Error with Toolhouse API:', error);
    throw new Error('Failed to perform web search with Toolhouse');
  }
}

/**
 * Performs fact checking using the Groq API.
 * 
 * @param {string} text - The text to fact check
 * @param {string} searchResults - The search results from Toolhouse
 * @param {string} apiKey - The Groq API key
 * @returns {Promise<string>} The fact check result
 */
async function queryGroqAI(text, searchResults, apiKey) {
  const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
  const GROQ_MODEL = 'llama3-70b-8192';
  
  const systemPrompt = `You are a multilingual fact-checking assistant. Your primary tasks are:

1. Detect the language of the given text.
2. Respond in the same language as the detected language of the input text.
3. Focus specifically on fact-checking the given selected text, not the entire article or page.
4. Analyze the provided search results to find reliable sources for the claims in the selected text.
5. Provide a truth percentage based on the reliability and consensus of the sources. The percentage should reflect how well the selected text is supported by the sources.
6. Write a fact check (3-4 concise sentences) that directly addresses the claims in the selected text.
7. Provide context (3-4 concise sentences) that places the selected text within the broader topic.

Format your response EXACTLY as follows, in the detected language:

Sources:
1. [source 1 title](URL)
2. [source 2 title](URL)
...

Truth: [percentage]

Fact Check: [your fact check with inline source references, e.g. [1], [2], etc.]

Context: [your context with inline source references, e.g. [1], [2], etc.]

If you cannot find enough reliable sources to fact-check the statement, say so explicitly and explain why. If a claim is widely accepted as common knowledge, state this and provide general reference sources.`;

  const userPrompt = `Fact check the following selected text: "${text}"\n\nSearch results:\n${searchResults}`;

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 2048,
      temperature: 0.1
    })
  };

  try {
    const response = await fetch(GROQ_API_URL, options);
    const result = await response.json();
    
    console.log('Groq API response:', result);
    
    if (result.choices && result.choices.length > 0) {
      return result.choices[0].message.content;
    } else {
      throw new Error('Invalid response from Groq API');
    }
  } catch (error) {
    console.error('Error with Groq API:', error);
    throw new Error('Failed to perform fact check with Groq');
  }
}

/**
 * Aggregates results from Perplexity and Groq.
 * 
 * @param {string} perplexityResult - The result from Perplexity API
 * @param {string} groqResult - The result from Groq API
 * @returns {string} The aggregated result
 */
function aggregateResults(perplexityResult, groqResult) {
  // If only one result is available, return it
  if (!perplexityResult && groqResult) return groqResult;
  if (perplexityResult && !groqResult) return perplexityResult;
  if (!perplexityResult && !groqResult) return 'No results available from either API.';
  
  // Parse both results
  const perplexityData = parseResult(perplexityResult);
  const groqData = parseResult(groqResult);
  
  // Combine sources (removing duplicates)
  const combinedSources = [...perplexityData.sources];
  
  groqData.sources.forEach(groqSource => {
    // Check if this source URL already exists in the combined sources
    const exists = combinedSources.some(source => source.url === groqSource.url);
    if (!exists) {
      // Add with a new index
      combinedSources.push({
        index: (combinedSources.length + 1).toString(),
        title: groqSource.title,
        url: groqSource.url
      });
    }
  });
  
  // Calculate average truth percentage
  let avgTruth = 'N/A';
  if (perplexityData.truthPercentage !== 'N/A' && groqData.truthPercentage !== 'N/A') {
    const perplexityTruth = parseInt(perplexityData.truthPercentage);
    const groqTruth = parseInt(groqData.truthPercentage);
    
    if (!isNaN(perplexityTruth) && !isNaN(groqTruth)) {
      avgTruth = Math.round((perplexityTruth + groqTruth) / 2) + '%';
    }
  } else if (perplexityData.truthPercentage !== 'N/A') {
    avgTruth = perplexityData.truthPercentage;
  } else if (groqData.truthPercentage !== 'N/A') {
    avgTruth = groqData.truthPercentage;
  }
  
  // Format the aggregated result
  return `Sources:
${combinedSources.map((source, i) => `${i + 1}. [${source.title}](${source.url})`).join('\n')}

Truth: ${avgTruth}

Fact Check (Perplexity): ${perplexityData.factCheck}

Fact Check (Groq): ${groqData.factCheck}

Context: ${perplexityData.context}

Additional Context: ${groqData.context}`;
}

/**
 * Parses the raw fact check result into a structured object.
 * 
 * @param {string} result - The raw fact check result from the API
 * @returns {Object} The parsed result with truthPercentage, factCheck, context, and sources
 */
function parseResult(result) {
  if (!result) {
    return {
      truthPercentage: 'N/A',
      factCheck: 'No fact check provided.',
      context: 'No context provided.',
      sources: []
    };
  }
  
  console.log('Parsing raw result:', result);

  const sections = result.split('\n\n');
  const data = {
    truthPercentage: 'N/A',
    factCheck: 'No fact check provided.',
    context: 'No context provided.',
    sources: []
  };

  let currentSection = '';

  sections.forEach(section => {
    if (section.startsWith('Sources:')) {
      currentSection = 'sources';
      extractSources(section, data);
    } else if (section.startsWith('Truth:')) {
      currentSection = 'truth';
      data.truthPercentage = section.split(':')[1].trim();
    } else if (section.startsWith('Fact Check:')) {
      currentSection = 'factCheck';
      data.factCheck = section.split(':').slice(1).join(':').trim();
    } else if (section.startsWith('Context:')) {
      currentSection = 'context';
      data.context = section.split(':').slice(1).join(':').trim();
    } else if (currentSection === 'factCheck') {
      data.factCheck += ' ' + section.trim();
    } else if (currentSection === 'context') {
      data.context += ' ' + section.trim();
    }
  });

  console.log('Parsed result:', data);
  return data;
}

/**
 * Parses the sources section of the fact check result.
 * 
 * @param {string} section - The sources section text
 * @param {Object} data - The result object to update with sources
 */
function extractSources(section, data) {
  const sourceLines = section.split('\n').slice(1);
  console.log('Source lines:', sourceLines);
  
  sourceLines.forEach(line => {
    const match = line.match(/(\d+)\.\s+(.+)/);
    if (match) {
      const [, index, content] = match;
      const urlMatch = content.match(/\[(.+?)\]\((.+?)\)/);
      if (urlMatch) {
        data.sources.push({ index, title: urlMatch[1], url: urlMatch[2] });
      } else {
        data.sources.push({ index, title: content, url: '#' });
      }
    }
  });
}
