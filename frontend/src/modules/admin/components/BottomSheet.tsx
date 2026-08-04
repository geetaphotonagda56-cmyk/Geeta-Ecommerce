import { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface BottomSheetProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    maxHeight?: string;
}

export default function BottomSheet({
    isOpen,
    onClose,
    title,
    children,
    maxHeight = '85vh',
}: BottomSheetProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[120] flex items-end justify-center">
                    <motion.div
                        className="fixed inset-0 bg-black/50"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />
                    <motion.div
                        className="relative w-full max-w-lg bg-white rounded-t-2xl shadow-xl overflow-y-auto"
                        style={{ maxHeight }}
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                    >
                        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-neutral-200 rounded-t-2xl">
                            <div className="flex-1 flex justify-center absolute left-0 right-0 top-1.5 pointer-events-none">
                                <div className="w-10 h-1 rounded-full bg-neutral-300" />
                            </div>
                            <h2 className="text-base font-semibold text-neutral-900 mt-2">{title}</h2>
                            <button
                                onClick={onClose}
                                className="text-neutral-400 hover:text-neutral-600 transition-colors mt-2"
                                aria-label="Close"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path
                                        d="M18 6L6 18M6 6l12 12"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            </button>
                        </div>
                        <div className="px-5 py-4">{children}</div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
