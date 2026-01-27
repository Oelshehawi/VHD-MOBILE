import { debugLogger } from "@/utils/DebugLogger";
import { getClerkInstance } from "@clerk/clerk-expo";

// API Response interface
export interface ApiResponse<T> {
    data?: T;
    error?: string;
    statusCode?: number;
}

const PROD_URL = process.env.EXPO_PUBLIC_API_URL || "";

export function getApiUrl() {
    return PROD_URL;
}

export function getPowerSyncUrl() {
    return process.env.EXPO_PUBLIC_POWERSYNC_URL || "";
}

export class ApiClient {
    private readonly baseUrl: string;
    private headers: Record<string, string>;

    constructor(token: string = "") {
        this.baseUrl = getApiUrl();
        this.headers = {
            "Content-Type": "application/json",
            ...(token && { Authorization: `Bearer ${token}` }),
        };

        debugLogger.info("NETWORK", "ApiClient initialized", {
            baseUrl: this.baseUrl,
        });
    }

    setToken(token: string) {
        this.headers.Authorization = `Bearer ${token}`;
    }

    private async ensureAuthHeaders(): Promise<Record<string, string>> {
        try {
            const clerk = getClerkInstance({
                publishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
            });
            const token = await clerk?.session?.getToken({
                template: "Powersync",
                skipCache: false,
            });
            if (token) {
                this.headers.Authorization = `Bearer ${token}`;
                debugLogger.debug("AUTH", "ApiClient auth header set");
            } else {
                debugLogger.warn("AUTH", "ApiClient missing auth token");
            }
        } catch {
            // If token fetch fails, proceed without auth header.
            debugLogger.warn("AUTH", "ApiClient token fetch failed");
        }

        return this.headers;
    }

    // ============ SYNC OPERATIONS (PowerSync canonical pattern) ============

    async upsert(record: { table: string; data: any }): Promise<void> {
        const headers = await this.ensureAuthHeaders();
        const response = await fetch(`${this.baseUrl}/api/sync`, {
            method: "PUT",
            headers,
            body: JSON.stringify(record),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(
                `Sync upsert failed: ${response.status} - ${error}`,
            );
        }
    }

    async update(record: { table: string; data: any }): Promise<void> {
        const headers = await this.ensureAuthHeaders();
        const response = await fetch(`${this.baseUrl}/api/sync`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(record),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(
                `Sync update failed: ${response.status} - ${error}`,
            );
        }
    }

    async delete(record: {
        table: string;
        data: { id: string };
    }): Promise<void> {
        const headers = await this.ensureAuthHeaders();
        const response = await fetch(`${this.baseUrl}/api/sync`, {
            method: "DELETE",
            headers,
            body: JSON.stringify(record),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(
                `Sync delete failed: ${response.status} - ${error}`,
            );
        }
    }

    async batchUpsert(
        table: string,
        records: Record<string, unknown>[],
    ): Promise<void> {
        const headers = await this.ensureAuthHeaders();
        const response = await fetch(`${this.baseUrl}/api/sync`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                table,
                operation: "batchPut",
                data: records,
            }),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(
                `Sync batchUpsert failed: ${response.status} - ${error}`,
            );
        }
    }

    async batchPatch(
        table: string,
        records: Record<string, unknown>[],
    ): Promise<void> {
        const headers = await this.ensureAuthHeaders();
        const response = await fetch(`${this.baseUrl}/api/sync`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({
                table,
                operation: "batchPatch",
                data: records,
            }),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(
                `Sync batchPatch failed: ${response.status} - ${error}`,
            );
        }
    }

    // ============ CLOUDINARY UPLOAD URL ============

    async getUploadUrl<T>(
        _path: string,
        options: {
            body: {
                fileName: string;
                jobTitle?: string;
                type?: string;
                startDate?: string;
                mediaType?: string;
            };
        },
    ): Promise<ApiResponse<T>> {
        try {
            const headers = await this.ensureAuthHeaders();
            const response = await fetch(
                `${this.baseUrl}/api/cloudinaryUpload`,
                {
                    method: "POST",
                    headers,
                    body: JSON.stringify(options.body),
                },
            );

            if (!response.ok) {
                return {
                    error: `HTTP error: ${response.status}`,
                    statusCode: response.status,
                };
            }

            const data = await response.json();
            return { data: data as T };
        } catch (error) {
            return {
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }

    // ============ INVOICE OPERATIONS ============

    async sendInvoice(
        scheduleId: string,
        invoiceRef: string,
        invoiceData: any,
        technicianId: string,
        isComplete: boolean,
    ): Promise<{ success: boolean; error?: string }> {
        try {
            if (!scheduleId || !invoiceRef) {
                return { success: false, error: "Missing required fields" };
            }

            const headers = await this.ensureAuthHeaders();
            const response = await fetch(`${this.baseUrl}/api/send-invoice`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    scheduleId,
                    invoiceRef,
                    invoiceData,
                    technicianId,
                    isComplete,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                let errorData;
                try {
                    errorData = JSON.parse(errorText);
                } catch {
                    errorData = {
                        error: errorText || `HTTP status ${response.status}`,
                    };
                }

                return {
                    success: false,
                    error:
                        errorData.message ||
                        errorData.error ||
                        errorData.details ||
                        `Send failed with status ${response.status}`,
                };
            }

            const result = await response.json();
            return { success: true, ...result };
        } catch (error) {
            // For network errors, indicate retry
            if (
                error instanceof TypeError &&
                error.message.includes("Network request failed")
            ) {
                return {
                    success: false,
                    error: "Network error, will retry later",
                };
            }

            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }
}
