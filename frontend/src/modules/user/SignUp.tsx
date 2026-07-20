import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Phone, ShoppingBag, Sparkles, ArrowLeft } from 'lucide-react';
import { register, sendOTP, verifyOTP } from '../../services/api/auth/customerAuthService';
import { useAuth } from '../../context/AuthContext';
import OTPInput from '../../components/OTPInput';
import { requestNotificationPermission } from '../../services/pushNotificationService';

export default function SignUp() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    email: '',
    dateOfBirth: '',
  });
  const [sessionId, setSessionId] = useState('');
  const [showOTP, setShowOTP] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'mobile') {
      setFormData(prev => ({
        ...prev,
        [name]: value.replace(/\D/g, '').slice(0, 10),
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.mobile) {
      setError('Name and mobile are required');
      return;
    }

    if (formData.mobile.length !== 10) {
      setError('Please enter a valid 10-digit mobile number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await register({
        name: formData.name,
        mobile: formData.mobile,
        email: formData.email || undefined,
        dateOfBirth: formData.dateOfBirth || undefined,
      });

      if (response.success) {
        try {
          const otpRes = await sendOTP(formData.mobile);
          if (otpRes.sessionId) setSessionId(otpRes.sessionId);
          setShowOTP(true);
        } catch (otpErr: any) {
          setError(otpErr.response?.data?.message || 'Registration successful but failed to setup call.');
        }

        if (response.data?.token) {
          requestNotificationPermission('customer', response.data.token);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOTPComplete = async (otp: string) => {
    setLoading(true);
    setError('');

    try {
      const response = await verifyOTP(formData.mobile, otp, sessionId);
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
          height: '32%',
          background: `linear-gradient(135deg, var(--customer-primary) 0%, var(--customer-primary-dark) 100%)`,
        }}
      >
        {/* Decorative animated blobs */}
        <motion.div
          className="absolute rounded-full"
          style={{ width: 160, height: 160, background: 'rgba(255,255,255,0.12)', top: -50, right: -40 }}
          animate={{ scale: [1, 1.15, 1], rotate: [0, -25, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute rounded-full"
          style={{ width: 120, height: 120, background: 'rgba(255,255,255,0.1)', bottom: -30, left: -30 }}
          animate={{ scale: [1, 1.2, 1], rotate: [0, 20, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
        />
        <motion.div
          className="absolute"
          style={{ top: '16%', left: '14%' }}
          animate={{ y: [0, -8, 0], rotate: [0, -8, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Sparkles className="w-5 h-5 text-white/60" />
        </motion.div>
        <motion.div
          className="absolute"
          style={{ bottom: '18%', right: '12%' }}
          animate={{ y: [0, 8, 0], rotate: [0, 8, 0] }}
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
          className="relative z-10 flex flex-col items-center gap-2.5 px-6"
        >
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="bg-white rounded-2xl p-2.5 shadow-lg"
          >
            <img
              src="/assets/geetastoreslogo.png"
              alt="Geeta Stores"
              className="h-9 sm:h-11 w-auto object-contain"
            />
          </motion.div>
          <div className="text-center">
            <h1 className="text-white font-bold text-base sm:text-lg tracking-tight">Join Geeta Stores</h1>
            <p className="text-white/80 text-xs mt-0.5">Groceries delivered in 10–15 mins</p>
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
        <div className="w-full max-w-sm mx-auto px-5 sm:px-6 pt-6 pb-4 flex-1 flex flex-col">
          <AnimatePresence mode="wait">
            {!showOTP ? (
              <motion.div
                key="signup-step"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.25 }}
              >
                <h2 className="text-base sm:text-lg font-bold text-neutral-900 mb-1">Create your account</h2>
                <p className="text-xs sm:text-sm text-neutral-500 mb-4">
                  Just your name and number to get started
                </p>

                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="flex items-center bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden focus-within:border-[var(--customer-primary)] focus-within:ring-2 focus-within:ring-[var(--customer-primary-alpha-10)] transition-all">
                    <div className="pl-3 text-neutral-400">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      placeholder="Full Name"
                      required
                      className="flex-1 px-3 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none bg-transparent"
                      disabled={loading}
                      autoFocus
                    />
                  </div>

                  <div className="flex items-center bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden focus-within:border-[var(--customer-primary)] focus-within:ring-2 focus-within:ring-[var(--customer-primary-alpha-10)] transition-all">
                    <div className="flex items-center gap-1.5 px-3 py-3 text-sm font-semibold text-neutral-500 border-r border-neutral-200">
                      <Phone className="w-4 h-4" />
                      +91
                    </div>
                    <input
                      type="tel"
                      name="mobile"
                      value={formData.mobile}
                      onChange={handleInputChange}
                      placeholder="Mobile Number"
                      required
                      className="flex-1 px-3 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none bg-transparent"
                      maxLength={10}
                      disabled={loading}
                    />
                  </div>

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="text-xs text-[var(--customer-primary-dark)] bg-[var(--customer-primary-alpha-10)] px-3 py-2 rounded-lg overflow-hidden"
                      >
                        {error}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    type="submit"
                    disabled={loading || !formData.name || formData.mobile.length !== 10}
                    className={`w-full py-3 rounded-xl font-bold text-sm transition-colors shadow-sm ${
                      formData.name && formData.mobile.length === 10 && !loading
                        ? 'text-white shadow-md'
                        : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                    }`}
                    style={
                      formData.name && formData.mobile.length === 10 && !loading
                        ? { background: `linear-gradient(135deg, var(--customer-primary) 0%, var(--customer-primary-dark) 100%)` }
                        : undefined
                    }
                  >
                    {loading ? 'Creating Account...' : 'Sign Up'}
                  </motion.button>
                </form>
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
                  Enter the 4-digit OTP sent via call to
                </p>
                <p className="text-sm font-bold text-neutral-800 mb-5">+91 {formData.mobile}</p>

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
                    Back
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleSubmit}
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
              By signing up, you agree to Geeta Stores's Terms of Service and Privacy Policy
            </p>
            <p className="text-xs sm:text-sm text-neutral-600">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="text-[var(--customer-primary-dark)] font-bold hover:underline"
              >
                Login
              </button>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
