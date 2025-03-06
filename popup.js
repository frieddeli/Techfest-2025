/**
 * @fileoverview Popup script for the Fact Checker extension.
 * Handles API key management in the popup UI.
 */

// Constants
const STATUS_DISPLAY_DURATION = 2000; // 2 seconds

/**
 * Initializes the popup when the DOM content is loaded.
 */
document.addEventListener('DOMContentLoaded', () => {
  const saveButton = document.getElementById('saveApiKey');
  const apiKeyInput = document.getElementById('apiKey');
  const statusElement = document.getElementById('status');

  // Load the saved API key
  loadSavedApiKey(apiKeyInput);

  // Save the API key when the button is clicked
  saveButton.addEventListener('click', () => {
    saveApiKey(apiKeyInput.value.trim(), statusElement);
  });

  // Also save when Enter key is pressed in the input field
  apiKeyInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      saveApiKey(apiKeyInput.value.trim(), statusElement);
    }
  });
});

/**
 * Loads the saved API key from storage and populates the input field.
 * 
 * @param {HTMLInputElement} inputElement - The API key input element
 */
function loadSavedApiKey(inputElement) {
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
function saveApiKey(apiKey, statusElement) {
  if (apiKey) {
    chrome.storage.sync.set({ apiKey }, () => {
      displayStatus(statusElement, 'API Key saved!', 'success');
    });
  } else {
    displayStatus(statusElement, 'Please enter a valid API Key.', 'error');
  }
}

/**
 * Displays a status message for a limited time.
 * 
 * @param {HTMLElement} element - The element to display the status in
 * @param {string} message - The message to display
 * @param {string} className - The CSS class to apply to the status element
 */
function displayStatus(element, message, className) {
  element.textContent = message;
  element.className = className;
  
  setTimeout(() => {
    element.textContent = '';
    element.className = '';
  }, STATUS_DISPLAY_DURATION);
}
