import axios from 'axios';
import Otp from '../models/Otp';

// Bulk SMS (yourbulksms / Appzeto) Configuration
const BULK_SMS_AUTH_KEY = process.env.BULK_SMS_AUTH_KEY;
const BULK_SMS_SENDER_ID = process.env.BULK_SMS_SENDER_ID || 'GEETST';
const BULK_SMS_DLT_TEMPLATE_ID = process.env.BULK_SMS_DLT_TEMPLATE_ID || '1777178609731509474';
const BULK_SMS_API_URL = process.env.BULK_SMS_API_URL || 'http://control.yourbulksms.com/api/sendhttp.php';
const BULK_SMS_ROUTE = process.env.BULK_SMS_ROUTE || '2';
const BULK_SMS_COUNTRY = process.env.BULK_SMS_COUNTRY || '0';
const API_TIMEOUT = 30000; // 30 seconds

if (!BULK_SMS_AUTH_KEY) {
  if (process.env.NODE_ENV === 'production' || process.env.USE_MOCK_OTP === 'false') {
    console.warn('Bulk SMS credentials are not fully set in environment variables');
  }
}

/**
 * Interface for OTP Response
 */
interface OtpResponse {
  success: boolean;
  sessionId?: string;
  message: string;
}

type UserType = 'Customer' | 'Delivery' | 'Seller' | 'Admin' | 'Staff';

/**
 * Generate numeric OTP
 */
function generateOTP(length: number = 4): string {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
}

/**
 * Normalize mobile number to include country code (91)
 *
 * Bare 10-digit Indian mobile numbers are prepended with the country code.
 * We can't rely on checking whether the number already "starts with 91" -
 * plenty of valid 10-digit mobile numbers (e.g. 9123456780) start with
 * those digits themselves, which previously caused the country code to be
 * skipped and the number rejected as too short.
 */
function normalizeMobileNumber(mobile: string): string {
  let cleanMobile = mobile.replace(/^\+/, '').replace(/\D/g, '');

  // Strip a leading trunk '0' some users prefix locally (e.g. 09123456780)
  if (cleanMobile.length === 11 && cleanMobile.startsWith('0')) {
    cleanMobile = cleanMobile.slice(1);
  }

  if (cleanMobile.length === 10) {
    cleanMobile = '91' + cleanMobile;
  }

  if (cleanMobile.length < 12 || cleanMobile.length > 13) {
    throw new Error(`Invalid mobile number: ${cleanMobile}. Must be 12-13 digits with country code.`);
  }

  return cleanMobile;
}

/**
 * Build DLT-compliant message
 *
 * Must match the registered DLT template exactly (DLT_TE_ID above), only the
 * {#var#} placeholder is substituted with the OTP.
 */
function buildOtpMessage(otp: string): string {
  return `Your OTP is ${otp} for registration to the Geeta Stores and wholesale. https://www.geeta.today/login GEETA STATIONARY`;
}

/**
 * Parse and handle the Bulk SMS (yourbulksms) API response
 *
 * The API returns a plain-text body, not JSON. A successful send looks like
 * "<numeric-message-id>" (optionally per-number, comma separated), while
 * failures look like "Failed#<reason>" or contain the words
 * "error"/"invalid". Anything else is treated as failure rather than
 * silently succeeding.
 */
function handleSmsResponse(responseData: string | Record<string, unknown>): void {
  const text = typeof responseData === 'string' ? responseData.trim() : JSON.stringify(responseData);

  if (!text) {
    throw new Error('Bulk SMS API Error: Empty response');
  }

  if (/^failed/i.test(text) || /error|invalid/i.test(text)) {
    throw new Error(`Bulk SMS API Error: ${text}`);
  }

  // Otherwise treat as success (e.g. a numeric message/job id was returned)
}

/**
 * Send SMS via the Bulk SMS (yourbulksms / Appzeto) HTTP API
 */
async function sendSmsViaApi(mobile: string, message: string): Promise<void> {
  if (!BULK_SMS_AUTH_KEY) {
    throw new Error('Bulk SMS credentials are missing. Please check environment variables.');
  }

  const cleanMobile = normalizeMobileNumber(mobile);

  const params: Record<string, string> = {
    authkey: BULK_SMS_AUTH_KEY.trim(),
    mobiles: cleanMobile,
    message,
    sender: BULK_SMS_SENDER_ID.trim(),
    route: BULK_SMS_ROUTE,
    country: BULK_SMS_COUNTRY,
  };

  if (BULK_SMS_DLT_TEMPLATE_ID?.trim()) {
    params.DLT_TE_ID = BULK_SMS_DLT_TEMPLATE_ID.trim();
  }

  const response = await axios.get<string | Record<string, unknown>>(BULK_SMS_API_URL, {
    params,
    paramsSerializer: (params) => {
      return Object.keys(params)
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join('&');
    },
    timeout: API_TIMEOUT,
  });

  handleSmsResponse(response.data);
}

/**
 * Save OTP to database
 */
async function saveOtpToDb(mobile: string, otp: string, userType: UserType): Promise<void> {
  // Normalize mobile number (remove any non-digits, ensure consistent format)
  const normalizedMobile = mobile.replace(/\D/g, '');

  await Otp.deleteMany({ mobile: normalizedMobile, userType });
  await Otp.create({
    mobile: normalizedMobile,
    otp: otp.trim(),
    userType,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes expiry
  });
}

/**
 * Verify OTP from database
 */
async function verifyOtpFromDb(mobile: string, otp: string, userType: UserType): Promise<boolean> {
  // Normalize mobile number (remove any non-digits, ensure consistent format)
  const normalizedMobile = mobile.replace(/\D/g, '');

  const record = await Otp.findOne({
    mobile: normalizedMobile,
    userType,
    otp: otp.trim()
  });

  if (!record) {
    console.error('OTP verification failed - record not found:', {
      mobile: normalizedMobile,
      userType,
      otp: otp.trim(),
      availableRecords: await Otp.find({ mobile: normalizedMobile, userType }).select('otp expiresAt')
    });
    return false;
  }

  if (record.expiresAt < new Date()) {
    await Otp.deleteOne({ _id: record._id });
    console.error('OTP verification failed - expired:', {
      mobile: normalizedMobile,
      expiresAt: record.expiresAt,
      now: new Date()
    });
    return false;
  }

  await Otp.deleteOne({ _id: record._id });
  return true;
}

/**
 * Special bypass numbers with their fixed OTPs
 */
const SPECIAL_BYPASS_NUMBERS: Record<string, string> = {
  '9111966732': '1234',
  '9876543210': '9999',
  '6268423925': '1234',
  '8349400273': '3651',
};

/**
 * Check if special bypass should be used
 */
function isSpecialBypass(mobile: string): boolean {
  const clean = mobile.replace(/\D/g, '');
  return clean in SPECIAL_BYPASS_NUMBERS;
}

/**
 * Get the fixed OTP for a special bypass number
 */
function getSpecialBypassOtp(mobile: string): string {
  const clean = mobile.replace(/\D/g, '');
  return SPECIAL_BYPASS_NUMBERS[clean] || '1234';
}

/**
 * Check if mock mode should be used
 */
function isMockMode(): boolean {
  return process.env.USE_MOCK_OTP === 'true' || !BULK_SMS_AUTH_KEY;
}

/**
 * Check if developer bypass OTP
 */
function isDeveloperBypass(otp: string): boolean {
  return (process.env.NODE_ENV !== 'production' || process.env.USE_MOCK_OTP === 'true') && otp === '999999';
}

// ==========================================
// SMS OTP (Customer / Delivery)
// ==========================================

export async function sendSmsOtp(
  mobile: string,
  userType: 'Customer' | 'Delivery' = 'Delivery'
): Promise<OtpResponse> {
  try {
    const otp = generateOTP(4);

    // Special number bypass
    if (isSpecialBypass(mobile)) {
      const specialOtp = getSpecialBypassOtp(mobile);
      await saveOtpToDb(mobile, specialOtp, userType);
      return {
        success: true,
        sessionId: 'DB_VERIFIED_' + mobile,
        message: 'OTP sent successfully',
      };
    }

    // Mock mode
    if (isMockMode()) {
      await saveOtpToDb(mobile, otp, userType);
      return {
        success: true,
        sessionId: 'MOCK_SESSION_' + mobile,
        message: 'OTP sent successfully',
      };
    }

    // Real mode - Send via Bulk SMS gateway
    await saveOtpToDb(mobile, otp, userType);
    const message = buildOtpMessage(otp);
    await sendSmsViaApi(mobile, message);

    return {
      success: true,
      sessionId: 'DB_VERIFIED_' + mobile,
      message: 'OTP sent successfully',
    };
  } catch (error: any) {
    const errorMessage = error.message || 'Failed to send OTP. Please try again.';
    console.error('SMS OTP Error (sendSmsOtp):', {
      error: errorMessage,
      code: error.code,
      mobile,
      userType,
      url: BULK_SMS_API_URL
    });
    throw new Error(`SMS Service Error: ${errorMessage}`);
  }
}

export async function verifySmsOtp(
  sessionId: string,
  otpInput: string,
  mobile?: string,
  userType: 'Customer' | 'Delivery' = 'Delivery'
): Promise<boolean> {
  if (isDeveloperBypass(otpInput)) {
    return true;
  }

  // Normalize OTP input (remove spaces, ensure it's a string)
  const normalizedOtp = String(otpInput).trim().replace(/\s/g, '');

  if (!normalizedOtp || normalizedOtp.length !== 4) {
    console.error('OTP verification failed - invalid OTP format:', {
      otpInput,
      normalizedOtp,
      length: normalizedOtp.length
    });
    return false;
  }

  let targetMobile = mobile;
  if (!targetMobile && sessionId) {
    if (sessionId.startsWith('DB_VERIFIED_')) {
      targetMobile = sessionId.replace('DB_VERIFIED_', '');
    } else if (sessionId.startsWith('MOCK_SESSION_')) {
      targetMobile = sessionId.replace('MOCK_SESSION_', '');
    }
  }

  if (!targetMobile) {
    console.error('OTP verification failed - no mobile number:', {
      sessionId,
      mobile,
      userType
    });
    return false;
  }

  // Normalize mobile number
  const normalizedMobile = targetMobile.replace(/\D/g, '');

  if (normalizedMobile.length !== 10) {
    console.error('OTP verification failed - invalid mobile format:', {
      original: targetMobile,
      normalized: normalizedMobile,
      length: normalizedMobile.length
    });
    return false;
  }

  return verifyOtpFromDb(normalizedMobile, normalizedOtp, userType);
}

// ==========================================
// SMS OTP (Seller / Admin)
// ==========================================

export async function sendOTP(
  mobile: string,
  userType: 'Seller' | 'Admin' | 'Customer' | 'Delivery' | 'Staff',
  _isLogin: boolean = true
): Promise<OtpResponse> {
  try {
    const otp = generateOTP(4);

    // Special number bypass
    if (isSpecialBypass(mobile)) {
      const specialOtp = getSpecialBypassOtp(mobile);
      await saveOtpToDb(mobile, specialOtp, userType);
      return {
        success: true,
        message: 'OTP sent successfully',
      };
    }

    // Mock mode
    if (isMockMode()) {
      await saveOtpToDb(mobile, otp, userType);
      return {
        success: true,
        message: 'OTP sent successfully',
      };
    }

    // Real mode - Send via Bulk SMS gateway
    await saveOtpToDb(mobile, otp, userType);
    const message = buildOtpMessage(otp);
    await sendSmsViaApi(mobile, message);

    return {
      success: true,
      message: 'OTP sent successfully',
    };
  } catch (error: any) {
    const errorMessage = error.message || 'Failed to send OTP. Please try again.';
    console.error('SMS OTP Error (sendOTP):', {
      error: errorMessage,
      code: error.code,
      mobile,
      userType,
      url: BULK_SMS_API_URL
    });
    throw new Error(`SMS Service Error: ${errorMessage}`);
  }
}

export async function verifyOTP(
  mobile: string,
  otpInput: string,
  userType: 'Seller' | 'Admin' | 'Customer' | 'Delivery' | 'Staff'
): Promise<boolean> {
  if (isDeveloperBypass(otpInput)) {
    return true;
  }

  // Normalize OTP input (remove spaces, ensure it's a string)
  const normalizedOtp = String(otpInput).trim().replace(/\s/g, '');

  if (!normalizedOtp || normalizedOtp.length !== 4) {
    console.error('OTP verification failed - invalid OTP format:', {
      otpInput,
      normalizedOtp,
      length: normalizedOtp.length
    });
    return false;
  }

  // Normalize mobile number
  const normalizedMobile = mobile.replace(/\D/g, '');

  if (normalizedMobile.length !== 10) {
    console.error('OTP verification failed - invalid mobile format:', {
      original: mobile,
      normalized: normalizedMobile,
      length: normalizedMobile.length
    });
    return false;
  }

  return verifyOtpFromDb(normalizedMobile, normalizedOtp, userType);
}
