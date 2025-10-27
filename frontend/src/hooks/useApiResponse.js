import { useNotification } from './useNotification';
import { handleApiResponse, handleApiError, extractApiData, isApiSuccess } from '../utils/apiResponseHandler';

/**
 * Custom hook for handling API responses with automatic notifications
 *
 * This hook provides a convenient way to handle API responses and automatically
 * display appropriate toast notifications based on the response content.
 *
 * Usage:
 *   const { handleResponse, handleError, extractData, isSuccess } = useApiResponse();
 *
 *   // In your API call:
 *   const response = await fetch('/api/endpoint');
 *   const data = await response.json();
 *   handleResponse(data, response.ok);
 *   const actualData = extractData(data);
 */
export const useApiResponse = () => {
  const { showSuccess, showError, showWarning, showInfo } = useNotification();

  /**
   * Handles API responses and displays appropriate notifications
   * @param {Object} responseData - The API response data
   * @param {boolean} httpSuccess - Whether the HTTP request was successful
   * @returns {Object} The processed response data
   */
  const handleResponse = (responseData, httpSuccess) => {
    return handleApiResponse(
      responseData,
      httpSuccess,
      showSuccess,
      showError,
      showWarning,
      showInfo
    );
  };

  /**
   * Handles API errors (for catch blocks)
   * @param {Object} responseData - The API response data
   */
  const handleError = (responseData) => {
    handleApiError(responseData, showError);
  };

  /**
   * Extracts data from API response
   * @param {Object} responseData - The API response data
   * @returns {*} The actual data payload
   */
  const extractData = (responseData) => {
    return extractApiData(responseData);
  };

  /**
   * Checks if API response indicates success
   * @param {Object} responseData - The API response data
   * @param {boolean} httpSuccess - Whether the HTTP request was successful
   * @returns {boolean} True if the operation was successful
   */
  const isSuccess = (responseData, httpSuccess) => {
    return isApiSuccess(responseData, httpSuccess);
  };

  return {
    handleResponse,
    handleError,
    extractData,
    isSuccess
  };
};
