export type ReportStatus = 'draft' | 'in_progress' | 'completed';

export type TriState = 'Yes' | 'No' | 'N/A';

export type InspectionItemKey =
  | 'hoodInteriorCleaned'
  | 'plenumCleaned'
  | 'filtersCleanedScope'
  | 'ductCleaned'
  | 'adequateAccessPanels'
  | 'exhaustFanCleaned'
  | 'fireSuppressionNozzlesClear';

export type InspectionItems = Record<InspectionItemKey, TriState>;

export type DeficiencyKey =
  | 'filtersRequireReplacement'
  | 'missingFilters'
  | 'accessPanelsMissingOrInadequate'
  | 'fireSuppressionNozzlesObstructed'
  | 'inaccessibleDuctOrArea'
  | 'exhaustFanNotAccessible'
  | 'exhaustFanNotOperatingOrAbnormal'
  | 'fanVibrationOrMotorConcern'
  | 'hingesOrChainsMissing'
  | 'roofGreaseContainmentIssue'
  | 'ecologyUnitServiceRequired'
  | 'other';

export interface ReportDeficiencies {
  tags: DeficiencyKey[];
  notes?: string;
}

export interface ReportSavePayload {
  scheduleId: string;
  invoiceId?: string;
  technicianId: string;
  dateCompleted: string;
  reportStatus: Extract<ReportStatus, 'draft' | 'in_progress'>;
  jobTitle: string;
  location: string;
  inspectionItems: InspectionItems;
  recommendedCleaningFrequency?: number;
  recommendations?: string;
  greaseLevel?: number;
  deficiencies?: ReportDeficiencies;
}
