/**
 * @fileoverview Popup script for the Fact Checker extension.
 * Handles API key management in the popup UI.
 */

// Constants
const MSG_DISPLAY_TIME = 2000; // 2 seconds

/**
 * Initializes the popup when the DOM content is loaded.
 */
document.addEventListener('DOMContentLoaded', () => {
  const submitBtn = document.getElementById('saveApiKey');
  const keyInput = document.getElementById('apiKey');
  const statusMsg = document.getElementById('status');

  // Load the saved API key
  loadStoredKey(keyInput);

  // Save the API key when the button is clicked
  submitBtn.addEventListener('click', () => {
    storeKey(keyInput.value.trim(), statusMsg);
  });

  // Also save when Enter key is pressed in the input field
  keyInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      storeKey(keyInput.value.trim(), statusMsg);
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
