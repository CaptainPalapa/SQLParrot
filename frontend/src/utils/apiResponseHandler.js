/**
 * Global API Response Handler
 *
 * This utility handles standardized API responses and automatically
 * displays appropriate toast notifications based on message types.
 *
 * Usage:
 *   const response = await fetch('/api/endpoint');
 *   const data = await response.json();
 *   handleApiResponse(data, response.ok, showSuccess, showError, showWarning, showInfo);
 */

/**
 * Handles API responses and displays appropriate notifications
 * @param {Object} responseData - The API response data
 * @param {boolean} isSuccess - Whether the HTTP request was successful
 * @param {Function} showSuccess - Function to show success notifications
 * @param {Function} showError - Function to show error notifications
 * @param {Function} showWarning - Function to show warning notifications (optional)
 * @param {Function} showInfo - Function to show info notifications (optional)
 */
export const handleApiResponse = (responseData, isSuccess, showSuccess, showError, showWarning = null, showInfo = null) => {
  // If no notification functions provided, just return the data
  if (!showSuccess || !showError) {
    return responseData;
  }

  // Handle structured response format
  if (responseData.messages) {
    const { success, error, warning, info } = responseData.messages;

    // Show success messages
    if (success && success.length > 0) {
      success.forEach(message => showSuccess(message));
    }

    // Show error messages
    if (error && error.length > 0) {
      error.forEach(message => showError(message));
    }

    // Show warning messages (if handler provided)
    if (warning && warning.length > 0 && showWarning) {
      warning.forEach(message => showWarning(message));
    }

    // Show info messages (if handler provided)
    if (info && info.length > 0 && showInfo) {
      info.forEach(message => showInfo(message));
    }
  }

  // Handle legacy format (fallback)
  else if (responseData.message) {
    if (isSuccess) {
      showSuccess(responseData.message);
    } else {
      showError(responseData.message);
    }
  }

  // Handle simple error format
  else if (responseData.error && !isSuccess) {
    showError(responseData.error);
  }

  return responseData;
};

/**
 * Simplified handler that only shows errors (for catch blocks)
 * @param {Object} responseData - The API response data
 * @param {Function} showError - Function to show error notifications
 */
export const handleApiError = (responseData, showError) => {
  if (responseData.messages && responseData.messages.error && responseData.messages.error.length > 0) {
    responseData.messages.error.forEach(message => showError(message));
  } else if (responseData.message) {
    showError(responseData.message);
  } else if (responseData.error) {
    showError(responseData.error);
  }
};

/**
 * Extracts data from API response (handles both old and new formats)
 * @param {Object} responseData - The API response data
 * @returns {*} The actual data payload
 */
export const extractApiData = (responseData) => {
  // New structured format
  if (responseData.data !== undefined) {
    return responseData.data;
  }

  // Legacy format - return the whole response
  return responseData;
};

/**
 * Checks if API response indicates success
 * @param {Object} responseData - The API response data
 * @param {boolean} httpSuccess - Whether the HTTP request was successful
 * @returns {boolean} True if the operation was successful
 */
export const isApiSuccess = (responseData, httpSuccess) => {
  // New structured format
  if (responseData.success !== undefined) {
    return responseData.success && httpSuccess;
  }

  // Legacy format - rely on HTTP status
  return httpSuccess;
};
