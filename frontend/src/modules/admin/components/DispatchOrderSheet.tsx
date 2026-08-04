import { useEffect, useState } from 'react';
import BottomSheet from './BottomSheet';
import { getDeliveryBoys, quickCreateDeliveryBoy, DeliveryBoy } from '../../../services/api/admin/adminDeliveryService';

interface DispatchOrderSheetProps {
    isOpen: boolean;
    onClose: () => void;
    onDispatch: (deliveryBoyId: string) => void;
    submitting?: boolean;
}

export default function DispatchOrderSheet({
    isOpen,
    onClose,
    onDispatch,
    submitting,
}: DispatchOrderSheetProps) {
    const [search, setSearch] = useState('');
    const [results, setResults] = useState<DeliveryBoy[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedId, setSelectedId] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [showAddNew, setShowAddNew] = useState(false);
    const [newName, setNewName] = useState('');
    const [newMobile, setNewMobile] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setSelectedId('');
        setError(null);
        setShowAddNew(false);
        setNewName('');
        setNewMobile('');
        fetchDeliveryBoys('');
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const timeout = setTimeout(() => fetchDeliveryBoys(search), 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const fetchDeliveryBoys = async (query: string) => {
        try {
            setLoading(true);
            const response = await getDeliveryBoys({ search: query || undefined, status: 'Active', limit: 50 });
            if (response.success && response.data) {
                setResults(response.data);
            }
        } catch (err) {
            console.error('Error fetching delivery boys:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateNew = async () => {
        if (!newName.trim() || !newMobile.trim()) {
            setError('Name and phone number are required');
            return;
        }
        try {
            setCreating(true);
            setError(null);
            const response = await quickCreateDeliveryBoy({ name: newName.trim(), mobile: newMobile.trim() });
            if (response.success && response.data) {
                setResults((prev) => [response.data as DeliveryBoy, ...prev]);
                setSelectedId(response.data._id);
                setShowAddNew(false);
                setNewName('');
                setNewMobile('');
            } else {
                setError(response.message || 'Failed to create delivery partner');
            }
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Failed to create delivery partner');
        } finally {
            setCreating(false);
        }
    };

    const handleDispatch = () => {
        if (!selectedId) return;
        onDispatch(selectedId);
    };

    return (
        <BottomSheet isOpen={isOpen} onClose={onClose} title="Dispatch Order">
            <p className="text-xs text-neutral-500 mb-3">
                Select an existing delivery partner, or add a new one by name and phone number.
            </p>

            {error && (
                <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-xs text-red-700">{error}</p>
                </div>
            )}

            <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or phone number"
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)] mb-3"
            />

            <div className="max-h-56 overflow-y-auto space-y-2 mb-3">
                {loading ? (
                    <p className="text-xs text-neutral-500 py-3 text-center">Loading...</p>
                ) : results.length === 0 ? (
                    <p className="text-xs text-neutral-500 py-3 text-center">No delivery partners found</p>
                ) : (
                    results.map((db) => (
                        <button
                            key={db._id}
                            onClick={() => setSelectedId(db._id)}
                            className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors flex items-center justify-between ${selectedId === db._id
                                    ? 'border-[var(--primary-color)] bg-[var(--primary-alpha-20)]'
                                    : 'border-neutral-200 hover:border-[var(--primary-color)]'
                                }`}
                        >
                            <div>
                                <p className="text-sm font-medium text-neutral-900">{db.name}</p>
                                <p className="text-xs text-neutral-500">{db.mobile}</p>
                            </div>
                            {selectedId === db._id && (
                                <span className="text-[var(--primary-color)] text-sm">✓</span>
                            )}
                        </button>
                    ))
                )}
            </div>

            {!showAddNew ? (
                <button
                    onClick={() => setShowAddNew(true)}
                    className="text-sm font-medium text-[var(--primary-color)] hover:underline mb-4"
                >
                    + Add new delivery partner
                </button>
            ) : (
                <div className="mb-4 p-3 bg-neutral-50 rounded-lg space-y-2">
                    <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Partner name"
                        className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                    />
                    <input
                        type="tel"
                        value={newMobile}
                        onChange={(e) => setNewMobile(e.target.value)}
                        placeholder="Phone number"
                        className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                    />
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowAddNew(false)}
                            className="flex-1 px-3 py-2 text-xs font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleCreateNew}
                            disabled={creating}
                            className="flex-1 px-3 py-2 text-xs font-medium text-white bg-[var(--primary-color)] rounded-lg disabled:bg-neutral-400"
                        >
                            {creating ? 'Adding...' : 'Add Partner'}
                        </button>
                    </div>
                </div>
            )}

            <button
                onClick={handleDispatch}
                disabled={!selectedId || submitting}
                className={`w-full px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors ${!selectedId || submitting
                        ? 'bg-neutral-400 cursor-not-allowed'
                        : 'bg-[var(--primary-color)] hover:bg-[var(--primary-dark)]'
                    }`}
            >
                {submitting ? 'Dispatching...' : 'Dispatch'}
            </button>
        </BottomSheet>
    );
}
