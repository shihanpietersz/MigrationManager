'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  X,
  Download,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

interface ImportResult {
  jobId: string;
  sourceId: string;
  totalRecords: number;
  processedRecords: number;
  errorCount: number;
  errors: string[];
  message: string;
}

export default function ImportCSVPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE}/data-sources/import/csv`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || 'Upload failed');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setResult(data.data);
      queryClient.invalidateQueries({ queryKey: ['machines'] });
      queryClient.invalidateQueries({ queryKey: ['data-sources'] });
    },
  });

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.toLowerCase().endsWith('.csv')) {
        setFile(droppedFile);
        setResult(null);
      }
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  }, []);

  const handleUpload = () => {
    if (file) {
      uploadMutation.mutate(file);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Page Header */}
      <div className="flex items-center gap-4">
        <Link href="/data-sources">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Import Machines</h1>
          <p className="text-muted-foreground mt-1">
            Upload a CSV file with your machine inventory
          </p>
        </div>
      </div>

      {/* Success Result */}
      {result && !uploadMutation.isPending && (
        <div className={cn(
          'rounded-lg border p-6',
          result.errorCount > 0 && result.processedRecords > 0
            ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800'
            : result.processedRecords > 0
            ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800'
            : 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800'
        )}>
          <div className="flex items-start gap-4">
            {result.processedRecords > 0 ? (
              <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0" />
            )}
            <div className="flex-1">
              <h3 className="font-semibold text-lg">
                {result.processedRecords > 0 ? 'Import Completed' : 'Import Failed'}
              </h3>
              <p className="text-muted-foreground mt-1">
                {result.message}
              </p>
              
              <div className="mt-4 grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-white/50 dark:bg-black/20 rounded-lg">
                  <p className="text-2xl font-bold">{result.totalRecords}</p>
                  <p className="text-sm text-muted-foreground">Total Rows</p>
                </div>
                <div className="text-center p-3 bg-white/50 dark:bg-black/20 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{result.processedRecords}</p>
                  <p className="text-sm text-muted-foreground">Imported</p>
                </div>
                <div className="text-center p-3 bg-white/50 dark:bg-black/20 rounded-lg">
                  <p className="text-2xl font-bold text-red-600">{result.errorCount}</p>
                  <p className="text-sm text-muted-foreground">Errors</p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-medium mb-2">Errors:</p>
                  <ul className="text-sm text-red-600 space-y-1 max-h-32 overflow-auto">
                    {result.errors.map((err, i) => (
                      <li key={i}>• {err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <Button variant="outline" onClick={handleReset}>
                  Import Another File
                </Button>
                <Link href="/machines">
                  <Button>View Machines</Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Area */}
      {!result && (
        <>
          <div
            className={cn(
              'rounded-lg border-2 border-dashed p-12 text-center transition-colors',
              dragActive
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-muted-foreground/50',
              uploadMutation.isPending && 'opacity-50 pointer-events-none'
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
              id="csv-upload"
            />

            {file ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-3">
                  <FileSpreadsheet className="h-12 w-12 text-green-600" />
                  <div className="text-left">
                    <p className="font-semibold">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleReset}
                    className="ml-4"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                <div>
                  <p className="font-semibold">
                    Drag and drop your CSV file here
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    or click to browse
                  </p>
                </div>
                <label htmlFor="csv-upload">
                  <Button variant="outline" asChild className="cursor-pointer">
                    <span>Select File</span>
                  </Button>
                </label>
              </div>
            )}
          </div>

          {/* Upload Button */}
          {file && (
            <div className="flex justify-end">
              <Button
                onClick={handleUpload}
                disabled={uploadMutation.isPending}
                size="lg"
              >
                {uploadMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload & Import
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Error State */}
          {uploadMutation.isError && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800 p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <p className="text-sm text-red-600">
                  {uploadMutation.error instanceof Error
                    ? uploadMutation.error.message
                    : 'Upload failed'}
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* CSV Format Help */}
      <div className="rounded-lg border bg-card p-6">
        <h3 className="font-semibold mb-2">CSV Format</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Your CSV should include headers. The following columns are supported:
        </p>
        <div className="bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto">
          <p className="text-muted-foreground">hostname, ip_address, operating_system, cpu_cores, memory_mb, disk_size_gb</p>
        </div>
        <p className="text-sm text-muted-foreground mt-4">
          Column names are flexible - we&apos;ll try to match common variations like &quot;name&quot;, &quot;machine_name&quot;,
          &quot;ip&quot;, &quot;os&quot;, &quot;cpu&quot;, &quot;memory&quot;, &quot;disk&quot;, etc.
        </p>
        
        <div className="mt-4 flex items-center gap-4">
          <a
            href={`${API_BASE}/data-sources/import/template`}
            download="machine-import-template.csv"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <Download className="h-4 w-4" />
            Download Template CSV
          </a>
        </div>
      </div>
    </div>
  );
}















