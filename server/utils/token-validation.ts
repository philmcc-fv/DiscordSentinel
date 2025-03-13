/**
 * Token validation utilities for ensuring secure bot tokens
 */

/**
 * Validates a Telegram bot token format
 * 
 * @param token The token to validate
 * @returns An object with validation result
 */
export function validateTelegramToken(token: string): { 
  isValid: boolean;
  cleanedToken?: string;
  message?: string;
} {
  if (!token) {
    return {
      isValid: false,
      message: "Token is required"
    };
  }

  // First, remove any whitespace that might have been copied
  const trimmedToken = token.trim();
  
  // Check if token has the basic required format (numbers, colon, then alphanumeric)
  if (!trimmedToken.includes(':')) {
    return {
      isValid: false,
      message: "Invalid token format. Token must contain a colon separating the bot ID and secret."
    };
  }

  // Remove any non-printable or problematic characters
  // Only allow digits, letters, colons, underscores, and hyphens which are valid in a Telegram bot token
  const cleanedToken = trimmedToken.replace(/[^\d:A-Za-z0-9_-]/g, '');
  
  if (cleanedToken !== trimmedToken) {
    // If we had to clean the token, warn the user but still return it if valid
    if (cleanedToken.match(/^\d+:[A-Za-z0-9_-]+$/)) {
      return {
        isValid: true,
        cleanedToken,
        message: "Token contained invalid characters that were removed."
      };
    } else {
      return {
        isValid: false,
        message: "Token contains invalid characters and doesn't match the expected format: numbers, colon, then letters/numbers/symbols."
      };
    }
  }
  
  // Final validation check
  if (!cleanedToken.match(/^\d+:[A-Za-z0-9_-]+$/)) {
    return {
      isValid: false,
      message: "Token doesn't match the expected format: numbers, colon, then letters/numbers/symbols."
    };
  }
  
  // Check if token has a reasonable length
  if (cleanedToken.length < 15) { // Typically tokens are longer, this is a minimum check
    return {
      isValid: false,
      message: "Token appears too short to be valid."
    };
  }
  
  return {
    isValid: true,
    cleanedToken
  };
}

/**
 * Validates a Discord bot token format
 * 
 * @param token The token to validate
 * @returns An object with validation result
 */
export function validateDiscordToken(token: string): {
  isValid: boolean;
  cleanedToken?: string;
  message?: string;
} {
  if (!token) {
    return {
      isValid: false,
      message: "Token is required"
    };
  }

  // Remove whitespace
  const trimmedToken = token.trim();
  
  // Discord tokens are base64 encoded, so they should only contain these characters
  const cleanedToken = trimmedToken.replace(/[^A-Za-z0-9_.-]/g, '');
  
  if (cleanedToken !== trimmedToken) {
    return {
      isValid: false,
      message: "Token contains invalid characters. Discord tokens should only contain letters, numbers, underscores, dots, and hyphens."
    };
  }
  
  // Discord tokens should typically have dots in them
  if (!cleanedToken.includes('.')) {
    return {
      isValid: false,
      message: "Invalid token format. Discord tokens typically contain dots as separators."
    };
  }
  
  // Check token length - Discord tokens are typically long
  if (cleanedToken.length < 50) {
    return {
      isValid: false,
      message: "Token appears too short to be valid."
    };
  }
  
  return {
    isValid: true,
    cleanedToken
  };
}