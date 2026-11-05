import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  DollarSign,
  FileText,
  Download,
  Play,
  CheckCircle,
  Building2,
  Calendar,
  X,
  Plus,
} from 'lucide-react';

export default function PayrollPage() {
  const { user } = useSelector((state) => state.auth);
  const [runs, setRuns] = useState([]);
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);

  // Run modal
  const [showRunModal, setShowRunModal] = useState(false);
  const [runMonth, setRunMonth] = useState(new Date().getMonth() + 1);
  const [runYear, setRunYear] = useState(new Date().getFullYear());
  const [processing, setProcessing] = useState(false);

  const isAdminOrHR = user?.role === 'ADMIN' || user?.role === 'COMPANY_ADMIN' || user?.role === 'HR_MANAGER' || user?.role === 'PAYROLL_ADMIN';

  useEffect(() => {
    fetchPayrollData();
  }, []);

  const fetchPayrollData = async () => {
    try {
      setLoading(true);
      const [runsRes, payslipsRes] = await Promise.all([
        isAdminOrHR ? api.get('/payroll/runs') : Promise.resolve({ data: { runs: [] } }),
        api.get('/payroll/payslips'),
      ]);
      setRuns(runsRes.data.runs || []);
      setPayslips(payslipsRes.data.payslips || []);
    } catch (err) {
      toast.error('Failed to load payroll data');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateRun = async (e) => {
    e.preventDefault();
    try {
      setProcessing(true);
      const res = await api.post('/payroll/runs/generate', {
        month: runMonth,
        year: runYear,
      });
      toast.success(res.message);
      setShowRunModal(false);
      fetchPayrollData();
    } catch (err) {
      toast.error(err.message || 'Payroll processing failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleMarkPaid = async (runId) => {
    try {
      await api.patch(`/payroll/runs/${runId}/pay`);
      toast.success('Payroll run marked as Paid!');
      fetchPayrollData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDownloadPDF = async (payslipId, payslipNumber) => {
    try {
      toast.loading('Generating PDF payslip...', { id: 'pdf' });
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'}/payroll/payslips/${payslipId}/pdf`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('pr_access_token')}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to download PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${payslipNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success('Payslip downloaded!', { id: 'pdf' });
    } catch (err) {
      toast.error(err.message || 'Failed to download PDF', { id: 'pdf' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Payroll Engine & Payslips</h2>
          <p className="text-xs text-slate-500">
            Automated salary calculations, statutory compliance (PF/ESI/PT) & PDF generation
          </p>
        </div>

        {isAdminOrHR && (
          <button
            onClick={() => setShowRunModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm shadow-blue-200"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Process Monthly Payroll</span>
          </button>
        )}
      </div>

      {/* Admin/HR Payroll Batches */}
      {isAdminOrHR && runs.length > 0 && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 mb-4">Payroll Run Batches</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-y border-slate-200">
                <tr>
                  <th className="py-3 px-4">Period</th>
                  <th className="py-3 px-4">Employees</th>
                  <th className="py-3 px-4">Gross Disbursed</th>
                  <th className="py-3 px-4">Total Deductions</th>
                  <th className="py-3 px-4">Net Payout</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-50">
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {r.month} / {r.year}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-700">{r.totalEmployees} Staff</td>
                    <td className="py-3.5 px-4 text-slate-700">₹ {r.totalGrossSalary?.toLocaleString('en-IN')}</td>
                    <td className="py-3.5 px-4 text-red-600">₹ {r.totalDeductions?.toLocaleString('en-IN')}</td>
                    <td className="py-3.5 px-4 font-black text-emerald-700">
                      ₹ {r.totalNetSalary?.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          r.status === 'Paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {r.status !== 'Paid' && (
                        <button
                          onClick={() => handleMarkPaid(r._id)}
                          className="px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold"
                        >
                          Mark Paid
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payslips List */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-4">
          {isAdminOrHR ? 'Company Payslips Register' : 'My Payslips'}
        </h3>

        {loading ? (
          <div className="p-8 text-center">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        ) : payslips.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No payslips generated yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-y border-slate-200">
                <tr>
                  <th className="py-3 px-4">Payslip #</th>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Month/Year</th>
                  <th className="py-3 px-4">Gross Earnings</th>
                  <th className="py-3 px-4">Deductions</th>
                  <th className="py-3 px-4">Net Salary</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Download</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payslips.map((ps) => (
                  <tr key={ps._id} className="hover:bg-slate-50">
                    <td className="py-3.5 px-4 font-mono font-bold text-blue-700">
                      {ps.payslipNumber}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-slate-900 block">
                        {ps.employeeId?.firstName} {ps.employeeId?.lastName}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">
                        {ps.employeeId?.employeeId}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-700">
                      {ps.month} / {ps.year}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-700">
                      ₹ {ps.grossSalary?.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-red-600">
                      ₹ {ps.totalDeductions?.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3.5 px-4 font-black text-emerald-700">
                      ₹ {ps.netSalary?.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          ps.paymentStatus === 'Paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {ps.paymentStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleDownloadPDF(ps._id, ps.payslipNumber)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>PDF</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Process Payroll Modal */}
      {showRunModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Run Monthly Payroll Batch</h3>
              <button onClick={() => setShowRunModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleGenerateRun} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700">Select Month</label>
                <select
                  value={runMonth}
                  onChange={(e) => setRunMonth(parseInt(e.target.value, 10))}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {[
                    'January',
                    'February',
                    'March',
                    'April',
                    'May',
                    'June',
                    'July',
                    'August',
                    'September',
                    'October',
                    'November',
                    'December',
                  ].map((m, idx) => (
                    <option key={idx + 1} value={idx + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700">Year</label>
                <input
                  type="number"
                  value={runYear}
                  onChange={(e) => setRunYear(parseInt(e.target.value, 10))}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-blue-900 text-[11px]">
                Calculates earnings, statutory PF (12%), PT, TDS, and generates individual payslip PDFs for all active employees.
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRunModal(false)}
                  className="px-3 py-1.5 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processing}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg font-bold disabled:opacity-50"
                >
                  {processing ? 'Processing...' : 'Run Payroll'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

