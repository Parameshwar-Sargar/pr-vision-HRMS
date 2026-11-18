import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import api from '../../services/api';
import useEmployeeOptions from '../../hooks/useEmployeeOptions';
import EmployeeOptionPicker from '../../components/common/EmployeeOptionPicker';
import toast from 'react-hot-toast';
import { Star, Plus, ClipboardCheck, Edit3, X } from 'lucide-react';

export default function PerformancePage() {
  const { user, employee } = useSelector((state) => state.auth);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showInitiateModal, setShowInitiateModal] = useState(false);
  const [initiateForm, setInitiateForm] = useState({
    employeeId: '',
    reviewCycle: `Q${Math.ceil((new Date().getMonth() + 1) / 3)}-${new Date().getFullYear()}`,
    goalTitle: '',
    goalWeightage: 100,
  });

  const [selfReviewTarget, setSelfReviewTarget] = useState(null);
  const [selfForm, setSelfForm] = useState({ selfRating: 4, comments: '', goals: [] });

  const [managerReviewTarget, setManagerReviewTarget] = useState(null);
  const [managerForm, setManagerForm] = useState({
    managerRating: 4,
    finalScore: 4,
    strengths: '',
    areasForImprovement: '',
    comments: '',
  });

  const canInitiate = ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'].includes(user?.role);
  const isAdminOrHR = ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'].includes(user?.role);
  const currentEmployeeId = employee?._id || user?.employeeId || null;

  const empOptions = useEmployeeOptions({
    enabled: Boolean(showInitiateModal && canInitiate),
    limit: 20,
  });

  useEffect(() => {
    const controller = new AbortController();
    fetchReviews(controller.signal);
    return () => controller.abort();
  }, [canInitiate]);

  const fetchReviews = async (signal = null) => {
    try {
      setLoading(true);
      const revRes = await api.get('/performance', { signal, cacheTtl: 15000 });
      setReviews(revRes.data?.reviews || revRes.reviews || []);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error('Failed to load performance evaluations');
    } finally {
      setLoading(false);
    }
  };

  const handleInitiateReview = async (e) => {
    e.preventDefault();
    try {
      await api.post('/performance', {
        employeeId: initiateForm.employeeId,
        reviewCycle: initiateForm.reviewCycle,
        goals: initiateForm.goalTitle
          ? [
              {
                title: initiateForm.goalTitle,
                weightage: Number(initiateForm.goalWeightage || 100),
                status: 'In Progress',
                progress: 0,
              },
            ]
          : [],
      });
      toast.success('Performance review cycle initiated!');
      setShowInitiateModal(false);
      setInitiateForm({
        employeeId: '',
        reviewCycle: `Q${Math.ceil((new Date().getMonth() + 1) / 3)}-${new Date().getFullYear()}`,
        goalTitle: '',
        goalWeightage: 100,
      });
      empOptions.clearSearch();
      fetchReviews();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to initiate review');
    }
  };

  const openSelfReviewModal = (rev) => {
    setSelfReviewTarget(rev);
    setSelfForm({
      selfRating: rev.selfRating || 4,
      comments: rev.comments || '',
      goals: (rev.goals || []).map((g) => ({ ...g })),
    });
  };

  const handleSelfReviewSubmit = async (e) => {
    e.preventDefault();
    if (!selfReviewTarget) return;
    try {
      await api.patch(`/performance/${selfReviewTarget._id}/self-review`, {
        selfRating: Number(selfForm.selfRating),
        comments: selfForm.comments,
        goals: selfForm.goals,
      });
      toast.success('Self-review submitted successfully!');
      setSelfReviewTarget(null);
      fetchReviews();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to submit self-review');
    }
  };

  const openManagerReviewModal = (rev) => {
    setManagerReviewTarget(rev);
    setManagerForm({
      managerRating: rev.managerRating || rev.selfRating || 4,
      finalScore: rev.finalScore || rev.managerRating || rev.selfRating || 4,
      strengths: rev.strengths || '',
      areasForImprovement: rev.areasForImprovement || '',
      comments: rev.comments || '',
    });
  };

  const handleManagerReviewSubmit = async (e) => {
    e.preventDefault();
    if (!managerReviewTarget) return;
    try {
      await api.patch(`/performance/${managerReviewTarget._id}/manager-review`, {
        managerRating: Number(managerForm.managerRating),
        finalScore: Number(managerForm.finalScore),
        strengths: managerForm.strengths,
        areasForImprovement: managerForm.areasForImprovement,
        comments: managerForm.comments,
      });
      toast.success('Performance evaluation completed!');
      setManagerReviewTarget(null);
      fetchReviews();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to submit evaluation');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Performance & Goal Appraisals</h2>
          <p className="text-xs text-slate-500">Continuous feedback, OKRs, and manager review cycles</p>
        </div>

        {canInitiate && (
          <button
            type="button"
            onClick={() => setShowInitiateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Initiate Review Cycle</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {reviews.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 col-span-2 bg-white rounded-2xl border border-slate-200">
              No active performance review cycles found for this quarter.
            </div>
          ) : (
            reviews.map((rev) => {
              const isOwnReview =
                (currentEmployeeId && rev.employeeId?._id === currentEmployeeId) ||
                (user?.email && rev.employeeId?.email === user.email) ||
                !canInitiate;
              const canSubmitManager = canInitiate && rev.status !== 'Completed' && (!isOwnReview || isAdminOrHR);
              const canSubmitSelf = isOwnReview && rev.status !== 'Completed';

              return (
                <div key={rev._id} className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-xs font-bold text-blue-600 block">{rev.reviewCycle}</span>
                      <h3 className="text-base font-bold text-slate-900 mt-1">
                        {rev.employeeId?.firstName} {rev.employeeId?.lastName}
                      </h3>
                      <span className="text-xs text-slate-400">{rev.employeeId?.designationId?.title || 'Staff'}</span>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${
                        rev.status === 'Completed'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : rev.status === 'Manager Review Pending'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-blue-50 text-blue-700 border-blue-100'
                      }`}
                    >
                      {rev.status}
                    </span>
                  </div>

                  {/* Goals */}
                  <div className="space-y-3 pt-3 border-t border-slate-100">
                    <span className="text-xs font-bold text-slate-700">Appraisal Goals:</span>
                    {!rev.goals || rev.goals.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic">No goals defined yet.</p>
                    ) : (
                      rev.goals.map((g, idx) => (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-semibold text-slate-800">{g.title}</span>
                            <span className="text-slate-500">{g.progress || 0}% Complete</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5">
                            <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${g.progress || 0}%` }}></div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Ratings */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-500">Manager Rating:</span>
                      {rev.managerRating ? (
                        <div className="flex items-center gap-1 mt-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`w-4 h-4 ${
                                star <= rev.managerRating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'
                              }`}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
                          Self Rating: {rev.selfRating ? `${rev.selfRating} / 5` : 'Pending'}
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      <span className="text-slate-500">Overall Score:</span>
                      <p className="text-lg font-black text-slate-900">
                        {rev.finalScore ? `${rev.finalScore} / 5.0` : 'Pending'}
                      </p>
                    </div>
                  </div>

                  {(canSubmitSelf || canSubmitManager) && (
                    <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                      {canSubmitSelf && (
                        <button
                          type="button"
                          onClick={() => openSelfReviewModal(rev)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Submit Self-Review</span>
                        </button>
                      )}
                      {canSubmitManager && (
                        <button
                          type="button"
                          onClick={() => openManagerReviewModal(rev)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold"
                        >
                          <ClipboardCheck className="w-3.5 h-3.5" />
                          <span>Complete Evaluation</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Initiate Review Cycle Modal */}
      {showInitiateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Initiate Performance Review</h3>
              <button type="button" onClick={() => setShowInitiateModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleInitiateReview} className="mt-4 space-y-3 text-xs">
              <EmployeeOptionPicker
                mode="single"
                required
                label="Employee *"
                emptyOptionLabel="Select Employee"
                value={initiateForm.employeeId}
                onChange={(employeeId) => setInitiateForm((prev) => ({ ...prev, employeeId }))}
                employeeOptions={empOptions}
              />
              <div>
                <label className="block font-bold text-slate-700">Review Cycle *</label>
                <input
                  type="text"
                  required
                  value={initiateForm.reviewCycle}
                  onChange={(e) => setInitiateForm({ ...initiateForm, reviewCycle: e.target.value })}
                  placeholder="e.g. Q4-2026"
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block font-bold text-slate-700">Primary Goal / OKR</label>
                  <input
                    type="text"
                    value={initiateForm.goalTitle}
                    onChange={(e) => setInitiateForm({ ...initiateForm, goalTitle: e.target.value })}
                    placeholder="e.g. Deliver Q4 Roadmap"
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700">Weight (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={initiateForm.goalWeightage}
                    onChange={(e) => setInitiateForm({ ...initiateForm, goalWeightage: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowInitiateModal(false)}
                  className="px-3 py-1.5 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white rounded-lg font-bold">
                  Initiate Review
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Employee Self-Review Modal */}
      {selfReviewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Self-Review ({selfReviewTarget.reviewCycle})</h3>
              <button type="button" onClick={() => setSelfReviewTarget(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSelfReviewSubmit} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700">Self Rating (1 to 5)</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  step="0.5"
                  required
                  value={selfForm.selfRating}
                  onChange={(e) => setSelfForm({ ...selfForm, selfRating: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              {selfForm.goals.map((g, idx) => (
                <div key={idx} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-semibold text-slate-800">{g.title}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500">Progress %:</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={g.progress || 0}
                      onChange={(e) => {
                        const next = [...selfForm.goals];
                        next[idx] = { ...next[idx], progress: Number(e.target.value) };
                        setSelfForm({ ...selfForm, goals: next });
                      }}
                      className="w-20 px-2 py-1 border border-slate-300 rounded"
                    />
                  </div>
                </div>
              ))}
              <div>
                <label className="block font-bold text-slate-700">Achievements / Comments</label>
                <textarea
                  rows={3}
                  value={selfForm.comments}
                  onChange={(e) => setSelfForm({ ...selfForm, comments: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelfReviewTarget(null)}
                  className="px-3 py-1.5 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white rounded-lg font-bold">
                  Submit Self-Review
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manager Evaluation Modal */}
      {managerReviewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                Evaluate {managerReviewTarget.employeeId?.firstName} {managerReviewTarget.employeeId?.lastName}
              </h3>
              <button type="button" onClick={() => setManagerReviewTarget(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleManagerReviewSubmit} className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700">Manager Rating (1-5)</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    step="0.5"
                    required
                    value={managerForm.managerRating}
                    onChange={(e) => setManagerForm({ ...managerForm, managerRating: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700">Final Score (1-5)</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    step="0.1"
                    required
                    value={managerForm.finalScore}
                    onChange={(e) => setManagerForm({ ...managerForm, finalScore: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700">Key Strengths</label>
                <input
                  type="text"
                  value={managerForm.strengths}
                  onChange={(e) => setManagerForm({ ...managerForm, strengths: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700">Areas for Improvement</label>
                <input
                  type="text"
                  value={managerForm.areasForImprovement}
                  onChange={(e) => setManagerForm({ ...managerForm, areasForImprovement: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700">Manager Remarks</label>
                <textarea
                  rows={2}
                  value={managerForm.comments}
                  onChange={(e) => setManagerForm({ ...managerForm, comments: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setManagerReviewTarget(null)}
                  className="px-3 py-1.5 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg font-bold">
                  Finalize Evaluation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

