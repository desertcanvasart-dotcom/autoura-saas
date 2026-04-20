'use client'

import { useState, useRef } from 'react'
import { Download, Upload, FileText, AlertCircle, CheckCircle, X, Loader2 } from 'lucide-react'

import { RATE_TABLE_CONFIGS } from '@/lib/bulk-rate-service'
import type { ValidationError } from '@/lib/bulk-rate-service'

interface BulkRateImportExportProps {
  tableName: string
  onImportComplete?: () => void // callback to refresh the list after import
}

interface ImportState {
  step: 'idle' | 'validating' | 'preview' | 'importing' | 'done' | 'error'
  fileName?: string
  csvData?: string
  preview?: {
    totalRows: number
    validRows: number
    invalidRows: number
    errors: ValidationError[]
    sampleData: Record<string, any>[]
  }
  result?: {
    inserted: number
    updated: number
    errors: any[]
  }
  error?: string
}

export default function BulkRateImportExport({ tableName, onImportComplete }: BulkRateImportExportProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState(false)
  const [importState, setImportState] = useState<ImportState>({ step: 'idle' })
  const [showImportModal, setShowImportModal] = useState(false)

  const config = RATE_TABLE_CONFIGS[tableName]
  if (!config) return null

  // ============================================
  // EXPORT
  // ============================================

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch(`/api/rates/bulk/export?table=${tableName}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Export failed')
      }

      // Get the CSV blob and trigger download
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${tableName}_export_${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error('Export failed:', err)
      alert(`Export failed: ${err.message}`)
    } finally {
      setExporting(false)
    }
  }

  // ============================================
  // IMPORT
  // ============================================

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.csv')) {
      setImportState({ step: 'error', error: 'Please select a CSV file' })
      setShowImportModal(true)
      return
    }

    const reader = new FileReader()
    reader.onload = async (event) => {
      const csvData = event.target?.result as string
      setImportState({ step: 'validating', fileName: file.name, csvData })
      setShowImportModal(true)

      // Dry run to validate
      try {
        const res = await fetch('/api/rates/bulk/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: tableName, csvData, dryRun: true }),
        })
        const data = await res.json()

        if (data.success) {
          setImportState({
            step: 'preview',
            fileName: file.name,
            csvData,
            preview: {
              totalRows: data.totalRows,
              validRows: data.validRows,
              invalidRows: data.invalidRows,
              errors: data.errors || [],
              sampleData: data.sampleData || [],
            },
          })
        } else {
          setImportState({
            step: 'error',
            fileName: file.name,
            error: data.error || 'Validation failed',
            preview: data.errors ? {
              totalRows: data.totalRows || 0,
              validRows: data.validRows || 0,
              invalidRows: data.invalidRows || 0,
              errors: data.errors || [],
              sampleData: [],
            } : undefined,
          })
        }
      } catch (err: any) {
        setImportState({
          step: 'error',
          fileName: file.name,
          error: err.message || 'Failed to validate CSV',
        })
      }
    }
    reader.readAsText(file)

    // Reset the input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleConfirmImport = async () => {
    if (!importState.csvData) return

    setImportState(prev => ({ ...prev, step: 'importing' }))

    try {
      const res = await fetch('/api/rates/bulk/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: tableName, csvData: importState.csvData, dryRun: false }),
      })
      const data = await res.json()

      if (data.success || (data.inserted > 0 || data.updated > 0)) {
        setImportState(prev => ({
          ...prev,
          step: 'done',
          result: {
            inserted: data.inserted || 0,
            updated: data.updated || 0,
            errors: data.errors || [],
          },
        }))
        onImportComplete?.()
      } else {
        setImportState(prev => ({
          ...prev,
          step: 'error',
          error: data.error || 'Import failed',
        }))
      }
    } catch (err: any) {
      setImportState(prev => ({
        ...prev,
        step: 'error',
        error: err.message || 'Import failed',
      }))
    }
  }

  const closeModal = () => {
    setShowImportModal(false)
    setImportState({ step: 'idle' })
  }

  return (
    <>
      {/* Buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          title="Export all rates as CSV"
        >
          {exporting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          Export CSV
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          title="Import rates from CSV"
        >
          <Upload className="w-3.5 h-3.5" />
          Import CSV
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-gray-400" />
                <h3 className="text-base font-semibold text-gray-800">
                  Import {config.displayName}
                </h3>
              </div>
              <button
                onClick={closeModal}
                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* File info */}
              {importState.fileName && (
                <div className="text-sm text-gray-500">
                  File: <span className="font-medium text-gray-700">{importState.fileName}</span>
                </div>
              )}

              {/* Validating */}
              {importState.step === 'validating' && (
                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                  <span className="text-sm text-blue-700">Validating CSV data...</span>
                </div>
              )}

              {/* Preview */}
              {importState.step === 'preview' && importState.preview && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-gray-50 rounded-lg text-center">
                      <div className="text-2xl font-bold text-gray-800">{importState.preview.totalRows}</div>
                      <div className="text-xs text-gray-500">Total Rows</div>
                    </div>
                    <div className="p-3 bg-green-50 rounded-lg text-center">
                      <div className="text-2xl font-bold text-green-600">{importState.preview.validRows}</div>
                      <div className="text-xs text-green-600">Valid</div>
                    </div>
                    <div className="p-3 bg-red-50 rounded-lg text-center">
                      <div className="text-2xl font-bold text-red-600">{importState.preview.invalidRows}</div>
                      <div className="text-xs text-red-600">Invalid</div>
                    </div>
                  </div>

                  {importState.preview.errors.length > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="w-4 h-4 text-amber-600" />
                        <span className="text-sm font-medium text-amber-700">Validation Warnings</span>
                      </div>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {importState.preview.errors.slice(0, 10).map((err, i) => (
                          <div key={i} className="text-xs text-amber-600">
                            Row {err.row}, {err.column}: {err.message}
                          </div>
                        ))}
                        {importState.preview.errors.length > 10 && (
                          <div className="text-xs text-amber-500 italic">
                            ...and {importState.preview.errors.length - 10} more
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {importState.preview.validRows > 0 && (
                    <p className="text-sm text-gray-600">
                      Ready to import <strong>{importState.preview.validRows}</strong> valid row(s).
                      Rows with matching service codes will be <strong>updated</strong>;
                      new rows will be <strong>inserted</strong>.
                    </p>
                  )}
                </>
              )}

              {/* Importing */}
              {importState.step === 'importing' && (
                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                  <span className="text-sm text-blue-700">Importing rates...</span>
                </div>
              )}

              {/* Done */}
              {importState.step === 'done' && importState.result && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="text-sm text-green-700">Import completed successfully!</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-green-50 rounded-lg text-center">
                      <div className="text-xl font-bold text-green-600">{importState.result.inserted}</div>
                      <div className="text-xs text-green-600">New Rows Inserted</div>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-lg text-center">
                      <div className="text-xl font-bold text-blue-600">{importState.result.updated}</div>
                      <div className="text-xs text-blue-600">Rows Updated</div>
                    </div>
                  </div>
                  {importState.result.errors.length > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <div className="text-sm font-medium text-amber-700 mb-1">Some errors occurred:</div>
                      {importState.result.errors.slice(0, 5).map((err, i) => (
                        <div key={i} className="text-xs text-amber-600">
                          {err.operation}: {err.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Error */}
              {importState.step === 'error' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-4 bg-red-50 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    <span className="text-sm text-red-700">{importState.error}</span>
                  </div>
                  {importState.preview && importState.preview.errors.length > 0 && (
                    <div className="max-h-40 overflow-y-auto space-y-1 p-3 bg-gray-50 rounded-lg">
                      {importState.preview.errors.slice(0, 20).map((err, i) => (
                        <div key={i} className="text-xs text-red-600">
                          Row {err.row}, {err.column}: {err.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              {importState.step === 'preview' && importState.preview && importState.preview.validRows > 0 && (
                <>
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmImport}
                    className="px-4 py-2 text-sm font-medium text-white bg-[#647C47] hover:bg-[#4f6238] rounded-lg transition-colors"
                  >
                    Import {importState.preview.validRows} Row{importState.preview.validRows !== 1 ? 's' : ''}
                  </button>
                </>
              )}
              {(importState.step === 'done' || importState.step === 'error') && (
                <button
                  onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#647C47] hover:bg-[#4f6238] rounded-lg transition-colors"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
