import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  getDeliveryBoys,
  getDeliveryPerformanceReport,
  DeliveryBoy,
  DeliveryPerformanceRow,
  DeliveryPerformanceAssignment,
  DeliveryPerformanceSummary,
} from "../../../services/api/admin/adminDeliveryService";
import { useAuth } from "../../../context/AuthContext";
import { toast } from "react-hot-toast";

type DateFilterType = 'today' | 'thisweek' | 'thismonth' | 'last7days' | 'last30days' | 'alltime' | 'custom';

const DATE_FILTER_LABELS: Record<DateFilterType, string> = {
  today: 'Today',
  thisweek: 'This Week',
  thismonth: 'This Month',
  last7days: 'Last 7 Days',
  last30days: 'Last 30 Days',
  alltime: 'All Time',
  custom: 'Custom',
};

const formatDuration = (ms: number) => {
  if (!ms || ms <= 0) return "—";
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) return `${Math.round(ms / (1000 * 60))}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
};

const AdminDeliveryPerformanceReport = () => {
  const { isAuthenticated, token } = useAuth();
  const [perDeliveryBoy, setPerDeliveryBoy] = useState<DeliveryPerformanceRow[]>([]);
  const [summary, setSummary] = useState<DeliveryPerformanceSummary | null>(null);
  const [assignments, setAssignments] = useState<DeliveryPerformanceAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>('last30days');
  const [customDateRange, setCustomDateRange] = useState({ start: "", end: "" });
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const [deliveryBoys, setDeliveryBoys] = useState<DeliveryBoy[]>([]);
  const [deliveryBoyFilter, setDeliveryBoyFilter] = useState("All");
  const [pagination, setPagination] = useState({
    page: 1,
    total: 0,
    pages: 1,
    limit: 20
  });

  useEffect(() => {
    if (isAuthenticated && token) {
      fetchReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAuthenticated, pagination.page, pagination.limit, dateFilterType, customDateRange, deliveryBoyFilter]);

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    getDeliveryBoys({ status: 'Active', limit: 100 })
      .then((response) => {
        if (response.success && response.data) setDeliveryBoys(response.data);
      })
      .catch(() => {});
  }, [isAuthenticated, token]);

  const buildDateParams = () => {
    const params: any = {};
    const now = new Date();
    if (dateFilterType === 'today') {
      params.dateFrom = new Date(now.setHours(0, 0, 0, 0)).toISOString();
      params.dateTo = new Date(now.setHours(23, 59, 59, 999)).toISOString();
    } else if (dateFilterType === 'thisweek') {
      const d = new Date();
      const day = d.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      d.setDate(d.getDate() - diffToMonday);
      d.setHours(0, 0, 0, 0);
      params.dateFrom = d.toISOString();
    } else if (dateFilterType === 'thismonth') {
      const d = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      params.dateFrom = d.toISOString();
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
    return params;
  };

  const fetchReport = async () => {
    try {
      setLoading(true);
      const params: any = {
        page: pagination.page,
        limit: pagination.limit,
        deliveryBoyId: deliveryBoyFilter !== "All" ? deliveryBoyFilter : undefined,
        ...buildDateParams(),
      };

      const response = await getDeliveryPerformanceReport(params);
      if (response.success && response.data) {
        setPerDeliveryBoy(response.data.perDeliveryBoy || []);
        setSummary(response.data.summary || null);
        setAssignments(response.data.assignments || []);
        if (response.pagination) {
          setPagination(prev => ({
            ...prev,
            total: response.pagination!.total,
            pages: response.pagination!.pages
          }));
        }
      }
    } catch (error) {
      console.error("Error fetching delivery performance report:", error);
      toast.error("Failed to load delivery performance data");
    } finally {
      setLoading(false);
    }
  };

  const handleDateFilterChange = (type: DateFilterType) => {
    setDateFilterType(type);
    if (type === 'custom') setShowCustomDatePicker(true);
    else setShowCustomDatePicker(false);
  };

  const downloadExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(perDeliveryBoy.map(row => ({
      "Delivery Boy": row.name || "Unknown",
      "Mobile": row.mobile || "",
      "Assigned": row.assigned,
      "Delivered": row.delivered,
      "Failed": row.failed,
      "Cancelled": row.cancelled,
      "Avg Duration": formatDuration(row.avgDurationMs),
      "On-Time %": row.onTimePercent !== null ? row.onTimePercent.toFixed(1) : "N/A",
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Delivery Performance");
    XLSX.writeFile(workbook, `Delivery_Performance_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const downloadPDF = () => {
    const doc = new jsPDF('portrait');
    doc.setFontSize(18);
    doc.text('Delivery Performance Report', 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22);

    const tableData = perDeliveryBoy.map(row => [
      row.name || "Unknown",
      row.mobile || "",
      row.assigned.toString(),
      row.delivered.toString(),
      row.failed.toString(),
      row.cancelled.toString(),
      formatDuration(row.avgDurationMs),
      row.onTimePercent !== null ? `${row.onTimePercent.toFixed(1)}%` : "N/A",
    ]);

    autoTable(doc, {
      head: [['Delivery Boy', 'Mobile', 'Assigned', 'Delivered', 'Failed', 'Cancelled', 'Avg Duration', 'On-Time %']],
      body: tableData,
      startY: 28,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [79, 70, 229] }
    });

    doc.save(`Delivery_Performance_Report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-black text-gray-900">Delivery Performance Report</h1>
              <p className="text-xs text-gray-500 font-bold mt-0.5">Track on-time delivery, average duration, and per-delivery-boy throughput</p>
            </div>

            <div className="flex flex-wrap gap-2 text-white">
              <button
                onClick={downloadExcel}
                className="inline-flex items-center px-5 py-2 bg-emerald-600 font-black text-xs rounded-lg hover:bg-emerald-700 active:scale-95 transition-all shadow-sm">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
                </svg>
                Excel
              </button>

              <button
                onClick={downloadPDF}
                className="inline-flex items-center px-5 py-2 bg-rose-600 font-black text-xs rounded-lg hover:bg-rose-700 active:scale-95 transition-all shadow-sm">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 21h10a2 2 0 0 0 2-2V9.414a1 1 0 0 0-.293-.707l-5.414-5.414A1 1 0 0 0 12.586 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z" />
                </svg>
                PDF
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-100">
            {(['today', 'thisweek', 'thismonth', 'last7days', 'last30days', 'alltime', 'custom'] as DateFilterType[]).map((type) => (
              <button
                key={type}
                onClick={() => handleDateFilterChange(type as DateFilterType)}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  dateFilterType === type
                    ? 'bg-white text-[var(--primary-dark)] shadow-sm border border-gray-100'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                }`}>
                {DATE_FILTER_LABELS[type]}
              </button>
            ))}

            <div className="h-4 w-px bg-gray-200 mx-1 hidden sm:block"></div>

            <button
              onClick={fetchReport}
              className="p-1.5 text-[var(--primary-dark)] hover:bg-[var(--primary-alpha-10)] rounded-lg transition-all"
              title="Refresh Data">
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          {showCustomDatePicker && (
            <div className="mt-4 p-4 bg-[var(--primary-alpha-10)]/30 rounded-2xl border border-indigo-100 flex gap-4 animate-slide-left">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-indigo-400 uppercase ml-1 tracking-widest">START DATE</label>
                <input type="date" value={customDateRange.start} onChange={(e) => setCustomDateRange({ ...customDateRange, start: e.target.value })} className="px-3 py-1.5 bg-white rounded-lg border border-indigo-200 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-[var(--primary-color)] transition-all shadow-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-indigo-400 uppercase ml-1 tracking-widest">END DATE</label>
                <input type="date" value={customDateRange.end} onChange={(e) => setCustomDateRange({ ...customDateRange, end: e.target.value })} className="px-3 py-1.5 bg-white rounded-lg border border-indigo-200 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-[var(--primary-color)] transition-all shadow-sm" />
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-col md:flex-row gap-4">
            <select
              value={deliveryBoyFilter}
              onChange={(e) => setDeliveryBoyFilter(e.target.value)}
              className="px-4 py-2.5 bg-white border border-gray-100 rounded-xl text-sm font-black text-gray-700 outline-none focus:border-[var(--primary-color)] transition-all min-w-[180px]">
              <option value="All">All Delivery Boys</option>
              {deliveryBoys.map(d => (
                <option key={d._id} value={d._id}>{d.name} - {d.mobile}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
        {/* Summary tiles */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
            {[
              { label: "Assigned", value: summary.assigned },
              { label: "Delivered", value: summary.delivered },
              { label: "Failed", value: summary.failed },
              { label: "Cancelled", value: summary.cancelled },
              { label: "Avg Duration", value: formatDuration(summary.avgDurationMs) },
              { label: "On-Time %", value: summary.onTimePercent !== null ? `${summary.onTimePercent.toFixed(1)}%` : "N/A" },
            ].map((tile) => (
              <div key={tile.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{tile.label}</p>
                <p className="text-xl font-black text-gray-900">{tile.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Per-delivery-boy comparison table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-black text-gray-900">Per-Delivery-Boy Comparison</h2>
          </div>
          <div className="overflow-x-auto custom-scrollbar scrollbar-hide">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Delivery Boy</th>
                  <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Assigned</th>
                  <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Delivered</th>
                  <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Failed</th>
                  <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Cancelled</th>
                  <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Avg Duration</th>
                  <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">On-Time %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center">
                      <div className="w-10 h-10 border-4 border-[var(--primary-color)] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                      <p className="text-gray-400 font-black text-[10px] uppercase tracking-[0.2em]">Loading delivery data...</p>
                    </td>
                  </tr>
                ) : perDeliveryBoy.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-16 text-center text-gray-400 font-black italic tracking-widest uppercase text-[10px]">No delivery assignments found</td></tr>
                ) : (
                  perDeliveryBoy.map((row) => (
                    <tr key={row.deliveryBoyId} className="hover:bg-[var(--primary-alpha-10)]/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-900 text-xs">{row.name || "Unknown"}</span>
                          <span className="text-[10px] font-black text-gray-400 tracking-wider font-mono">{row.mobile}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-black text-gray-900 text-sm">{row.assigned}</td>
                      <td className="px-4 py-4 font-black text-emerald-600 text-sm">{row.delivered}</td>
                      <td className="px-4 py-4 font-black text-rose-600 text-sm">{row.failed}</td>
                      <td className="px-4 py-4 font-black text-gray-500 text-sm">{row.cancelled}</td>
                      <td className="px-4 py-4 font-bold text-gray-700 text-xs">{formatDuration(row.avgDurationMs)}</td>
                      <td className="px-4 py-4">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black ${row.onTimePercent === null ? 'bg-gray-100 text-gray-400' : row.onTimePercent >= 90 ? 'bg-emerald-100 text-emerald-700' : row.onTimePercent >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                          {row.onTimePercent !== null ? `${row.onTimePercent.toFixed(1)}%` : "N/A"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Assignment drill-down table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-black text-gray-900">Assignment Drill-Down</h2>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest min-w-fit">Show</label>
              <select
                value={pagination.limit}
                onChange={(e) => setPagination(prev => ({ ...prev, limit: parseInt(e.target.value), page: 1 }))}
                className="px-3 py-2 bg-white border border-gray-100 rounded-xl text-sm font-black text-gray-700 outline-none focus:border-[var(--primary-color)] transition-all min-w-[80px]">
                {[10, 20, 50, 100].map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto custom-scrollbar scrollbar-hide">
            <table className="w-full text-sm min-w-[1100px]">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Order</th>
                  <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Delivery Boy</th>
                  <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Type</th>
                  <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Status</th>
                  <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Assigned At</th>
                  <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Delivered At</th>
                  <th className="px-6 py-4 text-right text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center">
                      <div className="w-10 h-10 border-4 border-[var(--primary-color)] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                    </td>
                  </tr>
                ) : assignments.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-16 text-center text-gray-400 font-black italic tracking-widest uppercase text-[10px]">No assignments found</td></tr>
                ) : (
                  assignments.map((a) => (
                    <tr key={a._id} className="hover:bg-[var(--primary-alpha-10)]/30 transition-colors">
                      <td className="px-6 py-4">
                        {a.order?._id ? (
                          <Link to={`/admin/orders/${a.order._id}`} className="text-[var(--primary-dark)] font-black hover:underline underline-offset-4 decoration-2">
                            #{a.order?.orderNumber || a.order._id.slice(-6)}
                          </Link>
                        ) : (
                          <span className="text-gray-400 font-bold text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-900 text-xs">{a.deliveryBoy?.name || "—"}</span>
                          <span className="text-[10px] font-black text-gray-400 font-mono">{a.deliveryBoy?.mobile}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="px-3 py-1 bg-gray-100 rounded-lg text-[10px] font-black text-gray-500 uppercase tracking-widest">{a.assignmentType}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${a.status === 'Delivered' ? 'bg-emerald-100 text-emerald-700' : a.status === 'Failed' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-bold text-gray-500 text-xs">{a.assignedAt ? new Date(a.assignedAt).toLocaleString() : "—"}</td>
                      <td className="px-4 py-4 font-bold text-gray-500 text-xs">{a.deliveredAt ? new Date(a.deliveredAt).toLocaleString() : "—"}</td>
                      <td className="px-6 py-4 text-right">
                        {a.order?._id && (
                          <Link to={`/admin/orders/${a.order._id}`} className="px-4 py-2 bg-white border border-gray-100 text-[var(--primary-dark)] rounded-xl text-[10px] font-black hover:bg-[var(--primary-dark)] hover:text-white hover:border-[var(--primary-dark)] transition-all active:scale-95 shadow-sm">Details</Link>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
            <div className="text-xs font-black text-gray-400 uppercase tracking-widest">
              Showing <span className="text-[var(--primary-dark)]">{assignments.length}</span> of <span className="text-[var(--primary-dark)]">{pagination.total}</span> Assignments
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={pagination.page === 1}
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                className="p-2 border border-gray-100 rounded-xl hover:bg-gray-50 disabled:opacity-30 transition-all font-black text-[var(--primary-dark)]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M15 18l-6-6 6-6"/></svg>
              </button>

              <div className="flex items-center gap-1">
                {[...Array(pagination.pages)].map((_, i) => {
                  const p = i + 1;
                  if (pagination.pages > 7) {
                    if (p !== 1 && p !== pagination.pages && Math.abs(p - pagination.page) > 1) {
                      if (p === 2 || p === pagination.pages - 1) return <span key={p} className="px-1 text-gray-300">...</span>;
                      return null;
                    }
                  }
                  return (
                    <button
                      key={p}
                      onClick={() => setPagination(prev => ({ ...prev, page: p }))}
                      className={`w-9 h-9 flex items-center justify-center rounded-xl text-xs font-black transition-all ${pagination.page === p ? 'bg-[var(--primary-dark)] text-white shadow-lg shadow-indigo-200' : 'hover:bg-[var(--primary-alpha-10)] text-gray-500'}`}>
                      {p}
                    </button>
                  );
                })}
              </div>

              <button
                disabled={pagination.page === pagination.pages}
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                className="p-2 border border-gray-100 rounded-xl hover:bg-gray-50 disabled:opacity-30 transition-all font-black text-[var(--primary-dark)]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDeliveryPerformanceReport;
