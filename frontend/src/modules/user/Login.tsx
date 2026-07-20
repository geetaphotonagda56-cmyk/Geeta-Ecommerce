import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, ShoppingBag, Sparkles, ArrowLeft } from 'lucide-react';
import { sendOTP, verifyOTP } from '../../services/api/auth/customerAuthService';
import { useAuth } from '../../context/AuthContext';
import OTPInput from '../../components/OTPInput';
import { requestNotificationPermission } from '../../services/pushNotificationService';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [mobileNumber, setMobileNumber] = useState('');
  const [showOTP, setShowOTP] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleContinue = async () => {
    if (mobileNumber.length !== 10) return;

    setLoading(true);
    setError('');

    try {
      const response = await sendOTP(mobileNumber);
      if (response.sessionId) {
        setSessionId(response.sessionId);
      }
      setShowOTP(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to initiate call. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOTPComplete = async (otp: string) => {
    setLoading(true);
    setError('');

    try {
      const response = await verifyOTP(mobileNumber, otp, sessionId);
      if (response.success && response.data) {
        login(response.data.token, {
          id: response.data.user.id,
          name: response.data.user.name,
          phone: response.data.user.phone,
          email: response.data.user.email,
          walletAmount: response.data.user.walletAmount,
          refCode: response.data.user.refCode,
          status: response.data.user.status,
        });

        await requestNotificationPermission('customer', response.data.token);

        navigate('/');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-full bg-white flex flex-col overflow-hidden">
      {/* Hero */}
      <div
        className="relative flex flex-col items-center justify-center overflow-hidden flex-shrink-0"
        style={{
          height: '38%',
          background: `linear-gradient(135deg, var(--customer-primary) 0%, var(--customer-primary-dark) 100%)`,
        }}
      >
        {/* Decorative animated blobs */}
        <motion.div
          className="absolute rounded-full"
          style={{ width: 180, height: 180, background: 'rgba(255,255,255,0.12)', top: -60, left: -50 }}
          animate={{ scale: [1, 1.15, 1], rotate: [0, 30, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute rounded-full"
          style={{ width: 140, height: 140, background: 'rgba(255,255,255,0.1)', bottom: -40, right: -30 }}
          animate={{ scale: [1, 1.2, 1], rotate: [0, -20, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
        />
        <motion.div
          className="absolute"
          style={{ top: '18%', right: '14%' }}
          animate={{ y: [0, -8, 0], rotate: [0, 8, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Sparkles className="w-5 h-5 text-white/60" />
        </motion.div>
        <motion.div
          className="absolute"
          style={{ bottom: '20%', left: '12%' }}
          animate={{ y: [0, 8, 0], rotate: [0, -8, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        >
          <ShoppingBag className="w-6 h-6 text-white/50" />
        </motion.div>

        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-3 left-3 sm:top-4 sm:left-4 z-20 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
        </button>

        {/* Logo + tagline */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="relative z-10 flex flex-col items-center gap-3 px-6"
        >
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="bg-white rounded-2xl p-3 shadow-lg"
          >
            <img
              src="/assets/geetastoreslogo.png"
              alt="Geeta Stores"
              className="h-10 sm:h-12 w-auto object-contain"
            />
          </motion.div>
          <div className="text-center">
            <h1 className="text-white font-bold text-lg sm:text-xl tracking-tight">Welcome back</h1>
            <p className="text-white/80 text-xs sm:text-sm mt-0.5">Groceries delivered in 10–15 mins</p>
          </div>
        </motion.div>
      </div>

      {/* Form Card */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1, ease: 'easeOut' }}
        className="flex-1 bg-white rounded-t-3xl -mt-6 relative z-10 flex flex-col shadow-[0_-8px_24px_rgba(0,0,0,0.06)] overflow-y-auto"
      >
        <div className="w-full max-w-sm mx-auto px-5 sm:px-6 pt-7 pb-4 flex-1 flex flex-col">
          <AnimatePresence mode="wait">
            {!showOTP ? (
              <motion.div
                key="mobile-step"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.25 }}
              >
                <h2 className="text-base sm:text-lg font-bold text-neutral-900 mb-1">Login to continue</h2>
                <p className="text-xs sm:text-sm text-neutral-500 mb-5">
                  We'll call you with a 4-digit verification code
                </p>

                <div className="mb-3">
                  <div className="flex items-center bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden focus-within:border-[var(--customer-primary)] focus-within:ring-2 focus-within:ring-[var(--customer-primary-alpha-10)] transition-all">
                    <div className="flex items-center gap-1.5 px-3 py-3 text-sm font-semibold text-neutral-500 border-r border-neutral-200">
                      <Phone className="w-4 h-4" />
                      +91
                    </div>
                    <input
                      type="tel"
                      value={mobileNumber}
                      onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="Enter mobile number"
                      className="flex-1 px-3 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none bg-transparent"
                      maxLength={10}
                      disabled={loading}
                      autoFocus
                    />
                  </div>
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-3 text-xs text-[var(--customer-primary-dark)] bg-[var(--customer-primary-alpha-10)] px-3 py-2 rounded-lg overflow-hidden"
                    >
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleContinue}
                  disabled={mobileNumber.length !== 10 || loading}
                  className={`w-full py-3 rounded-xl font-bold text-sm transition-colors shadow-sm ${
                    mobileNumber.length === 10 && !loading
                      ? 'text-white shadow-md'
                      : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                  }`}
                  style={
                    mobileNumber.length === 10 && !loading
                      ? { background: `linear-gradient(135deg, var(--customer-primary) 0%, var(--customer-primary-dark) 100%)` }
                      : undefined
                  }
                >
                  {loading ? 'Calling...' : 'Continue'}
                </motion.button>
              </motion.div>
            ) : (
              <motion.div
                key="otp-step"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.25 }}
                className="text-center"
              >
                <h2 className="text-base sm:text-lg font-bold text-neutral-900 mb-1">Verify your number</h2>
                <p className="text-xs sm:text-sm text-neutral-500 mb-1">
                  Enter the 4-digit OTP sent via voice call to
                </p>
                <p className="text-sm font-bold text-neutral-800 mb-5">+91 {mobileNumber}</p>

                <div className="flex justify-center mb-4">
                  <OTPInput onComplete={handleOTPComplete} disabled={loading} />
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-4 text-xs text-[var(--customer-primary-dark)] bg-[var(--customer-primary-alpha-10)] px-3 py-2 rounded-lg overflow-hidden"
                    >
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex gap-2">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      setShowOTP(false);
                      setError('');
                    }}
                    disabled={loading}
                    className="flex-1 py-3 rounded-xl font-bold text-xs sm:text-sm bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
                  >
                    Change Number
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleContinue}
                    disabled={loading}
                    className="flex-1 py-3 rounded-xl font-bold text-xs sm:text-sm text-[var(--customer-primary-dark)] border-2 border-[var(--customer-primary)] hover:bg-[var(--customer-primary-alpha-10)] transition-colors"
                  >
                    {loading ? 'Verifying...' : 'Resend OTP'}
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-auto pt-6 text-center space-y-2">
            <p className="text-[10px] sm:text-[11px] text-neutral-400">
              Access your saved addresses from Geeta Stores automatically!
            </p>
            <p className="text-xs sm:text-sm text-neutral-600">
              Don't have an account?{' '}
              <button
                onClick={() => navigate('/signup')}
                className="text-[var(--customer-primary-dark)] font-bold hover:underline"
              >
                Sign Up
              </button>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
