/**
 * Script Security Scanning Service
 * Scans scripts for potentially dangerous patterns
 */

export interface SecurityIssue {
  severity: 'info' | 'warning' | 'danger' | 'critical';
  line: number;
  column: number;
  pattern: string;
  description: string;
  matchedText: string;
}

export interface SecurityScanResult {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  score: number;          // 0-100 (higher = more risky)
  issues: SecurityIssue[];
  recommendations: string[];
  canSave: boolean;
  requiresApproval: boolean;
}

interface DangerPattern {
  pattern: RegExp;
  severity: SecurityIssue['severity'];
  description: string;
  recommendation?: string;
}

class ScriptSecurityService {
  // PowerShell dangerous patterns
  private powershellPatterns: DangerPattern[] = [
    // Critical - System destruction
    {
      pattern: /Remove-Item\s+.*-Recurse.*\\(Windows|System32|Program Files)/i,
      severity: 'critical',
      description: 'Attempting to delete system directories',
      recommendation: 'Never delete Windows system directories',
    },
    {
      pattern: /Format-(Volume|Disk)/i,
      severity: 'critical',
      description: 'Disk formatting command detected',
      recommendation: 'Remove disk formatting commands',
    },
    {
      pattern: /Clear-Disk/i,
      severity: 'critical',
      description: 'Disk clearing command detected',
    },
    
    // High - Code execution/obfuscation
    {
      pattern: /Invoke-Expression|iex\s*[\(\$]/i,
      severity: 'danger',
      description: 'Dynamic code execution (Invoke-Expression) can run arbitrary code',
      recommendation: 'Avoid dynamic code execution when possible',
    },
    {
      pattern: /-EncodedCommand/i,
      severity: 'danger',
      description: 'Encoded commands can hide malicious code',
      recommendation: 'Use plain text commands for transparency',
    },
    {
      pattern: /\[Convert\]::FromBase64String/i,
      severity: 'danger',
      description: 'Base64 decoding often used to hide malicious payloads',
    },
    {
      pattern: /New-LocalUser|Add-LocalGroupMember.*Administrators/i,
      severity: 'danger',
      description: 'User account creation or privilege escalation',
      recommendation: 'User management should be done through proper channels',
    },
    {
      pattern: /New-ScheduledTask|Register-ScheduledTask/i,
      severity: 'danger',
      description: 'Scheduled task creation can be used for persistence',
    },
    {
      pattern: /Set-ExecutionPolicy\s+.*Bypass/i,
      severity: 'danger',
      description: 'Bypassing execution policy reduces security',
    },
    
    // Medium - Network/external
    {
      pattern: /Invoke-WebRequest|Invoke-RestMethod|wget|curl/i,
      severity: 'warning',
      description: 'External download detected',
      recommendation: 'Ensure download URLs are from trusted sources',
    },
    {
      pattern: /Start-Process\s+.*-Verb\s+RunAs/i,
      severity: 'warning',
      description: 'Privilege elevation attempt',
    },
    {
      pattern: /Get-Credential|ConvertTo-SecureString/i,
      severity: 'warning',
      description: 'Credential handling detected',
      recommendation: 'Ensure credentials are handled securely',
    },
    {
      pattern: /New-NetFirewallRule|Set-NetFirewallRule/i,
      severity: 'warning',
      description: 'Firewall rule modification',
    },
    
    // Info
    {
      pattern: /Stop-Service|Stop-Process/i,
      severity: 'info',
      description: 'Service or process control',
    },
    {
      pattern: /Set-ItemProperty.*HKLM:|HKCU:/i,
      severity: 'warning',
      description: 'Registry modification',
    },
  ];

  // Bash dangerous patterns
  private bashPatterns: DangerPattern[] = [
    // Critical - System destruction
    {
      pattern: /rm\s+(-[rf]+\s+)*\//,
      severity: 'critical',
      description: 'Dangerous recursive deletion from root',
      recommendation: 'Never use rm -rf on root paths',
    },
    {
      pattern: /dd\s+.*of=\/dev\/(sda|nvme|vd)/i,
      severity: 'critical',
      description: 'Direct disk write can destroy data',
    },
    {
      pattern: /mkfs|fdisk.*-w/i,
      severity: 'critical',
      description: 'Disk formatting command detected',
    },
    
    // Critical - Reverse shells
    {
      pattern: /bash\s+-i\s+>&\s*\/dev\/tcp/i,
      severity: 'critical',
      description: 'Reverse shell detected',
    },
    {
      pattern: /nc\s+.*-e\s+\/bin\/(ba)?sh/i,
      severity: 'critical',
      description: 'Netcat reverse shell detected',
    },
    {
      pattern: /python.*socket.*connect/i,
      severity: 'critical',
      description: 'Python reverse shell pattern detected',
    },
    
    // High - Code execution
    {
      pattern: /eval\s+[\$\"\(]/i,
      severity: 'danger',
      description: 'Dynamic code execution (eval)',
    },
    {
      pattern: /curl.*\|\s*(ba)?sh|wget.*\|\s*(ba)?sh/i,
      severity: 'danger',
      description: 'Downloading and executing remote scripts',
      recommendation: 'Download scripts first, review them, then execute',
    },
    {
      pattern: /base64\s+-d.*\|\s*(ba)?sh/i,
      severity: 'danger',
      description: 'Executing base64-encoded commands',
    },
    {
      pattern: /useradd|usermod.*-G\s+sudo/i,
      severity: 'danger',
      description: 'User creation or privilege escalation',
    },
    {
      pattern: /crontab|\/etc\/cron/i,
      severity: 'danger',
      description: 'Cron job modification (persistence)',
    },
    
    // Medium
    {
      pattern: /curl|wget/i,
      severity: 'warning',
      description: 'External download detected',
      recommendation: 'Ensure URLs are from trusted sources',
    },
    {
      pattern: /chmod\s+(777|\+s|u\+s|g\+s)/i,
      severity: 'warning',
      description: 'Dangerous permission changes',
    },
    {
      pattern: /iptables\s+-F|ufw\s+disable/i,
      severity: 'warning',
      description: 'Firewall changes detected',
    },
    {
      pattern: /sudo\s+su|sudo\s+-i/i,
      severity: 'info',
      description: 'Root shell access',
    },
  ];

  // Universal patterns (apply to both)
  private universalPatterns: DangerPattern[] = [
    // Crypto mining
    {
      pattern: /xmrig|minerd|stratum\+tcp|monero/i,
      severity: 'critical',
      description: 'Cryptocurrency mining software detected',
    },
    // Wallet addresses (basic patterns)
    {
      pattern: /[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{39,59}/i,
      severity: 'critical',
      description: 'Cryptocurrency wallet address detected',
    },
    // Obfuscation
    {
      pattern: /\$[_$][0-9a-f]{4,}/i,
      severity: 'danger',
      description: 'Obfuscated variable names detected',
    },
    // Suspicious domains/IPs
    {
      pattern: /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+/,
      severity: 'warning',
      description: 'IP address with port detected',
      recommendation: 'Verify this is a trusted endpoint',
    },
  ];

  /**
   * Scan a script for security issues
   */
  async scanScript(
    content: string,
    scriptType: 'powershell' | 'bash'
  ): Promise<SecurityScanResult> {
    const issues: SecurityIssue[] = [];
    const lines = content.split('\n');

    // Select patterns based on script type
    const patterns = [
      ...(scriptType === 'powershell' ? this.powershellPatterns : this.bashPatterns),
      ...this.universalPatterns,
    ];

    // Check each line against patterns
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      
      // Skip comments
      if (scriptType === 'powershell' && line.trim().startsWith('#')) continue;
      if (scriptType === 'bash' && line.trim().startsWith('#')) continue;

      for (const { pattern, severity, description, recommendation } of patterns) {
        const match = line.match(pattern);
        if (match) {
          issues.push({
            severity,
            line: lineNum + 1,
            column: match.index || 0,
            pattern: pattern.source,
            description,
            matchedText: match[0],
          });
        }
      }
    }

    // Check file size
    if (content.length > 1024 * 1024) {
      issues.push({
        severity: 'warning',
        line: 0,
        column: 0,
        pattern: 'file_size',
        description: 'Script is larger than 1MB',
        matchedText: `${Math.round(content.length / 1024)}KB`,
      });
    }

    // Check line count
    if (lines.length > 5000) {
      issues.push({
        severity: 'warning',
        line: 0,
        column: 0,
        pattern: 'line_count',
        description: 'Script has more than 5000 lines',
        matchedText: `${lines.length} lines`,
      });
    }

    // Calculate risk score and level
    const score = this.calculateRiskScore(issues);
    const riskLevel = this.getRiskLevel(score);

    return {
      riskLevel,
      score,
      issues,
      recommendations: this.getRecommendations(issues),
      canSave: riskLevel !== 'critical',
      requiresApproval: riskLevel === 'high',
    };
  }

  /**
   * Calculate a risk score from 0-100
   */
  private calculateRiskScore(issues: SecurityIssue[]): number {
    let score = 0;

    for (const issue of issues) {
      switch (issue.severity) {
        case 'critical':
          score += 40;
          break;
        case 'danger':
          score += 20;
          break;
        case 'warning':
          score += 10;
          break;
        case 'info':
          score += 2;
          break;
      }
    }

    return Math.min(score, 100);
  }

  /**
   * Determine risk level from score
   */
  private getRiskLevel(score: number): SecurityScanResult['riskLevel'] {
    if (score >= 40) return 'critical';
    if (score >= 25) return 'high';
    if (score >= 10) return 'medium';
    return 'low';
  }

  /**
   * Generate recommendations based on issues
   */
  private getRecommendations(issues: SecurityIssue[]): string[] {
    const recommendations = new Set<string>();

    if (issues.some(i => i.severity === 'critical')) {
      recommendations.add('This script contains critical security issues and should not be used.');
    }

    if (issues.some(i => i.pattern.includes('Invoke-WebRequest') || i.pattern.includes('curl'))) {
      recommendations.add('Verify all download URLs are from trusted sources.');
    }

    if (issues.some(i => i.pattern.includes('base64') || i.pattern.includes('Encoded'))) {
      recommendations.add('Avoid obfuscated or encoded commands for transparency.');
    }

    if (issues.some(i => i.pattern.includes('Credential') || i.pattern.includes('SecureString'))) {
      recommendations.add('Ensure credentials are handled securely and not logged.');
    }

    if (issues.some(i => i.severity === 'danger')) {
      recommendations.add('Review high-risk commands carefully before execution.');
    }

    return Array.from(recommendations);
  }

  /**
   * Quick check if script is safe enough to save
   */
  async canSaveScript(content: string, scriptType: 'powershell' | 'bash'): Promise<boolean> {
    const result = await this.scanScript(content, scriptType);
    return result.canSave;
  }
}

export const scriptSecurityService = new ScriptSecurityService();

