/**
 * Authentication validation utilities
 * Security-focused input validation for auth flows
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Sanitize email input - removes dangerous characters and normalizes
 */
export function sanitizeEmail(email: string): string {
  if (!email) return "";

  return email
    .toLowerCase()
    .trim()
    .replace(/[<>'"]/g, "") // Remove potentially dangerous characters
    .slice(0, 254); // Max email length per RFC 5321
}

/**
 * Validate email format
 */
export function validateEmail(email: string): ValidationResult {
  if (!email) {
    return { isValid: false, error: "Email is required" };
  }

  const sanitized = sanitizeEmail(email);

  // RFC 5322 compliant email regex (simplified)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(sanitized)) {
    return { isValid: false, error: "Please enter a valid email address" };
  }

  if (sanitized.length < 5) {
    return { isValid: false, error: "Email is too short" };
  }

  if (sanitized.length > 254) {
    return { isValid: false, error: "Email is too long" };
  }

  return { isValid: true };
}

/**
 * Password strength requirements
 */
export interface PasswordStrength {
  score: number; // 0-4
  label: "weak" | "fair" | "good" | "strong";
  feedback: string[];
}

/**
 * Validate password with security requirements
 */
export function validatePassword(password: string): ValidationResult {
  if (!password) {
    return { isValid: false, error: "Password is required" };
  }

  if (password.length < 8) {
    return { isValid: false, error: "Password must be at least 8 characters" };
  }

  if (password.length > 128) {
    return { isValid: false, error: "Password is too long" };
  }

  // Check for common weak passwords
  const commonPasswords = [
    "password", "12345678", "qwerty123", "password123",
    "letmein", "welcome", "admin123", "abc12345"
  ];

  if (commonPasswords.includes(password.toLowerCase())) {
    return { isValid: false, error: "This password is too common. Please choose a stronger one." };
  }

  return { isValid: true };
}

/**
 * Calculate password strength score
 */
export function getPasswordStrength(password: string): PasswordStrength {
  const feedback: string[] = [];
  let score = 0;

  if (!password) {
    return { score: 0, label: "weak", feedback: ["Enter a password"] };
  }

  // Length checks
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;

  // Character variety checks
  if (/[a-z]/.test(password)) score += 0.5;
  if (/[A-Z]/.test(password)) score += 0.5;
  if (/[0-9]/.test(password)) score += 0.5;
  if (/[^a-zA-Z0-9]/.test(password)) score += 0.5;

  // Feedback
  if (password.length < 8) feedback.push("Use at least 8 characters");
  if (!/[A-Z]/.test(password)) feedback.push("Add uppercase letters");
  if (!/[0-9]/.test(password)) feedback.push("Add numbers");
  if (!/[^a-zA-Z0-9]/.test(password)) feedback.push("Add special characters");

  // Normalize score to 0-4
  const normalizedScore = Math.min(4, Math.floor(score));

  const labels: PasswordStrength["label"][] = ["weak", "fair", "good", "strong", "strong"];

  return {
    score: normalizedScore,
    label: labels[normalizedScore],
    feedback
  };
}

/**
 * Validate passwords match
 */
export function validatePasswordsMatch(password: string, confirmPassword: string): ValidationResult {
  if (password !== confirmPassword) {
    return { isValid: false, error: "Passwords do not match" };
  }
  return { isValid: true };
}

/**
 * Sanitize auth error messages to prevent information leakage
 */
export function sanitizeAuthError(error: string): string {
  // Map specific Supabase errors to generic messages
  const errorMappings: Record<string, string> = {
    "Invalid login credentials": "Invalid email or password",
    "Email not confirmed": "Please verify your email address",
    "User already registered": "An account with this email already exists",
    "Password should be at least 6 characters": "Password is too weak",
    "Email rate limit exceeded": "Too many attempts. Please try again later.",
    "For security purposes, you can only request this after": "Please wait before trying again",
  };

  // Check if error matches any known pattern
  for (const [pattern, safeMessage] of Object.entries(errorMappings)) {
    if (error.includes(pattern)) {
      return safeMessage;
    }
  }

  // Default safe message for unknown errors
  if (error.includes("network") || error.includes("fetch")) {
    return "Connection error. Please check your internet and try again.";
  }

  // Generic fallback - don't expose internal errors
  return "Authentication failed. Please try again.";
}
