import { useState } from "react";
import { View, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "../ui/text";
import { AttachmentState } from "@powersync/attachments";

interface AttachmentRow {
    id: string;
    filename: string;
    state: number;
    photoType: string | null;
    jobTitle: string | null;
    startDate: string | null;
    local_uri: string | null;
}

interface PhotoRow {
    id: string;
    type: string | null;
    scheduleId: string | null;
    cloudinaryUrl: string | null;
    timestamp: string | null;
}

interface UploadDiagnosticsPanelProps {
    loading: boolean;
    error: string | null;
    attachmentCounts: { state: number; count: number }[];
    attachmentRows: AttachmentRow[];
    photoPendingCount: number;
    photoRows: PhotoRow[];
    onRefresh: () => void;
    onClearAttachments: () => void;
}

function formatAttachmentState(state: number) {
    switch (state) {
        case AttachmentState.QUEUED_UPLOAD:
            return "QUEUED_UPLOAD";
        case AttachmentState.QUEUED_SYNC:
            return "QUEUED_SYNC";
        case AttachmentState.SYNCED:
            return "SYNCED";
        default:
            return `STATE_${state}`;
    }
}

export function UploadDiagnosticsPanel({
    loading,
    error,
    attachmentCounts,
    attachmentRows,
    photoPendingCount,
    photoRows,
    onRefresh,
    onClearAttachments,
}: UploadDiagnosticsPanelProps) {
    const [expanded, setExpanded] = useState(true);

    return (
        <View className="mb-4 rounded-xl bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
            <TouchableOpacity
                onPress={() => setExpanded((prev) => !prev)}
                className="flex-row items-center justify-between px-4 py-3"
            >
                <Text className="text-gray-900 dark:text-gray-100 font-semibold">
                    Upload Diagnostics
                </Text>
                <Ionicons
                    name={expanded ? "chevron-up" : "chevron-down"}
                    size={18}
                    color="#6b7280"
                />
            </TouchableOpacity>

            {expanded && (
                <View className="px-4 pb-4">
                    <View className="flex-row items-center justify-between mb-2">
                        <Text className="text-gray-600 dark:text-gray-300 text-xs">
                            Live snapshot of local upload state
                        </Text>
                        <View className="flex-row gap-2">
                            <TouchableOpacity
                                onPress={onRefresh}
                                className="px-3 py-1 rounded-full bg-blue-600"
                                disabled={loading}
                            >
                                <Text className="text-white text-xs font-semibold">
                                    {loading ? "Refreshing..." : "Refresh"}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={onClearAttachments}
                                className="px-3 py-1 rounded-full bg-red-600"
                                disabled={loading}
                            >
                                <Text className="text-white text-xs font-semibold">
                                    Clear Attachments
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                    {error ? (
                        <Text className="text-red-600 dark:text-red-400 text-xs">
                            {error}
                        </Text>
                    ) : (
                        <>
                            <Text className="text-gray-700 dark:text-gray-300 text-xs mb-2">
                                Pending photos (cloudinaryUrl is NULL):{" "}
                                {photoPendingCount}
                            </Text>
                            <Text className="text-gray-700 dark:text-gray-300 text-xs mb-2">
                                Attachments by state:{" "}
                                {attachmentCounts.length === 0
                                    ? "none"
                                    : attachmentCounts
                                          .map(
                                              (c) =>
                                                  `${formatAttachmentState(
                                                      c.state,
                                                  )}:${c.count}`,
                                          )
                                          .join(" • ")}
                            </Text>
                            <View className="mt-2">
                                <Text className="text-gray-800 dark:text-gray-200 text-xs font-semibold mb-1">
                                    Recent Attachments (max 10)
                                </Text>
                                {attachmentRows.length === 0 ? (
                                    <Text className="text-gray-500 dark:text-gray-400 text-xs">
                                        No attachment rows found
                                    </Text>
                                ) : (
                                    attachmentRows.map((row) => (
                                        <Text
                                            key={row.id}
                                            className="text-gray-600 dark:text-gray-400 text-xs"
                                        >
                                            {row.filename} •{" "}
                                            {formatAttachmentState(row.state)} •{" "}
                                            {row.photoType ?? "?"} •{" "}
                                            {row.jobTitle ?? "?"}
                                        </Text>
                                    ))
                                )}
                            </View>
                            <View className="mt-3">
                                <Text className="text-gray-800 dark:text-gray-200 text-xs font-semibold mb-1">
                                    Recent Photos (max 10)
                                </Text>
                                {photoRows.length === 0 ? (
                                    <Text className="text-gray-500 dark:text-gray-400 text-xs">
                                        No photo rows found
                                    </Text>
                                ) : (
                                    photoRows.map((row) => (
                                        <Text
                                            key={row.id}
                                            className="text-gray-600 dark:text-gray-400 text-xs"
                                        >
                                            {row.id} • {row.type ?? "?"} •{" "}
                                            {row.cloudinaryUrl
                                                ? "uploaded"
                                                : "pending"}
                                        </Text>
                                    ))
                                )}
                            </View>
                        </>
                    )}
                </View>
            )}
        </View>
    );
}
