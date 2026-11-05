import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Target, Award, Star, CheckCircle, Clock } from 'lucide-react';

export default function PerformancePage() {
  const { user } = useSelector((state) => state.auth);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReviews();
  }, []);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const res = await api.get('/performance');
      setReviews(res.data.reviews || []);
    } catch (err) {
      toast.error('Failed to load performance evaluations');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Performance & Goal Appraisals</h2>
          <p className="text-xs text-slate-500">Continuous feedback, OKRs, and manager review cycles</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {reviews.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 col-span-2 bg-white rounded-2xl border border-slate-200">
            No active performance review cycles found for this quarter.
          </div>
        ) : (
          reviews.map((rev) => (
            <div key={rev._id} className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-mono text-xs font-bold text-blue-600 block">{rev.reviewCycle}</span>
                  <h3 className="text-base font-bold text-slate-900 mt-1">
                    {rev.employeeId?.firstName} {rev.employeeId?.lastName}
                  </h3>
                  <span className="text-xs text-slate-400">{rev.employeeId?.designationId?.title || 'Staff'}</span>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-100">
                  {rev.status}
                </span>
              </div>

              {/* Goals */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <span className="text-xs font-bold text-slate-700">Appraisal Goals:</span>
                {rev.goals?.map((g, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-800">{g.title}</span>
                      <span className="text-slate-500">{g.progress}% Complete</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${g.progress}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Ratings */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-500">Manager Rating:</span>
                  <div className="flex items-center gap-1 mt-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-4 h-4 ${
                          star <= (rev.managerRating || 3) ? 'text-amber-400 fill-amber-400' : 'text-slate-200'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-slate-500">Overall Score:</span>
                  <p className="text-lg font-black text-slate-900">{rev.finalScore || '4.0'} / 5.0</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

