import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { detectModuleFromPath, getModuleAuthToken, getModuleUserData, setModuleAuthToken } from "../../../utils/moduleAuth";
import { getStoredStaffList, normalizeStaffMember, setStaffSession, setStoredStaffList, StaffModule } from "../../../utils/staffSession";
import { useAuth } from "../../../context/AuthContext";
import { getStaff as apiGetStaff, sendStaffLoginOtp, staffLogin as apiStaffLogin } from "../../../services/api/admin/adminStaffService";
import OTPInput from "../../../components/OTPInput";

export default function StaffLogin() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showOTP, setShowOTP] = useState(false);

  const moduleType = useMemo(
    () => (detectModuleFromPath() === "seller" ? "seller" : "admin") as StaffModule,
    []
  );

  const ensureModuleSession = (): boolean => {
    const moduleToken = getModuleAuthToken(moduleType);
    const moduleUser = getModuleUserData(moduleType);
    if (!moduleToken || !moduleUser) {
      const backupToken = localStorage.getItem(`${moduleType}_staff_base_token`);
      const backupUserRaw = localStorage.getItem(`${moduleType}_staff_base_user`);

      if (backupToken && backupUserRaw) {
        try {
          login(backupToken, JSON.parse(backupUserRaw));
        } catch {
          setError(`Please login once using ${moduleType} account, then try staff login.`);
          return false;
        }
      } else {
        setError(`Please login once using ${moduleType} account on this browser before staff login.`);
        return false;
      }
    }
    return true;
  };

  const handleSendOtp = async () => {
    if (phone.length !== 10) {
      setError("Phone number must be 10 digits.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      if (!ensureModuleSession()) return;

      let staffList = getStoredStaffList(moduleType);
      try {
        const response = await apiGetStaff();
        if (response.success && Array.isArray(response.data)) {
          staffList = response.data.map((item: any) =>
            normalizeStaffMember({
              id: item._id || item.id,
              name: item.name,
              phone: item.phone,
              role: item.role,
              commission: item.commission ?? 0,
              permissions: item.permissions,
            })
          );
          setStoredStaffList(moduleType, staffList);
        }
      } catch {
        // Keep existing behavior as fallback if API is temporarily unavailable.
      }

      const matchedStaff = staffList.find((staff) => staff.phone === phone);
      if (!matchedStaff) {
        setError("No staff found with this phone number.");
        return;
      }

      const otpResult = await sendStaffLoginOtp(phone);
      if (!otpResult.success) {
        setError(otpResult.message || "Failed to send OTP. Please try again.");
        return;
      }

      setShowOTP(true);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (otp: string) => {
    setLoading(true);
    setError("");
    try {
      if (!ensureModuleSession()) return;

      // Exchange for a staff-scoped token so the backend (not just this UI)
      // enforces the staff member's permissions on every request.
      let loginResult;
      try {
        loginResult = await apiStaffLogin(phone, otp);
      } catch (err: any) {
        setError(err.response?.data?.message || "Could not verify staff login with the server. Please try again.");
        return;
      }

      if (!loginResult.success || !loginResult.data) {
        setError(loginResult.message || "Staff login failed.");
        return;
      }

      setModuleAuthToken(loginResult.data.token, moduleType);

      const loggedInStaff = normalizeStaffMember({
        id: loginResult.data.staff._id,
        name: loginResult.data.staff.name,
        phone: loginResult.data.staff.phone,
        role: loginResult.data.staff.role,
        commission: loginResult.data.staff.commission ?? 0,
        permissions: loginResult.data.staff.permissions,
      });

      setStaffSession(moduleType, loggedInStaff);
      navigate(`/${moduleType}/pos/orders`, { replace: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-seller-50 to-seller-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        <div className="px-6 py-6 bg-[#f187b5] text-white">
          <h1 className="text-2xl font-bold">Staff Login</h1>
          <p className="text-sm text-white/90 mt-1">
            Login with staff phone to access POS modules
          </p>
        </div>

        <div className="p-6 space-y-4">
          {!showOTP ? (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Phone Number
                </label>
                <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-[#f187b5]/20 focus-within:border-[#f187b5]">
                  <span className="px-3 py-3 text-sm text-gray-500 border-r border-gray-200 bg-gray-50">
                    +91
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="Enter 10 digit phone"
                    className="flex-1 px-3 py-3 outline-none text-sm"
                    maxLength={10}
                    disabled={loading}
                  />
                </div>
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <button
                onClick={handleSendOtp}
                disabled={loading || phone.length !== 10}
                className="w-full py-3 bg-[#f187b5] text-white rounded-xl font-semibold hover:bg-[#db76a3] transition-colors disabled:opacity-60"
              >
                {loading ? "Please wait..." : "Send OTP"}
              </button>

              <button
                onClick={() => navigate(`/${moduleType}/login`)}
                className="w-full py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Back to {moduleType === "admin" ? "Admin" : "Seller"} Login
              </button>
            </>
          ) : (
            <>
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">
                  Enter the 4-digit OTP sent to
                </p>
                <p className="text-sm font-semibold text-gray-800">+91 {phone}</p>
              </div>

              <OTPInput onComplete={handleVerifyOtp} disabled={loading} />

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-center">
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowOTP(false);
                    setError("");
                  }}
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-lg font-semibold text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors border border-gray-300"
                >
                  Change Number
                </button>
                <button
                  onClick={handleSendOtp}
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-lg font-semibold text-sm bg-[#f187b5] text-white hover:bg-[#db76a3] transition-colors"
                >
                  {loading ? "Sending..." : "Resend OTP"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
