import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, PieChart, TrendingUp, Calendar, Download, Filter } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../utils/cn';
import { toast } from '../../utils/toast';

/**
 * Reports Page
 * Analytics and reporting for biller performance
 * Includes charts, metrics, and export functionality
 */
const Reports = () => {
  const { user } = useAuth();

  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [reportType, setReportType] = useState('daily');

  // Mock report data
  useEffect(() => {
    const mockData = {
      summary: {
        totalSales: 1250000,
        totalBills: 245,
        avgBillValue: 5102,
        topProduct: 'Gold Necklace',
        bestDay: 'Friday'
      },
      dailySales: [
        { date: '2024-01-01', sales: 45000, bills: 8 },
        { date: '2024-01-02', sales: 52000, bills: 12 },
        { date: '2024-01-03', sales: 38000, bills: 6 },
        // Add more days...
      ],
      categorySales: [
        { category: 'Gold Jewelry', sales: 650000, percentage: 52 },
        { category: 'Silver Jewelry', sales: 350000, percentage: 28 },
        { category: 'Diamond Jewelry', sales: 200000, percentage: 16 },
        { category: 'Other', sales: 50000, percentage: 4 }
      ],
      paymentMethods: [
        { method: 'Cash', amount: 750000, count: 180 },
        { method: 'Card', amount: 400000, count: 55 },
        { method: 'UPI', amount: 100000, count: 10 }
      ],
      salesperson: [
        { name: 'Ahmed Raza', assignedSales: 850000, paidSales: 500000, pendingSales: 350000, commissionEarned: 15000, commissionPending: 10500, itemsSold: 120, billsInvolved: 45 },
        { name: 'Usman', assignedSales: 400000, paidSales: 400000, pendingSales: 0, commissionEarned: 12000, commissionPending: 0, itemsSold: 40, billsInvolved: 15 }
      ]
    };

    setTimeout(() => {
      setReportData(mockData);
      setLoading(false);
    }, 1000);
  }, [dateRange, reportType]);

  const handleExport = (format) => {
    toast.info(`${format.toUpperCase()} export coming soon`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0805] flex items-center justify-center">
        <div className="text-amber-500">Loading reports...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0805] text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-amber-500 mb-2">Reports & Analytics</h1>
          <p className="text-gray-400">Performance insights and sales analytics</p>
        </div>

        {/* Filters */}
        <div className="bg-[#1a1208] border border-[#2a1f0d] rounded-lg p-6 mb-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Date Range
              </label>
              <div className="flex space-x-2">
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="px-3 py-2 bg-[#120d06] border border-[#2a1f0d] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="px-3 py-2 bg-[#120d06] border border-[#2a1f0d] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Report Type
              </label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="px-3 py-2 bg-[#120d06] border border-[#2a1f0d] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => handleExport('pdf')}
                className="flex items-center space-x-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>PDF</span>
              </button>
              <button
                onClick={() => handleExport('csv')}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>CSV</span>
              </button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#1a1208] border border-[#2a1f0d] rounded-lg p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-amber-500">
                  Rs. {reportData.summary.totalSales.toLocaleString('en-IN')}
                </div>
                <div className="text-gray-400">Total Sales</div>
              </div>
              <TrendingUp className="w-8 h-8 text-amber-500" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-[#1a1208] border border-[#2a1f0d] rounded-lg p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-amber-500">
                  {reportData.summary.totalBills}
                </div>
                <div className="text-gray-400">Total Bills</div>
              </div>
              <BarChart3 className="w-8 h-8 text-amber-500" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-[#1a1208] border border-[#2a1f0d] rounded-lg p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-amber-500">
                  Rs. {reportData.summary.avgBillValue.toLocaleString('en-IN')}
                </div>
                <div className="text-gray-400">Avg Bill Value</div>
              </div>
              <PieChart className="w-8 h-8 text-amber-500" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-[#1a1208] border border-[#2a1f0d] rounded-lg p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-amber-500">
                  {reportData.summary.topProduct}
                </div>
                <div className="text-gray-400">Top Product</div>
              </div>
              <Calendar className="w-8 h-8 text-amber-500" />
            </div>
          </motion.div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Daily Sales Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-[#1a1208] border border-[#2a1f0d] rounded-lg p-6"
          >
            <h3 className="text-lg font-semibold text-white mb-4">Daily Sales Trend</h3>
            <div className="h-64 flex items-end justify-between space-x-2">
              {reportData.dailySales.slice(0, 7).map((day, index) => (
                <div key={day.date} className="flex-1 flex flex-col items-center">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${(day.sales / 60000) * 100}%` }}
                    transition={{ delay: 0.5 + index * 0.1, duration: 0.5 }}
                    className="w-full bg-gradient-to-t from-amber-600 to-amber-500 rounded-t mb-2 min-h-[20px]"
                  />
                  <div className="text-xs text-gray-400 transform -rotate-45">
                    {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Category Sales */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-[#1a1208] border border-[#2a1f0d] rounded-lg p-6"
          >
            <h3 className="text-lg font-semibold text-white mb-4">Sales by Category</h3>
            <div className="space-y-4">
              {reportData.categorySales.map((category, index) => (
                <motion.div
                  key={category.category}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + index * 0.1 }}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <span className="text-gray-300">{category.category}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-medium">
                      Rs. {category.sales.toLocaleString('en-IN')}
                    </div>
                    <div className="text-xs text-gray-400">
                      {category.percentage}%
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Payment Methods */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-[#1a1208] border border-[#2a1f0d] rounded-lg p-6"
          >
            <h3 className="text-lg font-semibold text-white mb-4">Payment Methods</h3>
            <div className="space-y-4">
              {reportData.paymentMethods.map((payment, index) => (
                <motion.div
                  key={payment.method}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7 + index * 0.1 }}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <div className={cn(
                      "w-3 h-3 rounded-full",
                      payment.method === 'Cash' ? "bg-green-500" :
                      payment.method === 'Card' ? "bg-blue-500" : "bg-purple-500"
                    )} />
                    <span className="text-gray-300">{payment.method}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-medium">
                      Rs. {payment.amount.toLocaleString('en-IN')}
                    </div>
                    <div className="text-xs text-gray-400">
                      {payment.count} bills
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Performance Insights */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="bg-[#1a1208] border border-[#2a1f0d] rounded-lg p-6"
          >
            <h3 className="text-lg font-semibold text-white mb-4">Performance Insights</h3>
            <div className="space-y-4">
              <div className="p-4 bg-[#120d06] rounded-lg">
                <div className="text-amber-500 font-medium mb-1">Best Performing Day</div>
                <div className="text-white">{reportData.summary.bestDay}</div>
                <div className="text-sm text-gray-400">Highest sales volume</div>
              </div>

              <div className="p-4 bg-[#120d06] rounded-lg">
                <div className="text-amber-500 font-medium mb-1">Peak Hours</div>
                <div className="text-white">2:00 PM - 6:00 PM</div>
                <div className="text-sm text-gray-400">Most active period</div>
              </div>

              <div className="p-4 bg-[#120d06] rounded-lg">
                <div className="text-amber-500 font-medium mb-1">Conversion Rate</div>
                <div className="text-white">85%</div>
                <div className="text-sm text-gray-400">Bills per customer visit</div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Detailed Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="bg-[#1a1208] border border-[#2a1f0d] rounded-lg overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-[#2a1f0d]">
            <h3 className="text-lg font-semibold text-white">Detailed Sales Data</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#0f0a04] border-b border-[#2a1f0d]">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Date</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Bills</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-gray-300">Sales</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-gray-300">Avg Bill</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a1f0d]">
                {reportData.dailySales.map((day, index) => (
                  <motion.tr
                    key={day.date}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.9 + index * 0.05 }}
                    className="hover:bg-[#2a1f0d] transition-colors"
                  >
                    <td className="px-6 py-4 text-sm text-white">
                      {new Date(day.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-300">
                      {day.bills}
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-medium text-amber-500">
                      Rs. {day.sales.toLocaleString('en-IN')}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-300">
                      Rs. {(day.sales / day.bills).toLocaleString('en-IN')}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Salesperson Report */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="bg-[#1a1208] border border-[#2a1f0d] rounded-lg overflow-hidden mt-8"
        >
          <div className="px-6 py-4 border-b border-[#2a1f0d] flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Salesperson Performance</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#0f0a04] border-b border-[#2a1f0d]">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Salesperson</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-gray-300">Bills</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-gray-300">Items</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-gray-300">Assigned Sales</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-gray-300">Paid Sales</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-gray-300">Pending Sales</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-emerald-500">Comm. Earned</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-amber-500">Comm. Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a1f0d]">
                {reportData.salesperson.map((sp, index) => (
                  <motion.tr
                    key={sp.name}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.0 + index * 0.05 }}
                    className="hover:bg-[#2a1f0d] transition-colors"
                  >
                    <td className="px-6 py-4 text-sm text-white font-medium">{sp.name}</td>
                    <td className="px-6 py-4 text-sm text-right text-gray-300">{sp.billsInvolved}</td>
                    <td className="px-6 py-4 text-sm text-right text-gray-300">{sp.itemsSold}</td>
                    <td className="px-6 py-4 text-sm text-right text-white">Rs. {sp.assignedSales.toLocaleString('en-IN')}</td>
                    <td className="px-6 py-4 text-sm text-right text-emerald-400">Rs. {sp.paidSales.toLocaleString('en-IN')}</td>
                    <td className="px-6 py-4 text-sm text-right text-amber-500">Rs. {sp.pendingSales.toLocaleString('en-IN')}</td>
                    <td className="px-6 py-4 text-sm text-right font-bold text-emerald-500">Rs. {sp.commissionEarned.toLocaleString('en-IN')}</td>
                    <td className="px-6 py-4 text-sm text-right font-bold text-amber-500">Rs. {sp.commissionPending.toLocaleString('en-IN')}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Reports;