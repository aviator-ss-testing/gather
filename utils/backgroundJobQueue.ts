import { MMKV } from "react-native-mmkv";
import { extractDataFromUrl } from "./url";
import { LocationMetadata } from "./dataTypes";
import * as Location from "expo-location";

const jobStorage = new MMKV({ id: "backgroundJobs" });

export enum JobType {
  URL_ENRICHMENT = "url_enrichment",
  LOCATION_ENRICHMENT = "location_enrichment",
  ARENA_SYNC = "arena_sync",
}

export enum JobPriority {
  HIGH = 1, // User submissions
  MEDIUM = 2, // General enrichment
  LOW = 3, // Arena sync
}

export enum JobStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
}

export interface BackgroundJob {
  id: string;
  type: JobType;
  priority: JobPriority;
  status: JobStatus;
  data: any;
  createdAt: number;
  retryCount: number;
  maxRetries: number;
  onComplete?: (result: any) => Promise<void>;
  onError?: (error: Error) => Promise<void>;
}

export interface UrlEnrichmentJobData {
  blockId: string;
  url: string;
}

export interface LocationEnrichmentJobData {
  blockId: string;
  latitude: number;
  longitude: number;
}

export interface ArenaSyncJobData {
  type: "pending" | "new";
}

class BackgroundJobManager {
  private static instance: BackgroundJobManager;
  private isProcessing = false;
  private processingIntervalId: NodeJS.Timeout | null = null;

  private constructor() {
    this.startProcessing();
  }

  static getInstance(): BackgroundJobManager {
    if (!BackgroundJobManager.instance) {
      BackgroundJobManager.instance = new BackgroundJobManager();
    }
    return BackgroundJobManager.instance;
  }

  addJob(
    type: JobType,
    priority: JobPriority,
    data: any,
    maxRetries: number = 3,
    onComplete?: (result: any) => Promise<void>,
    onError?: (error: Error) => Promise<void>
  ): string {
    const jobId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const job: BackgroundJob = {
      id: jobId,
      type,
      priority,
      status: JobStatus.PENDING,
      data,
      createdAt: Date.now(),
      retryCount: 0,
      maxRetries,
      onComplete,
      onError,
    };

    this.saveJob(job);
    return jobId;
  }

  private saveJob(job: BackgroundJob): void {
    jobStorage.set(job.id, JSON.stringify(job));
  }

  private getJob(jobId: string): BackgroundJob | null {
    const jobData = jobStorage.getString(jobId);
    return jobData ? JSON.parse(jobData) : null;
  }

  private deleteJob(jobId: string): void {
    jobStorage.delete(jobId);
  }

  private getAllJobs(): BackgroundJob[] {
    const allKeys = jobStorage.getAllKeys();
    return allKeys
      .map((key) => {
        const jobData = jobStorage.getString(key);
        return jobData ? JSON.parse(jobData) : null;
      })
      .filter((job) => job !== null)
      .sort((a, b) => {
        // Sort by priority first (lower number = higher priority), then by creation time
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return a.createdAt - b.createdAt;
      });
  }

  private getPendingJobs(): BackgroundJob[] {
    return this.getAllJobs().filter((job) => job.status === JobStatus.PENDING);
  }

  private async processJob(job: BackgroundJob): Promise<void> {
    try {
      job.status = JobStatus.PROCESSING;
      this.saveJob(job);

      let result: any;
      switch (job.type) {
        case JobType.URL_ENRICHMENT:
          result = await this.processUrlEnrichment(job.data as UrlEnrichmentJobData);
          break;
        case JobType.LOCATION_ENRICHMENT:
          result = await this.processLocationEnrichment(job.data as LocationEnrichmentJobData);
          break;
        case JobType.ARENA_SYNC:
          result = await this.processArenaSync(job.data as ArenaSyncJobData);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      job.status = JobStatus.COMPLETED;
      this.saveJob(job);

      if (job.onComplete) {
        await job.onComplete(result);
      }

      // Clean up completed job after a delay
      setTimeout(() => {
        this.deleteJob(job.id);
      }, 60000); // Keep for 1 minute for debugging
    } catch (error) {
      job.retryCount++;
      if (job.retryCount >= job.maxRetries) {
        job.status = JobStatus.FAILED;
        this.saveJob(job);
        
        if (job.onError) {
          await job.onError(error as Error);
        }
        
        console.error(`Job ${job.id} failed permanently:`, error);
        
        // Clean up failed job after a delay
        setTimeout(() => {
          this.deleteJob(job.id);
        }, 300000); // Keep for 5 minutes for debugging
      } else {
        job.status = JobStatus.PENDING;
        this.saveJob(job);
        console.warn(`Job ${job.id} failed, retrying (${job.retryCount}/${job.maxRetries}):`, error);
      }
    }
  }

  private async processUrlEnrichment(data: UrlEnrichmentJobData): Promise<any> {
    const { url } = data;
    
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("URL enrichment timeout")), 10000);
    });

    return Promise.race([
      extractDataFromUrl(url),
      timeoutPromise,
    ]);
  }

  private async processLocationEnrichment(data: LocationEnrichmentJobData): Promise<LocationMetadata> {
    const { latitude, longitude } = data;
    
    try {
      const results = await Location.reverseGeocodeAsync({ latitude, longitude });
      const location = results[0];

      return {
        latitude,
        longitude,
        name: location.name || undefined,
        street: location.street || undefined,
        city: location.city || undefined,
        region: location.region || undefined,
        country: location.country || undefined,
      };
    } catch (error) {
      console.warn("Error getting location metadata:", error);
      return { latitude, longitude };
    }
  }

  private async processArenaSync(data: ArenaSyncJobData): Promise<void> {
    // Import the sync functions from db context
    // This will be properly implemented when we integrate with the existing sync system
    const { syncWithArena } = await import("./db");
    
    try {
      if (data.type === "pending") {
        // Sync pending arena blocks
        await syncWithArena();
      } else if (data.type === "new") {
        // Sync new arena blocks
        await syncWithArena();
      }
    } catch (error) {
      console.warn("Arena sync job failed:", error);
      throw error;
    }
  }

  private startProcessing(): void {
    if (this.processingIntervalId) {
      return;
    }

    this.processingIntervalId = setInterval(async () => {
      if (this.isProcessing) {
        return;
      }

      this.isProcessing = true;
      try {
        const pendingJobs = this.getPendingJobs();
        if (pendingJobs.length > 0) {
          const nextJob = pendingJobs[0]; // Already sorted by priority
          await this.processJob(nextJob);
        }
      } catch (error) {
        console.error("Error processing background jobs:", error);
      } finally {
        this.isProcessing = false;
      }
    }, 1000); // Check for jobs every second
  }

  stopProcessing(): void {
    if (this.processingIntervalId) {
      clearInterval(this.processingIntervalId);
      this.processingIntervalId = null;
    }
  }

  getJobStatus(jobId: string): JobStatus | null {
    const job = this.getJob(jobId);
    return job ? job.status : null;
  }

  getPendingJobsCount(): number {
    return this.getPendingJobs().length;
  }

  clearAllJobs(): void {
    const allKeys = jobStorage.getAllKeys();
    allKeys.forEach((key) => {
      jobStorage.delete(key);
    });
  }

  // Additional methods for job status tracking and integration

  getJobsByType(type: JobType): BackgroundJob[] {
    return this.getAllJobs().filter((job) => job.type === type);
  }

  getJobsByStatus(status: JobStatus): BackgroundJob[] {
    return this.getAllJobs().filter((job) => job.status === status);
  }

  cancelJob(jobId: string): boolean {
    const job = this.getJob(jobId);
    if (!job || job.status === JobStatus.PROCESSING) {
      return false; // Cannot cancel processing jobs
    }
    
    this.deleteJob(jobId);
    return true;
  }

  // Integration helpers for existing sync system
  
  addUrlEnrichmentJob(
    blockId: string, 
    url: string, 
    priority: JobPriority = JobPriority.HIGH,
    onComplete?: (result: any) => Promise<void>
  ): string {
    return this.addJob(
      JobType.URL_ENRICHMENT,
      priority,
      { blockId, url } as UrlEnrichmentJobData,
      3,
      onComplete
    );
  }

  addLocationEnrichmentJob(
    blockId: string,
    latitude: number,
    longitude: number,
    priority: JobPriority = JobPriority.HIGH,
    onComplete?: (result: any) => Promise<void>
  ): string {
    return this.addJob(
      JobType.LOCATION_ENRICHMENT,
      priority,
      { blockId, latitude, longitude } as LocationEnrichmentJobData,
      3,
      onComplete
    );
  }

  addArenaSyncJob(
    syncType: "pending" | "new" = "pending",
    priority: JobPriority = JobPriority.LOW
  ): string {
    // Check if there's already a pending Arena sync job to avoid duplicates
    const existingJobs = this.getJobsByType(JobType.ARENA_SYNC);
    const pendingArenaJobs = existingJobs.filter(
      (job) => job.status === JobStatus.PENDING || job.status === JobStatus.PROCESSING
    );
    
    if (pendingArenaJobs.length > 0) {
      console.log("Arena sync job already pending, skipping duplicate");
      return pendingArenaJobs[0].id;
    }

    return this.addJob(
      JobType.ARENA_SYNC,
      priority,
      { type: syncType } as ArenaSyncJobData,
      2 // Fewer retries for sync jobs
    );
  }

  // Integration with debouncedTriggerBlockSync
  triggerBlockSyncJob(): string {
    return this.addArenaSyncJob("pending", JobPriority.MEDIUM);
  }

  // Status tracking for UI
  getEnrichmentStatus(blockId: string): {
    urlEnrichment?: JobStatus;
    locationEnrichment?: JobStatus;
    hasActiveJobs: boolean;
  } {
    const allJobs = this.getAllJobs();
    const blockJobs = allJobs.filter((job) => 
      (job.type === JobType.URL_ENRICHMENT && (job.data as UrlEnrichmentJobData).blockId === blockId) ||
      (job.type === JobType.LOCATION_ENRICHMENT && (job.data as LocationEnrichmentJobData).blockId === blockId)
    );

    const urlJob = blockJobs.find((job) => job.type === JobType.URL_ENRICHMENT);
    const locationJob = blockJobs.find((job) => job.type === JobType.LOCATION_ENRICHMENT);

    return {
      urlEnrichment: urlJob?.status,
      locationEnrichment: locationJob?.status,
      hasActiveJobs: blockJobs.some((job) => 
        job.status === JobStatus.PENDING || job.status === JobStatus.PROCESSING
      ),
    };
  }
}

export const backgroundJobManager = BackgroundJobManager.getInstance();