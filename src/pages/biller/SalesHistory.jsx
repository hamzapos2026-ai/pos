import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Search, Filter, Download, Eye, Receipt } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../utils/cn';
import { toast } from '../../utils/toast';

/**
 * Sales History Page
 * Shows completed bills for the current biller user
 * Includes filtering, search, and export functionality
 */
const SalesHistory = () => {
  const { user } = useAuth();

  const [bills, setBills] = useState([]);
  const [filteredBills, setFilteredBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
    end: new Date().toISOString().split('T')[0]
  });
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedBill, setSelectedBill] = useState(null);

  // Mock data - would come from IndexedDB/Firebase
  useEffect(() => {
    const mockBills = [
      {
        id: 'BILL-WIN-M5K3-1XY2Z-A1B2',
        date: '2024-01-15',
        time: '14:30',
        customer: 'Ahmad Khan',
        phone: '03001234567',
        items: 3,
        total: 25800,
        status: 'completed',
        paymentMethod: 'cash'
      },
      {
        id: 'BILL-WIN-M5K3-2ABC3-D4EF',
        date: '2024-01-14',
        time: '16:45',
        customer: 'Sara Ahmed',
        phone: '03009876543',
        items: 2,
        total: 45600,
        status: 'completed',
        paymentMethod: 'card'
      },
      // Add more mock bills...
    ];

    setTimeout(() => {
      setBills(mockBills);
      setFilteredBills(mockBills);
      setLoading(false);
    }, 1000);
  }, []);

  // Filter bills
  useEffect(() => {
    let filtered = bills.filter(bill => {
      const matchesSearch = !searchTerm ||
        bill.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        bill.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        bill.phone.includes(searchTerm);

      const matchesStatus = statusFilter === 'all' || bill.status === statusFilter;

      const billDate = new Date(bill.date);
      const startDate = new Date(dateRange.start);
      const endDate = new Date(dateRange.end);
      const matchesDate = billDate >= startDate && billDate <= endDate;

      return matchesSearch && matchesStatus && matchesDate;
    });

    setFilteredBills(filtered);
  }, [bills, searchTerm, statusFilter, dateRange]);

  // Calculate summary
  const summary = filteredBills.reduce(
    (acc, bill) => ({
      total: acc.total + bill.total,
      count: acc.count + 1,
      avg: 0 // Will be calculated after
    }),
    { total: 0, count: 0, avg: 0 }
  );
  summary.avg = summary.count > 0 ? summary.total / summary.count : 0;

  const handleExport = () => {
    // Mock export - would generate CSV
    toast.info('Export feature coming soon');
  };

  const handleViewBill = (bill) => {
    setSelectedBill(bill);
  };

  const handleReprint = (bill) => {
    toast.info(`Reprinting bill ${bill.id}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0805] flex items-center justify-center">
        <div className="text-amber-500">Loading sales history...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0805] text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-amber-500 mb-2">Sales History</h1>
          <p className="text-gray-400">View and manage your completed bills</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#1a1208] border border-[#2a1f0d] rounded-lg p-6"
          >
            <div className="text-2xl font-bold text-amber-500">
              Rs. {summary.total.toLocaleString('en-IN')}
            </div>
            <div className="text-gray-400">Total Sales</div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-[#1a1208] border border-[#2a1f0d] rounded-lg p-6"
          >
            <div className="text-2xl font-bold text-amber-500">
              {summary.count}
            </div>
            <div className="text-gray-400">Total Bills</div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-[#1a1208] border border-[#2a1f0d] rounded-lg p-6"
          >
            <div className="text-2xl font-bold text-amber-500">
              Rs. {summary.avg.toLocaleString('en-IN')}
            </div>
            <div className="text-gray-400">Average Bill</div>
          </motion.div>
        </div>

        {/* Filters */}
        <div className="bg-[#1a1208] border border-[#2a1f0d] rounded-lg p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search bills..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#120d06] border border-[#2a1f0d] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Date Range */}
            <div className="flex space-x-2">
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="flex-1 px-3 py-2 bg-[#120d06] border border-[#2a1f0d] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="flex-1 px-3 py-2 bg-[#120d06] border border-[#2a1f0d] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-[#120d06] border border-[#2a1f0d] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>

            {/* Export */}
            <button
              onClick={handleExport}
              className="flex items-center justify-center space-x-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
          </div>
        </div>

        {/* Bills Table */}
        <div className="bg-[#1a1208] border border-[#2a1f0d] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#0f0a04] border-b border-[#2a1f0d]">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Bill ID</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Date</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Customer</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Items</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-gray-300">Total</th>
                  <th className="px-6 py-4 text-center text-sm font-medium text-gray-300">Status</th>
                  <th className="px-6 py-4 text-center text-sm font-medium text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a1f0d]">
                {filteredBills.map((bill, index) => (
                  <motion.tr
                    key={bill.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="hover:bg-[#2a1f0d] transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-mono text-amber-500">
                      {bill.id}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-300">
                      {bill.date} {bill.time}
                    </td>
                    <td className="px-6 py-4 text-sm text-white">
                      {bill.customer}
                      {bill.phone && (
                        <div className="text-xs text-gray-400">{bill.phone}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-300">
                      {bill.items}
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-medium text-amber-500">
                      Rs. {bill.total.toLocaleString('en-IN')}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={cn(
                        "inline-flex px-2 py-1 text-xs font-medium rounded-full",
                        bill.status === 'completed'
                          ? "bg-green-500/10 text-green-500"
                          : "bg-red-500/10 text-red-500"
                      )}>
                        {bill.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center space-x-2">
                      <button
                        onClick={() => handleViewBill(bill)}
                        className="p-1 text-gray-400 hover:text-amber-500 transition-colors"
                        title="View Bill"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleReprint(bill)}
                        className="p-1 text-gray-400 hover:text-amber-500 transition-colors"
                        title="Reprint"
                      >
                        <Receipt className="w-4 h-4" />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredBills.length === 0 && (
            <div className="text-center py-12">
              <Receipt className="w-12 h-12 text-gray-500 mx-auto mb-4" />
              <div className="text-gray-400">No bills found</div>
            </div>
          )}
        </div>

        {/* Bill Detail Modal */}
        {selectedBill && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-[#1a1208] border border-[#2a1f0d] rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-white">Bill Details</h3>
                  <p className="text-sm text-gray-400">{selectedBill.id}</p>
                </div>
                <button
                  onClick={() => setSelectedBill(null)}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Date:</span>
                    <span className="text-white ml-2">{selectedBill.date} {selectedBill.time}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Customer:</span>
                    <span className="text-white ml-2">{selectedBill.customer}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Phone:</span>
                    <span className="text-white ml-2">{selectedBill.phone}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Payment:</span>
                    <span className="text-white ml-2">{selectedBill.paymentMethod}</span>
                  </div>
                </div>

                <div className="border-t border-[#2a1f0d] pt-4">
                  <div className="text-right text-lg font-bold text-amber-500">
                    Total: Rs. {selectedBill.total.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesHistory;