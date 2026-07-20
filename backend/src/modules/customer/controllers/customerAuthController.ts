import { Request, Response } from "express";
import Customer from "../../../models/Customer";
import {
  sendSmsOtp as sendSmsOtpService,
  verifySmsOtp as verifySmsOtpService,
} from "../../../services/otpService";
import { generateToken } from "../../../services/jwtService";
import { asyncHandler } from "../../../utils/asyncHandler";

/**
 * Send SMS OTP to customer mobile number
 * Returns session_id for verification
 */
export const sendSmsOtp = asyncHandler(async (req: Request, res: Response) => {
  const { mobile } = req.body;

  if (!mobile || !/^[0-9]{10}$/.test(mobile)) {
    return res.status(400).json({
      success: false,
      message: "Valid 10-digit mobile number is required",
    });
  }

  // Check if customer exists with this mobile (Login Flow) - Only Global customers (sellerId: null) can login to the app
  const customer = await Customer.findOne({ phone: mobile, sellerId: null });
  if (!customer) {
    return res.status(404).json({
      success: false,
      message: "Customer not found. Please register first.",
    });
  }

  // Send SMS OTP
  const result = await sendSmsOtpService(mobile, 'Customer');

  return res.status(200).json({
    success: true,
    message: result.message,
    sessionId: result.sessionId,
  });
});

/**
 * Verify SMS OTP and login customer
 * Requires session_id and otp
 */
export const verifySmsOtp = asyncHandler(async (req: Request, res: Response) => {
  const { mobile, otp, sessionId, platform } = req.body;

  const allowedPlatforms = ['web', 'app', 'android', 'ios'];
  if (platform && !allowedPlatforms.includes(platform)) {
    return res.status(400).json({
      success: false,
      message: "Invalid platform",
    });
  }

  if (!mobile || !/^[0-9]{10}$/.test(mobile)) {
    return res.status(400).json({
      success: false,
      message: "Valid 10-digit mobile number is required",
    });
  }

  if (!otp || !/^[0-9]{4}$/.test(otp)) {
    return res.status(400).json({
      success: false,
      message: "Valid 4-digit OTP is required",
    });
  }

  if (!sessionId) {
    return res.status(400).json({
      success: false,
      message: "Session ID is required for verification",
    });
  }

  // Verify SMS OTP
  const isValid = await verifySmsOtpService(sessionId, otp, mobile, 'Customer');
  if (!isValid) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired OTP",
    });
  }

  // Find customer - Only Global customers (sellerId: null)
  const customer = await Customer.findOne({ phone: mobile, sellerId: null });
  if (!customer) {
    return res.status(404).json({
      success: false,
      message: "Customer not found",
    });
  }

  // Generate JWT token
  const token = generateToken(customer._id.toString(), "Customer");

  return res.status(200).json({
    success: true,
    message: "Login successful",
    data: {
      token,
      user: {
        id: customer._id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        walletAmount: customer.walletAmount,
        refCode: customer.refCode,
        status: customer.status,
        totalOrders: customer.totalOrders || 0,
      },
    },
  });
});

/**
 * Register new customer
 */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const { name, mobile, email, dateOfBirth } = req.body;

  // Validation
  if (!name || !mobile) {
    return res.status(400).json({
      success: false,
      message: "Name and mobile are required",
    });
  }

  if (!/^[0-9]{10}$/.test(mobile)) {
    return res.status(400).json({
      success: false,
      message: "Valid 10-digit mobile number is required",
    });
  }

  // Normalize email the same way the schema does (lowercase) so this check
  // actually matches what's stored in the DB - schema setters don't run on
  // query filters, only on document save.
  const normalizedEmail = email ? String(email).trim().toLowerCase() : undefined;

  // Check if customer already exists - Only check within Global customers
  const orQuery: any[] = [{ phone: mobile }];
  if (normalizedEmail) orQuery.push({ email: normalizedEmail });

  const existingCustomer = await Customer.findOne({
    $or: orQuery,
    sellerId: null,
  });

  if (existingCustomer) {
    const field = existingCustomer.phone === mobile ? "mobile number" : "email";
    return res.status(409).json({
      success: false,
      message: `An account already exists with this ${field}`,
    });
  }

  // Create new customer. refCode is auto-generated with random suffix on save,
  // so on the rare chance of a collision we just retry with a fresh doc rather
  // than surfacing that as a phone/email conflict to the user.
  let customer;
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      customer = await Customer.create({
        name,
        phone: mobile,
        email: normalizedEmail,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        status: "Active",
        walletAmount: 0,
        totalOrders: 0,
        totalSpent: 0,
        sellerId: null,
      });
      break;
    } catch (err: any) {
      if (err?.code === 11000) {
        if (err.keyPattern?.refCode && attempt < maxAttempts) {
          continue; // regenerate refCode on next attempt
        }
        if (err.keyPattern?.phone) {
          return res.status(409).json({
            success: false,
            message: "An account already exists with this mobile number",
          });
        }
        if (err.keyPattern?.email) {
          return res.status(409).json({
            success: false,
            message: "An account already exists with this email",
          });
        }
      }
      throw err;
    }
  }

  // Generate token
  const token = generateToken(customer._id.toString(), "Customer");

  return res.status(201).json({
    success: true,
    message: "Customer registered successfully",
    data: {
      token,
      user: {
        id: customer._id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        walletAmount: customer.walletAmount,
        refCode: customer.refCode,
        status: customer.status,
        totalOrders: customer.totalOrders || 0,
      },
    },
  });
});
