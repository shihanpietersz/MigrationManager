'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { liftCleanseApi, type SecurityScanResult } from '@/lib/api';
import {
  ChevronLeft,
  Loader2,
  Save,
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Plus,
  Trash2,
  Play,
} from 'lucide-react';
// Toast notifications handled inline

export default function NewScriptPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [scriptType, setScriptType] = useState<'powershell' | 'bash'>('powershell');
  const [targetOs, setTargetOs] = useState<'windows' | 'linux' | 'both'>('windows');
  const [category, setCategory] = useState<
    'cleanup' | 'install' | 'configure' | 'diagnostic' | 'custom'
  >('custom');
  const [timeout, setTimeout] = useState(3600);
  const [runAsAdmin, setRunAsAdmin] = useState(true);
  const [isShared, setIsShared] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [parameters, setParameters] = useState<
    Array<{ key: string; description: string; required: boolean }>
  >([]);
  const [securityScan, setSecurityScan] = useState<SecurityScanResult | null>(null);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: () =>
      liftCleanseApi.createScript({
        name,
        description,
        content,
        scriptType,
        targetOs,
        category,
        tags,
        parameters,
        timeout,
        runAsAdmin,
        isShared,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lift-cleanse-scripts'] });
      router.push('/lift-cleanse/scripts');
    },
    onError: (error: Error) => {
      alert(`Error: ${error.message}`);
    },
  });

  // Validate mutation
  const validateMutation = useMutation({
    mutationFn: () => liftCleanseApi.validateScript(content, scriptType),
    onSuccess: data => {
      setSecurityScan(data.data || null);
    },
    onError: () => {
      alert('Validation failed');
    },
  });

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const addParameter = () => {
    setParameters([...parameters, { key: '', description: '', required: false }]);
  };

  const updateParameter = (
    index: number,
    field: 'key' | 'description' | 'required',
    value: string | boolean
  ) => {
    const updated = [...parameters];
    updated[index] = { ...updated[index], [field]: value };
    setParameters(updated);
  };

  const removeParameter = (index: number) => {
    setParameters(parameters.filter((_, i) => i !== index));
  };

  const getRiskIcon = (level: string) => {
    switch (level) {
      case 'low':
        return <ShieldCheck className="h-5 w-5 text-green-500" />;
      case 'medium':
        return <Shield className="h-5 w-5 text-yellow-500" />;
      case 'high':
        return <ShieldAlert className="h-5 w-5 text-orange-500" />;
      case 'critical':
        return <ShieldAlert className="h-5 w-5 text-red-500" />;
      default:
        return <Shield className="h-5 w-5 text-gray-500" />;
    }
  };

  const canSave = name.trim() && content.trim() && (!securityScan || securityScan.canSave);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/lift-cleanse/scripts">
            <Button variant="ghost" size="sm">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">New Script</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Create a new script for post-migration tasks
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => validateMutation.mutate()}
            disabled={!content.trim() || validateMutation.isPending}
          >
            {validateMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Validate
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!canSave || createMutation.isPending}
            className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Script
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left Panel - Script Editor */}
        <div className="col-span-2 space-y-6">
          {/* Basic Info */}
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <h2 className="font-semibold">Basic Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Script Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Install Monitoring Agent"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="category">Category</Label>
                <select
                  id="category"
                  value={category}
                  onChange={e => setCategory(e.target.value as typeof category)}
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="cleanup">Cleanup</option>
                  <option value="install">Install</option>
                  <option value="configure">Configure</option>
                  <option value="diagnostic">Diagnostic</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe what this script does..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="mt-1"
                rows={2}
              />
            </div>
          </div>

          {/* Script Content */}
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Script Content *</h2>
              <div className="flex items-center gap-2">
                <select
                  value={scriptType}
                  onChange={e => setScriptType(e.target.value as 'powershell' | 'bash')}
                  className="h-8 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="powershell">PowerShell</option>
                  <option value="bash">Bash</option>
                </select>
              </div>
            </div>
            <Textarea
              placeholder={
                scriptType === 'powershell'
                  ? '# PowerShell script\nWrite-Host "Hello, World!"'
                  : '#!/bin/bash\necho "Hello, World!"'
              }
              value={content}
              onChange={e => setContent(e.target.value)}
              className="font-mono text-sm min-h-[300px]"
            />
          </div>

          {/* Parameters */}
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Parameters</h2>
              <Button variant="outline" size="sm" onClick={addParameter}>
                <Plus className="h-4 w-4 mr-1" />
                Add Parameter
              </Button>
            </div>
            {parameters.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No parameters defined. Add parameters to make your script configurable.
              </p>
            ) : (
              <div className="space-y-3">
                {parameters.map((param, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="flex-1">
                      <Input
                        placeholder="Parameter name"
                        value={param.key}
                        onChange={e => updateParameter(index, 'key', e.target.value)}
                      />
                    </div>
                    <div className="flex-1">
                      <Input
                        placeholder="Description"
                        value={param.description}
                        onChange={e => updateParameter(index, 'description', e.target.value)}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={param.required}
                        onChange={e => updateParameter(index, 'required', e.target.checked)}
                      />
                      Required
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeParameter(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Settings & Security */}
        <div className="space-y-6">
          {/* Security Scan Results */}
          {securityScan && (
            <div
              className={cn(
                'rounded-lg border p-4',
                securityScan.riskLevel === 'critical'
                  ? 'border-red-200 bg-red-50'
                  : securityScan.riskLevel === 'high'
                  ? 'border-orange-200 bg-orange-50'
                  : securityScan.riskLevel === 'medium'
                  ? 'border-yellow-200 bg-yellow-50'
                  : 'border-green-200 bg-green-50'
              )}
            >
              <div className="flex items-center gap-2 mb-3">
                {getRiskIcon(securityScan.riskLevel)}
                <h3 className="font-semibold">
                  Security Scan:{' '}
                  {securityScan.riskLevel.charAt(0).toUpperCase() +
                    securityScan.riskLevel.slice(1)}{' '}
                  Risk
                </h3>
              </div>
              {securityScan.issues.length > 0 && (
                <div className="space-y-2 mb-3">
                  {securityScan.issues.slice(0, 5).map((issue, i) => (
                    <div key={i} className="text-sm">
                      <div className="flex items-center gap-2">
                        <AlertCircle
                          className={cn(
                            'h-3 w-3',
                            issue.severity === 'critical'
                              ? 'text-red-500'
                              : issue.severity === 'danger'
                              ? 'text-orange-500'
                              : issue.severity === 'warning'
                              ? 'text-yellow-600'
                              : 'text-blue-500'
                          )}
                        />
                        <span className="font-medium">Line {issue.line}:</span>
                        <span className="text-muted-foreground">{issue.description}</span>
                      </div>
                    </div>
                  ))}
                  {securityScan.issues.length > 5 && (
                    <p className="text-xs text-muted-foreground">
                      +{securityScan.issues.length - 5} more issues
                    </p>
                  )}
                </div>
              )}
              {securityScan.recommendations.length > 0 && (
                <div className="border-t pt-2 mt-2">
                  <h4 className="text-xs font-medium text-muted-foreground mb-1">
                    Recommendations:
                  </h4>
                  <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                    {securityScan.recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
              {!securityScan.canSave && (
                <div className="mt-3 p-2 bg-red-100 rounded text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 inline mr-1" />
                  Cannot save: Script contains critical security issues
                </div>
              )}
            </div>
          )}

          {/* Settings */}
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <h2 className="font-semibold">Settings</h2>
            <div>
              <Label htmlFor="targetOs">Target OS</Label>
              <select
                id="targetOs"
                value={targetOs}
                onChange={e => setTargetOs(e.target.value as typeof targetOs)}
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="windows">Windows Only</option>
                <option value="linux">Linux Only</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div>
              <Label htmlFor="timeout">Timeout (seconds)</Label>
              <Input
                id="timeout"
                type="number"
                min={60}
                max={5400}
                value={timeout}
                onChange={e => setTimeout(parseInt(e.target.value) || 3600)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Max 90 minutes (5400s)</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="runAsAdmin"
                checked={runAsAdmin}
                onChange={e => setRunAsAdmin(e.target.checked)}
              />
              <Label htmlFor="runAsAdmin">Run as Administrator/Root</Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isShared"
                checked={isShared}
                onChange={e => setIsShared(e.target.checked)}
              />
              <Label htmlFor="isShared">Share with organization</Label>
            </div>
          </div>

          {/* Tags */}
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <h2 className="font-semibold">Tags</h2>
            <div className="flex gap-2">
              <Input
                placeholder="Add tag..."
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
              />
              <Button variant="outline" size="sm" onClick={addTag}>
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 text-sm px-2 py-1 rounded bg-muted"
                  >
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

