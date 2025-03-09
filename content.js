/**
 * @fileoverview Content script for the Fact Checker extension.
 * Handles displaying fact check results in a draggable and resizable box.
 */

(function() {
  // Constants
  const CONTAINER_ID = 'perplexity-fact-check-box';
  const CLOSE_BTN_ID = 'close-fact-check';
  const COPY_BTN_ID = 'copy-result';
  const TRUTH_METER_ID = 'truth-percentage';
  const MIN_SIZE = 200;
  const EDGE_MARGIN = 10;
  const BTN_DELAY = 100;
  const COPY_RESET_DELAY = 2000;
  
  // Prevent multiple injections
  if (window.perplexityFactCheckerInjected) {
    return;
  }
  window.perplexityFactCheckerInjected = true;

  // State variables
  let resultContainer = null;

  /**
   * Listens for messages from the background script.
   */
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received message in content script:', request);
    switch (request.action) {
      case 'checkInjection':
        sendResponse({ injected: true });
        break;
      case 'showLoading':
        displayLoader();
        break;
      case 'factCheckResult':
        displayResult(request.data);
        break;
      case 'factCheckError':
        displayError(request.error);
        break;
    }
  });

  /**
   * Shows loading indicator in the fact check box.
   */
  function displayLoader() {
    if (!resultContainer) {
      resultContainer = createContainer();
    }
    resultContainer.innerHTML = `
      <div class="fact-check-header">
        <h2>Fact Checker</h2>
        <button id="${CLOSE_BTN_ID}">×</button>
      </div>
      <p>Loading... This may take a few moments.</p>
      <div class="loader"></div>
    `;
    resultContainer.style.display = 'block';
    setupCloseButton();
  }

  /**
   * Shows fact check result in the fact check box.
   * 
   * @param {string} result - The raw fact check result from the API
   */
  function displayResult(result) {
    console.log('Showing fact check result:', result);
    if (!resultContainer) {
      resultContainer = createContainer();
    }
    const parsedData = parseResult(result);
    updateContainer(parsedData);
  }

  /**
   * Creates the fact check box element.
   * 
   * @returns {HTMLElement} The created fact check box
   */
  function createContainer() {
    const box = document.createElement('div');
    box.id = CONTAINER_ID;
    document.body.appendChild(box);
    makeInteractive(box);
    return box;
  }

  /**
   * Updates the fact check box with the parsed result.
   * 
   * @param {Object} data - The parsed fact check result
   */
  function updateContainer(data) {
    console.log('Updating fact check box with:', data);
    const colorCode = getColorForTruth(data.truthPercentage);
    console.log('Truth color:', colorCode);
    
    resultContainer.innerHTML = `
      <div class="fact-check-header">
        <h2>Fact Checker</h2>
        <button id="${CLOSE_BTN_ID}">×</button>
      </div>
      <h3 id="${TRUTH_METER_ID}">Truth Percentage: <span style="color: ${colorCode} !important;">${data.truthPercentage}</span></h3>
      <h4>Fact Check:</h4>
      <p>${data.factCheck}</p>
      <h4>Context:</h4>
      <p>${data.context}</p>
      <h4>Sources:</h4>
      <ol>
        ${data.sources.map(source => `<li value="${source.index}"><a href="${source.url}" target="_blank">${source.title}</a></li>`).join('')}
      </ol>
      <button id="${COPY_BTN_ID}">Copy Result</button>
    `;
    
    resultContainer.style.display = 'block';
    setupCloseButton();
    setupCopyButton(data);
  }

  /**
   * Parses the raw fact check result into a structured object.
   * 
   * @param {string} result - The raw fact check result from the API
   * @returns {Object} The parsed result with truthPercentage, factCheck, context, and sources
   */
  function parseResult(result) {
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

    // Replace source references with hyperlinks
    data.factCheck = linkifyReferences(data.factCheck, data.sources);
    data.context = linkifyReferences(data.context, data.sources);

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

  /**
   * Replaces source references in text with hyperlinks.
   * 
   * @param {string} text - The text containing source references
   * @param {Array} sources - The array of source objects
   * @returns {string} The text with source references replaced with hyperlinks
   */
  function linkifyReferences(text, sources) {
    return text.replace(/\[(\d+(?:,\s*\d+)*)\]/g, (match, p1) => {
      const indices = p1.split(',').map(s => s.trim());
      const links = indices.map(index => {
        const source = sources.find(s => s.index === index);
        if (source) {
          return `<a href="${source.url}" target="_blank">[${index}]</a>`;
        }
        return `[${index}]`;
      });
      return links.join(', ');
    });
  }

  /**
   * Gets the color for the truth percentage.
   * 
   * @param {string} percentage - The truth percentage
   * @returns {string} The color for the truth percentage
   */
  function getColorForTruth(percentage) {
    console.log('Received percentage:', percentage);
    const value = parseInt(percentage);
    console.log('Parsed value:', value);
    
    if (isNaN(value)) {
      console.log('Returning black due to NaN');
      return 'black';
    }
    
    if (value >= 80) return 'green';
    if (value >= 60) return 'goldenrod';
    if (value >= 40) return 'orange';
    return 'red';
  }

  /**
   * Shows an error message in the fact check box.
   * 
   * @param {string} message - The error message to display
   */
  function displayError(message) {
    console.error('Showing error:', message);
    if (!resultContainer) {
      resultContainer = createContainer();
    }
    resultContainer.innerHTML = `
      <div class="fact-check-header">
        <h2>Error</h2>
        <button id="${CLOSE_BTN_ID}">×</button>
      </div>
      <p>${message}</p>
    `;
    resultContainer.style.display = 'block';
    setupCloseButton();
  }

  /**
   * Adds a click listener to the close button.
   */
  function setupCloseButton() {
    setTimeout(() => {
      const closeBtn = document.getElementById(CLOSE_BTN_ID);
      if (closeBtn) {
        console.log('Close button found, adding event listener');
        closeBtn.addEventListener('click', () => {
          console.log('Close button clicked');
          if (resultContainer) {
            resultContainer.style.display = 'none';
          }
        });
      } else {
        console.log('Close button not found');
      }
    }, BTN_DELAY);
  }

  /**
   * Adds a click listener to the copy button.
   * 
   * @param {Object} data - The parsed fact check result
   */
  function setupCopyButton(data) {
    const copyBtn = document.getElementById(COPY_BTN_ID);
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const formattedText = formatForClipboard(data);
        navigator.clipboard.writeText(formattedText).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => {
            copyBtn.textContent = 'Copy Result';
          }, COPY_RESET_DELAY);
        });
      });
    }
  }

  /**
   * Formats the result for copying to clipboard.
   * 
   * @param {Object} data - The parsed fact check result
   * @returns {string} The formatted text for copying
   */
  function formatForClipboard(data) {
    return `
Truth Percentage: ${data.truthPercentage}

Fact Check: ${data.factCheck}

Context: ${data.context}

Sources:
${data.sources.map(source => `${source.index}. ${source.title} - ${source.url}`).join('\n')}
    `.trim();
  }

  /**
   * Checks if the user's system is in dark mode.
   * 
   * @returns {boolean} True if the system is in dark mode
   */
  function isDarkMode() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /**
   * Makes an element draggable and resizable.
   * 
   * @param {HTMLElement} element - The element to make draggable and resizable
   */
  function makeInteractive(element) {
    let isResizing = false;
    let isDragging = false;
    let startX, startY, startWidth, startHeight, startLeft, startTop;
    let resizeDirection = '';

    element.addEventListener('mousedown', startInteraction);
    document.addEventListener('mousemove', handleInteraction);
    document.addEventListener('mouseup', endInteraction);
    element.addEventListener('mousemove', updateMouseCursor);

    /**
     * Starts dragging or resizing the element.
     * 
     * @param {MouseEvent} e - The mouse event
     */
    function startInteraction(e) {
      if (isNearBorder(e, element)) {
        isResizing = true;
        resizeDirection = getDirection(e, element);
      } else {
        isDragging = true;
      }
      startX = e.clientX;
      startY = e.clientY;
      startWidth = element.offsetWidth;
      startHeight = element.offsetHeight;
      startLeft = element.offsetLeft;
      startTop = element.offsetTop;
      e.preventDefault();
    }

    /**
     * Handles dragging or resizing the element.
     * 
     * @param {MouseEvent} e - The mouse event
     */
    function handleInteraction(e) {
      if (isResizing) {
        handleResize(e);
      } else if (isDragging) {
        handleDrag(e);
      }
    }

    /**
     * Resizes the element.
     * 
     * @param {MouseEvent} e - The mouse event
     */
    function handleResize(e) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (resizeDirection.includes('w')) {
        element.style.width = `${Math.max(MIN_SIZE, startWidth - dx)}px`;
        element.style.left = `${startLeft + dx}px`;
      } else if (resizeDirection.includes('e')) {
        element.style.width = `${Math.max(MIN_SIZE, startWidth + dx)}px`;
      }

      if (resizeDirection.includes('n')) {
        element.style.height = `${Math.max(MIN_SIZE, startHeight - dy)}px`;
        element.style.top = `${startTop + dy}px`;
      } else if (resizeDirection.includes('s')) {
        element.style.height = `${Math.max(MIN_SIZE, startHeight + dy)}px`;
      }
    }

    /**
     * Drags the element.
     * 
     * @param {MouseEvent} e - The mouse event
     */
    function handleDrag(e) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      element.style.left = `${startLeft + dx}px`;
      element.style.top = `${startTop + dy}px`;
    }

    /**
     * Stops dragging or resizing the element.
     */
    function endInteraction() {
      isResizing = false;
      isDragging = false;
      resizeDirection = '';
      element.style.cursor = 'default';
    }

    /**
     * Updates the cursor based on the mouse position.
     * 
     * @param {MouseEvent} e - The mouse event
     */
    function updateMouseCursor(e) {
      const direction = getDirection(e, element);
      if (direction) {
        element.style.cursor = getCursorStyle(direction);
      } else {
        element.style.cursor = 'move';
      }
    }

    /**
     * Checks if the mouse is near an edge of the element.
     * 
     * @param {MouseEvent} e - The mouse event
     * @param {HTMLElement} element - The element to check
     * @returns {boolean} True if the mouse is near an edge
     */
    function isNearBorder(e, element) {
      const rect = element.getBoundingClientRect();
      return (
        e.clientX < rect.left + EDGE_MARGIN ||
        e.clientX > rect.right - EDGE_MARGIN ||
        e.clientY < rect.top + EDGE_MARGIN ||
        e.clientY > rect.bottom - EDGE_MARGIN
      );
    }

    /**
     * Gets the resize direction based on the mouse position.
     * 
     * @param {MouseEvent} e - The mouse event
     * @param {HTMLElement} element - The element to check
     * @returns {string} The resize direction (n, s, e, w, ne, nw, se, sw)
     */
    function getDirection(e, element) {
      const rect = element.getBoundingClientRect();
      let direction = '';

      if (e.clientY < rect.top + EDGE_MARGIN) direction += 'n';
      else if (e.clientY > rect.bottom - EDGE_MARGIN) direction += 's';

      if (e.clientX < rect.left + EDGE_MARGIN) direction += 'w';
      else if (e.clientX > rect.right - EDGE_MARGIN) direction += 'e';

      return direction;
    }

    /**
     * Gets the cursor style based on the resize direction.
     * 
     * @param {string} direction - The resize direction
     * @returns {string} The cursor style
     */
    function getCursorStyle(direction) {
      switch (direction) {
        case 'n':
        case 's':
          return 'ns-resize';
        case 'e':
        case 'w':
          return 'ew-resize';
        case 'nw':
        case 'se':
          return 'nwse-resize';
        case 'ne':
        case 'sw':
          return 'nesw-resize';
        default:
          return 'move';
      }
    }
  }

  /**
   * Checks if the user's system is in dark mode.
   * 
   * @returns {boolean} True if the system is in dark mode
   */
  function isDarkMode() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /**
   * Creates and appends the styles for the fact check box.
   */
  const style = document.createElement('style');
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Satoshi:wght@400;700&display=swap');

    #${CONTAINER_ID} {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 300px;
      height: 400px;
      min-width: ${MIN_SIZE}px;
      min-height: ${MIN_SIZE}px;
      max-width: 80vw;
      max-height: 80vh;
      overflow-y: auto;
      background-color: ${isDarkMode() ? '#333' : 'white'};
      color: ${isDarkMode() ? 'white' : 'black'} !important;
      border: 1px solid #ccc;
      border-radius: 10px;
      padding: 15px;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
      z-index: 9999;
      font-family: 'Satoshi', sans-serif !important;
    }
    #${CONTAINER_ID} * {
      font-family: 'Satoshi', sans-serif !important;
      color: ${isDarkMode() ? 'white' : 'black'} !important;
    }
    #${CONTAINER_ID} .fact-check-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    #${CONTAINER_ID} h2 {
      margin: 0;
      text-align: center;
      width: 100%;
      font-size: 24px;
    }
    #${CONTAINER_ID} h3 {
      text-align: center;
      font-size: 20px;
      margin-top: 0;
      margin-bottom: 25px;
    }
    #${CONTAINER_ID} h4 {
      margin-top: 20px;
      margin-bottom: 10px;
      font-size: 18px;
    }
    #${CONTAINER_ID} p, #${CONTAINER_ID} li {
      font-size: 14px;
      line-height: 1.4;
    }
    #${CONTAINER_ID} a {
      color: ${isDarkMode() ? '#add8e6' : '#0000EE'} !important;
      text-decoration: none;
    }
    #${CONTAINER_ID} a:hover {
      text-decoration: underline;
    }
    #${CLOSE_BTN_ID} {
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: ${isDarkMode() ? 'white' : 'black'} !important;
      position: absolute;
      top: 10px;
      right: 10px;
    }
    #${COPY_BTN_ID} {
      display: block;
      margin-top: 15px;
      padding: 5px 10px;
      background-color: #4CAF50;
      color: white !important;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-size: 14px;
    }
    #${COPY_BTN_ID}:hover {
      background-color: #45a049;
    }
    .loader {
      border: 5px solid #f3f3f3;
      border-top: 5px solid #3498db;
      border-radius: 50%;
      width: 50px;
      height: 50px;
      animation: spin 1s linear infinite;
      margin: 20px auto;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
})();
