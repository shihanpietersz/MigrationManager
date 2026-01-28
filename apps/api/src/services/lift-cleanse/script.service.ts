/**
 * Script Management Service
 * Handles CRUD operations for Lift & Cleanse scripts
 */

import prisma from '../../lib/db.js';
import { scriptSecurityService, type SecurityScanResult } from './script-security.service.js';

export interface CreateScriptInput {
  name: string;
  description?: string;
  content: string;
  scriptType: 'powershell' | 'bash';
  targetOs: 'windows' | 'linux' | 'both';
  category: 'cleanup' | 'install' | 'configure' | 'diagnostic' | 'custom';
  tags?: string[];
  parameters?: Array<{ key: string; description: string; required: boolean }>;
  timeout?: number;
  runAsAdmin?: boolean;
  isShared?: boolean;
  createdBy?: string;
}

export interface UpdateScriptInput {
  name?: string;
  description?: string;
  content?: string;
  tags?: string[];
  parameters?: Array<{ key: string; description: string; required: boolean }>;
  timeout?: number;
  runAsAdmin?: boolean;
  isShared?: boolean;
}

export interface ScriptFilter {
  category?: string;
  scriptType?: string;
  targetOs?: string;
  isBuiltIn?: boolean;
  isShared?: boolean;
  search?: string;
}

class ScriptService {
  /**
   * Create a new script
   */
  async create(input: CreateScriptInput): Promise<{
    script: Awaited<ReturnType<typeof prisma.liftCleanseScript.create>>;
    securityScan: SecurityScanResult;
  }> {
    // Run security scan
    const securityScan = await scriptSecurityService.scanScript(
      input.content,
      input.scriptType
    );

    // Block if critical risk
    if (!securityScan.canSave) {
      throw new Error(
        `Script blocked due to critical security issues: ${securityScan.issues
          .filter(i => i.severity === 'critical')
          .map(i => i.description)
          .join(', ')}`
      );
    }

    const script = await prisma.liftCleanseScript.create({
      data: {
        name: input.name,
        description: input.description,
        content: input.content,
        scriptType: input.scriptType,
        targetOs: input.targetOs,
        category: input.category,
        tags: input.tags ? JSON.stringify(input.tags) : null,
        parameters: input.parameters ? JSON.stringify(input.parameters) : null,
        timeout: input.timeout || 3600,
        runAsAdmin: input.runAsAdmin ?? true,
        isBuiltIn: false,
        isShared: input.isShared ?? false,
        createdBy: input.createdBy,
        riskLevel: securityScan.riskLevel,
        securityScan: JSON.stringify(securityScan),
        // If high risk, mark as not approved yet
        approvedBy: securityScan.requiresApproval ? null : 'auto',
        approvedAt: securityScan.requiresApproval ? null : new Date(),
      },
    });

    return { script, securityScan };
  }

  /**
   * Get all scripts with optional filters
   */
  async list(filters?: ScriptFilter) {
    const where: Parameters<typeof prisma.liftCleanseScript.findMany>[0]['where'] = {};

    if (filters?.category) {
      where.category = filters.category;
    }
    if (filters?.scriptType) {
      where.scriptType = filters.scriptType;
    }
    if (filters?.targetOs) {
      where.targetOs = { in: [filters.targetOs, 'both'] };
    }
    if (filters?.isBuiltIn !== undefined) {
      where.isBuiltIn = filters.isBuiltIn;
    }
    if (filters?.isShared !== undefined) {
      where.isShared = filters.isShared;
    }
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search } },
        { description: { contains: filters.search } },
      ];
    }

    const scripts = await prisma.liftCleanseScript.findMany({
      where,
      orderBy: [
        { isBuiltIn: 'desc' },
        { name: 'asc' },
      ],
    });

    return scripts.map(s => ({
      ...s,
      tags: s.tags ? JSON.parse(s.tags) : [],
      parameters: s.parameters ? JSON.parse(s.parameters) : [],
    }));
  }

  /**
   * Get a single script by ID
   */
  async getById(id: string) {
    const script = await prisma.liftCleanseScript.findUnique({
      where: { id },
    });

    if (!script) return null;

    return {
      ...script,
      tags: script.tags ? JSON.parse(script.tags) : [],
      parameters: script.parameters ? JSON.parse(script.parameters) : [],
      securityScan: script.securityScan ? JSON.parse(script.securityScan) : null,
    };
  }

  /**
   * Update a script
   */
  async update(id: string, input: UpdateScriptInput) {
    const existing = await prisma.liftCleanseScript.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error('Script not found');
    }

    if (existing.isBuiltIn) {
      throw new Error('Cannot modify built-in scripts');
    }

    // If content changed, re-run security scan
    let securityScan: SecurityScanResult | null = null;
    let riskLevel = existing.riskLevel;
    let approvedBy = existing.approvedBy;
    let approvedAt = existing.approvedAt;

    if (input.content && input.content !== existing.content) {
      securityScan = await scriptSecurityService.scanScript(
        input.content,
        existing.scriptType as 'powershell' | 'bash'
      );

      if (!securityScan.canSave) {
        throw new Error(
          `Script blocked due to critical security issues: ${securityScan.issues
            .filter(i => i.severity === 'critical')
            .map(i => i.description)
            .join(', ')}`
        );
      }

      riskLevel = securityScan.riskLevel;
      // Reset approval if content changed and risk is high
      if (securityScan.requiresApproval) {
        approvedBy = null;
        approvedAt = null;
      }
    }

    const script = await prisma.liftCleanseScript.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        content: input.content,
        tags: input.tags !== undefined ? JSON.stringify(input.tags) : undefined,
        parameters: input.parameters !== undefined ? JSON.stringify(input.parameters) : undefined,
        timeout: input.timeout,
        runAsAdmin: input.runAsAdmin,
        isShared: input.isShared,
        riskLevel,
        securityScan: securityScan ? JSON.stringify(securityScan) : undefined,
        approvedBy,
        approvedAt,
      },
    });

    return {
      script: {
        ...script,
        tags: script.tags ? JSON.parse(script.tags) : [],
        parameters: script.parameters ? JSON.parse(script.parameters) : [],
      },
      securityScan,
    };
  }

  /**
   * Delete a script
   */
  async delete(id: string) {
    const existing = await prisma.liftCleanseScript.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error('Script not found');
    }

    if (existing.isBuiltIn) {
      throw new Error('Cannot delete built-in scripts');
    }

    await prisma.liftCleanseScript.delete({
      where: { id },
    });

    return { success: true };
  }

  /**
   * Duplicate a script
   */
  async duplicate(id: string, newName?: string, createdBy?: string) {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error('Script not found');
    }

    return this.create({
      name: newName || `${existing.name} (Copy)`,
      description: existing.description || undefined,
      content: existing.content,
      scriptType: existing.scriptType as 'powershell' | 'bash',
      targetOs: existing.targetOs as 'windows' | 'linux' | 'both',
      category: existing.category as 'cleanup' | 'install' | 'configure' | 'diagnostic' | 'custom',
      tags: existing.tags,
      parameters: existing.parameters,
      timeout: existing.timeout,
      runAsAdmin: existing.runAsAdmin,
      isShared: false,
      createdBy,
    });
  }

  /**
   * Share/unshare a script
   */
  async setShared(id: string, isShared: boolean) {
    const existing = await prisma.liftCleanseScript.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error('Script not found');
    }

    if (existing.isBuiltIn) {
      throw new Error('Built-in scripts are always shared');
    }

    return prisma.liftCleanseScript.update({
      where: { id },
      data: { isShared },
    });
  }

  /**
   * Approve a high-risk script
   */
  async approve(id: string, approvedBy: string) {
    const existing = await prisma.liftCleanseScript.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error('Script not found');
    }

    if (existing.riskLevel !== 'high') {
      throw new Error('Only high-risk scripts require approval');
    }

    return prisma.liftCleanseScript.update({
      where: { id },
      data: {
        approvedBy,
        approvedAt: new Date(),
      },
    });
  }

  /**
   * Validate script content (scan without saving)
   */
  async validate(content: string, scriptType: 'powershell' | 'bash') {
    return scriptSecurityService.scanScript(content, scriptType);
  }

  /**
   * Seed built-in scripts
   */
  async seedBuiltInScripts() {
    const builtInScripts = [
      // Windows Cleanup
      {
        name: 'Remove VMware Tools',
        description: 'Removes VMware Tools and related components after migration to Azure',
        content: `# Remove VMware Tools - Windows
$ErrorActionPreference = 'Stop'

Write-Host "=== VMware Tools Removal Script ===" -ForegroundColor Cyan
Write-Host "Starting removal process..."

# Stop VMware services
$vmwareServices = Get-Service -Name "VMware*", "vmtools*" -ErrorAction SilentlyContinue
if ($vmwareServices) {
    Write-Host "Stopping VMware services..."
    $vmwareServices | Stop-Service -Force -ErrorAction SilentlyContinue
    Write-Host "Services stopped."
} else {
    Write-Host "No VMware services found."
}

# Uninstall VMware Tools via registry
$uninstallKeys = @(
    "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
    "HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*"
)

$vmwareProduct = Get-ItemProperty $uninstallKeys -ErrorAction SilentlyContinue | 
    Where-Object { $_.DisplayName -like "*VMware Tools*" }

if ($vmwareProduct) {
    Write-Host "Found VMware Tools. Uninstalling..."
    Start-Process "msiexec.exe" -ArgumentList "/x $($vmwareProduct.PSChildName) /qn /norestart" -Wait -NoNewWindow
    Write-Host "VMware Tools uninstalled."
} else {
    Write-Host "VMware Tools not found in installed programs."
}

Write-Host ""
Write-Host "=== Removal complete ===" -ForegroundColor Green
Write-Host "A system restart may be required."`,
        scriptType: 'powershell',
        targetOs: 'windows',
        category: 'cleanup',
        tags: ['vmware', 'cleanup', 'post-migration'],
        parameters: [],
        timeout: 1800,
      },
      // Windows Install
      {
        name: 'Install Azure Monitor Agent',
        description: 'Installs the Azure Monitor Agent for log collection and monitoring',
        content: `# Install Azure Monitor Agent - Windows
param(
    [Parameter(Mandatory=$true)]
    [string]$WorkspaceId,
    [Parameter(Mandatory=$true)]
    [string]$WorkspaceKey
)

$ErrorActionPreference = 'Stop'

Write-Host "=== Azure Monitor Agent Installation ===" -ForegroundColor Cyan

# Download the agent
$downloadUrl = "https://go.microsoft.com/fwlink/?LinkId=828603"
$installerPath = "$env:TEMP\\MMASetup-AMD64.exe"

Write-Host "Downloading Azure Monitor Agent..."
Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath

Write-Host "Installing agent..."
$installArgs = @(
    "/qn"
    "NOAPM=1"
    "ADD_OPINSIGHTS_WORKSPACE=1"
    "OPINSIGHTS_WORKSPACE_AZURE_CLOUD_TYPE=0"
    "OPINSIGHTS_WORKSPACE_ID=$WorkspaceId"
    "OPINSIGHTS_WORKSPACE_KEY=$WorkspaceKey"
    "AcceptEndUserLicenseAgreement=1"
)

Start-Process -FilePath $installerPath -ArgumentList $installArgs -Wait -NoNewWindow

# Verify installation
$service = Get-Service -Name "HealthService" -ErrorAction SilentlyContinue
if ($service -and $service.Status -eq "Running") {
    Write-Host "Azure Monitor Agent installed and running!" -ForegroundColor Green
} else {
    Write-Host "Warning: Agent installed but service not running" -ForegroundColor Yellow
}

# Cleanup
Remove-Item $installerPath -Force -ErrorAction SilentlyContinue

Write-Host "=== Installation complete ===" -ForegroundColor Green`,
        scriptType: 'powershell',
        targetOs: 'windows',
        category: 'install',
        tags: ['monitoring', 'azure', 'agent'],
        parameters: [
          { key: 'WorkspaceId', description: 'Log Analytics Workspace ID', required: true },
          { key: 'WorkspaceKey', description: 'Log Analytics Workspace Key', required: true },
        ],
        timeout: 1800,
      },
      // Linux Cleanup
      {
        name: 'Remove VMware Tools (Linux)',
        description: 'Removes open-vm-tools and VMware components from Linux VMs',
        content: `#!/bin/bash
# Remove VMware Tools - Linux
set -e

echo "=== VMware Tools Removal Script ==="
echo "Starting removal process..."

# Detect package manager
if command -v apt-get &> /dev/null; then
    PKG_MANAGER="apt"
elif command -v yum &> /dev/null; then
    PKG_MANAGER="yum"
elif command -v dnf &> /dev/null; then
    PKG_MANAGER="dnf"
else
    echo "Error: Unsupported package manager"
    exit 1
fi

echo "Detected package manager: $PKG_MANAGER"

# Stop VMware services
echo "Stopping VMware services..."
systemctl stop vmtoolsd 2>/dev/null || true
systemctl stop vmware-tools 2>/dev/null || true

# Remove packages based on package manager
echo "Removing VMware packages..."
if [ "$PKG_MANAGER" = "apt" ]; then
    apt-get remove -y open-vm-tools open-vm-tools-desktop 2>/dev/null || true
    apt-get autoremove -y
elif [ "$PKG_MANAGER" = "yum" ] || [ "$PKG_MANAGER" = "dnf" ]; then
    $PKG_MANAGER remove -y open-vm-tools open-vm-tools-desktop 2>/dev/null || true
fi

# Remove VMware directories
echo "Cleaning up VMware directories..."
rm -rf /etc/vmware-tools 2>/dev/null || true
rm -rf /var/log/vmware* 2>/dev/null || true

echo ""
echo "=== Removal complete ==="
echo "A system restart may be required."`,
        scriptType: 'bash',
        targetOs: 'linux',
        category: 'cleanup',
        tags: ['vmware', 'cleanup', 'post-migration'],
        parameters: [],
        timeout: 900,
      },
      // Diagnostic - Windows
      {
        name: 'System Health Check',
        description: 'Collects system health information including CPU, memory, disk, and services',
        content: `# System Health Check - Windows
$ErrorActionPreference = 'SilentlyContinue'

Write-Host "=== System Health Check ===" -ForegroundColor Cyan
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ""

# CPU Info
Write-Host "--- CPU Information ---" -ForegroundColor Yellow
$cpu = Get-CimInstance Win32_Processor
Write-Host "Processor: $($cpu.Name)"
Write-Host "Cores: $($cpu.NumberOfCores)"
Write-Host "Current Load: $($cpu.LoadPercentage)%"
Write-Host ""

# Memory Info
Write-Host "--- Memory Information ---" -ForegroundColor Yellow
$os = Get-CimInstance Win32_OperatingSystem
$totalMem = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
$freeMem = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
$usedMem = $totalMem - $freeMem
$memPercent = [math]::Round(($usedMem / $totalMem) * 100, 1)
Write-Host "Total Memory: $totalMem GB"
Write-Host "Used Memory: $usedMem GB ($memPercent%)"
Write-Host "Free Memory: $freeMem GB"
Write-Host ""

# Disk Info
Write-Host "--- Disk Information ---" -ForegroundColor Yellow
Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
    $free = [math]::Round($_.FreeSpace / 1GB, 2)
    $total = [math]::Round($_.Size / 1GB, 2)
    $used = $total - $free
    $percent = [math]::Round(($used / $total) * 100, 1)
    Write-Host "Drive $($_.DeviceID) - Total: $total GB, Used: $used GB ($percent%), Free: $free GB"
}
Write-Host ""

# Services Status
Write-Host "--- Critical Services ---" -ForegroundColor Yellow
$criticalServices = @("W32Time", "wuauserv", "WinRM", "Dhcp", "Dnscache")
foreach ($svc in $criticalServices) {
    $service = Get-Service -Name $svc -ErrorAction SilentlyContinue
    if ($service) {
        $status = if ($service.Status -eq "Running") { "[OK]" } else { "[WARN]" }
        Write-Host "$status $($service.DisplayName): $($service.Status)"
    }
}
Write-Host ""

Write-Host "=== Health Check Complete ===" -ForegroundColor Green`,
        scriptType: 'powershell',
        targetOs: 'windows',
        category: 'diagnostic',
        tags: ['health', 'diagnostic', 'monitoring'],
        parameters: [],
        timeout: 300,
      },
      // Diagnostic - Linux
      {
        name: 'System Health Check (Linux)',
        description: 'Collects system health information for Linux VMs',
        content: `#!/bin/bash
# System Health Check - Linux

echo "=== System Health Check ==="
echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# System Info
echo "--- System Information ---"
echo "Hostname: $(hostname)"
echo "Kernel: $(uname -r)"
echo "Uptime: $(uptime -p)"
echo ""

# CPU Info
echo "--- CPU Information ---"
echo "Processor: $(grep 'model name' /proc/cpuinfo | head -1 | cut -d: -f2 | xargs)"
echo "Cores: $(nproc)"
echo "Load Average: $(cat /proc/loadavg | awk '{print $1, $2, $3}')"
echo ""

# Memory Info
echo "--- Memory Information ---"
free -h | grep -E "Mem|Swap"
echo ""

# Disk Info
echo "--- Disk Information ---"
df -h | grep -E "^/dev|Filesystem"
echo ""

# Network Info
echo "--- Network Information ---"
ip -4 addr show | grep inet | grep -v "127.0.0.1"
echo ""

# Services Status
echo "--- Critical Services ---"
for svc in sshd cron rsyslog; do
    if systemctl is-active --quiet $svc 2>/dev/null; then
        echo "[OK] $svc: running"
    else
        echo "[WARN] $svc: not running"
    fi
done
echo ""

echo "=== Health Check Complete ==="`,
        scriptType: 'bash',
        targetOs: 'linux',
        category: 'diagnostic',
        tags: ['health', 'diagnostic', 'monitoring'],
        parameters: [],
        timeout: 300,
      },
      // Clean temp files - Windows
      {
        name: 'Clean Temporary Files',
        description: 'Removes temporary files, Windows Update cache, and other cleanup tasks',
        content: `# Clean Temporary Files - Windows
param(
    [int]$DaysOld = 7
)

$ErrorActionPreference = 'SilentlyContinue'

Write-Host "=== Temporary Files Cleanup ===" -ForegroundColor Cyan
Write-Host "Removing files older than $DaysOld days..."

$cutoffDate = (Get-Date).AddDays(-$DaysOld)
$totalFreed = 0

# Temp folders to clean
$tempPaths = @(
    $env:TEMP,
    "C:\\Windows\\Temp",
    "C:\\Windows\\SoftwareDistribution\\Download"
)

foreach ($path in $tempPaths) {
    if (Test-Path $path) {
        Write-Host "Cleaning: $path"
        $files = Get-ChildItem -Path $path -Recurse -File -ErrorAction SilentlyContinue | 
            Where-Object { $_.LastWriteTime -lt $cutoffDate }
        
        $size = ($files | Measure-Object -Property Length -Sum).Sum
        $totalFreed += $size
        
        $files | Remove-Item -Force -ErrorAction SilentlyContinue
        Write-Host "  Removed: $($files.Count) files"
    }
}

$freedMB = [math]::Round($totalFreed / 1MB, 2)
Write-Host ""
Write-Host "=== Cleanup Complete ===" -ForegroundColor Green
Write-Host "Total space freed: $freedMB MB"`,
        scriptType: 'powershell',
        targetOs: 'windows',
        category: 'cleanup',
        tags: ['cleanup', 'temp', 'maintenance'],
        parameters: [
          { key: 'DaysOld', description: 'Delete files older than X days', required: false },
        ],
        timeout: 900,
      },
    ];

    // Upsert each built-in script
    for (const scriptData of builtInScripts) {
      const existing = await prisma.liftCleanseScript.findFirst({
        where: {
          name: scriptData.name,
          isBuiltIn: true,
        },
      });

      if (!existing) {
        await prisma.liftCleanseScript.create({
          data: {
            ...scriptData,
            tags: JSON.stringify(scriptData.tags),
            parameters: JSON.stringify(scriptData.parameters),
            isBuiltIn: true,
            isShared: true,
            riskLevel: 'low',
            approvedBy: 'system',
            approvedAt: new Date(),
          },
        });
        console.log(`[ScriptService] Created built-in script: ${scriptData.name}`);
      }
    }
  }
}

export const scriptService = new ScriptService();

