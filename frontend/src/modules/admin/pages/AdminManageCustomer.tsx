import { useState, useMemo, useEffect } from "react";
import {
  getAllCustomers,
  getCustomerById,
  updateCustomer,
  type Customer,
} from "../../../services/api/admin/adminCustomerService";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";

type SortField =
  | "id"
  | "name"
  | "email"
  | "phone"
  | "registrationDate"
  | "status"
  | "totalOrders"
  | "totalSpent";
type SortDirection = "asc" | "desc";

export default function AdminManageCustomer() {
  const { isAuthenticated, token } = useAuth();
  const { showToast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [totalServerPages, setTotalServerPages] = useState(1);
  const [dateRange, setDateRange] = useState("");
  const [statusFilter, setStatusFilter] = useState<"Active" | "Inactive" | undefined>(
    undefined
  );
  const [entriesPerPage, setEntriesPerPage] = useState("10");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewCustomer, setViewCustomer] = useState<Customer | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [editForm, setEditForm] = useState({
    name: "", email: "", phone: "", address: "", city: "", state: "", pincode: "", gst: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Fetch customers on component mount
  useEffect(() => {
    if (!isAuthenticated || !token) {
      setLoading(false);
      return;
    }

    const fetchCustomers = async () => {
      try {
        setLoading(true);
        setError(null);

        const params: {
          page: number;
          limit: number;
          status?: "Active" | "Inactive";
          search?: string;
        } = {
          page: currentPage,
          limit: parseInt(entriesPerPage),
        };

        if (statusFilter) {
          params.status = statusFilter;
        }

        if (searchQuery) {
          params.search = searchQuery;
        }

        const response = await getAllCustomers(params);
        if (response.success) {
          setCustomers(response.data);
          setTotalCustomers(response.pagination?.total ?? response.data.length);
          setTotalServerPages(response.pagination?.pages ?? 1);
        }
      } catch (err) {
        console.error("Error fetching customers:", err);
        if (err && typeof err === "object" && "response" in err) {
          const axiosError = err as {
            response?: { data?: { message?: string } };
          };
          setError(
            axiosError.response?.data?.message ||
            "Failed to load customers. Please try again."
          );
        } else {
          setError("Failed to load customers. Please try again.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchCustomers();
  }, [
    isAuthenticated,
    token,
    currentPage,
    entriesPerPage,
    statusFilter,
    searchQuery,
  ]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const filteredAndSortedCustomers = useMemo(() => {
    let filtered = [...customers];

    if (sortField) {
      filtered = [...filtered].sort((a, b) => {
        let aValue: string | number;
        let bValue: string | number;

        switch (sortField) {
          case "id":
            aValue = a._id || "";
            bValue = b._id || "";
            break;
          case "name":
            aValue = a.name || "";
            bValue = b.name || "";
            break;
          case "email":
            aValue = a.email || "";
            bValue = b.email || "";
            break;
          case "phone":
            aValue = a.phone || "";
            bValue = b.phone || "";
            break;
          case "registrationDate":
            aValue = a.registrationDate || "";
            bValue = b.registrationDate || "";
            break;
          case "status":
            aValue = a.status || "";
            bValue = b.status || "";
            break;
          case "totalOrders":
            aValue = a.totalOrders || 0;
            bValue = b.totalOrders || 0;
            break;
          case "totalSpent":
            aValue = a.totalSpent || 0;
            bValue = b.totalSpent || 0;
            break;
          default:
            return 0;
        }

        if (typeof aValue === 'string') {
          aValue = (aValue as string).toLowerCase();
        }
        if (typeof bValue === 'string') {
          bValue = (bValue as string).toLowerCase();
        }

        if (sortDirection === "asc") {
          return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
        } else {
          return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
        }
      });
    }

    return filtered;
  }, [customers, sortField, sortDirection]);

  // The server already returns one page of results (see fetchCustomers),
  // so `customers` IS the current page - only sort client-side here, don't
  // re-slice/re-paginate an already-paginated batch.
  const totalPages = totalServerPages;
  const startIndex = (currentPage - 1) * Number(entriesPerPage);
  const endIndex = startIndex + filteredAndSortedCustomers.length;
  const displayedCustomers = filteredAndSortedCustomers;

  const handleExport = () => {
    const headers = [
      "ID",
      "Name",
      "Email",
      "Phone",
      "Registration Date",
      "Status",
      "Ref Code",
      "Wallet Amount",
      "Total Orders",
      "Total Spent",
    ];
    const csvContent = [
      headers.join(","),
      ...filteredAndSortedCustomers.map((customer) =>
        [
          customer._id.slice(-6),
          customer.name,
          customer.email,
          customer.phone,
          customer.registrationDate
            ? new Date(customer.registrationDate).toLocaleString()
            : "",
          customer.status,
          customer.refCode,
          customer.totalOrders,
          customer.totalSpent.toFixed(2),
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `customers_${new Date().toISOString().split("T")[0]}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const SortIcon = ({ field }: { field: SortField }) => (
    <span className="text-neutral-300 text-[10px]">
      {sortField === field ? (sortDirection === "asc" ? "↑" : "↓") : "⇅"}
    </span>
  );

  const handleViewCustomer = async (id: string) => {
    setViewLoading(true);
    setViewCustomer(null);
    try {
      const response = await getCustomerById(id);
      if (response.success) {
        setViewCustomer(response.data);
      } else {
        showToast(response.message || "Failed to load customer", "error");
      }
    } catch (err) {
      console.error("Error fetching customer:", err);
      showToast("Failed to load customer details", "error");
    } finally {
      setViewLoading(false);
    }
  };

  const handleOpenEdit = (customer: Customer) => {
    setEditError(null);
    setEditCustomer(customer);
    setEditForm({
      name: customer.name || "",
      email: customer.email || "",
      phone: customer.phone || "",
      address: customer.address || "",
      city: customer.city || "",
      state: customer.state || "",
      pincode: customer.pincode || "",
      gst: customer.gst || "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editCustomer) return;
    if (!editForm.name.trim() || !editForm.phone.trim()) {
      setEditError("Name and phone are required");
      return;
    }

    setEditSaving(true);
    setEditError(null);
    try {
      const response = await updateCustomer(editCustomer._id, editForm);
      if (response.success) {
        showToast("Customer updated successfully", "success");
        setCustomers((prev) =>
          prev.map((c) => (c._id === editCustomer._id ? response.data : c))
        );
        setEditCustomer(null);
      } else {
        setEditError(response.message || "Failed to update customer");
      }
    } catch (err) {
      console.error("Error updating customer:", err);
      if (err && typeof err === "object" && "response" in err) {
        const axiosError = err as { response?: { data?: { message?: string } } };
        setEditError(axiosError.response?.data?.message || "Failed to update customer");
      } else {
        setEditError("Failed to update customer");
      }
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white px-4 sm:px-6 py-4 border-b border-neutral-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-neutral-900">
              Manage Customer
            </h1>
          </div>
          <div className="text-sm text-neutral-600">
            <span className="text-[var(--primary-color)]">Home</span> /{" "}
            <span className="text-neutral-900">Manage Customer</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-neutral-50">
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
          {/* Filters */}
          <div className="p-4 sm:p-6 border-b border-neutral-200 bg-neutral-50">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Date Range
                </label>
                <input
                  type="text"
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  placeholder="MM/DD/YYYY - MM/DD/YYYY"
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)] focus:border-[var(--primary-color)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Status
                </label>
                <select
                  value={statusFilter || "All"}
                  onChange={(e) => {
                    const val = e.target.value;
                    setStatusFilter(val === "All" ? undefined : (val as "Active" | "Inactive"));
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)] focus:border-[var(--primary-color)] bg-white">
                  <option value="All">All</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Show
                </label>
                <select
                  value={entriesPerPage}
                  onChange={(e) => {
                    setEntriesPerPage(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)] focus:border-[var(--primary-color)] bg-white">
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleExport}
                  className="w-full bg-[var(--primary-color)] hover:bg-[#e076a4] text-white px-4 py-2 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2">
                  Export
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="p-4 sm:p-6 border-b border-neutral-200">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">
                Search:
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-14 pr-3 py-2 bg-neutral-100 border-none rounded text-sm focus:ring-1 focus:ring-[var(--primary-color)]"
                placeholder="Search by name, email, phone, or ref code..."
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-50 text-xs font-bold text-neutral-800">
                  <th
                    className="p-4 border border-neutral-200 cursor-pointer hover:bg-neutral-100 transition-colors"
                    onClick={() => handleSort("id")}>
                    <div className="flex items-center justify-between">
                      ID <SortIcon field="id" />
                    </div>
                  </th>
                  <th
                    className="p-4 border border-neutral-200 cursor-pointer hover:bg-neutral-100 transition-colors"
                    onClick={() => handleSort("name")}>
                    <div className="flex items-center justify-between">
                      Name <SortIcon field="name" />
                    </div>
                  </th>
                  <th
                    className="p-4 border border-neutral-200 cursor-pointer hover:bg-neutral-100 transition-colors"
                    onClick={() => handleSort("email")}>
                    <div className="flex items-center justify-between">
                      Email <SortIcon field="email" />
                    </div>
                  </th>
                  <th
                    className="p-4 border border-neutral-200 cursor-pointer hover:bg-neutral-100 transition-colors"
                    onClick={() => handleSort("phone")}>
                    <div className="flex items-center justify-between">
                      Phone <SortIcon field="phone" />
                    </div>
                  </th>
                  <th
                    className="p-4 border border-neutral-200 cursor-pointer hover:bg-neutral-100 transition-colors"
                    onClick={() => handleSort("registrationDate")}>
                    <div className="flex items-center justify-between">
                      Registration Date <SortIcon field="registrationDate" />
                    </div>
                  </th>
                  <th
                    className="p-4 border border-neutral-200 cursor-pointer hover:bg-neutral-100 transition-colors"
                    onClick={() => handleSort("status")}>
                    <div className="flex items-center justify-between">
                      Status <SortIcon field="status" />
                    </div>
                  </th>
                  <th className="p-4 border border-neutral-200">Ref Code</th>
                  <th
                    className="p-4 border border-neutral-200 cursor-pointer hover:bg-neutral-100 transition-colors"
                    onClick={() => handleSort("totalOrders")}>
                    <div className="flex items-center justify-between">
                      Total Orders <SortIcon field="totalOrders" />
                    </div>
                  </th>
                  <th
                    className="p-4 border border-neutral-200 cursor-pointer hover:bg-neutral-100 transition-colors"
                    onClick={() => handleSort("totalSpent")}>
                    <div className="flex items-center justify-between">
                      Total Spent <SortIcon field="totalSpent" />
                    </div>
                  </th>
                  <th className="p-4 border border-neutral-200">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={11}
                      className="p-8 text-center text-neutral-400 border border-neutral-200">
                      Loading customers...
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td
                      colSpan={11}
                      className="p-8 text-center text-red-600 border border-neutral-200">
                      {error}
                    </td>
                  </tr>
                ) : displayedCustomers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={11}
                      className="p-8 text-center text-neutral-400 border border-neutral-200">
                      No customers found.
                    </td>
                  </tr>
                ) : (
                  displayedCustomers.map((customer) => (
                    <tr
                      key={customer._id}
                      className="hover:bg-neutral-50 transition-colors text-sm text-neutral-700">
                      <td className="p-4 border border-neutral-200">
                        {customer._id.slice(-6)}
                      </td>
                      <td className="p-4 border border-neutral-200">
                        {customer.name}
                      </td>
                      <td className="p-4 border border-neutral-200">
                        {customer.email}
                      </td>
                      <td className="p-4 border border-neutral-200">
                        {customer.phone}
                      </td>
                      <td className="p-4 border border-neutral-200">
                        {customer.registrationDate
                          ? new Date(customer.registrationDate).toLocaleString()
                          : "-"}
                      </td>
                      <td className="p-4 border border-neutral-200">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${customer.status === "Active"
                            ? "bg-pink-100 text-pink-700"
                            : "bg-red-100 text-red-800"
                            }`}>
                          {customer.status}
                        </span>
                      </td>
                      <td className="p-4 border border-neutral-200">
                        {customer.refCode}
                      </td>
                      <td className="p-4 border border-neutral-200">
                        {customer.totalOrders}
                      </td>
                      <td className="p-4 border border-neutral-200">
                        ₹{customer.totalSpent.toFixed(2)}
                      </td>
                      <td className="p-4 border border-neutral-200">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleViewCustomer(customer._id)}
                            className="p-1.5 bg-[var(--primary-dark)] hover:bg-[var(--primary-darker)] text-white rounded transition-colors"
                            title="View Details">
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                              <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                          </button>
                          <button
                            onClick={() => handleOpenEdit(customer)}
                            className="p-1.5 bg-[var(--primary-color)] hover:bg-[#e076a4] text-white rounded transition-colors"
                            title="Edit">
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-4 sm:px-6 py-3 border-t border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0">
            <div className="text-xs sm:text-sm text-neutral-700">
              Showing {displayedCustomers.length === 0 ? 0 : startIndex + 1} to{" "}
              {Math.min(endIndex, totalCustomers)} of{" "}
              {totalCustomers} entries
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className={`p-2 border border-[var(--primary-color)] rounded ${currentPage === 1
                  ? "text-neutral-400 cursor-not-allowed bg-neutral-50"
                  : "text-[var(--primary-color)] hover:bg-pink-50"
                  }`}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2">
                  <path d="M15 18L9 12L15 6"></path>
                </svg>
              </button>
              <button className="px-3 py-1.5 border border-[var(--primary-color)] bg-[var(--primary-color)] text-white rounded font-medium text-sm">
                {currentPage}
              </button>
              <button
                onClick={() =>
                  setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                }
                disabled={currentPage === totalPages}
                className={`p-2 border border-[var(--primary-color)] rounded ${currentPage === totalPages
                  ? "text-neutral-400 cursor-not-allowed bg-neutral-50"
                  : "text-[var(--primary-color)] hover:bg-pink-50"
                  }`}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2">
                  <path d="M9 18L15 12L9 6"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* View Details Modal */}
      {(viewLoading || viewCustomer) && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-neutral-900">Customer Details</h2>
              <button
                onClick={() => setViewCustomer(null)}
                className="text-neutral-400 hover:text-neutral-600 text-xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-6">
              {viewLoading ? (
                <div className="py-8 text-center text-neutral-400 text-sm">Loading...</div>
              ) : viewCustomer ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div className="text-neutral-500">Name</div>
                  <div className="font-medium text-neutral-900">{viewCustomer.name}</div>
                  <div className="text-neutral-500">Email</div>
                  <div className="font-medium text-neutral-900">{viewCustomer.email || "-"}</div>
                  <div className="text-neutral-500">Phone</div>
                  <div className="font-medium text-neutral-900">{viewCustomer.phone}</div>
                  <div className="text-neutral-500">Status</div>
                  <div className="font-medium text-neutral-900">{viewCustomer.status}</div>
                  <div className="text-neutral-500">Ref Code</div>
                  <div className="font-medium text-neutral-900">{viewCustomer.refCode}</div>
                  <div className="text-neutral-500">Wallet Amount</div>
                  <div className="font-medium text-neutral-900">₹{(viewCustomer.walletAmount ?? 0).toFixed(2)}</div>
                  <div className="text-neutral-500">Total Orders</div>
                  <div className="font-medium text-neutral-900">{viewCustomer.totalOrders}</div>
                  <div className="text-neutral-500">Total Spent</div>
                  <div className="font-medium text-neutral-900">₹{viewCustomer.totalSpent.toFixed(2)}</div>
                  <div className="text-neutral-500">Address</div>
                  <div className="font-medium text-neutral-900">{viewCustomer.address || "-"}</div>
                  <div className="text-neutral-500">City</div>
                  <div className="font-medium text-neutral-900">{viewCustomer.city || "-"}</div>
                  <div className="text-neutral-500">State</div>
                  <div className="font-medium text-neutral-900">{viewCustomer.state || "-"}</div>
                  <div className="text-neutral-500">Pincode</div>
                  <div className="font-medium text-neutral-900">{viewCustomer.pincode || "-"}</div>
                  <div className="text-neutral-500">GST</div>
                  <div className="font-medium text-neutral-900">{viewCustomer.gst || "-"}</div>
                  <div className="text-neutral-500">Registered</div>
                  <div className="font-medium text-neutral-900">
                    {viewCustomer.registrationDate
                      ? new Date(viewCustomer.registrationDate).toLocaleString()
                      : "-"}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {editCustomer && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-neutral-900">Edit Customer</h2>
              <button
                onClick={() => setEditCustomer(null)}
                className="text-neutral-400 hover:text-neutral-600 text-xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {editError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded p-2">
                  {editError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Address</label>
                  <input
                    type="text"
                    value={editForm.address}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, address: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">City</label>
                  <input
                    type="text"
                    value={editForm.city}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, city: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">State</label>
                  <input
                    type="text"
                    value={editForm.state}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, state: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Pincode</label>
                  <input
                    type="text"
                    value={editForm.pincode}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, pincode: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">GST</label>
                  <input
                    type="text"
                    value={editForm.gst}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, gst: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-neutral-200 flex justify-end gap-2">
              <button
                onClick={() => setEditCustomer(null)}
                className="px-4 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editSaving}
                className="px-4 py-2 text-sm font-medium text-white bg-[var(--primary-color)] hover:bg-[#e076a4] rounded transition-colors disabled:opacity-50"
              >
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
