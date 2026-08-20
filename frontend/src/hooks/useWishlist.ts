import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLocation } from './useLocation';
import { useToast } from '../context/ToastContext';
import { useWishlistContext } from '../context/WishlistContext';

/**
 * Custom hook for managing wishlist state and toggle functionality.
 * Reads/writes the shared WishlistContext so that N product cards on a page
 * share a single wishlist fetch instead of each fetching it independently.
 * @param productId - The product ID to check/manage in wishlist
 * @returns Object with isWishlisted state and toggleWishlist function
 */
export function useWishlist(productId?: string) {
  const { isAuthenticated } = useAuth();
  const { location } = useLocation();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { isWishlisted: checkIsWishlisted, toggleWishlist: toggleInContext } = useWishlistContext();

  const isWishlisted = checkIsWishlisted(productId);

  const toggleWishlist = async (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) {
      if ('preventDefault' in e) e.preventDefault();
      if ('stopPropagation' in e) e.stopPropagation();
    }

    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    if (!productId) {
      console.error('Product ID is required to toggle wishlist');
      return;
    }

    try {
      if (isWishlisted) {
        await toggleInContext(productId);
        showToast('Removed from wishlist');
      } else {
        if (!location?.latitude || !location?.longitude) {
          showToast('Location is required to add items to wishlist', 'error');
          return;
        }
        await toggleInContext(productId, location.latitude, location.longitude);
        showToast('Added to wishlist');
      }
    } catch (error: any) {
      console.error('Failed to toggle wishlist:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to update wishlist';
      showToast(errorMessage, 'error');
    }
  };

  return { isWishlisted, toggleWishlist };
}
