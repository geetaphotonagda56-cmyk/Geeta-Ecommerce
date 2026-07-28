import api from './config';

export interface Review {
    _id: string;
    product: string;
    customer: {
        _id: string;
        name: string;
    };
    rating: number;
    title?: string;
    comment?: string;
    isVerifiedPurchase: boolean;
    createdAt: string;
}

export interface ReviewStats {
    avgRating: number;
    totalReviews: number;
}

export interface ReviewListData {
    reviews: Review[];
    stats: ReviewStats;
    pagination: {
        total: number;
        page: number;
        pages: number;
    };
}

export interface ReviewListResponse {
    success: boolean;
    data: ReviewListData;
    message?: string;
}

export interface ReviewResponse {
    success: boolean;
    data: Review | null;
    message?: string;
}

/**
 * Get reviews for a product (public)
 */
export const getProductReviews = async (productId: string): Promise<ReviewListResponse> => {
    const response = await api.get<ReviewListResponse>(`/customer/reviews/${productId}`);
    return response.data;
};

/**
 * Get the logged-in customer's own review for a product, if any
 */
export const getMyReview = async (productId: string): Promise<ReviewResponse> => {
    const response = await api.get<ReviewResponse>(`/customer/reviews/${productId}/mine`);
    return response.data;
};

/**
 * Add or update (upsert) the logged-in customer's review for a product
 */
export const addReview = async (
    productId: string,
    rating: number,
    title: string,
    comment: string
): Promise<ReviewResponse> => {
    const response = await api.post<ReviewResponse>('/customer/reviews', {
        productId,
        rating,
        title,
        comment,
    });
    return response.data;
};
