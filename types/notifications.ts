export interface NotificationPreferences {
    notifyNewJobs: boolean;
    notifyScheduleChanges: boolean;
}

export type NotificationType = "NEW_JOB_ASSIGNED" | "SCHEDULE_UPDATED";

export interface PushNotificationData {
    type: NotificationType;
    scheduleId?: string;
    jobTitle?: string;
}

export interface ExpoPushTokenRecord {
    id: string;
    userId: string;
    token: string;
    platform: "ios" | "android";
    deviceName?: string;
    notifyNewJobs: number; // 1 or 0
    notifyScheduleChanges: number; // 1 or 0
    lastUsedAt: string;
    createdAt: string;
    updatedAt: string;
}
