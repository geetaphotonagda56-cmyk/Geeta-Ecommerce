
import mongoose, { Document, Schema } from "mongoose";
import crypto from "crypto";

export interface IOrder extends Document {
  // Order Info
  orderNumber: string;
  orderDate: Date;

  // Customer Info
  customer: mongoose.Types.ObjectId;
  customerName: string;
  customerEmail?: string;
  customerPhone: string;

  // Delivery Info
  deliveryAddress: {
    address: string;
    city: string;
    state?: string;
    pincode: string;
    landmark?: string;
    latitude?: number;
    longitude?: number;
  };

  // Order Items
  items: mongoose.Types.ObjectId[]; // References to OrderItem

  // Pricing
  subtotal: number;
  tax: number;
  shipping: number;
  platformFee: number;
  discount: number;
  // Set only when the discount came from the POS "Discount and Charges"
  // popup - discount itself always holds the computed rupee amount either
  // way, these just record how the seller entered it.
  discountType?: "%" | "₹";
  discountValue?: number;
  couponCode?: string;
  total: number;

  // POS "Discount and Charges" extras - who handled the sale/delivery for
  // this order (same combined concept, per business decision), and partial
  // cash payment tracking.
  salesPerson?: {
    id?: mongoose.Types.ObjectId;
    name: string;
    phone?: string;
  };
  isPartialPayment?: boolean;
  amountPaid?: number;

  // Payment
  paymentMethod: string;
  paymentStatus: "Pending" | "Paid" | "Partial" | "Failed" | "Refunded";
  paymentId?: string;

  // Order Status
  status:
  | "Received"
  | "Pending"
  | "Processed"
  | "Picked Up"
  | "Shipped"
  | "Out for Delivery"
  | "In Transit"
  | "Delivered"
  | "Cancelled"
  | "Rejected"
  | "Returned";

  // Delivery Assignment
  deliveryBoy?: mongoose.Types.ObjectId;
  deliveryBoyStatus?:
  | "Assigned"
  | "Picked Up"
  | "In Transit"
  | "Delivered"
  | "Failed";
  assignedAt?: Date;
  deliveryBroadcastAttempts: number;
  lastBroadcastAt?: Date;
  needsManualAssignment: boolean;

  // Admin Order Delivery workflow (tabs: New/Confirmed/Shipment Ready/In Transit/Delivered)
  deliveryWorkflowStage:
  | "New"
  | "Confirmed"
  | "Shipment Ready"
  | "In Transit"
  | "Delivered"
  | "Cancelled";
  confirmedAt?: Date;
  dispatchedAt?: Date;
  inTransitAt?: Date;
  deliverySlot?: {
    type: "Fast" | "Same-day" | "Later" | "Custom";
    label?: string;
    scheduledFor?: Date;
  };
  // Admin-only computed profit, never surfaced to customer/delivery responses
  netProfit?: number;

  // Tracking
  trackingNumber?: string;
  estimatedDeliveryDate?: Date;
  deliveredAt?: Date;
  deliveryQrToken: string;

  // Delivery OTP
  deliveryOtp?: string;
  deliveryOtpExpiresAt?: Date;
  deliveryOtpVerified?: boolean;
  invoiceEnabled?: boolean;

  // Notes
  adminNotes?: string;
  customerNotes?: string;
  deliveryInstructions?: string;
  specialRequests?: string;

  // Cancellation/Return
  cancellationReason?: string;
  cancelledAt?: Date;
  cancelledBy?: mongoose.Types.ObjectId;

  // Tracks in-store (walk-in) item-level returns made via bill edits.
  // "Full" = every item on the bill has since been returned.
  returnStatus?: "None" | "Partial" | "Full";

  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema = new Schema<IOrder>(
  {
    // Order Info
    orderNumber: {
      type: String,
      required: [true, "Order number is required"],
      unique: true,
      trim: true,
    },
    orderDate: {
      type: Date,
      default: Date.now,
    },

    // Customer Info
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: [true, "Customer is required"],
    },
    customerName: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
    },
    customerEmail: {
      type: String,
      trim: true,
    },
    customerPhone: {
      type: String,
      required: [true, "Customer phone is required"],
      trim: true,
    },

    // Delivery Info
    deliveryAddress: {
      address: {
        type: String,
        required: [true, "Delivery address is required"],
        trim: true,
      },
      city: {
        type: String,
        required: [true, "City is required"],
        trim: true,
      },
      state: {
        type: String,
        trim: true,
      },
      pincode: {
        type: String,
        required: [true, "Pincode is required"],
        trim: true,
      },
      landmark: {
        type: String,
        trim: true,
      },
      latitude: {
        type: Number,
      },
      longitude: {
        type: Number,
      },
    },

    // Order Items
    items: [
      {
        type: Schema.Types.ObjectId,
        ref: "OrderItem",
      },
    ],

    // Pricing
    subtotal: {
      type: Number,
      required: [true, "Subtotal is required"],
      min: [0, "Subtotal cannot be negative"],
    },
    tax: {
      type: Number,
      default: 0,
      min: [0, "Tax cannot be negative"],
    },
    shipping: {
      type: Number,
      default: 0,
      min: [0, "Shipping cannot be negative"],
    },
    platformFee: {
      type: Number,
      default: 0,
      min: [0, "Platform fee cannot be negative"],
    },
    discount: {
      type: Number,
      default: 0,
      min: [0, "Discount cannot be negative"],
    },
    discountType: {
      type: String,
      enum: ["%", "₹"],
    },
    discountValue: {
      type: Number,
      min: [0, "Discount value cannot be negative"],
    },
    couponCode: {
      type: String,
      trim: true,
    },
    total: {
      type: Number,
      required: [true, "Total is required"],
      min: [0, "Total cannot be negative"],
    },

    // POS "Discount and Charges" extras
    salesPerson: {
      id: { type: Schema.Types.ObjectId, ref: "SalesPerson" },
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
    },
    isPartialPayment: {
      type: Boolean,
      default: false,
    },
    amountPaid: {
      type: Number,
      min: [0, "Amount paid cannot be negative"],
    },

    // Payment
    paymentMethod: {
      type: String,
      required: [true, "Payment method is required"],
      trim: true,
    },
    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Partial", "Failed", "Refunded"],
      default: "Pending",
    },
    paymentId: {
      type: String,
      trim: true,
    },

    // Order Status
    status: {
      type: String,
      enum: [
        "Received",
        "Pending",
        "Processed",
        "Picked Up",
        "Shipped",
        "Out for Delivery",
        "In Transit",
        "Delivered",
        "Cancelled",
        "Rejected",
        "Returned",
      ],
      default: "Received",
    },

    // Delivery Assignment
    deliveryBoy: {
      type: Schema.Types.ObjectId,
      ref: "Delivery",
    },
    deliveryBoyStatus: {
      type: String,
      enum: ["Assigned", "Picked Up", "In Transit", "Delivered", "Failed"],
    },
    assignedAt: {
      type: Date,
    },
    deliveryBroadcastAttempts: {
      type: Number,
      default: 0,
    },
    lastBroadcastAt: {
      type: Date,
    },
    needsManualAssignment: {
      type: Boolean,
      default: false,
    },

    // Admin Order Delivery workflow
    deliveryWorkflowStage: {
      type: String,
      enum: [
        "New",
        "Confirmed",
        "Shipment Ready",
        "In Transit",
        "Delivered",
        "Cancelled",
      ],
      default: "New",
    },
    confirmedAt: {
      type: Date,
    },
    dispatchedAt: {
      type: Date,
    },
    inTransitAt: {
      type: Date,
    },
    deliverySlot: {
      type: {
        type: String,
        enum: ["Fast", "Same-day", "Later", "Custom"],
      },
      label: { type: String, trim: true },
      scheduledFor: { type: Date },
    },
    netProfit: {
      type: Number,
    },

    // Tracking
    trackingNumber: {
      type: String,
      trim: true,
    },
    deliveryQrToken: {
      type: String,
      trim: true,
    },
    estimatedDeliveryDate: {
      type: Date,
    },
    deliveredAt: {
      type: Date,
    },

    // Delivery OTP
    deliveryOtp: {
      type: String,
      trim: true,
    },
    deliveryOtpExpiresAt: {
      type: Date,
    },
    deliveryOtpVerified: {
      type: Boolean,
      default: false,
    },
    invoiceEnabled: {
      type: Boolean,
      default: false,
    },

    // Notes
    adminNotes: {
      type: String,
      trim: true,
    },
    customerNotes: {
      type: String,
      trim: true,
    },
    deliveryInstructions: {
      type: String,
      trim: true,
    },
    specialRequests: {
      type: String,
      trim: true,
    },

    // Cancellation/Return
    cancellationReason: {
      type: String,
      trim: true,
    },
    cancelledAt: {
      type: Date,
    },
    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },

    returnStatus: {
      type: String,
      enum: ["None", "Partial", "Full"],
      default: "None",
    },
  },
  {
    timestamps: true,
  }
);

// Generate order number and delivery QR token before validation
OrderSchema.pre("validate", async function (this: IOrder, next) {
  if (!this.orderNumber) {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0");
    this.orderNumber = `ORD${timestamp}${random}`;
  }
  if (!this.deliveryQrToken) {
    this.deliveryQrToken = crypto.randomBytes(16).toString("hex");
  }
  next();
});

// Indexes for faster queries
OrderSchema.index({ customer: 1, orderDate: -1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ orderDate: -1 });
OrderSchema.index({ deliveryBoy: 1 });
OrderSchema.index({ orderNumber: 1 });
OrderSchema.index({ deliveryWorkflowStage: 1, orderDate: -1 });

const Order = mongoose.models.Order || mongoose.model<IOrder>("Order", OrderSchema);

export default Order;
