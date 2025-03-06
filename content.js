/**
 * @fileoverview Content script for the Fact Checker extension.
 * Handles displaying fact check results in a draggable and resizable box.
 */

(function() {
  // Constants
  const BOX_ID = 'perplexity-fact-check-box';
  const CLOSE_BUTTON_ID = 'close-fact-check';
  const COPY_BUTTON_ID = 'copy-result';
  const TRUTH_PERCENTAGE_ID = 'truth-percentage';
  const MIN_BOX_SIZE = 200;
  const EDGE_THRESHOLD = 10;
  const CLOSE_BUTTON_DELAY = 100;
  const COPY_BUTTON_RESET_DELAY = 2000;
  
  // Prevent multiple injections
  if (window.perplexityFactCheckerInjected) {
    return;
  }
  window.perplexityFactCheckerInjected = true;

  // State variables
  let factCheckBox = null;

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
        showLoading();
        break;
      case 'factCheckResult':
        showFactCheckResult(request.data);
        break;
      case 'factCheckError':
        showError(request.error);
        break;
    }
  });

  /**
   * Shows loading indicator in the fact check box.
   */
  function showLoading() {
    if (!factCheckBox) {
      factCheckBox = createFactCheckBox();
    }
    factCheckBox.innerHTML = `
      <div class="fact-check-header">
        <h2>Fact Checker</h2>
        <button id="${CLOSE_BUTTON_ID}">×</button>
      </div>
      <p>Loading... This may take a few moments.</p>
      <div class="loader"></div>
    `;
    factCheckBox.style.display = 'block';
    addCloseButtonListener();
  }

  /**
   * Shows fact check result in the fact check box.
   * 
   * @param {string} result - The raw fact check result from the API
   */
  function showFactCheckResult(result) {
    console.log('Showing fact check result:', result);
    if (!factCheckBox) {
      factCheckBox = createFactCheckBox();
    }
    const parsedResult = parseFactCheckResult(result);
    updateFactCheckBox(parsedResult);
  }

  /**
   * Creates the fact check box element.
   * 
   * @returns {HTMLElement} The created fact check box
   */
  function createFactCheckBox() {
    const box = document.createElement('div');
    box.id = BOX_ID;
    document.body.appendChild(box);
    makeDraggableAndResizable(box);
    return box;
  }

  /**
   * Updates the fact check box with the parsed result.
   * 
   * @param {Object} result - The parsed fact check result
   */
  function updateFactCheckBox(result) {
    console.log('Updating fact check box with:', result);
    const truthColor = getTruthColor(result.truthPercentage);
    console.log('Truth color:', truthColor);
    
    factCheckBox.innerHTML = `
      <div class="fact-check-header">
        <h2>Fact Checker</h2>
        <button id="${CLOSE_BUTTON_ID}">×</button>
      </div>
      <h3 id="${TRUTH_PERCENTAGE_ID}">Truth Percentage: <span style="color: ${truthColor} !important;">${result.truthPercentage}</span></h3>
      <h4>Fact Check:</h4>
      <p>${result.factCheck}</p>
      <h4>Context:</h4>
      <p>${result.context}</p>
      <h4>Sources:</h4>
      <ol>
        ${result.sources.map(source => `<li value="${source.index}"><a href="${source.url}" target="_blank">${source.title}</a></li>`).join('')}
      </ol>
      <button id="${COPY_BUTTON_ID}">Copy Result</button>
    `;
    
    factCheckBox.style.display = 'block';
    addCloseButtonListener();
    addCopyButtonListener(result);
  }

  /**
   * Parses the raw fact check result into a structured object.
   * 
   * @param {string} result - The raw fact check result from the API
   * @returns {Object} The parsed result with truthPercentage, factCheck, context, and sources
   */
  function parseFactCheckResult(result) {
    console.log('Parsing raw result:', result);

    const sections = result.split('\n\n');
    const parsedResult = {
      truthPercentage: 'N/A',
      factCheck: 'No fact check provided.',
      context: 'No context provided.',
      sources: []
    };

    let currentSection = '';

    sections.forEach(section => {
      if (section.startsWith('Sources:')) {
        currentSection = 'sources';
        parseSourcesSection(section, parsedResult);
      } else if (section.startsWith('Truth:')) {
        currentSection = 'truth';
        parsedResult.truthPercentage = section.split(':')[1].trim();
      } else if (section.startsWith('Fact Check:')) {
        currentSection = 'factCheck';
        parsedResult.factCheck = section.split(':').slice(1).join(':').trim();
      } else if (section.startsWith('Context:')) {
        currentSection = 'context';
        parsedResult.context = section.split(':').slice(1).join(':').trim();
      } else if (currentSection === 'factCheck') {
        parsedResult.factCheck += ' ' + section.trim();
      } else if (currentSection === 'context') {
        parsedResult.context += ' ' + section.trim();
      }
    });

    console.log('Parsed result:', parsedResult);

    // Replace source references with hyperlinks
    parsedResult.factCheck = replaceSourceReferences(parsedResult.factCheck, parsedResult.sources);
    parsedResult.context = replaceSourceReferences(parsedResult.context, parsedResult.sources);

    return parsedResult;
  }

  /**
   * Parses the sources section of the fact check result.
   * 
   * @param {string} section - The sources section text
   * @param {Object} parsedResult - The result object to update with sources
   */
  function parseSourcesSection(section, parsedResult) {
    const sourceLines = section.split('\n').slice(1);
    console.log('Source lines:', sourceLines);
    
    sourceLines.forEach(line => {
      const match = line.match(/(\d+)\.\s+(.+)/);
      if (match) {
        const [, index, content] = match;
        const urlMatch = content.match(/\[(.+?)\]\((.+?)\)/);
        if (urlMatch) {
          parsedResult.sources.push({ index, title: urlMatch[1], url: urlMatch[2] });
        } else {
          parsedResult.sources.push({ index, title: content, url: '#' });
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
  function replaceSourceReferences(text, sources) {
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
  function getTruthColor(percentage) {
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
  function showError(message) {
    console.error('Showing error:', message);
    if (!factCheckBox) {
      factCheckBox = createFactCheckBox();
    }
    factCheckBox.innerHTML = `
      <div class="fact-check-header">
        <h2>Error</h2>
        <button id="${CLOSE_BUTTON_ID}">×</button>
      </div>
      <p>${message}</p>
    `;
    factCheckBox.style.display = 'block';
    addCloseButtonListener();
  }

  /**
   * Adds a click listener to the close button.
   */
  function addCloseButtonListener() {
    setTimeout(() => {
      const closeButton = document.getElementById(CLOSE_BUTTON_ID);
      if (closeButton) {
        console.log('Close button found, adding event listener');
        closeButton.addEventListener('click', () => {
          console.log('Close button clicked');
          if (factCheckBox) {
            factCheckBox.style.display = 'none';
          }
        });
      } else {
        console.log('Close button not found');
      }
    }, CLOSE_BUTTON_DELAY);
  }

  /**
   * Adds a click listener to the copy button.
   * 
   * @param {Object} result - The parsed fact check result
   */
  function addCopyButtonListener(result) {
    const copyButton = document.getElementById(COPY_BUTTON_ID);
    if (copyButton) {
      copyButton.addEventListener('click', () => {
        const textToCopy = formatTextForCopy(result);
        navigator.clipboard.writeText(textToCopy).then(() => {
          copyButton.textContent = 'Copied!';
          setTimeout(() => {
            copyButton.textContent = 'Copy Result';
          }, COPY_BUTTON_RESET_DELAY);
        });
      });
    }
  }

  /**
   * Formats the result for copying to clipboard.
   * 
   * @param {Object} result - The parsed fact check result
   * @returns {string} The formatted text for copying
   */
  function formatTextForCopy(result) {
    return `
Truth Percentage: ${result.truthPercentage}

Fact Check: ${result.factCheck}

Context: ${result.context}

Sources:
${result.sources.map(source => `${source.index}. ${source.title} - ${source.url}`).join('\n')}
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
  function makeDraggableAndResizable(element) {
    let isResizing = false;
    let isDragging = false;
    let startX, startY, startWidth, startHeight, startLeft, startTop;
    let resizeDirection = '';

    element.addEventListener('mousedown', startDragOrResize);
    document.addEventListener('mousemove', dragOrResize);
    document.addEventListener('mouseup', stopDragOrResize);
    element.addEventListener('mousemove', updateCursor);

    /**
     * Starts dragging or resizing the element.
     * 
     * @param {MouseEvent} e - The mouse event
     */
    function startDragOrResize(e) {
      if (isNearEdge(e, element)) {
        isResizing = true;
        resizeDirection = getResizeDirection(e, element);
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
    function dragOrResize(e) {
      if (isResizing) {
        resize(e);
      } else if (isDragging) {
        drag(e);
      }
    }

    /**
     * Resizes the element.
     * 
     * @param {MouseEvent} e - The mouse event
     */
    function resize(e) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (resizeDirection.includes('w')) {
        element.style.width = `${Math.max(MIN_BOX_SIZE, startWidth - dx)}px`;
        element.style.left = `${startLeft + dx}px`;
      } else if (resizeDirection.includes('e')) {
        element.style.width = `${Math.max(MIN_BOX_SIZE, startWidth + dx)}px`;
      }

      if (resizeDirection.includes('n')) {
        element.style.height = `${Math.max(MIN_BOX_SIZE, startHeight - dy)}px`;
        element.style.top = `${startTop + dy}px`;
      } else if (resizeDirection.includes('s')) {
        element.style.height = `${Math.max(MIN_BOX_SIZE, startHeight + dy)}px`;
      }
    }

    /**
     * Drags the element.
     * 
     * @param {MouseEvent} e - The mouse event
     */
    function drag(e) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      element.style.left = `${startLeft + dx}px`;
      element.style.top = `${startTop + dy}px`;
    }

    /**
     * Stops dragging or resizing the element.
     */
    function stopDragOrResize() {
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
    function updateCursor(e) {
      const direction = getResizeDirection(e, element);
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
    function isNearEdge(e, element) {
      const rect = element.getBoundingClientRect();
      return (
        e.clientX < rect.left + EDGE_THRESHOLD ||
        e.clientX > rect.right - EDGE_THRESHOLD ||
        e.clientY < rect.top + EDGE_THRESHOLD ||
        e.clientY > rect.bottom - EDGE_THRESHOLD
      );
    }

    /**
     * Gets the resize direction based on the mouse position.
     * 
     * @param {MouseEvent} e - The mouse event
     * @param {HTMLElement} element - The element to check
     * @returns {string} The resize direction (n, s, e, w, ne, nw, se, sw)
     */
    function getResizeDirection(e, element) {
      const rect = element.getBoundingClientRect();
      let direction = '';

      if (e.clientY < rect.top + EDGE_THRESHOLD) direction += 'n';
      else if (e.clientY > rect.bottom - EDGE_THRESHOLD) direction += 's';

      if (e.clientX < rect.left + EDGE_THRESHOLD) direction += 'w';
      else if (e.clientX > rect.right - EDGE_THRESHOLD) direction += 'e';

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
   * Creates and appends the styles for the fact check box.
   */
  const style = document.createElement('style');
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Satoshi:wght@400;700&display=swap');

    #${BOX_ID} {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 300px;
      height: 400px;
      min-width: ${MIN_BOX_SIZE}px;
      min-height: ${MIN_BOX_SIZE}px;
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
    #${BOX_ID} * {
      font-family: 'Satoshi', sans-serif !important;
      color: ${isDarkMode() ? 'white' : 'black'} !important;
    }
    #${BOX_ID} .fact-check-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    #${BOX_ID} h2 {
      margin: 0;
      text-align: center;
      width: 100%;
      font-size: 24px;
    }
    #${BOX_ID} h3 {
      text-align: center;
      font-size: 20px;
      margin-top: 0;
      margin-bottom: 25px;
    }
    #${BOX_ID} h4 {
      margin-top: 20px;
      margin-bottom: 10px;
      font-size: 18px;
    }
    #${BOX_ID} p, #${BOX_ID} li {
      font-size: 14px;
      line-height: 1.4;
    }
    #${BOX_ID} a {
      color: ${isDarkMode() ? '#add8e6' : '#0000EE'} !important;
      text-decoration: none;
    }
    #${BOX_ID} a:hover {
      text-decoration: underline;
    }
    #${CLOSE_BUTTON_ID} {
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: ${isDarkMode() ? 'white' : 'black'} !important;
      position: absolute;
      top: 10px;
      right: 10px;
    }
    #${COPY_BUTTON_ID} {
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
    #${COPY_BUTTON_ID}:hover {
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
