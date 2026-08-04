import { useState } from 'react';
import BottomSheet from './BottomSheet';
import { DeliverySlot } from '../../../services/api/admin/adminOrderService';

interface ChooseDeliveryTimeSheetProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (slot: DeliverySlot) => void;
    submitting?: boolean;
}

const FAST_OPTIONS = ['05 - 10 mins', '10 - 30 mins', '30 - 60 mins', '1 - 2 hrs'];
const SAME_DAY_OPTIONS = ['2 - 4 hrs', '4 - 8 hrs', '8 - 24 hrs'];
const LATER_OPTIONS = ['Tomorrow', '2 - 3 days', '3 - 5 days', '7 - 10 days'];

export default function ChooseDeliveryTimeSheet({
    isOpen,
    onClose,
    onConfirm,
    submitting,
}: ChooseDeliveryTimeSheetProps) {
    const [selected, setSelected] = useState<{ type: DeliverySlot['type']; label: string } | null>(null);
    const [customDateTime, setCustomDateTime] = useState('');

    const handleOptionClick = (type: DeliverySlot['type'], label: string) => {
        setSelected({ type, label });
        if (type !== 'Custom') setCustomDateTime('');
    };

    const handleConfirm = () => {
        if (!selected) return;
        if (selected.type === 'Custom' && !customDateTime) return;
        onConfirm({
            type: selected.type,
            label: selected.type === 'Custom' ? undefined : selected.label,
            scheduledFor: selected.type === 'Custom' ? new Date(customDateTime).toISOString() : undefined,
        });
    };

    const renderPill = (type: DeliverySlot['type'], label: string) => {
        const isActive = selected?.type === type && selected.label === label;
        return (
            <button
                key={label}
                onClick={() => handleOptionClick(type, label)}
                className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${isActive
                        ? 'bg-[var(--primary-color)] border-[var(--primary-color)] text-white'
                        : 'bg-white border-neutral-200 text-neutral-700 hover:border-[var(--primary-color)]'
                    }`}
            >
                {label}
            </button>
        );
    };

    return (
        <BottomSheet isOpen={isOpen} onClose={onClose} title="Choose Delivery Time">
            <p className="text-xs text-neutral-500 mb-3">Confirm to save delivery time and place this order.</p>

            <div className="mb-4">
                <div className="flex items-center gap-1 mb-2">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    <p className="text-xs font-semibold text-neutral-700">Fast delivery</p>
                    <span className="text-[10px] text-neutral-400 ml-1">For urgent orders</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    {FAST_OPTIONS.map((label) => renderPill('Fast', label))}
                </div>
            </div>

            <div className="mb-4">
                <p className="text-xs font-semibold text-neutral-700 mb-2">Same-day slots</p>
                <p className="text-[10px] text-neutral-400 -mt-1 mb-2">Same-day delivery</p>
                <div className="grid grid-cols-3 gap-2">
                    {SAME_DAY_OPTIONS.map((label) => renderPill('Same-day', label))}
                </div>
            </div>

            <div className="mb-4">
                <div className="flex items-center gap-1 mb-2">
                    <span className="w-2 h-2 rounded-full bg-orange-500" />
                    <p className="text-xs font-semibold text-neutral-700">Later delivery</p>
                    <span className="text-[10px] text-neutral-400 ml-1">For pre-orders</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    {LATER_OPTIONS.map((label) => renderPill('Later', label))}
                </div>
            </div>

            <div className="mb-4">
                <p className="text-xs font-semibold text-neutral-700 mb-2">Custom date &amp; time</p>
                <div className="flex items-center gap-2">
                    <input
                        type="datetime-local"
                        value={customDateTime}
                        onChange={(e) => {
                            setCustomDateTime(e.target.value);
                            setSelected({ type: 'Custom', label: 'Custom' });
                        }}
                        className="flex-1 px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                    />
                </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
                <button
                    onClick={onClose}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
                    disabled={submitting}
                >
                    Cancel
                </button>
                <button
                    onClick={handleConfirm}
                    disabled={!selected || (selected.type === 'Custom' && !customDateTime) || submitting}
                    className={`flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors ${!selected || (selected.type === 'Custom' && !customDateTime) || submitting
                            ? 'bg-neutral-400 cursor-not-allowed'
                            : 'bg-[var(--primary-color)] hover:bg-[var(--primary-dark)]'
                        }`}
                >
                    {submitting ? 'Confirming...' : 'Confirm'}
                </button>
            </div>
        </BottomSheet>
    );
}
