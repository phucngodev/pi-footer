/**
 * Identifier for the status bar entry
 */
export const STATUS_KEY = "tokenSpeed";

/**
 * Sliding window duration in milliseconds for time-based TPS calculation
 */
export const TPS_WINDOW_MS = 1000;

/**
 * TPS threshold above which speed is considered slow
 * Anything below this will not be colored
 */
export const TPS_THRESHOLD_SLOW = 0;

/**
 * TPS threshold above which speed is considered medium
 */
export const TPS_THRESHOLD_MEDIUM = 15;

/**
 * TPS threshold above which speed is considered fast
 */
export const TPS_THRESHOLD_FAST = 30;

/**
 * TPS threshold above which speed is considered blazing
 */
export const TPS_THRESHOLD_BLAZING = 45;

/**
 * Color used when TPS is above the slow threshold
 */
export const COLOR_SLOW = "#ff4444";

/**
 * Color used when TPS is between slow and medium thresholds
 */
export const COLOR_MEDIUM = "#ffaa00";

/**
 * Color used when TPS is between medium and fast thresholds
 */
export const COLOR_FAST = "#00ff88";

/**
 * Color used when TPS exceeds the fast threshold
 */
export const COLOR_BLAZING = "#44ddff";

/**
 * Smallest denominator used when computing an instantaneous rate.
 * Prevents a single early token from producing absurd values near t=0.
 */
export const TPS_MIN_SAMPLE_MS = 50;
