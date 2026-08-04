import React, { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  getProductSalesReport,
  ProductSalesReportView,
  ProductSalesRow,
  CategorySalesRow,
  LocationSalesRow,
  CustomerSalesRow,
  ProductSalesReportSummary,
} from "../../../services/api/admin/adminInventoryService";
import { toast } from "react-hot-toast";

type DateFilterType = 'today' | 'tomorrow' | 'last7days' | 'last30days' | 'alltime' | 'custom';

const TABS: { key: ProductSalesReportView; label: string }[] = [
  { key: "product", label: "Products" },
  { key: "category", label: "Category" },
  { key: "location", label: "Location" },
  { key: "customer", label: "Customer" },
];

const emptySummary: ProductSalesReportSummary = {
  totalUnits: 0,
  totalRevenue: 0,
  totalProfit: 0,
  topProductName: "N/A",
};

const Spinner = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={`${className} animate-spin text-[var(--primary-dark)]`} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

const AdminProductSalesReport = () => {
  const [activeTab, setActiveTab] = useState<ProductSalesReportView>("product");
  const [data, setData] = useState<any[]>([]);
  const [summary, setSummary] = useState<ProductSalesReportSummary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>('alltime');
  const [customDateRange, setCustomDateRange] = useState({ start: "", end: "" });
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);

  const [pagination, setPagination] = useState({
    page: 1,
    total: 0,
    pages: 1,
    limit: 20
  });

  // Guards against a slower, stale request clobbering a newer one's result
  // (e.g. rapid tab switching) and incorrectly clearing the loading state.
  const requestIdRef = useRef(0);

  const fetchData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const params: any = {
        page: pagination.page,
        limit: pagination.limit,
        search: debouncedSearchTerm || undefined,
        view: activeTab,
      };

      const now = new Date();
      if (dateFilterType === 'today') {
        params.dateFrom = new Date(now.setHours(0, 0, 0, 0)).toISOString();
        params.dateTo = new Date(now.setHours(23, 59, 59, 999)).toISOString();
      } else if (dateFilterType === 'tomorrow') {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        params.dateFrom = new Date(tomorrow.setHours(0, 0, 0, 0)).toISOString();
        params.dateTo = new Date(tomorrow.setHours(23, 59, 59, 999)).toISOString();
      } else if (dateFilterType === 'last7days') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        params.dateFrom = d.toISOString();
      } else if (dateFilterType === 'last30days') {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        params.dateFrom = d.toISOString();
      } else if (dateFilterType === 'custom' && customDateRange.start && customDateRange.end) {
        params.dateFrom = new Date(customDateRange.start).toISOString();
        params.dateTo = new Date(new Date(customDateRange.end).setHours(23, 59, 59, 999)).toISOString();
      }

      const response = await getProductSalesReport(params);
      if (requestId !== requestIdRef.current) return; // a newer request has since started

      if (response.success) {
        setData(response.data);
        setSummary(response.summary || emptySummary);
        if (response.pagination) {
          setPagination(prev => ({
            ...prev,
            total: response.pagination!.total,
            pages: response.pagination!.pages
          }));
        }
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      console.error("Error fetching product sales report:", error);
      toast.error("Failed to fetch product sales data");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [pagination.page, pagination.limit, debouncedSearchTerm, dateFilterType, customDateRange, activeTab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setPagination(prev => ({ ...prev, page: 1 }));
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleTabChange = (tab: ProductSalesReportView) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setData([]);
    setPagination(prev => ({ ...prev, page: 1 }));
    setSearchTerm("");
    setDebouncedSearchTerm("");
  };

  const handleDateFilterChange = (type: DateFilterType) => {
    setDateFilterType(type);
    setPagination(prev => ({ ...prev, page: 1 }));
    setShowCustomDatePicker(type === 'custom');
  };

  const getExportRows = () => {
    if (activeTab === "product") {
      return (data as ProductSalesRow[]).map(item => ({
        "Product": item.productName,
        "SKU": item.sku,
        "Category": item.categoryName,
        "Brand": item.brandName,
        "Units Sold": item.unitsSold,
        "Revenue": item.revenue,
        "Profit": item.profit,
        "Total Discount": item.totalDiscount,
        "Avg Discount %": item.avgDiscountPercent,
        "Orders": item.ordersCount,
      }));
    }
    if (activeTab === "category") {
      return (data as CategorySalesRow[]).map(item => ({
        "Category": item.categoryName,
        "Units Sold": item.unitsSold,
        "Revenue": item.revenue,
        "Profit": item.profit,
        "Distinct Products": item.distinctProducts,
        "Orders": item.ordersCount,
      }));
    }
    if (activeTab === "location") {
      return (data as LocationSalesRow[]).map(item => ({
        "City": item.city,
        "State": item.state || "N/A",
        "Units Sold": item.unitsSold,
        "Revenue": item.revenue,
        "Orders": item.ordersCount,
        "Distinct Customers": item.distinctCustomers,
      }));
    }
    return (data as CustomerSalesRow[]).map(item => ({
      "Customer": item.customerName,
      "Phone": item.customerPhone,
      "Units Sold": item.unitsSold,
      "Revenue": item.revenue,
      "Orders": item.ordersCount,
      "Avg Order Value": item.avgOrderValue,
      "Last Purchase": item.lastPurchaseDate ? new Date(item.lastPurchaseDate).toLocaleDateString() : "N/A",
    }));
  };

  const downloadExcel = () => {
    const rows = getExportRows();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Product Sales");
    XLSX.writeFile(workbook, `Product_Sales_${activeTab}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const downloadPDF = () => {
    const rows = getExportRows();
    if (rows.length === 0) {
      toast.error("No data to export");
      return;
    }
    const doc = new jsPDF('landscape');
    doc.setFontSize(18);
    doc.text('Most Selling Products', 14, 15);
    doc.setFontSize(10);
    doc.text(`View: ${TABS.find(t => t.key === activeTab)?.label} | Generated on: ${new Date().toLocaleString()}`, 14, 22);

    const head = [Object.keys(rows[0])];
    const body = rows.map(row => Object.values(row).map(v => (typeof v === "number" ? v.toLocaleString() : String(v))));

    autoTable(doc, {
      head,
      body,
      startY: 28,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [255, 45, 148] }
    });

    doc.save(`Product_Sales_${activeTab}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const colSpan = activeTab === "product" ? 11 : activeTab === "category" ? 7 : activeTab === "location" ? 6 : 7;

  const renderTableHead = () => {
    if (activeTab === "product") {
      return (
        <tr>
          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider w-14">Rank</th>
          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Product</th>
          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">SKU</th>
          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Category</th>
          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Brand</th>
          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Units Sold</th>
          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Revenue</th>
          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Profit</th>
          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Avg Discount %</th>
          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Orders</th>
          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Revenue Share</th>
        </tr>
      );
    }
    if (activeTab === "category") {
      return (
        <tr>
          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Category</th>
          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Units Sold</th>
          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Revenue</th>
          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Profit</th>
          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Distinct Products</th>
          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Orders</th>
          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">% of Revenue</th>
        </tr>
      );
    }
    if (activeTab === "location") {
      return (
        <tr>
          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">City</th>
          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">State</th>
          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Units Sold</th>
          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Revenue</th>
          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Orders</th>
          <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Distinct Customers</th>
        </tr>
      );
    }
    return (
      <tr>
        <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Customer</th>
        <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Phone</th>
        <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Units Sold</th>
        <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Revenue</th>
        <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Orders</th>
        <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Avg Order Value</th>
        <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Last Purchase</th>
      </tr>
    );
  };

  const renderTableRows = () => {
    if (activeTab === "product") {
      const maxRevenue = Math.max(...(data as ProductSalesRow[]).map(r => r.revenue), 1);
      return (data as ProductSalesRow[]).map((item, idx) => {
        const rank = (pagination.page - 1) * pagination.limit + idx + 1;
        const share = summary.totalRevenue > 0 ? (item.revenue / summary.totalRevenue) * 100 : 0;
        return (
          <tr key={item._id} className="hover:bg-gray-50 transition-colors">
            <td className="px-4 py-3">
              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black ${
                rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                rank === 2 ? 'bg-gray-200 text-gray-700' :
                rank === 3 ? 'bg-orange-100 text-orange-700' :
                'bg-gray-50 text-gray-400'
              }`}>
                {rank}
              </span>
            </td>
            <td className="px-4 py-3 text-sm font-semibold text-gray-900 max-w-[220px] truncate" title={item.productName}>{item.productName}</td>
            <td className="px-4 py-3 text-sm text-gray-500">{item.sku}</td>
            <td className="px-4 py-3">
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-[var(--primary-alpha-20)] text-[var(--primary-darker)] whitespace-nowrap">
                {item.categoryName}
              </span>
            </td>
            <td className="px-4 py-3 text-sm text-gray-700">{item.brandName}</td>
            <td className="px-4 py-3 text-sm text-gray-700 text-right tabular-nums">{item.unitsSold}</td>
            <td className="px-4 py-3 font-bold text-gray-900 text-sm text-right tabular-nums">₹{item.revenue.toLocaleString()}</td>
            <td className="px-4 py-3 font-bold text-[var(--primary-dark)] text-sm text-right tabular-nums">₹{item.profit.toFixed(2)}</td>
            <td className="px-4 py-3 text-sm text-gray-700 text-right tabular-nums">{item.avgDiscountPercent.toFixed(2)}%</td>
            <td className="px-4 py-3 text-sm text-gray-700 text-right tabular-nums">{item.ordersCount}</td>
            <td className="px-4 py-3">
              <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--primary-dark)] rounded-full"
                  style={{ width: `${Math.min(100, (item.revenue / maxRevenue) * 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-400">{share.toFixed(1)}%</span>
            </td>
          </tr>
        );
      });
    }

    if (activeTab === "category") {
      return (data as CategorySalesRow[]).map((item) => {
        const share = summary.totalRevenue > 0 ? (item.revenue / summary.totalRevenue) * 100 : 0;
        return (
          <tr key={item._id || item.categoryName} className="hover:bg-gray-50 transition-colors">
            <td className="px-4 py-3 text-sm font-semibold text-gray-900">{item.categoryName}</td>
            <td className="px-4 py-3 text-sm text-gray-700 text-right tabular-nums">{item.unitsSold}</td>
            <td className="px-4 py-3 font-bold text-gray-900 text-sm text-right tabular-nums">₹{item.revenue.toLocaleString()}</td>
            <td className="px-4 py-3 font-bold text-[var(--primary-dark)] text-sm text-right tabular-nums">₹{item.profit.toFixed(2)}</td>
            <td className="px-4 py-3 text-sm text-gray-700 text-right tabular-nums">{item.distinctProducts}</td>
            <td className="px-4 py-3 text-sm text-gray-700 text-right tabular-nums">{item.ordersCount}</td>
            <td className="px-4 py-3 text-sm text-gray-700 text-right tabular-nums">{share.toFixed(1)}%</td>
          </tr>
        );
      });
    }

    if (activeTab === "location") {
      return (data as LocationSalesRow[]).map((item, idx) => (
        <tr key={`${item.city}-${item.state}-${idx}`} className="hover:bg-gray-50 transition-colors">
          <td className="px-4 py-3 text-sm font-semibold text-gray-900">{item.city}</td>
          <td className="px-4 py-3 text-sm text-gray-700">{item.state || "N/A"}</td>
          <td className="px-4 py-3 text-sm text-gray-700 text-right tabular-nums">{item.unitsSold}</td>
          <td className="px-4 py-3 font-bold text-gray-900 text-sm text-right tabular-nums">₹{item.revenue.toLocaleString()}</td>
          <td className="px-4 py-3 text-sm text-gray-700 text-right tabular-nums">{item.ordersCount}</td>
          <td className="px-4 py-3 text-sm text-gray-700 text-right tabular-nums">{item.distinctCustomers}</td>
        </tr>
      ));
    }

    return (data as CustomerSalesRow[]).map((item) => (
      <tr key={item._id} className="hover:bg-gray-50 transition-colors">
        <td className="px-4 py-3 text-sm font-semibold text-gray-900">{item.customerName}</td>
        <td className="px-4 py-3 text-sm text-gray-700">{item.customerPhone}</td>
        <td className="px-4 py-3 text-sm text-gray-700 text-right tabular-nums">{item.unitsSold}</td>
        <td className="px-4 py-3 font-bold text-gray-900 text-sm text-right tabular-nums">₹{item.revenue.toLocaleString()}</td>
        <td className="px-4 py-3 text-sm text-gray-700 text-right tabular-nums">{item.ordersCount}</td>
        <td className="px-4 py-3 text-sm text-gray-700 text-right tabular-nums">₹{item.avgOrderValue.toFixed(2)}</td>
        <td className="px-4 py-3 text-sm text-gray-700">
          {item.lastPurchaseDate ? new Date(item.lastPurchaseDate).toLocaleDateString() : "N/A"}
        </td>
      </tr>
    ));
  };

  // Compact stat row used inside the mobile card layout - keeps each card
  // scannable without needing horizontal scroll on small screens.
  const Stat = ({ label, value, emphasize }: { label: string; value: React.ReactNode; emphasize?: boolean }) => (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-sm ${emphasize ? "font-bold text-gray-900" : "text-gray-700"}`}>{value}</p>
    </div>
  );

  const renderMobileCards = () => {
    if (activeTab === "product") {
      const maxRevenue = Math.max(...(data as ProductSalesRow[]).map(r => r.revenue), 1);
      return (data as ProductSalesRow[]).map((item, idx) => {
        const rank = (pagination.page - 1) * pagination.limit + idx + 1;
        return (
          <div key={item._id} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <span className={`shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black ${
                  rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                  rank === 2 ? 'bg-gray-200 text-gray-700' :
                  rank === 3 ? 'bg-orange-100 text-orange-700' :
                  'bg-gray-50 text-gray-400'
                }`}>
                  {rank}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{item.productName}</p>
                  <p className="text-xs text-gray-500">{item.sku}</p>
                </div>
              </div>
              <span className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-full bg-[var(--primary-alpha-20)] text-[var(--primary-darker)]">
                {item.categoryName}
              </span>
            </div>
            <div className="mt-3 w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-[var(--primary-dark)] rounded-full" style={{ width: `${Math.min(100, (item.revenue / maxRevenue) * 100)}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Stat label="Units" value={item.unitsSold} />
              <Stat label="Revenue" value={`₹${item.revenue.toLocaleString()}`} emphasize />
              <Stat label="Profit" value={`₹${item.profit.toFixed(2)}`} />
              <Stat label="Brand" value={item.brandName} />
              <Stat label="Disc %" value={`${item.avgDiscountPercent.toFixed(2)}%`} />
              <Stat label="Orders" value={item.ordersCount} />
            </div>
          </div>
        );
      });
    }

    if (activeTab === "category") {
      return (data as CategorySalesRow[]).map((item) => {
        const share = summary.totalRevenue > 0 ? (item.revenue / summary.totalRevenue) * 100 : 0;
        return (
          <div key={item._id || item.categoryName} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <p className="text-sm font-semibold text-gray-900">{item.categoryName}</p>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Stat label="Units" value={item.unitsSold} />
              <Stat label="Revenue" value={`₹${item.revenue.toLocaleString()}`} emphasize />
              <Stat label="Profit" value={`₹${item.profit.toFixed(2)}`} />
              <Stat label="Products" value={item.distinctProducts} />
              <Stat label="Orders" value={item.ordersCount} />
              <Stat label="Share" value={`${share.toFixed(1)}%`} />
            </div>
          </div>
        );
      });
    }

    if (activeTab === "location") {
      return (data as LocationSalesRow[]).map((item, idx) => (
        <div key={`${item.city}-${item.state}-${idx}`} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-900">{item.city}{item.state ? `, ${item.state}` : ""}</p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Stat label="Units" value={item.unitsSold} />
            <Stat label="Revenue" value={`₹${item.revenue.toLocaleString()}`} emphasize />
            <Stat label="Orders" value={item.ordersCount} />
            <Stat label="Customers" value={item.distinctCustomers} />
          </div>
        </div>
      ));
    }

    return (data as CustomerSalesRow[]).map((item) => (
      <div key={item._id} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-900">{item.customerName}</p>
        <p className="text-xs text-gray-500">{item.customerPhone}</p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Stat label="Units" value={item.unitsSold} />
          <Stat label="Revenue" value={`₹${item.revenue.toLocaleString()}`} emphasize />
          <Stat label="Orders" value={item.ordersCount} />
          <Stat label="Avg Order" value={`₹${item.avgOrderValue.toFixed(2)}`} />
          <Stat label="Last Purchase" value={item.lastPurchaseDate ? new Date(item.lastPurchaseDate).toLocaleDateString() : "N/A"} />
        </div>
      </div>
    ));
  };

  return (
    <div className="p-3 sm:p-6 bg-gray-50 min-h-screen">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Most Selling Products</h1>
            <p className="text-sm text-gray-500 mt-1">Best-selling products, ranked by category, location and customer</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={downloadExcel}
              className="flex-1 sm:flex-none justify-center px-4 py-2 bg-[var(--primary-dark)] text-white rounded-xl font-semibold hover:bg-[var(--primary-darker)] transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Excel
            </button>

            <button
              onClick={downloadPDF}
              className="flex-1 sm:flex-none justify-center px-4 py-2 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              PDF
            </button>
          </div>
        </div>

        <div className="mt-4 flex gap-2 border-b border-gray-100 pb-4 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab.key
                  ? 'bg-[var(--primary-dark)] text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2 bg-gray-50 p-2 rounded-lg overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-2 sm:flex-wrap">
          {(['today', 'tomorrow', 'last7days', 'last30days', 'alltime'] as DateFilterType[]).map((type) => (
            <button
              key={type}
              onClick={() => handleDateFilterChange(type)}
              className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
                dateFilterType === type
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}>
              {type === 'last7days' ? 'Last 7 Days' : type === 'last30days' ? 'Last 30 Days' : type === 'alltime' ? 'All Time' : type}
            </button>
          ))}
          <button
            onClick={() => handleDateFilterChange('custom')}
            className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              dateFilterType === 'custom'
                ? 'bg-[var(--primary-dark)] text-white shadow-sm'
                : 'text-[var(--primary-dark)] hover:bg-[var(--primary-alpha-10)]'
            }`}>
            Custom
          </button>
        </div>

        {showCustomDatePicker && (
          <div className="mt-4 p-4 bg-[var(--primary-alpha-10)] rounded-lg border border-teal-200 animate-in fade-in slide-in-from-top-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Start Date</label>
                <input
                  type="date"
                  value={customDateRange.start}
                  onChange={(e) => setCustomDateRange({ ...customDateRange, start: e.target.value })}
                  className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:border-[var(--primary-color)] focus:ring-2 focus:ring-teal-200 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">End Date</label>
                <input
                  type="date"
                  value={customDateRange.end}
                  onChange={(e) => setCustomDateRange({ ...customDateRange, end: e.target.value })}
                  className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:border-[var(--primary-color)] focus:ring-2 focus:ring-teal-200 outline-none transition-all"
                />
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5 px-1">Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={
                activeTab === "product" ? "Search by product name or SKU..." :
                activeTab === "category" ? "Search by category..." :
                activeTab === "location" ? "Search by city or state..." :
                "Search by customer name..."
              }
              className="w-full px-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:border-pink-500 focus:ring-2 focus:ring-pink-200 outline-none transition-all shadow-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 px-1">Show per page</label>
            <select
              value={pagination.limit}
              onChange={(e) => setPagination(prev => ({ ...prev, limit: Number(e.target.value), page: 1 }))}
              className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:border-pink-500 focus:ring-2 focus:ring-pink-200 outline-none transition-all"
            >
              {[10, 20, 50, 100, 500].map(val => (
                <option key={val} value={val}>{val}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all">
          <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider">Total Units Sold</p>
          <p className="text-lg sm:text-2xl font-black text-gray-800 mt-2">
            {loading ? <span className="inline-block h-6 w-16 bg-gray-100 rounded animate-pulse" /> : summary.totalUnits.toLocaleString()}
          </p>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all">
          <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider">Total Revenue</p>
          <p className="text-lg sm:text-2xl font-black text-[var(--primary-dark)] mt-2">
            {loading ? <span className="inline-block h-6 w-20 bg-gray-100 rounded animate-pulse" /> : `₹${summary.totalRevenue.toLocaleString()}`}
          </p>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all">
          <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider">Total Profit</p>
          <p className="text-lg sm:text-2xl font-black text-orange-600 mt-2">
            {loading ? <span className="inline-block h-6 w-20 bg-gray-100 rounded animate-pulse" /> : `₹${summary.totalProfit.toLocaleString()}`}
          </p>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all">
          <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider">Top Product</p>
          <p className="text-sm sm:text-lg font-black text-[var(--primary-dark)] mt-2 truncate" title={summary.topProductName}>
            {loading ? <span className="inline-block h-6 w-24 bg-gray-100 rounded animate-pulse" /> : summary.topProductName}
          </p>
        </div>
      </div>

      {/* Desktop / tablet: full table */}
      <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 sticky top-0 z-10">
              {renderTableHead()}
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={colSpan} className="px-6 py-16">
                    <div className="flex flex-col items-center justify-center gap-3 text-gray-500">
                      <Spinner />
                      <span className="text-sm italic">Fetching product sales data...</span>
                    </div>
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="px-6 py-12 text-center text-gray-400 font-medium italic">
                    No sales data found
                  </td>
                </tr>
              ) : renderTableRows()}
            </tbody>
          </table>
        </div>

        {pagination.pages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
            <div className="text-sm text-gray-500">
              Showing page <span className="font-semibold">{pagination.page}</span> of <span className="font-semibold">{pagination.pages}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                disabled={pagination.page === 1}
                className="px-3 py-1 bg-white border border-gray-300 rounded shadow-sm disabled:opacity-50">
                Previous
              </button>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: Math.min(pagination.pages, prev.page + 1) }))}
                disabled={pagination.page === pagination.pages}
                className="px-3 py-1 bg-white border border-gray-300 rounded shadow-sm disabled:opacity-50">
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile: stacked cards */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 py-16 flex flex-col items-center justify-center gap-3 text-gray-500">
            <Spinner />
            <span className="text-sm italic">Fetching product sales data...</span>
          </div>
        ) : data.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 py-12 text-center text-gray-400 font-medium italic">
            No sales data found
          </div>
        ) : (
          <>
            {renderMobileCards()}
            {pagination.pages > 1 && (
              <div className="px-4 py-3 rounded-2xl border border-gray-100 bg-white flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  Page <span className="font-semibold">{pagination.page}</span>/<span className="font-semibold">{pagination.pages}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                    disabled={pagination.page === 1}
                    className="px-3 py-1 bg-white border border-gray-300 rounded shadow-sm disabled:opacity-50">
                    Previous
                  </button>
                  <button
                    onClick={() => setPagination(prev => ({ ...prev, page: Math.min(pagination.pages, prev.page + 1) }))}
                    disabled={pagination.page === pagination.pages}
                    className="px-3 py-1 bg-white border border-gray-300 rounded shadow-sm disabled:opacity-50">
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AdminProductSalesReport;
