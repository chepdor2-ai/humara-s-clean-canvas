'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../AuthProvider';
import { FileText, Trash2, Clock, Zap, Download, Search, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';

interface Document {
  id: string;
  title: string;
  engine_used: string;
  strength: string;
  tone: string;
  input_word_count: number;
  output_word_count: number;
  input_ai_score: number | null;
  output_ai_score: number | null;
  meaning_preserved: boolean | null;
  status: string;
  created_at: string;
}

export default function DocumentsPage() {
  const { session } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/documents?page=${page}&limit=15`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      setDocuments(data.documents || []);
      setTotalPages(data.pages || 1);
      setTotal(data.total || 0);
    } catch {
      console.error('Failed to fetch documents');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, page]);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const handleDelete = async (id: string) => {
    if (!session?.access_token) return;
    setDeleting(id);
    try {
      await fetch(`/api/documents?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setDocuments(prev => prev.filter(d => d.id !== id));
      setTotal(prev => prev - 1);
    } catch {
      console.error('Failed to delete document');
    } finally {
      setDeleting(null);
    }
  };

  const exportCSV = () => {
    const headers = ['Title', 'Engine', 'Words In', 'Words Out', 'AI Score Before', 'AI Score After', 'Date'];
    const rows = documents.map(d => [
      d.title,
      d.engine_used || '',
      d.input_word_count,
      d.output_word_count || '',
      d.input_ai_score ?? '',
      d.output_ai_score ?? '',
      new Date(d.created_at).toLocaleDateString(),
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'humaragpt-documents.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredDocs = search
    ? documents.filter(d => d.title.toLowerCase().includes(search.toLowerCase()) || (d.engine_used || '').toLowerCase().includes(search.toLowerCase()))
    : documents;

  const engineLabel = (e: string) => {
    const map: Record<string, string> = {
      oxygen: 'Humara 2.0', ozone: 'Humara 2.1', easy: 'Humara 2.2',
    };
    return map[e] || e || '—';
  };

  const scoreColor = (score: number | null) => {
    if (score === null) return 'text-zinc-500';
    if (score <= 20) return 'text-emerald-600';
    if (score <= 50) return 'text-amber-600';
    return 'text-red-600';
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white">Documents</h1>
          <p className="text-sm text-zinc-400 mt-1">{total} humanized document{total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search documents..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm border border-zinc-700 rounded-lg bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-brand-500 w-56"
            />
          </div>
          <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-300 bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700 transition-colors">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RotateCcw className="w-6 h-6 text-brand-600 animate-spin" />
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="text-center py-20 bg-zinc-900 rounded-xl border border-zinc-800">
          <FileText className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-400 font-medium">No documents yet</p>
          <p className="text-sm text-zinc-500 mt-1">Humanized texts will appear here automatically.</p>
        </div>
      ) : (
        <>
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-800/50">
                    <th className="text-left px-4 py-3 font-medium text-zinc-400">Title</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-400 hidden sm:table-cell">Engine</th>
                    <th className="text-center px-4 py-3 font-medium text-zinc-400 hidden md:table-cell">Words</th>
                    <th className="text-center px-4 py-3 font-medium text-zinc-400 hidden lg:table-cell">AI Before</th>
                    <th className="text-center px-4 py-3 font-medium text-zinc-400 hidden lg:table-cell">AI After</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-400 hidden sm:table-cell">Date</th>
                    <th className="text-center px-4 py-3 font-medium text-zinc-400 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocs.map((doc) => (
                    <tr key={doc.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-zinc-500 shrink-0" />
                          <span className="font-medium text-white truncate max-w-[200px]">{doc.title}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-brand-900/30 text-brand-300">
                          <Zap className="w-3 h-3" /> {engineLabel(doc.engine_used)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-zinc-400 hidden md:table-cell">
                        {doc.input_word_count} → {doc.output_word_count || '—'}
                      </td>
                      <td className={`px-4 py-3 text-center font-medium hidden lg:table-cell ${scoreColor(doc.input_ai_score)}`}>
                        {doc.input_ai_score !== null ? `${doc.input_ai_score}%` : '—'}
                      </td>
                      <td className={`px-4 py-3 text-center font-medium hidden lg:table-cell ${scoreColor(doc.output_ai_score)}`}>
                        {doc.output_ai_score !== null ? `${doc.output_ai_score}%` : '—'}
                      </td>
                      <td className="px-4 py-3 text-zinc-400 hidden sm:table-cell">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(doc.created_at).toLocaleDateString()}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleDelete(doc.id)}
                          disabled={deleting === doc.id}
                          className="p-1.5 text-zinc-500 hover:text-red-400 rounded-lg hover:bg-red-900/20 transition-colors disabled:opacity-50"
                          title="Delete document"
                        >
                          {deleting === doc.id ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <p className="text-sm text-zinc-400">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-2 rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-40 transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-2 rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-40 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
