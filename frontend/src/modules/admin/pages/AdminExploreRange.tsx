import { useState, useEffect, useRef } from 'react';
import { rangeCardService, RangeCard } from '../../../services/rangeCardService';
import { uploadImage } from '../../../services/api/uploadService';
import { useToast } from '../../../context/ToastContext';
import ImageCropperModal from '../../../components/ImageCropperModal';

export default function AdminExploreRange() {
  const { showToast } = useToast();
  const [cards, setCards] = useState<RangeCard[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  // Form State
  const [label, setLabel] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [order, setOrder] = useState('0');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [cropperFile, setCropperFile] = useState<File | null>(null);

  useEffect(() => {
    loadCards();
  }, []);

  const loadCards = async () => {
    setLoading(true);
    try {
      const allCards = await rangeCardService.getAllRangeCards();
      setCards(allCards);
    } catch (error) {
      showToast('Failed to load range cards', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCropperFile(file);
    }
  };

  const handleCropped = (croppedFile: File) => {
    setSelectedFile(croppedFile);
    setPreviewUrl(URL.createObjectURL(croppedFile));
    setCropperFile(null);
  };

  const resetForm = () => {
    setEditingCardId(null);
    setLabel('');
    setMinPrice('');
    setMaxPrice('');
    setOrder('0');
    setSelectedFile(null);
    setPreviewUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
    if (!label.trim()) return showToast('Please enter a label', 'error');
    if (!editingCardId && !selectedFile) return showToast('Please select an image', 'error');

    setLoading(true);
    try {
      let finalImageUrl = editingCardId
        ? cards.find((c) => c.id === editingCardId)?.imageUrl || ''
        : '';

      if (selectedFile) {
        const uploadRes = await uploadImage(selectedFile, 'range-cards');
        finalImageUrl = uploadRes.secureUrl || uploadRes.url;
      }

      const payload = {
        label: label.trim(),
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        order: Number(order) || 0,
        imageUrl: finalImageUrl,
      };

      if (editingCardId) {
        await rangeCardService.updateRangeCard(editingCardId, payload);
        showToast('Range card updated successfully', 'success');
      } else {
        await rangeCardService.addRangeCard({ ...payload, isActive: true });
        showToast('Range card added successfully', 'success');
      }

      resetForm();
      loadCards();
    } catch (e: any) {
      console.error('Error saving range card', e);
      showToast(e.message || 'Failed to save range card', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (card: RangeCard) => {
    setEditingCardId(card.id);
    setLabel(card.label);
    setMinPrice(card.minPrice !== undefined ? String(card.minPrice) : '');
    setMaxPrice(card.maxPrice !== undefined ? String(card.maxPrice) : '');
    setOrder(String(card.order ?? 0));
    setPreviewUrl(card.imageUrl);
    setSelectedFile(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this range card?')) {
      setLoading(true);
      try {
        await rangeCardService.deleteRangeCard(id);
        showToast('Range card deleted successfully', 'success');
        loadCards();
      } catch (e) {
        showToast('Failed to delete range card', 'error');
        setLoading(false);
      }
    }
  };

  const toggleActive = async (card: RangeCard) => {
    try {
      await rangeCardService.updateRangeCard(card.id, { isActive: !card.isActive });
      loadCards();
    } catch (e) {
      showToast('Failed to update range card', 'error');
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Explore Our Range</h1>
        <div className="text-sm text-gray-500">Home / Explore Our Range</div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* LEFT: Add/Edit Form */}
        <div className="w-full lg:w-1/3">
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="bg-[var(--primary-color)] text-white px-4 py-3 font-semibold text-lg flex justify-between items-center">
              {editingCardId ? 'Edit Range Card' : 'Add Range Card'}
              {editingCardId && (
                <button onClick={resetForm} className="text-xs bg-white text-[var(--primary-color)] px-2 py-1 rounded hover:bg-gray-100">
                  Cancel
                </button>
              )}
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Label <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. UNDER ₹49"
                  className="w-full border border-gray-300 rounded-md p-2.5 outline-none focus:ring-1 focus:ring-[var(--primary-color)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min Price</label>
                  <input
                    type="number"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    placeholder="Optional"
                    className="w-full border border-gray-300 rounded-md p-2.5 outline-none focus:ring-1 focus:ring-[var(--primary-color)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Price</label>
                  <input
                    type="number"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    placeholder="Optional"
                    className="w-full border border-gray-300 rounded-md p-2.5 outline-none focus:ring-1 focus:ring-[var(--primary-color)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Order</label>
                <input
                  type="number"
                  value={order}
                  onChange={(e) => setOrder(e.target.value)}
                  className="w-full border border-gray-300 rounded-md p-2.5 outline-none focus:ring-1 focus:ring-[var(--primary-color)]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Card Image <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <label className={`cursor-pointer bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 px-4 py-2 rounded-md transition-colors text-sm font-medium ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
                    Choose File
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/*"
                      onChange={handleFileChange}
                      disabled={loading}
                    />
                  </label>
                  <span className="text-gray-400 text-sm italic truncate max-w-[150px]">
                    {selectedFile ? selectedFile.name : 'No file chosen'}
                  </span>
                </div>
                {previewUrl && (
                  <div className="mt-3 aspect-square w-32 bg-gray-50 rounded border overflow-hidden">
                    <img src={previewUrl} alt="Preview" className="h-full w-full object-contain" />
                  </div>
                )}
              </div>

              <button
                onClick={handleSave}
                disabled={loading}
                className={`w-full bg-[var(--primary-color)] hover:bg-[var(--primary-dark)] text-white font-medium py-2.5 rounded-md transition-colors shadow-sm mt-2 flex justify-center items-center ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {loading ? 'Saving...' : editingCardId ? 'Update Card' : 'Add Card'}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: View Cards Table */}
        <div className="w-full lg:w-2/3">
          <div className="bg-white rounded-lg shadow-sm overflow-hidden h-full flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-semibold text-gray-700 text-lg">Range Cards</h3>
            </div>

            <div className="overflow-x-auto flex-1">
              {loading && cards.length === 0 ? (
                <div className="p-8 text-center text-gray-500">Loading range cards...</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-white text-gray-600 text-xs font-bold border-b">
                    <tr>
                      <th className="px-6 py-4">Order</th>
                      <th className="px-6 py-4">Image</th>
                      <th className="px-6 py-4">Label</th>
                      <th className="px-6 py-4">Price Range</th>
                      <th className="px-6 py-4">Active</th>
                      <th className="px-6 py-4">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {cards.map((card) => (
                      <tr key={card.id} className="hover:bg-gray-50 group">
                        <td className="px-6 py-4 text-gray-500 font-medium">{card.order}</td>
                        <td className="px-6 py-4">
                          <div className="h-12 w-12 bg-gray-50 rounded border overflow-hidden">
                            <img src={card.imageUrl} alt="" className="h-full w-full object-contain" />
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-700 font-medium text-sm">{card.label}</td>
                        <td className="px-6 py-4 text-gray-500 text-sm">
                          {card.minPrice !== undefined ? `₹${card.minPrice} - ` : ''}
                          {card.maxPrice !== undefined ? `₹${card.maxPrice}` : card.minPrice !== undefined ? '+' : '-'}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => toggleActive(card)}
                            className={`text-[10px] px-2 py-0.5 rounded font-medium ${card.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                          >
                            {card.isActive ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleEdit(card)}
                              className="p-1.5 bg-[var(--primary-color)] text-white rounded shadow-sm hover:opacity-90"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            </button>
                            <button
                              onClick={() => handleDelete(card.id)}
                              className="p-1.5 bg-red-600 text-white rounded shadow-sm hover:opacity-90"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {cards.length === 0 && !loading && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                          No range cards found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      <ImageCropperModal
        file={cropperFile}
        open={!!cropperFile}
        onClose={() => setCropperFile(null)}
        onCropped={handleCropped}
      />
    </div>
  );
}
