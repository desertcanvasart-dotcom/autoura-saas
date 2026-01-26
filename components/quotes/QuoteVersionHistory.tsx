'use client';

import { useState, useEffect } from 'react';
import { History, RotateCcw, Eye, AlertCircle, Clock, User } from 'lucide-react';

interface QuoteVersion {
  id: string;
  version_number: number;
  is_current: boolean;
  changed_by: string | null;
  changed_at: string;
  change_reason: string | null;
  change_summary: string | null;
  changes_diff: any;
  users?: { email: string } | null;
}

interface QuoteVersionHistoryProps {
  quoteType: 'b2c' | 'b2b';
  quoteId: string;
  onRevert?: () => void;
}

export default function QuoteVersionHistory({
  quoteType,
  quoteId,
  onRevert
}: QuoteVersionHistoryProps) {
  const [versions, setVersions] = useState<QuoteVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reverting, setReverting] = useState<number | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<QuoteVersion | null>(null);
  const [showVersionData, setShowVersionData] = useState(false);

  useEffect(() => {
    fetchVersions();
  }, [quoteType, quoteId]);

  const fetchVersions = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/quotes/${quoteType}/${quoteId}/versions`);
      const data = await response.json();

      if (data.success) {
        setVersions(data.versions);
      } else {
        setError(data.error || 'Failed to load version history');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleRevert = async (versionNumber: number) => {
    if (!confirm(`Are you sure you want to revert to version ${versionNumber}? This will create a new version with the old data.`)) {
      return;
    }

    try {
      setReverting(versionNumber);
      const response = await fetch(`/api/quotes/${quoteType}/${quoteId}/versions/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version_number: versionNumber,
          revert_reason: `Reverted to version ${versionNumber} via UI`
        })
      });

      const data = await response.json();

      if (data.success) {
        alert(`Successfully reverted to version ${versionNumber}`);
        await fetchVersions(); // Refresh version list
        if (onRevert) onRevert(); // Callback to refresh parent quote data
      } else {
        alert(`Revert failed: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error reverting: ${err.message}`);
    } finally {
      setReverting(null);
    }
  };

  const handleViewVersion = async (version: QuoteVersion) => {
    try {
      const response = await fetch(
        `/api/quotes/${quoteType}/${quoteId}/versions/${version.version_number}`
      );
      const data = await response.json();

      if (data.success) {
        setSelectedVersion(data.version);
        setShowVersionData(true);
      } else {
        alert(`Failed to load version: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error loading version: ${err.message}`);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-red-800">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <History className="w-5 h-5" />
          Version History
        </h3>
        <span className="text-sm text-gray-500">
          {versions.length} version{versions.length !== 1 ? 's' : ''}
        </span>
      </div>

      {versions.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          No version history available
        </div>
      ) : (
        <div className="space-y-3">
          {versions.map((version) => (
            <div
              key={version.id}
              className={`border rounded-lg p-4 ${
                version.is_current
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold text-lg">
                      Version {version.version_number}
                    </span>
                    {version.is_current && (
                      <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                        Current
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span>{formatDate(version.changed_at)}</span>
                    </div>

                    {version.users?.email && (
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        <span>{version.users.email}</span>
                      </div>
                    )}

                    {version.change_reason && (
                      <div className="mt-2 text-gray-700">
                        <span className="font-medium">Reason:</span> {version.change_reason}
                      </div>
                    )}

                    {version.changes_diff && (
                      <div className="mt-2 text-xs bg-gray-100 rounded p-2">
                        <span className="font-medium">Changes:</span>{' '}
                        {Object.entries(version.changes_diff)
                          .filter(([_, changed]) => changed === true)
                          .map(([key]) => key.replace(/_/g, ' '))
                          .join(', ') || 'No changes detected'}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleViewVersion(version)}
                    className="p-2 text-blue-600 hover:bg-blue-100 rounded"
                    title="View this version"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  {!version.is_current && (
                    <button
                      onClick={() => handleRevert(version.version_number)}
                      disabled={reverting === version.version_number}
                      className="p-2 text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50"
                      title="Revert to this version"
                    >
                      {reverting === version.version_number ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                      ) : (
                        <RotateCcw className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Version Data Modal */}
      {showVersionData && selectedVersion && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl max-h-[80vh] overflow-y-auto w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">
                Version {selectedVersion.version_number} - Full Data
              </h3>
              <button
                onClick={() => setShowVersionData(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="bg-gray-100 rounded p-4 overflow-x-auto">
              <pre className="text-xs">
                {JSON.stringify(selectedVersion.quote_data, null, 2)}
              </pre>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowVersionData(false)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
