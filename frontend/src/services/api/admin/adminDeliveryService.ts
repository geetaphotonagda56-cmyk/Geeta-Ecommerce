import api from "../config";


import { ApiResponse } from "./types";

export interface DeliveryBoy {
  _id: string;
  name: string;
  mobile: string;
  dateOfBirth?: string;
  address: string;
  city: string;
  pincode?: string;
  drivingLicense?: string;
  nationalIdentityCard?: string;
  bankAccountNumber: string;
  bankName: string;
  accountName: string;
  ifscCode: string;
  otherPaymentInformation?: string;
  bonusType?: string;
  commissionType: "Percentage" | "Fixed";
  commission?: number;
  minAmount?: number;
  maxAmount?: number;
  balance: number;
  cashCollected: number;
  status: "Active" | "Inactive";
  available: "Available" | "Not Available";
  currentLocation?: {
    latitude: number;
    longitude: number;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateDeliveryBoyData {
  name: string;
  mobile: string;
  password: string;
  dateOfBirth?: string;
  address: string;
  city: string;
  pincode?: string;
  drivingLicense?: string;
  nationalIdentityCard?: string;
  bankAccountNumber: string;
  bankName: string;
  accountName: string;
  ifscCode: string;
  otherPaymentInformation?: string;
  bonusType?: string;
  commissionType?: "Percentage" | "Fixed";
  commission?: number;
  minAmount?: number;
  maxAmount?: number;
}

export interface UpdateDeliveryBoyData {
  name?: string;
  mobile?: string;
  dateOfBirth?: string;
  address?: string;
  city?: string;
  pincode?: string;
  drivingLicense?: string;
  nationalIdentityCard?: string;
  bankAccountNumber?: string;
  bankName?: string;
  accountName?: string;
  ifscCode?: string;
  otherPaymentInformation?: string;
  bonusType?: string;
  commissionType?: "Percentage" | "Fixed";
  commission?: number;
  minAmount?: number;
  maxAmount?: number;
  status?: "Active" | "Inactive";
  available?: "Available" | "Not Available";
}

export interface CashCollection {
  _id: string;
  deliveryBoyId: string;
  deliveryBoyName: string;
  orderId: string;
  total: number;
  amount: number;
  remark?: string;
  collectedAt: string;
  collectedBy: string;
}

export interface CreateCashCollectionData {
  deliveryBoyId: string;
  orderId: string;
  amount: number;
  remark?: string;
}

export interface GetDeliveryParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: "Active" | "Inactive";
  available?: "Available" | "Not Available";
  city?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface GetCashCollectionParams {
  page?: number;
  limit?: number;
  deliveryBoyId?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

/**
 * Delivery Boy APIs
 */
export const getDeliveryBoys = async (
  params?: GetDeliveryParams
): Promise<ApiResponse<DeliveryBoy[]>> => {
  const response = await api.get<ApiResponse<DeliveryBoy[]>>(
    "/admin/delivery",
    { params }
  );
  return response.data;
};

export const getDeliveryBoyById = async (
  id: string
): Promise<ApiResponse<DeliveryBoy>> => {
  const response = await api.get<ApiResponse<DeliveryBoy>>(
    `/admin/delivery/${id}`
  );
  return response.data;
};

export const createDeliveryBoy = async (
  data: CreateDeliveryBoyData
): Promise<ApiResponse<DeliveryBoy>> => {
  const response = await api.post<ApiResponse<DeliveryBoy>>(
    "/admin/delivery",
    data
  );
  return response.data;
};

/**
 * Quick-create a delivery partner from the Dispatch Order popup - just name
 * + mobile, immediately Active. Admin can fill in the rest later.
 */
export const quickCreateDeliveryBoy = async (data: {
  name: string;
  mobile: string;
}): Promise<ApiResponse<DeliveryBoy>> => {
  const response = await api.post<ApiResponse<DeliveryBoy>>(
    "/admin/delivery/quick-create",
    data
  );
  return response.data;
};

export const updateDeliveryBoy = async (
  id: string,
  data: UpdateDeliveryBoyData
): Promise<ApiResponse<DeliveryBoy>> => {
  const response = await api.put<ApiResponse<DeliveryBoy>>(
    `/admin/delivery/${id}`,
    data
  );
  return response.data;
};

export const deleteDeliveryBoy = async (
  id: string
): Promise<ApiResponse<void>> => {
  const response = await api.delete<ApiResponse<void>>(
    `/admin/delivery/${id}`
  );
  return response.data;
};

export const updateDeliveryBoyStatus = async (
  id: string,
  status: "Active" | "Inactive"
): Promise<ApiResponse<DeliveryBoy>> => {
  const response = await api.patch<ApiResponse<DeliveryBoy>>(
    `/admin/delivery/${id}/status`,
    { status }
  );
  return response.data;
};

export const updateDeliveryBoyAvailability = async (
  id: string,
  available: "Available" | "Not Available"
): Promise<ApiResponse<DeliveryBoy>> => {
  const response = await api.patch<ApiResponse<DeliveryBoy>>(
    `/admin/delivery/${id}/availability`,
    { available }
  );
  return response.data;
};

/**
 * Cash Collection APIs
 */
export const getCashCollections = async (
  params?: GetCashCollectionParams
): Promise<ApiResponse<CashCollection[]>> => {
  const response = await api.get<ApiResponse<CashCollection[]>>(
    "/admin/cash-collections",
    { params }
  );
  return response.data;
};

export const createCashCollection = async (
  data: CreateCashCollectionData
): Promise<ApiResponse<CashCollection>> => {
  const response = await api.post<ApiResponse<CashCollection>>(
    "/admin/cash-collections",
    data
  );
  return response.data;
};

export const updateCashCollection = async (
  id: string,
  data: Partial<CashCollection>
): Promise<ApiResponse<CashCollection>> => {
  const response = await api.put<ApiResponse<CashCollection>>(
    `/admin/cash-collections/${id}`,
    data
  );
  return response.data;
};

export const deleteCashCollection = async (
  id: string
): Promise<ApiResponse<void>> => {
  const response = await api.delete<ApiResponse<void>>(
    `/admin/cash-collections/${id}`
  );
  return response.data;
};

/**
 * Get delivery boy cash collections
 */
export const getDeliveryBoyCashCollections = async (
  deliveryBoyId: string,
  params?: { page?: number; limit?: number }
): Promise<ApiResponse<CashCollection[]>> => {
  const response = await api.get<ApiResponse<CashCollection[]>>(
    `/admin/delivery/${deliveryBoyId}/cash-collections`,
    { params }
  );
  return response.data;
};

/**
 * Delivery Performance Report
 */
export interface DeliveryPerformanceRow {
  deliveryBoyId: string;
  name?: string;
  mobile?: string;
  assigned: number;
  delivered: number;
  failed: number;
  cancelled: number;
  avgDurationMs: number;
  onTimePercent: number | null;
}

export interface DeliveryPerformanceAssignment {
  _id: string;
  order?: { _id: string; orderNumber?: string; estimatedDeliveryDate?: string; total?: number };
  deliveryBoy?: { _id: string; name?: string; mobile?: string };
  status: string;
  assignmentType: string;
  assignedAt: string;
  acceptedAt?: string;
  pickedUpAt?: string;
  inTransitAt?: string;
  deliveredAt?: string;
  failedAt?: string;
  failureReason?: string;
}

export interface DeliveryPerformanceSummary {
  assigned: number;
  delivered: number;
  failed: number;
  cancelled: number;
  onTimePercent: number | null;
  avgDurationMs: number;
}

export interface DeliveryPerformanceReportData {
  perDeliveryBoy: DeliveryPerformanceRow[];
  summary: DeliveryPerformanceSummary;
  assignments: DeliveryPerformanceAssignment[];
}

export interface GetDeliveryPerformanceParams {
  page?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  deliveryBoyId?: string;
}

export const getDeliveryPerformanceReport = async (
  params?: GetDeliveryPerformanceParams
): Promise<ApiResponse<DeliveryPerformanceReportData>> => {
  const response = await api.get<ApiResponse<DeliveryPerformanceReportData>>(
    "/admin/reports/delivery-performance",
    { params }
  );
  return response.data;
};

/**
 * Delivery Payout Report
 */
export interface DeliveryPayoutRow {
  deliveryBoyId: string;
  name?: string;
  mobile?: string;
  commissionType?: "Percentage" | "Fixed";
  commission?: number;
  deliveredCount: number;
  totalPayout: number;
  avgPerDelivery: number;
}

export interface DeliveryPayoutAssignment {
  _id: string;
  order?: { _id: string; orderNumber?: string; shipping?: number; total?: number };
  deliveryBoy?: { _id: string; name?: string; mobile?: string };
  deliveredAt?: string;
  commissionAmount?: number;
  commissionType?: "Percentage" | "Fixed";
  commissionRate?: number;
  commissionBasisAmount?: number;
}

export interface DeliveryPayoutSummary {
  deliveredCount: number;
  totalPayout: number;
}

export interface DeliveryPayoutReportData {
  perDeliveryBoy: DeliveryPayoutRow[];
  summary: DeliveryPayoutSummary;
  assignments: DeliveryPayoutAssignment[];
}

export interface GetDeliveryPayoutParams {
  page?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  deliveryBoyId?: string;
}

export const getDeliveryPayoutReport = async (
  params?: GetDeliveryPayoutParams
): Promise<ApiResponse<DeliveryPayoutReportData>> => {
  const response = await api.get<ApiResponse<DeliveryPayoutReportData>>(
    "/admin/reports/delivery-payout",
    { params }
  );
  return response.data;
};
