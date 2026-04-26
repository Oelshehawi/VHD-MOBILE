export type ReportStatus = 'draft' | 'in_progress' | 'completed';

export type TriState = 'Yes' | 'No' | 'N/A';

export type FilterType = 'baffle' | 'longDrawer' | 'singleDrawer' | 'mesh' | 'other';

export type FanAccessReason = 'accessDenied' | 'unsafe' | 'noRoofAccess' | 'locked' | 'other';

export interface EquipmentDetails {
  numberOfHoods?: number;
  numberOfFilters?: number;
  numberOfFans?: number;
  filterTypes?: string;
  // Backward compatibility for local legacy report rows.
  otherFilterType?: string;
}

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
  equipmentDetails?: EquipmentDetails;
  inspectionItems?: {
    adequateAccessPanels?: TriState;
    safeAccessToFan?: TriState;
    fanAccessReason?: FanAccessReason | string;
  };
}
