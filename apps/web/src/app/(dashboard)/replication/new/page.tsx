'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Server,
  HardDrive,
  Network,
  Settings2,
  Loader2,
  AlertCircle,
  FolderOpen,
  Globe,
  Database,
  Tag,
  Play,
  Info,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { groupsApi, replicationApi, targetsApi, machinesApi, type DiskDetails } from '@/lib/api';
import type { AssessmentGroup, VirtualNetwork } from '@drmigrate/shared-types';

// Step definitions
const STEPS = [
  { id: 'machines', label: 'Virtual machines', icon: Server },
  { id: 'target', label: 'Target settings', icon: MapPin },
  { id: 'compute', label: 'Compute', icon: Settings2 },
  { id: 'disks', label: 'Disks', icon: HardDrive },
  { id: 'tags', label: 'Tags', icon: Tag },
  { id: 'review', label: 'Review + Start', icon: Play },
] as const;

type StepId = typeof STEPS[number]['id'];

interface DiskConfig {
  diskId: string;
  diskName: string;
  sourceSizeGB: number;
  targetSizeGB: number;
  diskType: string;
  isOsDisk: boolean;
}

interface MachineConfig {
  machineId: string;
  machineName: string;
  azureVmName: string;
  vmSize: string;
  osDiskType: string;
  disks: DiskConfig[];
}

interface TargetConfig {
  region: string;
  subscriptionId: string;
  resourceGroup: string;
  storageAccount: string;
  vnetId: string;
  subnetName: string;
  availabilityOption: 'none' | 'zone' | 'set';
  availabilityZone: string;
  availabilitySetId: string;
  licenseType: 'NoLicenseType' | 'WindowsServer' | 'RHEL_BYOS' | 'SLES_BYOS';
}

interface TagConfig {
  [key: string]: string;
}

const defaultTargetConfig: TargetConfig = {
  region: '',
  subscriptionId: '',
  resourceGroup: '',
  storageAccount: '',
  vnetId: '',
  subnetName: '',
  availabilityOption: 'none',
  availabilityZone: '',
  availabilitySetId: '',
  licenseType: 'NoLicenseType',
};

export default function EnableReplicationPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [currentStep, setCurrentStep] = useState<StepId>('machines');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [targetConfig, setTargetConfig] = useState<TargetConfig>(defaultTargetConfig);
  const [machineConfigs, setMachineConfigs] = useState<MachineConfig[]>([]);
  const [tags, setTags] = useState<TagConfig>({});
  const [newTagKey, setNewTagKey] = useState('');
  const [newTagValue, setNewTagValue] = useState('');

  // Fetch groups
  const { data: groupsData, isLoading: groupsLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
  });

  // Fetch ASR infrastructure to get the required target region
  const { data: asrInfraData } = useQuery({
    queryKey: ['replication', 'infrastructure'],
    queryFn: () => replicationApi.getInfrastructure(),
  });

  // Auto-set target region from ASR infrastructure when discovered
  useEffect(() => {
    if (asrInfraData?.data?.targetRegion && !targetConfig.region) {
      setTargetConfig((prev) => ({
        ...prev,
        region: asrInfraData.data.targetRegion,
      }));
    }
  }, [asrInfraData, targetConfig.region]);

  // Fetch group machines when group is selected
  const { data: machinesData } = useQuery({
    queryKey: ['group-machines', selectedGroupId],
    queryFn: () => groupsApi.getMachines(selectedGroupId),
    enabled: !!selectedGroupId,
  });

  // Fetch Azure regions
  const { data: regionsData } = useQuery({
    queryKey: ['targets', 'regions'],
    queryFn: () => targetsApi.getRegions(),
  });

  // Fetch resources based on selected region
  const { data: vnetData, isLoading: vnetsLoading } = useQuery({
    queryKey: ['targets', 'vnets', targetConfig.region],
    queryFn: () => targetsApi.getVnets(targetConfig.region),
    enabled: !!targetConfig.region,
  });

  const { data: storageData, isLoading: storageLoading } = useQuery({
    queryKey: ['targets', 'storage', targetConfig.region],
    queryFn: () => targetsApi.getStorageAccounts(targetConfig.region),
    enabled: !!targetConfig.region,
  });

  const { data: resourceGroupsData, isLoading: rgLoading } = useQuery({
    queryKey: ['targets', 'resource-groups', targetConfig.region],
    queryFn: () => targetsApi.getResourceGroups(targetConfig.region),
    enabled: !!targetConfig.region,
  });

  const { data: vmSkusData, isLoading: skusLoading } = useQuery({
    queryKey: ['targets', 'vm-skus', targetConfig.region],
    queryFn: () => targetsApi.getSkus(targetConfig.region),
    enabled: !!targetConfig.region,
  });

  const { data: zonesData } = useQuery({
    queryKey: ['targets', 'zones', targetConfig.region],
    queryFn: () => targetsApi.getAvailabilityZones(targetConfig.region),
    enabled: !!targetConfig.region && targetConfig.availabilityOption === 'zone',
  });

  // State for success
  const [successData, setSuccessData] = useState<{
    message: string;
    itemCount: number;
    errors?: string[];
  } | null>(null);

  // Enable replication mutation
  const enableMutation = useMutation({
    mutationFn: async () => {
      // Build disk configurations per machine
      const machineDisks = machineConfigs
        .filter((m) => m.disks.length > 0)
        .map((m) => ({
          machineId: m.machineId,
          disks: m.disks.map((d) => ({
            diskId: d.diskId,
            isOSDisk: d.isOsDisk,
            diskType: d.diskType,
            targetDiskSizeGB: d.targetSizeGB,
          })),
        }));

      return replicationApi.enable({
        groupId: selectedGroupId,
        targetConfig: {
          targetRegion: targetConfig.region, // Required for finding cache storage in correct region
          targetResourceGroup: targetConfig.resourceGroup,
          targetVnetId: targetConfig.vnetId,
          targetSubnetName: targetConfig.subnetName,
          targetVmSize: machineConfigs[0]?.vmSize || 'Standard_D2s_v3',
          targetStorageAccountId: targetConfig.storageAccount,
          availabilityZone: targetConfig.availabilityZone || undefined,
          licenseType: targetConfig.licenseType,
          tags: Object.keys(tags).length > 0 ? tags : undefined,
        },
        machineDisks: machineDisks.length > 0 ? machineDisks : undefined,
      });
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['replication'] });
      // Show success
      const data = response.data as { items: unknown[]; message: string; errors?: string[] };
      setSuccessData({
        message: data.message,
        itemCount: data.items?.length || 0,
        errors: data.errors,
      });
    },
  });

  const groups = groupsData?.data || [];
  const selectedGroup = groups.find((g: AssessmentGroup) => g.id === selectedGroupId);
  const machines = machinesData?.data || [];
  const vnets = vnetData?.data || [];
  const storageAccounts = storageData?.data || [];
  const resourceGroups = resourceGroupsData?.data || [];
  const vmSkus = vmSkusData?.data || [];
  const regions = regionsData?.data || [];
  const zones = zonesData?.data || [];

  // Get subnets from selected VNet
  const selectedVnet = vnets.find((v: VirtualNetwork) => v.id === targetConfig.vnetId);
  const subnets = selectedVnet?.subnets || [];

  // Reset machine configs when group changes
  useEffect(() => {
    setMachineConfigs([]);
  }, [selectedGroupId]);

  // Initialize machine configs when machines are loaded for the selected group
  useEffect(() => {
    if (machines.length > 0) {
      // Initialize configs with basic info, disks will be fetched separately
      const initConfigs = machines.map((m: { id: string; displayName: string }) => ({
        machineId: m.id,
        machineName: m.displayName,
        azureVmName: m.displayName.replace(/[^a-zA-Z0-9-]/g, '-').substring(0, 64),
        vmSize: 'Standard_D2s_v3',
        osDiskType: 'Standard_LRS',
        disks: [] as DiskConfig[],
      }));
      setMachineConfigs(initConfigs);

      // Fetch disk details for each machine
      const fetchDisks = async () => {
        const updatedConfigs = await Promise.all(
          initConfigs.map(async (config) => {
            try {
              const response = await machinesApi.getDisks(config.machineId);
              if (response.success && response.data) {
                const disks: DiskConfig[] = response.data.map((disk: DiskDetails) => ({
                  diskId: disk.diskId,
                  diskName: disk.diskName,
                  sourceSizeGB: disk.sizeGB,
                  targetSizeGB: disk.sizeGB, // Default to source size
                  diskType: disk.diskType || 'Standard_LRS',
                  isOsDisk: disk.isOsDisk,
                }));
                return { ...config, disks };
              }
            } catch (e) {
              console.error('Failed to fetch disks for machine:', config.machineName, e);
            }
            // Return default disk if fetch fails
            return {
              ...config,
              disks: [{
                diskId: 'disk-0',
                diskName: 'OS Disk',
                sourceSizeGB: 128,
                targetSizeGB: 128,
                diskType: 'Standard_LRS',
                isOsDisk: true,
              }],
            };
          })
        );
        setMachineConfigs(updatedConfigs);
      };

      fetchDisks();
    }
  }, [machines]);

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);

  const goNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].id);
    }
  };

  const goBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].id);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 'machines':
        return !!selectedGroupId && machines.length > 0;
      case 'target':
        return !!(
          targetConfig.region &&
          targetConfig.resourceGroup &&
          // Storage account is optional - Azure Migrate will auto-discover if not provided
          targetConfig.vnetId &&
          targetConfig.subnetName
        );
      case 'compute':
        return machineConfigs.every((m) => m.azureVmName && m.vmSize);
      case 'disks':
        // Validate that all disk target sizes are >= source sizes
        return machineConfigs.every((m) => 
          m.disks.length === 0 || // Still loading
          m.disks.every((d) => d.targetSizeGB >= d.sourceSizeGB)
        );
      case 'tags':
        return true;
      case 'review':
        return true;
      default:
        return false;
    }
  };

  const addTag = () => {
    if (newTagKey && newTagValue) {
      setTags((prev) => ({ ...prev, [newTagKey]: newTagValue }));
      setNewTagKey('');
      setNewTagValue('');
    }
  };

  const removeTag = (key: string) => {
    setTags((prev) => {
      const newTags = { ...prev };
      delete newTags[key];
      return newTags;
    });
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Page Header */}
      <div className="flex items-center gap-4">
        <Link href="/replication">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Replicate</h1>
          <p className="text-muted-foreground mt-1">
            Configure settings and target properties for migration
          </p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 p-4 bg-muted/50 rounded-lg overflow-x-auto">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const isActive = step.id === currentStep;
          const isCompleted = index < currentStepIndex;

          return (
            <div key={step.id} className="flex items-center">
              {index > 0 && <div className="w-8 h-0.5 bg-border mx-1" />}
              <button
                onClick={() => index <= currentStepIndex && setCurrentStep(step.id)}
                disabled={index > currentStepIndex}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isCompleted
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                <span className="w-5 h-5 flex items-center justify-center">
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <span className="text-xs">{index + 1}</span>
                  )}
                </span>
                {step.label}
              </button>
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="rounded-lg border bg-card p-6">
        {/* Step 1: Virtual Machines */}
        {currentStep === 'machines' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Server className="h-5 w-5" />
                Select machines to replicate
              </h2>
              <p className="text-muted-foreground mt-1">
                Choose an assessment group containing the machines you want to migrate to Azure.
              </p>
            </div>

            {groupsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : groups.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed rounded-lg">
                <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold mb-2">No assessment groups</h3>
                <p className="text-muted-foreground mb-4">
                  Create an assessment group first before enabling replication
                </p>
                <Link href="/groups/new">
                  <Button>Create Assessment Group</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Assessment Group <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedGroupId}
                    onChange={(e) => {
                      setSelectedGroupId(e.target.value);
                      setMachineConfigs([]); // Reset machine configs
                    }}
                    className="w-full rounded-md border bg-background px-3 py-2"
                  >
                    <option value="">Select a group...</option>
                    {groups.map((group: AssessmentGroup) => (
                      <option key={group.id} value={group.id}>
                        {group.name} ({group.machineCount || 0} machines)
                      </option>
                    ))}
                  </select>
                </div>

                {selectedGroupId && machines.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-4 py-2 text-sm font-medium">Machine Name</th>
                          <th className="text-left px-4 py-2 text-sm font-medium">OS</th>
                          <th className="text-left px-4 py-2 text-sm font-medium">IP Address</th>
                        </tr>
                      </thead>
                      <tbody>
                        {machines.map((machine: { id: string; displayName: string; operatingSystem?: string; ipAddresses?: string[] }) => (
                          <tr key={machine.id} className="border-t">
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <Server className="h-4 w-4 text-muted-foreground" />
                                {machine.displayName}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">
                              {machine.operatingSystem || 'Unknown'}
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">
                              {machine.ipAddresses?.join(', ') || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Target Settings */}
        {currentStep === 'target' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Target settings
              </h2>
              <p className="text-muted-foreground mt-1">
                Configure settings and target properties for migration.
              </p>
            </div>

            <div className="grid gap-6">
              {/* Region - determined by Azure Migrate vault */}
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Target Region <span className="text-red-500">*</span>
                </label>
                {asrInfraData?.data?.targetRegion ? (
                  <>
                    <div className="flex items-center gap-2 p-3 rounded-md border bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                      <Info className="h-4 w-4 text-blue-600" />
                      <span className="text-sm">
                        Target region is <strong>{regions.find((r: {name: string; displayName: string}) => r.name === asrInfraData.data.targetRegion)?.displayName || asrInfraData.data.targetRegion}</strong> (determined by your Azure Migrate vault location).
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      All target resources (VNet, storage account, resource group) must be in this region.
                    </p>
                    <input type="hidden" value={asrInfraData.data.targetRegion} />
                  </>
                ) : (
                  <select
                    value={targetConfig.region}
                    onChange={(e) =>
                      setTargetConfig((prev) => ({
                        ...prev,
                        region: e.target.value,
                        vnetId: '',
                        subnetName: '',
                        resourceGroup: '',
                        storageAccount: '',
                      }))
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                  >
                    <option value="">Select a region...</option>
                    {regions.map((region: { name: string; displayName: string }) => (
                      <option key={region.name} value={region.name}>
                        {region.displayName}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {targetConfig.region && (
                <>
                  {/* Resource Group */}
                  <div>
                    <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                      <FolderOpen className="h-4 w-4" />
                      Resource group <span className="text-red-500">*</span>
                    </label>
                    {rgLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading resource groups...
                      </div>
                    ) : (
                      <select
                        value={targetConfig.resourceGroup}
                        onChange={(e) =>
                          setTargetConfig((prev) => ({ ...prev, resourceGroup: e.target.value }))
                        }
                        className="w-full rounded-md border bg-background px-3 py-2"
                      >
                        <option value="">Select a resource group...</option>
                        {resourceGroups.map((rg: { id: string; name: string; location: string }) => (
                          <option key={rg.id} value={rg.name}>
                            {rg.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Storage Account */}
                  <div>
                    <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      Cache storage account (optional)
                    </label>
                    {storageLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading storage accounts...
                      </div>
                    ) : (
                      <select
                        value={targetConfig.storageAccount}
                        onChange={(e) =>
                          setTargetConfig((prev) => ({ ...prev, storageAccount: e.target.value }))
                        }
                        className="w-full rounded-md border bg-background px-3 py-2"
                      >
                        <option value="">(Auto-discover from Azure Migrate)</option>
                        {storageAccounts.map((sa: { id: string; name: string }) => (
                          <option key={sa.id} value={sa.id}>
                            {sa.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      <Info className="h-3 w-3 inline mr-1" />
                      Leave empty to use the cache storage account configured in Azure Migrate. 
                      Only select manually if you have set up replication before via Azure Portal.
                    </p>
                  </div>

                  {/* Virtual Network */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                        <Network className="h-4 w-4" />
                        Virtual network <span className="text-red-500">*</span>
                      </label>
                      {vnetsLoading ? (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading networks...
                        </div>
                      ) : (
                        <select
                          value={targetConfig.vnetId}
                          onChange={(e) =>
                            setTargetConfig((prev) => ({
                              ...prev,
                              vnetId: e.target.value,
                              subnetName: '',
                            }))
                          }
                          className="w-full rounded-md border bg-background px-3 py-2"
                        >
                          <option value="">Select a network...</option>
                          {vnets.map((vnet: VirtualNetwork) => (
                            <option key={vnet.id} value={vnet.id}>
                              {vnet.name} ({vnet.resourceGroup})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Subnet <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={targetConfig.subnetName}
                        onChange={(e) =>
                          setTargetConfig((prev) => ({ ...prev, subnetName: e.target.value }))
                        }
                        disabled={!targetConfig.vnetId}
                        className="w-full rounded-md border bg-background px-3 py-2 disabled:opacity-50"
                      >
                        <option value="">Select a subnet...</option>
                        {subnets.map((subnet: { id: string; name: string; addressPrefix: string }) => (
                          <option key={subnet.id} value={subnet.name}>
                            {subnet.name} ({subnet.addressPrefix})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Availability Options */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Availability options</label>
                    <select
                      value={targetConfig.availabilityOption}
                      onChange={(e) =>
                        setTargetConfig((prev) => ({
                          ...prev,
                          availabilityOption: e.target.value as 'none' | 'zone' | 'set',
                          availabilityZone: '',
                          availabilitySetId: '',
                        }))
                      }
                      className="w-full rounded-md border bg-background px-3 py-2"
                    >
                      <option value="none">No infrastructure redundancy required</option>
                      <option value="zone">Availability zone</option>
                      <option value="set">Availability set</option>
                    </select>
                  </div>

                  {targetConfig.availabilityOption === 'zone' && (
                    <div>
                      <label className="block text-sm font-medium mb-2">Availability zone</label>
                      <select
                        value={targetConfig.availabilityZone}
                        onChange={(e) =>
                          setTargetConfig((prev) => ({ ...prev, availabilityZone: e.target.value }))
                        }
                        className="w-full rounded-md border bg-background px-3 py-2"
                      >
                        <option value="">Select a zone...</option>
                        {zones.map((zone: { zone: string }) => (
                          <option key={zone.zone} value={zone.zone}>
                            Zone {zone.zone}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* License Type */}
                  <div>
                    <label className="block text-sm font-medium mb-2">License type</label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={targetConfig.licenseType === 'WindowsServer'}
                          onChange={(e) =>
                            setTargetConfig((prev) => ({
                              ...prev,
                              licenseType: e.target.checked ? 'WindowsServer' : 'NoLicenseType',
                            }))
                          }
                          className="rounded"
                        />
                        <span className="text-sm">I have a Windows Server license</span>
                      </label>
                      <p className="text-xs text-muted-foreground ml-6">
                        Apply Azure Hybrid Benefit and save up to 76% vs. pay-as-you-go costs
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Compute */}
        {currentStep === 'compute' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                Compute
              </h2>
              <p className="text-muted-foreground mt-1">
                Select the Azure VM size and OS disk for the machines that are being migrated.
              </p>
            </div>

            {skusLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading VM sizes...
              </div>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-2 text-sm font-medium">Name</th>
                      <th className="text-left px-4 py-2 text-sm font-medium">Azure VM Name</th>
                      <th className="text-left px-4 py-2 text-sm font-medium">Azure VM Size</th>
                      <th className="text-left px-4 py-2 text-sm font-medium">OS Disk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {machineConfigs.map((config, index) => (
                      <tr key={config.machineId} className="border-t">
                        <td className="px-4 py-2 whitespace-nowrap">{config.machineName}</td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={config.azureVmName}
                            onChange={(e) => {
                              const newConfigs = [...machineConfigs];
                              newConfigs[index] = { ...config, azureVmName: e.target.value };
                              setMachineConfigs(newConfigs);
                            }}
                            className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={config.vmSize}
                            onChange={(e) => {
                              const newConfigs = [...machineConfigs];
                              newConfigs[index] = { ...config, vmSize: e.target.value };
                              setMachineConfigs(newConfigs);
                            }}
                            className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          >
                            <option value="">Select size...</option>
                            {vmSkus.map((sku: { name: string; cores: number; memoryGB: number }) => (
                              <option key={sku.name} value={sku.name}>
                                {sku.name} ({sku.cores} vCPU, {sku.memoryGB} GB)
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={config.osDiskType}
                            onChange={(e) => {
                              const newConfigs = [...machineConfigs];
                              newConfigs[index] = { ...config, osDiskType: e.target.value };
                              setMachineConfigs(newConfigs);
                            }}
                            className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          >
                            <option value="Standard_LRS">Standard HDD</option>
                            <option value="StandardSSD_LRS">Standard SSD</option>
                            <option value="Premium_LRS">Premium SSD</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Disks */}
        {currentStep === 'disks' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <HardDrive className="h-5 w-5" />
                Disks
              </h2>
              <p className="text-muted-foreground mt-1">
                Select the managed disk type to use for the disks of the migrated machines.
              </p>
            </div>

            <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
              <div className="flex gap-3">
                <Info className="h-5 w-5 text-blue-600 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                  Target disk type and size will be automatically selected based on source disk configuration.
                  You can modify these after replication starts.
                  <strong className="block mt-1">Note: Target disk size must be at least equal to the source disk size.</strong>
                </div>
              </div>
            </div>

            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2 text-sm font-medium">Machine</th>
                    <th className="text-left px-4 py-2 text-sm font-medium">Disk</th>
                    <th className="text-left px-4 py-2 text-sm font-medium">Disk Type</th>
                    <th className="text-left px-4 py-2 text-sm font-medium">Source Size</th>
                    <th className="text-left px-4 py-2 text-sm font-medium">Target Size (GB)</th>
                    <th className="text-left px-4 py-2 text-sm font-medium">IOPS</th>
                    <th className="text-left px-4 py-2 text-sm font-medium">Throughput</th>
                  </tr>
                </thead>
                <tbody>
                  {machineConfigs.map((config, machineIndex) => (
                    config.disks.length > 0 ? (
                      config.disks.map((disk, diskIndex) => (
                        <tr key={`${config.machineId}-${disk.diskId}`} className="border-t">
                          {diskIndex === 0 && (
                            <td className="px-4 py-2" rowSpan={config.disks.length}>
                              {config.machineName}
                            </td>
                          )}
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-1">
                              {disk.isOsDisk && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">OS</span>
                              )}
                              <span className="text-sm">{disk.diskName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <select
                              value={disk.diskType}
                              onChange={(e) => {
                                const newConfigs = [...machineConfigs];
                                newConfigs[machineIndex].disks[diskIndex].diskType = e.target.value;
                                // Also update the main osDiskType if this is OS disk
                                if (disk.isOsDisk) {
                                  newConfigs[machineIndex].osDiskType = e.target.value;
                                }
                                setMachineConfigs(newConfigs);
                              }}
                              className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                            >
                              <option value="Standard_LRS">Standard HDD</option>
                              <option value="StandardSSD_LRS">Standard SSD</option>
                              <option value="Premium_LRS">Premium SSD</option>
                            </select>
                          </td>
                          <td className="px-4 py-2 text-muted-foreground text-sm">
                            {disk.sourceSizeGB} GB
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={disk.sourceSizeGB}
                                value={disk.targetSizeGB}
                                onChange={(e) => {
                                  const newSize = parseInt(e.target.value) || disk.sourceSizeGB;
                                  const newConfigs = [...machineConfigs];
                                  newConfigs[machineIndex].disks[diskIndex].targetSizeGB = Math.max(newSize, disk.sourceSizeGB);
                                  setMachineConfigs(newConfigs);
                                }}
                                className={cn(
                                  "w-24 rounded-md border bg-background px-2 py-1 text-sm",
                                  disk.targetSizeGB < disk.sourceSizeGB && "border-red-500"
                                )}
                              />
                              {disk.targetSizeGB < disk.sourceSizeGB && (
                                <AlertCircle className="h-4 w-4 text-red-500" />
                              )}
                            </div>
                            {disk.targetSizeGB < disk.sourceSizeGB && (
                              <p className="text-xs text-red-500 mt-1">
                                Min: {disk.sourceSizeGB} GB
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground text-sm">
                            {disk.diskType === 'Premium_LRS' ? '3500' : disk.diskType === 'StandardSSD_LRS' ? '500' : '500'}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground text-sm">
                            {disk.diskType === 'Premium_LRS' ? '170 MB/s' : disk.diskType === 'StandardSSD_LRS' ? '60 MB/s' : '60 MB/s'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr key={config.machineId} className="border-t">
                        <td className="px-4 py-2">{config.machineName}</td>
                        <td className="px-4 py-2 text-muted-foreground" colSpan={6}>
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading disk information...
                          </div>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Step 5: Tags */}
        {currentStep === 'tags' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Tags
              </h2>
              <p className="text-muted-foreground mt-1">
                Add tags to your Virtual machines, Disks and NICs. Tags are name/value pairs that enable you
                to categorize resources.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <input
                    type="text"
                    value={newTagKey}
                    onChange={(e) => setNewTagKey(e.target.value)}
                    placeholder="e.g., Environment"
                    className="w-full rounded-md border bg-background px-3 py-2"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Value</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTagValue}
                      onChange={(e) => setNewTagValue(e.target.value)}
                      placeholder="e.g., Production"
                      className="w-full rounded-md border bg-background px-3 py-2"
                    />
                    <Button onClick={addTag} disabled={!newTagKey || !newTagValue}>
                      Add
                    </Button>
                  </div>
                </div>
              </div>

              {Object.keys(tags).length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-4 py-2 text-sm font-medium">Name</th>
                        <th className="text-left px-4 py-2 text-sm font-medium">Value</th>
                        <th className="w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(tags).map(([key, value]) => (
                        <tr key={key} className="border-t">
                          <td className="px-4 py-2">{key}</td>
                          <td className="px-4 py-2">{value}</td>
                          <td className="px-4 py-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeTag(key)}
                              className="text-red-600 hover:text-red-700"
                            >
                              Remove
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 6: Review + Start */}
        {currentStep === 'review' && (
          <div className="space-y-6">
            {/* Success State */}
            {successData ? (
              <div className="space-y-6">
                <div className={`rounded-lg border p-6 ${successData.errors?.length ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
                  <div className="flex items-start gap-4">
                    <div className={`flex-shrink-0 p-2 rounded-full ${successData.errors?.length ? 'bg-yellow-100' : 'bg-green-100'}`}>
                      <CheckCircle2 className={`h-6 w-6 ${successData.errors?.length ? 'text-yellow-600' : 'text-green-600'}`} />
                    </div>
                    <div className="flex-1">
                      <h3 className={`text-lg font-semibold ${successData.errors?.length ? 'text-yellow-900' : 'text-green-900'}`}>
                        Replication Started!
                      </h3>
                      <p className={`mt-1 ${successData.errors?.length ? 'text-yellow-800' : 'text-green-800'}`}>
                        {successData.message}
                      </p>
                      <p className={`text-sm mt-3 ${successData.errors?.length ? 'text-yellow-700' : 'text-green-700'}`}>
                        {successData.itemCount} machine(s) are now replicating to Azure.
                      </p>
                    </div>
                  </div>
                </div>

                {successData.errors && successData.errors.length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                    <h4 className="font-medium text-red-900 mb-2">Some machines failed to start replication:</h4>
                    <ul className="text-sm text-red-800 space-y-1 list-disc list-inside">
                      {successData.errors.map((error, idx) => (
                        <li key={idx}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
                  <div className="flex items-start gap-4">
                    <Info className="h-6 w-6 text-blue-600 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-blue-900">What's Happening Now</h3>
                      <p className="text-sm text-blue-800 mt-2">
                        Azure Site Recovery is now replicating your machines. This process includes:
                      </p>
                      <ul className="text-sm text-blue-800 mt-2 space-y-1 list-disc list-inside">
                        <li>Initial replication of disk data to Azure</li>
                        <li>Continuous replication of changes (delta sync)</li>
                        <li>Health monitoring and alerts</li>
                      </ul>
                      <p className="text-sm text-blue-800 mt-3">
                        The replication status will be updated automatically. You can monitor progress on the Replication page.
                      </p>
                      <div className="mt-4">
                        <Link href="/replication">
                          <Button>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            View Replication Status
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border p-4 bg-muted/30">
                  <h4 className="font-medium mb-2">Target configuration:</h4>
                  <div className="text-sm space-y-1 text-muted-foreground">
                    <p><span className="text-foreground">Region:</span> {regions.find(r => r.name === targetConfig.region)?.displayName || targetConfig.region}</p>
                    <p><span className="text-foreground">Resource Group:</span> {targetConfig.resourceGroup}</p>
                    <p><span className="text-foreground">VNet:</span> {selectedVnet?.name} / {targetConfig.subnetName}</p>
                    <p><span className="text-foreground">VM Size:</span> {machineConfigs[0]?.vmSize}</p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Play className="h-5 w-5" />
                    Review + Start replication
                  </h2>
                  <p className="text-muted-foreground mt-1">
                    Review your configuration before starting replication.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Summary Cards */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border p-4">
                      <h3 className="font-medium mb-3 flex items-center gap-2">
                        <Server className="h-4 w-4" />
                        Machines
                      </h3>
                      <div className="text-sm space-y-1">
                        <p><span className="text-muted-foreground">Group:</span> {selectedGroup?.name}</p>
                        <p><span className="text-muted-foreground">Count:</span> {machineConfigs.length} machines</p>
                      </div>
                    </div>

                    <div className="rounded-lg border p-4">
                      <h3 className="font-medium mb-3 flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Target
                      </h3>
                      <div className="text-sm space-y-1">
                        <p><span className="text-muted-foreground">Region:</span> {regions.find(r => r.name === targetConfig.region)?.displayName}</p>
                        <p><span className="text-muted-foreground">Resource Group:</span> {targetConfig.resourceGroup}</p>
                        <p><span className="text-muted-foreground">VNet:</span> {selectedVnet?.name}</p>
                        <p><span className="text-muted-foreground">Subnet:</span> {targetConfig.subnetName}</p>
                      </div>
                    </div>
                  </div>

                  {/* Machine Details */}
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-4 py-2 text-sm font-medium">Source Machine</th>
                          <th className="text-left px-4 py-2 text-sm font-medium">Azure VM Name</th>
                          <th className="text-left px-4 py-2 text-sm font-medium">VM Size</th>
                          <th className="text-left px-4 py-2 text-sm font-medium">Disk Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {machineConfigs.map((config) => (
                          <tr key={config.machineId} className="border-t">
                            <td className="px-4 py-2">{config.machineName}</td>
                            <td className="px-4 py-2">{config.azureVmName}</td>
                            <td className="px-4 py-2">{config.vmSize}</td>
                            <td className="px-4 py-2">
                              {config.osDiskType === 'Premium_LRS' ? 'Premium SSD' : 
                               config.osDiskType === 'StandardSSD_LRS' ? 'Standard SSD' : 'Standard HDD'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {Object.keys(tags).length > 0 && (
                    <div className="rounded-lg border p-4">
                      <h3 className="font-medium mb-3 flex items-center gap-2">
                        <Tag className="h-4 w-4" />
                        Tags
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(tags).map(([key, value]) => (
                          <span
                            key={key}
                            className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-muted"
                          >
                            {key}: {value}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                    <div className="flex gap-3">
                      <Info className="h-5 w-5 text-blue-600 flex-shrink-0" />
                      <div className="text-sm text-blue-800">
                        <p className="font-medium">About Azure Migrate Replication</p>
                        <p className="mt-1">
                          Your configuration will be saved locally. To complete the replication setup, you&apos;ll need to use the Azure Migrate portal wizard which handles the complex setup including replication appliance configuration and disk-level replication.
                        </p>
                      </div>
                    </div>
                  </div>

                  {enableMutation.isError && (
                    <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                      <div className="flex gap-3">
                        <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                        <div className="text-sm text-red-800">
                          <p className="font-medium">Failed to save configuration</p>
                          <p className="mt-1">{enableMutation.error instanceof Error ? enableMutation.error.message : 'Unknown error'}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Navigation Buttons - Hidden when showing success */}
      {!successData && (
        <div className="flex justify-between">
          <Button variant="outline" onClick={currentStepIndex === 0 ? () => router.push('/replication') : goBack}>
            {currentStepIndex === 0 ? 'Cancel' : (
              <>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </>
            )}
          </Button>
          
          {currentStep === 'review' ? (
            <Button onClick={() => enableMutation.mutate()} disabled={enableMutation.isPending}>
              {enableMutation.isPending ? (
                <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Starting Replication...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Start Replication
              </>
            )}
          </Button>
        ) : (
          <Button onClick={goNext} disabled={!canProceed()}>
            Next
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        )}
        </div>
      )}
    </div>
  );
}
