import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import api, { downloadAuthenticatedFile } from '../../services/api';
import { toast } from 'react-hot-toast';
import {
  Receipt,
  Plus,
  Download,
} from 'lucide-react';

const getInitialClaimState = () => ({
  title: '',
  category: 'Travel',
  amount: '',
  date: new Date().toISOString().split('T')[0],
  description: '',
});

export default function ExpensesPage() {
  const { user } = useSelector((state) => state.auth);
  const [claims, setClaims] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showApplyModal, setShowApplyModal] = useState(false);

  const [newClaim, setNewClaim] = useState(getInitialClaimState);
  const [receiptFile, setReceiptFile] = useState(null);

  const canApprove = ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'PAYROLL_ADMIN', 'MANAGER'].includes(user?.role);
  const canReimburse = ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'PAYROLL_ADMIN'].includes(user?.role);
  const isAdminOrHR = ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER'].includes(user?.role);

  const resetClaimForm = () => {
    setNewClaim(getInitialClaimState());
    setReceiptFile(null);
  };

  const fetchClaims = async (showSpinner = false, signal = null) => {
    if (showSpinner) setIsLoading(true);
    try {
      const res = await api.get('/expenses', { signal, cacheTtl: 10000 });
      setClaims(res.data?.claims || res.claims || []);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error('Failed to load expense claims.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchClaims(true, controller.signal);
    return () => controller.abort();
  }, []);

  const handleSubmitClaim = async (e) => {
    e.preventDefault();
    try {
      let payload = newClaim;
      let config = {};
      if (receiptFile) {
        const formData = new FormData();
        formData.append('title', newClaim.title);
        formData.append('category', newClaim.category);
        formData.append('amount', String(newClaim.amount));
        formData.append('date', newClaim.date);
        formData.append('description', newClaim.description || '');
        formData.append('receipt', receiptFile);
        payload = formData;
        config = { headers: { 'Content-Type': 'multipart/form-data' } };
      }

      const res = await api.post('/expenses', payload, config);
      const created = res?.data?.claim || res?.claim;
      if (created) {
        setClaims((prev) => [created, ...prev]);
      }
      toast.success('Expense claim submitted successfully!');
      resetClaimForm();
      setShowApplyModal(false);
      fetchClaims(false);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to submit claim.');
    }
  };

  const handleReview = async (claimId, status) => {
    try {
      setClaims((prev) => prev.map((c) => (c._id === claimId ? { ...c, status } : c)));
      await api.patch(`/expenses/${claimId}/review`, { status });
      toast.success(`Claim ${status.toLowerCase()}!`);
      fetchClaims(false);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to update status.');
      fetchClaims(false);
    }
  };

  const handleDownloadReceipt = async (claim) => {
    try {
      const safeTitle = (claim.title || 'expense-receipt').replace(/[^a-zA-Z0-9._-]+/g, '-');
      const rawName = claim.receiptUrl ? String(claim.receiptUrl).replace(/^receipt:/, '') : '';
      const extMatch = rawName.match(/\.[a-zA-Z0-9]+$/);
      const filename = `${safeTitle}${extMatch ? extMatch[0] : ''}`;
      await downloadAuthenticatedFile(`/expenses/${claim._id}/receipt`, filename);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to download receipt.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Receipt className="w-6 h-6 text-emerald-600" />
            <span>Expenses & Reimbursements</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Submit business claims, track approvals, and manage company expense reimbursements.
          </p>
        </div>

        <button
          onClick={() => setShowApplyModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Expense Claim</span>
        </button>
      </div>

      {/* Claims List Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
            <tr>
              <th className="py-3 px-4">Claim Title</th>
              <th className="py-3 px-4">Employee</th>
              <th className="py-3 px-4">Category</th>
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-4">Amount</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {claims.map((c) => (
              <tr key={c._id} className="hover:bg-slate-50">
                <td className="py-3 px-4 font-semibold text-slate-900">
                  {c.title}
                  {c.description && <div className="text-[11px] text-slate-400 font-normal">{c.description}</div>}
                </td>
                <td className="py-3 px-4">
                  {c.employeeId?.firstName} {c.employeeId?.lastName}
                  <div className="text-[10px] text-slate-400">{c.employeeId?.employeeId}</div>
                </td>
                <td className="py-3 px-4">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                    {c.category}
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-500">
                  {new Date(c.date).toLocaleDateString()}
                </td>
                <td className="py-3 px-4 font-black text-slate-900">
                  ₹ {c.amount?.toLocaleString('en-IN')}
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      c.status === 'Approved' || c.status === 'Reimbursed'
                        ? 'bg-emerald-100 text-emerald-800'
                        : c.status === 'Rejected'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {c.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-right space-x-2">
                  {c.receiptUrl && (
                    <button
                      type="button"
                      onClick={() => handleDownloadReceipt(c)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-slate-900"
                    >
                      <Download className="w-3 h-3" />
                      <span>Receipt</span>
                    </button>
                  )}
                  {canApprove && c.status === 'Pending' && (isAdminOrHR || c.employeeId?._id !== user?.employeeId) && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleReview(c._id, 'Approved')}
                        className="text-[11px] font-bold text-emerald-600 hover:text-emerald-800"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReview(c._id, 'Rejected')}
                        className="text-[11px] font-bold text-rose-600 hover:text-rose-800"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {canReimburse && c.status === 'Approved' && (isAdminOrHR || c.employeeId?._id !== user?.employeeId) && (
                    <button
                      type="button"
                      onClick={() => handleReview(c._id, 'Reimbursed')}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800"
                    >
                      Mark Reimbursed
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {claims.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  No expense claims found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Apply Modal */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h2 className="text-base font-bold text-slate-900 mb-4">File Expense Claim</h2>
            <form onSubmit={handleSubmitClaim} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700">Claim Title</label>
                <input
                  required
                  type="text"
                  value={newClaim.title}
                  onChange={(e) => setNewClaim({ ...newClaim, title: e.target.value })}
                  placeholder="e.g. Client Dinner with ACME Corp"
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700">Category</label>
                  <select
                    value={newClaim.category}
                    onChange={(e) => setNewClaim({ ...newClaim, category: e.target.value })}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    <option value="Travel">Travel</option>
                    <option value="Food & Dining">Food & Dining</option>
                    <option value="Lodging / Accommodation">Lodging</option>
                    <option value="Transport & Fuel">Transport & Fuel</option>
                    <option value="Office Supplies">Office Supplies</option>
                    <option value="Client Entertainment">Client Entertainment</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700">Amount (INR)</label>
                  <input
                    required
                    type="number"
                    min="1"
                    value={newClaim.amount}
                    onChange={(e) => setNewClaim({ ...newClaim, amount: e.target.value })}
                    placeholder="2500"
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700">Date of Expense</label>
                <input
                  required
                  type="date"
                  value={newClaim.date}
                  onChange={(e) => setNewClaim({ ...newClaim, date: e.target.value })}
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700">Description</label>
                <textarea
                  rows={3}
                  value={newClaim.description}
                  onChange={(e) => setNewClaim({ ...newClaim, description: e.target.value })}
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2"
                  placeholder="Details of expense..."
                />
              </div>

              <div>
                <label className="font-bold text-slate-700">Receipt Attachment (Optional)</label>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                  className="mt-1 w-full border border-slate-300 rounded-lg p-1.5 text-[11px] bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowApplyModal(false);
                    resetClaimForm();
                  }}
                  className="px-4 py-2 border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg"
                >
                  Submit Claim
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

