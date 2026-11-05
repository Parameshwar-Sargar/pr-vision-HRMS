import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { FileText, Upload, Download, Filter, Plus, X } from 'lucide-react';

export default function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Company Policy');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, [categoryFilter]);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const params = {};
      if (categoryFilter) params.category = categoryFilter;
      const res = await api.get('/documents', { params });
      setDocuments(res.data.documents || []);
    } catch (err) {
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.error('Please select a file to upload');
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('title', title);
      formData.append('category', category);
      formData.append('file', file);

      await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      toast.success('Document uploaded successfully!');
      setShowUploadModal(false);
      setTitle('');
      setFile(null);
      fetchDocuments();
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Document Repository</h2>
          <p className="text-xs text-slate-500">Corporate policies, contracts, employee records & forms</p>
        </div>

        <button
          onClick={() => setShowUploadModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm shadow-blue-200"
        >
          <Upload className="w-4 h-4" />
          <span>Upload Document</span>
        </button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        {['', 'Company Policy', 'Offer Letter', 'Contract', 'Tax Document', 'Other'].map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              categoryFilter === cat
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {cat || 'All Documents'}
          </button>
        ))}
      </div>

      {/* Document Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <div className="p-8 text-center col-span-3">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        ) : documents.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 col-span-3 bg-white rounded-2xl border border-slate-200">
            No documents in this category.
          </div>
        ) : (
          documents.map((doc) => (
            <div
              key={doc._id}
              className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <span className="p-2.5 rounded-xl bg-blue-50 text-blue-600 mb-2">
                    <FileText className="w-5 h-5" />
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600">
                    {doc.category}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 mt-2">{doc.title}</h3>
                <p className="text-[11px] text-slate-400 font-mono mt-1">
                  Size: {(doc.fileSize / 1024).toFixed(1)} KB
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  {new Date(doc.createdAt).toLocaleDateString()}
                </span>
                <a
                  href={`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'}/documents/${doc._id}/download`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-bold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Upload New File</h3>
              <button onClick={() => setShowUploadModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpload} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700">Document Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Employee Code of Conduct 2026"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700">Category *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Company Policy">Company Policy</option>
                  <option value="Offer Letter">Offer Letter</option>
                  <option value="Contract">Contract</option>
                  <option value="Tax Document">Tax Document</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700">Select File *</label>
                <input
                  type="file"
                  required
                  onChange={(e) => setFile(e.target.files[0])}
                  className="mt-1 block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-3 py-1.5 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg font-bold disabled:opacity-50"
                >
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

