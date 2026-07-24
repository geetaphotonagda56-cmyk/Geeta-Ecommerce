import React, { useState, useEffect, useMemo, useRef } from "react";
import QRScannerModal from "../../../components/QRScannerModal";
import { openBarcodeScanner } from '../../../utils/scannerPlatform';
import {
  Product,
  Category,
  getProducts,
  getProductById,
  updateProduct,
  createProduct,
  deleteProduct as deleteAdminProduct,
  uploadImage,
  getSubCategories,
  getBrands,
  SubCategory,
  Brand,
} from "../../../services/api/admin/adminProductService";
import { getAttributes } from "../../../services/api/admin/attributeService";
import AttributeDropdown from "../../../components/AttributeDropdown";
import SearchableSelect from "../../../components/SearchableSelect";
import AttachProductPopover from "../../../components/AttachProductPopover";
import { searchProductImage } from "../../../services/api/productService";
import ImageCropperModal from "../../../components/ImageCropperModal";

interface AdminStockBulkEditProps {
  products: Product[];
  categories: Category[];
  initialPage?: number;
  initialLimit?: number;
  onClose: () => void;
  onSave: () => void;
}

interface ProductImage {
  id: string;
  url: string;
  file?: File;
}

// Simple Modal for editing pricing slabs
const PricingSlabsModal = ({ slabs, onClose, onSave }: { slabs: {minQty: number, price: number}[], onClose: () => void, onSave: (newSlabs: any[]) => void }) => {
    const [localSlabs, setSlabs] = useState(slabs.length ? slabs : [{ minQty: 1, price: 0 }]);

    const handleChange = (index: number, field: string, val: string) => {
        const newSlabs = [...localSlabs];
        newSlabs[index] = { ...newSlabs[index], [field]: Number(val) };
        setSlabs(newSlabs);
    };

    const addSlab = () => setSlabs([...localSlabs, { minQty: 0, price: 0 }]);
    const removeSlab = (idx: number) => setSlabs(localSlabs.filter((_, i) => i !== idx));

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
            <div className="bg-white p-6 rounded shadow-lg w-96 z-[70]">
                <h3 className="text-lg font-bold mb-4">Set Unit Pricing</h3>
                <div className="max-h-64 overflow-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-gray-600">
                                <th className="p-1">Min Qty</th>
                                <th className="p-1">Price/Unit</th>
                                <th className="p-1"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {localSlabs.map((slab, i) => (
                                <tr key={i} className="border-b">
                                    <td className="p-1"><input type="number" className="border w-20 p-1 rounded" value={slab.minQty} onChange={e => handleChange(i, 'minQty', e.target.value)} /></td>
                                    <td className="p-1">
                                        <div className="relative">
                                            <span className="absolute left-1 top-1 text-gray-400">₹</span>
                                            <input type="number" className="border w-24 p-1 pl-4 rounded" value={slab.price} onChange={e => handleChange(i, 'price', e.target.value)} />
                                        </div>
                                    </td>
                                    <td className="p-1 text-red-500 cursor-pointer font-bold px-2" onClick={() => removeSlab(i)}>✕</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <button onClick={addSlab} className="mt-3 text-[var(--primary-color)] font-bold text-sm flex items-center gap-1">
                    <span className="text-lg">+</span> Add Slab
                </button>
                <div className="mt-6 flex justify-end gap-2">
                    <button onClick={onClose} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-sm text-gray-700 font-medium transition-colors">Cancel</button>
                    <button onClick={() => { onSave(localSlabs.filter(s => s.minQty > 0)); onClose(); }} className="px-3 py-1.5 bg-[var(--primary-color)] hover:bg-[var(--primary-dark)] text-white rounded text-sm font-medium transition-colors">Save Rules</button>
                </div>
            </div>
        </div>
    );
};

interface EditableProduct {
  id: string;
  original: Product;
  productName: string;
  categoryId: string;
  compareAtPrice: number;
  price: number;
  stock: number;
  publish: boolean;
  images: ProductImage[];
  isChanged: boolean;
  // New fields
  itemCode: string; // SKU
  blockNumber: string;
  rackNumber: string;
  description: string;
  barcode: string[];
  hsnCode: string;
  pack: string; // Unit
  purchasePrice: number;
  mfgDate: string;
  expiryDate: string;
  weight: string;
  deliveryTime: string;
  lowStockQuantity: number;
  subCategoryId?: string; // Add this
  wholesalePrice: number;
  // Read-only/Display fields (not editable in bulk edit for now or just text)
  subSubCategory: string;
  brand: string; // Display name
  brandId: string; // ID for editing
  tax: string;
  offerPrice: number;
  unitPricing: { minQty: number; price: number }[]; // Add this
  attributes: string[];
  variations: any[];
  variationName: string;
  isNew?: boolean;
}

export default function AdminStockBulkEdit({
  products,
  categories,
  initialPage = 1,
  initialLimit = 10,
  onClose,
  onSave,
}: AdminStockBulkEditProps) {
  const [editableProducts, setEditableProducts] = useState<EditableProduct[]>([]);
  // Serial crop queue for newly-added product images - multiple files/products
  // can be queued at once, so we crop them one at a time via the shared modal.
  const [imageCropQueue, setImageCropQueue] = useState<{ productIndex: number; file: File }[]>([]);
  const [page, setPage] = useState(initialPage);
  const [pageLimit, setPageLimit] = useState(initialLimit);
  const [serverPagination, setServerPagination] = useState<
    { page: number; limit: number; total: number; pages: number } | null
  >(null);
  const [pageLoading, setPageLoading] = useState(false);
  const editedCacheRef = useRef<Map<string, EditableProduct>>(new Map());
  const [changesVersion, setChangesVersion] = useState(0);
  // "Attach Existing Product" deactivates (not deletes) the merged-in
  // original right away, stripping its barcode so it's freed up before this
  // product's own save; handleSave awaits any of these still in flight
  // first so a fast "Save Changes" click can never race ahead and hit a
  // false "barcode already in use" conflict against the original.
  const pendingAttachDeactivationsRef = useRef<Set<Promise<void>>>(new Set());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [productNameSearch, setProductNameSearch] = useState("");
  const [redundantFilter, setRedundantFilter] = useState<string | null>(null);
  const [showRedundantDropdown, setShowRedundantDropdown] = useState(false);
  const [activePricingModalIndex, setActivePricingModalIndex] = useState<number | null>(null); // For modal

  const [subCategories, setSubCategories] = useState<SubCategory[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [availableAttributes, setAvailableAttributes] = useState<{_id: string, name: string}[]>([]);
  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(new Set());
  const [attachPopoverAnchor, setAttachPopoverAnchor] = useState<{ index: number; rect: DOMRect } | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanIndex, setScanIndex] = useState<number | null>(null);
  const [showSearchScanner, setShowSearchScanner] = useState(false);
  const [searchScannerKey, setSearchScannerKey] = useState(0);
  const lastSearchScanRef = useRef<{ code: string; time: number }>({ code: "", time: 0 });

  const [imageSourceModalRowIndex, setImageSourceModalRowIndex] = useState<number | null>(null);
  const [showImageSourceModal, setShowImageSourceModal] = useState(false);
  const [imageSearchQuery, setImageSearchQuery] = useState("");
  const [isSearchingImage, setIsSearchingImage] = useState(false);
  const [searchedImage, setSearchedImage] = useState("");

  const handleImageSearch = async () => {
    if (!imageSearchQuery.trim()) {
        alert("Please enter a keyword to search");
        return;
    }
    setIsSearchingImage(true);
    try {
        const res = await searchProductImage(imageSearchQuery);
      if (res.success && res.data?.imageUrl) {
          setSearchedImage(res.data.imageUrl);
      } else {
          alert("No image found for this keyword");
      }
    } catch (error: any) {
        alert("Failed to search image");
    } finally {
      setIsSearchingImage(false);
    }
  };

  const applySearchedImage = () => {
      if (searchedImage && imageSourceModalRowIndex !== null) {
          const newImage: ProductImage = {
            id: Date.now().toString(),
            url: searchedImage
          };
          setEditableProducts((prev) => {
              const updated = [...prev];
              const currentProduct = updated[imageSourceModalRowIndex];
              updated[imageSourceModalRowIndex] = {
                  ...currentProduct,
                  images: [...currentProduct.images, newImage],
                  isChanged: true
              };
              // Call upsertEditedCache from outer scope since it relies on refs
              // Let's just inline the logic here because we don't return the array immediately
              return updated;
          });
          // Call upsert after a short timeout to make sure state is ready, or rely on another effect
          setTimeout(() => {
              setEditableProducts(current => {
                  const p = current[imageSourceModalRowIndex];
                  if (p) upsertEditedCache(p);
                  return current;
              });
          }, 0);
          
          setSearchedImage("");
          setImageSearchQuery("");
      }
  };

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(handle);
  }, [searchTerm]);

  const stopSearchScanning = () => {
    setShowSearchScanner(false);
  };

  const onSearchScanSuccess = (decodedText: string) => {
    const cleaned = (decodedText || "").trim();
    if (!cleaned) return;

    const now = Date.now();
    if (cleaned === lastSearchScanRef.current.code && now - lastSearchScanRef.current.time < 2000) {
      return;
    }
    lastSearchScanRef.current = { code: cleaned, time: now };

    setSearchTerm(cleaned);
    setPage(1);
    setShowSearchScanner(false);
  };

  const upsertEditedCache = (p: EditableProduct) => {
    if (!p.id) return;
    if (p.isChanged || p.isNew) {
      editedCacheRef.current.set(p.id, p);
      setChangesVersion((v) => v + 1);
    }
  };

  const fetchPage = async (nextPage: number, nextLimit: number) => {
    setPageLoading(true);
    try {
      const res = await getProducts({
        ...(debouncedSearchTerm ? { search: debouncedSearchTerm } : {}),
        ...(redundantFilter ? { redundant: redundantFilter } : {}),
        page: nextPage,
        limit: nextLimit,
      } as any);

      if (!res.success) {
        alert((res as any)?.message || "Failed to load products");
        return;
      }

      const pagination = ((res as any)?.pagination as
        | { page?: number; limit?: number; total?: number; pages?: number }
        | undefined) || { page: nextPage, limit: nextLimit, total: 0, pages: 1 };

      setServerPagination({
        page: Number(pagination.page ?? nextPage),
        limit: Number(pagination.limit ?? nextLimit),
        total: Number(pagination.total ?? 0),
        pages: Number(pagination.pages ?? 1),
      });

      setEditableProducts((prev) => {
        const newRows = prev.filter((x) => x.isNew);
        const initialized = (res.data || []).map((p: any) => {
          const cached = editedCacheRef.current.get(p._id);
          if (cached) return { ...cached, original: cached.original || p };
          // Reuse existing initializer by stashing into cache temporarily via same shape.
          return {
            id: p._id,
            original: p,
            productName: p.productName,
            categoryId:
              typeof p.category === "object" && p.category ? p.category._id : p.category || "",
            compareAtPrice: p.compareAtPrice || 0,
            price: p.price,
             stock: p.stock,
             publish: p.publish,
            images: [
              ...(p.mainImage
                ? [{ id: `main-${p._id}`, url: p.mainImage }]
                : []),
              ...((p.galleryImages || []).map((url: string, i: number) => ({
                id: `gal-${p._id}-${i}`,
                url,
              }))),
            ],
             isChanged: false,
            itemCode: p.variations?.[0]?.sku || (p as any).itemCode || p.sku || "",
            blockNumber: p.variations?.[0]?.blockNumber || (p as any).blockNumber || "",
            rackNumber: p.variations?.[0]?.rackNumber || (p as any).rackNumber || "",
            description: p.smallDescription || p.description || "",
            barcode: p.variations?.[0]?.barcode || (Array.isArray((p as any).barcode)
              ? (p as any).barcode
              : (p as any).barcode
                ? [(p as any).barcode]
                : []),
            hsnCode: (p as any).hsnCode || "",
            pack: (p as any).pack || "",
            purchasePrice: p.variations?.[0]?.purchasePrice || (p as any).purchasePrice || 0,
            mfgDate: (p as any).mfgDate || "",
            expiryDate: (p as any).expiryDate || "",
            weight: (p as any).weight || "",
            deliveryTime: (p as any).deliveryTime || "",
            lowStockQuantity: (p as any).lowStockQuantity || 5,
            wholesalePrice: p.variations?.[0]?.wholesalePrice || (p as any).wholesalePrice || 0,
            subSubCategory: (p as any).subSubCategory || "",
            subCategoryId:
              typeof (p as any).subcategory === "object" && (p as any).subcategory
                ? (p as any).subcategory._id
                : ((p as any).subcategory && (p as any).subcategory !== "-") ? (p as any).subcategory : "",
            brand: typeof p.brand === "object" ? (p.brand as any).name : "-",
            brandId:
              typeof p.brand === "object" && p.brand ? (p.brand as any)._id : p.brand || "",
            tax: p.tax || "",
            offerPrice: p.discPrice || 0,
            unitPricing:
              p.variations?.[0]?.tieredPrices && p.variations[0].tieredPrices.length > 0
                ? p.variations[0].tieredPrices
                : (p.unitPricing && p.unitPricing.length > 0
                  ? p.unitPricing
                  : [{ minQty: 1, price: 0 }]),
            attributes: [],
            variations: p.variations || [],
            variationName: (p as any).variationName || "",
            isNew: false,
          } as EditableProduct;
        });
        return [...newRows, ...initialized];
      });

      setPage(nextPage);
      setPageLimit(nextLimit);
    } catch (e: any) {
      console.error("Bulk edit fetch failed", e);
      alert(e?.response?.data?.message || e?.message || "Failed to load products");
    } finally {
      setPageLoading(false);
    }
  };

  useEffect(() => {
    void fetchPage(page, pageLimit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageLimit, debouncedSearchTerm, redundantFilter]);

  const createEmptyProduct = (): EditableProduct => ({
    id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    original: {} as Product,
    productName: "",
    categoryId: "",
    compareAtPrice: 0,
    price: 0,
    stock: 0,
    publish: false,
    images: [],
    isChanged: false,
    itemCode: "",
    blockNumber: "",
    rackNumber: "",
    description: "",
    barcode: [],
    hsnCode: "",
    pack: "",
    purchasePrice: 0,
    mfgDate: "",
    expiryDate: "",
    weight: "",
    deliveryTime: "",
    lowStockQuantity: 5,
    subCategoryId: "",
    wholesalePrice: 0,
    subSubCategory: "",
    brand: "-",
    brandId: "",
    tax: "",
    offerPrice: 0,
    unitPricing: [{ minQty: 1, price: 0 }],
    attributes: [],
    variations: [],
    variationName: "",
    isNew: true,
  });

  const startScanning = (index: number) => {
    setScanIndex(index);
    openBarcodeScanner(() => setIsScanning(true));
  };

  const onInlineScanSuccess = (decodedText: string) => {
      if (scanIndex !== null) {
          const currentBarcodes = editableProducts[scanIndex].barcode || [];
          if (!currentBarcodes.includes(decodedText)) {
              handleFieldChange(scanIndex, 'barcode', [...currentBarcodes, decodedText]);
          }
      }
      setIsScanning(false);
  };

  const stopScanning = () => {
    setIsScanning(false);
    setScanIndex(null);
  };

  useEffect(() => {
    const fetchData = async () => {
        try {
            const [subRes, brandRes, attrRes] = await Promise.all([
                getSubCategories({ limit: 1000 } as any),
                getBrands(),
                getAttributes()
            ]);
            if(subRes.success && subRes.data) setSubCategories(subRes.data);
            if(brandRes.success && brandRes.data) setBrands(brandRes.data);
            if(attrRes) setAvailableAttributes((attrRes as any).data || attrRes);
        } catch (e) {
            console.error("Failed to load metadata for bulk edit", e);
        }
    };
    fetchData();
  }, []);

  // Initialize editable products
  useEffect(() => {
    if (serverPagination) return;
    const initialized = products.map((p: any) => {
      const cached = editedCacheRef.current.get(p._id);
      if (cached) return { ...cached, original: cached.original || p };
      let categoryId = "";
      if (p.category) {
         if (typeof p.category === "object" && p.category !== null) {
           categoryId = p.category._id || "";
         } else if (typeof p.category === "string") {
          categoryId = p.category;
        }
      }

      let subCategoryId = "";
      if (p.subcategory) {
          if (typeof p.subcategory === 'object' && p.subcategory !== null) {
              subCategoryId = p.subcategory._id;
          } else if (typeof p.subcategory === 'string' && p.subcategory !== "-") {
              subCategoryId = p.subcategory;
          }
      }

      let brandId = "";
      if (p.brand) {
          if (typeof p.brand === 'object' && p.brand !== null) {
              brandId = p.brand._id;
          } else if (typeof p.brand === 'string') {
              brandId = p.brand;
          }
      }

      const images: ProductImage[] = [];
      if (p.mainImage) {
        images.push({ id: `main-${p._id}`, url: p.mainImage });
      }
      if (p.galleryImages && p.galleryImages.length > 0) {
        p.galleryImages.forEach((url: string, i: number) => {
           images.push({ id: `gal-${p._id}-${i}`, url });
        });
      }

      return {
        id: p._id,
        original: p,
        productName: p.productName,
        categoryId: categoryId,
        compareAtPrice: p.compareAtPrice || 0,
        price: p.price,
        stock: p.stock,
        publish: p.publish,
        // New fields initialization
        itemCode: p.variations?.[0]?.sku || (p as any).itemCode || p.sku || "",
        blockNumber: p.variations?.[0]?.blockNumber || (p as any).blockNumber || "",
        rackNumber: p.variations?.[0]?.rackNumber || (p as any).rackNumber || "",
        description: p.smallDescription || p.description || "",
        barcode: p.variations?.[0]?.barcode || (Array.isArray((p as any).barcode) ? (p as any).barcode : (p as any).barcode ? [(p as any).barcode] : []),
        hsnCode: (p as any).hsnCode || "",
        pack: (p as any).pack || "",
        purchasePrice: p.variations?.[0]?.purchasePrice || (p as any).purchasePrice || 0,
        mfgDate: (p as any).mfgDate || "",
        expiryDate: (p as any).expiryDate || "",
        weight: (p as any).weight || "",
        deliveryTime: (p as any).deliveryTime || "",
        lowStockQuantity: (p as any).lowStockQuantity || 5,
        wholesalePrice: p.variations?.[0]?.wholesalePrice || (p as any).wholesalePrice || 0,
        subSubCategory: (p as any).subSubCategory || "",
        subCategoryId: subCategoryId, // Add this
        brand: typeof p.brand === "object" ? (p.brand as any).name : "-",
        brandId: brandId,
        tax: p.tax || "",
        offerPrice: p.discPrice || 0,
        unitPricing: p.variations?.[0]?.tieredPrices && p.variations[0].tieredPrices.length > 0 ? p.variations[0].tieredPrices : (p.unitPricing && p.unitPricing.length > 0 ? p.unitPricing : [{ minQty: 1, price: 0 }]), // Initialize
        images: images,
        isChanged: false,
        attributes: [],
        variations: p.variations || [],
        variationName: (p as any).variationName || "",
        isNew: false,
      };
    });
    setEditableProducts((prev) => [...prev.filter((x) => x.isNew), ...initialized]);
  }, [products, serverPagination]);

  const handleFieldChange = (
    index: number,
    field: keyof EditableProduct,
    value: any
  ) => {
    setEditableProducts((prev) => {
      const updated = [...prev];
      const oldProd = updated[index];
      let newProd = { ...oldProd, [field]: value, isChanged: true };

      if (field === "price" && oldProd.price === oldProd.offerPrice) {
        newProd.offerPrice = value;
      }

      updated[index] = newProd;
      upsertEditedCache(newProd);
      return updated;
    });
  };

  const toggleExpandProduct = (productId: string) => {
    setExpandedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const handleVariationFieldChange = (
    productIndex: number,
    variationIndex: number,
    field: string,
    value: any
  ) => {
    const product = editableProducts[productIndex];
    const newVariations = [...(product.variations || [])];
    newVariations[variationIndex] = { ...newVariations[variationIndex], [field]: value };
    handleFieldChange(productIndex, "variations", newVariations);
  };

  // Attribute type (e.g. "Color", "Size") is defined per-product via the
  // Attributes column; each variation only holds the value for that type.
  // Recompose the backend's combined name/value fields (e.g. name="Color/Size",
  // value="Red/M") whenever one of the per-attribute inputs changes, so the
  // storefront's "Type: Value" label keeps working.
  const handleVariationAttributeChange = (
    productIndex: number,
    variationIndex: number,
    attrName: string,
    attrValue: string
  ) => {
    const product = editableProducts[productIndex];
    const selectedAttributes = product.attributes || [];
    const newVariations = [...(product.variations || [])];
    const current: any = { ...newVariations[variationIndex], [attrName]: attrValue };
    if (selectedAttributes.length > 0) {
      current.name = selectedAttributes.join("/");
      current.value = selectedAttributes.map((a: string) => current[a] || "-").join("/");
    }
    newVariations[variationIndex] = current;
    handleFieldChange(productIndex, "variations", newVariations);
  };

  const handleAddVariation = (productIndex: number) => {
    const product = editableProducts[productIndex];
    const blankVariation = {
      _id: undefined,
      name: "",
      value: "",
      price: 0,
      compareAtPrice: 0,
      discPrice: 0,
      wholesalePrice: 0,
      purchasePrice: 0,
      stock: 0,
      sku: "",
      barcode: [],
      customBlockRack: false,
    };
    const newVariations = [blankVariation, ...(product.variations || [])];
    handleFieldChange(productIndex, "variations", newVariations);
    setExpandedProductIds((prev) => new Set(prev).add(product.id));
  };

  const handleRemoveVariation = (productIndex: number, variationIndex: number) => {
    const product = editableProducts[productIndex];
    const variations = product.variations || [];
    if (variations.length <= 1) {
      alert("A product must have at least one variation.");
      return;
    }
    const newVariations = variations.filter((_: any, i: number) => i !== variationIndex);
    handleFieldChange(productIndex, "variations", newVariations);
  };

  const mapProductToVariation = (p: any) => ({
    _id: undefined,
    name: p.variationName || p.productName || "",
    value: p.variationName || p.productName || "",
    price: p.price || 0,
    compareAtPrice: p.compareAtPrice || 0,
    discPrice: p.discPrice || 0,
    wholesalePrice: p.wholesalePrice || 0,
    purchasePrice: p.purchasePrice || 0,
    stock: p.stock || 0,
    sku: p.sku || p.itemCode || "",
    barcode: Array.isArray(p.barcode) ? p.barcode : p.barcode ? [p.barcode] : [],
    blockNumber: p.blockNumber || "",
    rackNumber: p.rackNumber || "",
    // Preserve the attached product's own block/rack instead of silently
    // adopting the target product's - it's real data, not a placeholder.
    customBlockRack: !!(p.blockNumber || p.rackNumber),
    hsnCode: p.hsnCode || "",
    mainImage: p.mainImage || "",
    galleryImages: p.galleryImages || [],
  });

  // Products without real variants still carry one synthesized "Default"/
  // "Standard" placeholder variation (see backend variantHelpers.ts /
  // productNormalizer.ts) - that placeholder name/value must not overwrite
  // the picked product's real name when attaching it as a variation.
  const isPlaceholderVariantLabel = (v: any) => {
    const val = String(v?.value || v?.title || v?.name || "").trim().toLowerCase();
    return !val || val === "default" || val === "standard";
  };

  const handleAttachExistingProduct = async (productIndex: number, searchResult: any) => {
    const pickedId = searchResult._id || searchResult.id;
    setAttachPopoverAnchor(null);

    // The fuzzy search endpoint returns a trimmed projection (e.g. no
    // hsnCode/gst/tax) - fetch the full product so nothing is lost when
    // it's converted into a variation and the original is deactivated.
    let picked: any = searchResult;
    try {
      const detail = await getProductById(pickedId);
      if (detail?.success && detail.data) picked = detail.data;
    } catch (err) {
      console.error("Failed to load full product details before attaching, using search result data", err);
    }

    const product = editableProducts[productIndex];
    const newVariations =
      Array.isArray(picked.variations) && picked.variations.length > 0
        ? picked.variations.map((v: any) => {
            const base = mapProductToVariation(picked);
            const merged = { ...base, ...v, _id: undefined };
            if (isPlaceholderVariantLabel(v)) {
              merged.name = base.name;
              merged.value = base.value;
            }
            merged.customBlockRack = !!(v.blockNumber || v.rackNumber || base.blockNumber || base.rackNumber);
            return merged;
          })
        : [mapProductToVariation(picked)];

    handleFieldChange(productIndex, "variations", [...newVariations, ...(product.variations || [])]);
    setExpandedProductIds((prev) => new Set(prev).add(product.id));

    // Don't delete the original - deactivate it instead, so it's recoverable
    // if this merge is ever undone. Its barcode(s) are stripped in the same
    // call, since they now belong to the copied-in variation and would
    // otherwise collide with this product's own save as a duplicate. It
    // stays hidden from customers (publish: false) but is still visible to
    // admins, who can manually reactivate it - removing the variation later
    // never does this automatically.
    const deactivation = (async () => {
      try {
        const originalVariations = Array.isArray(picked.variations) && picked.variations.length > 0
          ? picked.variations.map((v: any) => ({ ...v, barcode: [] }))
          : undefined;
        const res = await updateProduct(pickedId, {
          publish: false,
          barcode: [],
          ...(originalVariations ? { variations: originalVariations } : {}),
        } as any);
        if (!res?.success) {
          alert(`Attached "${picked.productName}" as a variation, but failed to deactivate the original standalone product. Please deactivate it manually, then save.`);
          return;
        }
        editedCacheRef.current.delete(pickedId);
        setEditableProducts((prev) => prev.filter((p) => p.id !== pickedId));
        setSelectedProductIds((prev) => {
          if (!prev.has(pickedId)) return prev;
          const next = new Set(prev);
          next.delete(pickedId);
          return next;
        });
      } catch (err: any) {
        console.error("Failed to deactivate attached product", err);
        alert(`Attached "${picked.productName}" as a variation, but failed to deactivate the original standalone product: ${err?.response?.data?.message || err?.message || "Unknown error"}. Please deactivate it manually, then save.`);
      }
    })();
    pendingAttachDeactivationsRef.current.add(deactivation);
    deactivation.finally(() => {
      pendingAttachDeactivationsRef.current.delete(deactivation);
    });
  };

  const handleImageChange = (index: number, files: FileList | null) => {
      if (!files || files.length === 0) return;
      setImageCropQueue((prev) => [
        ...prev,
        ...Array.from(files).map((file) => ({ productIndex: index, file })),
      ]);
  };

  const handleQueuedImageCropped = (croppedFile: File) => {
      const [current, ...rest] = imageCropQueue;
      setImageCropQueue(rest);
      if (!current) return;

      const newImage: ProductImage = {
        id: URL.createObjectURL(croppedFile),
        url: URL.createObjectURL(croppedFile),
        file: croppedFile,
      };

      setEditableProducts((prev) => {
          const updated = [...prev];
          const currentProduct = updated[current.productIndex];

          updated[current.productIndex] = {
              ...currentProduct,
              images: [...currentProduct.images, newImage],
              isChanged: true
          };
          upsertEditedCache(updated[current.productIndex]);

          return updated;
      });
  };

  const handleRemoveImage = (productIndex: number, imageId: string) => {
    setEditableProducts((prev) => {
      const updated = [...prev];
      const currentProduct = updated[productIndex];

      updated[productIndex] = {
        ...currentProduct,
        images: currentProduct.images.filter((img) => img.id !== imageId),
        isChanged: true,
      };
      upsertEditedCache(updated[productIndex]);

      return updated;
    });
  };

  const handleSave = async () => {
    // Let any in-flight "Attach Existing Product" deactivations finish first -
    // otherwise a fast click here could send this save before the original's
    // barcode (which we just copied) is actually cleared, causing a false
    // "barcode already in use" conflict against it.
    if (pendingAttachDeactivationsRef.current.size > 0) {
      await Promise.allSettled(Array.from(pendingAttachDeactivationsRef.current));
    }

    const allEdited = Array.from(editedCacheRef.current.values());
    const changedExisting = allEdited.filter((p) => p.isChanged && !p.isNew);
    const newProducts = allEdited.filter((p) => p.isNew && p.isChanged);

    if (changedExisting.length === 0 && newProducts.length === 0) {
      onClose();
      return;
    }

    const invalidNew = newProducts.filter(
      (p) => !p.productName.trim() || !p.categoryId
    );
    if (invalidNew.length > 0) {
      alert("Please fill Product Name and Category for new rows before saving.");
      return;
    }

    setSaving(true);
    try {
      const updatePromises = changedExisting.map(async (p) => {
        const finalImages: string[] = [];

        // Upload new images and collect all URLs
        for (const img of p.images) {
          if (img.file) {
            try {
              const uploadRes = await uploadImage(img.file);
              if (uploadRes.success) {
                finalImages.push(uploadRes.data.url);
              }
            } catch (err) {
              console.error("Failed to upload image", err);
            }
          } else {
            finalImages.push(img.url);
          }
        }

        const mainImage = finalImages.length > 0 ? finalImages[0] : "";
        const galleryImages = finalImages.length > 1 ? finalImages.slice(1) : [];

        return updateProduct(p.id, {
          productName: p.productName,
          category: p.categoryId,
          compareAtPrice: p.compareAtPrice,
          price: p.price,
          stock: p.stock,
          publish: p.publish,
          mainImage: mainImage,
          galleryImages: galleryImages,
          sku: p.itemCode || null,
          // itemCode: p.itemCode, // Commenting out to avoid duplication issues if backend doesn't expect it
          blockNumber: p.blockNumber,
          rackNumber: p.rackNumber,
          smallDescription: p.description,
          description: p.description,
          barcode: p.barcode,
          hsnCode: p.hsnCode,
          pack: p.pack,
          purchasePrice: p.purchasePrice,
          mfgDate: p.mfgDate || undefined,
          expiryDate: p.expiryDate || undefined,
          weight: p.weight || undefined,
          deliveryTime: p.deliveryTime,
          lowStockQuantity: p.lowStockQuantity,
          discPrice: p.offerPrice || p.price,
          wholesalePrice: p.wholesalePrice,
          // Conditionally add relations if they exist
          // ...(p.tax ? { tax: p.tax } : {}), // Exclude tax because it causes CastError (text input vs ObjectId)
          ...(p.subCategoryId && p.subCategoryId !== "-" ? { subcategory: p.subCategoryId } : {}),
          ...(p.subSubCategory ? { subSubCategory: p.subSubCategory } : {}),
          ...(p.brandId ? { brand: p.brandId } : {}),
          ...(p.brandId ? { brand: p.brandId } : {}),
           variations: p.variations.map((v: any, vIdx: number) => {
             if (p.variations.length <= 1) {
               return {
                 ...v,
                 price: p.price,
                 compareAtPrice: p.compareAtPrice,
                 stock: Number(p.stock) || 0,
                 discPrice: p.offerPrice || p.price,
                 wholesalePrice: p.wholesalePrice || 0,
                 purchasePrice: p.purchasePrice || 0,
                 sku: p.itemCode || undefined,
                 blockNumber: v.customBlockRack ? (v.blockNumber || undefined) : (p.blockNumber || undefined),
                 rackNumber: v.customBlockRack ? (v.rackNumber || undefined) : (p.rackNumber || undefined),
                 barcode: p.barcode || [],
                 tieredPrices: p.unitPricing || [],
                 mainImage: mainImage || undefined,
                 galleryImages: galleryImages || []
               };
             } else {
               return {
                 ...v,
                 price: v.price,
                 compareAtPrice: v.compareAtPrice,
                 stock: Number(v.stock) || 0,
                 discPrice: v.discPrice || v.price,
                 wholesalePrice: v.wholesalePrice || 0,
                 purchasePrice: v.purchasePrice || 0,
                 sku: v.sku,
                 // Every variation defaults to the parent row's Block/Rack
                 // (locked); a variation can opt out via customBlockRack to
                 // pick its own instead.
                 blockNumber: v.customBlockRack ? (v.blockNumber || undefined) : (p.blockNumber || undefined),
                 rackNumber: v.customBlockRack ? (v.rackNumber || undefined) : (p.rackNumber || undefined),
                 barcode: v.barcode || [],
                 tieredPrices: v.tieredPrices || v.unitPricing || [],
                 mainImage: v.mainImage || undefined,
                 galleryImages: v.galleryImages || []
               };
             }
           }),
          unitPricing: p.unitPricing, // Include unitPricing in payload
          variationName: p.variationName,
        } as any);
      });

      const createPromises = newProducts.map(async (p) => {
        const finalImages: string[] = [];

        for (const img of p.images) {
          if (img.file) {
            try {
              const uploadRes = await uploadImage(img.file);
              if (uploadRes.success) {
                finalImages.push(uploadRes.data.url);
              }
            } catch (err) {
              console.error("Failed to upload image", err);
            }
          } else {
            finalImages.push(img.url);
          }
        }

        const mainImage = finalImages.length > 0 ? finalImages[0] : "";
        const galleryImages = finalImages.length > 1 ? finalImages.slice(1) : [];

        return createProduct({
          productName: p.productName || "Untitled",
          category: p.categoryId || undefined,
          subcategory: p.subCategoryId || undefined,
          subSubCategory: p.subSubCategory || undefined,
          brand: p.brandId || undefined,
          publish: p.publish,
          popular: false,
          dealOfDay: false,
          price: p.price,
          compareAtPrice: p.compareAtPrice,
          stock: p.stock,
          discPrice: p.offerPrice || p.price,
          wholesalePrice: p.wholesalePrice,
          mainImage: mainImage || undefined,
          galleryImages: galleryImages.length ? galleryImages : undefined,
          sku: p.itemCode || undefined,
          blockNumber: p.blockNumber || undefined,
          rackNumber: p.rackNumber || undefined,
          smallDescription: p.description || undefined,
          description: p.description || undefined,
          barcode: p.barcode,
          hsnCode: p.hsnCode || undefined,
          pack: p.pack || undefined,
          purchasePrice: p.purchasePrice || undefined,
          deliveryTime: p.deliveryTime || undefined,
          weight: p.weight || undefined,
          mfgDate: p.mfgDate || undefined,
          expiryDate: p.expiryDate || undefined,
          lowStockQuantity: p.lowStockQuantity,
          unitPricing: p.unitPricing,
          ...(p.variationName ? { variationName: p.variationName } : {}),
          ...(p.variations && p.variations.length > 0
            ? {
                variations: p.variations.map((v: any, vIdx: number) => {
                  if (p.variations.length <= 1) {
                    return {
                      ...v,
                      price: p.price,
                      compareAtPrice: p.compareAtPrice,
                      stock: Number(p.stock) || 0,
                      discPrice: p.offerPrice || p.price,
                      wholesalePrice: p.wholesalePrice || 0,
                      purchasePrice: p.purchasePrice || 0,
                      sku: p.itemCode || undefined,
                      blockNumber: v.customBlockRack ? (v.blockNumber || undefined) : (p.blockNumber || undefined),
                      rackNumber: v.customBlockRack ? (v.rackNumber || undefined) : (p.rackNumber || undefined),
                      barcode: p.barcode || [],
                      tieredPrices: p.unitPricing || [],
                      mainImage: mainImage || undefined,
                      galleryImages: galleryImages || []
                    };
                  } else {
                    return {
                      ...v,
                      price: v.price,
                      compareAtPrice: v.compareAtPrice,
                      stock: Number(v.stock) || 0,
                      discPrice: v.discPrice || v.price,
                      wholesalePrice: v.wholesalePrice || 0,
                      purchasePrice: v.purchasePrice || 0,
                      sku: v.sku,
                      blockNumber: v.customBlockRack ? (v.blockNumber || undefined) : (p.blockNumber || undefined),
                      rackNumber: v.customBlockRack ? (v.rackNumber || undefined) : (p.rackNumber || undefined),
                      barcode: v.barcode || [],
                      tieredPrices: v.tieredPrices || v.unitPricing || [],
                      mainImage: v.mainImage || undefined,
                      galleryImages: v.galleryImages || []
                    };
                  }
                }),
              }
            : {}),
        } as any);
      });

      await Promise.all([...updatePromises, ...createPromises]);
      editedCacheRef.current.clear();
      setChangesVersion(0);
      onSave(); // Trigger refresh in parent
      onClose();
    } catch (error: any) {
      console.error("Failed to save bulk edits", error);
      alert(`Failed to save changes: ${error.response?.data?.message || error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const [categorySearch, setCategorySearch] = useState("");
  const [columnSearch, setColumnSearch] = useState<Record<string, string>>({});

  // Column Resizing Logic
  // Column filtering logic
  const filteredProducts = useMemo(() => {
    const getColumnText = (key: string, p: EditableProduct) => {
      switch (key) {
        case "category":
          return categories.find(c => c._id === p.categoryId)?.name || "";
        case "subCategory":
          return subCategories.find(sc => sc._id === (p.subCategoryId || ""))?.name || "";
        case "brand": {
          const brandName =
            brands.find(b => b._id === (p.brandId || ""))?.name ||
            p.brand ||
            "";
          return brandName;
        }
        case "status":
          return p.publish ? "Active" : "Inactive";
        case "barcode":
          return Array.isArray(p.barcode) ? p.barcode.join(",") : String((p as any).barcode || "");
        case "attributes":
          return Array.isArray(p.attributes) ? p.attributes.join(",") : "";
        case "variations":
          return Array.isArray(p.variations) ? String(p.variations.length) : "";
        case "valMrp":
          return String((p.compareAtPrice || 0) * (p.stock || 0));
        case "valPur":
          return String((p.purchasePrice || 0) * (p.stock || 0));
        case "unitPrice":
          return Array.isArray(p.unitPricing) ? p.unitPricing.map(s => `${s.minQty}:${s.price}`).join(",") : "";
        default: {
          const val = (p as any)[key] ?? (p.original as any)?.[key];
          if (val === null || val === undefined) return "";
          if (Array.isArray(val)) return val.join(",");
          if (typeof val === "object") return JSON.stringify(val);
          return String(val);
        }
      }
    };

    const norm = (v: string) => v.toLowerCase();
    const term = norm(searchTerm);
    const productTerm = norm(productNameSearch);
    const catTerm = norm(categorySearch);
    const extraFilters = Object.entries(columnSearch).filter(([, v]) => v.trim() !== "");

    return editableProducts.filter(p => {
      if (p.isNew) return true;

      const barcodeMatch = norm(getColumnText("barcode", p)).includes(term);
      const nameMatch = norm(p.productName).includes(term) || barcodeMatch;
      const colProductNameMatch = norm(p.productName).includes(productTerm);

      // Resolve category name for filtering
      const catName = categories.find(c => c._id === p.categoryId)?.name || "";
      const catMatch = norm(catName).includes(catTerm);

      const extraMatch = extraFilters.every(([key, value]) => {
        if (key === "productName" || key === "category") return true;
        const cell = norm(getColumnText(key, p));
        return cell.includes(norm(value));
      });

      return nameMatch && colProductNameMatch && catMatch && extraMatch;
    });
  }, [editableProducts, searchTerm, productNameSearch, categorySearch, columnSearch, categories, subCategories, brands]);

  // Column Resizing Logic

  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [activeMenuColumn, setActiveMenuColumn] = useState<string | null>(null);

  const DEFAULT_COLUMN_ORDER: string[] = [
    "index",
    "image",
    "productName",
    "category",
    "subCategory",
    "subSubCategory",
    "attributes",
    "variations",
    "variationName",
    "sku",
    "blockNumber",
    "rackNumber",
    "description",
    "barcode",
    "hsnCode",
    "pack",
    "size",
    "color",
    "tax",
    "gst",
    "purchasePrice",
    "mfgDate",
    "expiryDate",
    "weight",
    "compareAtPrice",
    "price",
    "deliveryTime",
    "stock",
    "offerPrice",
    "wholesalePrice",
    "lowStockQuantity",
    "brand",
    "valMrp",
    "valPur",
    "unitPrice",
    "status",
  ];

  const PRIORITY_FIRST_COLUMNS: string[] = [
    "image",
    "productName",
    "compareAtPrice", // MRP
    "price", // SP
    "purchasePrice", // PP
    "stock",
    "barcode",
    "category",
    "subCategory",
    "subSubCategory",
    "pack", // Unit
    "deliveryTime",
    "weight", // Item weight
  ];

  const createInitialColumnOrder = () => {
    const base = DEFAULT_COLUMN_ORDER;
    const seen = new Set<string>();
    const ordered: string[] = [];

    if (base.includes("index")) {
      ordered.push("index");
      seen.add("index");
    }

    for (const key of PRIORITY_FIRST_COLUMNS) {
      if (base.includes(key) && !seen.has(key)) {
        ordered.push(key);
        seen.add(key);
      }
    }

    for (const key of base) {
      if (!seen.has(key)) {
        ordered.push(key);
        seen.add(key);
      }
    }

    return ordered;
  };

  const [columnOrder, setColumnOrder] = useState<string[]>(createInitialColumnOrder);
  const [draggedCol, setDraggedCol] = useState<string | null>(null);

  const COLUMN_LABELS: Record<string, string> = {
    index: "#",
    image: "Image",
    productName: "4. Product Name",
    category: "1. Category",
    subCategory: "2. Sub Cat",
    subSubCategory: "3. Sub Sub Cat",
    sku: "5. SKU",
    blockNumber: "6. Block/Room No.",
    rackNumber: "7. Rack",
    description: "8. Desc",
    barcode: "9. Barcode",
    hsnCode: "10. HSN",
    pack: "11. Unit",
    size: "12. Size",
    color: "13. Color",
    tax: "14. Tax Cat",
    gst: "15. GST",
    purchasePrice: "16. Pur. Price",
    mfgDate: "17. Mfg Date",
    expiryDate: "18. Expiry Date",
    weight: "19. Weight",
    compareAtPrice: "20. MRP",
    price: "21. Sell Price",
    deliveryTime: "22. Del. Time",
    stock: "23. Stock",
    offerPrice: "24. Offer Price",
    wholesalePrice: "25. Wholesale Price",
    lowStockQuantity: "26. Low Stock",
    brand: "27. Brand",
    valMrp: "28. Val (MRP)",
    valPur: "29. Val (Pur)",
    unitPrice: "30. Unit Pricing Rules", // Rename
    attributes: "Attributes",
    variations: "Variations",
    variationName: "Variation Name",
    status: "Status"
  };

  const handleHideColumn = (columnKey: string) => {
    setHiddenColumns((prev) => [...prev, columnKey]);
    setActiveMenuColumn(null);
  };

  const handleDragStart = (e: React.DragEvent, key: string) => {
    setDraggedCol(key);
    e.dataTransfer.effectAllowed = "move";
    // Set a transparent drag image if desired, or let browser handle it
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    if (!draggedCol || draggedCol === targetKey) return;

    const newOrder = [...columnOrder];
    const dragIndex = newOrder.indexOf(draggedCol);
    const dropIndex = newOrder.indexOf(targetKey);

    if (dragIndex > -1 && dropIndex > -1) {
      newOrder.splice(dragIndex, 1);
      newOrder.splice(dropIndex, 0, draggedCol);
      setColumnOrder(newOrder);
    }
    setDraggedCol(null);
  };

  const renderHeader = (key: string) => {
    if (hiddenColumns.includes(key)) return null;

    let content: React.ReactNode = COLUMN_LABELS[key];
    if (key === "category") {
      content = (
        <div className="flex flex-col gap-2 w-full">
          <span>{COLUMN_LABELS[key]}</span>
          <input
            type="text"
            placeholder="Search..."
            className="w-full text-[11px] px-2 py-1 border border-gray-300 rounded font-normal focus:ring-1 focus:ring-[var(--primary-color)] focus:outline-none"
            value={categorySearch}
            onChange={(e) => setCategorySearch(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()} // Prevent focus loss on drag start
          />
        </div>
      );
    }

    if (key === "productName") {
      content = (
        <div className="flex flex-col gap-2 w-full">
          <span>{COLUMN_LABELS[key]}</span>
          <input
            type="text"
            placeholder="Search..."
            className="w-full text-[11px] px-2 py-1 border border-gray-300 rounded font-normal focus:ring-1 focus:ring-[var(--primary-color)] focus:outline-none"
            value={productNameSearch}
            onChange={(e) => setProductNameSearch(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()} // Prevent focus loss on drag start
          />
        </div>
      );
    }

    const searchable = key !== "index" && key !== "image";
    if (searchable && key !== "category" && key !== "productName") {
      content = (
        <div className="flex flex-col gap-2 w-full">
          <span>{COLUMN_LABELS[key]}</span>
          <input
            type="text"
            placeholder="Search..."
            className="w-full text-[11px] px-2 py-1 border border-gray-300 rounded font-normal focus:ring-1 focus:ring-[var(--primary-color)] focus:outline-none"
            value={columnSearch[key] || ""}
            onChange={(e) => setColumnSearch((prev) => ({ ...prev, [key]: e.target.value }))}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()} // Prevent focus loss on drag start
          />
        </div>
      );
    }

    return (
      <th
        key={key}
        draggable
        onDragStart={(e) => handleDragStart(e, key)}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, key)}
        className={`p-3 border-b border-r border-neutral-300 text-xs font-bold text-neutral-700 relative whitespace-nowrap group bg-neutral-100 align-top cursor-move transition-opacity ${draggedCol === key ? "opacity-50" : ""}`}
        style={{ width: columnWidths[key] }}
      >
        <div className="flex items-start justify-between gap-1 w-full h-full">
          <div className="flex-1 overflow-hidden text-center">{content}</div>
          <div className="sm:hidden flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                adjustColumnWidth(key, -60);
              }}
              className="p-1 rounded bg-white/70 border border-neutral-200 text-neutral-600 active:scale-95"
              title="Narrow column"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                adjustColumnWidth(key, 60);
              }}
              className="p-1 rounded bg-white/70 border border-neutral-200 text-neutral-600 active:scale-95"
              title="Widen column"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveMenuColumn(activeMenuColumn === key ? null : key);
            }}
            className="p-1 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
        </div>
        {activeMenuColumn === key && (
          <div className="absolute right-0 top-8 bg-white shadow-lg border border-neutral-200 rounded z-50 w-32 py-1 cursor-default" onMouseDown={e => e.stopPropagation()}>
            <button
              className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs text-gray-700"
              onClick={() => handleHideColumn(key)}
            >
              Hide column
            </button>
          </div>
        )}
        <ResizeHandle columnKey={key} />
      </th>
    );
  };

  const allFilteredSelected =
    filteredProducts.length > 0 &&
    filteredProducts.every((p) => selectedProductIds.has(p.id));

  const toggleSelectProduct = (productId: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredProducts.forEach((p) => next.delete(p.id));
      } else {
        filteredProducts.forEach((p) => next.add(p.id));
      }
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    const selectedIds = Array.from(selectedProductIds);
    if (selectedIds.length === 0) return;

    const newIds = selectedIds.filter((id) =>
      editableProducts.some((p) => p.id === id && p.isNew)
    );
    const existingIds = selectedIds.filter((id) => !newIds.includes(id));

    if (existingIds.length === 0) {
      setEditableProducts((prev) => prev.filter((p) => !newIds.includes(p.id)));
      setSelectedProductIds((prev) => {
        const next = new Set(prev);
        newIds.forEach((id) => next.delete(id));
        return next;
      });
      return;
    }

    const confirmed = window.confirm(
      `Delete ${existingIds.length} selected product(s)? This cannot be undone.`
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const results = await Promise.allSettled(
        existingIds.map((id) => deleteAdminProduct(id))
      );

      const failedIds = existingIds.filter((id, idx) => {
        const result = results[idx];
        if (result.status === "rejected") return true;
        return !result.value?.success;
      });

      const deletedIds = existingIds.filter((id) => !failedIds.includes(id));

      if (deletedIds.length > 0) {
        setEditableProducts((prev) => prev.filter((p) => !deletedIds.includes(p.id) && !newIds.includes(p.id)));
        setSelectedProductIds((prev) => {
          const next = new Set(prev);
          deletedIds.forEach((id) => next.delete(id));
          newIds.forEach((id) => next.delete(id));
          return next;
        });
        onSave();
      }

      if (newIds.length > 0 && deletedIds.length === 0) {
        setEditableProducts((prev) => prev.filter((p) => !newIds.includes(p.id)));
        setSelectedProductIds((prev) => {
          const next = new Set(prev);
          newIds.forEach((id) => next.delete(id));
          return next;
        });
      }

      if (failedIds.length > 0) {
        alert(`Failed to delete ${failedIds.length} product(s).`);
      }
    } catch (error: any) {
      alert(`Failed to delete products: ${error?.message || "Unknown error"}`);
    } finally {
      setDeleting(false);
    }
  };

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
    index: 50,
    image: 140,
    productName: 200,
    category: 150,
    subCategory: 130,
    subSubCategory: 130,
    sku: 130,
    blockNumber: 110,
    rackNumber: 110,
    description: 130,
    barcode: 130,
    hsnCode: 100,
    pack: 100,
    size: 80,
    color: 80,
    tax: 80,
    gst: 80,
    purchasePrice: 100,
    mfgDate: 130,
    expiryDate: 130,
    weight: 110,
    compareAtPrice: 100,
    price: 100,
    deliveryTime: 130,
    stock: 100,
    offerPrice: 100,
    wholesalePrice: 120,
    lowStockQuantity: 100,
    brand: 100,
    valMrp: 100,
    valPur: 100,
    unitPrice: 100,
    attributes: 150,
    variations: 120,
    variationName: 150,
    status: 100,
  });

  const adjustColumnWidth = (key: string, delta: number) => {
    setColumnWidths((prev) => {
      const current = Number(prev[key] ?? 120) || 120;
      return {
        ...prev,
        [key]: Math.max(50, Math.min(520, current + delta)),
      };
    });
  };

  const handleResizeStart = (e: React.MouseEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent sorting or other events
    const startX = e.pageX;
    const startWidth = columnWidths[key];

    const onMouseMove = (moveEvent: MouseEvent) => {
      const currentX = moveEvent.pageX;
      const diff = currentX - startX;
      setColumnWidths((prev) => ({
        ...prev,
        [key]: Math.max(50, startWidth + diff), // Enforce minimum width of 50px
      }));
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "default";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
  };

  const handleResizeStartTouch = (e: React.TouchEvent<HTMLDivElement>, key: string) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.touches[0]?.pageX ?? 0;
    const startWidth = columnWidths[key];

    const onTouchMove = (moveEvent: TouchEvent) => {
      moveEvent.preventDefault();
      const currentX = moveEvent.touches[0]?.pageX ?? startX;
      const diff = currentX - startX;
      setColumnWidths((prev) => ({
        ...prev,
        [key]: Math.max(50, startWidth + diff),
      }));
    };

    const onTouchEnd = () => {
      document.removeEventListener("touchmove", onTouchMove as any);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };

    document.addEventListener("touchmove", onTouchMove as any, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchcancel", onTouchEnd);
  };

  const ResizeHandle = ({ columnKey }: { columnKey: string }) => (
    <div
      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[var(--primary-color)] z-20"
      onMouseDown={(e) => handleResizeStart(e, columnKey)}
      onTouchStart={(e) => handleResizeStartTouch(e, columnKey)}
      onClick={(e) => e.stopPropagation()}
    />
  );

  const renderBodyCell = (key: string, product: EditableProduct, originalIndex: number, index: number) => {
    if (hiddenColumns.includes(key)) return null;

    switch (key) {
      case "index":
        return <td key={key} className="p-2 border-r border-neutral-200 text-center text-xs text-neutral-500">{index + 1}</td>;
      case "image":
        return (
          <td key={key} className="p-1 border-r border-neutral-200 text-center align-middle">
            <div className="flex flex-wrap justify-center items-center gap-2 p-1 min-w-[140px]">
              {product.images.map((img, i) => (
                <div key={img.id} className="relative group w-12 h-12 border border-gray-200 rounded overflow-hidden bg-white shrink-0">
                  <img src={img.url} alt={`Img-${i}`} className="w-full h-full object-cover" />
                  <button onClick={() => handleRemoveImage(originalIndex, img.id)} className="absolute top-0 right-0 bg-red-600 text-white w-4 h-4 flex items-center justify-center rounded-bl opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700 z-10" title="Remove">
                    <span className="text-[10px] font-bold leading-none">&times;</span>
                  </button>
                  {i === 0 && <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[8px] py-[1px]">Main</span>}
                </div>
              ))}
              <button onClick={() => { setImageSourceModalRowIndex(originalIndex); setShowImageSourceModal(true); }} className="w-10 h-10 border border-dashed border-gray-400 rounded flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 text-gray-500 hover:text-[var(--primary-color)] transition-colors shrink-0" title="Add Images">
                <span className="text-xl leading-none font-light">+</span>
              </button>
              <input id={`file-input-${originalIndex}`} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { handleImageChange(originalIndex, e.target.files); e.target.value = ""; }} />
            </div>
          </td>
        );
      case "productName":
        return <td key={key} className="p-0 border-r border-neutral-200"><input type="text" className="w-full h-full px-3 py-2 bg-transparent border-none focus:ring-2 focus:ring-[var(--primary-color)] focus:bg-white text-sm" value={product.productName} onChange={(e) => handleFieldChange(originalIndex, "productName", e.target.value)} /></td>;
      case "category":
        return (
          <td key={key} className="p-0 border-r border-neutral-200">
            <SearchableSelect
              options={categories.map(cat => ({ value: cat._id, label: cat.name || "Unnamed Category" }))}
              value={product.categoryId}
              onChange={(val) => handleFieldChange(originalIndex, "categoryId", val)}
              placeholder="Category"
            />
          </td>
        );
      case "attributes":
        return (
            <td key={key} className="p-0 border-r border-neutral-200 bg-white">
                <AttributeDropdown
                    options={availableAttributes}
                    selectedAttributes={product.attributes || []}
                    onChange={(newAttrs) => handleFieldChange(originalIndex, 'attributes', newAttrs)}
                />
            </td>
        );
      case "variations":
        return (
            <td key={key} className="p-2 border-r border-neutral-200 bg-white text-xs text-gray-600 align-top">
                {(product.variations || []).length} Variation{(product.variations || []).length === 1 ? "" : "s"}
            </td>
        );
      case "variationName":
        return <td key={key} className="p-0 border-r border-neutral-200"><input type="text" className="w-full h-full px-2 py-2 bg-transparent border-none text-sm" value={product.variationName} onChange={(e) => handleFieldChange(originalIndex, 'variationName', e.target.value)} /></td>;
      case "subCategory":
        return (
          <td key={key} className="p-0 border-r border-neutral-200">
             <SearchableSelect
              options={subCategories
                .filter(sc => {
                    const tRef = String(product.categoryId || "").trim().toLowerCase();
                    if (!tRef) return true;
                    const subCatProperty = sc.category;
                    const sCatId = String((typeof subCatProperty === 'object' && subCatProperty) ? (subCatProperty as any)._id : (subCatProperty || "")).trim().toLowerCase();
                    return sCatId === tRef;
                })
                .map(sub => ({ value: sub._id || (sub as any).id, label: (sub as any).name || (sub as any).subcategoryName || "Unnamed Subcategory" }))
              }
              value={product.subCategoryId || ""}
              onChange={(val) => handleFieldChange(originalIndex, 'subCategoryId', val)}
              placeholder="-"
            />
          </td>
        );
      case "subSubCategory":
        return <td key={key} className="p-0 border-r border-neutral-200"><input type="text" className="w-full h-full px-2 py-2 bg-transparent border-none text-sm" value={product.subSubCategory} onChange={(e) => handleFieldChange(originalIndex, 'subSubCategory', e.target.value)} /></td>;
      case "sku":
        return <td key={key} className="p-0 border-r border-neutral-200"><input type="text" className="w-full h-full px-2 py-2 bg-transparent border-none text-sm font-mono tracking-tight" value={product.itemCode} onChange={(e) => handleFieldChange(originalIndex, 'itemCode', e.target.value)} /></td>;
      case "blockNumber":
        return (
          <td key={key} className="p-0 border-r border-neutral-200">
            <select
              className="w-full h-full px-2 py-2 bg-transparent border-none text-sm"
              value={product.blockNumber}
              onChange={(e) => handleFieldChange(originalIndex, 'blockNumber', e.target.value)}
            >
              <option value="">-</option>
              {Array.from({ length: 50 }, (_, i) => String(i + 1)).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </td>
        );
      case "rackNumber": {
        const rackLetter = (product.rackNumber.match(/^[A-Za-z]+/)?.[0] || "").toUpperCase();
        const rackDigits = product.rackNumber.replace(/^[A-Za-z]+/, "");
        const setRack = (letter: string, digits: string) =>
          handleFieldChange(originalIndex, 'rackNumber', `${letter}${digits}`);
        return (
          <td key={key} className="p-0 border-r border-neutral-200">
            <div className="flex h-full">
              <select
                className="w-1/2 h-full px-1 py-2 bg-transparent border-none text-sm border-r border-neutral-200"
                value={rackLetter}
                onChange={(e) => setRack(e.target.value, rackDigits)}
              >
                <option value="">-</option>
                {Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)).map((letter) => (
                  <option key={letter} value={letter}>{letter}</option>
                ))}
              </select>
              <select
                className="w-1/2 h-full px-1 py-2 bg-transparent border-none text-sm"
                value={rackDigits}
                onChange={(e) => setRack(rackLetter, e.target.value)}
              >
                <option value="">-</option>
                {Array.from({ length: 50 }, (_, i) => String(i + 1)).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </td>
        );
      }
      case "description":
        return <td key={key} className="p-0 border-r border-neutral-200"><input type="text" className="w-full h-full px-2 py-2 bg-transparent border-none text-sm" value={product.description} onChange={(e) => handleFieldChange(originalIndex, 'description', e.target.value)} /></td>;
      case "barcode":
        return (
          <td key={key} className="p-1 border-r border-neutral-200 align-top overflow-hidden">
            <div className="flex flex-col gap-1 w-full min-w-0">
                <div className="flex flex-wrap content-start gap-1 px-1 w-full min-w-0 max-h-16 overflow-y-auto">
                    {(product.barcode || []).map(b => (
                        <span key={b} className="inline-flex items-center gap-1 bg-stone-50 text-neutral-700 pl-2 pr-1 py-0.5 rounded-sm text-[10px] font-mono tabular-nums border border-neutral-200 border-l-2 border-l-[var(--primary-color)] [border-left-style:dashed] max-w-full break-all group/chip">
                            <span className="min-w-0 break-all">{b}</span>
                            <button onClick={() => {
                                const newBarcodes = (product.barcode || []).filter(item => item !== b);
                                handleFieldChange(originalIndex, 'barcode', newBarcodes);
                            }} className="text-neutral-400 hover:text-red-500 transition-colors">&times;</button>
                        </span>
                    ))}
                </div>
                <div className="flex gap-1 px-1 mt-1 w-full min-w-0">
                    <input
                        type="text"
                        className="flex-1 min-w-0 w-full px-2 py-1 border border-gray-200 rounded text-[11px] focus:ring-1 focus:ring-[var(--primary-color)] focus:outline-none"
                        placeholder="Add"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                const val = (e.currentTarget as HTMLInputElement).value.trim();
                                if (val && !(product.barcode || []).includes(val)) {
                                    handleFieldChange(originalIndex, 'barcode', [...(product.barcode || []), val]);
                                    (e.currentTarget as HTMLInputElement).value = '';
                                }
                            }
                        }}
                    />
                    <button
                        onClick={() => {
                            const newB = Math.floor(100000000000 + Math.random() * 900000000000).toString();
                            handleFieldChange(originalIndex, 'barcode', [...(product.barcode || []), newB]);
                        }}
                        className="p-1.5 bg-pink-50 border border-pink-200 rounded text-[var(--primary-color)] hover:bg-pink-100 transition-colors"
                        title="Auto Generate"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                    </button>
                    <button
                        onClick={() => startScanning(originalIndex)}
                        className="p-1.5 bg-pink-50 border border-pink-200 rounded text-[var(--primary-color)] hover:bg-pink-100 transition-colors"
                        title="Scan Barcode"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 012-2h2m10 0h2a2 2 0 012 2v2m0 10v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                    </button>
                </div>
            </div>
          </td>
        );
      case "hsnCode":
        return <td key={key} className="p-0 border-r border-neutral-200"><input type="text" className="w-full h-full px-2 py-2 bg-transparent border-none text-sm" value={product.hsnCode} onChange={(e) => handleFieldChange(originalIndex, 'hsnCode', e.target.value)} /></td>;
      case "pack":
        return <td key={key} className="p-0 border-r border-neutral-200"><input type="text" className="w-full h-full px-2 py-2 bg-transparent border-none text-sm" value={product.pack} onChange={(e) => handleFieldChange(originalIndex, 'pack', e.target.value)} /></td>;
      case "size":
        return <td key={key} className="p-2 border-r border-neutral-200 text-sm text-neutral-600">-</td>;
      case "color":
        return <td key={key} className="p-2 border-r border-neutral-200 text-sm text-neutral-600">-</td>;

      case "tax":
        return <td key={key} className="p-0 border-r border-neutral-200"><input type="text" className="w-full h-full px-2 py-2 bg-transparent border-none text-sm" value={product.tax} onChange={(e) => handleFieldChange(originalIndex, 'tax', e.target.value)} /></td>;
      case "gst":
        return <td key={key} className="p-2 border-r border-neutral-200 text-sm text-neutral-600">-</td>;
      case "purchasePrice":
        return <td key={key} className="p-0 border-r border-neutral-200"><input type="number" className="w-full h-full px-2 py-2 bg-transparent border-none text-sm text-right font-mono tabular-nums" value={product.purchasePrice} onChange={(e) => handleFieldChange(originalIndex, 'purchasePrice', parseFloat(e.target.value))} /></td>;
      case "mfgDate":
        return <td key={key} className="p-0 border-r border-neutral-200"><input type="date" className="w-full h-full px-2 py-2 bg-transparent border-none text-sm" value={product.mfgDate || ""} onChange={(e) => handleFieldChange(originalIndex, 'mfgDate', e.target.value)} /></td>;
      case "expiryDate":
        return <td key={key} className="p-0 border-r border-neutral-200"><input type="date" className="w-full h-full px-2 py-2 bg-transparent border-none text-sm" value={product.expiryDate || ""} onChange={(e) => handleFieldChange(originalIndex, 'expiryDate', e.target.value)} /></td>;
      case "weight":
        return <td key={key} className="p-0 border-r border-neutral-200"><input type="text" className="w-full h-full px-2 py-2 bg-transparent border-none text-sm" value={product.weight || ""} onChange={(e) => handleFieldChange(originalIndex, 'weight', e.target.value)} /></td>;
      case "compareAtPrice":
        return <td key={key} className="p-0 border-r border-neutral-200"><input type="number" className="w-full h-full px-3 py-2 bg-transparent border-none focus:ring-2 focus:ring-[var(--primary-color)] focus:bg-white text-sm text-right font-mono tabular-nums" value={product.compareAtPrice} onChange={(e) => handleFieldChange(originalIndex, "compareAtPrice", parseFloat(e.target.value) || 0)} /></td>;
      case "price":
        return <td key={key} className="p-0 border-r border-neutral-200"><input type="number" className="w-full h-full px-3 py-2 bg-transparent border-none focus:ring-2 focus:ring-[var(--primary-color)] focus:bg-white text-sm text-right font-mono tabular-nums font-medium" value={product.price} onChange={(e) => handleFieldChange(originalIndex, "price", parseFloat(e.target.value) || 0)} /></td>;
      case "deliveryTime":
        return <td key={key} className="p-0 border-r border-neutral-200"><input type="text" className="w-full h-full px-2 py-2 bg-transparent border-none text-sm" value={product.deliveryTime} onChange={(e) => handleFieldChange(originalIndex, 'deliveryTime', e.target.value)} /></td>;
      case "stock":
        return <td key={key} className="p-0 border-r border-neutral-200"><input type="number" className="w-full h-full px-3 py-2 bg-transparent border-none focus:ring-2 focus:ring-[var(--primary-color)] focus:bg-white text-sm text-right font-mono tabular-nums" value={product.stock} onChange={(e) => handleFieldChange(originalIndex, "stock", parseInt(e.target.value) || 0)} /></td>;
      case "offerPrice":
        return <td key={key} className="p-0 border-r border-neutral-200"><input type="number" className="w-full h-full px-2 py-2 bg-transparent border-none text-sm text-right font-mono tabular-nums" value={product.offerPrice} onChange={(e) => handleFieldChange(originalIndex, 'offerPrice', parseFloat(e.target.value) || 0)} /></td>;
      case "wholesalePrice":
        return <td key={key} className="p-0 border-r border-neutral-200"><input type="number" className="w-full h-full px-2 py-2 bg-transparent border-none text-sm text-right font-mono tabular-nums" value={product.wholesalePrice} onChange={(e) => handleFieldChange(originalIndex, 'wholesalePrice', parseFloat(e.target.value) || 0)} /></td>;
      case "lowStockQuantity":
        return <td key={key} className="p-0 border-r border-neutral-200"><input type="number" className="w-full h-full px-2 py-2 bg-transparent border-none text-sm text-right font-mono tabular-nums" value={product.lowStockQuantity} onChange={(e) => handleFieldChange(originalIndex, 'lowStockQuantity', parseInt(e.target.value))} /></td>;
      case "brand":
        return (
          <td key={key} className="p-0 border-r border-neutral-200">
            <SearchableSelect
              options={brands.map(brand => ({ value: brand._id, label: brand.name || "Unnamed Brand" }))}
              value={product.brandId || ""}
              onChange={(val) => handleFieldChange(originalIndex, 'brandId', val)}
              placeholder="-Select Brand-"
            />
          </td>
        );
      case "valMrp":
        return <td key={key} className="p-2 border-r border-neutral-200 text-sm text-neutral-600 text-right">{(product.compareAtPrice * product.stock).toLocaleString()}</td>;
      case "valPur":
        return <td key={key} className="p-2 border-r border-neutral-200 text-sm text-neutral-600 text-right">{(product.purchasePrice * product.stock).toLocaleString()}</td>;
      case "unitPrice":
        return (
            <td key={key} className="p-1 border-r border-neutral-200 align-top">
                <div className="flex justify-between items-start h-full gap-1">
                     <div className="flex flex-col gap-0.5 w-full">
                        {product.unitPricing && product.unitPricing.length > 0 ? (
                            product.unitPricing.map((slab, idx) => (
                                <div key={idx} className="text-[10px] text-gray-700 bg-gray-50 px-1 rounded flex justify-between border border-gray-100">
                                    <span>{slab.minQty}+</span>
                                    <span className="font-bold">₹{slab.price}</span>
                                </div>
                            ))
                        ) : (
                            <span className="text-[10px] text-gray-400 italic p-1">No rules</span>
                        )}
                     </div>
                     <button
                        onClick={() => setActivePricingModalIndex(originalIndex)}
                        className="text-[var(--primary-color)] hover:text-[var(--primary-dark)] p-1 hover:bg-[var(--primary-color)]/10 rounded shrink-0"
                        title="Edit Pricing Rules"
                     >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                     </button>
                </div>
            </td>
        );
      case "status":
        return (
          <td key={key} className="p-2 text-center">
            <label className="inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={product.publish} onChange={(e) => handleFieldChange(originalIndex, "publish", e.target.checked)} className="sr-only peer" />
              <div className="relative w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--primary-color)]/50 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-[var(--primary-color)]"></div>
              <span className="ms-2 text-xs font-medium text-gray-900">{product.publish ? "Active" : "Inactive"}</span>
            </label>
          </td>
        );
      default:
        return <td key={key} className="p-2"></td>;
    }
  };

  const NA_VARIATION_COLUMNS = new Set([
    "image", "category", "subCategory", "subSubCategory", "description", "hsnCode",
    "mfgDate", "expiryDate", "deliveryTime", "brand", "lowStockQuantity", "tax", "gst",
    "valMrp", "valPur", "unitPrice", "status", "variationName", "pack",
  ]);

  const renderVariationBodyCell = (
    key: string,
    product: EditableProduct,
    variation: any,
    originalIndex: number,
    variationIndex: number
  ) => {
    if (hiddenColumns.includes(key)) return null;

    if (NA_VARIATION_COLUMNS.has(key)) {
      return <td key={key} className="p-2 border-r border-neutral-200 text-center text-xs text-neutral-300">—</td>;
    }

    // When a product has only one (synthesized) variation, handleSave's
    // single-variation branch always writes the parent row's own
    // price/stock/sku/etc. into that lone variation, ignoring whatever the
    // variation subdocument itself holds. Editing those fields here would
    // silently be discarded on save, so proxy them straight to the parent
    // row's field instead - same value, same save path, no dead inputs.
    // Block/Rack are handled separately below via a lock/custom toggle,
    // since they have their own "same as parent" default regardless of
    // variation count.
    const isSingleVariation = (product.variations || []).length <= 1;
    const SINGLE_VARIATION_FIELD_MAP: Record<string, keyof EditableProduct> = {
      price: "price",
      compareAtPrice: "compareAtPrice",
      stock: "stock",
      discPrice: "offerPrice",
      wholesalePrice: "wholesalePrice",
      purchasePrice: "purchasePrice",
      sku: "itemCode",
      barcode: "barcode",
    };
    const getFieldValue = (field: string) =>
      isSingleVariation && SINGLE_VARIATION_FIELD_MAP[field]
        ? (product as any)[SINGLE_VARIATION_FIELD_MAP[field]]
        : variation[field];
    const onChange = (field: string, value: any) => {
      if (isSingleVariation && SINGLE_VARIATION_FIELD_MAP[field]) {
        handleFieldChange(originalIndex, SINGLE_VARIATION_FIELD_MAP[field], value);
        return;
      }
      handleVariationFieldChange(originalIndex, variationIndex, field, value);
    };

    switch (key) {
      case "index":
        return <td key={key} className="p-2 border-r border-neutral-200 text-center text-xs text-neutral-400">↳</td>;
      case "productName":
      case "attributes": {
        const selectedAttributes = product.attributes || [];
        if (selectedAttributes.length === 0) {
          return (
            <td key={key} className="p-0 border-r border-neutral-200">
              <input
                type="text"
                className="w-full h-full px-3 py-2 bg-transparent border-none focus:ring-2 focus:ring-[var(--primary-color)] focus:bg-white text-sm"
                placeholder="Variation value (e.g. Red / M)"
                value={variation.value || ""}
                onChange={(e) => onChange("value", e.target.value)}
              />
            </td>
          );
        }
        return (
          <td key={key} className="p-1 border-r border-neutral-200 align-top">
            <div className="flex flex-col gap-1">
              {selectedAttributes.map((attr: string) => (
                <div key={attr} className="flex items-center gap-1">
                  <span className="text-[9px] text-gray-400 w-10 shrink-0 truncate" title={attr}>{attr}</span>
                  <input
                    type="text"
                    className="flex-1 min-w-0 px-1.5 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-[var(--primary-color)] focus:outline-none"
                    placeholder={attr}
                    value={variation[attr] || ""}
                    onChange={(e) => handleVariationAttributeChange(originalIndex, variationIndex, attr, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </td>
        );
      }
      case "sku":
        return <td key={key} className="p-0 border-r border-neutral-200"><input type="text" className="w-full h-full px-2 py-2 bg-transparent border-none text-sm font-mono tracking-tight" value={getFieldValue("sku") || ""} onChange={(e) => onChange("sku", e.target.value)} /></td>;
      case "blockNumber": {
        const isCustom = !!variation.customBlockRack;
        const blockValue = isCustom ? (variation.blockNumber || "") : (product.blockNumber || "");
        return (
          <td key={key} className="p-0 border-r border-neutral-200">
            <div className="flex items-center h-full">
              <button
                type="button"
                onClick={() => handleVariationFieldChange(originalIndex, variationIndex, "customBlockRack", !isCustom)}
                className="px-1 shrink-0 text-gray-400 hover:text-[var(--primary-color)] transition-colors"
                title={isCustom ? "Custom block/rack - click to lock to parent product" : "Locked to parent product's block/rack - click to customize"}
              >
                {isCustom ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                )}
              </button>
              <select
                disabled={!isCustom}
                className="flex-1 h-full px-1 py-2 bg-transparent border-none text-sm disabled:text-neutral-400 disabled:cursor-not-allowed"
                value={blockValue}
                onChange={(e) => handleVariationFieldChange(originalIndex, variationIndex, "blockNumber", e.target.value)}
              >
                <option value="">-</option>
                {Array.from({ length: 50 }, (_, i) => String(i + 1)).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </td>
        );
      }
      case "rackNumber": {
        const isCustom = !!variation.customBlockRack;
        const rackSource = isCustom ? (variation.rackNumber || "") : (product.rackNumber || "");
        const rackLetter = (rackSource.match(/^[A-Za-z]+/)?.[0] || "").toUpperCase();
        const rackDigits = rackSource.replace(/^[A-Za-z]+/, "");
        const setRack = (letter: string, digits: string) =>
          handleVariationFieldChange(originalIndex, variationIndex, "rackNumber", `${letter}${digits}`);
        return (
          <td key={key} className="p-0 border-r border-neutral-200">
            <div className="flex items-center h-full">
              <button
                type="button"
                onClick={() => handleVariationFieldChange(originalIndex, variationIndex, "customBlockRack", !isCustom)}
                className="px-1 shrink-0 text-gray-400 hover:text-[var(--primary-color)] transition-colors"
                title={isCustom ? "Custom block/rack - click to lock to parent product" : "Locked to parent product's block/rack - click to customize"}
              >
                {isCustom ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                )}
              </button>
              <select
                disabled={!isCustom}
                className="w-1/2 h-full px-1 py-2 bg-transparent border-none text-sm border-r border-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed"
                value={rackLetter}
                onChange={(e) => setRack(e.target.value, rackDigits)}
              >
                <option value="">-</option>
                {Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)).map((letter) => (
                  <option key={letter} value={letter}>{letter}</option>
                ))}
              </select>
              <select
                disabled={!isCustom}
                className="w-1/2 h-full px-1 py-2 bg-transparent border-none text-sm disabled:text-neutral-400 disabled:cursor-not-allowed"
                value={rackDigits}
                onChange={(e) => setRack(rackLetter, e.target.value)}
              >
                <option value="">-</option>
                {Array.from({ length: 50 }, (_, i) => String(i + 1)).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </td>
        );
      }
      case "barcode": {
        const barcodes: string[] = getFieldValue("barcode") || [];
        return (
          <td key={key} className="p-1 border-r border-neutral-200 align-top overflow-hidden">
            <div className="flex flex-col gap-1 w-full min-w-0">
              <div className="flex flex-wrap content-start gap-1 px-1 w-full min-w-0 max-h-16 overflow-y-auto">
                {barcodes.map((b: string) => (
                  <span key={b} className="inline-flex items-center gap-1 bg-stone-50 text-neutral-700 pl-2 pr-1 py-0.5 rounded-sm text-[10px] font-mono tabular-nums border border-neutral-200 border-l-2 border-l-[var(--primary-color)] [border-left-style:dashed] max-w-full break-all">
                    <span className="min-w-0 break-all">{b}</span>
                    <button onClick={() => onChange("barcode", barcodes.filter((item: string) => item !== b))} className="text-neutral-400 hover:text-red-500 transition-colors">&times;</button>
                  </span>
                ))}
              </div>
              <input
                type="text"
                className="flex-1 min-w-0 w-full px-2 py-1 border border-gray-200 rounded text-[11px] focus:ring-1 focus:ring-[var(--primary-color)] focus:outline-none"
                placeholder="Add barcode"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const val = (e.currentTarget as HTMLInputElement).value.trim();
                    if (val && !barcodes.includes(val)) {
                      onChange("barcode", [...barcodes, val]);
                      (e.currentTarget as HTMLInputElement).value = "";
                    }
                  }
                }}
              />
            </div>
          </td>
        );
      }
      case "purchasePrice":
        return <td key={key} className="p-0 border-r border-neutral-200"><input type="number" className="w-full h-full px-2 py-2 bg-transparent border-none text-sm text-right font-mono tabular-nums" value={getFieldValue("purchasePrice") || 0} onChange={(e) => onChange("purchasePrice", parseFloat(e.target.value) || 0)} /></td>;
      case "compareAtPrice":
        return <td key={key} className="p-0 border-r border-neutral-200"><input type="number" className="w-full h-full px-3 py-2 bg-transparent border-none focus:ring-2 focus:ring-[var(--primary-color)] focus:bg-white text-sm text-right font-mono tabular-nums" value={getFieldValue("compareAtPrice") || 0} onChange={(e) => onChange("compareAtPrice", parseFloat(e.target.value) || 0)} /></td>;
      case "price":
        return <td key={key} className="p-0 border-r border-neutral-200"><input type="number" className="w-full h-full px-3 py-2 bg-transparent border-none focus:ring-2 focus:ring-[var(--primary-color)] focus:bg-white text-sm text-right font-mono tabular-nums font-medium" value={getFieldValue("price") || 0} onChange={(e) => onChange("price", parseFloat(e.target.value) || 0)} /></td>;
      case "stock":
        return <td key={key} className="p-0 border-r border-neutral-200"><input type="number" className="w-full h-full px-3 py-2 bg-transparent border-none focus:ring-2 focus:ring-[var(--primary-color)] focus:bg-white text-sm text-right font-mono tabular-nums" value={getFieldValue("stock") || 0} onChange={(e) => onChange("stock", parseInt(e.target.value) || 0)} /></td>;
      case "offerPrice":
        return <td key={key} className="p-0 border-r border-neutral-200"><input type="number" className="w-full h-full px-2 py-2 bg-transparent border-none text-sm text-right font-mono tabular-nums" value={getFieldValue("discPrice") || 0} onChange={(e) => onChange("discPrice", parseFloat(e.target.value) || 0)} /></td>;
      case "wholesalePrice":
        return <td key={key} className="p-0 border-r border-neutral-200"><input type="number" className="w-full h-full px-2 py-2 bg-transparent border-none text-sm text-right font-mono tabular-nums" value={getFieldValue("wholesalePrice") || 0} onChange={(e) => onChange("wholesalePrice", parseFloat(e.target.value) || 0)} /></td>;
      case "variations":
        // Removing a variation is handled by the trash icon in the leading
        // column (left of the row) - avoid a second, inconsistent control here.
        return <td key={key} className="p-2 border-r border-neutral-200 text-center text-xs text-neutral-300">—</td>;
      default:
        return <td key={key} className="p-2 border-r border-neutral-200 text-center text-xs text-neutral-300">—</td>;
    }
  };

  const hasAnyChanges = useMemo(
    () => editedCacheRef.current.size > 0,
    [changesVersion]
  );
  const totalEntries = Number(serverPagination?.total ?? 0);
  const startEntry = totalEntries === 0 ? 0 : (page - 1) * pageLimit + 1;
  const endEntry = Math.min(page * pageLimit, totalEntries);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-[98vw] sm:max-w-7xl h-[94vh] sm:h-[90vh] flex flex-col">
          {/* Header */}
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-neutral-200 bg-[var(--primary-color)] text-white rounded-t-lg">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold leading-snug">Bulk Edit Products</h2>
              <button
                onClick={onClose}
                className="text-white hover:bg-[var(--primary-dark)] p-2 rounded transition-colors shrink-0"
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setEditableProducts((prev) => [createEmptyProduct(), ...prev])}
                className="px-3 py-1.5 text-sm bg-white text-[var(--primary-color)] rounded hover:bg-pink-50 transition-colors whitespace-nowrap"
              >
                + Add Row
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowRedundantDropdown(!showRedundantDropdown)}
                  className={`px-3 py-1.5 text-sm rounded transition-colors flex items-center gap-2 font-medium shadow-sm border-2 ${
                    redundantFilter 
                      ? "bg-[var(--primary-color)] text-white border-white" 
                      : "bg-white text-[var(--primary-color)] border-transparent hover:bg-pink-50"
                  }`}
                  title="Filter products by redundancy criteria"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  {redundantFilter ? `Redundant: ${redundantFilter}` : "Redundant"}
                  <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showRedundantDropdown && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowRedundantDropdown(false)}
                    />
                    <div className="absolute top-full left-0 mt-1 w-40 bg-white rounded-md shadow-lg border border-neutral-200 z-50 py-1">
                      {[
                        { label: 'All Duplicates', value: 'true' },
                        { label: 'Duplicate Name', value: 'name' },
                        { label: 'Duplicate Barcode', value: 'barcode' },
                        { label: 'Duplicate SKU', value: 'sku' },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => {
                            setRedundantFilter(redundantFilter === opt.value ? null : opt.value);
                            setPage(1);
                            setShowRedundantDropdown(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-pink-50 transition-colors ${
                            redundantFilter === opt.value ? "text-[var(--primary-color)] font-bold" : "text-neutral-700"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                      {redundantFilter && (
                        <button
                          onClick={() => {
                            setRedundantFilter(null);
                            setPage(1);
                            setShowRedundantDropdown(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 border-t border-neutral-100 mt-1"
                        >
                          Clear Filter
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="relative flex-grow min-w-[160px]">
                <input
                  type="text"
                  placeholder="Search products..."
                  className="w-full px-3 pr-10 py-1.5 text-sm text-black rounded border-none focus:ring-2 focus:ring-[var(--primary-color)]"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                />
                <button
                  onClick={() => {
                    if (isScanning) stopScanning();
                    setSearchScannerKey((prev) => prev + 1);
                    setShowSearchScanner(true);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-[var(--primary-color)] transition-colors"
                  title="Scan Barcode"
                  type="button"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 7V5a2 2 0 0 1 2-2h2m10 0h2a2 2 0 0 1 2 2v2m0 10v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M7 12h10" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>

        {/* Content (Spreadsheet) */}
        <div className="flex-1 overflow-auto p-0">
          <table className="w-full text-left border-collapse table-fixed">
            <thead className="bg-stone-100 sticky top-0 z-10 shadow-sm border-b-2 border-stone-300">
              <tr>
                <th className="w-12 p-2 border-r border-neutral-200 text-center">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllFiltered}
                    aria-label="Select all filtered products"
                  />
                </th>
                {columnOrder.map((key) => renderHeader(key))}
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product, index) => {
                const originalIndex = editableProducts.findIndex(p => p.id === product.id);
                const isExpanded = expandedProductIds.has(product.id);
                return (
                  <React.Fragment key={product.id}>
                    <tr
                      className={`border-b border-neutral-200 hover:bg-neutral-50 ${product.isChanged ? "bg-yellow-50" : ""}`}
                    >
                      <td className="p-2 border-r border-neutral-200 text-center align-top">
                        <div className="flex flex-col items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={selectedProductIds.has(product.id)}
                            onChange={() => toggleSelectProduct(product.id)}
                            aria-label={`Select ${product.productName}`}
                          />
                          <button
                            type="button"
                            onClick={() => toggleExpandProduct(product.id)}
                            className={`flex items-center justify-center w-6 h-6 rounded-full border transition-all duration-150 ${
                              isExpanded
                                ? "bg-[var(--primary-color)] border-[var(--primary-color)] text-white shadow-sm"
                                : "bg-white border-neutral-300 text-neutral-400 hover:border-[var(--primary-color)] hover:text-[var(--primary-color)]"
                            }`}
                            title={isExpanded ? "Hide variations" : `Show ${(product.variations || []).length} variation${(product.variations || []).length === 1 ? "" : "s"}`}
                          >
                            <svg
                              className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                            >
                              <path d="M19 9l-7 7-7-7"></path>
                            </svg>
                          </button>
                        </div>
                      </td>
                      {columnOrder.map((key) => renderBodyCell(key, product, originalIndex, index))}
                    </tr>
                    {isExpanded && (product.variations || []).map((variation: any, vIdx: number) => (
                      <tr
                        key={variation._id || variation.id || `${product.id}-var-${vIdx}`}
                        className="border-b border-neutral-100 bg-[var(--primary-color)]/[0.04] border-l-[3px] border-l-[var(--primary-color)]/50 hover:bg-[var(--primary-color)]/[0.07] transition-colors"
                      >
                        <td className="p-2 border-r border-neutral-200 text-center align-middle">
                          {vIdx > 0 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveVariation(originalIndex, vIdx)}
                              className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-red-300 bg-red-50 text-red-500 hover:border-red-500 hover:text-red-600 hover:bg-red-100 transition-colors"
                              title="Remove this variation"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              </svg>
                            </button>
                          )}
                        </td>
                        {columnOrder.map((key) => renderVariationBodyCell(key, product, variation, originalIndex, vIdx))}
                      </tr>
                    ))}
                    {isExpanded && (
                      <tr className="border-b border-neutral-200 bg-[var(--primary-color)]/[0.03] border-l-[3px] border-l-[var(--primary-color)]/50">
                        <td colSpan={columnOrder.length + 1} className="p-0">
                          <div className="sticky left-2 w-fit flex gap-2 p-2">
                            <button
                              type="button"
                              onClick={() => handleAddVariation(originalIndex)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-white border border-[var(--primary-color)]/40 text-[var(--primary-color)] rounded-full hover:bg-pink-50 hover:border-[var(--primary-color)] transition-colors shadow-sm"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                              Blank Variation
                            </button>
                            <div className="relative">
                              <button
                                type="button"
                                onClick={(e) =>
                                  setAttachPopoverAnchor(
                                    attachPopoverAnchor?.index === originalIndex
                                      ? null
                                      : { index: originalIndex, rect: e.currentTarget.getBoundingClientRect() }
                                  )
                                }
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-[var(--primary-color)] text-white rounded-full hover:bg-[var(--primary-dark)] transition-colors shadow-sm"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                Attach Existing Product
                              </button>
                              {attachPopoverAnchor?.index === originalIndex && (
                                <AttachProductPopover
                                  excludeProductId={product.id}
                                  anchorRect={attachPopoverAnchor.rect}
                                  onAttach={(picked) => handleAttachExistingProduct(originalIndex, picked)}
                                  onClose={() => setAttachPopoverAnchor(null)}
                                />
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {filteredProducts.length === 0 && (
            <div className="p-8 text-center text-neutral-500">
              No products found.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-neutral-50 rounded-b-lg">
          <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-700 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-600">Show</span>
              <select
                value={pageLimit}
                onChange={(e) => {
                  setPageLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-white border border-neutral-300 rounded py-1.5 px-3 text-sm focus:ring-1 focus:ring-[var(--primary-color)] focus:outline-none cursor-pointer"
                disabled={pageLoading}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={500}>500</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pageLoading || page <= 1}
              className={`px-3 py-1.5 border rounded ${
                pageLoading || page <= 1
                  ? "bg-neutral-200 text-neutral-500 cursor-not-allowed border-neutral-200"
                  : "bg-white hover:bg-neutral-100 border-neutral-300"
              }`}
            >
              Prev
            </button>
            <span className="text-xs sm:text-sm">
              Page {page} / {serverPagination?.pages || 1} • Showing {startEntry} to{" "}
              {endEntry} of {totalEntries}
              {pageLoading ? " (Loading...)" : ""}
            </span>
            <button
              type="button"
              onClick={() =>
                setPage((p) => Math.min(serverPagination?.pages || 1, p + 1))
              }
              disabled={pageLoading || page >= (serverPagination?.pages || 1)}
              className={`px-3 py-1.5 border rounded ${
                pageLoading || page >= (serverPagination?.pages || 1)
                  ? "bg-neutral-200 text-neutral-500 cursor-not-allowed border-neutral-200"
                  : "bg-white hover:bg-neutral-100 border-neutral-300"
              }`}
            >
              Next
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 w-full sm:w-auto sm:flex sm:justify-end sm:gap-3">
          <button
            onClick={handleDeleteSelected}
            disabled={deleting || saving || selectedProductIds.size === 0}
            className={`w-full min-w-0 px-2 py-2 rounded text-xs sm:text-sm text-white text-center leading-snug whitespace-normal break-words sm:px-4 ${
              deleting || saving || selectedProductIds.size === 0
                ? "bg-red-300 cursor-not-allowed"
                : "bg-red-500 hover:bg-red-600"
            }`}
          >
            {deleting ? "Deleting..." : `Delete Selected (${selectedProductIds.size})`}
          </button>
          <button
            onClick={onClose}
            className="w-full min-w-0 px-2 py-2 border border-neutral-300 rounded text-neutral-700 text-xs sm:text-sm hover:bg-neutral-100 transition-colors sm:px-4"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasAnyChanges}
            className={`w-full min-w-0 px-2 py-2 rounded text-white text-xs sm:text-sm flex items-center justify-center gap-2 sm:px-4 ${
              saving || !hasAnyChanges
                ? "bg-neutral-400 cursor-not-allowed"
                : "bg-[var(--primary-color)] hover:bg-[var(--primary-dark)]"
            }`}
          >
            {saving ? (
              <>
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </button>
          </div>
        </div>
      </div>

      {/* Pricing Modal */}
      {activePricingModalIndex !== null && (
          <PricingSlabsModal
              slabs={editableProducts[activePricingModalIndex].unitPricing || []}
              onClose={() => setActivePricingModalIndex(null)}
              onSave={(newSlabs) => handleFieldChange(activePricingModalIndex, 'unitPricing', newSlabs)}
          />
      )}
      {showSearchScanner && (
          <QRScannerModal
            onClose={stopSearchScanning}
            onScanSuccess={onSearchScanSuccess}
          />
      )}

      {isScanning && (
          <QRScannerModal
            onClose={stopScanning}
            onScanSuccess={onInlineScanSuccess}
          />
      )}

      {/* Image Source Selection Modal */}
      {showImageSourceModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden transform transition-all scale-100">
                  <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-pink-50/30">
                      <h3 className="font-bold text-gray-800 text-lg">Choose Image</h3>
                      <button onClick={() => setShowImageSourceModal(false)} className="text-gray-400 hover:text-gray-600 p-1 bg-white rounded-full shadow-sm border border-gray-100">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                  </div>

                  <div className="p-5 space-y-6">
                      {/* Live Search Section */}
                      <div>
                           <div className="flex items-center justify-between mb-2">
                              <label className="text-xs font-bold text-[var(--primary-color)] uppercase tracking-wider flex items-center gap-1">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                  Live Image Search
                              </label>
                              <span className="text-[10px] bg-pink-100 text-[var(--primary-dark)] px-1.5 py-0.5 rounded font-bold">AI</span>
                           </div>
                           <div className="flex gap-2">
                              <input
                                  type="text"
                                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[var(--primary-color)] focus:border-[var(--primary-color)] outline-none"
                                  placeholder="e.g. 10 Vala Pen, Dove Soap"
                                  value={imageSearchQuery}
                                  onChange={(e) => setImageSearchQuery(e.target.value)}
                                  onKeyDown={(e) => e.key === 'Enter' && handleImageSearch()}
                                  autoFocus
                              />
                              <button
                                  onClick={handleImageSearch}
                                  disabled={isSearchingImage}
                                  className="bg-[var(--primary-color)] text-white px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wide hover:bg-[var(--primary-dark)] disabled:opacity-70 transition-colors"
                              >
                                  {isSearchingImage ? '...' : 'GO'}
                              </button>
                           </div>

                           {/* Search Result Preview */}
                           {searchedImage && (
                              <div className="mt-3 p-3 bg-pink-50 rounded-xl border border-pink-100 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                                  <img src={searchedImage} className="w-14 h-14 object-cover rounded-lg bg-white shadow-sm" alt="Result" />
                                  <div className="flex-1 min-w-0">
                                      <p className="text-xs text-[var(--primary-dark)] font-medium mb-1 truncate">Image Found!</p>
                                      <button
                                          onClick={() => {
                                              applySearchedImage();
                                              setShowImageSourceModal(false);
                                          }}
                                          className="text-xs bg-[var(--primary-color)] text-white px-3 py-1.5 rounded-lg font-bold hover:bg-[var(--primary-dark)] w-full shadow-sm hover:shadow"
                                      >
                                          Use This Image
                                      </button>
                                  </div>
                              </div>
                           )}
                      </div>

                      <div className="relative flex items-center py-2">
                          <div className="flex-grow border-t border-gray-200"></div>
                          <span className="flex-shrink-0 mx-4 text-gray-300 text-[10px] font-bold uppercase tracking-widest">OR UPLOAD</span>
                          <div className="flex-grow border-t border-gray-200"></div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <button
                              onClick={() => { setShowImageSourceModal(false); setTimeout(() => document.getElementById(`file-input-${imageSourceModalRowIndex}`)?.click(), 200); }}
                              className="flex flex-col items-center justify-center gap-3 p-4 border border-gray-100 rounded-2xl bg-gray-50 hover:bg-pink-50 hover:border-pink-200 hover:text-[var(--primary-color)] transition-all group active:scale-[0.98]"
                          >
                              <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center text-gray-600 group-hover:text-[var(--primary-color)] group-hover:scale-110 transition-transform">
                                   <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                              </div>
                              <span className="font-semibold text-sm text-gray-600 group-hover:text-[var(--primary-color)]">Gallery</span>
                          </button>

                          <button
                              onClick={() => { setShowImageSourceModal(false); setTimeout(() => document.getElementById(`file-input-${imageSourceModalRowIndex}`)?.click(), 200); }}
                              className="flex flex-col items-center justify-center gap-3 p-4 border border-gray-100 rounded-2xl bg-gray-50 hover:bg-pink-50 hover:border-pink-200 hover:text-[var(--primary-color)] transition-all group active:scale-[0.98]"
                          >
                              <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center text-gray-600 group-hover:text-[var(--primary-color)] group-hover:scale-110 transition-transform">
                                   <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                              </div>
                              <span className="font-semibold text-sm text-gray-600 group-hover:text-[var(--primary-color)]">Camera</span>
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      <ImageCropperModal
        file={imageCropQueue[0]?.file || null}
        open={imageCropQueue.length > 0}
        onClose={() => setImageCropQueue([])}
        onCropped={handleQueuedImageCropped}
      />
    </div>
  );
}
