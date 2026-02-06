export type ReportStatus = 'draft' | 'in_progress' | 'completed';

export type TriState = 'Yes' | 'No' | 'N/A';

export interface ReportSavePayload {
  scheduleId: string;
  invoiceId: string;
  technicianId: string;
  dateCompleted: string;
  reportStatus: ReportStatus;
  jobTitle?: string;
  location?: string;
  cookingVolume: 'High' | 'Medium' | 'Low';
  recommendedCleaningFrequency?: number;
  comments?: string;
  cleaningDetails?: {
    hoodCleaned?: boolean | null;
    filtersCleaned?: boolean | null;
    ductworkCleaned?: boolean | null;
    fanCleaned?: boolean | null;
  };
  inspectionItems?: {
    adequateAccessPanels?: TriState;
  };
}
