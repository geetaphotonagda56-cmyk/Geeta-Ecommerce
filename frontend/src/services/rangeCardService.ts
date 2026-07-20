import api from './api/config';

export interface RangeCard {
  id: string;
  imageUrl: string;
  label: string;
  minPrice?: number;
  maxPrice?: number;
  order: number;
  isActive: boolean;
}

interface RangeCardResponse {
  success: boolean;
  data: RangeCard[] | RangeCard;
  count?: number;
}

const mapCard = (c: any): RangeCard => ({
  ...c,
  id: c._id || c.id || '',
});

export const rangeCardService = {
  getActiveRangeCards: async (): Promise<RangeCard[]> => {
    try {
      const res = await api.get<RangeCardResponse>('/range-cards');
      if (res.data.success && Array.isArray(res.data.data)) {
        return res.data.data.map(mapCard);
      }
      return [];
    } catch (e) {
      console.error('Failed to fetch range cards', e);
      return [];
    }
  },

  getAllRangeCards: async (): Promise<RangeCard[]> => {
    try {
      const res = await api.get<RangeCardResponse>('/range-cards?all=true');
      if (res.data.success && Array.isArray(res.data.data)) {
        return res.data.data.map(mapCard);
      }
      return [];
    } catch (e) {
      console.error('Failed to fetch range cards', e);
      return [];
    }
  },

  addRangeCard: async (card: Omit<RangeCard, 'id'>) => {
    const res = await api.post('/range-cards', card);
    return res.data.data;
  },

  updateRangeCard: async (id: string, updates: Partial<RangeCard>) => {
    const res = await api.put(`/range-cards/${id}`, updates);
    return res.data.data;
  },

  deleteRangeCard: async (id: string) => {
    await api.delete(`/range-cards/${id}`);
  },

  reorderRangeCards: async (items: { id: string; order: number }[]) => {
    const res = await api.put('/range-cards/reorder', { items });
    return res.data.data;
  },
};
